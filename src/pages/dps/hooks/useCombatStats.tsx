import { useMemo } from "react";
import { CombatStats } from "../types";

interface UseCombatStatsParams {
  combatStats: CombatStats | null;
  view?: string; // 明确类型
  currentPlayer?: number | null;
  currentTarget?: number | null;
}

export function useCombatStats({
  combatStats,
  view = "dps",
  currentPlayer = null,
  currentTarget = null,
}: UseCombatStatsParams) {
  return useMemo(() => {
    const totalDamage = combatStats?.overview_stats?.total_damage || 0;
    const duration = combatStats?.duration || 0;
    const running_time = combatStats?.running_time || 1e-5;
    const targetList = combatStats?.target_list ?? [];

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

    // 玩家过滤并排序
    const playerStatsArray = Object.entries(playerStats)
      .map(([playerId, stats]) => ({
        playerId: parseInt(playerId, 10),
        ...(stats as any),
      }))
      .filter((p) => !isNaN(p.playerId) && p.total_damage > 10000)
      .sort((a, b) => b.total_damage - a.total_damage)
      .slice(0, 10);

    const maxDamagePlayer = playerStatsArray[0]?.total_damage || 0;

    // 获取当前玩家，对当前目标的详细技能统计
    const getCurPlayerTargetDetailedSkills = () => {
      if (currentPlayer && currentTarget) {
        return (
          combatStats?.detailed_skills_stats_by_tagert_player?.[
            currentTarget
          ]?.[currentPlayer] || {}
        );
      } else if (currentPlayer && !currentTarget) {
        return (
          combatStats?.detailed_skills_stats_by_actor?.[currentPlayer] || {}
        );
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
      totalDamage,
      duration,
      running_time,
      playerStatsArray,
      maxDamagePlayer,
      nicknameMap,
      targetList,
      mainPlayerName,
      curPlayerTargetDetailedSkillsArray,
      actorClassMap,
      actorSkillSlots,
      parsedSkillCodeMap,
      mobCodeMap,
    };
  }, [combatStats, view, currentPlayer, currentTarget]);
}
