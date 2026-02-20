export interface OverviewStats {
  total_damage: number;
  counts: number;
}

export interface BaseStats {
  total_damage: number;
  counts: number;
  special_counts: Record<string, number>;
}

export interface PlayerStats extends BaseStats {
  playerId: number;
}

export interface SkillStats extends BaseStats {
  skillId: number;
}

export interface CombatStats {
  overview_stats: OverviewStats;
  target_list: number[];
  actort_list: number[];
  target_start_time: Record<number, number>;
  target_last_time: Record<number, number>;
  nickname_map: Record<number, string>;
  actor_class_map: Record<number, string>;
  parsed_skill_code: Record<number, number>;
  actor_skill_slots: Record<number, Record<number, number[]>>;
  mob_code: Record<number, number>;
  last_target: number | null;
  duration: number;
  running_time: number;
  main_player: string;

  overview_stats_by_target: Record<number, BaseStats>;
  overview_stats_by_target_player: Record<number, Record<number, BaseStats>>;
  overview_stats_by_player: Record<number, BaseStats>;
  detailed_skills_stats_by_tagert_player: Record<
    number,
    Record<number, Record<number, BaseStats>>
  >;
  detailed_skills_stats_by_actor: Record<number, Record<number, BaseStats>>;
}

export interface MemoryStats {
  cpu_percent: Number;
  rss: Number;
  vms: Number;
  gpu_util: Number;
  memoryUtil: Number;
}

export interface CombatSummaryStats {
  id: string;
  created_at: string | null;
  data: CombatStats;
}
