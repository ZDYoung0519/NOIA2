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

pub fn current_timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
