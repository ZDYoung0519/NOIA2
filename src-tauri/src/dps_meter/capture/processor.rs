use std::sync::Arc;

use lz4_flex::block::decompress;

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
    _port: String,
    mode: ProcessingMode,
}

impl StreamProcessor {
    pub fn new(data_storage: Arc<DataStorage>, port: String, mode: ProcessingMode) -> Self {
        Self {
            data_storage,
            _port: port,
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
                if total_packet_bytes > 16_384 {
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

        offset
    }

    fn unwrap_bundle(&mut self, payload: &[u8]) {
        if payload.len() < 7 {
            return;
        }

        let decompressed_size =
            u32::from_le_bytes([payload[2], payload[3], payload[4], payload[5]]) as usize;
        if decompressed_size == 0 || decompressed_size > 1_000_000 {
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

        if self.parse_summon_ownership_packet(packet) {
            return true;
        }
        if self.parse_summon_packet(packet) {
            return true;
        }

        self.parse_4036(packet);
        self.parse_3336(packet);
        self.parse_4436_optimized(packet);
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
        self.data_storage.append_damage(parsed);
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
        true
    }

    fn parse_summon_packet(&mut self, packet: &[u8]) -> bool {
        let packet_length_info = read_varint(packet, 0);
        if !packet_length_info.is_valid() {
            return false;
        }
        let offset = packet_length_info.length;
        if offset + 1 >= packet.len() || packet[offset] != 0x40 || packet[offset + 1] != 0x36 {
            return false;
        }

        self.parse_summon_spawn_at(packet, offset + 2)
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
            found_something = true;
        }

        found_something
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
            break;
        }
    }

    fn parse_4436_optimized(&mut self, payload: &[u8]) {
        let mut idx = 0usize;
        while idx < payload.len() {
            let Some(pos) = find_bytes(payload, idx, &[0x44, 0x36]) else {
                break;
            };
            let aid_info = read_varint(payload, pos + 2);
            if !aid_info.is_valid() || aid_info.value <= 0 {
                idx = pos + 1;
                continue;
            }

            let scan_start = pos + 2 + aid_info.length;
            let scan_end = payload.len().min(scan_start + 30);
            let Some(name_off) = find_byte_in_range(payload, 0x07, scan_start, scan_end) else {
                idx = pos + 1;
                continue;
            };
            if name_off + 1 >= payload.len() {
                idx = pos + 1;
                continue;
            }

            let name_len = payload[name_off + 1] as usize;
            let name_end = name_off + 2 + name_len;
            if !(1..=50).contains(&name_len) || name_end > payload.len() {
                idx = pos + 1;
                continue;
            }

            let Ok(name) = std::str::from_utf8(&payload[name_off + 2..name_end]) else {
                idx = pos + 1;
                continue;
            };

            let sid = find_server_id(payload, name_end);
            match sid {
                Some(sid) => {
                    let sid_string = sid.to_string();
                    self.data_storage
                        .append_actor(aid_info.value as u32, name, Some(&sid_string));
                }
                None => self
                    .data_storage
                    .append_actor(aid_info.value as u32, name, None),
            }
            idx = pos + 1;
        }
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

fn find_server_id(payload: &[u8], name_end: usize) -> Option<u32> {
    if let Some(cc_pos) = find_bytes(payload, 0, &[0xCC, 0x01]) {
        let mut sid_offset = cc_pos + 2;
        for _ in 0..10 {
            if sid_offset + 2 > payload.len() {
                break;
            }
            let sid = u16::from_le_bytes([payload[sid_offset], payload[sid_offset + 1]]) as u32;
            if is_available_server_id(sid) {
                return Some(sid);
            }
            let out = read_varint(payload, sid_offset);
            if !out.is_valid() {
                break;
            }
            sid_offset += out.length;
        }
    }

    for prefix_byte in [0xC6, 0xC7, 0xB7, 0xA8, 0xD2] {
        let end = payload.len().saturating_sub(2).min(name_end + 200);
        if let Some(prefix_pos) = find_byte_in_range(payload, prefix_byte, name_end, end) {
            let sid_pos = prefix_pos + 2;
            if sid_pos + 2 <= payload.len() {
                let sid = u16::from_le_bytes([payload[sid_pos], payload[sid_pos + 1]]) as u32;
                if is_available_server_id(sid) {
                    return Some(sid);
                }
            }
        }
    }

    let search_end = payload.len().saturating_sub(1).min(name_end + 200);
    let mut pos = name_end;
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

fn is_available_server_id(sid: u32) -> bool {
    (1001..=1018).contains(&sid) || (2001..=2018).contains(&sid)
}
