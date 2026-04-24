import { memo } from "react";
import { CombatInfos, SkillStats, TargetInfo } from "@/types/aion2dps";
import { getServerShortName } from "@/lib/aion2/servers";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { maskNickname } from "@/lib/name-mask";

function getTotalDamage(stats: SkillStats | undefined) {
  if (!stats) {
    return 0;
  }

  return stats.total_damage ?? stats.totalDamage ?? 0;
}

const DpsPanel = function DpsPanel({
  targetInfo,
  thisTargetPlayerStats,
  combatInfos,
  mainPlayerColor,
  otherPlayerColor,
  barOpacity,
  maskNicknames,
  onPlayerClicked,
  onPlayerHovered,
  onPlayerHoverEnd,
}: {
  targetInfo: TargetInfo | undefined;
  thisTargetPlayerStats: Record<number, SkillStats> | undefined;
  combatInfos: CombatInfos | undefined;
  mainPlayerColor: string;
  otherPlayerColor: string;
  barOpacity?: number;
  maskNicknames?: boolean;
  onPlayerClicked: (playerId: number) => void;
  onPlayerHovered?: (playerId: number) => void;
  onPlayerHoverEnd?: (playerId: number) => void;
}) {
  const { t } = useAppTranslation();

  if (!targetInfo || !thisTargetPlayerStats || !combatInfos) return null;

  const actorInfos = combatInfos.actorInfos;
  const mainActorId = combatInfos.mainActorId;

  const thisTargetPlayerStatsArray = Object.entries(thisTargetPlayerStats)
    .map(([playerId, stats]) => ({
      playerId: parseInt(playerId, 10),
      totalDamageValue: getTotalDamage(stats as SkillStats),
    }))
    .sort((a, b) => b.totalDamageValue - a.totalDamageValue);

  if (thisTargetPlayerStatsArray.length === 0) return null;

  const maxDamage = thisTargetPlayerStatsArray[0]?.totalDamageValue || 0;
  const totalDamage = thisTargetPlayerStatsArray.reduce(
    (sum, entry) => sum + entry.totalDamageValue,
    0
  );
  const targetLastTimes = Object.values(targetInfo.targetLastTime || {});
  const thisTargetLastTime = targetLastTimes.length > 0 ? Math.max(...targetLastTimes) : 0;

  return (
    <div className="space-y-0">
      {thisTargetPlayerStatsArray.slice(0, 8).map((player, index) => {
        const playerName =
          actorInfos?.[player.playerId]?.actorName || `${t("dps.list.unknownPlayer")}(${player.playerId})`;
        const displayPlayerName = maskNickname(playerName, Boolean(maskNicknames));
        const actorClass = actorInfos?.[player.playerId]?.actorClass;
        const playerServerId = actorInfos?.[player.playerId]?.actorServerId;
        const playerServerName = playerServerId
          ? getServerShortName(Number(playerServerId))
          : t("dps.list.unknownServer");

        const actorClassIcon = actorClass
          ? `images/class/${actorClass.toLowerCase()}.webp`
          : "/images/aion2.png";

        const isMainPlayer = mainActorId === player.playerId;
        const barPercent = maxDamage > 0 ? (player.totalDamageValue / maxDamage) * 100 : 0;
        const playerStartTime = targetInfo.targetStartTime?.[player.playerId];
        const fightDurationSeconds = Math.max(
          1,
          thisTargetLastTime - (playerStartTime ?? thisTargetLastTime)
        );
        const dpsValue = player.totalDamageValue / fightDurationSeconds;
        const damagePercent =
          totalDamage > 0 ? (player.totalDamageValue / totalDamage) * 100 : 0;

        return (
          <div
            key={player.playerId || index}
            className="group relative flex h-7 cursor-pointer items-center overflow-hidden rounded border border-transparent hover:bg-white/5 hover:border hover:border-cyan-500"
            onClick={() => onPlayerClicked(player.playerId)}
            onMouseEnter={() => onPlayerHovered?.(player.playerId)}
            onMouseLeave={() => onPlayerHoverEnd?.(player.playerId)}
          >
            <div
              className="absolute bottom-0 left-0 top-0 rounded transition-all duration-500 ease-out"
              style={{
                width: `${barPercent}%`,
                background: isMainPlayer ? mainPlayerColor : otherPlayerColor,
                opacity: Math.min(100, Math.max(0, barOpacity ?? 100)) / 100,
              }}
            />

            <div className="relative z-10 flex w-full items-center justify-between px-1 py-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="relative h-7 w-7 flex-shrink-0">
                  <img
                    src={actorClassIcon}
                    alt={actorClass || "class"}
                    className="h-full w-full rounded-md object-cover shadow-sm"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                    onContextMenu={(e) => e.preventDefault()}
                  />
                </div>

                <span className="truncate text-sm font-medium">{displayPlayerName}</span>

                <span className="flex-shrink-0 font-mono text-xs text-gray-500">
                  [{playerServerName}]
                </span>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="text-right">
                  <span className="font-mono text-sm tabular-nums text-gray-200">
                    {(player.totalDamageValue / 10000).toFixed(1)}
                  </span>
                  <span className="ml-0.5 text-xs text-gray-500">w</span>
                </div>

                <div className="text-right">
                  <span
                    className={`text-sm font-medium font-mono tabular-nums ${
                      dpsValue > 0 ? "text-emerald-400" : "text-gray-400"
                    }`}
                  >
                    {Math.floor(dpsValue).toLocaleString()}
                  </span>
                  <span className="ml-0.5 text-xs text-gray-500">/s</span>
                </div>

                <div className="text-right">
                  <span className="font-mono text-sm tabular-nums text-gray-300">
                    {damagePercent.toFixed(0)}
                  </span>
                  <span className="ml-0.5 text-xs text-gray-500">%</span>
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
