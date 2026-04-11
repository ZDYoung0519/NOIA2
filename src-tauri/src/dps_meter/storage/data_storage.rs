use std::collections::HashMap;
use std::sync::RwLock;

use crate::dps_meter::models::combat::{SkillRecord, SkillStats};
use crate::dps_meter::models::packet::ParsedDamagePacket;

#[derive(Debug, Default)]
struct DataStorageInner {
    dps_stats: HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    by_target_player_skill_records: HashMap<u32, HashMap<u32, Vec<SkillRecord>>>,
    actor_id_name_map: HashMap<u32, String>,
    actor_id_server_map: HashMap<u32, String>,
    actor_id_class_map: HashMap<u32, String>,
    actor_id_skill_spec_map: HashMap<u32, HashMap<u32, Vec<u32>>>,
    mob_id_code_map: HashMap<u32, u32>,
    mob_code_name_map: HashMap<u32, String>,
    summon_owner_map: HashMap<u32, u32>,
    start_time: Option<f64>,
    start_time_by_target: HashMap<u32, HashMap<u32, f64>>,
    last_time_by_target: HashMap<u32, HashMap<u32, f64>>,
    dot_skill_list: Vec<u32>,
    healing_skill_codes: Vec<u32>,
    boss_code_list: Vec<u32>,
    main_actor_id: Option<u32>,
    main_actor_name: Option<String>,
    last_target: Option<u32>,
    last_target_by_main_actor: Option<u32>,
}

#[derive(Debug, Default)]
pub struct DataStorage {
    inner: RwLock<DataStorageInner>,
}

impl DataStorage {
    pub fn new() -> Self {
        let mut inner = DataStorageInner::default();
        inner.healing_skill_codes = vec![17000001];
        inner.boss_code_list = vec![900001];
        inner
            .mob_code_name_map
            .insert(900001, "训练木桩".to_string());
        Self {
            inner: RwLock::new(inner),
        }
    }

    pub fn clear(&self) {
        let mut inner = self.inner.write().unwrap();
        let main_actor_id = inner.main_actor_id;
        let main_actor_name = inner.main_actor_name.clone();
        let actor_id_name_map = inner.actor_id_name_map.clone();
        let actor_id_server_map = inner.actor_id_server_map.clone();
        let mob_code_name_map = inner.mob_code_name_map.clone();
        let boss_code_list = inner.boss_code_list.clone();
        let healing_skill_codes = inner.healing_skill_codes.clone();

        *inner = DataStorageInner::default();
        inner.main_actor_id = main_actor_id;
        inner.main_actor_name = main_actor_name;
        inner.actor_id_name_map = actor_id_name_map;
        inner.actor_id_server_map = actor_id_server_map;
        inner.mob_code_name_map = mob_code_name_map;
        inner.boss_code_list = boss_code_list;
        inner.healing_skill_codes = healing_skill_codes;
    }

    pub fn append_damage(&self, packet: ParsedDamagePacket) {
        self.append_damage_at(packet, current_timestamp_seconds());
    }

    pub fn append_damage_at(&self, packet: ParsedDamagePacket, timestamp: f64) {
        let mut inner = self.inner.write().unwrap();

        if inner
            .healing_skill_codes
            .iter()
            .any(|skill_code| *skill_code == packet.skill_code)
        {
            return;
        }

        let mut actor_id = packet.actor_id;
        if let Some(owner_id) = inner.summon_owner_map.get(&actor_id) {
            actor_id = *owner_id;
        }

        if packet.is_dot && !inner.dot_skill_list.contains(&packet.skill_code) {
            inner.dot_skill_list.push(packet.skill_code);
        }

        if inner.start_time.is_none() {
            inner.start_time = Some(timestamp);
        }

        if let Some(actor_class) = infer_actor_class(packet.skill_code) {
            inner.actor_id_class_map.insert(actor_id, actor_class);
        }

        let skill_spec = inner
            .actor_id_skill_spec_map
            .entry(actor_id)
            .or_default()
            .entry(packet.skill_code)
            .or_insert_with(|| infer_specialty_slots(packet.ori_skill_code))
            .clone();

        inner
            .start_time_by_target
            .entry(packet.target_id)
            .or_default()
            .entry(actor_id)
            .or_insert(timestamp);
        inner
            .last_time_by_target
            .entry(packet.target_id)
            .or_default()
            .insert(actor_id, timestamp);

        let mut special_counts = HashMap::new();
        for special in &packet.specials {
            *special_counts.entry(special.clone()).or_insert(0) += 1;
        }
        if packet.is_crit {
            *special_counts.entry("CRITICAL".to_string()).or_insert(0) += 1;
        }
        if packet.multi_hit_count > 0 {
            special_counts.insert("MULTIHIT".to_string(), 1);
            special_counts.insert(format!("MULTIHIT{}", packet.multi_hit_count), 1);
        } else {
            special_counts.insert("MULTIHIT".to_string(), 0);
        }
        special_counts.insert("MULTIHITDMG".to_string(), packet.multi_hit_damage as u32);

        let total_damage = packet.damage + packet.multi_hit_damage;

        let skill_stats = inner
            .dps_stats
            .entry(packet.target_id)
            .or_default()
            .entry(actor_id)
            .or_default()
            .entry(packet.skill_code)
            .or_insert_with(SkillStats::new);

        skill_stats.counts += 1;
        skill_stats.total_damage += total_damage;
        skill_stats.max_damage = skill_stats.max_damage.max(total_damage);
        skill_stats.min_damage = skill_stats.min_damage.min(total_damage);
        for (special_name, count) in &special_counts {
            *skill_stats
                .special_counts
                .entry(special_name.clone())
                .or_insert(0) += count;
        }

        inner
            .by_target_player_skill_records
            .entry(packet.target_id)
            .or_default()
            .entry(actor_id)
            .or_default()
            .push(SkillRecord {
                time: timestamp,
                skill_code: packet.skill_code,
                ori_skill_code: packet.ori_skill_code,
                skill_spec,
                damage: total_damage,
                multi_hit_damage: packet.multi_hit_damage,
                special_counts,
                dot: packet.is_dot,
            });

        if actor_id != packet.target_id {
            inner.last_target = Some(packet.target_id);
            if inner.main_actor_id == Some(actor_id) {
                inner.last_target_by_main_actor = Some(packet.target_id);
            }
        }
    }

    pub fn append_actor(&self, actor_id: u32, actor_name: &str, sid: Option<&str>) {
        let mut inner = self.inner.write().unwrap();
        inner
            .actor_id_name_map
            .insert(actor_id, actor_name.to_string());
        if let Some(sid) = sid {
            inner.actor_id_server_map.insert(actor_id, sid.to_string());
        }
    }

    pub fn append_mob(&self, target_id: u32, mob_code: u32) {
        let mut inner = self.inner.write().unwrap();
        inner.mob_id_code_map.insert(target_id, mob_code);
    }

    #[allow(dead_code)]
    pub fn append_summon(&self, owner_id: u32, summon_id: u32) {
        let mut inner = self.inner.write().unwrap();
        inner.summon_owner_map.insert(summon_id, owner_id);
    }

    pub fn set_main_actor(&self, actor_id: u32, actor_name: &str) {
        let mut inner = self.inner.write().unwrap();
        inner.main_actor_id = Some(actor_id);
        inner.main_actor_name = Some(actor_name.to_string());
    }

    pub fn get_dps_stats_snapshot(&self) -> HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>> {
        self.inner.read().unwrap().dps_stats.clone()
    }

    pub fn get_skill_records_snapshot(&self) -> HashMap<u32, HashMap<u32, Vec<SkillRecord>>> {
        self.inner
            .read()
            .unwrap()
            .by_target_player_skill_records
            .clone()
    }

    pub fn actor_id_name_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_name_map.clone()
    }

    pub fn actor_id_server_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_server_map.clone()
    }

    pub fn actor_id_class_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_class_map.clone()
    }

    pub fn actor_skill_spec_snapshot(&self) -> HashMap<u32, HashMap<u32, Vec<u32>>> {
        self.inner.read().unwrap().actor_id_skill_spec_map.clone()
    }

    pub fn mob_id_code_snapshot(&self) -> HashMap<u32, u32> {
        self.inner.read().unwrap().mob_id_code_map.clone()
    }

    pub fn mob_code_name_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().mob_code_name_map.clone()
    }

    pub fn boss_code_list_snapshot(&self) -> Vec<u32> {
        self.inner.read().unwrap().boss_code_list.clone()
    }

    pub fn start_time_by_target_snapshot(&self) -> HashMap<u32, HashMap<u32, f64>> {
        self.inner.read().unwrap().start_time_by_target.clone()
    }

    pub fn last_time_by_target_snapshot(&self) -> HashMap<u32, HashMap<u32, f64>> {
        self.inner.read().unwrap().last_time_by_target.clone()
    }

    pub fn start_time(&self) -> Option<f64> {
        self.inner.read().unwrap().start_time
    }

    pub fn main_actor_id(&self) -> Option<u32> {
        self.inner.read().unwrap().main_actor_id
    }

    pub fn main_actor_name(&self) -> Option<String> {
        self.inner.read().unwrap().main_actor_name.clone()
    }

    pub fn last_target(&self) -> Option<u32> {
        self.inner.read().unwrap().last_target
    }

    pub fn last_target_by_main_actor(&self) -> Option<u32> {
        self.inner.read().unwrap().last_target_by_main_actor
    }
}

fn infer_actor_class(skill_code: u32) -> Option<String> {
    let skill_code = skill_code.to_string();
    if skill_code.len() < 2 {
        return None;
    }

    match &skill_code[0..2] {
        "11" => Some("GLADIATOR".to_string()),
        "12" => Some("TEMPLAR".to_string()),
        "13" => Some("ASSASSIN".to_string()),
        "14" => Some("RANGER".to_string()),
        "15" => Some("SORCERER".to_string()),
        "16" => Some("ELEMENTALIST".to_string()),
        "17" => Some("CLERIC".to_string()),
        "18" => Some("CHANTER".to_string()),
        _ => None,
    }
}

fn infer_specialty_slots(skill_id: u32) -> Vec<u32> {
    let last_4_digits = skill_id % 10000;
    let slot_1 = (last_4_digits / 1000) % 10;
    let slot_2 = (last_4_digits / 100) % 10;
    let slot_3 = (last_4_digits / 10) % 10;

    let mut slots = Vec::new();
    if slot_1 > 0 {
        slots.push(slot_1);
    }
    if slot_2 > 0 {
        slots.push(slot_2);
    }
    if slot_3 > 0 {
        slots.push(slot_3);
    }
    slots.sort_unstable();
    slots
}

fn current_timestamp_seconds() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or_default()
}
