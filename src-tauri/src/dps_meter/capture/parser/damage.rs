use crate::dps_meter::capture::parser::utils::{
    bytes_to_hex, read_u32_le_or_default as parse_u32_le, read_varint,
};
use crate::dps_meter::capture::processor::StreamProcessor;
use crate::dps_meter::models::packet::{ParsedDamagePacket, SpecialDamage};

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
        let output = read_varint(self.packet, self.offset);
        if !output.is_valid() {
            return None;
        }
        self.offset += output.length;
        u32::try_from(output.value).ok()
    }
}

impl StreamProcessor {
    #[allow(unused_assignments)]
    pub(crate) fn parse_damage_packet(
        &mut self,
        packet: &[u8],
        _is_compressed_bundle: bool,
    ) -> bool {
        // self.log_packet_source(packet, is_compressed_bundle);
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
                if special_byte & 0x02 != 0 {
                    specials.push(SpecialDamage::Parry);
                }
                if special_byte & 0x04 != 0 {
                    specials.push(SpecialDamage::Perfect);
                }
                if special_byte & 0x08 != 0 {
                    specials.push(SpecialDamage::Double);
                }
                if special_byte & 0x20 != 0 {
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

    pub(crate) fn parse_dot_packet(&mut self, packet: &[u8], _is_compressed_bundle: bool) -> bool {
        // self.log_packet_source(packet, is_compressed_bundle);
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

        if actor_info.value < 1 {
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
