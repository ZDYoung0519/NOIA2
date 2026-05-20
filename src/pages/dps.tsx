import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useDeferredValue,
  type ReactNode,
} from "react";

import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  ArrowLeft,
  Clock3,
  Play,
  RotateCcw,
  Square,
  Settings,
  History,
  Book,
  X,
} from "lucide-react";
import { maskNickname } from "@/lib/name-mask";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { MemoizedDpsPanelSimple } from "@/components/dps/dps-panel-simple";
import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import { MemoizedDpsHistory } from "@/components/dps-history";

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
  TargetInfo,
} from "@/types/aion2dps";
import { uploadDpsDataBatch } from "@/lib/supabase/upload-dps-data";
import { PingCurve } from "@/components/ping-curve";

const HISTORY_DAMAGE_THRESHOLD = 1_000_000;

const getSkillStatsDamage = (stats?: SkillStats | null) => Number(stats?.total_damage ?? 0);

const getTargetTotalDamage = (playerStats?: Record<string, SkillStats> | null) =>
  Object.values(playerStats ?? {}).reduce((sum, stats) => sum + getSkillStatsDamage(stats), 0);

const cloneJson = <T,>(value: T): T => structuredClone(value) as T;

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
    .sort((a, b) => {
      const ta = a.combatInfos.targetInfos?.[String(a.targetId)];
      const tb = b.combatInfos.targetInfos?.[String(b.targetId)];
      const la = Math.max(...Object.values(ta?.targetLastTime ?? {}), 0);
      const lb = Math.max(...Object.values(tb?.targetLastTime ?? {}), 0);
      return lb - la;
    });
};

const persistHistoryRecords = (records: HistoryTargetRecord[]) => {
  if (records.length === 0) return;
  Aion2DpsHistory.addMany(records.map((r) => ({ ...r, uploaded: false })));
};

const uploadPendingHistoryRecords = async () => {
  const allRecords = Aion2DpsHistory.get();
  const pending = allRecords.filter((r) => !r.uploaded);
  if (pending.length === 0) {
    console.log("[upload] SKIP: no pending records");
    return;
  }

  try {
    await uploadDpsDataBatch(pending);
    Aion2DpsHistory.updateMany(
      pending.map((r) => ({ id: r.id, uploaded: true }) as HistoryTargetRecord)
    );
    console.log("DPS upload succeeded");
  } catch (err) {
    console.error("DPS upload failed:", err);
  }
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

type WindowFrameProps = {
  titleBar: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function WindowFrame({ titleBar, children, className, contentClassName }: WindowFrameProps) {
  return (
    <div className={cn("flex h-screen w-screen flex-col overflow-hidden rounded-sm", className)}>
      {titleBar}
      <main className={contentClassName}>{children}</main>
    </div>
  );
}

export default function DpsPage() {
  const { settings } = useAppSettings();
  const { t } = useAppTranslation();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [view, setView] = useState<"dps" | "history" | "ping">("dps");
  const [isRunning, setIsRunning] = useState(false);

  const [snapshot, setSnapshot] = useState<CombatSnapshot | null>(null);
  const [snapshotCopy, setSnapshotCopy] = useState<CombatSnapshot | null>(null);

  const deferredSnapshot = useDeferredValue(snapshot);
  const effectiveSnapshot = useMemo(
    () => deferredSnapshot || snapshotCopy,
    [deferredSnapshot, snapshotCopy]
  );

  const [mainPlayerName, setMainPlayerName] = useState<string>("");
  // const [mainPlayerId, setMainPlayerId] = useState<number | null>(null);
  const [currentTarget, setCurrentTarget] = useState<number | null>(null);
  const [pinnedPlayerId, setPinnedPlayerId] = useState<number | null>(null);
  const [hoverPlayerId, setHoverPlayerId] = useState<number | null>(null);

  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<HistoryTargetRecord | null>(
    null
  );
  const [pingHistory, setPingHistory] = useState<[number, number][]>([]);
  const [isClickThrough, setIsClickThrough] = useState(false);
  const [npcapAvailable, setNpcapAvailable] = useState<boolean | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const lastWindowHeightRef = useRef<number | null>(null);
  const lastSnapshotDamageRef = useRef<number | null>(null);
  const lastMemorySignatureRef = useRef<string | null>(null);
  const snapshotRef = useRef<CombatSnapshot | null>(null);
  const unlistenSnapshotRef = useRef<null | (() => void)>(null);
  const unlistenStatusRef = useRef<null | (() => void)>(null);

  const unlistenMainActorDetectedRef = useRef<null | (() => void)>(null);
  const unlistenResetRequestRef = useRef<null | (() => void)>(null);
  const unlistenPingHistoryRef = useRef<null | (() => void)>(null);

  const detailPayloadRef = useRef<DpsDetailPayload | null>(null);
  const latestResizeWindowRef = useRef<(() => Promise<void>) | null>(null);
  const latestResetHandlerRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    let mounted = true;
    let unlisten: null | (() => void) = null;

    const setup = async () => {
      unlisten = await listen<{ clickThrough: boolean }>("dps-click-through-changed", (event) => {
        if (!mounted) {
          return;
        }

        setIsClickThrough(Boolean(event.payload.clickThrough));
      });
    };

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        const status = await invoke<boolean>("get_dps_meter_status");
        if (mounted) {
          setIsRunning(status);
        }

        // Listen for dps-snapshot events and update the current combat snapshot
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
          setSnapshotCopy(null);
        });

        // dps-meter running state
        unlistenStatusRef.current = await listen<boolean>("dps-meter-status", (event) => {
          if (!mounted) {
            return;
          }
          const running = Boolean(event.payload);
          setIsRunning(running);
          if (!running) {
            void uploadPendingHistoryRecords();
            lastSnapshotDamageRef.current = null;
            lastMemorySignatureRef.current = null;
            setSnapshot(null);
            setSnapshotCopy(null);
            setCurrentTarget(null);
            setPinnedPlayerId(null);
            setHoverPlayerId(null);
            detailPayloadRef.current = null;
            void emit("dps-detail-clear");
          }
        });
        // ping history
        unlistenPingHistoryRef.current = await listen("ping-history", (event) => {
          if (!mounted) {
            return;
          }
          setPingHistory(event.payload as [number, number][]);
          setView("ping");
        });

        // Listen for reset requests from shortcuts
        unlistenResetRequestRef.current = await listen("dps-reset-requested", () => {
          if (!mounted) {
            return;
          }
          setSnapshotCopy(null);
          void (async () => {
            await latestResetHandlerRef.current?.();
            await uploadPendingHistoryRecords();
          })();
        });

        // Main actor detected
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

          // Save current snapshot copy for display, then autosave + upload
          setSnapshotCopy(snapshotRef.current);
          void (async () => {
            await latestResetHandlerRef.current?.();
            await uploadPendingHistoryRecords();
          })();
        });

        // Respond to dps_detail requests with the selected player details
        const unlistenDetailRequest = await listen("dps-detail-request", async () => {
          if (detailPayloadRef.current) {
            await emit("dps-detail-update", detailPayloadRef.current);
          }
        });

        // Clear selected state when the dps-detail window closes
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
    };
  }, []);

  useEffect(() => {
    invoke<boolean>("check_npcap_available")
      .then(setNpcapAvailable)
      .catch(() => setNpcapAvailable(false));
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    // Save and upload pending records before closing
    const unlisten = appWindow.onCloseRequested(async () => {
      try {
        setSnapshotCopy(null);
        await latestResetHandlerRef.current?.();
        await uploadPendingHistoryRecords();
      } catch {
        // ignore errors on close
      }
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

  // Resize the window to match content
  const resizeWindow = useCallback(async () => {
    if (!contentRef.current || !dpsAppearance.autoResizeHeight) {
      return;
    }

    const appWindow = getCurrentWebviewWindow();
    const TITLE_BAR_HEIGHT = isClickThrough ? 0 : 28;
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
  }, [dpsAppearance.autoResizeHeight, dpsAppearance.scaleFactor, isClickThrough]);

  useEffect(() => {
    latestResizeWindowRef.current = resizeWindow;
  }, [resizeWindow]);

  useEffect(() => {
    void resizeWindow();
  }, [isClickThrough, resizeWindow]);

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

  // const dpsData = useMemo<{}>(() => {
  //   const targetId =
  //     currentTarget ??
  //     effectiveSnapshot?.combatInfos?.lastTargetByMainActor ??
  //     effectiveSnapshot?.combatInfos?.lastTarget ??
  //     null;
  //   const targetInfo =
  //     targetId != null && effectiveSnapshot
  //       ? (effectiveSnapshot.combatInfos?.targetInfos?.[String(targetId)] ?? null)
  //       : null;

  //   const targetName =
  //     targetSelection.targetInfo?.targetName ||
  //     targetSelection.targetInfo?.targetMobCode ||
  //     targetSelection.targetInfo?.id ||
  //     maskNickname(mainPlayerName, settings.appearance.dpsWindow.maskNicknames) ||
  //     "No target";

  //   return [targetId, targetInfo, targetName];
  // });

  const targetSelection = useMemo<{
    targetId: number | null;
    targetInfo: TargetInfo | null;
    playerCount: number;
  }>(() => {
    if (view === "history") {
      const targetId = selectedHistoryRecord?.targetId ?? null;
      return {
        targetId,
        targetInfo:
          targetId != null
            ? (selectedHistoryRecord?.combatInfos?.targetInfos?.[String(targetId)] ?? null)
            : null,
        playerCount:
          targetId != null
            ? Object.keys(selectedHistoryRecord?.thisTargetAllPlayerStats ?? {}).length
            : 0,
      };
    }

    const targetId =
      currentTarget ??
      effectiveSnapshot?.combatInfos?.lastTargetByMainActor ??
      effectiveSnapshot?.combatInfos?.lastTarget ??
      null;

    return {
      targetId,
      targetInfo:
        targetId != null && effectiveSnapshot
          ? (effectiveSnapshot.combatInfos?.targetInfos?.[String(targetId)] ?? null)
          : null,
      playerCount:
        targetId != null && effectiveSnapshot
          ? Object.keys(effectiveSnapshot.byTargetPlayerStats?.[String(targetId)] ?? {}).length
          : 0,
    };
  }, [view, selectedHistoryRecord, currentTarget, effectiveSnapshot]);

  useEffect(() => {
    if (!dpsAppearance.autoResizeHeight) return;
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
    targetSelection.playerCount,
    view,
  ]);

  const displayName = useMemo(() => {
    const targetName =
      targetSelection.targetInfo?.targetName ||
      targetSelection.targetInfo?.targetMobCode ||
      targetSelection.targetInfo?.id ||
      maskNickname(mainPlayerName, settings.appearance.dpsWindow.maskNicknames) ||
      "No target";
    return targetName;
  }, [targetSelection.targetInfo, mainPlayerName, settings.appearance.dpsWindow.maskNicknames]);

  const StatusDescription = useMemo(() => {
    if (!isRunning) {
      return (
        <span>
          DPS 水表尚未启动，点击右上角
          <Settings className="mx-0.5 inline h-3 w-3" />
          图标 → 开始 启动监测
        </span>
      );
    }

    const npcapIcon =
      npcapAvailable === true ? (
        <span className="text-emerald-400">✓</span>
      ) : npcapAvailable === false ? (
        <span className="text-rose-400">✗</span>
      ) : (
        <span className="text-slate-500">...</span>
      );

    const playerIcon = mainPlayerName ? (
      <span className="text-emerald-400">✓</span>
    ) : (
      <span className="text-rose-400">✗</span>
    );

    if (!npcapAvailable || !mainPlayerName) {
      return (
        <span className="leading-relaxed">
          {npcapIcon} 1. 请先安装{" "}
          <a
            onClick={(e) => {
              e.preventDefault();
              void openUrl("https://npcap.com/dist/npcap-1.87.exe");
            }}
            className="cursor-pointer underline hover:text-white"
          >
            Npcap
          </a>
          （默认勾选 WinPcap 选项3）
          <br />
          {playerIcon} 2. 启动本程序后，在游戏中传送奇斯克以识别角色
          <br />
          &nbsp;&nbsp;&nbsp;3. 进行打桩/副本测试
        </span>
      );
    }
    return (
      <span>欢迎 {maskNickname(mainPlayerName, dpsAppearance.maskNicknames)}，等待战斗中</span>
    );
  }, [isRunning, mainPlayerName, npcapAvailable, dpsAppearance.maskNicknames]);

  const dpsPanelData = useMemo(() => {
    if (view === "history") {
      if (!selectedHistoryRecord || targetSelection.targetId === null) {
        return null;
      }
      return {
        targetId: targetSelection.targetId,
        thisTargetPlayerStats: selectedHistoryRecord.thisTargetAllPlayerStats ?? null,
        targetInfo: targetSelection.targetInfo,
        combatInfos: selectedHistoryRecord.combatInfos ?? null,
      };
    }
    if (!effectiveSnapshot || targetSelection.targetId === null) {
      return null;
    }
    return {
      targetId: targetSelection.targetId,
      thisTargetPlayerStats:
        effectiveSnapshot.byTargetPlayerStats?.[String(targetSelection.targetId)] ?? null,
      targetInfo: targetSelection.targetInfo,
      combatInfos: effectiveSnapshot.combatInfos ?? null,
    };
  }, [
    targetSelection.targetInfo,
    targetSelection.targetId,
    selectedHistoryRecord,
    effectiveSnapshot,
    view,
  ]);

  const DpsPanelComponent =
    dpsAppearance.panelStyle === "classicBars" ? MemoizedDpsPanel : MemoizedDpsPanelSimple;

  const targetFightingTime = useMemo(() => {
    if (!targetSelection.targetInfo) {
      return 0;
    }

    const startTimes = Object.values(targetSelection.targetInfo.targetStartTime || {});
    const lastTimes = Object.values(targetSelection.targetInfo.targetLastTime || {});
    if (startTimes.length === 0 || lastTimes.length === 0) {
      return 0;
    }

    const startTime = Math.min(...startTimes);
    const lastTime = Math.max(...lastTimes);
    if (!Number.isFinite(startTime) || !Number.isFinite(lastTime)) {
      return 0;
    }

    return Math.max(0, lastTime - startTime);
  }, [targetSelection]);

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
      if (targetSelection.targetId === null) {
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
          targetId: targetSelection.targetId,
          combatInfos: selectedHistoryRecord.combatInfos,
          playerStats,
          playerSkillStats:
            selectedHistoryRecord.thisTargetAllPlayerSkillStats?.[String(playerId)] ?? {},
        };
      }

      if (!effectiveSnapshot) {
        return null;
      }

      const playerStats =
        effectiveSnapshot.byTargetPlayerStats?.[String(targetSelection.targetId)]?.[
          String(playerId)
        ] ?? null;
      if (!playerStats) {
        return null;
      }

      return {
        mode: "live",
        actorId: playerId,
        targetId: targetSelection.targetId,
        combatInfos: effectiveSnapshot.combatInfos,
        playerStats,
        playerSkillStats:
          effectiveSnapshot.byTargetPlayerSkillStats?.[String(targetSelection.targetId)]?.[
            String(playerId)
          ] ?? {},
      };
    },
    [targetSelection.targetId, selectedHistoryRecord, effectiveSnapshot, view]
  );

  const ensureDetailWindow = useCallback(async () => {
    await createWindow("dps_detail", {
      title: "DPS Detail",
      url: "/dps_detail",
      width: 1440,
      height: 420,
      decorations: false,
      transparent: true,
      resizable: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
      center: dpsAppearance.detailWindowPosition === "center",
    });

    await waitForWindowReady("dps_detail");

    if (dpsAppearance.detailWindowPosition === "center") {
    } else {
      await invoke("ensure_tracked_window", {
        options: {
          parentLabel: "dps",
          childLabel: "dps_detail",
          url: "/dps_detail",
          title: "DPS Detail",
          width: 1440,
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
    }
  }, [dpsAppearance.detailWindowPosition]);

  const closeDetailWindow = useCallback(async () => {
    const detailWindow = await WebviewWindow.getByLabel("dps_detail");
    if (detailWindow) {
      await detailWindow.close();
    }
  }, []);

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

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const handleReset = useCallback(async () => {
    try {
      await invoke("reset_dps_meter");
      await closeDetailWindow();

      // Save current snapshot to history as unuploaded
      const currentSnapshot = snapshotRef.current;
      const historyToPersist = currentSnapshot
        ? buildHistoryRecordsFromSnapshot(currentSnapshot)
        : [];
      if (historyToPersist.length > 0) {
        persistHistoryRecords(historyToPersist);
      }

      // Clear UI
      lastSnapshotDamageRef.current = null;
      lastMemorySignatureRef.current = null;
      detailPayloadRef.current = null;

      setSnapshot(null);
      setCurrentTarget(null);
      setPinnedPlayerId(null);
      setHoverPlayerId(null);
      setView("dps");
      void emit("dps-detail-clear");
      lastWindowHeightRef.current = null;
      window.requestAnimationFrame(() => {
        void resizeWindow();
      });
    } catch (error) {
      console.error("reset dps meter failed:", error);
    }
  }, [closeDetailWindow, resizeWindow]);

  useEffect(() => {
    latestResetHandlerRef.current = handleReset;
    console.log(
      "[ref] latestResetHandlerRef updated, isAsync:",
      handleReset.constructor.name === "AsyncFunction"
    );
  }, [handleReset]);

  const handlePlayerClick = useCallback(
    async (playerId: number) => {
      const nextPayload = buildDetailPayload(playerId);
      if (!nextPayload) {
        return;
      }

      setPinnedPlayerId(playerId);
      setHoverPlayerId(null);
      detailPayloadRef.current = nextPayload;
      await ensureDetailWindow();
      await emit("dps-detail-update", nextPayload);
    },
    [buildDetailPayload, ensureDetailWindow]
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

      setHoverPlayerId(playerId);
      detailPayloadRef.current = nextPayload;
      await ensureDetailWindow();
      await emit("dps-detail-update", nextPayload);
    },
    [
      buildDetailPayload,
      ensureDetailWindow,
      pinnedPlayerId,
      settings.appearance.dpsWindow.showDetailOnHover,
    ]
  );

  const handlePlayerHoverEnd = useCallback(async () => {
    if (pinnedPlayerId !== null) {
      return;
    }

    setHoverPlayerId(null);
    detailPayloadRef.current = null;
    void emit("dps-detail-clear");
    await closeDetailWindow();
  }, [closeDetailWindow, pinnedPlayerId]);

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
    setPinnedPlayerId(null);
    setHoverPlayerId(null);
    detailPayloadRef.current = null;
    void emit("dps-detail-clear");
    void closeDetailWindow();
  }, [closeDetailWindow, targetSelection.targetId, selectedHistoryId, view]);

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
  }, []);

  const handleOpenHistory = useCallback(() => {
    if (view === "history") {
      setView("dps");
      return;
    }

    const nextHistoryRecords = Aion2DpsHistory.get();
    setSelectedHistoryId(nextHistoryRecords[0]?.id ?? null);
    setSelectedHistoryRecord(nextHistoryRecords[0] ?? null);
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

  const handleClose = useCallback(async () => {
    await getCurrentWebviewWindow().close();
  }, []);

  const titleBar = isClickThrough ? null : (
    <div
      className="flex h-7 items-center justify-between rounded-t-[5px] border border-white/10 px-2 text-slate-100 select-none"
      style={{ backgroundColor: dpsBackground }}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
        <div className="flex h-full shrink-0 items-center gap-1.5" data-tauri-drag-region>
          {view === "dps" ? (
            <Clock3 className="h-3.5 w-3.5 text-slate-400" data-tauri-drag-region />
          ) : (
            <button
              type="button"
              title="Back"
              onClick={(event) => {
                event.currentTarget.blur();
                setView("dps");
              }}
              className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none active:bg-white/5"
            >
              <ArrowLeft className="h-3 w-3" />
            </button>
          )}
          <span
            className="font-mono text-xs font-medium text-slate-100 tabular-nums"
            data-tauri-drag-region
          >
            {timerStatus}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5" data-tauri-drag-region>
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
          <span className="truncate text-xs font-medium text-slate-300" data-tauri-drag-region>
            {displayName}
          </span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          title="History"
          onClick={(event) => {
            event.currentTarget.blur();
            handleOpenHistory();
          }}
          className={cn(
            "flex h-5 w-5 items-center justify-center rounded border border-white/10 transition focus-visible:outline-none active:bg-white/5",
            view === "history"
              ? "bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20"
              : "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
          )}
        >
          <History className="h-3 w-3" />
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t("dps.actions.settings")}
              onClick={(event) => event.currentTarget.blur()}
              className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none active:bg-white/5"
            >
              <Settings className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-20 p-0.5">
            <DropdownMenuItem
              className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
              onClick={isRunning ? handleStopDpsMeter : handleStartDpsMeter}
            >
              {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span className="text-xs">{isRunning ? "停止" : "开始"}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
              onClick={() => {
                setSnapshotCopy(null); // 确认清空的snapshot备份
                void (async () => {
                  await handleReset(); // 清空snapshot并且创建和加入历史
                  await uploadPendingHistoryRecords(); // 上传历史中没有上传的
                })();
              }}
            >
              <RotateCcw className="h-3 w-3" />
              <span className="text-xs">清空</span>
            </DropdownMenuItem>
            {/* <DropdownMenuItem className="px-2 py-1 text-sm" onClick={handleOpenHistory}>
              <History />
              <span className="text-xs">历史</span>
            </DropdownMenuItem> */}
            <DropdownMenuItem
              className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
              onClick={handleOpenSettings}
            >
              <Settings className="h-3 w-3" />
              <span className="text-xs">设置</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
              onClick={handleOpenLog}
            >
              <Book className="h-3 w-3" />
              <span className="text-xs">日志</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          title="Close"
          onClick={(event) => {
            event.currentTarget.blur();
            void handleClose();
          }}
          className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-100 focus-visible:outline-none active:bg-white/5"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );

  const ensurePingWindow = useCallback(async () => {
    await createWindow("dps_ping", {
      title: "DPS Ping",
      url: "/dps_ping",
      width: 150,
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
        width: 150,
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
        setIsClickThrough(false);
      } catch (err) {
        console.error("initialize dps window failed:", err);
      }
    }, 1);

    return () => clearTimeout(timer);
  }, [ensurePingWindow]);

  return (
    <WindowFrame
      titleBar={titleBar}
      className="text-slate-100"
      contentClassName="flex flex-1 items-stretch"
    >
      <div
        className="flex h-full w-full flex-col self-stretch"
        style={{
          zoom: dpsAppearance.scaleFactor,
          backgroundColor: dpsBackground,
        }}
      >
        <section className="flex h-full flex-col">
          <div className="flex h-full flex-col p-0">
            <div ref={contentRef}>
              {view === "history" && (
                <div className="flex min-h-10 gap-0">
                  <MemoizedDpsHistory
                    selectedHistoryId={selectedHistoryId}
                    onSelect={(id, record) => {
                      setSelectedHistoryId(id);
                      setSelectedHistoryRecord(record);
                    }}
                    onClear={() => {
                      setSelectedHistoryId(null);
                      setSelectedHistoryRecord(null);
                      setPinnedPlayerId(null);
                      setHoverPlayerId(null);
                    }}
                  />

                  <div className="min-w-0 flex-1">
                    {dpsPanelData && (
                      <DpsPanelComponent
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
                    )}
                  </div>
                </div>
              )}

              {view === "dps" && (
                <div className="min-h-25 w-full p-0">
                  {dpsPanelData ? (
                    <DpsPanelComponent
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
                    <div className="flex min-h-25 items-center justify-center rounded text-center">
                      <div className="text-xs text-slate-100 select-none">{StatusDescription}</div>
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
