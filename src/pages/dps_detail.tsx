import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { TitleBar } from "@/components/title-bar";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getServerShortName } from "@/lib/aion2/servers";
import { hideWindow } from "@/lib/window";
import { cn } from "@/lib/utils";
import { DpsDetailPayload, SkillStats } from "@/types/aion2dps";

const hexToRgba = (hex: string, alphaPercent: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex =
    safeHex.length === 3
      ? safeHex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : safeHex;
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${Math.min(100, Math.max(0, alphaPercent)) / 100})`;
};

const darkenHex = (hex: string, amount: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex =
    safeHex.length === 3
      ? safeHex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : safeHex;

  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp(parseInt(normalizedHex.slice(0, 2), 16) - amount);
  const g = clamp(parseInt(normalizedHex.slice(2, 4), 16) - amount);
  const b = clamp(parseInt(normalizedHex.slice(4, 6), 16) - amount);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
};

const getStatDamage = (stats?: SkillStats | null) =>
  Number(stats?.totalDamage ?? stats?.total_damage ?? 0);

const getStatMinDamage = (stats?: SkillStats | null) =>
  Number(stats?.minDamage ?? stats?.min_damage ?? 0);

const getStatMaxDamage = (stats?: SkillStats | null) =>
  Number(stats?.maxDamage ?? stats?.max_damage ?? 0);

const getSpecialCount = (stats: SkillStats | null | undefined, key: string) =>
  Number(stats?.specialCounts?.[key] ?? stats?.special_counts?.[key] ?? 0);

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "--";
  }
  if (seconds < 60) {
    return `${Math.floor(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}m ${remaining.toString().padStart(2, "0")}s`;
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const formatCompactDamage = (value: number) => {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1_000).toFixed(0)}k`;
  }
  return value.toLocaleString();
};

const getSkillIconPath = (skillId: string) => {
  const normalized = String(skillId).replace(/\D/g, "");
  const iconKey = normalized.slice(0, 4);
  if (iconKey.length !== 4) {
    return null;
  }
  return `images/skill/${iconKey}.png`;
};

const normalizeSkillSpecSlots = (slots?: number[] | null) => {
  const slotSet = new Set<number>();
  for (const slot of slots ?? []) {
    if (Number.isInteger(slot) && slot >= 1 && slot <= 5) {
      slotSet.add(slot);
    }
  }
  return [1, 2, 3, 4, 5].map((slot) => slotSet.has(slot));
};

const SkillNameCell = memo(function SkillNameCell({
  skillId,
  skillName,
}: {
  skillId: string;
  skillName: string;
}) {
  const iconPath = getSkillIconPath(skillId);

  return (
    <div className="flex min-w-0 items-center gap-2 max-w-50">
      {iconPath ? (
        <img
          src={iconPath}
          alt=""
          loading="lazy"
          decoding="async"
          fetchPriority="low"
          className="h-5 w-5 flex-shrink-0 rounded object-cover"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <div className="h-5 w-5 flex-shrink-0 rounded bg-white/5" />
      )}
      <span className="truncate font-medium text-slate-100">{skillName}</span>
    </div>
  );
});

const SkillSpecDots = memo(function SkillSpecDots({ slots }: { slots?: number[] | null }) {
  const activeSlots = normalizeSkillSpecSlots(slots);

  return (
    <div className="flex items-center justify-end gap-1">
      {activeSlots.map((isActive, index) => (
        <span
          key={index}
          className={cn(
            "h-1.5 w-1.5 rounded-full border border-white/10",
            isActive ? "bg-cyan-300 shadow-[0_0_4px_rgba(103,232,249,0.45)]" : "bg-white/10"
          )}
        />
      ))}
    </div>
  );
});

export default function DpsDetailPage() {
  const { settings } = useAppSettings();
  const { t, tSkill } = useAppTranslation();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [payload, setPayload] = useState<DpsDetailPayload | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      const unlistenUpdate = await listen<DpsDetailPayload>("dps-detail-update", (event) => {
        if (!mounted) {
          return;
        }
        setPayload(event.payload);
      });

      const unlistenClear = await listen("dps-detail-clear", () => {
        if (!mounted) {
          return;
        }
        setPayload(null);
      });

      await emit("dps-detail-request");

      return () => {
        unlistenUpdate();
        unlistenClear();
      };
    };

    const cleanupPromise = setup();
    return () => {
      mounted = false;
      void cleanupPromise.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    const unlistenClose = appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await emit("dps-detail-window-closed");
      await hideWindow("dps_detail", 10_000);
    });

    return () => {
      void unlistenClose.then((fn) => fn());
    };
  }, []);

  const resizeWindow = useCallback(async () => {
    if (!contentRef.current) {
      return;
    }

    try {
      const [currentWidth] = await invoke<[number, number]>("get_window_size", {
        label: "dps_detail",
      });
      const nextHeight = Math.max(
        180,
        Math.min(1400, Math.ceil(contentRef.current.scrollHeight * dpsAppearance.scaleFactor + 2))
      );

      await invoke("resize_window", {
        label: "dps_detail",
        width: currentWidth,
        height: nextHeight,
      });
    } catch (error) {
      console.error("resize dps detail failed:", error);
    }
  }, [dpsAppearance.scaleFactor]);

  useEffect(() => {
    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current);
    }

    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null;
      window.requestAnimationFrame(() => {
        void resizeWindow();
      });
    }, 60);

    return () => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [payload, resizeWindow]);

  const actorInfo = useMemo(() => {
    if (!payload) {
      return null;
    }

    return payload.combatInfos.actorInfos?.[String(payload.actorId)] ?? null;
  }, [payload]);

  const targetInfo = useMemo(() => {
    if (!payload) {
      return null;
    }

    return payload.combatInfos.targetInfos?.[String(payload.targetId)] ?? null;
  }, [payload]);

  const summary = useMemo(() => {
    if (!payload || !targetInfo) {
      return null;
    }

    const totalDamage = getStatDamage(payload.playerStats);
    const playerStartTime = targetInfo.targetStartTime?.[String(payload.actorId)] ?? 0;
    const playerLastTime = targetInfo.targetLastTime?.[String(payload.actorId)] ?? 0;
    const fightDurationSeconds = Math.max(1, playerLastTime - playerStartTime);
    const totalHits = Math.max(1, Number(payload.playerStats?.counts ?? 0));

    return {
      totalDamage,
      dps: totalDamage / fightDurationSeconds,
      fightDurationSeconds,
      totalHits,
      critRate: formatPercent((getSpecialCount(payload.playerStats, "CRITICAL") / totalHits) * 100),
      backRate: formatPercent((getSpecialCount(payload.playerStats, "BACK") / totalHits) * 100),
      doubleRate: formatPercent((getSpecialCount(payload.playerStats, "DOUBLE") / totalHits) * 100),
      perfectRate: formatPercent(
        (getSpecialCount(payload.playerStats, "PERFECT") / totalHits) * 100
      ),
      parryRate: formatPercent((getSpecialCount(payload.playerStats, "PARRY") / totalHits) * 100),
      multiRate: formatPercent(
        (getSpecialCount(payload.playerStats, "MULTIHIT") / totalHits) * 100
      ),
    };
  }, [payload, targetInfo]);

  const skillRows = useMemo(() => {
    if (!payload) {
      return [];
    }

    return Object.entries(payload.playerSkillStats ?? {})
      .map(([skillId, stats]) => ({
        skillId,
        stats,
        totalDamage: getStatDamage(stats),
        counts: Number(stats.counts ?? 0),
        minDamage: getStatMinDamage(stats),
        maxDamage: getStatMaxDamage(stats),
      }))
      .filter((row) => row.totalDamage > 0)
      .sort((a, b) => b.totalDamage - a.totalDamage);
  }, [payload]);

  const totalSkillDamage = useMemo(
    () => skillRows.reduce((sum, row) => sum + row.totalDamage, 0),
    [skillRows]
  );
  const actorSkillSpecMap = actorInfo?.actorSkillSpec ?? {};

  const shellBackground = hexToRgba(dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity);
  const titleBarBackground = hexToRgba(
    darkenHex(dpsAppearance.backgroundColor, 22),
    Math.min(100, dpsAppearance.backgroundOpacity + 18)
  );
  const panelBackground = hexToRgba(dpsAppearance.panelColor, dpsAppearance.panelOpacity);
  const actorName = actorInfo?.actorName ?? "Unknown";
  const actorClass = actorInfo?.actorClass ?? "";
  const actorServerName = actorInfo?.actorServerId
    ? getServerShortName(Number(actorInfo.actorServerId))
    : "--";
  const actorIcon = actorClass ? `images/class/${actorClass.toLowerCase()}.webp` : "icon.png";

  return (
    <div
      className="flex w-screen flex-col overflow-hidden rounded-lg border border-white/10 text-slate-100"
      style={{ backgroundColor: shellBackground }}
      ref={contentRef}
    >
      <TitleBar
        title=""
        showMaximize={false}
        leftActions={
          <div className="flex min-w-0 items-center gap-2" data-tauri-drag-region>
            <img
              src={actorIcon}
              alt={actorClass || "actor"}
              className="h-6 w-6 rounded object-cover"
              onError={(event) => {
                (event.target as HTMLImageElement).src = "icon.png";
              }}
            />
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <span className="truncate text-xs font-semibold tracking-[0.18em] text-slate-100 uppercase">
                {actorName}
              </span>
              <span className="text-xs text-slate-400">[{actorServerName}]</span>
            </div>
          </div>
        }
        rightActions={
          <div className="mr-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
            {payload?.mode === "history" ? t("dps.detail.modeHistory") : t("dps.detail.modeLive")}
          </div>
        }
        className="border-white/10"
        style={{ backgroundColor: titleBarBackground }}
      />

      <div
        className="flex w-full flex-col gap-2 self-start bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_32%)] p-2"
        style={{ zoom: dpsAppearance.scaleFactor }}
      >
        <section
          className="rounded-lg  p-0"
          style={{ backgroundColor: panelBackground }}
        >
          {payload && actorInfo && targetInfo && summary ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs tracking-[0.16em] text-slate-400 uppercase">
                    {t("dps.detail.target")}
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-slate-100">
                    {targetInfo.targetName || `Target ${payload.targetId}`}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs tracking-[0.16em] text-slate-400 uppercase">
                    {t("dps.detail.player")}
                  </div>
                  <div className="mt-1 truncate text-xs font-semibold text-slate-100">
                    {actorName}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">
                    {t("dps.detail.damage")}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-100">
                    {formatCompactDamage(summary.totalDamage)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">{t("dps.detail.dps")}</div>
                  <div className="mt-1 text-xs font-semibold text-emerald-300">
                    {Math.floor(summary.dps).toLocaleString()}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">
                    {t("dps.detail.fight")}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-100">
                    {formatDuration(summary.fightDurationSeconds)}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">{t("dps.detail.hits")}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-100">
                    {summary.totalHits}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-6 gap-2">
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">
                    {t("dps.detail.critical")}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-rose-300">{summary.critRate}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">{t("dps.detail.back")}</div>
                  <div className="mt-1 text-xs font-semibold text-cyan-300">{summary.backRate}</div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">
                    {t("dps.detail.double")}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-yellow-300">
                    {summary.doubleRate}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">
                    {t("dps.detail.perfect")}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-emerald-300">
                    {summary.perfectRate}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">
                    {t("dps.detail.parry")}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-slate-300">
                    {summary.parryRate}
                  </div>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
                  <div className="text-xs text-slate-400 uppercase">
                    {t("dps.detail.multi")}
                  </div>
                  <div className="mt-1 text-xs font-semibold text-rose-200">
                    {summary.multiRate}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed border-white/10 bg-white/[0.03] text-xs text-slate-400">
              {t("dps.detail.selectPlayer")}
            </div>
          )}
        </section>

        <section
          className="overflow-hidden rounded-lg border border-white/10"
          style={{ backgroundColor: panelBackground }}
        >


          {skillRows.length > 0 ? (
            <div className="overflow-x-auto overflow-y-visible [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/25 [&::-webkit-scrollbar-track]:bg-transparent">
              <div className="min-w-[1000px]">
                <div className="grid grid-cols-[minmax(180px,0.2fr)_0.2fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.7fr_0.9fr_0.8fr_0.8fr_0.8fr_1.2fr] gap-2 border-b border-white/10 px-3 py-2 text-xs tracking-[0.16em] text-slate-400 uppercase">
                  <span>{t("dps.detail.skill")}</span>
                  <span className="text-right">Spec</span>
                  <span className="text-right">{t("dps.detail.count")}</span>
                  <span className="text-right">{t("dps.detail.criticalShort")}</span>
                  <span className="text-right">{t("dps.detail.backShort")}</span>
                  <span className="text-right">{t("dps.detail.doubleShort")}</span>
                  <span className="text-right">{t("dps.detail.perfectShort")}</span>
                  <span className="text-right">{t("dps.detail.parryShort")}</span>
                  <span className="text-right">{t("dps.detail.multiShort")}</span>
                  <span className="text-right">{t("dps.detail.multiDamage")}</span>
                  <span className="text-right">{t("dps.detail.avg")}</span>
                  <span className="text-right">{t("dps.detail.min")}</span>
                  <span className="text-right">{t("dps.detail.max")}</span>
                  <span className="text-right">{t("dps.detail.total")}</span>
                </div>

                {skillRows.map((row) => {
                  const critRate =
                    row.counts > 0
                      ? (getSpecialCount(row.stats, "CRITICAL") / row.counts) * 100
                      : 0;
                  const backRate =
                    row.counts > 0 ? (getSpecialCount(row.stats, "BACK") / row.counts) * 100 : 0;
                  const doubleRate =
                    row.counts > 0 ? (getSpecialCount(row.stats, "DOUBLE") / row.counts) * 100 : 0;
                  const perfectRate =
                    row.counts > 0 ? (getSpecialCount(row.stats, "PERFECT") / row.counts) * 100 : 0;
                  const parryRate =
                    row.counts > 0 ? (getSpecialCount(row.stats, "PARRY") / row.counts) * 100 : 0;
                  const multiRate =
                    row.counts > 0
                      ? (getSpecialCount(row.stats, "MULTIHIT") / row.counts) * 100
                      : 0;
                  const multiHitDamage = getSpecialCount(row.stats, "MULTIHITDMG");
                  const averageDamage =
                    row.counts > 0 ? Math.floor(row.totalDamage / row.counts) : 0;
                  const totalPercent =
                    totalSkillDamage > 0 ? (row.totalDamage / totalSkillDamage) * 100 : 0;

                  return (
                    <div
                      key={row.skillId}
                      className={cn(
                        "h-8 grid grid-cols-[minmax(180px,0.2fr)_0.2fr_0.5fr_0.6fr_0.6fr_0.6fr_0.6fr_0.6fr_0.7fr_0.9fr_0.8fr_0.8fr_0.8fr_1.2fr] gap-2 border-b border-white/5 px-3 py-2 text-xs",
                        "hover:bg-white/[0.04]"
                      )}
                    >
                      <SkillNameCell
                        skillId={row.skillId}
                        skillName={tSkill(String(row.skillId).slice(0, 8))}
                      />
                      <SkillSpecDots slots={actorSkillSpecMap[row.skillId]} />
                      <span className="text-right text-slate-300">{row.counts}</span>
                      <span className="text-right text-rose-300">{critRate.toFixed(1)}%</span>
                      <span className="text-right text-indigo-300">{backRate.toFixed(1)}%</span>
                      <span className="text-right text-yellow-300">{doubleRate.toFixed(1)}%</span>
                      <span className="text-right text-emerald-300">{perfectRate.toFixed(1)}%</span>
                      <span className="text-right text-slate-400">{parryRate.toFixed(1)}%</span>
                      <span className="text-right text-rose-200">{multiRate.toFixed(1)}%</span>
                      <span className="text-right text-amber-200/90">
                        {multiHitDamage.toLocaleString()}
                      </span>
                      <span className="text-right text-slate-300">
                        {averageDamage.toLocaleString()}
                      </span>
                      <span className="text-right text-slate-400">
                        {row.minDamage.toLocaleString()}
                      </span>
                      <span className="text-right text-slate-400">
                        {row.maxDamage.toLocaleString()}
                      </span>
                      <div className="relative overflow-hidden rounded px-2 py-0.5 text-right">
                        <div
                          className="absolute inset-y-0 left-0 rounded-r bg-cyan-400/20"
                          style={{ width: `${totalPercent}%` }}
                        />
                        <span className="relative z-10 font-medium text-amber-300">
                          {row.totalDamage.toLocaleString()} ({totalPercent.toFixed(1)}%)
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex min-h-24 items-center justify-center px-3 py-6 text-xs text-slate-400">
              {t("dps.detail.noSkillData")}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
