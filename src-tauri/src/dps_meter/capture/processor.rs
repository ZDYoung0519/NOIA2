use std::sync::Arc;

use lz4_flex::block::decompress;

use crate::dps_meter::logging::DpsLogger;
use crate::dps_meter::models::packet::{ParsedDamagePacket, SpecialDamage, VarIntOutput};
use crate::dps_meter::storage::data_storage::DataStorage;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProcessingMode {
    Full,
    MetadataOnly,
}

#[derive(Debug)]
struct DamagePacketReader<'a> {
    packet: &'a [u8],
    offset: usize,
}

impl<'a> DamagePacketReader<'a> {
    fn new(packet: &'a [u8], offset: usize) -> Self {
        Self { packet, offset }
    }

    fn remaining_bytes(&self) -> usize {
        self.packet.len().saturating_sub(self.offset)
    }

    fn try_read_var_int(&mut self) -> Option<u32> {
        let out = read_varint(self.packet, self.offset);
        if !out.is_valid() {
            return None;
        }
        self.offset += out.length;
        u32::try_from(out.value).ok()
    }
}

pub struct StreamProcessor {
    data_storage: Arc<DataStorage>,
    logger: Arc<DpsLogger>,
    port: String,
    mode: ProcessingMode,
}

impl StreamProcessor {
    pub fn new(
        data_storage: Arc<DataStorage>,
        logger: Arc<DpsLogger>,
        port: String,
        mode: ProcessingMode,
    ) -> Self {
        Self {
            data_storage,
            logger,
            port,
            mode,
        }
    }

    pub fn consume_stream(&mut self, buffer: &[u8]) -> usize {
        let mut offset = 0usize;

        while offset < buffer.len() {
            if buffer[offset] == 0x00 {
                offset += 1;
                continue;
            }

            let length_info = read_varint(buffer, offset);
            if !length_info.is_valid() || length_info.value <= 0 {
                if offset + 5 > buffer.len() {
                    break;
                }
                offset += 1;
                continue;
            }

            let Ok(total_packet_bytes) = usize::try_from(length_info.value.saturating_sub(3))
            else {
                offset += 1;
                continue;
            };

            if total_packet_bytes == 0 || total_packet_bytes > 65_535 {
                offset += 1;
                continue;
            }

            if offset + total_packet_bytes > buffer.len() {
                if total_packet_bytes > 16_384 / 2{
                // if total_packet_bytes > 16_384{
                    offset += 1;
                    continue;
                }
                break;
            }

            let payload_start = length_info.length;
            let is_bundle = payload_start + 1 < total_packet_bytes
                && buffer[offset + payload_start] == 0xFF
                && buffer[offset + payload_start + 1] == 0xFF;

            if is_bundle {
                let bundle_size = total_packet_bytes + 1;
                if offset + bundle_size > buffer.len() {
                    break;
                }
                self.unwrap_bundle(&buffer[offset + payload_start..offset + bundle_size]);
                offset += bundle_size;
            } else {
                self.parse_packet(&buffer[offset..offset + total_packet_bytes]);
                offset += total_packet_bytes;
            }
        }

        if buffer.len() >= 4 {
            self.scan_for_embedded_048d(buffer);
        }

        offset
    }

    fn unwrap_bundle(&mut self, payload: &[u8]) {
        if payload.len() < 7 {
            return;
        }

        let decompressed_size =
            u32::from_le_bytes([payload[2], payload[3], payload[4], payload[5]]) as usize;
        if decompressed_size == 0 || decompressed_size > 5_000_000 {
            return;
        }

        let Ok(decompressed) = decompress(&payload[6..], decompressed_size) else {
            return;
        };

        let mut offset = 0usize;
        while offset < decompressed.len() {
            if decompressed[offset] == 0x00 {
                offset += 1;
                continue;
            }

            let length_info = read_varint(&decompressed, offset);
            if !length_info.is_valid() || length_info.value <= 0 {
                break;
            }

            let Ok(inner_total_bytes) = usize::try_from(length_info.value.saturating_sub(3)) else {
                break;
            };
            if inner_total_bytes == 0 {
                offset += 1;
                continue;
            }

            let inner_end = offset + inner_total_bytes;
            if inner_end > decompressed.len() {
                break;
            }

            let inner_packet = &decompressed[offset..inner_end];
            let inner_payload_start = length_info.length;
            let is_nested_bundle = inner_packet.len() > inner_payload_start + 1
                && inner_packet[inner_payload_start] == 0xFF
                && inner_packet[inner_payload_start + 1] == 0xFF;

            if is_nested_bundle {
                self.unwrap_bundle(&inner_packet[inner_payload_start..]);
            } else {
                self.parse_packet(inner_packet);
            }

            offset += inner_total_bytes;
        }

        if decompressed.len() >= 4 {
            self.scan_for_embedded_048d(&decompressed);
        }
    }

    fn parse_packet(&mut self, packet: &[u8]) -> bool {
        if packet.len() < 3 {
            return false;
        }

        if self.mode == ProcessingMode::Full {
            if self.parse_damage_packet(packet) {
                return true;
            }
            if self.parse_dot_packet(packet) {
                return true;
            }
        }

        // if self.parse_summon_ownership_packet(packet){
        //     return true;
        // }
        // if self.parse_summon_packet(packet){
        //     return true;
        // }
        self.parse_summon_ownership_packet(packet);
        self.parse_summon_packet(packet);
        self.parse_4036(packet);
        self.parse_3336(packet); // main actor
        self.parse_4436_optimized(packet); // otehr
        false
    }


    #[allow(unused_assignments)]
    fn parse_damage_packet(&mut self, packet: &[u8]) -> bool {
        let packet_length_info = read_varint(packet, 0);
        if !packet_length_info.is_valid() {
            return false;
        }

        let mut reader = DamagePacketReader::new(packet, packet_length_info.length);
        if reader.offset + 1 >= packet.len() {
            return false;
        }
        if packet[reader.offset] != 0x04 || packet[reader.offset + 1] != 0x38 {
            return false;
        }
        reader.offset += 2;

        let mut parsed_any = false;
        while reader.remaining_bytes() > 0 {
            let checkpoint = reader.offset;

            let mut is_chained_hit_marker = false;
            if reader.remaining_bytes() >= 2
                && packet[reader.offset] == 0x01
                && packet[reader.offset + 1] == 0x00
            {
                reader.offset += 2;
                is_chained_hit_marker = true;
            }

            if parsed_any && !is_chained_hit_marker {
                break;
            }

            let Some(target_id) = reader.try_read_var_int() else {
                reader.offset = checkpoint;
                break;
            };
            if target_id < 100 {
                reader.offset = checkpoint;
                break;
            }

            let Some(switch_value) = reader.try_read_var_int() else {
                reader.offset = checkpoint;
                break;
            };
            let and_result = switch_value & 0x0F;
            if !matches!(and_result, 4..=7) {
                reader.offset = checkpoint;
                break;
            }

            if reader.try_read_var_int().is_none() {
                reader.offset = checkpoint;
                break;
            }

            let Some(actor_id) = reader.try_read_var_int() else {
                reader.offset = checkpoint;
                break;
            };
            if actor_id < 100 {
                reader.offset = checkpoint;
                break;
            }

            if reader.offset + 4 > packet.len() {
                reader.offset = checkpoint;
                break;
            }
            let mut exact_skill_code = parse_u32_le(packet, reader.offset);
            reader.offset += 4;

            if (3_000_000..=3_099_999).contains(&exact_skill_code) {
                exact_skill_code = exact_skill_code * 10 + 1;
            }
            if !(1..=299_999_999).contains(&exact_skill_code)
                || (1_000_000..=9_999_999).contains(&exact_skill_code)
            {
                reader.offset = checkpoint;
                break;
            }

            if reader.remaining_bytes() > 0 {
                reader.offset += 1;
            }

            let Some(dummy_type) = reader.try_read_var_int() else {
                reader.offset = checkpoint;
                break;
            };
            let damage_type = (dummy_type & 0xFF) as u8;

            let temp_v = match and_result {
                5 => 12,
                6 => 10,
                7 => 14,
                _ => 8,
            };

            let mut specials = Vec::new();
            if matches!(and_result, 5..=7) && reader.remaining_bytes() > 0 {
                let special_byte = packet[reader.offset];
                if special_byte & 0x01 != 0 {
                    specials.push(SpecialDamage::Back);
                }
                if special_byte & 0x04 != 0 {
                    specials.push(SpecialDamage::Parry);
                }
                if special_byte & 0x08 != 0 {
                    specials.push(SpecialDamage::Perfect);
                }
                if special_byte & 0x10 != 0 {
                    specials.push(SpecialDamage::Double);
                }
                if special_byte & 0x40 != 0 {
                    specials.push(SpecialDamage::Smite);
                }
            }

            if damage_type == 3 {
                specials.push(SpecialDamage::Critical);
            }

            reader.offset = reader.offset.saturating_add(temp_v);
            if reader.offset >= packet.len() {
                reader.offset = checkpoint;
                break;
            }

            let Some(first_value) = reader.try_read_var_int() else {
                reader.offset = checkpoint;
                break;
            };
            let after_first_value_offset = reader.offset;
            let Some(second_value) = reader.try_read_var_int() else {
                reader.offset = checkpoint;
                break;
            };

            let mut final_damage = if should_treat_first_value_as_damage(
                first_value,
                second_value,
                and_result,
                damage_type,
            ) {
                reader.offset = after_first_value_offset;
                first_value
            } else {
                second_value
            };

            if (switch_value & 0x30) == 0x30 && reader.remaining_bytes() > 0 {
                let _ = reader.try_read_var_int();
            }

            let pre_hit_offset = reader.offset;
            let mut hit_count = 0u32;
            if reader.remaining_bytes() > 0 {
                let is_marker_next = reader.remaining_bytes() >= 2
                    && packet[reader.offset + 1] == 0x00
                    && (1..=7).contains(&packet[reader.offset]);

                if !is_marker_next {
                    if let Some(peek_val) = reader.try_read_var_int() {
                        if peek_val <= 25 {
                            hit_count = peek_val;
                        } else {
                            let is_marker_after_hp = reader.remaining_bytes() >= 2
                                && packet[reader.offset + 1] == 0x00
                                && (1..=7).contains(&packet[reader.offset]);
                            if !is_marker_after_hp {
                                if let Some(actual_hit_count) = reader.try_read_var_int() {
                                    if actual_hit_count <= 25 {
                                        hit_count = actual_hit_count;
                                    } else {
                                        reader.offset = pre_hit_offset;
                                    }
                                } else {
                                    reader.offset = pre_hit_offset;
                                }
                            }
                        }
                    }
                }
            }

            if final_damage > 99_999_999 {
                reader.offset = checkpoint;
                break;
            }

            let mut multi_hit_count = 0u32;
            let mut multi_hit_damage = 0u64;
            let mut first_multi_hit_value = None;
            let mut all_multi_hits_match = true;

            if hit_count > 0 && reader.remaining_bytes() > 0 {
                let mut hit_sum = 0u64;
                let mut hits_read = 0u32;
                let safe_max_hits = hit_count.min(25);
                let multi_hit_cap = final_damage.max(500_000);

                while hits_read < safe_max_hits && reader.remaining_bytes() > 0 {
                    let is_marker_next = reader.remaining_bytes() >= 2
                        && packet[reader.offset + 1] == 0x00
                        && (1..=7).contains(&packet[reader.offset]);
                    let is_next_packet = reader.remaining_bytes() >= 2
                        && packet[reader.offset] == 0x04
                        && packet[reader.offset + 1] == 0x38;
                    if is_marker_next || is_next_packet {
                        break;
                    }

                    let Some(hit_value) = reader.try_read_var_int() else {
                        break;
                    };
                    if hit_value > multi_hit_cap || hit_value < 50 {
                        hit_sum = 0;
                        hits_read = 0;
                        first_multi_hit_value = None;
                        all_multi_hits_match = true;
                        break;
                    }

                    if let Some(first_hit) = first_multi_hit_value {
                        if first_hit != hit_value {
                            all_multi_hits_match = false;
                        }
                    } else {
                        first_multi_hit_value = Some(hit_value);
                    }

                    hit_sum += u64::from(hit_value);
                    hits_read += 1;
                }

                multi_hit_count = hits_read;
                multi_hit_damage = hit_sum;
            }

            if switch_value == 54
                && hit_count > multi_hit_count
                && multi_hit_count == 1
                && first_multi_hit_value.is_some()
                && all_multi_hits_match
            {
                multi_hit_count = hit_count;
                multi_hit_damage = u64::from(first_multi_hit_value.unwrap()) * u64::from(hit_count);
            }

            if should_use_repeated_hit_damage(
                switch_value,
                second_value,
                multi_hit_count,
                first_multi_hit_value,
                all_multi_hits_match,
            ) {
                final_damage = first_multi_hit_value.unwrap_or(final_damage);
            }

            if multi_hit_count > 0
                && multi_hit_damage > 0
                && u64::from(final_damage) > multi_hit_damage
            {
                final_damage = u32::try_from(u64::from(final_damage) - multi_hit_damage)
                    .unwrap_or(final_damage);
            }

            let resolved_skill_code = normalize_skill_id(exact_skill_code);

            let parsed = ParsedDamagePacket {
                target_id,
                actor_id,
                skill_code: resolved_skill_code,
                ori_skill_code: exact_skill_code,
                damage: u64::from(final_damage),
                is_dot: false,
                is_crit: specials.contains(&SpecialDamage::Critical),
                multi_hit_damage,
                multi_hit_count,
                specials: specials
                    .into_iter()
                    .map(|special| special.as_str().to_string())
                    .collect(),
            };

            self.data_storage.append_damage(parsed);
            self.logger.debug(format!(
                "[{}] damage target={} actor={} skill={} damage={} multi_hit_count={} multi_hit_damage={}",
                self.port,
                target_id,
                actor_id,
                resolved_skill_code,
                final_damage,
                multi_hit_count,
                multi_hit_damage
            ));
            parsed_any = true;
        }

        parsed_any
    }

    fn parse_dot_packet(&mut self, packet: &[u8]) -> bool {
        let packet_length_info = read_varint(packet, 0);
        if !packet_length_info.is_valid() {
            return false;
        }

        let mut offset = packet_length_info.length;
        if packet.len() <= offset + 1 || packet[offset] != 0x05 || packet[offset + 1] != 0x38 {
            return false;
        }
        offset += 2;

        let target_info = read_varint(packet, offset);
        if !target_info.is_valid() {
            return false;
        }
        offset += target_info.length;
        if packet.len() <= offset {
            return false;
        }

        let unknown_bit_flag = packet[offset];
        if (unknown_bit_flag & 0x02) == 0 {
            return true;
        }
        offset += 1;

        let actor_info = read_varint(packet, offset);
        if !actor_info.is_valid() {
            return false;
        }
        offset += actor_info.length;

        let unknown_info = read_varint(packet, offset);
        if !unknown_info.is_valid() {
            return false;
        }
        offset += unknown_info.length;
        if offset + 4 > packet.len() {
            return false;
        }

        let skill_code_candidate = parse_u32_le(packet, offset);
        let skill_code = normalize_skill_id(skill_code_candidate);
        offset += 4;

        let damage_info = read_varint(packet, offset);
        if !damage_info.is_valid() {
            return false;
        }

        let parsed = ParsedDamagePacket {
            target_id: target_info.value as u32,
            actor_id: actor_info.value as u32,
            skill_code,
            ori_skill_code: skill_code_candidate,
            damage: damage_info.value as u64,
            is_dot: true,
            is_crit: false,
            multi_hit_damage: 0,
            multi_hit_count: 0,
            specials: Vec::new(),
        };
        let log_target_id = parsed.target_id;
        let log_actor_id = parsed.actor_id;
        let log_skill_code = parsed.skill_code;
        let log_damage = parsed.damage;
        self.data_storage.append_damage(parsed);
        self.logger.debug(format!(
            "[{}] dot target={} actor={} skill={} damage={}",
            self.port,
            log_target_id,
            log_actor_id,
            log_skill_code,
            log_damage
        ));
        true
    }

    fn parse_summon_ownership_packet(&mut self, packet: &[u8]) -> bool {
        let packet_length_info = read_varint(packet, 0);
        if !packet_length_info.is_valid() {
            return false;
        }
        let offset = packet_length_info.length;
        if offset + 1 >= packet.len() || packet[offset] != 0x04 || packet[offset + 1] != 0x8D {
            return false;
        }

        let mut pos = offset + 2;
        let summon_info = read_varint(packet, pos);
        if !summon_info.is_valid() || summon_info.value < 100 {
            return false;
        }
        pos += summon_info.length;
        if pos + 4 > packet.len() || packet[pos..pos + 4] != [0x00, 0x00, 0x00, 0x00] {
            return false;
        }
        pos += 4;

        let owner_info = read_varint(packet, pos);
        if !owner_info.is_valid() || owner_info.value < 100 || owner_info.value == summon_info.value
        {
            return false;
        }

        self.data_storage
            .append_summon(owner_info.value as u32, summon_info.value as u32);
        if self.is_boss_summon(summon_info.value as u32) {
            self.logger.info(format!(
                "[{}] summon ownership owner={} owner_name={} summon={}",
                self.port,
                owner_info.value,
                self
                    .data_storage
                    .actor_id_name_snapshot()
                    .get(&(owner_info.value as u32))
                    .cloned()
                    .unwrap_or_else(|| "Unknown".to_string()),
                summon_info.value
            ));
        }
        true
    }

    fn parse_summon_packet(&mut self, packet: &[u8]) -> bool {
        let mut idx = 0usize;
        let mut found_any = false;

        while idx < packet.len() {
            let Some(pos) = find_bytes(packet, idx, &[0x40, 0x36]) else {
                break;
            };

            if self.parse_summon_spawn_at(packet, pos + 2) {
                found_any = true;
            }

            idx = pos + 1;
        }

        found_any
    }

    fn parse_summon_spawn_at(&mut self, packet: &[u8], offset_after_opcode: usize) -> bool {
        let target_info = read_varint(packet, offset_after_opcode);
        if !target_info.is_valid() {
            return false;
        }

        let mut real_actor_id = target_info.value as u32;
        if real_actor_id > 1_000_000 {
            real_actor_id = (real_actor_id & 0x3FFF) | 0x4000;
        }

        let mut found_something = false;
        let offset = offset_after_opcode + target_info.length;
        let max_scan = packet.len().saturating_sub(2).min(offset + 60);

        let mut scan_offset = offset;
        let mut mob_type_id = None;
        while scan_offset < max_scan {
            if packet[scan_offset] == 0x00
                && matches!(packet.get(scan_offset + 1), Some(0x40) | Some(0x00))
                && packet.get(scan_offset + 2) == Some(&0x02)
                && scan_offset >= offset + 3
            {
                mob_type_id = Some(
                    (packet[scan_offset - 3] as u32)
                        | ((packet[scan_offset - 2] as u32) << 8)
                        | ((packet[scan_offset - 1] as u32) << 16),
                );
                break;
            }
            scan_offset += 1;
        }

        if let Some(mob_code) = mob_type_id {
            self.data_storage.append_mob(real_actor_id, mob_code);
            let boss_codes = self.data_storage.boss_code_list_snapshot();
            let mob_names = self.data_storage.mob_code_name_snapshot();
            if boss_codes.contains(&mob_code) {
                if let Some(mob_name) = mob_names.get(&mob_code) {
                    self.logger.info(format!(
                        "[{}] summon spawn target={} mob_code={} name={}",
                        self.port, real_actor_id, mob_code, mob_name
                    ));
                }
            }
            found_something = true;
        }

        // if self.data_storage.has_summon_owner(real_actor_id) {
        //     return found_something;
        // }

        if let Some(owner_id) = self.extract_summon_owner_kotlin_style(packet, real_actor_id) {
            self.data_storage.append_summon(owner_id, real_actor_id);
            if self.is_boss_summon(real_actor_id) {
                self.logger.info(format!(
                    "[{}] summon kotlin owner={} owner_name={} summon={}",
                    self.port,
                    owner_id,
                    self
                        .data_storage
                        .actor_id_name_snapshot()
                        .get(&owner_id)
                        .cloned()
                        .unwrap_or_else(|| "Unknown".to_string()),
                    real_actor_id
                ));
            }
            return true;
        }

        if let Some(owner_id) = self.scan_for_known_player_le32(packet, real_actor_id) {
            self.data_storage.append_summon(owner_id, real_actor_id);
            if self.is_boss_summon(real_actor_id) {
                self.logger.info(format!(
                    "[{}] summon fallback le32 owner={} owner_name={} summon={}",
                    self.port,
                    owner_id,
                    self
                        .data_storage
                        .actor_id_name_snapshot()
                        .get(&owner_id)
                        .cloned()
                        .unwrap_or_else(|| "Unknown".to_string()),
                    real_actor_id
                ));
            }
            return true;
        }

        if let Some(owner_id) = self.extract_owner_from_packet(packet, real_actor_id) {
            self.data_storage.append_summon(owner_id, real_actor_id);
            if self.is_boss_summon(real_actor_id) {
                self.logger.info(format!(
                    "[{}] summon fallback marker owner={} owner_name={} summon={}",
                    self.port,
                    owner_id,
                    self
                        .data_storage
                        .actor_id_name_snapshot()
                        .get(&owner_id)
                        .cloned()
                        .unwrap_or_else(|| "Unknown".to_string()),
                    real_actor_id
                ));
            }
            return true;
        }

        if !self.data_storage.has_summon_owner(real_actor_id) {
            let mut best_match: Option<(u32, String)> = None;
            let mut best_len = 0usize;
            let actor_id_name_map = self.data_storage.actor_id_name_snapshot();

            for (actor_id, nickname) in actor_id_name_map {
                if nickname.is_empty() {
                    continue;
                }

                let nickname_bytes = nickname.as_bytes();
                if nickname_bytes.is_empty() || !packet.windows(nickname_bytes.len()).any(|window| window == nickname_bytes) {
                    continue;
                }

                let nickname_len = nickname.chars().count();
                if nickname_len > best_len {
                    best_len = nickname_len;
                    best_match = Some((actor_id, nickname));
                }
            }

            if let Some((owner_id, nickname)) = best_match {
                self.data_storage.append_summon(owner_id, real_actor_id);
                if self.is_boss_summon(real_actor_id) {
                    self.logger.info(format!(
                        "[{}] summon-nickname matched nick owner={} owner_name={} summon={}",
                        self.port, owner_id, nickname, real_actor_id
                    ));
                }
                return true;
            }
        }

        found_something
    }

    fn extract_summon_owner_kotlin_style(
        &self,
        packet: &[u8],
        summon_id: u32,
    ) -> Option<u32> {
        let key_idx = find_bytes(packet, 0, &[0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])?;
        let after_packet_start = key_idx + 8;
        if after_packet_start >= packet.len() {
            return None;
        }

        let opcode_relative_idx = find_bytes(packet, after_packet_start, &[0x07, 0x02, 0x06])?;
        let owner_offset = opcode_relative_idx + 11;
        if owner_offset + 2 > packet.len() {
            return None;
        }

        let owner_id =
            u16::from_le_bytes([packet[owner_offset], packet[owner_offset + 1]]) as u32;
        if !(100..=999_999).contains(&owner_id) {
            return None;
        }
        if owner_id == summon_id
            || self.data_storage.has_summon_owner(owner_id)
            || self.data_storage.has_mob(owner_id)
        {
            return None;
        }

        Some(owner_id)
    }

    fn scan_for_embedded_048d(&mut self, data: &[u8]) -> bool {
        let mut found_any = false;
        let mut search_offset = 0usize;

        while search_offset + 1 < data.len() {
            let Some(relative_idx) = find_bytes(data, search_offset, &[0x04, 0x8D]) else {
                break;
            };

            let idx = relative_idx;
            search_offset = idx + 2;
            if search_offset >= data.len() {
                break;
            }

            let summon_info = read_varint(data, search_offset);
            if !summon_info.is_valid() || !(100..=9_999_999).contains(&summon_info.value) {
                continue;
            }
            let summon_id = summon_info.value as u32;

            let zero_start = search_offset + summon_info.length;
            if zero_start + 4 > data.len()
                || data[zero_start..zero_start + 4] != [0x00, 0x00, 0x00, 0x00]
            {
                continue;
            }

            let scan_end = data.len().saturating_sub(1).min(search_offset + summon_info.length + 128);
            let mut anchor_idx = None;
            for i in search_offset + summon_info.length..scan_end {
                if matches!(data[i], 0xE0 | 0xE2) && data.get(i + 1) == Some(&0x07) {
                    anchor_idx = Some(i);
                    break;
                }
            }

            let Some(anchor_idx) = anchor_idx else {
                continue;
            };

            let mut owner_id = None;
            for v_len in 1..=3usize {
                let Some(v_start) = anchor_idx.checked_sub(v_len) else {
                    continue;
                };
                if v_start < search_offset + summon_info.length {
                    continue;
                }
                if !can_read_varint(data, v_start) {
                    continue;
                }

                let v = read_varint(data, v_start);
                if v.is_valid() && v.length == v_len && (100..=99_999).contains(&v.value) {
                    owner_id = Some(v.value as u32);
                    break;
                }
            }

            let Some(owner_id) = owner_id else {
                continue;
            };
            if owner_id == summon_id {
                continue;
            }

            let name_len_idx = anchor_idx + 2;
            if name_len_idx >= data.len() {
                continue;
            }

            let name_len = data[name_len_idx] as usize;
            if !(2..=32).contains(&name_len) || name_len_idx + 1 + name_len > data.len() {
                continue;
            }

            let name_start = name_len_idx + 1;
            let name_end = name_start + name_len;
            let Ok(possible_name) = std::str::from_utf8(&data[name_start..name_end]) else {
                continue;
            };
            if !possible_name.chars().next().is_some_and(|ch| ch.is_alphanumeric()) {
                continue;
            }

            let Some(sanitized_name) = sanitize_nickname(possible_name) else {
                continue;
            };
            if sanitized_name.len() < 2 {
                continue;
            }

            self.data_storage.append_summon(owner_id, summon_id);
            // self.data_storage.append_actor(owner_id, &sanitized_name, None);
            if self.is_boss_summon(summon_id) {
                self.logger.info(format!(
                    "[{}] embedded 04 8D owner={} summon={} owner_name={}",
                    self.port, owner_id, summon_id, sanitized_name
                ));
            }
            found_any = true;

            search_offset = skip_guild_name(data, name_end);
        }

        found_any
    }

    fn extract_owner_from_packet(&self, packet: &[u8], exclude_actor_id: u32) -> Option<u32> {
        let marker = [0x80, 0x75, 0xD5, 0x2A, 0xBB, 0x03, 0x00, 0x00];
        let marker_idx = find_bytes(packet, 0, &marker)?;
        let owner_offset = marker_idx + marker.len();
        if owner_offset >= packet.len() {
            return None;
        }

        let owner_info = read_varint(packet, owner_offset);
        if !owner_info.is_valid() || !(100..=999_999).contains(&owner_info.value) {
            return None;
        }

        let owner_id = owner_info.value as u32;
        if owner_id == exclude_actor_id
            || self.data_storage.has_summon_owner(owner_id)
            || self.data_storage.has_mob(owner_id)
        {
            return None;
        }

        Some(owner_id)
    }

    fn is_boss_summon(&self, summon_id: u32) -> bool {
        let mob_code = self
            .data_storage
            .mob_id_code_snapshot()
            .get(&summon_id)
            .copied();

        mob_code
            .map(|code| self.data_storage.boss_code_list_snapshot().contains(&code))
            .unwrap_or(false)
    }

    fn scan_for_known_player_le32(&self, packet: &[u8], exclude_actor_id: u32) -> Option<u32> {
        let marker = [0x80, 0x75, 0xD5, 0x2A, 0xBB, 0x03, 0x00, 0x00];
        let marker_idx = find_bytes(packet, 0, &marker)?;
        let start_offset = marker_idx + marker.len();
        let end_offset = packet.len().saturating_sub(3).min(start_offset + 48);
        let known_actor_ids = self.data_storage.actor_id_name_snapshot();

        for i in start_offset..end_offset {
            let le32 = (packet[i] as u32)
                | ((packet[i + 1] as u32) << 8)
                | ((packet[i + 2] as u32) << 16)
                | ((packet[i + 3] as u32) << 24);

            if le32 != exclude_actor_id
                && (100..=999_999).contains(&le32)
                && known_actor_ids.contains_key(&le32)
                && !self.data_storage.has_summon_owner(le32)
                && !self.data_storage.has_mob(le32)
            {
                return Some(le32);
            }
        }

        None
    }

    fn parse_4036(&mut self, payload: &[u8]) {
        let mut idx = 0usize;
        while idx < payload.len() {
            let Some(pos) = find_bytes(payload, idx, &[0x40, 0x36]) else {
                break;
            };
            let aid_info = read_varint(payload, pos + 2);
            if !aid_info.is_valid() || aid_info.value <= 0 {
                idx = pos + 1;
                continue;
            }

            let boss_pos = pos + 2 + aid_info.length + 3;
            if boss_pos + 3 > payload.len() {
                idx = pos + 1;
                continue;
            }

            let boss_id = (payload[boss_pos] as u32)
                | ((payload[boss_pos + 1] as u32) << 8)
                | ((payload[boss_pos + 2] as u32) << 16);
            self.data_storage.append_mob(aid_info.value as u32, boss_id);
            if self.data_storage.boss_code_list_snapshot().contains(&boss_id) {
                let boss_name = self
                    .data_storage
                    .mob_code_name_snapshot()
                    .get(&boss_id)
                    .cloned()
                    .unwrap_or_else(|| "Unknown Boss".to_string());
                self.logger.info(format!(
                    "[{}] boss actor={} mob_code={} name={}",
                    self.port, aid_info.value, boss_id, boss_name
                ));
            }
            idx = boss_pos + 3;
        }
    }

    fn parse_3336(&mut self, payload: &[u8]) {
        let mut idx = 0usize;
        while idx < payload.len() {
            let Some(pos) = find_bytes(payload, idx, &[0x33, 0x36]) else {
                break;
            };
            let aid_info = read_varint(payload, pos + 2);
            if !aid_info.is_valid() || aid_info.value <= 0 {
                idx = pos + 1;
                continue;
            }

            let scan_start = pos + 2 + aid_info.length;
            let scan_end = payload.len().saturating_sub(3).min(scan_start + 12);
            let Some(name_off) = find_byte_in_range(payload, 0x07, scan_start, scan_end) else {
                idx = pos + 1;
                continue;
            };
            if name_off + 2 >= payload.len() {
                idx = pos + 1;
                continue;
            }

            let name_len = payload[name_off + 1] as usize;
            if !(2..=36).contains(&name_len) || name_off + 2 + name_len + 2 > payload.len() {
                idx = pos + 1;
                continue;
            }

            let Ok(name) = std::str::from_utf8(&payload[name_off + 2..name_off + 2 + name_len])
            else {
                idx = pos + 1;
                continue;
            };
            let sid = u16::from_le_bytes([
                payload[name_off + 2 + name_len],
                payload[name_off + 3 + name_len],
            ]) as u32;
            if !(1000..=2100).contains(&sid) {
                idx = pos + 1;
                continue;
            }

            self.data_storage
                .append_actor(aid_info.value as u32, name, Some(&sid.to_string()));
            self.data_storage
                .set_main_actor(aid_info.value as u32, name);
            self.logger.info(format!(
                "[{}] main actor actor={} name={} sid={}",
                self.port, aid_info.value, name, sid
            ));
            break;
        }
    }

    fn parse_4436_optimized(&mut self, payload: &[u8]) {
        let mut idx = 0usize;
        while idx < payload.len() {
            let Some(pos) = find_bytes(payload, idx, &[0x44, 0x36]) else {
                break;
            };
            let Some((actor_id, name, sid)) = self.extract_4436_actor(payload, pos) else {
                idx = pos + 1;
                continue;
            };

            match sid {
                Some(sid) => {
                    let sid_string = sid.to_string();
                    self.data_storage
                        .append_actor(actor_id, &name, Some(&sid_string));
                    self.logger.info(format!(
                        "[{}] actor actor={} name={} sid={}",
                        self.port, actor_id, name, sid
                    ));
                }
                None => {
                    self.data_storage.append_actor(actor_id, &name, None);
                    self.logger.info(format!(
                        "[{}] actor actor={} name={} sid=none",
                        self.port, actor_id, name
                    ));
                }
            }
            idx = pos + 1;
        }
    }

    fn extract_4436_actor(&self, payload: &[u8], pos: usize) -> Option<(u32, String, Option<u32>)> {
        let aid_info = read_varint(payload, pos + 2);
        if !aid_info.is_valid() || aid_info.value <= 0 {
            return None;
        }

        let mut offset = pos + 2 + aid_info.length;
        if payload.len() <= offset {
            return None;
        }

        let unknown_info_1 = read_varint(payload, offset);
        if !unknown_info_1.is_valid() {
            return None;
        }
        offset += unknown_info_1.length;
        if payload.len() <= offset {
            return None;
        }

        let unknown_info_2 = read_varint(payload, offset);
        if !unknown_info_2.is_valid() {
            return None;
        }
        offset += unknown_info_2.length;
        if payload.len().saturating_sub(offset) <= 2 {
            return None;
        }

        offset += 1;
        let base = offset;
        let mut best_actor_name: Option<String> = None;
        let mut best_actor_name_end = None;
        let mut best_actor_name_bytes = 0usize;

        for relative in 0..5usize {
            let name_offset = base + relative;
            if name_offset >= payload.len() {
                continue;
            }

            let name_length_info = read_varint(payload, name_offset);
            if !name_length_info.is_valid() {
                continue;
            }

            let candidate_length = name_length_info.value as usize;
            if !(1..=71).contains(&candidate_length) {
                continue;
            }

            let value_start = name_offset + name_length_info.length;
            let value_end = value_start + candidate_length;
            if value_end > payload.len() {
                continue;
            }

            let Ok(candidate_name) = std::str::from_utf8(&payload[value_start..value_end]) else {
                continue;
            };
            let Some(sanitized_name) = sanitize_nickname(candidate_name) else {
                continue;
            };

            let sanitized_bytes = sanitized_name.len();
            if sanitized_bytes > best_actor_name_bytes {
                best_actor_name_bytes = sanitized_bytes;
                best_actor_name = Some(sanitized_name);
                best_actor_name_end = Some(value_end);
            }
        }

        let actor_name = best_actor_name?;
        let actor_name_end = best_actor_name_end?;
        if actor_name_end >= payload.len() {
            return None;
        }

        let _job: u8 = payload[actor_name_end];
        let server_base = actor_name_end + 1;
        let sid = find_server_id(payload, server_base);

        Some((aid_info.value as u32, actor_name, sid))
    }
}

pub fn read_varint(data: &[u8], offset: usize) -> VarIntOutput {
    let mut value: u32 = 0;
    let mut shift = 0u32;
    let mut count = 0usize;

    loop {
        if offset + count >= data.len() {
            return VarIntOutput::invalid();
        }

        let byte_val = data[offset + count];
        count += 1;
        value |= u32::from(byte_val & 0x7F) << shift;

        if (byte_val & 0x80) == 0 {
            return VarIntOutput {
                value: i64::from(value),
                length: count,
            };
        }

        shift += 7;
        if shift >= 32 {
            return VarIntOutput::invalid();
        }
    }
}

fn parse_u32_le(packet: &[u8], offset: usize) -> u32 {
    if offset + 4 > packet.len() {
        return 0;
    }
    u32::from_le_bytes([
        packet[offset],
        packet[offset + 1],
        packet[offset + 2],
        packet[offset + 3],
    ])
}

fn normalize_skill_id(raw: u32) -> u32 {
    if (30_000_000..=30_999_999).contains(&raw) {
        raw
    } else {
        raw - (raw % 10_000)
    }
}

fn should_use_repeated_hit_damage(
    switch_value: u32,
    encoded_damage: u32,
    multi_hit_count: u32,
    first_multi_hit_value: Option<u32>,
    all_multi_hits_match: bool,
) -> bool {
    let Some(repeated_damage) = first_multi_hit_value else {
        return false;
    };
    if switch_value != 54 || multi_hit_count == 0 || !all_multi_hits_match {
        return false;
    }

    let main_hit_component =
        i64::from(encoded_damage) - (i64::from(multi_hit_count) * i64::from(repeated_damage));
    if main_hit_component > i64::from(repeated_damage) {
        return false;
    }

    encoded_damage / 10 == repeated_damage
}

fn should_treat_first_value_as_damage(
    first_value: u32,
    second_value: u32,
    and_result: u32,
    damage_type: u8,
) -> bool {
    (1_000..=5_000_000).contains(&first_value)
        && second_value <= 25
        && and_result == 6
        && damage_type == 3
}

fn find_bytes(haystack: &[u8], start: usize, needle: &[u8]) -> Option<usize> {
    haystack
        .get(start..)
        .and_then(|slice| {
            slice
                .windows(needle.len())
                .position(|window| window == needle)
        })
        .map(|pos| start + pos)
}

fn find_byte_in_range(data: &[u8], target: u8, start: usize, end: usize) -> Option<usize> {
    data.get(start..end)
        .and_then(|slice| slice.iter().position(|byte| *byte == target))
        .map(|pos| start + pos)
}

fn find_server_id(payload: &[u8], server_base: usize) -> Option<u32> {
    let mut relative = 0usize;
    let mut fallback_sid = None;

    loop {
        let offset = server_base + relative;
        relative += 1;

        if offset + 2 > payload.len() {
            break;
        }

        let sid = u16::from_le_bytes([payload[offset], payload[offset + 1]]) as u32;
        if !is_available_server_id(sid) {
            continue;
        }

        if fallback_sid.is_none() {
            fallback_sid = Some(sid);
        }

        let legion_length_offset = offset + 2;
        if legion_length_offset >= payload.len() {
            continue;
        }

        let legion_length_info = read_varint(payload, legion_length_offset);
        if !legion_length_info.is_valid() {
            continue;
        }

        let legion_length = legion_length_info.value as usize;
        if legion_length > 24 {
            continue;
        }

        let legion_start = legion_length_offset + legion_length_info.length;
        let legion_end = legion_start + legion_length;
        if legion_end > payload.len() {
            continue;
        }

        if legion_length == 0 {
            return Some(sid);
        }

        let Ok(legion_name) = std::str::from_utf8(&payload[legion_start..legion_end]) else {
            continue;
        };

        if legion_name.trim().is_empty() || legion_name.chars().any(|ch| !ch.is_ascii_digit()) {
            return Some(sid);
        }
    }

    fallback_sid.or_else(|| find_sid_0011(payload, server_base))
}

fn is_available_server_id(sid: u32) -> bool {
    (1001..=1021).contains(&sid) || (2001..=2021).contains(&sid)
}

fn find_sid_0011(payload: &[u8], search_start: usize) -> Option<u32> {
    let search_end = payload.len().saturating_sub(1).min(search_start + 200);
    let mut pos = search_start;

    while pos < search_end {
        let Some(idx) = find_bytes(payload, pos, &[0x11, 0x11]) else {
            break;
        };
        if idx < 4 {
            break;
        }
        if payload[idx - 4] == 0x00 && payload[idx - 3] == 0x02 {
            let sid = u16::from_le_bytes([payload[idx - 3], payload[idx - 2]]) as u32;
            if is_available_server_id(sid) {
                return Some(sid);
            }
        }
        pos = idx + 2;
    }

    None
}

fn can_read_varint(data: &[u8], offset: usize) -> bool {
    if offset >= data.len() {
        return false;
    }

    let mut shift = 0u32;
    let mut pos = offset;
    while pos < data.len() {
        let byte_val = data[pos];
        if (byte_val & 0x80) == 0 {
            return true;
        }
        shift += 7;
        if shift >= 32 {
            return false;
        }
        pos += 1;
    }
    false
}

fn sanitize_nickname(nickname: &str) -> Option<String> {
    let sanitized = nickname.split('\0').next().unwrap_or_default().trim();
    if sanitized.is_empty() {
        return None;
    }

    let mut result = String::new();
    let mut only_numbers = true;
    let mut has_han = false;

    for ch in sanitized.chars() {
        let code = ch as u32;
        if code < 32 || code == 127 || (0x80..=0x9F).contains(&code) || ch == '\u{FFFD}' {
            continue;
        }

        let is_han = matches!(code, 0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF);
        if ch.is_alphanumeric() || is_han {
            result.push(ch);
            if ch.is_alphabetic() || is_han {
                only_numbers = false;
            }
            if is_han {
                has_han = true;
            }
        }
    }

    if result.is_empty() || only_numbers {
        return None;
    }
    if result.chars().count() < 2 && !has_han {
        return None;
    }
    if result.chars().count() == 1 && result.chars().all(|ch| ch.is_alphabetic()) {
        return None;
    }

    Some(result)
}

fn skip_guild_name(data: &[u8], start_index: usize) -> usize {
    if start_index >= data.len() {
        return start_index;
    }

    if data[start_index] == 0x00 {
        return start_index + 1;
    }

    let length = data[start_index] as usize;
    if !(1..=32).contains(&length) {
        return start_index;
    }

    let next = start_index + 1;
    if next + length > data.len() {
        return start_index;
    }

    next + length
}
