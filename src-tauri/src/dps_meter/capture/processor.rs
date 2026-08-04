use lz4_flex::block::decompress;
use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::dps_meter::capture::parser::context::ParserContext;
use crate::dps_meter::capture::parser::field_boss_timer;
use crate::dps_meter::capture::parser::nickname;
use crate::dps_meter::capture::parser::utils::read_varint;
use crate::dps_meter::config::SharedDpsMeterConfig;
use crate::dps_meter::storage::data_storage::DataStorage;
use crate::plugins::logger::AppLogger;

const KNOWN_PACKET_HEADERS: &[(u8, u8)] = &[
    (0x33, 0x36),
    (0x45, 0x36),
    (0x56, 0x36),
    (0x41, 0x36),
    (0x04, 0x38),
    (0x05, 0x38),
    (0x2A, 0x38),
    (0x2B, 0x38),
    (0x04, 0x8D),
    (0x00, 0x8D),
    (0x01, 0x91),
    (0xFF, 0xFF),
];

/// Packet prefix metadata.
///
/// An optional extension byte in the 0xF0..0xFE range may appear after the
/// length varint. It is not part of the business opcode.
#[derive(Debug, Clone, Copy)]
struct PacketPrefixInfo {
    /// Offset of the business payload and opcode.
    payload_offset: usize,
}

/// Resolve the transport prefix following the length field.
///
/// Supported layouts:
/// 1. [length varint][opcode...]
/// 2. [length varint][extraFlag][opcode...]
fn resolve_packet_prefix(packet: &[u8], length_offset: usize) -> Option<PacketPrefixInfo> {
    let first_byte = *packet.get(length_offset)?;
    let has_extra_flag = (0xF0..0xFF).contains(&first_byte);
    let payload_offset = length_offset + if has_extra_flag { 1 } else { 0 };

    if payload_offset >= packet.len() {
        return None;
    }

    Some(PacketPrefixInfo { payload_offset })
}

fn inspect_stall_candidate(buffer: &[u8]) -> StallCandidate {
    let length_info = read_varint(buffer, 0);
    let declared_packet_len = if length_info.is_valid() && length_info.value > 0 {
        usize::try_from(length_info.value.saturating_sub(3)).ok()
    } else {
        None
    };
    let opcode = if length_info.is_valid() {
        resolve_packet_prefix(buffer, length_info.length).and_then(|prefix| {
            Some((
                *buffer.get(prefix.payload_offset)?,
                *buffer.get(prefix.payload_offset + 1)?,
            ))
        })
    } else {
        None
    };

    StallCandidate {
        declared_packet_len,
        opcode,
    }
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct StallCandidate {
    declared_packet_len: Option<usize>,
    opcode: Option<(u8, u8)>,
}

pub struct StreamProcessor {
    pub(super) data_storage: Arc<DataStorage>,
    pub(super) logger: Arc<AppLogger>,
    pub(super) port: String,
    pub(super) config: SharedDpsMeterConfig,
    mode: ProcessorMode,
    stall_resync_mode: StallResyncMode,
    stalled_since: Option<Instant>,
    stalled_candidate: Option<StallCandidate>,
    combat_damage_enabled: bool,
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
            stalled_candidate: None,
            combat_damage_enabled: false,
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
            stall_resync_mode: StallResyncMode::Delayed,
            stalled_since: None,
            stalled_candidate: None,
            combat_damage_enabled: false,
        }
    }

    pub fn set_combat_damage_enabled(&mut self, enabled: bool) {
        self.combat_damage_enabled = enabled;
    }

    pub fn consume_stream(&mut self, buffer: &[u8]) -> usize {
        let mut offset = 0usize;
        let max_packet_size_threshold = {
            let config = self.config.read().unwrap();
            usize::try_from(config.max_packet_size_threshold).unwrap_or(8 * 1024)
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
                // let candidate = inspect_stall_candidate(&buffer[offset..]);
                // let is_explicitly_unknown = candidate
                //     .opcode
                //     .is_some_and(|opcode| !KNOWN_PACKET_HEADERS.contains(&opcode));
                // if is_explicitly_unknown && total_packet_bytes > max_packet_size_threshold {
                //     offset += 1;
                //     continue;
                // }
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
                self.parse_packet(current_packet, false);
                offset += total_packet_bytes;
            }
        }

        // if buffer.len() >= 4 {
        //     self.scan_for_embedded_048d(buffer);
        // }

        if offset == 0 && !buffer.is_empty() {
            let candidate: StallCandidate = inspect_stall_candidate(buffer);
            let is_known_or_undetermined = candidate
                .opcode
                .is_none_or(|opcode| KNOWN_PACKET_HEADERS.contains(&opcode));
            let delay_ms = if is_known_or_undetermined {
                let config = self.config.read().unwrap();
                match self.stall_resync_mode {
                    StallResyncMode::Immediate => config.full_processor_stall_resync_delay_ms,
                    StallResyncMode::Delayed => config.stall_resync_delay_ms,
                }
            } else {
                self.config
                    .read()
                    .unwrap()
                    .unknown_packet_stall_resync_delay_ms
            };

            if delay_ms == 0 {
                self.stalled_since = None;
                self.stalled_candidate = None;
                
                self.logger.info(format!(
                    "[{}] stream stalled for {}ms with buffer_size={} declared_packet_len={:?} opcode={} known_or_undetermined={}, forcing resync by skipping 1 byte",
                    self.port,
                    delay_ms,
                    buffer.len(),
                    candidate.declared_packet_len,
                    candidate
                        .opcode
                        .map(|(first, second)| format!("{first:02X}{second:02X}"))
                        .unwrap_or_else(|| "undetermined".to_string()),
                    is_known_or_undetermined
                ));

                return 1;
            }

            let now = Instant::now();
            if self.stalled_candidate != Some(candidate) {
                self.stalled_candidate = Some(candidate);
                self.stalled_since = Some(now);
                return 0;
            }

            if let Some(stalled_since) = self.stalled_since {
                if now.duration_since(stalled_since) >= Duration::from_millis(delay_ms) {
                    self.logger.info(format!(
                        "[{}] stream stalled for {}ms with buffer_size={} declared_packet_len={:?} opcode={} known_or_undetermined={}, forcing resync by skipping 1 byte",
                        self.port,
                        delay_ms,
                        buffer.len(),
                        candidate.declared_packet_len,
                        candidate
                            .opcode
                            .map(|(first, second)| format!("{first:02X}{second:02X}"))
                            .unwrap_or_else(|| "undetermined".to_string()),
                        is_known_or_undetermined
                    ));
                    self.stalled_since = Some(now);
                    return 1;
                }
            } else {
                self.stalled_since = Some(now);
            }
        } else {
            self.stalled_since = None;
            self.stalled_candidate = None;
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
                self.parse_packet(inner_packet, true);
            }

            offset += inner_total_bytes;
        }
    }

    fn parse_packet(&mut self, packet: &[u8], is_compressed_bundle: bool) -> bool {
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

        match self.mode {
            ProcessorMode::Full => match (payload[0], payload[1]) {
                (0x33, 0x36) => {
                    nickname::parse_main(&self.parser_context(), payload, is_compressed_bundle)
                }
                (0x45, 0x36) => {
                    nickname::parse_other(&self.parser_context(), payload, is_compressed_bundle)
                }
                (0x56, 0x36) => nickname::parse_main_combat_power(
                    &self.parser_context(),
                    payload,
                    is_compressed_bundle,
                ),
                (0x41, 0x36) => self.parse_summon_packet(payload, is_compressed_bundle),
                (0x04, 0x38) if self.combat_damage_enabled => {
                    self.parse_damage_packet(payload, is_compressed_bundle)
                }
                (0x05, 0x38) if self.combat_damage_enabled => {
                    self.parse_dot_packet(payload, is_compressed_bundle)
                }
                (0x2A, 0x38) | (0x2B, 0x38) => {
                    self.parse_buff_packet(payload, is_compressed_bundle)
                }
                (0x04, 0x8D) => self.parse_summon_packet_048d(payload, is_compressed_bundle),
                (0x00, 0x8D) => self.parse_remain_hp_packet(payload, is_compressed_bundle),
                (0x01, 0x91) => field_boss_timer::parse_packet(&self.parser_context(), payload),
                _ => false,
            },
            ProcessorMode::NicknameOnly => match (payload[0], payload[1]) {
                (0x33, 0x36) => {
                    nickname::parse_main(&self.parser_context(), payload, is_compressed_bundle)
                }
                (0x45, 0x36) => {
                    nickname::parse_other(&self.parser_context(), payload, is_compressed_bundle)
                }
                (0x56, 0x36) => nickname::parse_main_combat_power(
                    &self.parser_context(),
                    payload,
                    is_compressed_bundle,
                ),
                (0x41, 0x36) => self.parse_summon_packet(payload, is_compressed_bundle),
                _ => false,
            },
        }
    }

    fn parser_context(&self) -> ParserContext<'_> {
        ParserContext::new(&self.data_storage, &self.logger, &self.port)
    }
}
