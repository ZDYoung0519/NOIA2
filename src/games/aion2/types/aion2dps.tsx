export type SkillStats = {
  counts: number;
  totalDamage?: number;
  total_damage?: number;
  minDamage?: number;
  min_damage?: number;
  maxDamage?: number;
  max_damage?: number;
  specialCounts?: Record<string, number>;
  special_counts?: Record<string, number>;
};

export type PlayerOverviewStat = {
  actorId: number;
  actorName: string;
  actorServerId: string;
  actorClass: string;
  counts: number;
  totalDamage?: number;
  minDamage?: number;
  maxDamage?: number;
  specialCounts?: Record<string, number>;
  dps: number;
  damageShare: number;
  damageContribution: number;
};

export type ActorInfo = {
  id: number;
  actorName?: string | null;
  actorServerId?: string | null;
  actorClass?: string | null;
  actorSkillSpec: Record<string, number[]>;
};

export type TargetInfo = {
  id: number;
  targetMobCode?: number | null;
  targetName?: string | null;
  isBoss: boolean;
  currentHp?: number | null;
  maxHp?: number | null;
  targetStartTime: Record<string, number>;
  targetLastTime: Record<string, number>;
};

export type CombatInfos = {
  actorInfos: Record<string, ActorInfo>;
  targetInfos: Record<string, TargetInfo>;
  mainActorId?: number | null;
  mainActorName?: string | null;
  lastTargetByMainActor?: number | null;
  lastTarget?: number | null;
  timeNow: number;
};

export type CombatSnapshot = {
  totalDamage: number;
  byTargetPlayerSkillStats: Record<string, Record<string, Record<string, SkillStats>>>;
  byTargetPlayerStats: Record<string, Record<string, PlayerOverviewStat>>;
  combatInfos: CombatInfos;
  lastTargetInfo?: TargetInfo | null;
  lastTargetAllPlayersOverviewStats: PlayerOverviewStat[];
  mainActorReceivedPlayerOverviewStats: PlayerOverviewStat[];
};

export type HistoryRecord = {
  id: string;
  targetId: number;
  totalDamage: number;
  targetInfo?: TargetInfo | null;
  combatInfos: CombatInfos;
  playerSkillStats: Record<string, Record<string, SkillStats>>;
  playerStats: Record<string, PlayerOverviewStat>;
  createdAt: number;
  uploaded?: boolean;
};

export interface MainActorRecord {
  id: string;
  actorName: string;
  serverId: number;
  lastSeenAt: number;
}
