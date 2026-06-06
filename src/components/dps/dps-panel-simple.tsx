import { memo } from "react";
import { clamp } from "framer-motion";

import { MemoizedBossHealthBar } from "@/components/dps/boss-health-bar";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getServerName } from "@/lib/aion2/servers";
import { maskNickname } from "@/lib/name-mask";
import { cn } from "@/lib/utils";
import { CombatInfos, SkillStats, TargetInfo } from "@/types/aion2dps";

type DpsPanelProps = {
  targetInfo: TargetInfo | undefined;
  thisTargetPlayerStats: Record<number, SkillStats> | undefined;
  combatInfos: CombatInfos | undefined;
  mainPlayerColor: string;
  otherPlayerColor: string;
  barOpacity?: number;
  maskNicknames?: boolean;
  percentDisplayMode?: "contribution" | "damageShare";
  showTargetHpBar?: boolean;
  classIconStyle?: "default" | "colored";
  showPlayerName?: boolean;
  showServerName?: boolean;
  backgroundColor?: string;
  onPlayerClicked: (playerId: number) => void;
  onPlayerHovered?: (playerId: number) => void;
  onPlayerHoverEnd?: (playerId: number) => void;
};

type RgbColor = {
  r: number;
  g: number;
  b: number;
};

const CLASS_COLOR_PRESETS: Record<string, string> = {
  GLADIATOR: "#42aff8",
  TEMPLAR: "#2361e7",
  ASSASSIN: "#07e707",
  RANGER: "#14a37f",
  SORCERER: "#530a97",
  ELEMENTALIST: "#b1056f",
  CLERIC: "#e0d72d",
  CHANTER: "#f17334",
};

function getTotalDamage(stats: SkillStats | undefined) {
  return stats?.total_damage ?? 0;
}

function formatCompactDamage(value: number) {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}e`;
  }

  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(0)}w`;
  }

  return Math.floor(value).toLocaleString();
}

function clampColorChannel(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseColor(value: string): RgbColor | null {
  const trimmed = value.trim();

  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    const normalized =
      hex.length === 3
        ? hex
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : hex.padEnd(6, "0").slice(0, 6);
    const r = parseInt(normalized.slice(0, 2), 16);
    const g = parseInt(normalized.slice(2, 4), 16);
    const b = parseInt(normalized.slice(4, 6), 16);

    if ([r, g, b].some((channel) => Number.isNaN(channel))) {
      return null;
    }

    return { r, g, b };
  }

  const rgbMatch = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (!rgbMatch) {
    return null;
  }

  const [r, g, b] = rgbMatch[1].split(",").map((part) => Number(part.trim()));

  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return null;
  }

  return {
    r: clampColorChannel(r),
    g: clampColorChannel(g),
    b: clampColorChannel(b),
  };
}

function rgbToHsl({ r, g, b }: RgbColor) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * ((blue - red) / delta + 2);
    } else {
      hue = 60 * ((red - green) / delta + 4);
    }
  }

  return {
    h: (hue + 360) % 360,
    s: saturation,
    l: lightness,
  };
}

function hslToRgb(h: number, s: number, l: number): RgbColor {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const normalizedHue = h / 60;
  const x = chroma * (1 - Math.abs((normalizedHue % 2) - 1));
  const match = l - chroma / 2;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (normalizedHue >= 0 && normalizedHue < 1) {
    red = chroma;
    green = x;
  } else if (normalizedHue < 2) {
    red = x;
    green = chroma;
  } else if (normalizedHue < 3) {
    green = chroma;
    blue = x;
  } else if (normalizedHue < 4) {
    green = x;
    blue = chroma;
  } else if (normalizedHue < 5) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  return {
    r: clampColorChannel((red + match) * 255),
    g: clampColorChannel((green + match) * 255),
    b: clampColorChannel((blue + match) * 255),
  };
}

function getAnalogousNegativeColor(value: string) {
  const color = parseColor(value);

  if (!color) {
    return value;
  }

  const hsl = rgbToHsl(color);
  const hue = (hsl.h + 180 - 41.5 + 360) % 360;
  const saturation = Math.min(1, hsl.s * 1.08);
  const lightness = Math.max(0.18, hsl.l * 0.72);
  const analogous = hslToRgb(hue, saturation, lightness);

  return `rgb(${analogous.r}, ${analogous.g}, ${analogous.b})`;
}

function hexToRgba(hex: string, alpha: number) {
  const color = parseColor(hex) ?? { r: 255, g: 255, b: 255 };

  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

function getClassColor(actorClass: string | null | undefined, fallback: string) {
  if (!actorClass) {
    return fallback;
  }

  return CLASS_COLOR_PRESETS[actorClass.toUpperCase()] ?? fallback;
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
  showTargetHpBar = false,
  classIconStyle = "default",
  showPlayerName = true,
  showServerName = true,
  backgroundColor = "transparent",
  onPlayerClicked,
  onPlayerHovered,
  onPlayerHoverEnd,
}: DpsPanelProps) {
  const { t } = useAppTranslation();

  if (!targetInfo || !thisTargetPlayerStats || !combatInfos) {
    return null;
  }

  const actorInfos = combatInfos.actorInfos;
  const mainActorId = combatInfos.mainActorId;
  const targetLastTimes = Object.values(targetInfo.targetLastTime || {});
  const thisTargetLastTime = targetLastTimes.length > 0 ? Math.max(...targetLastTimes) : 0;

  const players = Object.entries(thisTargetPlayerStats)
    .map(([playerId, stats]) => ({
      playerId: Number(playerId),
      totalDamageValue: getTotalDamage(stats as SkillStats),
    }))
    .filter((player) => Number.isFinite(player.playerId) && player.totalDamageValue > 0)
    .sort((a, b) => b.totalDamageValue - a.totalDamageValue);

  if (players.length === 0) {
    return null;
  }

  const maxDamage = players[0]?.totalDamageValue || 0;
  const totalDamage = players.reduce((sum, player) => sum + player.totalDamageValue, 0);
  const targetMaxHp = targetInfo.maxHp ?? 0;
  const opacity = Math.min(100, Math.max(0, barOpacity ?? 100)) / 100;

  return (
    <div
      className="w-full min-w-[260px] overflow-hidden rounded-b-[5px] border-x border-b border-white/10 text-slate-50"
      style={{ backgroundColor }}
    >
      {showTargetHpBar && targetMaxHp > 0 ? (
        <MemoizedBossHealthBar targetInfo={targetInfo} styleVariant="hunter" />
      ) : null}

      <div className="">
        {players.slice(0, 8).map((player, index) => {
          const actorInfo = actorInfos?.[player.playerId];
          const playerName =
            actorInfo?.actorName || `${t("dps.list.unknownPlayer")}(${player.playerId})`;
          const displayPlayerName = maskNickname(playerName, Boolean(maskNicknames));
          const actorClass = actorInfo?.actorClass;
          const playerServerId = actorInfo?.actorServerId;
          const playerServerName = playerServerId
            ? getServerName(Number(playerServerId))
            : t("dps.list.unknownServer");
          const displayName = showPlayerName ? displayPlayerName : "";
          const displayServerName = showServerName ? playerServerName : "";
          const actorClassIcon = actorClass
            ? classIconStyle === "default"
              ? `/images/class/${actorClass.toLowerCase()}.webp`
              : `/images/class/${actorClass.toLowerCase()}.png`
            : "/images/aion2.png";
          const isMainPlayer = mainActorId === player.playerId;
          const playerColor = getClassColor(
            actorClass,
            isMainPlayer ? mainPlayerColor : otherPlayerColor
          );
          const playerCompColor = getAnalogousNegativeColor(playerColor);
          const barPercent =
            maxDamage > 0 ? clamp(5, 100, (player.totalDamageValue / maxDamage) * 100) : 0;
          const playerStartTime = targetInfo.targetStartTime?.[player.playerId];
          const playerFightDuration = Math.max(
            1,
            thisTargetLastTime - (playerStartTime ?? thisTargetLastTime)
          );
          const dpsValue = player.totalDamageValue / playerFightDuration;
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
            <button
              key={player.playerId || index}
              type="button"
              onClick={() => onPlayerClicked(player.playerId)}
              onMouseEnter={() => onPlayerHovered?.(player.playerId)}
              onMouseLeave={() => onPlayerHoverEnd?.(player.playerId)}
              className={cn(
                "group relative grid h-10 w-full cursor-pointer grid-cols-[30px_minmax(0,1fr)_142px] items-center overflow-hidden border-t border-white/10 px-1 text-left transition first:border-t-0",
                "hover:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-cyan-300/60 focus-visible:outline-none"
              )}
            >
              <div
                className="absolute inset-y-0 left-0 w-full origin-left transition-transform duration-500"
                style={{
                  transform: `scaleX(${barPercent / 100})`,
                  background: `linear-gradient(90deg, ${hexToRgba(playerColor, 0.22)} 0%, ${hexToRgba(playerColor, 0.12)} 78%, transparent 100%)`,
                }}
              />
              <div
                className="absolute inset-y-0 left-0 w-full origin-left transition-transform duration-500"
                style={{
                  transform: `scaleX(${barPercent / 100})`,
                  background: `linear-gradient(180deg, transparent 0%, ${hexToRgba(playerCompColor, 0.16)} 100%)`,
                }}
              />
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/[0.04]" />
              <div
                className="absolute bottom-0 left-0 h-[3px] w-full origin-left overflow-hidden transition-transform duration-500"
                style={{ transform: `scaleX(${barPercent / 100})` }}
              >
                <div
                  className="absolute inset-0 opacity-90"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(playerColor, opacity)} 85%, ${hexToRgba(playerColor, 0.9)} 100%)`,
                  }}
                />
                <div
                  className="absolute inset-x-0 top-0 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent 0%, transparent 85%, rgba(255,255,255,0.52) 90%, rgba(255, 255, 255, 0.74) 100%)`,
                  }}
                />
              </div>

              <div className="relative z-10 flex items-center justify-center">
                <img
                  src={actorClassIcon}
                  alt={actorClass || "class"}
                  className="h-8 w-8 rounded object-cover"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                />
              </div>

              <div className="relative z-10 min-w-0 py-1 pr-2 pl-2">
                <div className="flex min-w-0 items-baseline gap-0">
                  {showPlayerName ? (
                    <span className="text-md truncate leading-4 font-medium text-slate-50">
                      {displayName}
                    </span>
                  ) : null}
                  {isMainPlayer ? (
                    <span className="shrink-0 rounded-sm border border-cyan-300/35 bg-cyan-300/12 px-1 py-px text-[9px] leading-none font-semibold text-cyan-100">
                      ME
                    </span>
                  ) : null}
                </div>
                {showServerName ? (
                  <div className="truncate text-[12px] leading-3 font-normal text-slate-500">
                    {displayServerName}
                  </div>
                ) : null}
              </div>

              <div className="relative z-10 grid h-9 w-[142px] grid-cols-[70px_64px] grid-rows-[18px_18px] items-center pr-2 font-mono tabular-nums">
                <div className="row-span-2 flex items-center justify-end pr-2 text-right">
                  <span className="text-md leading-none font-semibold text-cyan-50 drop-shadow-[0_0_5px_rgba(103,232,249,0.55)]">
                    {Math.floor(dpsValue).toLocaleString()}
                  </span>
                  <span className="ml-0.5 self-end pb-0 text-[9px] text-slate-400">/s</span>
                </div>

                <div className="flex min-w-0 items-center justify-end gap-1 leading-none">
                  <span className="shrink-0 text-[10px] font-semibold text-slate-500">PCT</span>
                  <span className="min-w-0 truncate text-[12px] font-medium text-slate-100">
                    {Math.floor(damagePercentDisplay)}
                    <span className="text-[10px] font-normal text-slate-500">
                      .{Math.round((damagePercentDisplay % 1) * 10)}%
                    </span>
                  </span>
                </div>
                <div className="flex min-w-0 items-center justify-end gap-1 leading-none">
                  <span className="shrink-0 text-[10px] font-medium text-slate-500">DMG</span>
                  <span className="min-w-0 truncate text-[11px] font-medium text-slate-300/80">
                    {formatCompactDamage(player.totalDamageValue)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export const MemoizedDpsPanel = memo(DpsPanel);
export const MemoizedDpsPanelSimple = MemoizedDpsPanel;
