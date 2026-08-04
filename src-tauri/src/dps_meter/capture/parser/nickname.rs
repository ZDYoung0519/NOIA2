use super::context::ParserContext;
use super::utils::{bytes_to_hex, find_bytes, last_index_of, read_u32_le, read_varint};

const COMBAT_POWER_MARKER: [u8; 3] = [0xF4, 0xCB, 0x1F];

pub(crate) fn parse_main(
    context: &ParserContext<'_>,
    payload: &[u8],
    _is_compressed_bundle: bool,
) -> bool {
    parse_main_fixed(context, payload)
}

pub(crate) fn parse_main_combat_power(
    context: &ParserContext<'_>,
    payload: &[u8],
    _is_compressed_bundle: bool,
) -> bool {
    if payload.len() < 6 || payload[0] != 0x56 || payload[1] != 0x36 {
        return false;
    }

    let combat_power = u64::from(read_u32_le(payload, 2).unwrap_or_default());
    if !context
        .data_storage
        .save_main_actor_combat_power(combat_power)
    {
        return false;
    }

    context.logger.info(format!(
        "[{}] main actor combat power combat_power={combat_power}",
        context.port
    ));
    true
}

// 33 36 <actor_id> <five metadata bytes> <name_len> <name> <sid>
fn parse_main_fixed(context: &ParserContext<'_>, payload: &[u8]) -> bool {
    let actor_id_info = read_varint(payload, 2);
    if !actor_id_info.is_valid() || actor_id_info.value <= 0 {
        return false;
    }

    let structure_start = 2 + actor_id_info.length;
    if structure_start + 6 > payload.len() {
        return false;
    }

    let name_len = usize::from(payload[structure_start + 5]);
    if !(1..=36).contains(&name_len) {
        return false;
    }

    let name_start = structure_start + 6;
    let name_end = name_start + name_len;
    if name_end + 2 > payload.len() {
        return false;
    }

    let server_id = u32::from(u16::from_le_bytes([
        payload[name_end],
        payload[name_end + 1],
    ]));
    if !is_available_server_id(server_id) {
        return false;
    }

    let Ok(name) = std::str::from_utf8(&payload[name_start..name_end]) else {
        return false;
    };
    let Some(name) = sanitize_nickname(name) else {
        return false;
    };

    let name_hex = bytes_to_hex(&payload[name_start..name_end]);
    let job = payload.get(name_end + 2).copied();
    let job_text = job
        .map(|value| value.to_string())
        .unwrap_or_else(|| "none".to_string());
    let actor_class = job.and_then(job_to_actor_class);
    let actor_id = actor_id_info.value as u32;
    context
        .data_storage
        .append_actor(actor_id, &name, Some(&server_id.to_string()));
    if let Some(actor_class) = actor_class {
        context.data_storage.set_actor_class(actor_id, actor_class);
    }
    context.logger.info(format!(
        "[{}] main actor actor={} name={} name_hex={} sid={} job={} class={}",
        context.port,
        actor_id_info.value,
        name,
        name_hex,
        server_id,
        job_text,
        actor_class.unwrap_or("none")
    ));
    context.data_storage.set_main_actor(actor_id, &name);
    true
}

pub(crate) fn parse_other(
    context: &ParserContext<'_>,
    payload: &[u8],
    _is_compressed_bundle: bool,
) -> bool {
    let actor_id_info = read_varint(payload, 2);
    if !actor_id_info.is_valid() || actor_id_info.value <= 0 {
        return false;
    }

    let actor_id = actor_id_info.value as u32;
    let mut offset = 2 + actor_id_info.length;
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
    let mut best_actor_name = None;
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
    let server_id = find_server_id(payload, server_base);
    let combat_power = parse_snapshot_combat_power(payload);

    let server_id_string = server_id.map(|value| value.to_string());
    let server_id_text = server_id_string.as_deref().unwrap_or("none");
    context
        .data_storage
        .append_actor(actor_id, &actor_name, server_id_string.as_deref());
    if let Some(actor_class) = actor_class {
        context.data_storage.set_actor_class(actor_id, actor_class);
    }
    if let Some(combat_power) = combat_power {
        context
            .data_storage
            .set_actor_combat_power(actor_id, combat_power);
    }
    context.logger.info(format!(
        "[{}] actor actor={} name={} sid={} job={} class={} combat_power={}",
        context.port,
        actor_id,
        actor_name,
        server_id_text,
        job,
        actor_class.unwrap_or("none"),
        combat_power
            .map(|value| value.to_string())
            .unwrap_or_else(|| "none".to_string())
    ));

    true
}

fn parse_snapshot_combat_power(packet: &[u8]) -> Option<u64> {
    let marker_index = last_index_of(packet, &COMBAT_POWER_MARKER)?;
    let mut offset = marker_index + 11;

    while offset + 8 <= packet.len() {
        let combat_power = u64::from(read_u32_le(packet, offset)?);
        let trailing_zero = read_u32_le(packet, offset + 4)? == 0;
        if (1..=10_000_000).contains(&combat_power) && trailing_zero {
            return Some(combat_power);
        }
        offset += 1;
    }

    None
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

fn find_server_id(payload: &[u8], server_base: usize) -> Option<u32> {
    let mut relative = 0usize;
    let mut fallback_server_id = None;

    loop {
        let offset = server_base + relative;
        relative += 1;
        if offset + 2 > payload.len() {
            break;
        }

        let server_id = u32::from(u16::from_le_bytes([payload[offset], payload[offset + 1]]));
        if !is_available_server_id(server_id) {
            continue;
        }
        if fallback_server_id.is_none() {
            fallback_server_id = Some(server_id);
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
            return Some(server_id);
        }

        let Ok(legion_name) = std::str::from_utf8(&payload[legion_start..legion_end]) else {
            continue;
        };
        if legion_name.trim().is_empty() || legion_name.chars().any(|ch| !ch.is_ascii_digit()) {
            return Some(server_id);
        }
    }

    fallback_server_id.or_else(|| find_server_id_after_marker(payload, server_base))
}

fn is_available_server_id(server_id: u32) -> bool {
    (1001..=1021).contains(&server_id) || (2001..=2021).contains(&server_id)
}

fn find_server_id_after_marker(payload: &[u8], search_start: usize) -> Option<u32> {
    let search_end = payload.len().saturating_sub(1).min(search_start + 200);
    let mut position = search_start;

    while position < search_end {
        let Some(index) = find_bytes(payload, position, &[0x11, 0x11]) else {
            break;
        };
        if index < 4 {
            break;
        }
        if payload[index - 4] == 0x00 && payload[index - 3] == 0x02 {
            let server_id = u32::from(u16::from_le_bytes([payload[index - 3], payload[index - 2]]));
            if is_available_server_id(server_id) {
                return Some(server_id);
            }
        }
        position = index + 2;
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
    for character in sanitized.chars() {
        let code = character as u32;
        if code < 32 || code == 127 || (0x80..=0x9F).contains(&code) || character == '\u{FFFD}' {
            continue;
        }

        let is_han = is_han_character(character);
        if character.is_alphanumeric() || is_han {
            result.push(character);
            if character.is_alphabetic() || is_han {
                only_numbers = false;
            }
        }
    }

    if result.is_empty() || only_numbers {
        return None;
    }
    if result.chars().count() == 1 {
        let character = result.chars().next()?;
        if !is_han_character(character) && !is_hangul_syllable(character) {
            return None;
        }
    }

    Some(result)
}

fn is_hangul_syllable(character: char) -> bool {
    matches!(character as u32, 0xAC00..=0xD7A3)
}

fn is_han_character(character: char) -> bool {
    let code = character as u32;
    matches!(
        code,
        0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0x20000..=0x2A6DF
            | 0x2A700..=0x2B73F
            | 0x2B740..=0x2B81F
            | 0x2B820..=0x2CEAF
            | 0x2CEB0..=0x2EBEF
            | 0x2F800..=0x2FA1F
            | 0x30000..=0x3134F
            | 0x31350..=0x323AF
    )
}

#[cfg(test)]
mod tests {
    use super::sanitize_nickname;

    #[test]
    fn sanitize_nickname_keeps_single_cjk_extension_character() {
        assert_eq!(sanitize_nickname("𠮷"), Some("𠮷".to_string()));
        assert_eq!(sanitize_nickname("𫠜"), Some("𫠜".to_string()));
    }

    #[test]
    fn sanitize_nickname_still_rejects_single_ascii_letter() {
        assert_eq!(sanitize_nickname("A"), None);
    }
}
