import { useMemo } from "react";
import { CombatStats } from "../types";
import { AppSettings } from "./useSettings";

interface UseCombatStatsParams {
  combatStats: CombatStats | null;
  view?: string; // 明确类型
  currentPlayer?: number | null;
  currentTarget?: number | null;
  settings?: AppSettings;
}

export function processCombatStats({
  combatStats,
  currentPlayer = null,
  currentTarget = null,
  settings,
}: UseCombatStatsParams) {
  const totalDamage = combatStats?.overview_stats?.total_damage || 0; // 总计伤害
  const targetDamage = combatStats?.overview_stats_by_target || {}; // 每个目标受到的统计
  // 当前目标受到的总伤
  const currentTargetDamage = currentTarget
    ? targetDamage[currentTarget]?.total_damage || 0
    : totalDamage;

  const duration = combatStats?.duration || 0;
  const running_time = combatStats?.running_time || 1e-5;
  const targetList = combatStats?.target_list ?? [];
  const targetStartTime = combatStats?.target_start_time ?? {};
  const targetLastTime = combatStats?.target_last_time ?? {};

  // 当前目标的实际战斗时长
  let actual_running_time = null;
  if (currentTarget === null) {
    actual_running_time = running_time;
  } else if (targetStartTime[currentTarget] && targetLastTime[currentTarget]) {
    actual_running_time =
      targetLastTime[currentTarget] - targetStartTime[currentTarget];
  } else {
    actual_running_time = running_time;
  }
  // 最后受到我伤害的目标
  const auto_target =
    combatStats?.last_target_by_me || combatStats?.last_target || null;

  const nicknameMap = combatStats?.nickname_map || {};
  const actorClassMap = combatStats?.actor_class_map || {};
  const mainPlayerName = combatStats?.main_player || "Unknown";

  const actorSkillSlots = combatStats?.actor_skill_slots || {};
  const parsedSkillCodeMap = combatStats?.parsed_skill_code || {};
  const mobCodeMap = combatStats?.mob_code || {};

  // 获取当前目标下，玩家统计数据，如果没有当前目标，那么默认为所有
  const playerStats = currentTarget
    ? combatStats?.overview_stats_by_target_player?.[currentTarget] || {}
    : combatStats?.overview_stats_by_player || {};

  const playerStatsArray = Object.entries(playerStats)
    .map(([playerId, stats]) => ({
      playerId: parseInt(playerId, 10),
      ...(stats as any),
    }))
    .filter((p) => !isNaN(p.playerId))
    .filter((p) => settings?.showMobStats || actorClassMap[p.playerId]) // showMobStats为False时，只显示识别出职业的player
    // .filter((p) => p.total_damage > 10000)
    .sort((a, b) => b.total_damage - a.total_damage) // 排序
    .slice(0, settings?.maxDisplayCount);

  const maxDamagePlayer = playerStatsArray[0]?.total_damage || 0; // 当前玩家最大伤害

  // 获取当前玩家，对当前目标的详细技能统计
  const getCurPlayerTargetDetailedSkills = () => {
    if (currentPlayer && currentTarget) {
      return (
        combatStats?.detailed_skills_stats_by_tagert_player?.[currentTarget]?.[
          currentPlayer
        ] || {}
      );
    } else if (currentPlayer && !currentTarget) {
      return combatStats?.detailed_skills_stats_by_actor?.[currentPlayer] || {};
    }
    return {};
  };
  const curPlayerTargetDetailedSkills = getCurPlayerTargetDetailedSkills();
  const curPlayerTargetDetailedSkillsArray = Object.entries(
    curPlayerTargetDetailedSkills,
  )
    .map(([skill, stats]) => ({
      skillId: parseInt(skill, 10),
      ...(stats as any),
    }))
    .filter((s) => !isNaN(s.skillId))
    .sort((a, b) => b.total_damage - a.total_damage);

  return {
    currentTargetDamage,
    targetDamage,
    auto_target,
    duration,
    actual_running_time,
    playerStatsArray,
    maxDamagePlayer,
    nicknameMap,
    targetList,
    targetStartTime,
    targetLastTime,
    mainPlayerName,
    curPlayerTargetDetailedSkillsArray,
    actorClassMap,
    actorSkillSlots,
    parsedSkillCodeMap,
    mobCodeMap,
  };
}

export function useCombatStats({
  combatStats,
  currentPlayer = null,
  currentTarget = null,
  settings,
}: UseCombatStatsParams) {
  return useMemo(() => {
    return processCombatStats({
      combatStats,
      currentPlayer,
      currentTarget,
      settings,
    });
  }, [combatStats, currentPlayer, currentTarget]);
}
