use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use crate::dps_meter::models::combat::{
    ActorInfo, CombatInfos, CombatSnapshot, PlayerOverviewStat, SkillStats, TargetInfo,
};
use crate::dps_meter::storage::data_storage::DataStorage;

pub struct DpsCalculator {
    data_storage: Arc<DataStorage>,
    last_total_damage: Arc<Mutex<Option<u64>>>,
}

impl DpsCalculator {
    pub fn new(data_storage: Arc<DataStorage>) -> Self {
        Self {
            data_storage,
            last_total_damage: Arc::new(Mutex::new(None)),
        }
    }

    pub fn reset_snapshot_state(&self) {
        *self.last_total_damage.lock().unwrap() = None;
    }

    pub fn get_dps_snapshot(&self, target_damage_threshold: u64) -> Option<CombatSnapshot> {
        build_combat_snapshot(
            &self.data_storage,
            &self.last_total_damage,
            target_damage_threshold,
        )
    }
}

fn build_combat_snapshot(
    data_storage: &DataStorage,
    last_total_damage: &Mutex<Option<u64>>,
    target_damage_threshold: u64,
) -> Option<CombatSnapshot> {
    if data_storage.start_time().is_none() {
        return None;
    }

    let raw_stats = data_storage.get_dps_stats_snapshot();
    let summon_owner_map = data_storage.summon_owner_snapshot();
    let merged_stats = merge_summon_stats(&raw_stats, &summon_owner_map);

    let mut target_damage_dict = HashMap::new();
    for (target_id, target_stats) in &merged_stats {
        let total_damage = target_stats
            .values()
            .flat_map(|skill_map| skill_map.values())
            .map(|stats| stats.total_damage)
            .sum::<u64>();
        target_damage_dict.insert(*target_id, total_damage);
    }

    let kept_targets: Vec<u32> = target_damage_dict
        .iter()
        .filter_map(|(target_id, damage)| {
            if *damage > target_damage_threshold {
                Some(*target_id)
            } else {
                None
            }
        })
        .collect();

    let filtered_stats = filter_nested_map(&merged_stats, &kept_targets);
    let total_damage = kept_targets
        .iter()
        .filter_map(|target_id| target_damage_dict.get(target_id))
        .sum::<u64>();

    let mut last_total_damage = last_total_damage.lock().unwrap();
    if last_total_damage.as_ref() == Some(&total_damage) {
        return None;
    }
    *last_total_damage = Some(total_damage);
    drop(last_total_damage);

    let target_infos = build_target_infos(data_storage, &kept_targets, &summon_owner_map);
    let actor_infos = build_actor_infos(data_storage, &filtered_stats, &summon_owner_map);
    let aggregated_stats = aggregate_target_actor_stats(&filtered_stats);

    let last_target_id = data_storage
        .last_target_by_main_actor()
        .or_else(|| data_storage.last_target());
    let (last_target_info, last_target_all_players_overview_stats) =
        build_last_target_all_players_overview_stats(
            last_target_id,
            &aggregated_stats,
            &target_infos,
            &actor_infos,
        );

    Some(CombatSnapshot {
        total_damage,
        by_target_player_stats: aggregated_stats,
        by_target_player_skill_stats: filtered_stats,
        combat_infos: CombatInfos {
            actor_infos,
            target_infos,
            main_actor_id: data_storage.main_actor_id(),
            main_actor_name: data_storage.main_actor_name(),
            last_target_by_main_actor: data_storage.last_target_by_main_actor(),
            last_target: data_storage.last_target(),
            time_now: current_timestamp_seconds(),
        },
        last_target_info,
        last_target_all_players_overview_stats,
    })
}

fn build_target_infos(
    data_storage: &DataStorage,
    kept_targets: &[u32],
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, TargetInfo> {
    let mob_id_code_map = data_storage.mob_id_code_snapshot();
    let mob_id_hp_map: HashMap<u32, (u32, u32)> = data_storage.mob_id_hp_snapshot();
    let mob_code_name_map = data_storage.mob_code_name_snapshot();
    let boss_code_list = data_storage.boss_code_list_snapshot();
    let start_time_by_target = merge_time_map_min(
        &data_storage.start_time_by_target_snapshot(),
        summon_owner_map,
    );
    let last_time_by_target = merge_time_map_max(
        &data_storage.last_time_by_target_snapshot(),
        summon_owner_map,
    );

    kept_targets
        .iter()
        .map(|target_id| {
            let mob_code = mob_id_code_map.get(target_id).copied();
            let target_name = mob_code.and_then(|code| mob_code_name_map.get(&code).cloned());
            let is_boss = mob_code
                .map(|code| boss_code_list.contains(&code) || data_storage.is_possible_boss(code))
                .unwrap_or(false);
            let (current_hp, max_hp) = mob_id_hp_map
                .get(target_id)
                .map(|(current_hp, max_hp)| (Some(*current_hp), Some(*max_hp)))
                .unwrap_or((None, None));

            (
                *target_id,
                TargetInfo {
                    id: *target_id,
                    target_mob_code: mob_code,
                    target_name,
                    is_boss,
                    current_hp,
                    max_hp,
                    target_start_time: start_time_by_target
                        .get(target_id)
                        .cloned()
                        .unwrap_or_default(),
                    target_last_time: last_time_by_target
                        .get(target_id)
                        .cloned()
                        .unwrap_or_default(),
                },
            )
        })
        .collect()
}

fn build_actor_infos(
    data_storage: &DataStorage,
    stats: &HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, ActorInfo> {
    let actor_id_name_map = data_storage.actor_id_name_snapshot();
    let actor_id_server_map = data_storage.actor_id_server_snapshot();
    let actor_id_class_map = data_storage.actor_id_class_snapshot();
    let actor_id_skill_spec_map =
        merge_actor_skill_specs(&data_storage.actor_skill_spec_snapshot(), summon_owner_map);

    let mut actor_ids = Vec::new();
    for target_stats in stats.values() {
        for actor_id in target_stats.keys() {
            actor_ids.push(*actor_id);
        }
    }
    actor_ids.sort_unstable();
    actor_ids.dedup();

    actor_ids
        .into_iter()
        .map(|actor_id| {
            (
                actor_id,
                ActorInfo {
                    id: actor_id,
                    actor_name: actor_id_name_map.get(&actor_id).cloned(),
                    actor_server_id: actor_id_server_map.get(&actor_id).cloned(),
                    actor_class: actor_id_class_map.get(&actor_id).cloned(),
                    actor_skill_spec: actor_id_skill_spec_map
                        .get(&actor_id)
                        .cloned()
                        .unwrap_or_default(),
                },
            )
        })
        .collect()
}

fn filter_nested_map<T: Clone>(data: &HashMap<u32, T>, kept_targets: &[u32]) -> HashMap<u32, T> {
    kept_targets
        .iter()
        .filter_map(|target_id| {
            data.get(target_id)
                .cloned()
                .map(|value| (*target_id, value))
        })
        .collect()
}

fn resolve_owner_id(actor_id: u32, summon_owner_map: &HashMap<u32, u32>) -> u32 {
    let mut current = actor_id;
    let mut guard = 0usize;

    while let Some(owner_id) = summon_owner_map.get(&current).copied() {
        if owner_id == current || guard >= 8 {
            break;
        }
        current = owner_id;
        guard += 1;
    }

    current
}

fn merge_skill_stats_into(target: &mut SkillStats, source: &SkillStats) {
    target.counts += source.counts;
    target.total_damage += source.total_damage;
    target.max_damage = target.max_damage.max(source.max_damage);
    target.min_damage = target.min_damage.min(source.min_damage);

    for (special_name, count) in &source.special_counts {
        *target
            .special_counts
            .entry(special_name.clone())
            .or_insert(0) += count;
    }
}

fn merge_summon_stats(
    raw_stats: &HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>> {
    let mut merged = HashMap::new();

    for (target_id, actor_map) in raw_stats {
        let target_entry = merged.entry(*target_id).or_insert_with(HashMap::new);

        for (actor_id, skill_map) in actor_map {
            let resolved_actor_id = resolve_owner_id(*actor_id, summon_owner_map);
            let actor_entry = target_entry
                .entry(resolved_actor_id)
                .or_insert_with(HashMap::new);

            for (skill_code, stats) in skill_map {
                let skill_entry = actor_entry
                    .entry(*skill_code)
                    .or_insert_with(SkillStats::new);
                merge_skill_stats_into(skill_entry, stats);
            }
        }
    }

    merged
}

fn merge_time_map_min(
    raw_times: &HashMap<u32, HashMap<u32, f64>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, f64>> {
    let mut merged = HashMap::new();

    for (target_id, actor_times) in raw_times {
        let target_entry = merged.entry(*target_id).or_insert_with(HashMap::new);

        for (actor_id, time) in actor_times {
            let resolved_actor_id = resolve_owner_id(*actor_id, summon_owner_map);
            target_entry
                .entry(resolved_actor_id)
                .and_modify(|current| {
                    if *time < *current {
                        *current = *time;
                    }
                })
                .or_insert(*time);
        }
    }

    merged
}

fn merge_time_map_max(
    raw_times: &HashMap<u32, HashMap<u32, f64>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, f64>> {
    let mut merged = HashMap::new();

    for (target_id, actor_times) in raw_times {
        let target_entry = merged.entry(*target_id).or_insert_with(HashMap::new);

        for (actor_id, time) in actor_times {
            let resolved_actor_id = resolve_owner_id(*actor_id, summon_owner_map);
            target_entry
                .entry(resolved_actor_id)
                .and_modify(|current| {
                    if *time > *current {
                        *current = *time;
                    }
                })
                .or_insert(*time);
        }
    }

    merged
}

fn merge_actor_skill_specs(
    raw_specs: &HashMap<u32, HashMap<u32, Vec<u32>>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, Vec<u32>>> {
    let mut merged = HashMap::new();

    for (actor_id, skill_map) in raw_specs {
        let resolved_actor_id = resolve_owner_id(*actor_id, summon_owner_map);
        let actor_entry = merged.entry(resolved_actor_id).or_insert_with(HashMap::new);
        for (skill_code, slots) in skill_map {
            actor_entry
                .entry(*skill_code)
                .or_insert_with(|| slots.clone());
        }
    }
    merged
}

fn aggregate_target_actor_stats(
    stats: &HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
) -> HashMap<u32, HashMap<u32, SkillStats>> {
    stats
        .iter()
        .map(|(target_id, actor_map)| {
            let aggregated_actor_map = actor_map
                .iter()
                .map(|(actor_id, skill_map)| (*actor_id, aggregate_skill_level_stats(skill_map)))
                .collect();
            (*target_id, aggregated_actor_map)
        })
        .collect()
}

fn aggregate_skill_level_stats(stats: &HashMap<u32, SkillStats>) -> SkillStats {
    let mut result = SkillStats::new();

    for skill_stats in stats.values() {
        result.counts += skill_stats.counts;
        result.total_damage += skill_stats.total_damage;
        result.max_damage = result.max_damage.max(skill_stats.max_damage);
        result.min_damage = result.min_damage.min(skill_stats.min_damage);

        for (special_name, count) in &skill_stats.special_counts {
            *result
                .special_counts
                .entry(special_name.clone())
                .or_insert(0) += count;
        }
    }

    if result.min_damage == u64::MAX {
        result.min_damage = 0;
    }

    result
}

fn current_timestamp_seconds() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};

    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs_f64())
        .unwrap_or_default()
}

fn build_last_target_all_players_overview_stats(
    last_target_id: Option<u32>,
    aggregated_stats: &HashMap<u32, HashMap<u32, SkillStats>>,
    target_infos: &HashMap<u32, TargetInfo>,
    actor_infos: &HashMap<u32, ActorInfo>,
) -> (Option<TargetInfo>, Vec<PlayerOverviewStat>) {
    let target_id = match last_target_id {
        Some(id) => id,
        None => return (None, Vec::new()),
    };

    let target_info = match target_infos.get(&target_id) {
        Some(info) => info.clone(),
        None => return (None, Vec::new()),
    };

    let player_stats = match aggregated_stats.get(&target_id) {
        Some(stats) => stats,
        None => return (Some(target_info), Vec::new()),
    };

    let max_hp = target_info.max_hp.unwrap_or(0) as f64;
    let max_last_time = target_info
        .target_last_time
        .values()
        .cloned()
        .fold(0.0_f64, f64::max);

    let total_target_damage: u64 = player_stats.values().map(|stats| stats.total_damage).sum();

    let mut overview: Vec<PlayerOverviewStat> = player_stats
        .iter()
        .map(|(player_id, stats)| {
            let battle_duration = {
                let start_time = target_info
                    .target_start_time
                    .get(player_id)
                    .copied()
                    .unwrap_or(max_last_time);
                (max_last_time - start_time).max(1.0)
            };

            let dps = stats.total_damage as f64 / battle_duration;
            let damage_share = if total_target_damage > 0 {
                stats.total_damage as f64 / total_target_damage as f64
            } else {
                0.0
            };
            let damage_contribution = if max_hp > 0.0 {
                stats.total_damage as f64 / max_hp
            } else {
                0.0
            };

            let actor_info = actor_infos.get(player_id);
            PlayerOverviewStat {
                actor_id: *player_id,
                actor_name: actor_info
                    .and_then(|a| a.actor_name.clone())
                    .unwrap_or_default(),
                actor_server_id: actor_info
                    .and_then(|a| a.actor_server_id.clone())
                    .unwrap_or_default(),
                actor_class: actor_info
                    .and_then(|a| a.actor_class.clone())
                    .unwrap_or_default(),
                counts: stats.counts,
                total_damage: stats.total_damage,
                min_damage: if stats.min_damage == u64::MAX {
                    0
                } else {
                    stats.min_damage
                },
                max_damage: stats.max_damage,
                special_counts: stats.special_counts.clone(),
                dps,
                damage_share,
                damage_contribution,
            }
        })
        .collect();

    overview.sort_by(|a, b| b.total_damage.cmp(&a.total_damage));

    (Some(target_info), overview)
}
