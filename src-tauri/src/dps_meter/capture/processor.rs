use lz4_flex::block::decompress;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::dps_meter::config::SharedDpsMeterConfig;
use crate::dps_meter::models::combat::DetailPlayerInfo;
use crate::dps_meter::models::packet::{ParsedDamagePacket, SpecialDamage, VarIntOutput};
use crate::dps_meter::storage::data_storage::DataStorage;
use crate::plugins::logger::AppLogger;

const COMBAT_POWER_MARKER: [u8; 3] = [0xF4, 0xCB, 0x1F];

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

/// 数据包前缀信息。
///
/// 协议在长度 varint 后面，可能会额外插入 1 个扩展字节（extraFlag，范围 0xF0~0xFE）。
/// 这个字节不属于真正的业务 opcode，只会让后续 payload 整体后移 1 字节。
#[derive(Debug, Clone, Copy)]
struct PacketPrefixInfo {
    /// 真实业务 payload 的起始偏移（也就是 opcode 开始的位置）
    payload_offset: usize,
}

/// 解析长度字段后面的传输层前缀。
///
/// 目前已知协议有两种形式：
/// 1. [length varint][opcode...]
/// 2. [length varint][extraFlag][opcode...]
///
/// 这里统一把真正的 payload 起始偏移算出来，避免各个解析函数各自重复处理。
fn resolve_packet_prefix(packet: &[u8], length_offset: usize) -> Option<PacketPrefixInfo> {
    let first_byte = *packet.get(length_offset)?;
    let has_extra_flag = (0xF0..0xFF).contains(&first_byte);
    let payload_offset = length_offset + if has_extra_flag { 1 } else { 0 };

    if payload_offset >= packet.len() {
        return None;
    }

    Some(PacketPrefixInfo { payload_offset })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProcessorMode {
    Full,
    NicknameOnly,
}

#[derive(Debug, Clone, Copy)]
enum StallResyncMode {
    Immediate,
    Delayed,
}

pub struct StreamProcessor {
    data_storage: Arc<DataStorage>,
    logger: Arc<AppLogger>,
    port: String,
    config: SharedDpsMeterConfig,
    mode: ProcessorMode,
    stall_resync_mode: StallResyncMode,
    stalled_since: Option<Instant>,
}

impl StreamProcessor {
    pub fn new(
        data_storage: Arc<DataStorage>,
        logger: Arc<AppLogger>,
        port: String,
        config: SharedDpsMeterConfig,
    ) -> Self {
        Self {
            data_storage,
            logger,
            port,
            config,
            mode: ProcessorMode::Full,
            stall_resync_mode: StallResyncMode::Immediate,
            stalled_since: None,
        }
    }

    pub fn new_nickname_only(
        data_storage: Arc<DataStorage>,
        logger: Arc<AppLogger>,
        port: String,
        config: SharedDpsMeterConfig,
    ) -> Self {
        Self {
            data_storage,
            logger,
            port,
            config,
            mode: ProcessorMode::NicknameOnly,
            // 昵称包比战斗包更依赖完整帧。这里保留等待策略，
            // 只用于昵称流，避免影响伤害/血量/buff 的实时解析。
            stall_resync_mode: StallResyncMode::Delayed,
            stalled_since: None,
        }
    }

    pub fn consume_stream(&mut self, buffer: &[u8]) -> usize {
        let mut offset = 0usize;
        let max_packet_size_threshold = {
            let config = self.config.read().unwrap();
            usize::try_from(config.max_packet_size_threshold).unwrap_or(1024 * 8)
        };

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
                if total_packet_bytes > max_packet_size_threshold {
                    offset += 1;
                    continue;
                }
                break;
            }

            let current_packet = &buffer[offset..offset + total_packet_bytes];
            let Some(prefix_info) = resolve_packet_prefix(current_packet, length_info.length)
            else {
                offset += 1;
                continue;
            };
            let payload_start = prefix_info.payload_offset;
            let is_bundle = payload_start + 1 < current_packet.len()
                && current_packet[payload_start] == 0xFF
                && current_packet[payload_start + 1] == 0xFF;

            if is_bundle {
                let bundle_size = total_packet_bytes + 1;
                if offset + bundle_size > buffer.len() {
                    break;
                }
                self.unwrap_bundle(&buffer[offset + payload_start..offset + bundle_size]);
                offset += bundle_size;
            } else {
                self.parse_packet(current_packet);
                offset += total_packet_bytes;
            }
        }

        // if buffer.len() >= 4 {
        //     self.scan_for_embedded_048d(buffer);
        // }

        if offset == 0 && !buffer.is_empty() {
            match self.stall_resync_mode {
                StallResyncMode::Immediate => return 1,
                StallResyncMode::Delayed => {
                    let delay_ms = {
                        let config = self.config.read().unwrap();
                        config.stall_resync_delay_ms.clamp(50, 2000)
                    };
                    let now = Instant::now();
                    if let Some(stalled_since) = self.stalled_since {
                        if now.duration_since(stalled_since) >= Duration::from_millis(delay_ms) {
                            self.logger.debug(format!(
                                "[{}] nickname stream stalled for {}ms with buffer_size={}, forcing resync by skipping 1 byte",
                                self.port,
                                delay_ms,
                                buffer.len()
                            ));
                            self.stalled_since = Some(now);
                            return 1;
                        }
                    } else {
                        self.stalled_since = Some(now);
                    }
                }
            }
        } else {
            self.stalled_since = None;
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
            let Some(prefix_info) = resolve_packet_prefix(inner_packet, length_info.length) else {
                break;
            };
            let inner_payload_start = prefix_info.payload_offset;
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
    }

    fn parse_packet(&mut self, packet: &[u8]) -> bool {
        if packet.len() < 3 {
            return false;
        }

        let packet_length_info = read_varint(packet, 0);
        if !packet_length_info.is_valid() {
            return false;
        }

        let Some(prefix_info) = resolve_packet_prefix(packet, packet_length_info.length) else {
            return false;
        };

        let payload = &packet[prefix_info.payload_offset..];
        if payload.len() < 2 {
            return false;
        }

        // let search_target = 191_301_301u32.to_le_bytes();
        // if let Some(hit_offset) = find_bytes(payload, 0, &search_target) {
        //     let context_start = hit_offset.saturating_sub(256);
        //     let context_end = (hit_offset + search_target.len() + 256).min(payload.len());
        //     self.logger.info(format!(
        //         "[{}] hard search skill=191301301 opcode={:02X} {:02X} offset={} target_hex={} context_hex={} full_hex={}",
        //         self.port,
        //         payload[0],
        //         payload[1],
        //         hit_offset,
        //         bytes_to_hex(&search_target),
        //         bytes_to_hex(&payload[context_start..context_end]),
        //         bytes_to_hex(payload),
        //     ));
        // }

        match self.mode {
            ProcessorMode::Full => match (payload[0], payload[1]) {
                (0x33, 0x36) => self.parse_main_nickname(payload),
                (0x45, 0x36) => self.parse_other_nickname(payload),
                (0x56, 0x36) => self.parse_main_combat_power(payload),
                // (0x05, 0x8A) => self.parse_detail_player_info_packet_058a(payload), // player info in guild
                (0x41, 0x36) => self.parse_summon_packet(payload),
                (0x04, 0x38) => self.parse_damage_packet(payload),
                (0x05, 0x38) => self.parse_dot_packet(payload),
                (0x2A, 0x38) | (0x2B, 0x38) => self.parse_buff_packet(payload),
                (0x04, 0x8D) => self.parse_summon_packet_048d(payload),
                (0x00, 0x8D) => self.parse_remain_hp_packet(payload),
                _ => false,
            },
            ProcessorMode::NicknameOnly => match (payload[0], payload[1]) {
                (0x33, 0x36) => self.parse_main_nickname(payload),
                (0x45, 0x36) => self.parse_other_nickname(payload),
                (0x56, 0x36) => self.parse_main_combat_power(payload),
                _ => false,
            },
        }
    }

    #[allow(unused_assignments)]
    fn parse_damage_packet(&mut self, packet: &[u8]) -> bool {
        let mut reader = DamagePacketReader::new(packet, 0);
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
            if reader.remaining_bytes() >= 2
                && packet[reader.offset] == 0x01
                && packet[reader.offset + 1] == 0x00
            {
                reader.offset += 2;
            } else if parsed_any {
                break;
            }

            let Some(target_id) = reader.try_read_var_int() else {
                reader.offset = checkpoint;
                break;
            };

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
            if actor_id == 0 {
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
            if matches!(and_result, 5..=7) && reader.offset + temp_v <= packet.len() {
                let special_area = &packet[reader.offset..reader.offset + temp_v];
                let special_byte = special_area[0];
                if special_byte & 0x04 != 0 {
                    specials.push(SpecialDamage::Perfect);
                }
                if special_byte & 0x08 != 0 {
                    specials.push(SpecialDamage::Double);
                }
                // if special_byte & 0x10 != 0 {
                //     // Keep the old DOUBLE bit as a fallback, but do not count the same
                //     // special twice when both 0x08 and 0x10 are present in one packet.
                //     specials.push(SpecialDamage::Double);
                // }
                if special_byte & 0x40 != 0 {
                    specials.push(SpecialDamage::Smite);
                }
                match special_area.get(2).copied() {
                    Some(0x01) => specials.push(SpecialDamage::Back),
                    Some(0x02) => specials.push(SpecialDamage::Front),
                    _ => {}
                }
            }

            if damage_type == 3 {
                specials.push(SpecialDamage::Critical);
            }

            // Damage tail versions share the same varint stream:
            //   old: [unknown][damage][hit_count][per-hit...]
            //   new: [0][legacy_damage][damage][hit_count][per-hit...]
            // When the first value is 0, damage/hit_count shift right by one varint.
            reader.offset = reader.offset.saturating_add(temp_v);
            let tail_values = collect_varints(packet, reader.offset, 12);
            let Some(unknown) = read_varint_u32(packet, reader.offset) else {
                reader.offset = checkpoint;
                break;
            };
            reader.offset += read_varint(packet, reader.offset).length;

            let Some(legacy_damage) = read_varint_u32(packet, reader.offset) else {
                reader.offset = checkpoint;
                break;
            };
            reader.offset += read_varint(packet, reader.offset).length;

            let mut tail_mode = "old";
            let mut damage = legacy_damage;

            if unknown == 0 {
                let Some(shifted_damage) = read_varint_u32(packet, reader.offset) else {
                    reader.offset = checkpoint;
                    break;
                };
                let shifted_len = read_varint(packet, reader.offset).length;
                let hit_count_info = read_varint(packet, reader.offset + shifted_len);
                if shifted_damage > 0
                    && hit_count_info.is_valid()
                    && (1..=25).contains(&hit_count_info.value)
                {
                    tail_mode = "shifted";
                    damage = shifted_damage;
                    reader.offset += shifted_len;
                }
            }

            let tail_hit_count = read_varint_u32(packet, reader.offset).unwrap_or(0);
            let multi_hit = parse_repeated_multi_hit(packet, reader.offset);
            reader.offset = multi_hit.next_offset;

            if damage > 99_999_999 {
                reader.offset = checkpoint;
                break;
            }

            let resolved_skill_code = normalize_skill_id(exact_skill_code);
            let special_names: Vec<String> = specials
                .iter()
                .map(|special| special.as_str().to_string())
                .collect();

            let parsed = ParsedDamagePacket {
                target_id,
                actor_id,
                skill_code: resolved_skill_code,
                ori_skill_code: exact_skill_code,
                damage: u64::from(damage),
                is_dot: false,
                is_crit: specials.contains(&SpecialDamage::Critical),
                multi_hit_damage: multi_hit.damage,
                multi_hit_count: multi_hit.count,
                specials: special_names.clone(),
            };

            self.data_storage.append_damage(parsed);
            self.logger.debug(format!(
                "[{}] damage target={} actor={} skill={} ori_code={} damage={} tail_mode={} unknown={} legacy_damage={} raw_damage={} tail_values={:?} tail_hit_count={} multi_hit_count={} multi_hit_damage={} per_hits={:?} specials={:?} packet_len={} packet_hex={}",
                self.port,
                target_id,
                actor_id,
                resolved_skill_code,
                exact_skill_code,
                damage,
                tail_mode,
                unknown,
                legacy_damage,
                damage,
                tail_values,
                tail_hit_count,
                multi_hit.count,
                multi_hit.damage,
                multi_hit.per_hit_values,
                special_names,
                packet.len(),
                bytes_to_hex(packet)
            ));
            parsed_any = true;
        }

        parsed_any
    }

    fn parse_dot_packet(&mut self, packet: &[u8]) -> bool {
        let mut offset = 0usize;
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
            "[{}] dot target={} actor={} skill={} ori_code={}, damage={}",
            self.port,
            log_target_id,
            log_actor_id,
            log_skill_code,
            skill_code_candidate,
            log_damage
        ));
        true
    }

    fn parse_buff_packet(&mut self, packet: &[u8]) -> bool {
        if packet.len() < 2 || !matches!(packet[0], 0x2A | 0x2B) || packet[1] != 0x38 {
            return false;
        }

        let opcode = packet[0];
        let mut offset = 2usize;

        let target_info = read_varint(packet, offset);
        if !target_info.is_valid() {
            return false;
        }
        offset += target_info.length + 2;
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
        let skill_code = parse_u32_le(packet, offset);
        offset += 4;

        if skill_code < 110_000_000 || skill_code > 200_000_000 {
            if !(20_000_000..30_000_000).contains(&skill_code) {
                self.logger.debug(format!(
                    "[{}] buff skipped target={} skill={} opcode={:02X}38 packet_len={} packet_hex={}",
                    self.port,
                    target_info.value,
                    skill_code,
                    opcode,
                    packet.len(),
                    bytes_to_hex(packet)
                ));
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

        if duration == u32::MAX as u64 {
            self.logger.debug(format!(
                "[{}] buff skipped permanent target={} actor={} skill={} duration={} server_time={} opcode={:02X}38 packet_len={} packet_hex={}",
                self.port,
                target_info.value,
                actor_info.value,
                skill_code,
                duration,
                server_time,
                opcode,
                packet.len(),
                bytes_to_hex(packet)
            ));
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
        self.logger.debug(format!(
            "[{}] buff detected target={} actor={} skill={} duration_ms={} server_start_ms={} local_start_ms={} local_end_ms={} latency_ms={} server_time={} opcode={:02X}38 packet_len={} packet_hex={}",
            self.port,
            buff.target_id,
            buff.actor_id,
            buff.skill_code,
            buff.duration_ms,
            buff.server_start_ms,
            buff.local_start_ms,
            buff.local_end_ms,
            buff.latency_ms,
            server_time,
            opcode,
            packet.len(),
            bytes_to_hex(packet)
        ));
        true
    }

    fn parse_summon_packet_048d(&mut self, packet: &[u8]) -> bool {
        let offset = 0usize;
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
        if !owner_info.is_valid() || owner_info.value == summon_info.value {
            return false;
        }

        self.data_storage
            .append_summon(owner_info.value as u32, summon_info.value as u32);
        if self.is_boss_summon(summon_info.value as u32) {
            self.logger.info(format!(
                "[{}] summon ownership owner={} owner_name={} summon={}",
                self.port,
                owner_info.value,
                self.data_storage
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
        // 4136 的前半段按 Kotlin 版本保持一致：
        // 1. opcode 后读取 summon_id / actor_id
        // 2. 在整包中查找 00 40 02，找不到再尝试 00 00 02
        // 3. marker 前 3 字节按 little-endian 拼出 mob_code
        //
        // 这样做的好处是包结构和旧版本经验完全一致，后续抓包时更容易直接对照。
        //
        // owner 归属部分则保留当前 Rust 版本的多级 fallback，以兼顾稳定性。
        let summon_info = read_varint(packet, 2);
        if !summon_info.is_valid() || summon_info.value <= 0 {
            return false;
        }

        let summon_id = summon_info.value as u32;
        let mut parsed_any = false;

        let marker_idx = find_bytes(packet, 0, &[0x00, 0x40, 0x02])
            .or_else(|| find_bytes(packet, 0, &[0x00, 0x00, 0x02]));

        if let Some(marker_idx) = marker_idx {
            if marker_idx >= 3 {
                let mob_code = (packet[marker_idx - 3] as u32)
                    | ((packet[marker_idx - 2] as u32) << 8)
                    | ((packet[marker_idx - 1] as u32) << 16);

                self.data_storage.append_mob(summon_id, mob_code);
                if self
                    .data_storage
                    .boss_code_list_snapshot()
                    .contains(&mob_code)
                {
                    let boss_name = self
                        .data_storage
                        .mob_code_name_snapshot()
                        .get(&mob_code)
                        .cloned()
                        .unwrap_or_else(|| "Unknown Boss".to_string());
                    self.logger.info(format!(
                        "[{}] summon spawn target={} mob_code={} name={}",
                        self.port, summon_id, mob_code, boss_name
                    ));
                }
                parsed_any = true;
            }
        }

        let mut real_actor_id = summon_id;
        if real_actor_id > 1_000_000 {
            real_actor_id = (real_actor_id & 0x3FFF) | 0x4000;
        }

        if let Some(owner_id) = self.extract_summon_owner_kotlin_style(packet, real_actor_id) {
            self.data_storage.append_summon(owner_id, real_actor_id);
            self.logger.info(format!(
                "[{}] summon kotlin owner={} owner_name={} summon={}",
                self.port,
                owner_id,
                self.data_storage
                    .actor_id_name_snapshot()
                    .get(&owner_id)
                    .cloned()
                    .unwrap_or_else(|| "Unknown".to_string()),
                real_actor_id
            ));
            parsed_any = true;
        } else if let Some(owner_id) = self.scan_for_known_player_le32(packet, real_actor_id) {
            self.data_storage.append_summon(owner_id, real_actor_id);
            self.logger.info(format!(
                "[{}] summon fallback le32 owner={} owner_name={} summon={}",
                self.port,
                owner_id,
                self.data_storage
                    .actor_id_name_snapshot()
                    .get(&owner_id)
                    .cloned()
                    .unwrap_or_else(|| "Unknown".to_string()),
                real_actor_id
            ));
            parsed_any = true;
        } else if let Some(owner_id) = self.extract_owner_from_packet(packet, real_actor_id) {
            self.data_storage.append_summon(owner_id, real_actor_id);
            self.logger.info(format!(
                "[{}] summon fallback marker owner={} owner_name={} summon={}",
                self.port,
                owner_id,
                self.data_storage
                    .actor_id_name_snapshot()
                    .get(&owner_id)
                    .cloned()
                    .unwrap_or_else(|| "Unknown".to_string()),
                real_actor_id
            ));
            parsed_any = true;
        } else if !self.data_storage.has_summon_owner(real_actor_id) {
            let mut best_match: Option<(u32, String)> = None;
            let mut best_len = 0usize;
            let actor_id_name_map = self.data_storage.actor_id_name_snapshot();

            for (actor_id, nickname) in actor_id_name_map {
                if nickname.is_empty() {
                    continue;
                }

                let nickname_bytes = nickname.as_bytes();
                if nickname_bytes.is_empty()
                    || !packet
                        .windows(nickname_bytes.len())
                        .any(|window| window == nickname_bytes)
                {
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
                self.logger.info(format!(
                    "[{}] summon-nickname matched nick owner={} owner_name={} summon={}",
                    self.port, owner_id, nickname, real_actor_id
                ));
                parsed_any = true;
            }
        }

        parsed_any
    }

    fn parse_remain_hp_packet(&mut self, packet: &[u8]) -> bool {
        self.parse_remain_hp_packet_at(packet, 2)
    }

    fn parse_remain_hp_packet_at(&mut self, packet: &[u8], offset_after_opcode: usize) -> bool {
        let mut offset = offset_after_opcode;

        if packet.len() < offset {
            return false;
        }

        let target_id_info = read_varint(packet, offset);
        if !target_id_info.is_valid() || target_id_info.value < 100 {
            return false;
        }
        offset += target_id_info.length;

        let target_id = target_id_info.value as u32;
        let skip_1 = read_varint(packet, offset);
        if !skip_1.is_valid() {
            return false;
        }
        offset += skip_1.length;

        let skip_2 = read_varint(packet, offset);
        if !skip_2.is_valid() {
            return false;
        }
        offset += skip_2.length;

        let skip_3 = read_varint(packet, offset);
        if !skip_3.is_valid() {
            return false;
        }
        offset += skip_3.length;

        if offset + 4 > packet.len() {
            return false;
        }

        let target_hp = parse_u32_le(packet, offset);
        if target_hp > 1_000_000_000 {
            return false;
        }

        // Mark as possible boss if HP exceeds threshold
        const POSSIBLE_BOSS_HP_THRESHOLD: u32 = 10_000_000;
        let show_possible_boss = self.config.read().unwrap().show_possible_boss;
        if show_possible_boss && target_hp > POSSIBLE_BOSS_HP_THRESHOLD {
            if let Some(mob_code) = self.data_storage.get_mob_code(target_id) {
                self.data_storage.add_possible_boss(mob_code);
            }
        }

        let is_target_player = self
            .data_storage
            .actor_id_name_snapshot()
            .contains_key(&target_id)
            && self.data_storage.get_mob_code(target_id).is_none();

        if is_target_player {
            if !self.config.read().unwrap().pvp_mode_on {
                // self.logger.debug(format!(
                //     "[{}] player remain hp skipped pvp_mode_off actor={} current_hp={}",
                //     self.port, target_id, target_hp
                // ));
                return true;
            }
            if self.data_storage.main_actor_id() == Some(target_id) {
                // self.logger.debug(format!(
                //     "[{}] player remain hp skipped main_actor actor={} current_hp={}",
                //     self.port, target_id, target_hp
                // ));
                return true;
            }

            self.data_storage.append_player_hp(target_id, target_hp);
            let actor_name = self
                .data_storage
                .actor_id_name_snapshot()
                .get(&target_id)
                .cloned()
                .unwrap_or_else(|| "Unknown".to_string());
            self.logger.info(format!(
                "[{}] player remain hp actor={} name={} current_hp={}",
                self.port, target_id, actor_name, target_hp
            ));
            return true;
        }

        self.logger.debug(format!(
            "[{}] remain hp target not player target={} current_hp={} known_actor={} mob_code={:?}",
            self.port,
            target_id,
            target_hp,
            self.data_storage
                .actor_id_name_snapshot()
                .contains_key(&target_id),
            self.data_storage.get_mob_code(target_id)
        ));

        // Skip non-boss targets hp changes when boss_only is enabled
        {
            let config = self.config.read().unwrap();
            if config.boss_only {
                let mob_code = self.data_storage.get_mob_code(target_id);
                let is_known =
                    mob_code.is_some_and(|code| self.data_storage.is_known_boss_code(code));
                let is_possible =
                    mob_code.is_some_and(|code| self.data_storage.is_possible_boss(code));
                if !is_known && !is_possible {
                    return true;
                }
            }
        }

        let is_first_hp_detection = !self
            .data_storage
            .mob_id_hp_snapshot()
            .contains_key(&target_id);
        self.data_storage.append_mob_hp(target_id, target_hp);
        if is_first_hp_detection {
            if let Some((current_hp, max_hp)) = self
                .data_storage
                .mob_id_hp_snapshot()
                .get(&target_id)
                .copied()
            {
                let mob_id_code_map = self.data_storage.mob_id_code_snapshot();
                let mob_code_name_map = self.data_storage.mob_code_name_snapshot();

                if let Some(mob_code) = mob_id_code_map.get(&target_id).copied() {
                    let mob_name = mob_code_name_map
                        .get(&mob_code)
                        .cloned()
                        .unwrap_or_else(|| "Unknown Boss".to_string());
                    self.logger.info(format!(
                        "[{}] first remain hp mob_id={} mob_code={} name={} current_hp={} max_hp={}",
                        self.port, target_id, mob_code, mob_name, current_hp, max_hp
                    ));
                } else {
                    self.logger.info(format!(
                        "[{}] first remain hp mob_id={} current_hp={} max_hp={}",
                        self.port, target_id, current_hp, max_hp
                    ));
                }
            }
        }
        true
    }

    fn extract_summon_owner_kotlin_style(&self, packet: &[u8], summon_id: u32) -> Option<u32> {
        let key_idx = find_bytes(packet, 0, &[0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])?;
        let after_packet_start = key_idx + 8;
        if after_packet_start >= packet.len() {
            return None;
        }

        let opcode_absolute_idx = find_bytes(packet, after_packet_start, &[0x07, 0x02, 0x06])?;
        // Kotlin 原版是在 keyIdx + 8 之后切片，再用切片内索引 + 11。
        // 换算回原始 packet 的绝对偏移，等价于 opcode 绝对位置 + 3。
        let owner_offset = opcode_absolute_idx + 3;
        if owner_offset + 2 > packet.len() {
            return None;
        }

        let owner_id = u16::from_le_bytes([packet[owner_offset], packet[owner_offset + 1]]) as u32;
        if !(1..=999_999).contains(&owner_id) {
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
                && (1..=999_999).contains(&le32)
                && known_actor_ids.contains_key(&le32)
                && !self.data_storage.has_summon_owner(le32)
                && !self.data_storage.has_mob(le32)
            {
                return Some(le32);
            }
        }

        None
    }

    fn parse_main_nickname(&mut self, payload: &[u8]) -> bool {
        self.parse_main_nickname_standard(payload) || self.parse_main_nickname_fallback(payload)
    }

    fn parse_main_combat_power(&mut self, payload: &[u8]) -> bool {
        if payload.len() < 6 || payload[0] != 0x56 || payload[1] != 0x36 {
            return false;
        }

        let combat_power = parse_u32_le(payload, 2) as u64;
        if !self.data_storage.save_main_actor_combat_power(combat_power) {
            return false;
        }

        self.logger.info(format!(
            "[{}] main actor combat power combat_power={}",
            self.port, combat_power
        ));
        true
    }

    // Normal maps use a 0x07 separator before the name length.
    fn parse_main_nickname_standard(&mut self, payload: &[u8]) -> bool {
        let mut offset = 2usize;
        let aid_info = read_varint(payload, offset);
        if !aid_info.is_valid() || aid_info.value <= 0 {
            return false;
        }
        offset += aid_info.length;
        if offset >= payload.len() {
            return false;
        }

        if payload.len() < offset + 10 {
            return false;
        }

        let Some(splitter_idx) = find_byte_in_range(payload, 0x07, offset, offset + 10) else {
            return false;
        };
        offset = splitter_idx + 1;

        let name_length_info = read_varint(payload, offset);
        if !name_length_info.is_valid() {
            return false;
        }
        offset += name_length_info.length;
        if name_length_info.length > 71 || offset >= payload.len() {
            return false;
        }

        let name_len = usize::try_from(name_length_info.value).ok().unwrap_or(0);
        if offset + name_len > payload.len() {
            return false;
        }

        let name_start = offset;
        let name_end = offset + name_len;
        let name_hex = bytes_to_hex(&payload[name_start..name_end]);

        let Ok(name) = std::str::from_utf8(&payload[name_start..name_end]) else {
            return false;
        };
        let Some(name) = sanitize_nickname(name) else {
            return false;
        };

        offset += name_len;
        let sid = if offset + 2 <= payload.len() {
            let sid = u16::from_le_bytes([payload[offset], payload[offset + 1]]) as u32;
            offset += 2;
            Some(sid)
        } else {
            None
        };

        let job = payload.get(offset).copied();
        let job_text = job
            .map(|job| job.to_string())
            .unwrap_or_else(|| "none".to_string());
        let actor_class = job.and_then(job_to_actor_class);

        let sid_string = sid.map(|sid| sid.to_string());
        let sid_text = sid_string.as_deref().unwrap_or("none");
        self.data_storage
            .append_actor(aid_info.value as u32, &name, sid_string.as_deref());
        self.logger.info(format!(
            "[{}] main actor actor={} name={} name_hex={} sid={} job={} class={}",
            self.port,
            aid_info.value,
            name,
            name_hex,
            sid_text,
            job_text,
            actor_class.unwrap_or("none")
        ));

        if let Some(actor_class) = actor_class {
            self.data_storage
                .set_actor_class(aid_info.value as u32, actor_class);
        }
        self.data_storage
            .set_main_actor(aid_info.value as u32, &name);
        true
    }

    // Some special maps still use opcode 33 36, but store the nickname as
    // actor_id + several fields + name_len + name + sid, without the 0x07 separator.
    fn parse_main_nickname_fallback(&mut self, payload: &[u8]) -> bool {
        let mut offset = 2usize;
        let aid_info = read_varint(payload, offset);
        if !aid_info.is_valid() || aid_info.value <= 0 {
            return false;
        }

        offset += aid_info.length;
        let search_end = payload.len().min(offset + 32);

        // Search only near the actor id to avoid matching names from later list data.
        for name_len_offset in offset..search_end {
            let name_len = usize::from(payload[name_len_offset]);
            if name_len == 0 || name_len > 71 {
                continue;
            }

            let name_start = name_len_offset + 1;
            let name_end = name_start + name_len;
            if name_end + 2 > payload.len() {
                continue;
            }

            let sid = u16::from_le_bytes([payload[name_end], payload[name_end + 1]]) as u32;
            if !is_available_server_id(sid) {
                continue;
            }

            let Ok(name) = std::str::from_utf8(&payload[name_start..name_end]) else {
                continue;
            };
            let Some(name) = sanitize_nickname(name) else {
                continue;
            };

            let name_hex = bytes_to_hex(&payload[name_start..name_end]);
            let job = payload.get(name_end + 2).copied();
            let job_text = job
                .map(|job| job.to_string())
                .unwrap_or_else(|| "none".to_string());
            let actor_class = job.and_then(job_to_actor_class);
            self.data_storage
                .append_actor(aid_info.value as u32, &name, Some(&sid.to_string()));
            if let Some(actor_class) = actor_class {
                self.data_storage
                    .set_actor_class(aid_info.value as u32, actor_class);
            }
            self.logger.info(format!(
                "[{}] main actor fallback actor={} name={} name_hex={} sid={} job={} class={} name_len_offset={}",
                self.port,
                aid_info.value,
                name,
                name_hex,
                sid,
                job_text,
                actor_class.unwrap_or("none"),
                name_len_offset
            ));
            self.data_storage
                .set_main_actor(aid_info.value as u32, &name);
            return true;
        }

        false
    }

    fn parse_detail_player_info_packet_058a(&mut self, payload: &[u8]) -> bool {
        if payload.len() < 8 || payload[0] != 0x05 || payload[1] != 0x8A {
            return false;
        }

        let expected_count = if payload.len() >= 6 {
            u16::from_le_bytes([payload[4], payload[5]]) as usize
        } else {
            0
        };
        let mut offset = 2usize;
        let mut parsed_count = 0usize;

        while offset < payload.len() {
            let Some(entry_offset) =
                find_next_detail_player_info_entry(payload, offset, payload.len())
            else {
                break;
            };
            let Some((info, next_offset)) = parse_detail_player_info_entry(payload, entry_offset)
            else {
                offset = entry_offset + 1;
                continue;
            };

            self.logger.debug(format!(
                "[{}] detail player info name={} server={} item_level={} combat_power={} unknown_1={} unknown_2={} unknown_3={}",
                self.port,
                info.name,
                info.server_id,
                info.item_level,
                info.combat_power,
                info.unknown_1,
                info.unknown_2,
                info.unknown_3
            ));
            self.data_storage.upsert_detail_player_info(info);
            parsed_count += 1;

            if expected_count > 0 && parsed_count >= expected_count {
                break;
            }
            if next_offset <= entry_offset {
                offset = entry_offset + 1;
            } else {
                offset = next_offset;
            }
        }

        if parsed_count > 0 {
            self.logger.info(format!(
                "[{}] detail player info parsed count={} expected={}",
                self.port, parsed_count, expected_count
            ));
            return true;
        }

        false
    }

    fn parse_other_nickname(&mut self, payload: &[u8]) -> bool {
        let aid_info = read_varint(payload, 2);
        if !aid_info.is_valid() || aid_info.value <= 0 {
            return false;
        }

        let actor_id = aid_info.value as u32;
        let mut offset = 2 + aid_info.length;
        if payload.len() <= offset {
            return false;
        }

        let unknown_info_1 = read_varint(payload, offset);
        if !unknown_info_1.is_valid() {
            return false;
        }
        offset += unknown_info_1.length;
        if payload.len() <= offset {
            return false;
        }

        let unknown_info_2 = read_varint(payload, offset);
        if !unknown_info_2.is_valid() {
            return false;
        }
        offset += unknown_info_2.length;
        if payload.len().saturating_sub(offset) <= 2 {
            return false;
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

        let Some(actor_name) = best_actor_name else {
            return false;
        };
        let Some(actor_name_end) = best_actor_name_end else {
            return false;
        };
        if actor_name_end >= payload.len() {
            return false;
        }

        let job = payload[actor_name_end];
        let actor_class = job_to_actor_class(job);
        let server_base = actor_name_end + 1;
        let sid = find_server_id(payload, server_base);
        let combat_power = parse_snapshot_combat_power(payload);

        let sid_string = sid.map(|sid| sid.to_string());
        let sid_text = sid_string.as_deref().unwrap_or("none");
        self.data_storage
            .append_actor(actor_id, &actor_name, sid_string.as_deref());
        if let Some(actor_class) = actor_class {
            self.data_storage.set_actor_class(actor_id, actor_class);
        }
        if let Some(combat_power) = combat_power {
            self.data_storage
                .set_actor_combat_power(actor_id, combat_power);
        }
        self.logger.info(format!(
            "[{}] actor actor={} name={} sid={} job={} class={} combat_power={}",
            self.port,
            actor_id,
            actor_name,
            sid_text,
            job,
            actor_class.unwrap_or("none"),
            combat_power
                .map(|value| value.to_string())
                .unwrap_or_else(|| "none".to_string())
        ));

        true
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

fn parse_u64_le(packet: &[u8], offset: usize) -> u64 {
    if offset + 8 > packet.len() {
        return 0;
    }
    u64::from_le_bytes([
        packet[offset],
        packet[offset + 1],
        packet[offset + 2],
        packet[offset + 3],
        packet[offset + 4],
        packet[offset + 5],
        packet[offset + 6],
        packet[offset + 7],
    ])
}

fn parse_snapshot_combat_power(packet: &[u8]) -> Option<u64> {
    let marker_idx = last_index_of(packet, &COMBAT_POWER_MARKER)?;
    let mut offset = marker_idx + 11;

    while offset + 8 <= packet.len() {
        let combat_power = parse_u32_le(packet, offset) as u64;
        let trailing_zero = parse_u32_le(packet, offset + 4) == 0;
        if (1..=10_000_000).contains(&combat_power) && trailing_zero {
            return Some(combat_power);
        }

        offset += 1;
    }

    None
}

fn parse_detail_player_info_entry(
    payload: &[u8],
    offset: usize,
) -> Option<(DetailPlayerInfo, usize)> {
    if !looks_like_detail_player_info_entry(payload, offset) {
        return None;
    }

    let server_id = u16::from_le_bytes([payload[offset], payload[offset + 1]]);
    let class_or_role = parse_u32_le(payload, offset + 2);
    let name_len = payload[offset + 6] as usize;
    let name_start = offset + 7;
    let name_end = name_start + name_len;
    let name = std::str::from_utf8(&payload[name_start..name_end]).ok()?;
    let name = sanitize_nickname(name)?;

    let mut cursor = name_end;
    let level = parse_u32_le(payload, cursor);
    cursor += 4;
    let flag = *payload.get(cursor)?;
    cursor += 1;
    let character_uid = parse_u64_le(payload, cursor);
    cursor += 8;
    let unknown_1 = parse_u32_le(payload, cursor);
    cursor += 4;
    let item_level = parse_u32_le(payload, cursor);
    cursor += 4;
    let combat_power = parse_u64_le(payload, cursor);
    cursor += 8;
    let unknown_2 = parse_u64_le(payload, cursor);
    cursor += 8;
    let unknown_3 = parse_u32_le(payload, cursor);
    cursor += 4;

    // Records may have a few padding bytes, so find the next plausible record
    // instead of assuming a fixed stride.
    let next_offset = find_next_detail_player_info_entry(payload, cursor, payload.len())
        .unwrap_or(cursor.min(payload.len()));

    Some((
        DetailPlayerInfo {
            server_id,
            name,
            class_or_role,
            level,
            flag,
            character_uid,
            unknown_1,
            item_level,
            combat_power,
            unknown_2,
            unknown_3,
        },
        next_offset,
    ))
}

fn job_to_actor_class(job: u8) -> Option<&'static str> {
    match job {
        5..=8 => Some("GLADIATOR"),
        9..=12 => Some("TEMPLAR"),
        13..=16 => Some("RANGER"),
        17..=20 => Some("ASSASSIN"),
        21..=24 => Some("ELEMENTALIST"),
        25..=28 => Some("SORCERER"),
        29..=32 => Some("CLERIC"),
        33..=36 => Some("CHANTER"),
        45..=48 => Some("FIGHTER"),
        _ => None,
    }
}

fn find_next_detail_player_info_entry(payload: &[u8], start: usize, end: usize) -> Option<usize> {
    let end = end.min(payload.len());
    (start..end).find(|offset| looks_like_detail_player_info_entry(payload, *offset))
}

fn looks_like_detail_player_info_entry(payload: &[u8], offset: usize) -> bool {
    if offset + 48 > payload.len() {
        return false;
    }

    let server_id = u16::from_le_bytes([payload[offset], payload[offset + 1]]) as u32;
    if !is_available_server_id(server_id) {
        return false;
    }

    let name_len = payload[offset + 6] as usize;
    if !(1..=71).contains(&name_len) {
        return false;
    }

    let name_start = offset + 7;
    let name_end = name_start + name_len;
    let min_end = name_end + 41;
    if min_end > payload.len() {
        return false;
    }

    let Ok(name) = std::str::from_utf8(&payload[name_start..name_end]) else {
        return false;
    };
    if sanitize_nickname(name).is_none() {
        return false;
    }

    let level = parse_u32_le(payload, name_end);
    (1..=100).contains(&level)
}

fn normalize_skill_id(raw: u32) -> u32 {
    if (30_000_000..=30_999_999).contains(&raw) {
        raw
    } else {
        raw - (raw % 10_000)
    }
}

#[derive(Debug, Default)]
struct RepeatedMultiHit {
    count: u32,
    damage: u64,
    per_hit_values: Vec<u32>,
    next_offset: usize,
}

fn parse_repeated_multi_hit(packet: &[u8], offset: usize) -> RepeatedMultiHit {
    let Some(count) = read_varint_u32(packet, offset) else {
        return RepeatedMultiHit {
            next_offset: offset,
            ..Default::default()
        };
    };
    if !(1..=25).contains(&count) {
        return RepeatedMultiHit {
            next_offset: offset,
            ..Default::default()
        };
    }

    let mut cursor = offset + read_varint(packet, offset).length;
    let mut per_hit_values = Vec::with_capacity(count as usize);
    let mut first_hit = None;

    for _ in 0..count {
        let Some(hit) = read_varint_u32(packet, cursor) else {
            return RepeatedMultiHit {
                next_offset: offset,
                ..Default::default()
            };
        };
        if hit == 0 || first_hit.is_some_and(|first| first != hit) {
            return RepeatedMultiHit {
                next_offset: offset,
                ..Default::default()
            };
        }

        first_hit = Some(hit);
        per_hit_values.push(hit);
        cursor += read_varint(packet, cursor).length;
    }

    RepeatedMultiHit {
        count,
        damage: per_hit_values.iter().map(|value| u64::from(*value)).sum(),
        per_hit_values,
        next_offset: cursor,
    }
}

fn read_varint_u32(data: &[u8], offset: usize) -> Option<u32> {
    let out = read_varint(data, offset);
    if !out.is_valid() {
        return None;
    }

    u32::try_from(out.value).ok()
}

fn collect_varints(data: &[u8], start: usize, max_count: usize) -> Vec<i64> {
    let mut values = Vec::new();
    let mut offset = start;

    while offset < data.len() && values.len() < max_count {
        let out = read_varint(data, offset);
        if !out.is_valid() {
            break;
        }

        values.push(out.value);
        offset += out.length;
    }

    values
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

fn last_index_of(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }

    haystack
        .windows(needle.len())
        .rposition(|window| window == needle)
}

fn find_byte_in_range(data: &[u8], target: u8, start: usize, end: usize) -> Option<usize> {
    data.get(start..end)
        .and_then(|slice| slice.iter().position(|byte| *byte == target))
        .map(|pos| start + pos)
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

fn parse_hex_bytes(hex: &str) -> Option<Vec<u8>> {
    let compact: String = hex.chars().filter(|ch| !ch.is_whitespace()).collect();
    if compact.is_empty() || compact.len() % 2 != 0 {
        return None;
    }

    let mut bytes = Vec::with_capacity(compact.len() / 2);
    for index in (0..compact.len()).step_by(2) {
        let byte = u8::from_str_radix(&compact[index..index + 2], 16).ok()?;
        bytes.push(byte);
    }

    Some(bytes)
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
    if result.chars().count() == 1 && result.chars().all(|ch| ch.is_ascii_alphabetic()) {
        return None;
    }

    Some(result)
}
