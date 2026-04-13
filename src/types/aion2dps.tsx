export type SkillStats = {
  counts: number;
  total_damage?: number;
  totalDamage?: number;
  min_damage?: number;
  minDamage?: number;
  max_damage?: number;
  maxDamage?: number;
  special_counts?: Record<string, number>;
  specialCounts?: Record<string, number>;
};

export type SkillRecord = {
  time: number;
  skillCode: number;
  oriSkillCode: number;
  skillSpec: number[];
  damage: number;
  multiHitDamage: number;
  specialCounts: Record<string, number>;
  dot: boolean;
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
  byTargetPlayerStats: Record<string, Record<string, SkillStats>>;
  byTargetPlayerSkillStats: Record<string, Record<string, Record<string, SkillStats>>>;
  byTargetPlayerSkillRecords: Record<string, Record<string, SkillRecord[]>>;
  byTargetPlayerDpsCurve: Record<string, Record<string, Array<[number, number]>>>;
  combatInfos: CombatInfos;
};

export type MemorySnapshot = {
  cpuPercent: number;
  rssMb: number;
  vmsMb: number;
  memoryPercent: number;
  capDevice?: string | null;
  capPort?: string | null;
  packetSizes: Record<string, number>;
  pingMs?: number | null;
  pingHistory: Array<[number, number]>;
  mainActorName?: string | null;
};

export type DpsDetailPayload = {
  mode: "live" | "history";
  actorId: number;
  targetId: number;
  combatInfos: CombatInfos;
  playerStats: SkillStats | null;
  playerSkillStats: Record<string, SkillStats>;
  playerSkillRecords: SkillRecord[];
  playerDpsCurve: Array<[number, number]>;
};

export interface oneTargetAllPlayerStats {
  thisTargetAllPlayerStats: Record<string, SkillStats>;
  thisTargetAllPlayerSkillStats: Record<string, Record<string, SkillStats>>;
  thisTargetAllPlayerSkillRecords: Record<string, SkillRecord[]>;
  combatInfos: CombatInfos;
}

// 用来存放到历史中，扩展了id字段
export interface HistoryTargetRecord extends oneTargetAllPlayerStats {
  id: string;
  targetId: number;
}

export interface MainActorRecord {
  id: string;
  actorName: string;
  serverId: number;
  lastSeenAt: number;
}
