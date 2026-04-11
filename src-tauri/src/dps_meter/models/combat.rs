use std::collections::HashMap;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillStats {
    pub counts: u32,
    pub total_damage: u64,
    pub min_damage: u64,
    pub max_damage: u64,
    #[serde(default)]
    pub special_counts: HashMap<String, u32>,
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
pub struct SkillRecord {
    pub time: f64,
    pub skill_code: u32,
    pub ori_skill_code: u32,
    pub skill_spec: Vec<u32>,
    pub damage: u64,
    pub multi_hit_damage: u64,
    pub special_counts: HashMap<String, u32>,
    pub dot: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActorInfo {
    pub id: u32,
    pub actor_name: Option<String>,
    pub actor_server_id: Option<String>,
    pub actor_class: Option<String>,
    pub actor_skill_spec: HashMap<u32, Vec<u32>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetInfo {
    pub id: u32,
    pub target_mob_code: Option<u32>,
    pub target_name: Option<String>,
    pub is_boss: bool,
    pub target_start_time: HashMap<u32, f64>,
    pub target_last_time: HashMap<u32, f64>,
}

#[derive(Debug, Clone, Serialize)]
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CombatSnapshot {
    pub total_damage: u64,
    pub by_target_player_skill_stats: HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    pub by_target_player_stats: HashMap<u32, HashMap<u32, SkillStats>>,
    pub by_target_player_skill_records: HashMap<u32, HashMap<u32, Vec<SkillRecord>>>,
    pub by_target_player_dps_curve: HashMap<u32, HashMap<u32, Vec<(f64, f64)>>>,
    pub combat_infos: CombatInfos,
}
