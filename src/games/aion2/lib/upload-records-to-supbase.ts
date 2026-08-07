import { supabase } from "@/lib/supabase";
import { getKnownBossMobCodes } from "@/games/aion2/lib/npc-names";
import type {
  BuffSummary,
  CombatInfos,
  PlayerOverviewStat,
  TargetInfo,
} from "@/games/aion2/types/aion2dps";

type BackendSkillStats = {
  counts: number;
  totalDamage?: number;
  minDamage?: number;
  maxDamage?: number;
  specialCounts?: Record<string, number>;
};

type BackendHistoryRecord = {
  id: string;
  targetId: number;
  totalDamage: number;
  targetInfo?: TargetInfo | null;
  combatInfos: CombatInfos;
  playerSkillStats: Record<string, Record<string, BackendSkillStats>>;
  playerStats: Record<string, PlayerOverviewStat>;
  useBuffsByTarget?: Record<string, BuffSummary[]>;
  createdAt: number;
  uploaded?: boolean;
};

type PartyDpsPlayer = {
  actor_id: number;
  actor_name: string;
  server_id: string;
  actor_class: string;
  damage: number;
  duration_ms: number;
  dps: number;
};

type LeaderboardUploadPayload = {
  record_id: string;
  target_mob_code: number;
  target_name: string | null;
  actor_name: string;
  server_id: string;
  actor_class: string;
  combat_power: number | null;
  damage: number;
  duration_ms: number;
  party_total_damage: number;
  team_dps: number;
  battle_ended_at: string;
  skill_details: Record<string, BackendSkillStats>;
  player_buffs: BuffSummary[];
  boss_buffs: BuffSummary[];
  party_dps: PartyDpsPlayer[];
};

type UploadFailure = {
  recordId: string;
  reason: string;
};

type UploadSkip = {
  recordId: string;
  targetMobCode?: number;
  targetName?: string | null;
  reason: string;
};

type UploadBuildResult =
  | {
      payloads: LeaderboardUploadPayload[];
    }
  | {
      skip: UploadSkip;
    };

type UploadProgress = {
  current: number;
  total: number;
  queued: number;
  skipped: number;
  failed: number;
  recordId: string;
  status: "queued" | "skipped" | "failed";
};

type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
};

const EXTRA_ALLOWED_DPS_UPLOAD_MOB_CODES = ["2400032", "2400035"];
const ALLOWED_DPS_UPLOAD_MOB_CODES = new Set([
  ...getKnownBossMobCodes(),
  ...EXTRA_ALLOWED_DPS_UPLOAD_MOB_CODES,
]);

function isAllowedDpsUploadMobCode(mobCode: unknown) {
  if (typeof mobCode !== "number" || !Number.isFinite(mobCode)) {
    return false;
  }
  return ALLOWED_DPS_UPLOAD_MOB_CODES.has(String(mobCode));
}

function getMinTime(values: Record<string, number> | undefined) {
  const numericValues = Object.values(values ?? {}).filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return 0;
  }
  return Math.min(...numericValues);
}

function getMaxTime(values: Record<string, number> | undefined) {
  const numericValues = Object.values(values ?? {}).filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return 0;
  }
  return Math.max(...numericValues);
}

function getDuration(startTime: number, lastTime: number) {
  if (startTime > 0 && lastTime > startTime) {
    return lastTime - startTime;
  }
  return 0;
}

function normalizeCombatPower(value: unknown) {
  const combatPower = Number(value ?? 0);
  if (!Number.isFinite(combatPower) || combatPower <= 0) {
    return null;
  }
  return Math.round(combatPower);
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? "Unknown error");
  }
  return String(error ?? "Unknown error");
}

function getTargetInfo(record: BackendHistoryRecord) {
  return record.targetInfo ?? record.combatInfos.targetInfos[String(record.targetId)] ?? null;
}

function skipRecord(
  record: BackendHistoryRecord,
  targetInfo: TargetInfo | null,
  reason: string
): UploadBuildResult {
  return {
    skip: {
      recordId: record.id,
      targetMobCode: targetInfo?.targetMobCode ?? undefined,
      targetName: targetInfo?.targetName ?? null,
      reason,
    },
  };
}

function buildLeaderboardUploadPayloads(record: BackendHistoryRecord): UploadBuildResult {
  const targetInfo = getTargetInfo(record);
  const targetMobCode = targetInfo?.targetMobCode;

  if (!targetMobCode) {
    return skipRecord(record, targetInfo, `target mob code is unlegal!`);
  }

  if (!isAllowedDpsUploadMobCode(targetMobCode)) {
    return skipRecord(
      record,
      targetInfo,
      `target mob code is not allowed: ${String(targetMobCode)}`
    );
  }

  const battleStartTime = targetInfo?.targetStartTime ?? {};
  const battleLastTime = targetInfo?.targetLastTime ?? {};
  const teamBattleStartTime = getMinTime(battleStartTime);
  const teamBattleLastTime = getMaxTime(battleLastTime);
  const teamBattleDuration = getDuration(teamBattleStartTime, teamBattleLastTime);

  const isMuzhuang = EXTRA_ALLOWED_DPS_UPLOAD_MOB_CODES.includes(targetMobCode.toString());

  if (isMuzhuang && teamBattleDuration < 60) {
    return skipRecord(
      record,
      targetInfo,
      `target ${targetMobCode} battle duration is less than 60 seconds: ${teamBattleDuration}`
    );
  }

  if (teamBattleDuration <= 10) {
    return skipRecord(
      record,
      targetInfo,
      `target battle duration is less than 10 seconds: ${teamBattleDuration}`
    );
  }

  const currentHp = Number(targetInfo?.currentHp ?? 0);
  if (!isMuzhuang && currentHp > 0) {
    return skipRecord(record, targetInfo, `boss is still alive, currentHp=${currentHp}`);
  }

  const totalDamageContribution = Object.values(record.playerStats ?? {}).reduce((sum, stats) => {
    const contribution = Number(stats?.damageContribution ?? 0);
    return Number.isFinite(contribution) && contribution > 0 ? sum + contribution : sum;
  }, 0);
  if (totalDamageContribution < 0.9) {
    return skipRecord(
      record,
      targetInfo,
      `total player damage contribution is less than 90%: ${(totalDamageContribution * 100).toFixed(1)}%`
    );
  }

  const partyTotalDamage = Object.values(record.playerStats ?? {}).reduce(
    (sum, stats) => sum + Number(stats?.totalDamage ?? 0),
    0
  );
  const teamDps = teamBattleDuration > 0 ? partyTotalDamage / teamBattleDuration : 0;
  const partyDps = Object.values(record.combatInfos.actorInfos ?? {})
    .map((actor): PartyDpsPlayer | null => {
      const id = String(actor.id);
      const actorDamage = Math.round(Number(record.playerStats?.[id]?.totalDamage ?? 0));
      const duration = getDuration(
        Number(battleStartTime[id] ?? 0),
        Number(battleLastTime[id] ?? 0)
      );
      const name = actor.actorName?.trim();
      const actorServerId = String(actor.actorServerId ?? "").trim();
      const actorClassCode = actor.actorClass?.trim();
      if (!name || !actorServerId || !actorClassCode || actorDamage <= 0 || duration <= 0) {
        return null;
      }
      return {
        actor_id: actor.id,
        actor_name: name,
        server_id: actorServerId,
        actor_class: actorClassCode,
        damage: actorDamage,
        duration_ms: Math.round(duration * 1000),
        dps: Math.round(actorDamage / duration),
      };
    })
    .filter((player): player is PartyDpsPlayer => player !== null)
    .sort((left, right) => right.damage - left.damage);

  if (partyDps.length === 0) {
    return skipRecord(record, targetInfo, "no valid players are available");
  }

  const eligiblePlayers = partyDps.filter(
    (player) => player.duration_ms / 1000 >= teamBattleDuration - 5
  );
  if (eligiblePlayers.length === 0) {
    return skipRecord(record, targetInfo, "no players meet the battle duration requirement");
  }

  const bossBuffs = record.useBuffsByTarget?.[String(record.targetId)] ?? [];
  const battleEndedAt = new Date(teamBattleLastTime * 1000).toISOString();
  const payloads = eligiblePlayers.map((player): LeaderboardUploadPayload => {
    const actorIdKey = String(player.actor_id);
    const actor = record.combatInfos.actorInfos[actorIdKey];
    return {
      record_id: `${record.id}:${player.actor_id}`,
      target_mob_code: targetMobCode,
      target_name: targetInfo?.targetName ?? null,
      actor_name: player.actor_name,
      server_id: player.server_id,
      actor_class: player.actor_class,
      combat_power: normalizeCombatPower(
        actor?.combatPower ?? record.playerStats?.[actorIdKey]?.combatPower
      ),
      damage: player.damage,
      duration_ms: player.duration_ms,
      party_total_damage: Math.round(partyTotalDamage),
      team_dps: Math.round(teamDps),
      battle_ended_at: battleEndedAt,
      skill_details: record.playerSkillStats?.[actorIdKey] ?? {},
      player_buffs: record.useBuffsByTarget?.[actorIdKey] ?? [],
      boss_buffs: bossBuffs,
      party_dps: partyDps,
    };
  });

  return {
    payloads,
  };
}

export async function isUserLoggedIn(): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return !!data?.session;
}

export async function uploadDpsDataBatch(
  records: BackendHistoryRecord[],
  options: UploadOptions = {}
) {
  // Check login before uploading
  const { data: session } = await supabase.auth.getSession();
  if (!session?.session) {
    throw new Error("Please log in first before uploading records.");
  }

  const uploadedRecordIds: string[] = [];
  const skips: UploadSkip[] = [];
  const failures: UploadFailure[] = [];
  let queued = 0;

  for (const [index, record] of records.entries()) {
    const current = index + 1;
    const result = buildLeaderboardUploadPayloads(record);

    if ("skip" in result) {
      skips.push(result.skip);
      options.onProgress?.({
        current,
        total: records.length,
        queued,
        skipped: skips.length,
        failed: failures.length,
        recordId: record.id,
        status: "skipped",
      });
      continue;
    }

    let status: UploadProgress["status"] = "queued";
    let recordFailed = false;

    for (const payload of result.payloads) {
      try {
        const { error } = await supabase.rpc("submit_dps_leaderboard_v2", {
          p_payload: payload,
        });

        if (!error) continue;

        failures.push({
          recordId: payload.record_id,
          reason: getErrorMessage(error),
        });
        recordFailed = true;
      } catch (error) {
        failures.push({
          recordId: payload.record_id,
          reason: getErrorMessage(error),
        });
        recordFailed = true;
      }
    }

    if (recordFailed) {
      status = "failed";
    } else {
      queued += 1;
      uploadedRecordIds.push(record.id);
    }

    options.onProgress?.({
      current,
      total: records.length,
      queued,
      skipped: skips.length,
      failed: failures.length,
      recordId: record.id,
      status,
    });
  }

  console.log(
    `[aion2-dps-upload] queued=${queued}, skipped=${skips.length}, failed=${failures.length}`
  );
  if (skips.length > 0) {
    console.table(skips);
  }
  if (failures.length > 0) {
    console.table(failures);
  }

  return {
    queued,
    skipped: skips.length,
    skips,
    failed: failures.length,
    failures,
    uploadedRecordIds,
  };
}
