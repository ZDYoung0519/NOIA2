import { memo } from "react";
import { SkillStats, TargetInfo, CombatInfos} from "@/types/aion2dps";


import { getServerShortName } from "@/lib/aion2/servers";


const DpsPanel = function DpsPanel({
  targetInfo,
  thisTargetPlayerStats,
  combatInfos,
  mainPlayerColor,
  otherPlayerColor,
  onPlayerClicked,
}: {
  targetInfo: TargetInfo | undefined;
  thisTargetPlayerStats: Record<number, SkillStats> | undefined;
  combatInfos: CombatInfos | undefined;
  mainPlayerColor: string;
  otherPlayerColor: string;
  onPlayerClicked: (playerId: number) => void;
}) {
  if (!targetInfo || !thisTargetPlayerStats || !combatInfos) return;

  const actorInfos = combatInfos.actorInfos;
  const mainActorId = combatInfos.mainActorId;

  const thisTargetPlayerStatsArray = Object.entries(thisTargetPlayerStats)
    .map(([playerId, stats]) => ({
      playerId: parseInt(playerId, 10),
      ...(stats as any),
    }))
    .sort((a, b) => b.total_damage - a.total_damage);
  if (thisTargetPlayerStatsArray.length === 0) return null;

  const maxDamage = thisTargetPlayerStatsArray[0]?.total_damage || 0;
  const totalDamage = thisTargetPlayerStatsArray.reduce(
    (sum, e) => sum + e.total_damage,
    0,
  );

  const thisTargetLastTime = Math.max(
    ...Object.values(
      targetInfo?.targetLastTime || {},
    ),
  );

  return (
    <div className="space-y-0">
      {thisTargetPlayerStatsArray.slice(0, 8).map((player, index) => {
        const playerName =
          actorInfos?.[player.playerId].actorName ||
          `Unknown(${player.playerId})`;
        const actorClass = actorInfos?.[player.playerId].actorClass;
        const playerServerId = actorInfos?.[player.playerId].actorServerId;
        const playerServerName = playerServerId
          ? getServerShortName(Number(playerServerId))
          : `未知`;

        // if (!actorClass && settings.showPlayerOnly) return null;

        const actorClassIcon = actorClass
          ? `images/class/${actorClass.toLowerCase()}.webp`
          : "/images/aion2.png";

        const isMainPlayer = mainActorId === player.playerId;

        const barPercent =
          maxDamage > 0 ? (player.total_damage / maxDamage) * 100 : 0;

        // 角色对目标的战斗时间
        const playerStartTime =
          targetInfo.targetLastTime?.[player.playerId];
        const playerFightTime = thisTargetLastTime - playerStartTime;

        const dpsValue = player.total_damage / playerFightTime;
        // const dpsPercent = maxDamage > 0 ? (dpsValue / maxDamage) * 100 : 0;
        const damagePercent =
          totalDamage > 0 ? (player.total_damage / totalDamage) * 100 : 0;

        return (
          <div
            key={player.playerId || index}
            className={`group relative flex items-center h-7 rounded cursor-pointer overflow-hidden hover:bg-white/5`}
            onClick={() => onPlayerClicked(player.playerId)}
          >
            {/* 伤害进度条背景 */}
            <div
              className="absolute left-0 top-0 bottom-0 rounded transition-all duration-500 ease-out"
              style={{
                width: `${barPercent}%`,
                background: isMainPlayer
                  ? mainPlayerColor
                  : otherPlayerColor,
              }}
            />

            {/* 内容容器 */}
            <div className="relative w-full flex items-center justify-between py-1.5 px-1 z-10">
              {/* 左侧区域 */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {/* 职业图标 */}
                <div className="relative w-7 h-7 flex-shrink-0">
                  <img
                    src={actorClassIcon}
                    alt={actorClass || "class"}
                    className="w-full h-full object-cover rounded-md shadow-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>

                {/* 玩家名称 */}
                <span className="truncate font-medium text-sm">
                  {playerName}
                </span>

                {/* 服务器 */}
                <span className="text-xs text-gray-500 flex-shrink-0 font-mono">
                  [{playerServerName}]
                </span>
              </div>

              {/* 右侧数据区域 */}
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* 总伤害 */}
                <div className="text-right">
                  <span className="text-sm font-mono tabular-nums text-gray-200">
                    {(player.total_damage / 10000).toFixed(1)}
                  </span>
                  <span className="text-xs text-gray-500 ml-0.5">w</span>
                </div>

                {/* 秒伤 */}
                <div className="text-right">
                  <span
                    className={`
                    text-sm font-mono tabular-nums font-medium
                    ${dpsValue > 0 ? "text-emerald-400" : "text-gray-400"}
                  `}
                  >
                    {Math.floor(dpsValue).toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-500 ml-0.5">/s</span>
                </div>

                {/* 占比 */}
                <div className="text-right">
                  <span className="text-sm font-mono tabular-nums text-gray-300">
                    {damagePercent.toFixed(0)}
                  </span>
                  <span className="text-xs text-gray-500 ml-0.5">%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const MemoizedDpsPanel = memo(DpsPanel);

