import { supabase } from "@/lib/supabase";
import { getKnownBossMobCodes } from "@/games/aion2/lib/npc-names";
import type { CombatInfos, PlayerOverviewStat, TargetInfo } from "@/games/aion2/types/aion2dps";

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
  createdAt: number;
  uploaded?: boolean;
};

type QueueUploadPayload = {
  record_id: string;
  created_at: string;
  battle_ended_at: string | null;
  target_mob_code: number;
  target_name: string | null;
  is_boss: boolean;
  target_max_hp: number | null;
  battle_start_time: Record<string, number>;
  battle_last_time: Record<string, number>;
  team_battle_duration: number;
  party_total_damage: number;
  team_dps: number;
  players: QueueUploadPlayer[];
};

type QueueUploadPlayer = {
  actor_id: number;
  actor_name: string | null | undefined;
  actor_server_id: string | null | undefined;
  actor_class: string | null | undefined;
  combat_power: number | null;
  damage: number;
  battle_duration: number;
  dps: number;
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
      payload: QueueUploadPayload;
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

const EXTRA_ALLOWED_DPS_UPLOAD_MOB_CODES = ["2400032"];
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

function buildQueueUploadPayload(record: BackendHistoryRecord): UploadBuildResult {
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

  if (targetMobCode === 2400032 && teamBattleDuration < 60) {
    return skipRecord(
      record,
      targetInfo,
      `target 2400032 battle duration is less than 60 seconds: ${teamBattleDuration}`
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
  if (targetMobCode !== 2400032 && currentHp > 0) {
    return skipRecord(record, targetInfo, `boss is still alive, currentHp=${currentHp}`);
  }
  const partyTotalDamage = Object.values(record.playerStats ?? {}).reduce(
    (sum, stats) => sum + Number(stats?.totalDamage ?? 0),
    0
  );
  const teamDps = teamBattleDuration > 0 ? partyTotalDamage / teamBattleDuration : 0;
  const players = Object.values(record.combatInfos.actorInfos ?? {}).map((actor) => {
    const actorId = actor.id;
    const actorIdKey = String(actorId);
    const damage = Number(record.playerStats?.[actorIdKey]?.totalDamage ?? 0);
    const actorBattleStartTime = Number(battleStartTime[actorIdKey] ?? 0);
    const actorBattleLastTime = Number(battleLastTime[actorIdKey] ?? 0);
    const battleDuration = getDuration(actorBattleStartTime, actorBattleLastTime);

    return {
      actor_id: actorId,
      actor_name: actor.actorName ?? null,
      actor_server_id: actor.actorServerId ?? null,
      actor_class: actor.actorClass ?? null,
      combat_power: normalizeCombatPower(
        actor.combatPower ?? record.playerStats?.[actorIdKey]?.combatPower
      ),
      damage,
      battle_duration: battleDuration,
      dps: battleDuration > 0 ? damage / battleDuration : 0,
    };
  });

  return {
    payload: {
      record_id: record.id,
      created_at: new Date().toISOString(),
      battle_ended_at:
        teamBattleLastTime > 0 ? new Date(teamBattleLastTime * 1000).toISOString() : null,
      target_mob_code: targetMobCode,
      target_name: targetInfo?.targetName ?? null,
      is_boss: targetInfo?.isBoss ?? false,
      target_max_hp: targetInfo?.maxHp ?? null,
      battle_start_time: battleStartTime,
      battle_last_time: battleLastTime,
      team_battle_duration: teamBattleDuration,
      party_total_damage: partyTotalDamage,
      team_dps: teamDps,
      players,
    },
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
    const result = buildQueueUploadPayload(record);

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

    const payload = result.payload;
    let status: UploadProgress["status"] = "queued";
    try {
      const { error } = await supabase.rpc("upload_to_records_process_queue", {
        p_payload: payload,
      });

      if (error) {
        failures.push({
          recordId: payload.record_id,
          reason: getErrorMessage(error),
        });
        status = "failed";
      } else {
        queued += 1;
        uploadedRecordIds.push(payload.record_id);
      }
    } catch (error) {
      failures.push({
        recordId: payload.record_id,
        reason: getErrorMessage(error),
      });
      status = "failed";
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
