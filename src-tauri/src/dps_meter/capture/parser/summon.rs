use crate::dps_meter::capture::parser::utils::{
    find_bytes, read_u32_le as try_read_u32_le, read_varint,
};
use crate::dps_meter::capture::processor::StreamProcessor;

fn parse_u32_le(data: &[u8], offset: usize) -> u32 {
    try_read_u32_le(data, offset).unwrap_or_default()
}

impl StreamProcessor {
    pub(crate) fn parse_summon_packet_048d(
        &mut self,
        packet: &[u8],
        _is_compressed_bundle: bool,
    ) -> bool {
        // self.log_packet_source(packet, is_compressed_bundle);
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

    pub(crate) fn parse_summon_packet(
        &mut self,
        packet: &[u8],
        _is_compressed_bundle: bool,
    ) -> bool {
        // self.log_packet_source(packet, is_compressed_bundle);
        // Keep the first half of opcode 4136 aligned with the Kotlin parser:
        // 1. Read summon_id / actor_id after the opcode.
        // 2. Search the packet for 00 40 02, then fall back to 00 00 02.
        // 3. Decode the three bytes before the marker as a little-endian mob code.
        //
        // Owner resolution retains the Rust fallback chain for compatibility.
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
                        "[{}] 4136 summon spawn target={} mob_code={} name={}",
                        self.port, summon_id, mob_code, boss_name
                    ));
                } else {
                    self.logger.debug(format!(
                        "[{}] 4136 summon spawn target={} mob_code={}",
                        self.port, summon_id, mob_code
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
        }

        // else if let Some(owner_id) = self.scan_for_known_player_le32(packet, real_actor_id) {
        //     self.data_storage.append_summon(owner_id, real_actor_id);
        //     self.logger.info(format!(
        //         "[{}] summon fallback le32 owner={} owner_name={} summon={}",
        //         self.port,
        //         owner_id,
        //         self.data_storage
        //             .actor_id_name_snapshot()
        //             .get(&owner_id)
        //             .cloned()
        //             .unwrap_or_else(|| "Unknown".to_string()),
        //         real_actor_id
        //     ));
        //     parsed_any = true;
        // } else if let Some(owner_id) = self.extract_owner_from_packet(packet, real_actor_id) {
        //     self.data_storage.append_summon(owner_id, real_actor_id);
        //     self.logger.info(format!(
        //         "[{}] summon fallback marker owner={} owner_name={} summon={}",
        //         self.port,
        //         owner_id,
        //         self.data_storage
        //             .actor_id_name_snapshot()
        //             .get(&owner_id)
        //             .cloned()
        //             .unwrap_or_else(|| "Unknown".to_string()),
        //         real_actor_id
        //     ));
        //     parsed_any = true;
        // } else if !self.data_storage.has_summon_owner(real_actor_id) {
        //     let mut best_match: Option<(u32, String)> = None;
        //     let mut best_len = 0usize;
        //     let actor_id_name_map = self.data_storage.actor_id_name_snapshot();

        //     for (actor_id, nickname) in actor_id_name_map {
        //         if nickname.is_empty() {
        //             continue;
        //         }

        //         let nickname_bytes = nickname.as_bytes();
        //         if nickname_bytes.is_empty()
        //             || !packet
        //                 .windows(nickname_bytes.len())
        //                 .any(|window| window == nickname_bytes)
        //         {
        //             continue;
        //         }

        //         let nickname_len = nickname.chars().count();
        //         if nickname_len > best_len {
        //             best_len = nickname_len;
        //             best_match = Some((actor_id, nickname));
        //         }
        //     }

        //     if let Some((owner_id, nickname)) = best_match {
        //         self.data_storage.append_summon(owner_id, real_actor_id);
        //         self.logger.info(format!(
        //             "[{}] summon-nickname matched nick owner={} owner_name={} summon={}",
        //             self.port, owner_id, nickname, real_actor_id
        //         ));
        //         parsed_any = true;
        //     }
        // }

        parsed_any
    }

    pub(crate) fn parse_remain_hp_packet(
        &mut self,
        packet: &[u8],
        is_compressed_bundle: bool,
    ) -> bool {
        // self.log_packet_source(packet, is_compressed_bundle);
        self.parse_remain_hp_packet_at(packet, 2, is_compressed_bundle)
    }

    fn parse_remain_hp_packet_at(
        &mut self,
        packet: &[u8],
        offset_after_opcode: usize,
        _is_compressed_bundle: bool,
    ) -> bool {
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

            if target_hp == 0 {
                let (newly_dead, killer) = self.data_storage.mark_player_dead(target_id);
                if newly_dead {
                    self.logger.info(format!(
                        "[{}] player dead actor={} killer={}",
                        self.port,
                        target_id,
                        killer.as_deref().unwrap_or("unknown")
                    ));
                }
            } else {
                self.data_storage.mark_player_alive(target_id);
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

        // self.logger.debug(format!(
        //     "[{}] remain hp target not player target={} current_hp={} known_actor={} mob_code={:?}",
        //     self.port,
        //     target_id,
        //     target_hp,
        //     self.data_storage
        //         .actor_id_name_snapshot()
        //         .contains_key(&target_id),
        //     self.data_storage.get_mob_code(target_id)
        // ));

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
        // Kotlin slices after keyIdx + 8 and then uses the slice index + 11.
        // In the original packet this is equivalent to the opcode offset + 3.
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
}
