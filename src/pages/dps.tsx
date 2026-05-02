import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Play, RotateCcw, Square, Trash2, Settings, History, Book } from "lucide-react";
import { maskNickname } from "@/lib/name-mask";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import { TitleBar } from "@/components/title-bar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";

import { createWindow } from "@/lib/window";
import { Aion2DpsHistory, Aion2MainActorHistory } from "@/lib/localStorageHistory";

import { cn } from "@/lib/utils";
import {
  CombatSnapshot,
  DpsDetailPayload,
  HistoryTargetRecord,
  SkillStats,
} from "@/types/aion2dps";
import { uploadDpsDataBatch } from "@/lib/supabase/upload-dps-data";
import { PingCurve } from "@/components/ping-curve";

const HISTORY_DAMAGE_THRESHOLD = 1_000_000;

const getSkillStatsDamage = (stats?: SkillStats | null) => Number(stats?.total_damage ?? 0);

const getTargetTotalDamage = (playerStats?: Record<string, SkillStats> | null) =>
  Object.values(playerStats ?? {}).reduce((sum, stats) => sum + getSkillStatsDamage(stats), 0);

const cloneJson = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const getTargetLastTime = (record: HistoryTargetRecord) => {
  const targetInfo = record.combatInfos.targetInfos?.[String(record.targetId)];
  const lastTimes = Object.values(targetInfo?.targetLastTime ?? {});
  return lastTimes.length > 0 ? Math.max(...lastTimes) : 0;
};

const formatLocalRecordTime = (timestampSeconds: number) => {
  if (!timestampSeconds || !Number.isFinite(timestampSeconds)) {
    return "--";
  }
  return new Date(timestampSeconds * 1000).toLocaleTimeString();
};

const buildHistoryRecordsFromSnapshot = (snapshot: CombatSnapshot): HistoryTargetRecord[] => {
  const targetEntries = Object.entries(snapshot.byTargetPlayerStats ?? {});
  const records: Array<HistoryTargetRecord | null> = targetEntries.map(
    ([targetId, thisTargetAllPlayerStats]) => {
      const numericTargetId = Number(targetId);
      const totalDamage = getTargetTotalDamage(thisTargetAllPlayerStats);

      if (!Number.isFinite(numericTargetId) || totalDamage <= HISTORY_DAMAGE_THRESHOLD) {
        return null;
      }

      const targetInfo = snapshot.combatInfos.targetInfos?.[targetId];
      const targetLastTimes = Object.values(targetInfo?.targetLastTime ?? {});
      const recordTimestamp =
        targetLastTimes.length > 0 ? Math.max(...targetLastTimes) : Math.floor(Date.now() / 1000);

      return {
        id: `${targetId}-${recordTimestamp}-${Date.now()}`,
        targetId: numericTargetId,
        thisTargetAllPlayerStats: cloneJson(thisTargetAllPlayerStats),
        thisTargetAllPlayerSkillStats: cloneJson(
          snapshot.byTargetPlayerSkillStats?.[targetId] ?? {}
        ),
        thisTargetAllPlayerSkillRecords: cloneJson(
          snapshot.byTargetPlayerSkillRecords?.[targetId] ?? {}
        ),
        combatInfos: cloneJson({
          ...snapshot.combatInfos,
          targetInfos: targetInfo
            ? {
                [targetId]: targetInfo,
              }
            : {},
          lastTarget: numericTargetId,
          lastTargetByMainActor:
            snapshot.combatInfos.lastTargetByMainActor === numericTargetId
              ? numericTargetId
              : numericTargetId,
        }),
      };
    }
  );

  return records
    .filter((record): record is HistoryTargetRecord => record !== null)
    .sort((a, b) => getTargetLastTime(b) - getTargetLastTime(a));
};

const persistHistoryRecords = (records: HistoryTargetRecord[]) => {
  if (records.length === 0) {
    return;
  }
  records.forEach((record) => {
    Aion2DpsHistory.add(record);
  });
};

const waitForWindowReady = async (label: string, timeoutMs = 1500) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const targetWindow = await WebviewWindow.getByLabel(label);
    if (targetWindow) {
      return targetWindow;
    }

    await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
  }

  throw new Error(`window '${label}' was not ready in time`);
};

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
  const alpha = Math.min(100, Math.max(0, alphaPercent)) / 100;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type TitleIconButtonProps = {
  active?: boolean;
  onClick: () => void | Promise<void>;
  title: string;
  children: React.ReactNode;
  tone?: "default" | "danger" | "accent";
};

function TitleIconButton({
  active = false,
  onClick,
  title,
  children,
  tone = "default",
}: TitleIconButtonProps) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => void onClick()}
      className={cn(
        "flex h-6 w-6 items-center justify-center rounded-md border text-slate-300 transition",
        "border-white/10 bg-white/5 hover:bg-white/10 hover:text-white",
        active &&
          tone === "accent" &&
          "border-cyan-400/40 bg-cyan-500/15 text-cyan-200 hover:brightness-110",
        tone === "danger" && "border-rose-400/40 bg-rose-500/15 text-rose-100 hover:brightness-110"
      )}
    >
      {children}
    </button>
  );
}

type WindowFrameProps = {
  titleBar: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function WindowFrame({ titleBar, children, className, contentClassName }: WindowFrameProps) {
  return (
    <div
      className={cn(
        "border-border flex h-screen w-screen flex-col overflow-hidden rounded-md border",
        className
      )}
    >
      {titleBar}
      <main className={contentClassName}>{children}</main>
    </div>
  );
}

type HistoryTargetListProps = {
  historyRecords: HistoryTargetRecord[];
  selectedHistoryId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
};

const MemoizedHistoryTargetList = memo(function HistoryTargetList({
  historyRecords,
  selectedHistoryId,
  onSelect,
  onClear,
}: HistoryTargetListProps) {
  return (
    <aside className="w-30">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-1 py-1">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-300 uppercase">
          历史记录
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onClear}
              disabled={historyRecords.length === 0}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md border transition",
                historyRecords.length === 0
                  ? "cursor-not-allowed border-white/5 bg-white/[0.03] text-slate-600"
                  : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear history</TooltipContent>
        </Tooltip>
      </div>

      {historyRecords.length > 0 ? (
        <div className="max-h-[250px] overflow-y-auto p-0 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/25 [&::-webkit-scrollbar-thumb]:hover:bg-slate-300/35 [&::-webkit-scrollbar-track]:bg-transparent">
          <div className="space-y-0">
            {historyRecords.map((record) => {
              const recordTargetInfo = record.combatInfos.targetInfos?.[String(record.targetId)];
              const recordDamage = getTargetTotalDamage(record.thisTargetAllPlayerStats);
              const recordTime = getTargetLastTime(record);
              const isBoss = record.combatInfos.targetInfos?.[String(record.targetId)]?.isBoss;

              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => onSelect(record.id)}
                  className={cn(
                    "w-full border px-1.5 py-0.5 text-left transition",
                    selectedHistoryId === record.id
                      ? "border-cyan-400/40 bg-cyan-500/12 text-cyan-50"
                      : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]"
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    <div className="truncate text-sm font-semibold">
                      {recordTargetInfo?.targetName || `Target ${record.targetId}`}
                    </div>
                    {isBoss && (
                      <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-0.5 py-0.5 text-[8px] text-amber-200 uppercase">
                        Boss
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                    <span className="truncate text-slate-400">{recordDamage.toLocaleString()}</span>
                    <span>{formatLocalRecordTime(recordTime)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex min-h-24 items-center justify-center px-3 text-center text-sm text-slate-500">
          No history
        </div>
      )}
    </aside>
  );
});

export default function DpsPage() {
  const { settings } = useAppSettings();
  const { t } = useAppTranslation();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [view, setView] = useState<"dps" | "history" | "ping">("dps");
  const [isRunning, setIsRunning] = useState(false);
  const [snapshot, setSnapshot] = useState<CombatSnapshot | null>(null);

  const [mainPlayerName, setMainPlayerName] = useState<string>("");
  // const [mainPlayerId, setMainPlayerId] = useState<number | null>(null);
  const [currentTarget, setCurrentTarget] = useState<number | null>(null);
  const [pinnedPlayerId, setPinnedPlayerId] = useState<number | null>(null);
  const [hoverPlayerId, setHoverPlayerId] = useState<number | null>(null);

  const [historyRecords, setHistoryRecords] = useState<HistoryTargetRecord[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [pingHistory, setPingHistory] = useState<[number, number][]>([]);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const lastWindowHeightRef = useRef<number | null>(null);
  const lastSnapshotDamageRef = useRef<number | null>(null);
  const lastMemorySignatureRef = useRef<string | null>(null);
  const unlistenSnapshotRef = useRef<null | (() => void)>(null);
  const unlistenStatusRef = useRef<null | (() => void)>(null);

  const unlistenMainActorDetectedRef = useRef<null | (() => void)>(null);
  const unlistenResetRequestRef = useRef<null | (() => void)>(null);
  const unlistenPingHistoryRef = useRef<null | (() => void)>(null);

  const detailPayloadRef = useRef<DpsDetailPayload | null>(null);
  const pinnedPlayerIdRef = useRef<number | null>(null);
  const hoverPlayerIdRef = useRef<number | null>(null);
  const detailHoverTokenRef = useRef(0);
  const latestResizeWindowRef = useRef<(() => Promise<void>) | null>(null);
  const latestResetHandlerRef = useRef<(() => Promise<void>) | null>(null);
  const mainActorResetTimerRef = useRef<number | null>(null);
  const detailCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    pinnedPlayerIdRef.current = pinnedPlayerId;
  }, [pinnedPlayerId]);

  useEffect(() => {
    hoverPlayerIdRef.current = hoverPlayerId;
  }, [hoverPlayerId]);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        const status = await invoke<boolean>("get_dps_meter_status");
        if (mounted) {
          setIsRunning(status);
        }

        // 收听dps-snapshot事件，更新当前战斗快照
        unlistenSnapshotRef.current = await listen<CombatSnapshot>("dps-snapshot", (event) => {
          if (!mounted) {
            return;
          }

          const nextSnapshot = event.payload;
          if (lastSnapshotDamageRef.current === nextSnapshot.totalDamage) {
            return;
          }

          lastSnapshotDamageRef.current = nextSnapshot.totalDamage;
          setSnapshot((current) =>
            current?.totalDamage === nextSnapshot.totalDamage ? current : nextSnapshot
          );
        });

        // dps-meter的状态，运行/停止
        unlistenStatusRef.current = await listen<boolean>("dps-meter-status", (event) => {
          if (!mounted) {
            return;
          }

          const running = Boolean(event.payload);
          setIsRunning(running);
          if (!running) {
            lastSnapshotDamageRef.current = null;
            lastMemorySignatureRef.current = null;
            setSnapshot(null);

            setCurrentTarget(null);
            setPinnedPlayerId(null);
            setHoverPlayerId(null);
            detailPayloadRef.current = null;
            void emit("dps-detail-clear");
            if (mainActorResetTimerRef.current !== null) {
              window.clearTimeout(mainActorResetTimerRef.current);
              mainActorResetTimerRef.current = null;
            }
          }
        });
        // ping 历史
        unlistenPingHistoryRef.current = await listen("ping-history", (event) => {
          if (!mounted) {
            return;
          }
          setPingHistory(event.payload as [number, number][]);
          setView("ping");
        });

        // 收听dps-reset-requested事件，重置当前状态（快捷键触发后会emit这个信号）
        unlistenResetRequestRef.current = await listen("dps-reset-requested", () => {
          if (!mounted) {
            return;
          }
          void latestResetHandlerRef.current?.();
        });

        // 检测到主角色
        unlistenMainActorDetectedRef.current = await listen<{
          actorId: number;
          actorName: string;
          sid?: string | null;
        }>("dps-main-actor-detected", (event) => {
          if (!mounted) {
            return;
          }
          const payload = event.payload;
          const serverId = payload.sid ? Number(payload.sid) : NaN;

          setMainPlayerName(payload.actorName);
          // setMainPlayerId(payload.actorId);

          if (payload.actorName && Number.isFinite(serverId)) {
            Aion2MainActorHistory.add({
              id: `${payload.actorName}-${serverId}`,
              actorName: payload.actorName,
              serverId,
              lastSeenAt: Date.now(),
            });
          }

          if (mainActorResetTimerRef.current !== null) {
            window.clearTimeout(mainActorResetTimerRef.current);
          }

          // 检测到主角色1000ms后清空状态
          mainActorResetTimerRef.current = window.setTimeout(() => {
            mainActorResetTimerRef.current = null;
            void latestResetHandlerRef.current?.();
          }, 1_000);
        });

        // 响应dps_detail窗口的请求，发送当前选中玩家的详情数据
        const unlistenDetailRequest = await listen("dps-detail-request", async () => {
          if (detailPayloadRef.current) {
            await emit("dps-detail-update", detailPayloadRef.current);
          }
        });

        // dps-detail窗口关闭时，清除选中状态
        const unlistenDetailClosed = await listen("dps-detail-window-closed", () => {
          if (!mounted) {
            return;
          }
          setPinnedPlayerId(null);
          setHoverPlayerId(null);
          detailPayloadRef.current = null;
        });

        const previousUnlistenStatus = unlistenStatusRef.current;
        unlistenStatusRef.current = () => {
          previousUnlistenStatus?.();
          unlistenMainActorDetectedRef.current?.();
          unlistenMainActorDetectedRef.current = null;
          unlistenResetRequestRef.current?.();
          unlistenResetRequestRef.current = null;
          unlistenDetailRequest();
          unlistenDetailClosed();
        };
      } catch (error) {
        console.error("setup dps page listeners failed:", error);
      }
    };

    void setup();

    return () => {
      mounted = false;
      if (unlistenSnapshotRef.current) {
        void unlistenSnapshotRef.current();
        unlistenSnapshotRef.current = null;
      }
      if (unlistenStatusRef.current) {
        void unlistenStatusRef.current();
        unlistenStatusRef.current = null;
      }

      if (unlistenMainActorDetectedRef.current) {
        void unlistenMainActorDetectedRef.current();
        unlistenMainActorDetectedRef.current = null;
      }
      if (unlistenResetRequestRef.current) {
        void unlistenResetRequestRef.current();
        unlistenResetRequestRef.current = null;
      }
      if (detailCloseTimerRef.current !== null) {
        window.clearTimeout(detailCloseTimerRef.current);
        detailCloseTimerRef.current = null;
      }
      if (mainActorResetTimerRef.current !== null) {
        window.clearTimeout(mainActorResetTimerRef.current);
        mainActorResetTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    // dps窗口关闭时，停止后台的dps-meter进程
    const unlisten = appWindow.onCloseRequested(async () => {
      try {
        await invoke("stop_dps_meter");
      } catch (error) {
        console.error("stop dps meter on close failed:", error);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // resize 窗口
  const resizeWindow = useCallback(async () => {
    if (!contentRef.current || !dpsAppearance.autoResizeHeight) {
      return;
    }

    const appWindow = getCurrentWebviewWindow();
    const TITLE_BAR_HEIGHT = 32;
    const WINDOW_BORDER_HEIGHT = 2;
    const MIN_HEIGHT = 10;
    const MAX_HEIGHT = 1000;

    try {
      const element = contentRef.current;
      if (!element) {
        return;
      }

      const FOOTER_HEIGHT = 0;
      const contentHeight = (element.scrollHeight + FOOTER_HEIGHT) * dpsAppearance.scaleFactor;
      const targetHeight = Math.max(
        MIN_HEIGHT,
        Math.min(MAX_HEIGHT, Math.ceil(contentHeight + TITLE_BAR_HEIGHT + WINDOW_BORDER_HEIGHT))
      );
      const scaleFactor = await appWindow.scaleFactor();
      const outerSize = await appWindow.outerSize();
      const currentWidth = outerSize.width / scaleFactor;
      const currentHeight = outerSize.height / scaleFactor;

      if (Math.abs(currentHeight - targetHeight) < 5) {
        lastWindowHeightRef.current = targetHeight;
        return;
      }

      if (
        lastWindowHeightRef.current !== null &&
        Math.abs(lastWindowHeightRef.current - targetHeight) < 5
      ) {
        return;
      }

      lastWindowHeightRef.current = targetHeight;
      await appWindow.setSize(new LogicalSize(currentWidth, targetHeight));
    } catch (error) {
      console.error("auto resize dps window failed:", error);
    }
  }, [dpsAppearance.autoResizeHeight, dpsAppearance.scaleFactor]);

  useEffect(() => {
    latestResizeWindowRef.current = resizeWindow;
  }, [resizeWindow]);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const RESIZE_DEBOUNCE_MS = 50;
    const scheduleResize = () => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        window.requestAnimationFrame(() => {
          void latestResizeWindowRef.current?.();
        });
      }, RESIZE_DEBOUNCE_MS);
    };

    const observer = new ResizeObserver(() => {
      scheduleResize();
    });

    observer.observe(contentElement);
    scheduleResize();

    return () => {
      observer.disconnect();
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!dpsAppearance.autoResizeHeight) {
      return;
    }

    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current);
    }

    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null;
      window.requestAnimationFrame(() => {
        void latestResizeWindowRef.current?.();
      });
    }, 50);
  }, [
    dpsAppearance.autoResizeHeight,
    dpsAppearance.scaleFactor,
    snapshot,
    currentTarget,
    isRunning,
    view,
    selectedHistoryId,
    historyRecords.length,
  ]);

  const resolvedTargetId = useMemo(() => {
    if (view === "history") {
      const selectedRecord =
        historyRecords.find((record) => record.id === selectedHistoryId) ?? null;
      return selectedRecord?.targetId ?? null;
    }

    return (
      currentTarget ??
      snapshot?.combatInfos?.lastTargetByMainActor ??
      snapshot?.combatInfos?.lastTarget ??
      null
    );
  }, [currentTarget, historyRecords, selectedHistoryId, snapshot, view]);

  const selectedHistoryRecord = useMemo(
    () => historyRecords.find((record) => record.id === selectedHistoryId) ?? null,
    [historyRecords, selectedHistoryId]
  );

  const displayTargetInfo = useMemo(() => {
    if (view === "history") {
      if (!selectedHistoryRecord || resolvedTargetId === null) {
        return null;
      }
      return selectedHistoryRecord.combatInfos?.targetInfos?.[String(resolvedTargetId)] ?? null;
    }
    if (!snapshot || resolvedTargetId === null) {
      return null;
    }
    return snapshot.combatInfos?.targetInfos?.[String(resolvedTargetId)] ?? null;
  }, [resolvedTargetId, selectedHistoryRecord, snapshot, view]);

  const dpsPanelData = useMemo(() => {
    if (view === "history") {
      if (!selectedHistoryRecord || resolvedTargetId === null) {
        return null;
      }

      return {
        targetId: resolvedTargetId,
        thisTargetPlayerStats: selectedHistoryRecord.thisTargetAllPlayerStats ?? null,
        targetInfo: displayTargetInfo,
        combatInfos: selectedHistoryRecord.combatInfos ?? null,
      };
    }

    if (!snapshot || resolvedTargetId === null) {
      return null;
    }

    return {
      targetId: resolvedTargetId,
      thisTargetPlayerStats: snapshot.byTargetPlayerStats?.[String(resolvedTargetId)] ?? null,
      targetInfo: displayTargetInfo,
      combatInfos: snapshot.combatInfos ?? null,
    };
  }, [displayTargetInfo, resolvedTargetId, selectedHistoryRecord, snapshot, view]);

  const displayName = useMemo(() => {
    const targetName =
      displayTargetInfo?.targetName ||
      displayTargetInfo?.id ||
      maskNickname(mainPlayerName, settings.appearance.dpsWindow.maskNicknames) ||
      (t("未检测") as string);
    return targetName;
  }, [displayTargetInfo, mainPlayerName, settings.appearance.dpsWindow.maskNicknames]);

  const targetFightingTime = useMemo(() => {
    if (!displayTargetInfo) {
      return 0;
    }

    const startTimes = Object.values(displayTargetInfo.targetStartTime || {});
    const lastTimes = Object.values(displayTargetInfo.targetLastTime || {});
    if (startTimes.length === 0 || lastTimes.length === 0) {
      return 0;
    }

    const startTime = Math.min(...startTimes);
    const lastTime = Math.max(...lastTimes);
    if (!Number.isFinite(startTime) || !Number.isFinite(lastTime)) {
      return 0;
    }

    return Math.max(0, lastTime - startTime);
  }, [displayTargetInfo]);

  const timerStatus = useMemo(() => {
    if (!targetFightingTime || targetFightingTime <= 0) {
      return "00:00";
    }
    const totalSeconds = Math.floor(targetFightingTime);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const mm = String(minutes).padStart(2, "0");
    const ss = String(seconds).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [targetFightingTime]);

  const dpsBackground = hexToRgba(dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity);

  const buildDetailPayload = useCallback(
    (playerId: number): DpsDetailPayload | null => {
      if (resolvedTargetId === null) {
        return null;
      }

      if (view === "history") {
        if (!selectedHistoryRecord) {
          return null;
        }

        const playerStats =
          selectedHistoryRecord.thisTargetAllPlayerStats?.[String(playerId)] ?? null;
        if (!playerStats) {
          return null;
        }

        return {
          mode: "history",
          actorId: playerId,
          targetId: resolvedTargetId,
          combatInfos: selectedHistoryRecord.combatInfos,
          playerStats,
          playerSkillStats:
            selectedHistoryRecord.thisTargetAllPlayerSkillStats?.[String(playerId)] ?? {},
          playerSkillRecords:
            selectedHistoryRecord.thisTargetAllPlayerSkillRecords?.[String(playerId)] ?? [],
          playerDpsCurve: [],
        };
      }

      if (!snapshot) {
        return null;
      }

      const playerStats =
        snapshot.byTargetPlayerStats?.[String(resolvedTargetId)]?.[String(playerId)] ?? null;
      if (!playerStats) {
        return null;
      }

      return {
        mode: "live",
        actorId: playerId,
        targetId: resolvedTargetId,
        combatInfos: snapshot.combatInfos,
        playerStats,
        playerSkillStats:
          snapshot.byTargetPlayerSkillStats?.[String(resolvedTargetId)]?.[String(playerId)] ?? {},
        playerSkillRecords:
          snapshot.byTargetPlayerSkillRecords?.[String(resolvedTargetId)]?.[String(playerId)] ?? [],
        playerDpsCurve:
          snapshot.byTargetPlayerDpsCurve?.[String(resolvedTargetId)]?.[String(playerId)] ?? [],
      };
    },
    [resolvedTargetId, selectedHistoryRecord, snapshot, view]
  );

  const ensureDetailWindow = useCallback(async () => {
    await createWindow("dps_detail", {
      title: "DPS Detail",
      url: "/dps_detail",
      width: 1080,
      height: 420,
      decorations: false,
      transparent: true,
      resizable: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
    });

    await waitForWindowReady("dps_detail");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps",
        childLabel: "dps_detail",
        url: "/dps_detail",
        title: "DPS Detail",
        width: 560,
        height: 420,
        gap: 8,
        decorations: false,
        transparent: true,
        resizable: true,
        shadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focus: false,
        focusable: false,
      },
    });
  }, []);

  const cancelDetailCloseTimer = useCallback(() => {
    if (detailCloseTimerRef.current !== null) {
      window.clearTimeout(detailCloseTimerRef.current);
      detailCloseTimerRef.current = null;
    }
  }, []);

  const hideDetailWindow = useCallback(async () => {
    const detailWindow = await WebviewWindow.getByLabel("dps_detail");
    if (detailWindow) {
      await detailWindow.hide();
    }
  }, []);

  const closeDetailWindowNow = useCallback(async () => {
    cancelDetailCloseTimer();
    const detailWindow = await WebviewWindow.getByLabel("dps_detail");
    if (detailWindow) {
      await detailWindow.close();
    }
  }, [cancelDetailCloseTimer]);

  const scheduleDetailWindowDestroy = useCallback(() => {
    cancelDetailCloseTimer();
    detailCloseTimerRef.current = window.setTimeout(() => {
      detailCloseTimerRef.current = null;
      if (pinnedPlayerId !== null || hoverPlayerId !== null) {
        return;
      }
      void closeDetailWindowNow();
    }, 10_000);
  }, [cancelDetailCloseTimer, closeDetailWindowNow, hoverPlayerId, pinnedPlayerId]);

  const handleStartDpsMeter = useCallback(async () => {
    try {
      await invoke("start_dps_meter");
    } catch (error) {
      console.error("start dps meter failed:", error);
    }
  }, []);

  const handleStopDpsMeter = useCallback(async () => {
    try {
      await invoke("stop_dps_meter");
    } catch (error) {
      console.error("stop dps meter failed:", error);
    }
  }, []);

  const handleReset = useCallback(async () => {
    try {
      if (mainActorResetTimerRef.current !== null) {
        window.clearTimeout(mainActorResetTimerRef.current);
        mainActorResetTimerRef.current = null;
      }
      // 构建历史记录
      const historyToPersist = snapshot ? buildHistoryRecordsFromSnapshot(snapshot) : [];

      // 清空状态
      await invoke("reset_dps_meter");
      lastSnapshotDamageRef.current = null;
      lastMemorySignatureRef.current = null;
      setSnapshot(null);

      setCurrentTarget(null);
      setPinnedPlayerId(null);
      setHoverPlayerId(null);
      setView("dps");
      detailPayloadRef.current = null;
      void emit("dps-detail-clear");
      await closeDetailWindowNow();

      lastWindowHeightRef.current = null;
      window.requestAnimationFrame(() => {
        void resizeWindow();
      });

      if (historyToPersist.length > 0) {
        // 保存到本地
        persistHistoryRecords(historyToPersist);
        // 上传到数据库
        try {
          console.log(`开始上传 ${historyToPersist.length} 条数据`);
          await uploadDpsDataBatch(historyToPersist);
          console.log(`✅ 上传成功！`);
        } catch (err) {
          console.error("❌ 上传失败:", err);
        }
      }
    } catch (error) {
      console.error("reset dps meter failed:", error);
    }
  }, [closeDetailWindowNow, resizeWindow, snapshot]);

  useEffect(() => {
    latestResetHandlerRef.current = handleReset;
  }, [handleReset]);

  const handlePlayerClick = useCallback(
    async (playerId: number) => {
      detailHoverTokenRef.current += 1;
      const nextPayload = buildDetailPayload(playerId);
      if (!nextPayload) {
        return;
      }

      cancelDetailCloseTimer();
      setPinnedPlayerId(playerId);
      setHoverPlayerId(null);
      detailPayloadRef.current = nextPayload;
      await ensureDetailWindow();
      await emit("dps-detail-update", nextPayload);
    },
    [buildDetailPayload, cancelDetailCloseTimer, ensureDetailWindow]
  );

  const handlePlayerHover = useCallback(
    async (playerId: number) => {
      if (pinnedPlayerId !== null) {
        return;
      }

      if (!settings.appearance.dpsWindow.showDetailOnHover) {
        return;
      }

      const nextPayload = buildDetailPayload(playerId);
      if (!nextPayload) {
        return;
      }

      cancelDetailCloseTimer();
      const hoverToken = detailHoverTokenRef.current + 1;
      detailHoverTokenRef.current = hoverToken;
      setHoverPlayerId(playerId);
      detailPayloadRef.current = nextPayload;
      await ensureDetailWindow();
      if (
        detailHoverTokenRef.current !== hoverToken ||
        pinnedPlayerIdRef.current !== null ||
        hoverPlayerIdRef.current !== playerId
      ) {
        await hideDetailWindow();
        scheduleDetailWindowDestroy();
        return;
      }
      await emit("dps-detail-update", nextPayload);
    },
    [
      buildDetailPayload,
      cancelDetailCloseTimer,
      ensureDetailWindow,
      hideDetailWindow,
      pinnedPlayerId,
      scheduleDetailWindowDestroy,
    ]
  );

  const handlePlayerHoverEnd = useCallback(async () => {
    if (pinnedPlayerId !== null) {
      return;
    }

    detailHoverTokenRef.current += 1;
    setHoverPlayerId(null);
    detailPayloadRef.current = null;
    void emit("dps-detail-clear");
    await hideDetailWindow();
    scheduleDetailWindowDestroy();
  }, [hideDetailWindow, pinnedPlayerId, scheduleDetailWindowDestroy]);

  const activeDetailPlayerId = pinnedPlayerId ?? hoverPlayerId;

  useEffect(() => {
    if (view !== "dps" || activeDetailPlayerId === null) {
      return;
    }

    const nextPayload = buildDetailPayload(activeDetailPlayerId);
    if (!nextPayload) {
      detailPayloadRef.current = null;
      void emit("dps-detail-clear");
      return;
    }

    detailPayloadRef.current = nextPayload;
    void emit("dps-detail-update", nextPayload);
  }, [activeDetailPlayerId, buildDetailPayload, snapshot, view]);

  useEffect(() => {
    if (view !== "history" || activeDetailPlayerId === null) {
      return;
    }

    const nextPayload = buildDetailPayload(activeDetailPlayerId);
    detailPayloadRef.current = nextPayload;
    if (nextPayload) {
      void emit("dps-detail-update", nextPayload);
    } else {
      void emit("dps-detail-clear");
    }
  }, [activeDetailPlayerId, buildDetailPayload, selectedHistoryId, view]);

  useEffect(() => {
    cancelDetailCloseTimer();
    setPinnedPlayerId(null);
    setHoverPlayerId(null);
    detailPayloadRef.current = null;
    void emit("dps-detail-clear");
    void closeDetailWindowNow();
  }, [cancelDetailCloseTimer, closeDetailWindowNow, resolvedTargetId, selectedHistoryId, view]);

  const handleOpenSettings = useCallback(async () => {
    await createWindow("dps_settings", {
      title: "DPS Settings",
      url: "/dps_settings",
      width: 560,
      height: 1080,
      decorations: false,
      transparent: true,
      resizable: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
    });

    await waitForWindowReady("dps_settings");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps",
        childLabel: "dps_settings",
        url: "/dps_settings",
        title: "DPS Log",
        width: 560,
        height: 1080,
        gap: 8,
        decorations: false,
        transparent: true,
        resizable: true,
        shadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
      },
    });
  }, [t]);

  const handleOpenHistory = useCallback(() => {
    if (view === "history") {
      setView("dps");
      return;
    }

    const nextHistoryRecords = Aion2DpsHistory.get();
    setHistoryRecords(nextHistoryRecords);
    setSelectedHistoryId(nextHistoryRecords[0]?.id ?? null);
    setView("history");
  }, [view]);

  const handleOpenLog = useCallback(async () => {
    await createWindow("dps_log", {
      title: "DPS Log",
      url: "/dps_log",
      width: 560,
      height: 320,
      decorations: false,
      transparent: true,
      resizable: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
    });

    await waitForWindowReady("dps_log");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps",
        childLabel: "dps_log",
        url: "/dps_log",
        title: "DPS Log",
        width: 560,
        height: 320,
        gap: 8,
        decorations: false,
        transparent: true,
        resizable: true,
        shadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
      },
    });
  }, []);

  const handleClearHistory = useCallback(async () => {
    Aion2DpsHistory.clear();
    setHistoryRecords([]);
    setSelectedHistoryId(null);
    setPinnedPlayerId(null);
    setHoverPlayerId(null);
    detailPayloadRef.current = null;
    void emit("dps-detail-clear");
    await closeDetailWindowNow();
  }, [closeDetailWindowNow]);

  // const handleClose = async () => {
  //   const appWindow = getCurrentWebviewWindow();
  //   await appWindow.close();
  // };
  const rightActions = (
    <div className="flex items-center gap-1 pr-0">
      {isRunning ? (
        <TitleIconButton
          active
          onClick={handleStopDpsMeter}
          title={t("dps.actions.stop")}
          tone="danger"
        >
          <Square className="h-3 w-3" />
        </TitleIconButton>
      ) : (
        <TitleIconButton
          active
          onClick={handleStartDpsMeter}
          title={t("dps.actions.start")}
          tone="accent"
        >
          <Play className="h-3.5 w-3.5" />
        </TitleIconButton>
      )}

      <TitleIconButton active onClick={handleReset} title={t("dps.actions.reset")}>
        <RotateCcw className="h-3.5 w-3.5" />
      </TitleIconButton>

      <TitleIconButton active onClick={handleOpenHistory} title={t("dps.actions.reset")}>
        <History className="h-3.5 w-3.5" />
      </TitleIconButton>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={() => {}}
            title={t("dps.actions.settings")}
            className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem className="px-2 py-1 text-sm" onClick={handleOpenSettings}>
            <Settings /> <span className="text-sm">设置</span>
          </DropdownMenuItem>
          {/* <DropdownMenuItem className="px-2 py-1 text-sm" onClick={handleOpenHistory}>
            <History /> <span className="text-sm">历史</span>
          </DropdownMenuItem> */}
          <DropdownMenuItem className="px-2 py-1 text-sm" onClick={handleOpenLog}>
            <Book /> <span className="text-sm">日志</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* <TitleIconButton active onClick={handleClose} title={t("dps.actions.reset")}>
        <X className="h-3 w-3" />
      </TitleIconButton> */}
    </div>
  );

  const leftActions = (
    <div className="flex min-w-0 items-center gap-1" data-tauri-drag-region>
      <button
        onClick={() => setView("dps")}
        className="flex h-6 w-6 cursor-pointer items-center justify-center p-0 hover:scale-110 hover:brightness-110 data-[tauri-drag-region]:pointer-events-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        <img
          src="icon.png"
          alt="icon"
          className="h-6 w-6"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      </button>

      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex min-w-0 items-center gap-2 rounded-full px-1" data-tauri-drag-region>
            <div
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                view === "history"
                  ? "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.6)]"
                  : !isRunning
                    ? "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.6)]"
                    : targetFightingTime > 0
                      ? "bg-yellow-300 shadow-[0_0_6px_rgba(253,224,71,0.6)]"
                      : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
              )}
              data-tauri-drag-region
            />
            <span className="max-w-25 truncate text-sm font-semibold" data-tauri-drag-region>
              {displayName}
            </span>
            <span className="text-xs font-semibold" data-tauri-drag-region>
              {timerStatus}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {/* <div>
            {mainPlayerName} ({mainPlayerId})
          </div> */}
          <div>MobCode: {displayTargetInfo?.targetMobCode}</div>
          <div>TargetId: {displayTargetInfo?.id}</div>
        </TooltipContent>
      </Tooltip>
    </div>
  );

  const ensurePingWindow = useCallback(async () => {
    await createWindow("dps_ping", {
      title: "DPS Ping",
      url: "/dps_ping",
      width: 100,
      height: 20,
      decorations: false,
      transparent: true,
      resizable: false,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
    });

    await waitForWindowReady("dps_ping");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps",
        childLabel: "dps_ping",
        url: "/dps_ping",
        title: "DPS Ping",
        position: "bottom",
        width: 100,
        height: 20,
        gap: 0,
        decorations: false,
        transparent: true,
        resizable: true,
        shadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focus: false,
        focusable: false,
      },
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await ensurePingWindow();
        const appWindow = getCurrentWebviewWindow();
        await appWindow.setIgnoreCursorEvents(false);
      } catch (err) {
        console.error("ensurePingWindow failed:", err);
      }
    }, 10);

    return () => clearTimeout(timer);
  }, [ensurePingWindow]);

  return (
    <WindowFrame
      titleBar={
        <TitleBar
          title=""
          showAppIcon={false}
          showMaximize={false}
          showMinimize={false}
          showClose={true}
          leftActions={leftActions}
          rightActions={rightActions}
          className="border-white/10"
          style={{ backgroundColor: dpsBackground }}
        />
      }
      className="border-white/10 text-slate-100"
      contentClassName="flex flex-1 items-stretch"
    >
      <div
        className="flex h-full w-full flex-col self-stretch bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_32%)]"
        style={{
          backgroundColor: dpsBackground,
          zoom: dpsAppearance.scaleFactor,
        }}
      >
        <section className="flex h-full flex-col border border-white/10">
          <div className="flex h-full flex-col p-0">
            <div ref={contentRef}>
              {view === "history" && (
                <div className="flex min-h-10 gap-0">
                  <MemoizedHistoryTargetList
                    historyRecords={historyRecords}
                    selectedHistoryId={selectedHistoryId}
                    onSelect={setSelectedHistoryId}
                    onClear={() => void handleClearHistory()}
                  />

                  <div className="min-w-0 flex-1">
                    {dpsPanelData ? (
                      <MemoizedDpsPanel
                        targetInfo={dpsPanelData.targetInfo || undefined}
                        thisTargetPlayerStats={dpsPanelData.thisTargetPlayerStats || undefined}
                        combatInfos={dpsPanelData.combatInfos || undefined}
                        mainPlayerColor={dpsAppearance.mainPlayerColor}
                        otherPlayerColor={dpsAppearance.otherPlayerColor}
                        barOpacity={100}
                        maskNicknames={dpsAppearance.maskNicknames}
                        percentDisplayMode={dpsAppearance.percentDisplayMode}
                        showTargetHpBar={dpsAppearance.showTargetHpBar}
                        onPlayerClicked={handlePlayerClick}
                        onPlayerHovered={handlePlayerHover}
                        onPlayerHoverEnd={handlePlayerHoverEnd}
                      />
                    ) : (
                      <div className="flex h-10 max-h-10 items-center justify-center rounded-xl px-4 text-center">
                        <div className="text-sm font-medium text-slate-100">等待战斗中</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {view === "dps" && (
                <div className="min-h-12 p-2 pt-1">
                  {dpsPanelData ? (
                    <MemoizedDpsPanel
                      targetInfo={dpsPanelData.targetInfo || undefined}
                      thisTargetPlayerStats={dpsPanelData.thisTargetPlayerStats || undefined}
                      combatInfos={dpsPanelData.combatInfos || undefined}
                      mainPlayerColor={dpsAppearance.mainPlayerColor}
                      otherPlayerColor={dpsAppearance.otherPlayerColor}
                      barOpacity={100}
                      maskNicknames={dpsAppearance.maskNicknames}
                      percentDisplayMode={dpsAppearance.percentDisplayMode}
                      classIconStyle={dpsAppearance.classIconStyle}
                      showTargetHpBar={dpsAppearance.showTargetHpBar}
                      onPlayerClicked={handlePlayerClick}
                      onPlayerHovered={handlePlayerHover}
                      onPlayerHoverEnd={handlePlayerHoverEnd}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center rounded-xl px-4 text-center">
                      <div className="h-full text-sm font-medium text-slate-100">等待战斗中</div>
                    </div>
                  )}
                </div>
              )}

              {view === "ping" && <PingCurve pingHistory={pingHistory}></PingCurve>}
            </div>
          </div>
        </section>
      </div>
    </WindowFrame>
  );
}
