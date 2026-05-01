import { memo } from "react";
import { CombatInfos, SkillStats, TargetInfo } from "@/types/aion2dps";
import { getServerShortName } from "@/lib/aion2/servers";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { maskNickname } from "@/lib/name-mask";
import { clamp } from "framer-motion";

function getTotalDamage(stats: SkillStats | undefined) {
  if (!stats) {
    return 0;
  }

  return stats.total_damage ?? 0;
}

const DpsPanel = function DpsPanel({
  targetInfo,
  thisTargetPlayerStats,
  combatInfos,
  mainPlayerColor,
  otherPlayerColor,
  barOpacity,
  maskNicknames,
  percentDisplayMode = "damageShare",
  classIconStyle = "default",
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
  percentDisplayMode?: "contribution" | "damageShare";
  classIconStyle?: "default" | "colored";
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
  const targetMaxHp = targetInfo.maxHp ?? 0;
  const targetLastTimes = Object.values(targetInfo.targetLastTime || {});
  const thisTargetLastTime = targetLastTimes.length > 0 ? Math.max(...targetLastTimes) : 0;

  return (
    <div className="space-y-0">
      {thisTargetPlayerStatsArray.slice(0, 8).map((player, index) => {
        const playerName =
          actorInfos?.[player.playerId]?.actorName ||
          `${t("dps.list.unknownPlayer")}(${player.playerId})`;
        const displayPlayerName = maskNickname(playerName, Boolean(maskNicknames));
        const actorClass = actorInfos?.[player.playerId]?.actorClass;
        const playerServerId = actorInfos?.[player.playerId]?.actorServerId;
        const playerServerName = playerServerId
          ? getServerShortName(Number(playerServerId))
          : t("dps.list.unknownServer");

        const actorClassIcon = actorClass
          ? classIconStyle === "default"
            ? `/images/class/${actorClass.toLowerCase()}.webp`
            : `/images/class/${actorClass.toLowerCase()}.png`
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
          percentDisplayMode === "contribution"
            ? targetMaxHp > 0
              ? (player.totalDamageValue / targetMaxHp) * 100
              : 0
            : totalDamage > 0
              ? (player.totalDamageValue / totalDamage) * 100
              : 0;
        const damagePercentDisplay = clamp(0, 100, damagePercent);
        return (
          <div
            key={player.playerId || index}
            className="group relative flex h-7 cursor-pointer items-center overflow-hidden rounded border border-transparent hover:border hover:border-cyan-500 hover:bg-white/5"
            onClick={() => onPlayerClicked(player.playerId)}
            onMouseEnter={() => onPlayerHovered?.(player.playerId)}
            onMouseLeave={() => onPlayerHoverEnd?.(player.playerId)}
          >
            <div
              className="absolute top-0 bottom-0 left-0 rounded transition-all duration-500 ease-out"
              style={{
                width: `${barPercent}%`,
                background: isMainPlayer ? mainPlayerColor : otherPlayerColor,
                opacity: Math.min(100, Math.max(0, barOpacity ?? 100)) / 100,
              }}
            />

            <div className="relative z-10 flex w-full items-center justify-between px-0 py-1.5">
              <div className="flex min-w-0 flex-1 items-center gap-1">
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

                <span className="truncate font-mono font-sans text-sm">
                  {displayPlayerName}[{playerServerName}]
                </span>
              </div>

              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="text-right">
                  <span className="font-mono text-sm text-gray-100 tabular-nums">
                    {(player.totalDamageValue / 10000).toFixed(1)}w
                  </span>
                </div>

                <div className="text-right">
                  <span className="font-mono text-sm font-medium text-green-400 tabular-nums">
                    {Math.floor(dpsValue).toLocaleString()}/s
                  </span>
                </div>

                <div className="text-right">
                  <span className="font-mono text-sm text-gray-200 tabular-nums">
                    {damagePercentDisplay.toFixed(1)}%
                  </span>
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
