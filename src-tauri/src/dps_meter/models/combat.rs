use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillStats {
    pub counts: u32,
    pub total_damage: u64,
    pub min_damage: u64,
    pub max_damage: u64,
    #[serde(default)]
    pub special_counts: HashMap<String, u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailPlayerInfo {
    pub server_id: u16,
    pub name: String,
    pub class_or_role: u32,
    pub level: u32,
    pub flag: u8,
    pub character_uid: u64,
    pub unknown_1: u32,
    pub item_level: u32,
    pub combat_power: u64,
    pub unknown_2: u64,
    pub unknown_3: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PvpWatchInfo {
    pub query_name: String,
    pub actor_id: Option<u32>,
    pub actor_name: Option<String>,
    pub server_id: Option<String>,
    pub actor_class: Option<String>,
    pub current_hp: Option<u32>,
    pub max_hp: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PvpKnownPlayer {
    pub actor_id: u32,
    pub actor_name: String,
    pub server_id: Option<String>,
    pub actor_class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PvpWatchInfoResponse {
    pub watch_info: Vec<PvpWatchInfo>,
    pub known_players: Vec<PvpKnownPlayer>,
    pub last_dealt_player: Option<PvpWatchInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerHpInfo {
    pub actor_id: u32,
    pub current_hp: u32,
    pub max_observed_hp: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UseBuff {
    pub target_id: u32,
    pub actor_id: u32,
    pub skill_code: u32,
    pub server_start_ms: u64,
    pub local_start_ms: u64,
    pub local_end_ms: u64,
    pub duration_ms: u64,
    pub latency_ms: i64,
}

impl SkillStats {
    pub fn new() -> Self {
        Self {
            counts: 0,
            total_damage: 0,
            min_damage: u64::MAX,
            max_damage: 0,
            special_counts: HashMap::new(),
        }
    }
}

impl Default for SkillStats {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorInfo {
    pub id: u32,
    pub actor_name: Option<String>,
    pub actor_server_id: Option<String>,
    pub actor_class: Option<String>,
    pub actor_skill_spec: HashMap<u32, Vec<u32>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    pub id: u32,
    pub target_mob_code: Option<u32>,
    pub target_name: Option<String>,
    pub is_boss: bool,
    pub current_hp: Option<u32>,
    pub max_hp: Option<u32>,
    pub target_start_time: HashMap<u32, f64>,
    pub target_last_time: HashMap<u32, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatInfos {
    pub actor_infos: HashMap<u32, ActorInfo>,
    pub target_infos: HashMap<u32, TargetInfo>,
    pub main_actor_id: Option<u32>,
    pub main_actor_name: Option<String>,
    pub last_target_by_main_actor: Option<u32>,
    pub last_target: Option<u32>,
    pub time_now: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerOverviewStat {
    pub actor_id: u32,
    pub actor_name: String,
    pub actor_server_id: String,
    pub actor_class: String,
    pub counts: u32,
    pub total_damage: u64,
    pub min_damage: u64,
    pub max_damage: u64,
    #[serde(default)]
    pub special_counts: HashMap<String, u32>,
    pub dps: f64,
    pub damage_share: f64,
    pub damage_contribution: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatSnapshot {
    pub total_damage: u64,
    pub by_target_player_skill_stats: HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    pub by_target_player_stats: HashMap<u32, HashMap<u32, PlayerOverviewStat>>,
    #[serde(default)]
    pub use_buffs_by_target: HashMap<u32, Vec<UseBuff>>,
    pub combat_infos: CombatInfos,
    pub last_target_info: Option<TargetInfo>,
    #[serde(default)]
    pub last_target_all_players_overview_stats: Vec<PlayerOverviewStat>,
    #[serde(default)]
    pub main_actor_received_player_overview_stats: Vec<PlayerOverviewStat>,
}
