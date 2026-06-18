use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use serde_json::Value;

#[derive(Debug, Deserialize)]
struct BossIdsFile {
    boss_ids: Vec<u32>,
}

pub fn load_boss_ids() -> HashSet<u32> {
    serde_json::from_str::<BossIdsFile>(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/data/boss_ids.json"
    )))
    .map(|file| file.boss_ids.into_iter().collect())
    .unwrap_or_default()
}

pub fn load_healing_skill_codes() -> HashSet<u32> {
    serde_json::from_str::<HashMap<String, Value>>(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/data/healing_skill_code.json"
    )))
    .map(|map| {
        map.into_keys()
            .filter_map(|key| key.parse::<u32>().ok())
            .collect()
    })
    .unwrap_or_default()
}

pub fn load_npc_names() -> HashMap<u32, String> {
    serde_json::from_str::<HashMap<String, Value>>(include_str!(concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/data/npc_names_zh.json"
    )))
    .map(|map| {
        map.into_iter()
            .filter_map(|(key, value)| {
                let mob_code = key.parse::<u32>().ok()?;
                let name = value.get("name")?.as_str()?.to_string();
                Some((mob_code, name))
            })
            .collect()
    })
    .unwrap_or_default()
}
