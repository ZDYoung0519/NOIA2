use std::collections::BTreeMap;

use super::context::ParserContext;
use super::utils::{bytes_to_hex, current_timestamp_millis, read_u32_le, read_u64_le, read_varint};

const TIMESTAMP_PAST_TOLERANCE_MS: u64 = 2 * 60 * 1000;
const TIMESTAMP_FUTURE_LIMIT_MS: u64 = 8 * 24 * 60 * 60 * 1000;
const TIMESTAMP_GAPS: [usize; 4] = [0, 1, 2, 12];

// (map id, wire code, mob code)
const FIELD_BOSS_CODES: &[(u32, u32, u32)] = &[
    (1010, 101001, 2100003),
    (1010, 101002, 2100040),
    (1010, 101003, 2100050),
    (1010, 101004, 2100076),
    (1010, 101005, 2100077),
    (1010, 101006, 2100079),
    (1010, 101007, 2100141),
    (1010, 101008, 2100177),
    (1010, 101009, 2100178),
    (1010, 101010, 2100582),
    (1010, 101011, 2100617),
    (1010, 101012, 2100661),
    (1010, 101013, 2100708),
    (1010, 101014, 2100718),
    (1010, 101015, 2100876),
    (1010, 101016, 2100877),
    (1010, 101017, 2100988),
    (1010, 101018, 2100989),
    (1010, 101019, 2100991),
    (1010, 101020, 2101016),
    (1010, 101021, 2101074),
    (1010, 101022, 2101120),
    (1010, 101023, 2101122),
    (1010, 101024, 2101131),
    (1110, 111001, 2400017),
    (1110, 111002, 2400074),
    (1110, 111003, 2400140),
    (1110, 111004, 2400141),
    (1110, 111005, 2400212),
    (1110, 111006, 2400223),
    (1110, 111007, 2400274),
    (1110, 111008, 2400335),
    (1110, 111009, 2400353),
    (1110, 111010, 2400358),
    (1110, 111011, 2400419),
    (1110, 111012, 2400424),
    (1110, 111013, 2400425),
    (1110, 111014, 2400474),
    (1110, 111015, 2400504),
    (1110, 111016, 2400593),
    (1110, 111017, 2400607),
    (1110, 111018, 2400608),
    (1110, 111019, 2400659),
    (1110, 111020, 2400709),
    (1110, 111021, 2400800),
    (1110, 111022, 2400853),
    (1110, 111023, 2400854),
    (1110, 111024, 2400855),
    (1011, 2101217, 2101217),
    (1011, 2101218, 2101218),
    (1011, 2101257, 2101257),
    (1011, 2101278, 2101278),
    (1011, 2101279, 2101279),
    (1011, 2101306, 2101306),
    (1011, 2101343, 2101343),
    (1011, 2101349, 2101343),
    (1011, 2101350, 2101350),
    (1011, 2101415, 2101415),
    (1011, 2101416, 2101416),
    (1011, 2101600, 2101600),
    (1011, 2101601, 2101601),
    (1111, 2406034, 2406034),
    (1111, 2406035, 2406035),
    (1111, 2406071, 2406071),
    (1111, 2406093, 2406093),
    (1111, 2406094, 2406094),
    (1111, 2406129, 2406129),
    (1111, 2406131, 2406131),
    (1111, 2406132, 2406132),
    (1111, 2406181, 2406181),
    (1111, 2406182, 2406182),
    (1111, 2406990, 2406990),
    (1111, 2406991, 2406991),
    (20, 2001, 2600068),
    (20, 2002, 2600089),
    (20, 2003, 2600084),
    (20, 2004, 2600093),
    (20, 2005, 2600094),
    (20, 2006, 2600096),
    (20, 2007, 2600097),
    (20, 2008, 2600098),
    (22, 2201, 2600150),
    (22, 2202, 2600520),
    (22, 2203, 2600521),
    (22, 2204, 2600156),
    (22, 2205, 2600522),
];

#[derive(Debug)]
pub struct FieldBossTimer {
    pub wire_code: u32,
    pub mob_code: u32,
    pub target_ms: u64,
}

#[derive(Debug)]
pub struct FieldBossTimerTable {
    pub map_id: u32,
    pub declared_entry_count: u8,
    pub timers: Vec<FieldBossTimer>,
}

pub struct FieldBossTimerParser;

pub(crate) fn parse_packet(context: &ParserContext<'_>, packet: &[u8]) -> bool {
    let Some(table) = FieldBossTimerParser::parse(packet, 2) else {
        context.logger.info(format!(
            "[{}] 0191 field boss timer packet could not be parsed packet_len={} packet_hex={}",
            context.port,
            packet.len(),
            bytes_to_hex(packet)
        ));
        return false;
    };

    // context.logger.info(format!(
    //     "[{}] 0191 field boss timer table map_id={} declared_entries={} parsed_entries={} packet_len={}",
    //     context.port,
    //     table.map_id,
    //     table.declared_entry_count,
    //     table.timers.len(),
    //     packet.len()
    // ));

    for timer in &table.timers {
        let remaining_ms = timer.target_ms.saturating_sub(current_timestamp_millis());
        context.logger.debug(format!(
            "[{}] 0191 field boss timer map_id={} wire_code={} mob_code={} target_ms={} remaining_ms={}",
            context.port,
            table.map_id,
            timer.wire_code,
            timer.mob_code,
            timer.target_ms,
            remaining_ms
        ));
    }

    if table.timers.is_empty() {
        context.logger.debug(format!(
            "[{}] 0191 field boss timer table contained no recognized timestamps packet_hex={}",
            context.port,
            bytes_to_hex(packet)
        ));
    } else {
        context.data_storage.replace_field_boss_timers(
            table.map_id,
            table
                .timers
                .iter()
                .map(|timer| (timer.mob_code, timer.target_ms)),
        );
        context.logger.debug(format!(
            "[{}] 0191 field boss timers stored map_id={} timer_count={}",
            context.port,
            table.map_id,
            table.timers.len()
        ));
    }

    true
}

impl FieldBossTimerParser {
    pub fn parse(packet: &[u8], body_start: usize) -> Option<FieldBossTimerTable> {
        Self::parse_at(packet, body_start, current_timestamp_millis())
    }

    fn parse_at(
        packet: &[u8],
        body_start: usize,
        arrived_at_ms: u64,
    ) -> Option<FieldBossTimerTable> {
        if body_start + 8 > packet.len() || packet[body_start] != 0 || packet[body_start + 1] != 0 {
            return None;
        }

        let map_id = read_u32_le(packet, body_start + 2)?;
        let declared_entry_count = packet[body_start + 6];
        let known_map = FIELD_BOSS_CODES
            .iter()
            .any(|(candidate_map_id, _, _)| *candidate_map_id == map_id);
        let mut found = BTreeMap::<u32, FieldBossTimer>::new();
        let mut offset = if known_map {
            body_start + 7
        } else {
            body_start
        };

        while offset < packet.len() {
            let wire = read_varint(packet, offset);
            if !wire.is_valid() {
                offset += 1;
                continue;
            }

            let Ok(wire_code) = u32::try_from(wire.value) else {
                offset += 1;
                continue;
            };
            let resolved = if known_map {
                resolve_wire_code(wire_code, Some(map_id))
            } else if (100_000..=9_999_999).contains(&wire_code) {
                resolve_wire_code(wire_code, None)
            } else {
                None
            };

            let Some(mob_code) = resolved else {
                offset += 1;
                continue;
            };
            let timestamp_start = offset + wire.length;
            let Some((target_ms, consumed)) =
                try_read_target(packet, timestamp_start, arrived_at_ms)
            else {
                offset = timestamp_start;
                continue;
            };

            found.entry(mob_code).or_insert(FieldBossTimer {
                wire_code,
                mob_code,
                target_ms,
            });
            offset = timestamp_start + consumed;
        }

        Some(FieldBossTimerTable {
            map_id,
            declared_entry_count,
            timers: found.into_values().collect(),
        })
    }
}

fn resolve_wire_code(wire_code: u32, map_id: Option<u32>) -> Option<u32> {
    FIELD_BOSS_CODES
        .iter()
        .find(|(candidate_map_id, candidate_wire_code, _)| {
            *candidate_wire_code == wire_code
                && map_id.is_none_or(|expected_map_id| *candidate_map_id == expected_map_id)
        })
        .map(|(_, _, mob_code)| *mob_code)
}

fn try_read_target(
    packet: &[u8],
    timestamp_start: usize,
    arrived_at_ms: u64,
) -> Option<(u64, usize)> {
    let earliest = arrived_at_ms.saturating_sub(TIMESTAMP_PAST_TOLERANCE_MS);
    let latest = arrived_at_ms.saturating_add(TIMESTAMP_FUTURE_LIMIT_MS);

    for gap in TIMESTAMP_GAPS {
        let offset = timestamp_start + gap;
        let Some(target_ms) = read_u64_le(packet, offset) else {
            break;
        };
        if (earliest..=latest).contains(&target_ms) {
            return Some((target_ms, gap + 8));
        }
    }

    None
}
