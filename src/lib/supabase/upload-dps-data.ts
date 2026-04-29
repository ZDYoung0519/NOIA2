import { HistoryTargetRecord, SkillStats } from "@/types/aion2dps";
import { supabase } from "@/lib/supabase/supabase";

function getSkillStatsTotalDamage(stats: SkillStats | undefined) {
  return Number(stats?.total_damage ?? 0);
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

export const uploadDpsDataBatch = async (records: HistoryTargetRecord[]) => {
  try {
    const toUploadData = records.map((record) => {
      const targetIdKey = String(record.targetId);
      const targetInfo = record.combatInfos.targetInfos[targetIdKey];
      const actorInfos = record.combatInfos.actorInfos;

      const mainActorId = record.combatInfos.mainActorId;
      const mainActorIdKey = String(mainActorId ?? "");
      const mainActorInfo = mainActorIdKey ? actorInfos[mainActorIdKey] : undefined;

      const battleStartTime = targetInfo?.targetStartTime ?? {};
      const battleLastTime = targetInfo?.targetLastTime ?? {};
      const teamBattleStartTime = getMinTime(battleStartTime);
      const teamBattleLastTime = getMaxTime(battleLastTime);
      const teamBattleDuration = getDuration(teamBattleStartTime, teamBattleLastTime);

      const partyTotalDamage = Object.values(record.thisTargetAllPlayerStats ?? {}).reduce(
        (sum, stats) => sum + getSkillStatsTotalDamage(stats),
        0
      );

      const teamDps = teamBattleDuration > 0 ? partyTotalDamage / teamBattleDuration : 0;

      const mainActorDamage =
        mainActorId != null
          ? getSkillStatsTotalDamage(record.thisTargetAllPlayerStats?.[String(mainActorId)])
          : 0;

      const mainActorBattleStartTime =
        mainActorId != null ? Number(battleStartTime[String(mainActorId)] ?? 0) : 0;
      const mainActorBattleLastTime =
        mainActorId != null ? Number(battleLastTime[String(mainActorId)] ?? 0) : 0;
      const mainActorBattleDuration = getDuration(
        mainActorBattleStartTime,
        mainActorBattleLastTime
      );
      const mainActorDps =
        mainActorBattleDuration > 0 ? mainActorDamage / mainActorBattleDuration : 0;

      return {
        record_id: record.id,
        created_at: new Date().toISOString(),
        battle_ended_at: teamBattleLastTime > 0 ? new Date(teamBattleLastTime * 1000).toISOString() : null,
        target_mob_code: targetInfo?.targetMobCode ?? null,
        target_name: targetInfo?.targetName ?? null,
        is_boss: targetInfo?.isBoss ?? false,
        target_max_hp: targetInfo?.maxHp ?? null,
        battle_start_time: battleStartTime,
        battle_last_time: battleLastTime,
        team_battle_duration: teamBattleDuration,
        party_total_damage: partyTotalDamage,
        team_dps: teamDps,
        main_actor_name: record.combatInfos.mainActorName ?? null,
        main_actor_server_id: mainActorInfo?.actorServerId ?? null,
        main_actor_class: mainActorInfo?.actorClass ?? null,
        main_actor_damage: mainActorDamage,
        main_actor_battle_duration: mainActorBattleDuration,
        main_actor_dps: mainActorDps,
        data: record,
      };
    });

    const { error } = await supabase.from("aion2_dps").upsert(toUploadData, {
      onConflict: "record_id",
      ignoreDuplicates: false,
    });

    if (error) throw error;

    console.log(`Uploaded ${toUploadData.length} DPS records successfully.`);
  } catch (err) {
    console.error("Failed to upload DPS records in batch:", err);
    throw err;
  }
};
