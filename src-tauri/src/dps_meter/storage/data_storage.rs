use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::Hash;
use std::sync::RwLock;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::dps_meter::config::{SharedDpsMeterConfig, TRAINING_DUMMY_MOB_CODE};
use crate::dps_meter::models::combat::{SkillRecord, SkillStats};
use crate::dps_meter::models::packet::ParsedDamagePacket;
use crate::dps_meter::storage::loaders::{load_boss_ids, load_healing_skill_codes, load_npc_names};

const ACTOR_METADATA_CAPACITY: usize = 2_000;
const MOB_METADATA_CAPACITY: usize = 5_000;
const SUMMON_METADATA_CAPACITY: usize = 5_000;
const ACTOR_CLASS_SKILL_IGNORE_LIST: [&str; 1] = ["11340000"];

#[derive(Debug, Clone)]
struct BoundedMap<K, V> {
    map: HashMap<K, V>,
    order: VecDeque<K>,
    capacity: usize,
}

impl<K, V> BoundedMap<K, V>
where
    K: Eq + Hash + Clone,
{
    fn new(capacity: usize) -> Self {
        Self {
            map: HashMap::new(),
            order: VecDeque::new(),
            capacity,
        }
    }

    fn insert(&mut self, key: K, value: V) -> Option<V> {
        self.order.retain(|existing| existing != &key);
        self.order.push_back(key.clone());
        let previous = self.map.insert(key, value);
        self.evict_oldest();
        previous
    }

    fn get(&self, key: &K) -> Option<&V> {
        self.map.get(key)
    }

    fn get_mut_or_insert_with<F>(&mut self, key: K, default: F) -> &mut V
    where
        F: FnOnce() -> V,
    {
        if self.map.contains_key(&key) {
            self.order.retain(|existing| existing != &key);
            self.order.push_back(key.clone());
        } else {
            self.order.push_back(key.clone());
            self.map.insert(key.clone(), default());
            self.evict_oldest();
        }

        self.map
            .get_mut(&key)
            .expect("bounded map entry must exist after insert")
    }

    fn contains_key(&self, key: &K) -> bool {
        self.map.contains_key(key)
    }

    fn as_hash_map(&self) -> HashMap<K, V>
    where
        V: Clone,
    {
        self.map.clone()
    }

    fn evict_oldest(&mut self) {
        while self.map.len() > self.capacity {
            let Some(oldest_key) = self.order.pop_front() else {
                break;
            };
            self.map.remove(&oldest_key);
        }
    }
}

#[derive(Debug)]
struct DataStorageInner {
    dps_stats: HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    by_target_player_skill_records: HashMap<u32, HashMap<u32, Vec<SkillRecord>>>,
    actor_id_name_map: BoundedMap<u32, String>,
    actor_id_server_map: BoundedMap<u32, String>,
    actor_id_class_map: BoundedMap<u32, String>,
    actor_id_skill_spec_map: BoundedMap<u32, HashMap<u32, Vec<u32>>>,
    mob_id_code_map: BoundedMap<u32, u32>,
    summon_owner_map: BoundedMap<u32, u32>,
    start_time: Option<f64>,
    start_time_by_target: HashMap<u32, HashMap<u32, f64>>,
    last_time_by_target: HashMap<u32, HashMap<u32, f64>>,
    dot_skill_list: Vec<u32>,
    main_actor_id: Option<u32>,
    main_actor_name: Option<String>,
    last_target: Option<u32>,
    last_target_by_main_actor: Option<u32>,
}

impl Default for DataStorageInner {
    fn default() -> Self {
        Self {
            dps_stats: HashMap::new(),
            by_target_player_skill_records: HashMap::new(),
            actor_id_name_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            actor_id_server_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            actor_id_class_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            actor_id_skill_spec_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            mob_id_code_map: BoundedMap::new(MOB_METADATA_CAPACITY),
            summon_owner_map: BoundedMap::new(SUMMON_METADATA_CAPACITY),
            start_time: None,
            start_time_by_target: HashMap::new(),
            last_time_by_target: HashMap::new(),
            dot_skill_list: Vec::new(),
            main_actor_id: None,
            main_actor_name: None,
            last_target: None,
            last_target_by_main_actor: None,
        }
    }
}

pub struct DataStorage {
    app: AppHandle,
    inner: RwLock<DataStorageInner>,
    config: SharedDpsMeterConfig,
    healing_skill_codes: HashSet<u32>,
    boss_code_list: HashSet<u32>,
    mob_code_name_map: HashMap<u32, String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MainActorDetectedPayload {
    pub actor_id: u32,
    pub actor_name: String,
    pub sid: Option<String>,
}

impl DataStorage {
    pub fn new(app: AppHandle, config: SharedDpsMeterConfig) -> Self {
        Self {
            app,
            inner: RwLock::new(DataStorageInner::default()),
            config,
            healing_skill_codes: load_healing_skill_codes(),
            boss_code_list: load_boss_ids(),
            mob_code_name_map: load_npc_names(),
        }
    }

    pub fn clear(&self) {
        let mut inner = self.inner.write().unwrap();
        let main_actor_id = inner.main_actor_id;
        let main_actor_name = inner.main_actor_name.clone();
        let actor_id_name_map = inner.actor_id_name_map.clone();
        let actor_id_server_map = inner.actor_id_server_map.clone();
        let actor_id_class_map = inner.actor_id_class_map.clone();
        let actor_id_skill_spec_map = inner.actor_id_skill_spec_map.clone();
        let mob_id_code_map = inner.mob_id_code_map.clone();
        let summon_owner_map = inner.summon_owner_map.clone();
        let dot_skill_list = inner.dot_skill_list.clone();        

        *inner = DataStorageInner::default();
        inner.main_actor_id = main_actor_id;
        inner.main_actor_name = main_actor_name;
        inner.actor_id_name_map = actor_id_name_map;
        inner.actor_id_server_map = actor_id_server_map;
        inner.actor_id_class_map = actor_id_class_map;
        inner.actor_id_skill_spec_map = actor_id_skill_spec_map;
        inner.mob_id_code_map = mob_id_code_map;
        inner.summon_owner_map = summon_owner_map;
        inner.dot_skill_list = dot_skill_list;
    }

    pub fn append_damage(&self, packet: ParsedDamagePacket) {
        self.append_damage_at(packet, current_timestamp_seconds());
    }

    pub fn append_damage_at(&self, packet: ParsedDamagePacket, timestamp: f64) {
        let config = self.config.read().unwrap().clone();
        let mut inner = self.inner.write().unwrap();

        if self.healing_skill_codes.contains(&packet.skill_code) {
            return;
        }

        // let actor_id = packet.actor_id;
        // 暂时不处理复制召唤链接，在前端获得dps snapshot后，聚合时会把复制召唤的伤害算到主人头上
        let mut actor_id = packet.actor_id;
        if let Some(owner_id) = inner.summon_owner_map.get(&actor_id) {
            actor_id = *owner_id;
        }

        let target_mob_code = inner.mob_id_code_map.get(&packet.target_id).copied();
        let is_target_boss = target_mob_code
            .map(|mob_code| self.boss_code_list.contains(&mob_code))
            .unwrap_or(false);

        if config.boss_only && !is_target_boss {
            return;
        }

        if config.my_muzhuang_only
            && target_mob_code == Some(TRAINING_DUMMY_MOB_CODE)
            && inner.main_actor_id != Some(actor_id)
        {
            return;
        }

        if packet.is_dot && !inner.dot_skill_list.contains(&packet.skill_code) {
            inner.dot_skill_list.push(packet.skill_code);
        }

        if let Some(actor_class) = infer_actor_class(packet.skill_code) {
            inner.actor_id_class_map.insert(actor_id, actor_class);
        }

        if inner.start_time.is_none() {
            inner.start_time = Some(timestamp);
        }

        let skill_spec = inner
            .actor_id_skill_spec_map
            .get_mut_or_insert_with(actor_id, HashMap::new)
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
        inner.summon_owner_map.remove(&actor_id);
    }

    pub fn append_mob(&self, target_id: u32, mob_code: u32) {
        let mut inner = self.inner.write().unwrap();
        inner.mob_id_code_map.insert(target_id, mob_code);
    }

    pub fn append_summon(&self, owner_id: u32, summon_id: u32) {
        let mut inner = self.inner.write().unwrap();
        if inner.actor_id_name_map.contains_key(&summon_id) {
            return;
        }
        inner.summon_owner_map.insert(summon_id, owner_id);
    }

    pub fn has_summon_owner(&self, summon_id: u32) -> bool {
        self.inner
            .read()
            .unwrap()
            .summon_owner_map
            .contains_key(&summon_id)
    }

    pub fn has_mob(&self, actor_id: u32) -> bool {
        self.inner.read().unwrap().mob_id_code_map.contains_key(&actor_id)
    }

    pub fn set_main_actor(&self, actor_id: u32, actor_name: &str) {
        let mut inner = self.inner.write().unwrap();
        inner.main_actor_id = Some(actor_id);
        inner.main_actor_name = Some(actor_name.to_string());
        let sid = inner.actor_id_server_map.get(&actor_id).cloned();

        let _ = self.app.emit(
            "dps-main-actor-detected",
            MainActorDetectedPayload {
                actor_id,
                actor_name: actor_name.to_string(),
                sid,
            },
        );

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
        self.inner.read().unwrap().actor_id_name_map.as_hash_map()
    }

    pub fn actor_id_server_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_server_map.as_hash_map()
    }

    pub fn actor_id_class_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_class_map.as_hash_map()
    }

    pub fn actor_skill_spec_snapshot(&self) -> HashMap<u32, HashMap<u32, Vec<u32>>> {
        self.inner.read().unwrap().actor_id_skill_spec_map.as_hash_map()
    }

    pub fn summon_owner_snapshot(&self) -> HashMap<u32, u32> {
        self.inner.read().unwrap().summon_owner_map.as_hash_map()
    }

    pub fn mob_id_code_snapshot(&self) -> HashMap<u32, u32> {
        self.inner.read().unwrap().mob_id_code_map.as_hash_map()
    }

    pub fn mob_code_name_snapshot(&self) -> HashMap<u32, String> {
        self.mob_code_name_map.clone()
    }

    pub fn boss_code_list_snapshot(&self) -> Vec<u32> {
        self.boss_code_list.iter().copied().collect()
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

fn infer_actor_class(skill_code: u32) -> Option<String> {
    let skill_code = skill_code.to_string();
    if skill_code.len() < 2 {
        return None;
    }
    if ACTOR_CLASS_SKILL_IGNORE_LIST.contains(&skill_code.as_str()) {
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

fn current_timestamp_seconds() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or_default()
}
