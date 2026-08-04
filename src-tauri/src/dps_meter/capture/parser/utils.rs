use std::time::{SystemTime, UNIX_EPOCH};

use crate::dps_meter::models::packet::VarIntOutput;

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

pub fn read_u32_le(data: &[u8], offset: usize) -> Option<u32> {
    let bytes = data.get(offset..offset + 4)?;
    Some(u32::from_le_bytes(bytes.try_into().ok()?))
}

pub fn read_u64_le(data: &[u8], offset: usize) -> Option<u64> {
    let bytes = data.get(offset..offset + 8)?;
    Some(u64::from_le_bytes(bytes.try_into().ok()?))
}

pub fn read_u32_le_or_default(data: &[u8], offset: usize) -> u32 {
    read_u32_le(data, offset).unwrap_or_default()
}

pub fn read_u64_le_or_default(data: &[u8], offset: usize) -> u64 {
    read_u64_le(data, offset).unwrap_or_default()
}

pub fn find_bytes(haystack: &[u8], start: usize, needle: &[u8]) -> Option<usize> {
    haystack
        .get(start..)
        .and_then(|slice| {
            slice
                .windows(needle.len())
                .position(|window| window == needle)
        })
        .map(|position| start + position)
}

pub fn last_index_of(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }

    haystack
        .windows(needle.len())
        .rposition(|window| window == needle)
}

pub fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
