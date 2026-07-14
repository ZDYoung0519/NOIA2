use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::Hash;
use std::sync::{Mutex, RwLock};

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::dps_meter::config::{SharedDpsMeterConfig, TRAINING_DUMMY_MOB_CODE};
use crate::dps_meter::models::combat::{
    BuffInterval, BuffSummary, PlayerHpInfo, PvpCombatStats, PvpCombatStatsRow,
    PvpKnownPlayer, PvpWatchInfo, PvpWatchInfoResponse, SkillStats,
};
use crate::dps_meter::models::packet::ParsedDamagePacket;
use crate::dps_meter::storage::loaders::{
    load_boss_ids, load_buff_templates, load_healing_skill_codes, load_npc_names, BuffTemplates,
};

const ACTOR_METADATA_CAPACITY: usize = 2_000;
const MOB_METADATA_CAPACITY: usize = 5_000;
const SUMMON_METADATA_CAPACITY: usize = 5_000;

const BUFF_TARGET_CAPACITY: usize = 1_024;
const BUFF_INTERVALS_PER_SKILL_CAPACITY: usize = 1_024;
const BUFF_INTERVAL_MERGE_TOLERANCE_MS: u64 = 100;

const ACTOR_CLASS_SKILL_IGNORE_LIST: [&str; 2] = ["1134", "1740"];
const FIGHTER_SKILLID_MAP: &[(u32, u32)] = &[
    (19_080_000, 19_070_000), // 疾风击[暴走] -> 疾风击
    (19_100_000, 19_090_000), // 地面强击[暴走] -> 地面强击
    (19_120_000, 19_110_000), // 不知道叫啥的技能[暴走] -> 不知道叫啥的技能
    (19_150_000, 19_160_000), // 升天拳[暴走] -> 升天拳
    (19_180_000, 19_170_000), // 回旋脚[暴走] -> 回旋脚
    (19_190_000, 19_200_000), // 爆裂拳[暴走] -> 爆裂拳
    (19_260_000, 19_250_000), // 台风连击[暴走] -> 台风连击
    (19_430_000, 19_420_000), // 连环拳[暴走] -> 连环拳
    (19_470_000, 19_460_000), // 瞬步[暴走] -> 瞬步
    (19_510_000, 19_010_000), // 连攻[暴走] -> 连攻
    (19_520_000, 19_020_000), // 重击[暴走] -> 重击
    (19_530_000, 19_030_000), // 重锤[暴走] -> 重锤
    (19_540_000, 19_040_000), // 飞脚[暴走] -> 飞脚
    (19_550_000, 19_050_000), // 升降拳[暴走] -> 升降拳
    (19_560_000, 19_060_000), // 冲拳[暴走] -> 冲拳
];

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
    actor_id_name_map: BoundedMap<u32, String>,
    actor_id_server_map: BoundedMap<u32, String>,
    actor_id_class_map: BoundedMap<u32, String>,
    actor_id_combat_power_map: BoundedMap<u32, u64>,
    actor_id_skill_spec_map: BoundedMap<u32, HashMap<u32, Vec<u32>>>,
    mob_id_code_map: BoundedMap<u32, u32>,
    mob_id_hp_map: BoundedMap<u32, (u32, u32)>,
    player_hp_map: BoundedMap<u32, PlayerHpInfo>,
    use_buffs_by_target: BoundedMap<u32, HashMap<u32, HashMap<u32, VecDeque<BuffInterval>>>>,
    possible_boss_codes: HashSet<u32>,
    summon_owner_map: BoundedMap<u32, u32>,
    start_time: Option<f64>,
    start_time_by_target: HashMap<u32, HashMap<u32, f64>>,
    last_time_by_target: HashMap<u32, HashMap<u32, f64>>,
    dot_skill_list: Vec<u32>,
    main_actor_id: Option<u32>,
    main_actor_name: Option<String>,
    main_actor_combat_power: Option<u64>,
    last_target: Option<u32>,
    last_target_by_main_actor: Option<u32>,
    last_player_target_by_main_actor: Option<u32>,
    pvp_attackers_by_target: HashMap<u32, HashMap<PvpPlayerKey, u64>>,
    pvp_last_attacker_by_target: HashMap<u32, PvpPlayerKey>,
    pvp_combat_stats: HashMap<PvpPlayerKey, PvpCombatStats>,
    pvp_dead_players: HashSet<PvpPlayerKey>,
}

#[derive(Debug, Clone, Hash, PartialEq, Eq)]
struct PvpPlayerKey {
    name: String,
    server_id: String,
}

impl Default for DataStorageInner {
    fn default() -> Self {
        Self {
            dps_stats: HashMap::new(),
            actor_id_name_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            actor_id_server_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            actor_id_class_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            actor_id_combat_power_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            actor_id_skill_spec_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            mob_id_code_map: BoundedMap::new(MOB_METADATA_CAPACITY),
            mob_id_hp_map: BoundedMap::new(MOB_METADATA_CAPACITY),
            player_hp_map: BoundedMap::new(ACTOR_METADATA_CAPACITY),
            use_buffs_by_target: BoundedMap::new(BUFF_TARGET_CAPACITY),
            possible_boss_codes: HashSet::new(),
            summon_owner_map: BoundedMap::new(SUMMON_METADATA_CAPACITY),
            start_time: None,
            start_time_by_target: HashMap::new(),
            last_time_by_target: HashMap::new(),
            dot_skill_list: Vec::new(),
            main_actor_id: None,
            main_actor_name: None,
            main_actor_combat_power: None,
            last_target: None,
            last_target_by_main_actor: None,
            last_player_target_by_main_actor: None,
            pvp_attackers_by_target: HashMap::new(),
            pvp_last_attacker_by_target: HashMap::new(),
            pvp_combat_stats: HashMap::new(),
            pvp_dead_players: HashSet::new(),
        }
    }
}

pub type MainActorCallback = dyn Fn(u32, &str, Option<String>) + Send + Sync;

pub struct DataStorage {
    app: AppHandle,
    inner: RwLock<DataStorageInner>,
    config: SharedDpsMeterConfig,
    healing_skill_codes: HashSet<u32>,
    boss_code_list: HashSet<u32>,
    mob_code_name_map: HashMap<u32, String>,
    buff_templates: BuffTemplates,
    pub main_actor_callback: Mutex<Option<Box<MainActorCallback>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MainActorDetectedPayload {
    pub actor_id: u32,
    pub actor_name: String,
    pub sid: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BuffOverlayContext {
    pub actor_class: Option<String>,
    pub self_buff_candidate_skill_codes: Vec<u32>,
    pub self_buff_candidate_skill_codes_by_class: HashMap<String, Vec<u32>>,
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
            buff_templates: load_buff_templates(),
            main_actor_callback: Mutex::new(None),
        }
    }

    pub fn clear(&self) {
        let mut inner = self.inner.write().unwrap();
        let main_actor_id = inner.main_actor_id;
        let main_actor_name = inner.main_actor_name.clone();
        let main_actor_combat_power = inner.main_actor_combat_power;
        let actor_id_name_map = inner.actor_id_name_map.clone();
        let actor_id_server_map = inner.actor_id_server_map.clone();
        let actor_id_class_map = inner.actor_id_class_map.clone();
        let actor_id_combat_power_map = inner.actor_id_combat_power_map.clone();
        let actor_id_skill_spec_map = inner.actor_id_skill_spec_map.clone();

        let mob_id_code_map = inner.mob_id_code_map.clone();
        let mob_id_hp_map = inner.mob_id_hp_map.clone();
        let player_hp_map = inner.player_hp_map.clone();
        let pvp_attackers_by_target = inner.pvp_attackers_by_target.clone();
        let pvp_last_attacker_by_target = inner.pvp_last_attacker_by_target.clone();
        let pvp_combat_stats = inner.pvp_combat_stats.clone();
        let pvp_dead_players = inner.pvp_dead_players.clone();
        // let summon_owner_map = inner.summon_owner_map.clone();
        let dot_skill_list = inner.dot_skill_list.clone();

        *inner = DataStorageInner::default();
        inner.main_actor_id = main_actor_id;
        inner.main_actor_name = main_actor_name;
        inner.main_actor_combat_power = main_actor_combat_power;
        inner.actor_id_name_map = actor_id_name_map;
        inner.actor_id_server_map = actor_id_server_map;
        inner.actor_id_class_map = actor_id_class_map;
        inner.actor_id_combat_power_map = actor_id_combat_power_map;
        inner.actor_id_skill_spec_map = actor_id_skill_spec_map;

        inner.mob_id_code_map = mob_id_code_map;
        inner.mob_id_hp_map = mob_id_hp_map;
        inner.player_hp_map = player_hp_map;
        inner.pvp_attackers_by_target = pvp_attackers_by_target;
        inner.pvp_last_attacker_by_target = pvp_last_attacker_by_target;
        inner.pvp_combat_stats = pvp_combat_stats;
        inner.pvp_dead_players = pvp_dead_players;
        // inner.summon_owner_map = summon_owner_map;
        inner.dot_skill_list = dot_skill_list;
    }

    pub fn append_damage(&self, packet: ParsedDamagePacket) {
        self.append_damage_at(packet, current_timestamp_seconds());
    }

    pub fn save_buff(
        &self,
        target_id: u32,
        actor_id: u32,
        skill_code: u32,
        _server_start_ms: u64,
        duration_ms: u64,
    ) -> BuffSummary {
        let local_start_ms = current_timestamp_millis();
        let local_end_ms = local_start_ms.saturating_add(duration_ms);
        let skill_shortcode = first_four_digits(skill_code);
        let config = self.config.read().unwrap().clone();

        let (should_emit_self_buff, should_emit_boss_debuff) = {
            let mut inner = self.inner.write().unwrap();
            {
                let skill_intervals = inner
                    .use_buffs_by_target
                    .get_mut_or_insert_with(target_id, HashMap::new)
                    .entry(actor_id)
                    .or_default()
                    .entry(skill_code)
                    .or_default();
                if let Some(last_interval) = skill_intervals.back_mut() {
                    if local_start_ms
                        <= last_interval
                            .end_ms
                            .saturating_add(BUFF_INTERVAL_MERGE_TOLERANCE_MS)
                    {
                        last_interval.end_ms = last_interval.end_ms.max(local_end_ms);
                    } else {
                        skill_intervals.push_back(BuffInterval {
                            start_ms: local_start_ms,
                            end_ms: local_end_ms,
                        });
                    }
                } else {
                    skill_intervals.push_back(BuffInterval {
                        start_ms: local_start_ms,
                        end_ms: local_end_ms,
                    });
                }
                while skill_intervals.len() > BUFF_INTERVALS_PER_SKILL_CAPACITY {
                    skill_intervals.pop_front();
                }
            }

            let should_emit_self_buff = inner.main_actor_id == Some(target_id)
                && self.buff_templates.classes.values().any(|template| {
                    template
                        .self_buff_candidate_skill_codes
                        .contains(&skill_shortcode)
                });
            let target_mob_code = inner.mob_id_code_map.get(&target_id).copied();
            let is_target_boss = target_mob_code
                .map(|mob_code| {
                    self.boss_code_list.contains(&mob_code)
                        || (config.show_possible_boss
                            && inner.possible_boss_codes.contains(&mob_code))
                })
                .unwrap_or(false);
            let should_emit_boss_debuff = (inner.last_target_by_main_actor == Some(target_id)
                || is_target_boss)
                && actor_id != target_id;

            (should_emit_self_buff, should_emit_boss_debuff)
        };

        let buff = BuffSummary {
            target_id,
            actor_id,
            skill_code,
            coverage: 0.0,
            active: local_end_ms > current_timestamp_millis(),
            last_start_ms: local_start_ms,
            last_end_ms: local_end_ms,
        };

        if should_emit_self_buff {
            let _ = self.app.emit("dps-main-actor-buff", buff.clone());
        }
        if should_emit_boss_debuff {
            let _ = self.app.emit("dps-boss-debuff", buff.clone());
        }

        buff
    }

    pub fn get_buff_overlay_context(&self) -> BuffOverlayContext {
        let inner = self.inner.read().unwrap();
        let actor_class = inner
            .main_actor_id
            .and_then(|actor_id| inner.actor_id_class_map.get(&actor_id))
            .cloned();
        let template = actor_class
            .as_ref()
            .and_then(|actor_class| self.buff_templates.classes.get(actor_class));
        let mut candidates: Vec<u32> = template
            .map(|template| {
                template
                    .self_buff_candidate_skill_codes
                    .iter()
                    .copied()
                    .collect()
            })
            .unwrap_or_default();
        candidates.sort_unstable();
        let mut candidates_by_class: HashMap<String, Vec<u32>> = self
            .buff_templates
            .classes
            .iter()
            .map(|(actor_class, template)| {
                let mut skill_codes: Vec<u32> = template
                    .self_buff_candidate_skill_codes
                    .iter()
                    .copied()
                    .collect();
                skill_codes.sort_unstable();
                (actor_class.clone(), skill_codes)
            })
            .collect();
        candidates_by_class.shrink_to_fit();

        BuffOverlayContext {
            actor_class,
            self_buff_candidate_skill_codes: candidates,
            self_buff_candidate_skill_codes_by_class: candidates_by_class,
        }
    }

    pub fn append_damage_at(&self, packet: ParsedDamagePacket, timestamp: f64) {
        let config = self.config.read().unwrap().clone();
        let mut inner = self.inner.write().unwrap();

        if self.healing_skill_codes.contains(&packet.skill_code) {
            return;
        }

        // let actor_id = packet.actor_id;
        // 如果是召唤物，把召唤物的伤害分配给他的owner
        let mut actor_id = packet.actor_id;
        if let Some(owner_id) = inner.summon_owner_map.get(&actor_id) {
            actor_id = *owner_id;
        }

        let target_mob_code = inner.mob_id_code_map.get(&packet.target_id).copied();
        let is_target_boss = target_mob_code
            .map(|mob_code| {
                self.boss_code_list.contains(&mob_code)
                    || (config.show_possible_boss && inner.possible_boss_codes.contains(&mob_code))
            })
            .unwrap_or(false);
        let is_target_player = inner.actor_id_name_map.contains_key(&packet.target_id)
            && !inner.mob_id_code_map.contains_key(&packet.target_id);

        if config.boss_only && !is_target_boss && !(config.pvp_mode_on && is_target_player) {
            return;
        }

        if config.my_muzhuang_only
            && target_mob_code == Some(TRAINING_DUMMY_MOB_CODE)
            && inner.main_actor_id != Some(actor_id)
        {
            return;
        }

        if config.pvp_mode_on && is_target_player {
            let actor = pvp_player_key(&inner, actor_id);
            let target = pvp_player_key(&inner, packet.target_id);
            if let (Some(actor), Some(target)) = (actor, target) {
                if actor != target {
                    *inner
                        .pvp_attackers_by_target
                        .entry(packet.target_id)
                        .or_default()
                        .entry(actor.clone())
                        .or_default() += packet.damage;
                    inner
                        .pvp_last_attacker_by_target
                        .insert(packet.target_id, actor);
                }
            }
        }

        if packet.is_dot && !inner.dot_skill_list.contains(&packet.skill_code) {
            inner.dot_skill_list.push(packet.skill_code);
        }

        if !inner.actor_id_class_map.contains_key(&actor_id) {
            if let Some(actor_class) = infer_actor_class(packet.skill_code) {
                inner.actor_id_class_map.insert(actor_id, actor_class);
            }
        }

        if inner.start_time.is_none() {
            inner.start_time = Some(timestamp);
        }

        inner
            .actor_id_skill_spec_map
            .get_mut_or_insert_with(actor_id, HashMap::new)
            .entry(packet.skill_code)
            .or_insert_with(|| infer_specialty_slots(packet.ori_skill_code));

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

        let total_damage = packet.damage;

        // 如果是 8 位的技能id，那么是常规技能，使用normalize后的code
        // 如果>8位的技能id (通常是10位，代表dot类型技能)，那么使用原始code，和8位区分开
        let mut stats_skill_code = if (10_000_000..=99_999_999).contains(&packet.ori_skill_code) {
            packet.skill_code
        } else {
            packet.ori_skill_code
        };
        // FIGHTER的暴走技能归类到普通技能上
        if let Some((_, mapped_skill_code)) = FIGHTER_SKILLID_MAP
            .iter()
            .find(|(from_skill_code, _)| *from_skill_code == stats_skill_code)
        {
            stats_skill_code = *mapped_skill_code;
        }
        // 精灵星召唤物的普通攻击映射
        if (100_010..=100_059).contains(&stats_skill_code)
            && (10001..=10005).contains(&(stats_skill_code / 10))
        {
            stats_skill_code = (stats_skill_code / 10) * 10;
        }

        let skill_stats = inner
            .dps_stats
            .entry(packet.target_id)
            .or_default()
            .entry(actor_id)
            .or_default()
            .entry(stats_skill_code)
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

        if actor_id != packet.target_id {
            inner.last_target = Some(packet.target_id);
            if inner.main_actor_id == Some(actor_id) {
                inner.last_target_by_main_actor = Some(packet.target_id);
                if is_target_player {
                    inner.last_player_target_by_main_actor = Some(packet.target_id);
                }
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
        inner.summon_owner_map.map.remove(&actor_id);
    }

    pub fn set_actor_class(&self, actor_id: u32, actor_class: &str) {
        self.inner
            .write()
            .unwrap()
            .actor_id_class_map
            .insert(actor_id, actor_class.to_string());
    }

    pub fn set_actor_combat_power(&self, actor_id: u32, combat_power: u64) {
        if combat_power == 0 || combat_power > 10_000_000 {
            return;
        }

        self.inner
            .write()
            .unwrap()
            .actor_id_combat_power_map
            .insert(actor_id, combat_power);
    }

    pub fn save_main_actor_combat_power(&self, combat_power: u64) -> bool {
        if combat_power == 0 || combat_power > 10_000_000 {
            return false;
        }

        self.inner.write().unwrap().main_actor_combat_power = Some(combat_power);
        true
    }

    pub fn append_mob(&self, target_id: u32, mob_code: u32) {
        // let config = self.config.read().unwrap().clone();
        // let is_target_boss = self.boss_code_list.contains(&mob_code);
        // if config.boss_only && !is_target_boss {
        //     return;
        // }
        let mut inner = self.inner.write().unwrap();
        inner.mob_id_code_map.insert(target_id, mob_code);
    }

    pub fn append_mob_hp(&self, target_id: u32, current_hp: u32) {
        let mut inner = self.inner.write().unwrap();
        let entry = inner
            .mob_id_hp_map
            .get_mut_or_insert_with(target_id, || (current_hp, current_hp));
        entry.0 = current_hp;
        if current_hp > entry.1 {
            entry.1 = current_hp;
        }
    }

    pub fn append_player_hp(&self, actor_id: u32, current_hp: u32) {
        let mut inner = self.inner.write().unwrap();
        let entry = inner
            .player_hp_map
            .get_mut_or_insert_with(actor_id, || PlayerHpInfo {
                actor_id,
                current_hp,
                max_observed_hp: current_hp,
            });
        entry.current_hp = current_hp;
        entry.max_observed_hp = entry.max_observed_hp.max(current_hp);
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
        self.inner
            .read()
            .unwrap()
            .mob_id_code_map
            .contains_key(&actor_id)
    }

    pub fn get_mob_code(&self, target_id: u32) -> Option<u32> {
        self.inner
            .read()
            .unwrap()
            .mob_id_code_map
            .get(&target_id)
            .copied()
    }

    pub fn add_possible_boss(&self, mob_code: u32) {
        if !self.config.read().unwrap().show_possible_boss {
            return;
        }
        self.inner
            .write()
            .unwrap()
            .possible_boss_codes
            .insert(mob_code);
    }

    pub fn is_possible_boss(&self, mob_code: u32) -> bool {
        if !self.config.read().unwrap().show_possible_boss {
            return false;
        }
        self.inner
            .read()
            .unwrap()
            .possible_boss_codes
            .contains(&mob_code)
    }

    pub fn is_known_boss_code(&self, mob_code: u32) -> bool {
        self.boss_code_list.contains(&mob_code)
    }

    pub fn set_main_actor(&self, actor_id: u32, actor_name: &str) {
        let sid = {
            let mut inner = self.inner.write().unwrap();
            if inner
                .main_actor_name
                .as_deref()
                .is_some_and(|current_name| current_name != actor_name)
            {
                inner.main_actor_combat_power = None;
            }
            inner.main_actor_id = Some(actor_id);
            inner.main_actor_name = Some(actor_name.to_string());
            inner.actor_id_server_map.get(&actor_id).cloned()
        }; // RwLock released — callback below can safely call clear()

        if let Some(cb) = self.main_actor_callback.lock().unwrap().as_ref() {
            cb(actor_id, actor_name, sid.clone());
        }

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

    pub fn actor_id_name_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_name_map.as_hash_map()
    }

    pub fn actor_id_server_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_server_map.as_hash_map()
    }

    pub fn actor_id_class_snapshot(&self) -> HashMap<u32, String> {
        self.inner.read().unwrap().actor_id_class_map.as_hash_map()
    }

    pub fn actor_id_combat_power_snapshot(&self) -> HashMap<u32, u64> {
        self.inner
            .read()
            .unwrap()
            .actor_id_combat_power_map
            .as_hash_map()
    }

    pub fn main_actor_combat_power(&self) -> Option<u64> {
        self.inner.read().unwrap().main_actor_combat_power
    }

    pub fn actor_skill_spec_snapshot(&self) -> HashMap<u32, HashMap<u32, Vec<u32>>> {
        self.inner
            .read()
            .unwrap()
            .actor_id_skill_spec_map
            .as_hash_map()
    }

    pub fn buff_intervals_snapshot(
        &self,
    ) -> HashMap<u32, HashMap<u32, HashMap<u32, VecDeque<BuffInterval>>>> {
        self.inner.read().unwrap().use_buffs_by_target.as_hash_map()
    }

    pub fn get_pvp_watch_info(&self, names: &[String]) -> PvpWatchInfoResponse {
        let inner = self.inner.read().unwrap();
        let mut watch_info = Vec::new();
        let mut known_players = Vec::new();

        for (actor_id, actor_name) in &inner.actor_id_name_map.map {
            if actor_name.trim().is_empty() || inner.mob_id_code_map.contains_key(actor_id) {
                continue;
            }

            known_players.push(PvpKnownPlayer {
                actor_id: *actor_id,
                actor_name: actor_name.clone(),
                server_id: inner.actor_id_server_map.get(actor_id).cloned(),
                actor_class: inner.actor_id_class_map.get(actor_id).cloned(),
            });
        }
        known_players.sort_by(|a, b| {
            a.actor_name
                .cmp(&b.actor_name)
                .then_with(|| a.server_id.cmp(&b.server_id))
                .then_with(|| a.actor_id.cmp(&b.actor_id))
        });

        for raw_name in names {
            let query_name = raw_name.trim();
            if query_name.is_empty() {
                continue;
            }

            let mut matched = false;
            for (actor_id, actor_name) in &inner.actor_id_name_map.map {
                if actor_name != query_name {
                    continue;
                }

                watch_info.push(build_pvp_watch_info_for_actor(
                    &inner, *actor_id, query_name,
                ));
                matched = true;
            }

            if !matched {
                watch_info.push(PvpWatchInfo {
                    query_name: query_name.to_string(),
                    actor_id: None,
                    actor_name: None,
                    server_id: None,
                    actor_class: None,
                    current_hp: None,
                    max_hp: None,
                });
            }
        }

        PvpWatchInfoResponse {
            watch_info,
            known_players,
            last_dealt_player: inner
                .last_player_target_by_main_actor
                .map(|actor_id| build_pvp_watch_info_for_actor(&inner, actor_id, "last_dealt")),
        }
    }

    pub fn mark_player_dead(&self, entity_id: u32) -> (bool, Option<String>) {
        if !self.config.read().unwrap().pvp_mode_on {
            return (false, None);
        }

        let mut inner = self.inner.write().unwrap();
        let Some(victim) = pvp_player_key(&inner, entity_id) else {
            return (false, None);
        };
        if inner.mob_id_code_map.contains_key(&entity_id)
            || !inner.pvp_dead_players.insert(victim.clone())
        {
            return (false, None);
        }

        let attackers = inner
            .pvp_attackers_by_target
            .remove(&entity_id)
            .unwrap_or_default();
        let killer = inner.pvp_last_attacker_by_target.remove(&entity_id);

        inner
            .pvp_combat_stats
            .entry(victim.clone())
            .or_default()
            .deaths += 1;

        let killer = killer.filter(|player| player != &victim);
        if let Some(killer_player) = &killer {
            inner
                .pvp_combat_stats
                .entry(killer_player.clone())
                .or_default()
                .kills += 1;
        }

        for (attacker, damage) in attackers {
            if attacker == victim {
                continue;
            }
            let stats = inner.pvp_combat_stats.entry(attacker.clone()).or_default();
            stats.damage += damage;
            if killer.as_ref() != Some(&attacker) {
                stats.assists += 1;
            }
        }

        (true, killer.map(|player| player.name))
    }

    pub fn mark_player_alive(&self, entity_id: u32) {
        let mut inner = self.inner.write().unwrap();
        if let Some(player) = pvp_player_key(&inner, entity_id) {
            inner.pvp_dead_players.remove(&player);
        }
    }

    pub fn get_pvp_combat_stats(&self) -> Vec<PvpCombatStatsRow> {
        self.inner
            .read()
            .unwrap()
            .pvp_combat_stats
            .iter()
            .map(|(player, stats)| PvpCombatStatsRow {
                actor_name: player.name.clone(),
                server_id: player.server_id.clone(),
                damage: stats.damage,
                kills: stats.kills,
                assists: stats.assists,
                deaths: stats.deaths,
            })
            .collect()
    }

    pub fn clear_pvp_combat_stats(&self) {
        let mut inner = self.inner.write().unwrap();
        inner.pvp_attackers_by_target.clear();
        inner.pvp_last_attacker_by_target.clear();
        inner.pvp_combat_stats.clear();
        inner.pvp_dead_players.clear();
    }

    pub fn summon_owner_snapshot(&self) -> HashMap<u32, u32> {
        self.inner.read().unwrap().summon_owner_map.as_hash_map()
    }

    pub fn mob_id_code_snapshot(&self) -> HashMap<u32, u32> {
        self.inner.read().unwrap().mob_id_code_map.as_hash_map()
    }

    pub fn mob_id_hp_snapshot(&self) -> HashMap<u32, (u32, u32)> {
        self.inner.read().unwrap().mob_id_hp_map.as_hash_map()
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
    if ACTOR_CLASS_SKILL_IGNORE_LIST
        .iter()
        .any(|ignored_prefix| skill_code.starts_with(ignored_prefix))
    {
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
        "19" => Some("FIGHTER".to_string()),
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

fn current_timestamp_millis() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

fn first_four_digits(mut value: u32) -> u32 {
    while value >= 10_000 {
        value /= 10;
    }
    value
}

fn build_pvp_watch_info_for_actor(
    inner: &DataStorageInner,
    actor_id: u32,
    query_name: &str,
) -> PvpWatchInfo {
    let hp = inner.player_hp_map.get(&actor_id);

    PvpWatchInfo {
        query_name: query_name.to_string(),
        actor_id: Some(actor_id),
        actor_name: inner.actor_id_name_map.get(&actor_id).cloned(),
        server_id: inner.actor_id_server_map.get(&actor_id).cloned(),
        actor_class: inner.actor_id_class_map.get(&actor_id).cloned(),
        current_hp: hp.map(|value| value.current_hp),
        max_hp: hp.map(|value| value.max_observed_hp),
    }
}

fn pvp_player_key(inner: &DataStorageInner, actor_id: u32) -> Option<PvpPlayerKey> {
    Some(PvpPlayerKey {
        name: inner.actor_id_name_map.get(&actor_id)?.clone(),
        server_id: inner
            .actor_id_server_map
            .get(&actor_id)
            .cloned()
            .unwrap_or_default(),
    })
}
