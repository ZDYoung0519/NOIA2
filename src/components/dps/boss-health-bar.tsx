import { memo } from "react";
import { motion } from "framer-motion";

import { cn } from "@/lib/utils";
import type { TargetInfo } from "@/types/aion2dps";

export type BossHealthBarStyle = "classic" | "hunter";

type BossHealthBarProps = {
  targetInfo: TargetInfo;
  styleVariant?: BossHealthBarStyle;
  className?: string;
};

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatHealth(value: number) {
  if (value >= 100_000_000) {
    return `${(value / 100_000_000).toFixed(2)}e`;
  }

  if (value >= 10_000) {
    return `${(value / 10_000).toFixed(value >= 100_000 ? 0 : 1)}w`;
  }

  return Math.floor(value).toLocaleString();
}

function formatDuration(totalSeconds: number) {
  const normalizedSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const seconds = normalizedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getFightDuration(targetInfo: TargetInfo) {
  const startTimes = Object.values(targetInfo.targetStartTime ?? {}).filter(Number.isFinite);
  const lastTimes = Object.values(targetInfo.targetLastTime ?? {}).filter(Number.isFinite);

  if (lastTimes.length === 0) {
    return 0;
  }

  const latestLastTime = Math.max(...lastTimes);
  const earliestStartTime = startTimes.length > 0 ? Math.min(...startTimes) : latestLastTime;

  return Math.max(0, latestLastTime - earliestStartTime);
}

function ClassicBossHealthBar({ targetInfo, className }: Omit<BossHealthBarProps, "styleVariant">) {
  const maxHealth = targetInfo.maxHp ?? 0;
  const currentHealth = targetInfo.currentHp ?? 0;

  if (maxHealth <= 0) {
    return null;
  }

  const healthPercent = clampPercent((currentHealth / maxHealth) * 100);
  const targetName = targetInfo.targetName || `Target ${targetInfo.id}`;
  const fightDuration = formatDuration(getFightDuration(targetInfo));

  return (
    <section
      className={cn(
        "group relative flex h-7 items-center overflow-hidden rounded border border-red-500/40 bg-red-950/30 text-slate-50",
        className
      )}
      aria-label={`${targetName} health ${healthPercent.toFixed(1)} percent`}
    >
      <motion.div
        className="absolute inset-y-0 left-0 bg-red-500/60"
        initial={false}
        animate={{ width: `${healthPercent}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      />

      <div className="relative z-10 flex w-full items-center justify-between pr-1 select-none">
        <div className="flex min-w-0 flex-1 items-center gap-1 select-none">
          <div className="relative h-6 w-6 flex-shrink-0">
            <img
              src="/images/aion2/bossIcon.png"
              alt=""
              className="h-full w-full rounded-md object-cover shadow-sm"
              draggable={false}
              onContextMenu={(event) => event.preventDefault()}
            />
          </div>
          <span className="truncate font-mono text-sm">{targetName}</span>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="font-mono text-xs text-red-100/75 tabular-nums">{fightDuration}</span>
          <span className="font-mono text-sm text-gray-100 tabular-nums">
            {(currentHealth / 10000).toFixed(0)}w
          </span>
          <span className="font-mono text-sm font-bold text-red-200 tabular-nums">
            {healthPercent.toFixed(1)}%
          </span>
        </div>
      </div>
    </section>
  );
}

function HunterBossHealthBar({ targetInfo, className }: Omit<BossHealthBarProps, "styleVariant">) {
  const maxHealth = targetInfo.maxHp ?? 0;
  const currentHealth = targetInfo.currentHp ?? 0;

  if (maxHealth <= 0) {
    return null;
  }

  const healthPercent = clampPercent((currentHealth / maxHealth) * 100);
  const targetName = targetInfo.targetName || `Target ${targetInfo.id}`;
  const fightDuration = formatDuration(getFightDuration(targetInfo));
  const isCritical = healthPercent <= 25;

  return (
    <section
      className={cn(
        "relative overflow-hidden border-b border-white/10 bg-black/20 px-2 py-1.5 text-slate-50",
        className
      )}
      aria-label={`${targetName} health ${healthPercent.toFixed(1)} percent`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(248,113,113,0.16),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.06),transparent_52%)]" />

      <div className="relative z-10 grid grid-cols-[32px_minmax(0,1fr)] gap-2">
        <div className="relative flex h-8 w-8 items-center justify-center">
          <div className="absolute h-[26px] w-[26px] rotate-45 rounded-[5px] border border-red-200/45 bg-slate-950/85 shadow-[0_0_14px_rgba(248,113,113,0.22)]" />
          <img
            src="/images/aion2/bossIcon.png"
            alt=""
            className="relative h-7 w-7 rounded-[5px] object-cover drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]"
            draggable={false}
            onContextMenu={(event) => event.preventDefault()}
          />
        </div>

        <div className="min-w-0">
          <div className="flex h-4 min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs leading-none font-semibold tracking-normal text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              {targetName}
            </span>
            <span
              className={cn(
                "shrink-0 font-mono text-xs leading-none font-semibold tabular-nums",
                isCritical ? "text-red-200" : "text-white"
              )}
            >
              {Math.floor(healthPercent)}
              <span className="text-[10px] font-normal text-white/65">
                .{Math.floor((healthPercent % 1) * 10)}%
              </span>
            </span>
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2 font-mono text-[10px] leading-none tabular-nums">
            <span className="truncate text-white/78">
              {formatHealth(currentHealth)}
              <span className="px-1 text-white/35">/</span>
              <span className="text-white/48">{formatHealth(maxHealth)}</span>
            </span>
            <span className="shrink-0 text-red-100/55">{fightDuration}</span>
          </div>

          <div className="relative mt-1 h-2 overflow-hidden rounded-[3px] border border-white/22 bg-black/45 shadow-[inset_0_1px_2px_rgba(0,0,0,0.75)]">
            <motion.div
              className="absolute inset-y-px left-px max-w-[calc(100%-2px)] rounded-[2px] bg-gradient-to-r from-red-700 via-red-500 to-orange-300 shadow-[0_0_10px_rgba(248,113,113,0.45)]"
              initial={false}
              animate={{ width: `${healthPercent}%` }}
              transition={{ type: "spring", stiffness: 170, damping: 24, mass: 0.7 }}
            />
            <div className="absolute inset-x-0 top-0 h-px bg-white/35" />
            <div className="absolute inset-0 grid grid-cols-10">
              {Array.from({ length: 10 }).map((_, index) => (
                <span key={index} className="border-l border-white/20 first:border-l-0" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BossHealthBar({ styleVariant = "classic", ...props }: BossHealthBarProps) {
  if (styleVariant === "hunter") {
    return <HunterBossHealthBar {...props} />;
  }

  return <ClassicBossHealthBar {...props} />;
}

export const MemoizedBossHealthBar = memo(BossHealthBar);
