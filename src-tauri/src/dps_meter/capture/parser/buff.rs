use crate::dps_meter::capture::parser::utils::{
    bytes_to_hex, read_u32_le_or_default as parse_u32_le, read_u64_le_or_default as parse_u64_le,
    read_varint,
};
use crate::dps_meter::capture::processor::StreamProcessor;

impl StreamProcessor {
    pub(crate) fn parse_buff_packet(&mut self, packet: &[u8], _is_compressed_bundle: bool) -> bool {
        // self.log_packet_source(packet, is_compressed_bundle);
        if packet.len() < 2 || !matches!(packet[0], 0x2A | 0x2B) || packet[1] != 0x38 {
            return false;
        }

        let opcode = packet[0];
        let mut offset = 2usize;

        let target_info = read_varint(packet, offset);
        if !target_info.is_valid() {
            return false;
        }
        let after_target_offset = offset + target_info.length;
        offset = after_target_offset + 2;
        if offset >= packet.len() {
            return false;
        }

        let unknown_info = read_varint(packet, offset);
        if !unknown_info.is_valid() {
            return false;
        }
        offset += unknown_info.length;

        if offset + 4 > packet.len() {
            return false;
        }
        let mut skill_code = parse_u32_le(packet, offset);
        offset += 4;

        let is_valid_buff_skill = |code: u32| {
            (110_000_000..=200_000_000).contains(&code) || (20_000_000..30_000_000).contains(&code)
        };
        if opcode == 0x2B && !is_valid_buff_skill(skill_code) {
            let retry_offset = after_target_offset + 1;
            if retry_offset < packet.len() {
                let retry_unknown_info = read_varint(packet, retry_offset);
                let retry_skill_offset = retry_offset + retry_unknown_info.length;
                if retry_unknown_info.is_valid() && retry_skill_offset + 4 <= packet.len() {
                    let retry_skill_code = parse_u32_le(packet, retry_skill_offset);
                    if is_valid_buff_skill(retry_skill_code) {
                        skill_code = retry_skill_code;
                        offset = retry_skill_offset + 4;
                    }
                }
            }
        }

        if skill_code < 110_000_000 || skill_code > 200_000_000 {
            if !(20_000_000..30_000_000).contains(&skill_code) {
                // self.logger.debug(format!(
                //     "[{}] buff skipped target={} skill={} opcode={:02X}38 packet_len={} packet_hex={}",
                //     self.port,
                //     target_info.value,
                //     skill_code,
                //     opcode,
                //     packet.len(),
                //     bytes_to_hex(packet)
                // ));
                return true;
            }
        }

        if offset + 16 > packet.len() {
            return false;
        }
        let duration = parse_u32_le(packet, offset) as u64;
        offset += 8;
        let server_time = parse_u64_le(packet, offset);
        offset += 8;

        let actor_info = read_varint(packet, offset);
        if !actor_info.is_valid() {
            return false;
        }
        if actor_info.value <= 1 {
            return true;
        }

        if duration == u32::MAX as u64 {
            // self.logger.debug(format!(
            //     "[{}] buff skipped permanent target={} actor={} skill={} duration={} server_time={} opcode={:02X}38 packet_len={} packet_hex={}",
            //     self.port,
            //     target_info.value,
            //     actor_info.value,
            //     skill_code,
            //     duration,
            //     server_time,
            //     opcode,
            //     packet.len(),
            //     bytes_to_hex(packet)
            // ));
            return true;
        }

        let server_start_ms = server_time.saturating_sub(duration);
        let buff = self.data_storage.save_buff(
            target_info.value as u32,
            actor_info.value as u32,
            skill_code,
            server_start_ms,
            duration,
        );
        let latency_ms = buff.last_start_ms as i64 - server_start_ms as i64;
        self.logger.debug(format!(
            "[{}] buff detected target={} actor={} skill={} duration_ms={} server_start_ms={} local_start_ms={} local_end_ms={} latency_ms={} coverage={:.3} active={} server_time={} opcode={:02X}38 packet_len={} packet_hex={}",
            self.port,
            buff.target_id,
            buff.actor_id,
            buff.skill_code,
            duration,
            server_start_ms,
            buff.last_start_ms,
            buff.last_end_ms,
            latency_ms,
            buff.coverage,
            buff.active,
            server_time,
            opcode,
            packet.len(),
            bytes_to_hex(packet)
        ));
        true
    }
}
