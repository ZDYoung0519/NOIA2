export type SkillStats = {
  counts: number;
  totalDamage: number;
  minDamage: number;
  maxDamage: number;
  specialCounts: Record<string, number>;
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

