use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{Arc, Mutex};

use crate::dps_meter::models::combat::{
    ActorInfo, BuffInterval, BuffSummary, CombatInfos, CombatSnapshot, PlayerOverviewStat,
    SkillStats, TargetInfo,
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

    pub fn get_dps_snapshot(
        &self,
        target_damage_threshold: u64,
        hide_unknown_players: bool,
        max_player_count: usize,
    ) -> Option<CombatSnapshot> {
        build_combat_snapshot(
            &self.data_storage,
            &self.last_total_damage,
            target_damage_threshold,
            hide_unknown_players,
            max_player_count,
        )
    }
}

// =============================================================================
// Main snapshot builder
// =============================================================================

fn build_combat_snapshot(
    data_storage: &DataStorage,
    last_total_damage: &Mutex<Option<u64>>,
    target_damage_threshold: u64,
    hide_unknown_players: bool,
    max_player_count: usize,
) -> Option<CombatSnapshot> {
    if data_storage.start_time().is_none() {
        return None;
    }

    // 1. Collect raw data
    let raw_stats = data_storage.get_dps_stats_snapshot();
    let summon_owner_map = data_storage.summon_owner_snapshot();

    // 2. Merge summon damage into their owners
    let merged = merge_summon_stats(&raw_stats, &summon_owner_map);

    // 3. Calculate total damage per target, filter by threshold
    let target_damage: HashMap<u32, u64> = merged
        .iter()
        .map(|(tid, actors)| {
            let dmg: u64 = actors
                .values()
                .flat_map(|skills| skills.values())
                .map(|s| s.total_damage)
                .sum();
            (*tid, dmg)
        })
        .collect();

    let kept_targets: Vec<u32> = target_damage
        .iter()
        .filter(|(_, dmg)| **dmg > target_damage_threshold)
        .map(|(tid, _)| *tid)
        .collect();

    let total_damage: u64 = kept_targets
        .iter()
        .filter_map(|tid| target_damage.get(tid))
        .sum();

    // 4. Always build — duplicate suppression moved to snapshot loop
    *last_total_damage.lock().unwrap() = Some(total_damage);

    // 5. Filter stats to kept targets only
    let filtered_skill_stats = filter_nested_map(&merged, &kept_targets);

    // 6. Aggregate: per-target per-actor SkillStats (sum across skills)
    let aggregated = aggregate_target_actor_stats(&filtered_skill_stats);

    // 7. Build info maps
    let target_infos = build_target_infos(data_storage, &kept_targets, &summon_owner_map);
    let actor_infos = build_actor_infos(data_storage, &filtered_skill_stats, &summon_owner_map);

    // 8. Build per-target per-actor overview stats (with DPS, share, name, etc.)
    let per_target_overview =
        build_per_target_overview_stats(&aggregated, &target_infos, &actor_infos);

    // 9. Extract last-target overview for frontend convenience (already sorted by damage desc)
    let last_target_id = data_storage
        .last_target_by_main_actor()
        .or_else(|| data_storage.last_target());
    let (last_target_info, last_target_overview) = last_target_id
        .and_then(|tid| per_target_overview.get(&tid))
        .map(|stats| {
            let mut sorted: Vec<_> = stats.values().cloned().collect();
            sorted.sort_by(|a, b| b.total_damage.cmp(&a.total_damage));
            // Filter unknown players if configured
            let filtered: Vec<_> = if hide_unknown_players {
                sorted
                    .into_iter()
                    .filter(|p| !p.actor_name.is_empty())
                    .collect()
            } else {
                sorted
            };
            // Truncate to max player count
            let truncated: Vec<_> = filtered
                .into_iter()
                .take(max_player_count.max(5).min(20))
                .collect();
            (
                target_infos.get(&last_target_id.unwrap()).cloned(),
                truncated,
            )
        })
        .unwrap_or((None, Vec::new()));

    let main_actor_received_overview = data_storage
        .main_actor_id()
        .and_then(|main_actor_id| {
            per_target_overview
                .get(&main_actor_id)
                .map(|stats| (main_actor_id, stats))
        })
        .map(|(main_actor_id, stats)| {
            let mut sorted: Vec<_> = stats.values().cloned().collect();
            sorted.retain(|p| p.actor_id != main_actor_id);
            sorted.sort_by(|a, b| b.total_damage.cmp(&a.total_damage));
            if hide_unknown_players {
                sorted
                    .into_iter()
                    .filter(|p| !p.actor_name.is_empty())
                    .collect()
            } else {
                sorted
            }
        })
        .unwrap_or_default();

    Some(CombatSnapshot {
        total_damage,
        by_target_player_skill_stats: filtered_skill_stats,
        by_target_player_stats: per_target_overview,
        use_buffs_by_target: build_buff_summaries(data_storage, &kept_targets, &actor_infos),
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
        last_target_all_players_overview_stats: last_target_overview,
        main_actor_received_player_overview_stats: main_actor_received_overview,
    })
}

// =============================================================================
// Target infos
// =============================================================================

fn build_target_infos(
    data_storage: &DataStorage,
    kept_targets: &[u32],
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, TargetInfo> {
    let mob_id_code = data_storage.mob_id_code_snapshot();
    let mob_id_hp = data_storage.mob_id_hp_snapshot();
    let code_name = data_storage.mob_code_name_snapshot();
    let boss_codes = data_storage.boss_code_list_snapshot();
    let start_times = merge_time_map_min(
        &data_storage.start_time_by_target_snapshot(),
        summon_owner_map,
    );
    let last_times = merge_time_map_max(
        &data_storage.last_time_by_target_snapshot(),
        summon_owner_map,
    );

    kept_targets
        .iter()
        .map(|tid| {
            let mob_code = mob_id_code.get(tid).copied();
            let name = mob_code.and_then(|c| code_name.get(&c).cloned());
            let is_boss = mob_code
                .map(|c| boss_codes.contains(&c) || data_storage.is_possible_boss(c))
                .unwrap_or(false);
            let (cur_hp, max_hp) = mob_id_hp
                .get(tid)
                .map(|(c, m)| (Some(*c), Some(*m)))
                .unwrap_or((None, None));

            (
                *tid,
                TargetInfo {
                    id: *tid,
                    target_mob_code: mob_code,
                    target_name: name,
                    is_boss,
                    current_hp: cur_hp,
                    max_hp,
                    target_start_time: start_times.get(tid).cloned().unwrap_or_default(),
                    target_last_time: last_times.get(tid).cloned().unwrap_or_default(),
                },
            )
        })
        .collect()
}

// =============================================================================
// Actor infos
// =============================================================================

fn build_actor_infos(
    data_storage: &DataStorage,
    stats: &HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, ActorInfo> {
    let id_name = data_storage.actor_id_name_snapshot();
    let id_server = data_storage.actor_id_server_snapshot();
    let id_class = data_storage.actor_id_class_snapshot();
    let id_combat_power = data_storage.actor_id_combat_power_snapshot();
    let main_actor_id = data_storage.main_actor_id();
    let main_actor_combat_power = data_storage.main_actor_combat_power();
    let id_skill_spec =
        merge_actor_skill_specs(&data_storage.actor_skill_spec_snapshot(), summon_owner_map);

    let mut actor_ids: Vec<u32> = stats
        .values()
        .flat_map(|actors| actors.keys())
        .copied()
        .collect();
    actor_ids.sort_unstable();
    actor_ids.dedup();

    actor_ids
        .into_iter()
        .map(|aid| {
            (
                aid,
                ActorInfo {
                    id: aid,
                    actor_name: id_name.get(&aid).cloned(),
                    actor_server_id: id_server.get(&aid).cloned(),
                    actor_class: id_class.get(&aid).cloned(),
                    combat_power: if Some(aid) == main_actor_id {
                        main_actor_combat_power.or_else(|| id_combat_power.get(&aid).copied())
                    } else {
                        id_combat_power.get(&aid).copied()
                    },
                    actor_skill_spec: id_skill_spec.get(&aid).cloned().unwrap_or_default(),
                },
            )
        })
        .collect()
}

// =============================================================================
// Aggregate: per-target per-actor SkillStats (collapse skill dimension)
// =============================================================================

fn aggregate_target_actor_stats(
    stats: &HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
) -> HashMap<u32, HashMap<u32, SkillStats>> {
    stats
        .iter()
        .map(|(tid, actors)| {
            let aggregated = actors
                .iter()
                .map(|(aid, skills)| (*aid, aggregate_skills(skills)))
                .collect();
            (*tid, aggregated)
        })
        .collect()
}

fn aggregate_skills(skills: &HashMap<u32, SkillStats>) -> SkillStats {
    let mut result = SkillStats::new();
    for s in skills.values() {
        result.counts += s.counts;
        result.total_damage += s.total_damage;
        result.max_damage = result.max_damage.max(s.max_damage);
        result.min_damage = result.min_damage.min(s.min_damage);
        for (k, v) in &s.special_counts {
            *result.special_counts.entry(k.clone()).or_insert(0) += v;
        }
    }
    if result.min_damage == u64::MAX {
        result.min_damage = 0;
    }
    result
}

// =============================================================================
// Per-target per-actor overview stats (with DPS, share, name, class)
// =============================================================================

fn build_per_target_overview_stats(
    aggregated: &HashMap<u32, HashMap<u32, SkillStats>>,
    target_infos: &HashMap<u32, TargetInfo>,
    actor_infos: &HashMap<u32, ActorInfo>,
) -> HashMap<u32, HashMap<u32, PlayerOverviewStat>> {
    aggregated
        .iter()
        .map(|(tid, player_stats)| {
            let target_info = target_infos.get(tid);
            let max_hp = target_info.and_then(|t| t.max_hp).unwrap_or(0) as f64;
            let max_last_time = target_info
                .map(|t| t.target_last_time.values().copied().fold(0.0, f64::max))
                .unwrap_or(0.0);
            let target_total: u64 = player_stats.values().map(|s| s.total_damage).sum();

            let overview: HashMap<u32, PlayerOverviewStat> = player_stats
                .iter()
                .map(|(pid, stats)| {
                    let start = target_info
                        .and_then(|t| t.target_start_time.get(pid).copied())
                        .unwrap_or(max_last_time);
                    let duration = (max_last_time - start).max(1.0);
                    let dps = stats.total_damage as f64 / duration;
                    let damage_share = if target_total > 0 {
                        stats.total_damage as f64 / target_total as f64
                    } else {
                        0.0
                    };
                    let damage_contribution = if max_hp > 0.0 {
                        stats.total_damage as f64 / max_hp
                    } else {
                        0.0
                    };

                    let info = actor_infos.get(pid);
                    (
                        *pid,
                        PlayerOverviewStat {
                            actor_id: *pid,
                            actor_name: info.and_then(|a| a.actor_name.clone()).unwrap_or_default(),
                            actor_server_id: info
                                .and_then(|a| a.actor_server_id.clone())
                                .unwrap_or_default(),
                            actor_class: info
                                .and_then(|a| a.actor_class.clone())
                                .unwrap_or_default(),
                            combat_power: info.and_then(|a| a.combat_power),
                            counts: stats.counts,
                            total_damage: stats.total_damage,
                            min_damage: stats.min_damage,
                            max_damage: stats.max_damage,
                            special_counts: stats.special_counts.clone(),
                            dps,
                            damage_share,
                            damage_contribution,
                        },
                    )
                })
                .collect();

            (*tid, overview)
        })
        .collect()
}

// =============================================================================
// Summon merging
// =============================================================================

fn resolve_owner(actor_id: u32, summon_owner_map: &HashMap<u32, u32>) -> u32 {
    let mut current = actor_id;
    for _ in 0..8 {
        match summon_owner_map.get(&current) {
            Some(owner) if *owner != current => current = *owner,
            _ => break,
        }
    }
    current
}

fn merge_summon_stats(
    raw: &HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>> {
    let mut merged: HashMap<u32, HashMap<u32, HashMap<u32, SkillStats>>> = HashMap::new();
    for (tid, actors) in raw {
        let target = merged.entry(*tid).or_default();
        for (aid, skills) in actors {
            let owner = resolve_owner(*aid, summon_owner_map);
            let actor = target.entry(owner).or_default();
            for (code, stats) in skills {
                let entry = actor.entry(*code).or_insert_with(SkillStats::new);
                entry.counts += stats.counts;
                entry.total_damage += stats.total_damage;
                entry.max_damage = entry.max_damage.max(stats.max_damage);
                entry.min_damage = entry.min_damage.min(stats.min_damage);
                for (k, v) in &stats.special_counts {
                    *entry.special_counts.entry(k.clone()).or_insert(0) += v;
                }
            }
        }
    }
    merged
}

// =============================================================================
// Time map merging (min / max)
// =============================================================================

fn merge_time_map_min(
    raw: &HashMap<u32, HashMap<u32, f64>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, f64>> {
    merge_time_map(raw, summon_owner_map, |a, b| if a < b { a } else { b })
}

fn merge_time_map_max(
    raw: &HashMap<u32, HashMap<u32, f64>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, f64>> {
    merge_time_map(raw, summon_owner_map, |a, b| if a > b { a } else { b })
}

fn merge_time_map(
    raw: &HashMap<u32, HashMap<u32, f64>>,
    summon_owner_map: &HashMap<u32, u32>,
    pick: fn(f64, f64) -> f64,
) -> HashMap<u32, HashMap<u32, f64>> {
    let mut merged: HashMap<u32, HashMap<u32, f64>> = HashMap::new();
    for (tid, actors) in raw {
        let target: &mut HashMap<u32, f64> = merged.entry(*tid).or_default();
        for (aid, &time) in actors {
            let owner = resolve_owner(*aid, summon_owner_map);
            target
                .entry(owner)
                .and_modify(|t| *t = pick(*t, time))
                .or_insert(time);
        }
    }
    merged
}

// =============================================================================
// Skill spec merging
// =============================================================================

fn merge_actor_skill_specs(
    raw: &HashMap<u32, HashMap<u32, Vec<u32>>>,
    summon_owner_map: &HashMap<u32, u32>,
) -> HashMap<u32, HashMap<u32, Vec<u32>>> {
    let mut merged = HashMap::new();
    for (aid, skills) in raw {
        let owner = resolve_owner(*aid, summon_owner_map);
        let entry = merged.entry(owner).or_insert_with(HashMap::new);
        for (code, slots) in skills {
            entry.entry(*code).or_insert_with(|| slots.clone());
        }
    }
    merged
}

// =============================================================================
// Buff summaries
// =============================================================================

fn build_buff_summaries(
    data_storage: &DataStorage,
    kept_targets: &[u32],
    actor_infos: &HashMap<u32, ActorInfo>,
) -> HashMap<u32, Vec<BuffSummary>> {
    let intervals_by_target = data_storage.buff_intervals_snapshot();
    let target_start_times = data_storage.start_time_by_target_snapshot();
    let global_start_time = data_storage.start_time();
    let now_ms = current_timestamp_millis();
    let allowed_targets: HashSet<u32> = kept_targets
        .iter()
        .copied()
        .chain(actor_infos.keys().copied())
        .collect();
    let mut result = HashMap::new();

    for (target_id, actor_map) in intervals_by_target {
        if !allowed_targets.contains(&target_id) {
            continue;
        }

        let battle_start_ms =
            target_battle_start_ms(&target_start_times, global_start_time, target_id, now_ms);
        let battle_duration_ms = now_ms.saturating_sub(battle_start_ms).max(1);
        let mut summaries = Vec::new();

        for (actor_id, skill_map) in &actor_map {
            for (skill_code, intervals) in skill_map {
                let Some(last_interval) = intervals.back() else {
                    continue;
                };
                let covered_ms = covered_duration_ms(intervals, battle_start_ms, now_ms);
                summaries.push(BuffSummary {
                    target_id,
                    actor_id: *actor_id,
                    skill_code: *skill_code,
                    coverage: (covered_ms as f64 / battle_duration_ms as f64).clamp(0.0, 1.0),
                    active: last_interval.end_ms > now_ms,
                    last_start_ms: last_interval.start_ms,
                    last_end_ms: last_interval.end_ms,
                });
            }
        }

        if !summaries.is_empty() {
            summaries.sort_by(|a, b| {
                a.skill_code
                    .cmp(&b.skill_code)
                    .then_with(|| a.actor_id.cmp(&b.actor_id))
            });
            result.insert(target_id, summaries);
        }
    }

    result
}

fn target_battle_start_ms(
    target_start_times: &HashMap<u32, HashMap<u32, f64>>,
    global_start_time: Option<f64>,
    target_id: u32,
    now_ms: u64,
) -> u64 {
    target_start_times
        .get(&target_id)
        .and_then(|by_actor| by_actor.values().copied().reduce(f64::min))
        .or(global_start_time)
        .map(|seconds| (seconds * 1000.0).max(0.0) as u64)
        .unwrap_or(now_ms)
}

fn covered_duration_ms(
    intervals: &VecDeque<BuffInterval>,
    range_start_ms: u64,
    range_end_ms: u64,
) -> u64 {
    if range_end_ms <= range_start_ms {
        return 0;
    }

    let mut ranges: Vec<(u64, u64)> = intervals
        .iter()
        .filter_map(|interval| {
            let start = interval.start_ms.max(range_start_ms);
            let end = interval.end_ms.min(range_end_ms);
            (end > start).then_some((start, end))
        })
        .collect();
    ranges.sort_unstable_by_key(|(start, _)| *start);

    let mut total = 0u64;
    let mut current: Option<(u64, u64)> = None;
    for (start, end) in ranges {
        match current {
            Some((current_start, current_end)) if start <= current_end => {
                current = Some((current_start, current_end.max(end)));
            }
            Some((current_start, current_end)) => {
                total = total.saturating_add(current_end.saturating_sub(current_start));
                current = Some((start, end));
            }
            None => current = Some((start, end)),
        }
    }
    if let Some((start, end)) = current {
        total = total.saturating_add(end.saturating_sub(start));
    }
    total
}

// =============================================================================
// Helpers
// =============================================================================

fn filter_nested_map<T: Clone>(data: &HashMap<u32, T>, kept: &[u32]) -> HashMap<u32, T> {
    kept.iter()
        .filter_map(|tid| data.get(tid).map(|v| (*tid, v.clone())))
        .collect()
}

fn current_timestamp_seconds() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or_default()
}

fn current_timestamp_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}
