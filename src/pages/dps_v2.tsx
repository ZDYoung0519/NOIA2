import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  ArrowLeft,
  Book,
  Clock3,
  History,
  Pin,
  Play,
  RotateCcw,
  Settings,
  Square,
  X,
} from "lucide-react";

import { useAppSettings } from "@/hooks/use-app-settings";
import { getServerShortName } from "@/lib/aion2/servers";
import { createWindow } from "@/lib/window";
import { uploadDpsDataBatch } from "@/lib/supabase/upload-dps-data";
import type {
  CombatSnapshot,
  DpsDetailPayload,
  HistoryTargetRecord,
  PlayerOverviewStat,
} from "@/types/aion2dps";
import { Aion2DpsHistory, Aion2MainActorHistory } from "@/lib/localStorageHistory";
import { MemoizedDpsHistory } from "@/components/dps-history";
import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { PingCurve } from "@/components/ping-curve";
import { cn } from "@/lib/utils";
import { maskNickname } from "@/lib/name-mask";

function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const s =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = parseInt(s.slice(0, 2), 16);
  const g = parseInt(s.slice(2, 4), 16);
  const b = parseInt(s.slice(4, 6), 16);
  const a = Math.max(0, Math.min(100, alpha)) / 100;
  return `rgba(${r},${g},${b},${a})`;
}

function fmt(n: number) {
  return Math.floor(n).toLocaleString();
}

function fmtDps(n: number) {
  return Math.round(n).toLocaleString();
}

function fmtDmg(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}e`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}w`;
  return fmt(n);
}

function fmtTimer(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

const HISTORY_THRESHOLD = 1_000_000;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const ROW_CLASS =
  "group relative flex h-7.5 cursor-pointer items-center overflow-hidden rounded border border-transparent hover:border-cyan-500/40 hover:bg-white/5";
const BAR_CLASS = "js-bar absolute inset-y-0 left-0 w-full origin-left rounded";

type DpsDetailV2Mode = "live" | "history";

type DpsDetailV2Selection = {
  mode: DpsDetailV2Mode;
  targetId: number;
  playerId: number;
};

type DpsDetailV2OpenPayload = {
  selection: DpsDetailV2Selection;
  detailData: DpsDetailPayload | null;
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

function buildLiveDetailPayload(
  snapshot: CombatSnapshot | null,
  targetId: number,
  playerId: number
): DpsDetailPayload | null {
  if (!snapshot) {
    return null;
  }

  const playerStats = snapshot.byTargetPlayerStats?.[String(targetId)]?.[String(playerId)] ?? null;
  if (!playerStats) {
    return null;
  }

  return {
    mode: "live",
    actorId: playerId,
    targetId,
    combatInfos: snapshot.combatInfos,
    playerStats,
    playerSkillStats:
      snapshot.byTargetPlayerSkillStats?.[String(targetId)]?.[String(playerId)] ?? {},
  };
}

type Row = {
  root: HTMLElement;
  bar: HTMLElement;
  icon: HTMLImageElement;
  name: HTMLElement;
  server: HTMLElement;
  dps: HTMLElement;
  dmg: HTMLElement;
  pct: HTMLElement;
};

type RowCache = {
  visible?: boolean;
  scale?: string;
  background?: string;
  iconSrc?: string;
  name?: string;
  server?: string;
  dps?: string;
  dmg?: string;
  pct?: string;
};

export default function DpsV2Page() {
  const { settings, saveSettings } = useAppSettings();
  const dpsAppearanceSetting = settings.appearance.dpsWindow;

  const bg = hexToRgba(
    dpsAppearanceSetting.backgroundColor,
    dpsAppearanceSetting.backgroundOpacity
  );

  const [isRunning, setIsRunning] = useState(false);
  const [view, setView] = useState<"dps" | "dps_history" | "ping">("dps");
  const [pingHistory, setPingHistory] = useState<[number, number][]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<HistoryTargetRecord | null>(
    null
  );

  const snapshotRef = useRef<CombatSnapshot | null>(null);
  const isRunningRef = useRef(false);
  const pendingPaintRef = useRef(false);
  const lastTotalDamageRef = useRef(Number.NaN);
  const lastStatsLengthRef = useRef(-1);
  const rowsRef = useRef<Row[]>([]);
  const rowCacheRef = useRef<RowCache[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<HTMLSpanElement | null>(null);
  const targetNameRef = useRef<HTMLSpanElement | null>(null);
  const dotRef = useRef<HTMLDivElement | null>(null);
  const lastDotClassRef = useRef("");
  const lastTimerRef = useRef("");
  const serverNameCacheRef = useRef(new Map<string, string>());
  const detailSelectionRef = useRef<DpsDetailV2Selection | null>(null);
  const lastVisiblePlayerCountRef = useRef(-1);
  const lastHeightRef = useRef(0);
  const resizeTimerRef = useRef(0);
  const viewRef = useRef<"dps" | "dps_history" | "ping">("dps");

  viewRef.current = view;

  const selectedHistoryTargetInfo = useMemo(() => {
    if (!selectedHistoryRecord) {
      return null;
    }

    return (
      selectedHistoryRecord.combatInfos.targetInfos?.[String(selectedHistoryRecord.targetId)] ??
      null
    );
  }, [selectedHistoryRecord]);

  const setText = (element: HTMLElement | null, value: string) => {
    if (!element || element.textContent === value) {
      return;
    }

    element.textContent = value;
  };

  const setDot = (className: string) => {
    if (!dotRef.current || lastDotClassRef.current === className) {
      return;
    }

    lastDotClassRef.current = className;
    dotRef.current.className = `h-1.5 w-1.5 shrink-0 rounded-full ${className}`;
  };

  const resizeWindow = useCallback(
    async (force = false) => {
      if (!dpsAppearanceSetting.autoResizeHeight) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      try {
        const appWindow = getCurrentWebviewWindow();
        const titleHeight = 28;
        const bodyPadding = 8;
        const minHeight = 120;
        const maxHeight = 1000;
        const targetHeight = Math.max(
          minHeight,
          Math.min(
            maxHeight,
            Math.ceil(
              container.scrollHeight * dpsAppearanceSetting.scaleFactor + titleHeight + bodyPadding
            )
          )
        );
        const scaleFactor = await appWindow.scaleFactor();
        const outerSize = await appWindow.outerSize();

        if (Math.abs(outerSize.height / scaleFactor - targetHeight) < 5) {
          lastHeightRef.current = targetHeight;
          return;
        }
        if (!force && Math.abs(lastHeightRef.current - targetHeight) < 5) {
          return;
        }

        lastHeightRef.current = targetHeight;
        await appWindow.setSize(new LogicalSize(outerSize.width / scaleFactor, targetHeight));
      } catch {
        /* empty */
      }
    },
    [dpsAppearanceSetting.autoResizeHeight, dpsAppearanceSetting.scaleFactor]
  );

  const schedulePaint = useCallback(() => {
    if (pendingPaintRef.current) {
      return;
    }

    pendingPaintRef.current = true;
    requestAnimationFrame(() => {
      pendingPaintRef.current = false;

      const snapshot = snapshotRef.current;
      if (!snapshot || !isRunningRef.current) {
        return;
      }

      const stats = snapshot.lastTargetAllPlayersOverviewStats as PlayerOverviewStat[] | undefined;
      const nextLength = Math.min(8, stats?.length ?? 0);
      if (
        snapshot.totalDamage === lastTotalDamageRef.current &&
        nextLength === lastStatsLengthRef.current
      ) {
        return;
      }

      lastTotalDamageRef.current = snapshot.totalDamage;
      lastStatsLengthRef.current = nextLength;

      const rows = rowsRef.current;
      if (!stats || nextLength === 0) {
        for (const [index, row] of rows.entries()) {
          const cache = rowCacheRef.current[index] ?? {};
          if (cache.visible !== false) {
            row.root.style.display = "none";
            cache.visible = false;
            rowCacheRef.current[index] = cache;
          }
        }
        return;
      }

      const maxDamage = stats[0]?.totalDamage ?? 1;
      const mainActorName = snapshot.combatInfos?.mainActorName;

      stats.slice(0, 8).forEach((player, index) => {
        const row = rows[index];
        if (!row) {
          return;
        }

        const cache = rowCacheRef.current[index] ?? {};
        const damage = player.totalDamage ?? 0;
        const scale = `scaleX(${damage / Math.max(1, maxDamage)})`;
        const playerColor =
          mainActorName != null && player.actorName === mainActorName
            ? dpsAppearanceSetting.mainPlayerColor
            : dpsAppearanceSetting.otherPlayerColor;
        const background = playerColor;
        const iconSrc = player.actorClass
          ? dpsAppearanceSetting.classIconStyle === "default"
            ? `/images/class/${player.actorClass.toLowerCase()}.webp`
            : `/images/class/${player.actorClass.toLowerCase()}.png`
          : "/images/aion2.png";

        const name = maskNickname(
          player.actorName || `Player ${player.actorId}`,
          dpsAppearanceSetting.maskNicknames
        );
        const server = player.actorServerId
          ? `[${serverNameCacheRef.current.get(player.actorServerId) ?? getServerShortName(Number(player.actorServerId))}]`
          : "";
        if (player.actorServerId && !serverNameCacheRef.current.has(player.actorServerId)) {
          serverNameCacheRef.current.set(
            player.actorServerId,
            getServerShortName(Number(player.actorServerId))
          );
        }
        const dps = fmtDps(player.dps);
        const dmg = fmtDmg(damage);
        const pctValue =
          dpsAppearanceSetting.percentDisplayMode === "contribution"
            ? player.damageContribution
            : player.damageShare;
        const pct = `${(Math.min(1, Math.max(0, pctValue)) * 100).toFixed(1)}%`;

        if (cache.visible !== true) {
          row.root.style.display = "";
          cache.visible = true;
        }
        if (cache.scale !== scale) {
          row.bar.style.transform = scale;
          cache.scale = scale;
        }
        if (cache.background !== background) {
          row.bar.style.background = background;
          cache.background = background;
        }
        if (cache.iconSrc !== iconSrc) {
          row.icon.style.display = "";
          row.icon.src = iconSrc;
          cache.iconSrc = iconSrc;
        }
        if (cache.name !== name) {
          setText(row.name, name);
          cache.name = name;
        }
        if (cache.server !== server) {
          setText(row.server, server);
          cache.server = server;
        }
        if (cache.dps !== dps) {
          setText(row.dps, dps);
          cache.dps = dps;
        }
        if (cache.dmg !== dmg) {
          setText(row.dmg, dmg);
          cache.dmg = dmg;
        }
        if (cache.pct !== pct) {
          setText(row.pct, pct);
          cache.pct = pct;
        }

        rowCacheRef.current[index] = cache;
      });

      for (let index = nextLength; index < rows.length; index += 1) {
        const row = rows[index];
        const cache = rowCacheRef.current[index] ?? {};
        if (cache.visible !== false) {
          row.root.style.display = "none";
          cache.visible = false;
          rowCacheRef.current[index] = cache;
        }
      }
    });
  }, [
    dpsAppearanceSetting.classIconStyle,
    dpsAppearanceSetting.mainPlayerColor,
    dpsAppearanceSetting.otherPlayerColor,
  ]);

  const resetUi = useCallback(() => {
    snapshotRef.current = null;
    lastTotalDamageRef.current = Number.NaN;
    lastStatsLengthRef.current = -1;
    lastVisiblePlayerCountRef.current = 0;
    rowCacheRef.current = [];
    detailSelectionRef.current = null;
    setText(targetNameRef.current, "No Target");
    setText(timerRef.current, "00:00");
    for (const row of rowsRef.current) {
      row.root.style.display = "none";
    }
    setView("dps");
    window.requestAnimationFrame(() => {
      void resizeWindow(true);
    });
  }, [resizeWindow]);

  const persistHistoryFromSnapshot = useCallback((snapshot: CombatSnapshot | null) => {
    if (!snapshot) {
      return;
    }

    const records = Object.entries(snapshot.byTargetPlayerStats ?? {}).flatMap(
      ([targetId, playerStats]) => {
        const numericTargetId = Number(targetId);
        const totalDamage = Object.values(playerStats ?? {}).reduce(
          (sum, stats) => sum + Number(stats?.total_damage ?? 0),
          0
        );

        if (!Number.isFinite(numericTargetId) || totalDamage <= HISTORY_THRESHOLD) {
          return [];
        }

        return [
          {
            id: `${targetId}-${Date.now()}`,
            targetId: numericTargetId,
            thisTargetAllPlayerStats: clone(playerStats),
            thisTargetAllPlayerSkillStats: clone(
              snapshot.byTargetPlayerSkillStats?.[targetId] ?? {}
            ),
            thisTargetAllPlayerSkillRecords: {},
            combatInfos: clone({
              ...snapshot.combatInfos,
              targetInfos: snapshot.combatInfos.targetInfos?.[targetId]
                ? { [targetId]: snapshot.combatInfos.targetInfos[targetId] }
                : {},
            }),
          },
        ];
      }
    );

    if (records.length > 0) {
      Aion2DpsHistory.addMany(
        records.map((record) => ({ ...record, uploaded: false })) as HistoryTargetRecord[]
      );
    }
  }, []);

  const uploadPendingHistoryRecords = useCallback(async () => {
    const allRecords = Aion2DpsHistory.get();
    const pending = allRecords.filter((record) => !record.uploaded);
    if (pending.length === 0) {
      return;
    }

    try {
      await uploadDpsDataBatch(pending);
      Aion2DpsHistory.updateMany(
        pending.map((record) => ({ id: record.id, uploaded: true }) as HistoryTargetRecord)
      );
    } catch (error) {
      console.error("DPS upload failed:", error);
    }
  }, []);

  const ensureDetailWindow = useCallback(async () => {
    await createWindow("dps_detail_v2", {
      title: "DPS Detail V2",
      url: "/dps_detail_v2",
      width: 1440,
      height: 420,
      decorations: false,
      transparent: true,
      resizable: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
      focusable: false,
    });

    await waitForWindowReady("dps_detail_v2");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps_v2",
        childLabel: "dps_detail_v2",
        url: "/dps_detail_v2",
        title: "DPS Detail V2",
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
  }, []);

  const buildHistoryDetailPayload = useCallback(
    (playerId: number): DpsDetailPayload | null => {
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
        targetId: selectedHistoryRecord.targetId,
        combatInfos: selectedHistoryRecord.combatInfos,
        playerStats,
        playerSkillStats:
          selectedHistoryRecord.thisTargetAllPlayerSkillStats?.[String(playerId)] ?? {},
      };
    },
    [selectedHistoryRecord]
  );

  const handleContainerClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      if (viewRef.current !== "dps") {
        return;
      }

      const row = (event.target as HTMLElement).closest("[data-row]") as HTMLElement | null;
      if (!row) {
        return;
      }

      const index = Number(row.dataset.row);
      const snapshot = snapshotRef.current;
      const stats = snapshot?.lastTargetAllPlayersOverviewStats as PlayerOverviewStat[] | undefined;
      const targetId = snapshot?.lastTargetInfo?.id;
      const player = stats?.[index];

      if (!player || !targetId) {
        return;
      }

      const selection: DpsDetailV2Selection = {
        mode: "live",
        targetId,
        playerId: player.actorId,
      };
      detailSelectionRef.current = selection;
      const detailData = buildLiveDetailPayload(snapshot, targetId, player.actorId);

      await ensureDetailWindow();
      await emit("dps-detail-v2-open", {
        selection,
        detailData,
      } satisfies DpsDetailV2OpenPayload);
    },
    [ensureDetailWindow]
  );

  const handleHistoryPlayerClick = useCallback(
    async (playerId: number) => {
      const detailData = buildHistoryDetailPayload(playerId);
      if (!detailData || !selectedHistoryRecord) {
        return;
      }

      const selection: DpsDetailV2Selection = {
        mode: "history",
        targetId: selectedHistoryRecord.targetId,
        playerId,
      };
      detailSelectionRef.current = selection;

      await ensureDetailWindow();
      await emit("dps-detail-v2-open", {
        selection,
        detailData,
      } satisfies DpsDetailV2OpenPayload);
    },
    [buildHistoryDetailPayload, ensureDetailWindow, selectedHistoryRecord]
  );

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    rowsRef.current = Array.from({ length: 8 }, (_, i) => {
      const r = c.querySelector<HTMLElement>(`[data-row="${i}"]`)!;
      return {
        root: r,
        bar: r.querySelector<HTMLElement>(".js-bar")!,
        accentBar: r.querySelector<HTMLElement>(".js-accent-bar"),
        icon: r.querySelector<HTMLImageElement>(".js-icon")!,
        name: r.querySelector<HTMLElement>(".js-name")!,
        server: r.querySelector<HTMLElement>(".js-server")!,
        dps: r.querySelector<HTMLElement>(".js-dps")!,
        dmg: r.querySelector<HTMLElement>(".js-dmg")!,
        pct: r.querySelector<HTMLElement>(".js-pct")!,
      };
    });
    rowCacheRef.current = [];
    schedulePaint();
  }, [dpsAppearanceSetting.panelStyle, dpsAppearanceSetting.percentDisplayMode]);

  useEffect(() => {
    let alive = true;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      const initial = await invoke<boolean>("get_dps_meter_status");
      if (!alive) {
        return;
      }

      setIsRunning(initial);
      isRunningRef.current = initial;
      setDot(initial ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-rose-400");

      const unlistenStatus = await listen<boolean>("dps-meter-status", (event) => {
        if (!alive) {
          return;
        }

        const next = Boolean(event.payload);
        setIsRunning(next);
        isRunningRef.current = next;
        setDot(next ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-rose-400");
      });
      unlisteners.push(unlistenStatus);

      const unlistenSnapshot = await listen<CombatSnapshot>("dps-snapshot", (event) => {
        if (!alive) {
          return;
        }

        if (!isRunningRef.current) {
          isRunningRef.current = true;
          setIsRunning(true);
          setDot("bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]");
        }

        snapshotRef.current = event.payload;
        const nextStats = event.payload.lastTargetAllPlayersOverviewStats as
          | PlayerOverviewStat[]
          | undefined;
        const nextVisiblePlayerCount = Math.min(8, nextStats?.length ?? 0);
        if (
          dpsAppearanceSetting.autoResizeHeight &&
          nextVisiblePlayerCount !== lastVisiblePlayerCountRef.current
        ) {
          lastVisiblePlayerCountRef.current = nextVisiblePlayerCount;
          if (resizeTimerRef.current) {
            window.clearTimeout(resizeTimerRef.current);
          }
          resizeTimerRef.current = window.setTimeout(() => {
            void resizeWindow();
          }, 50);
        }
        const targetInfo = event.payload.lastTargetInfo;
        if (targetInfo) {
          setText(
            targetNameRef.current,
            targetInfo.targetName || `Mob ${targetInfo.targetMobCode}`
          );
          const lastTime = Math.max(0, ...Object.values(targetInfo.targetLastTime ?? {}));
          const startTime = Math.min(lastTime, ...Object.values(targetInfo.targetStartTime ?? {}));
          const timer = fmtTimer(Math.max(0, lastTime - startTime));
          if (timer !== lastTimerRef.current) {
            lastTimerRef.current = timer;
            setText(timerRef.current, timer);
          }
        } else {
          if (lastTimerRef.current !== "00:00") {
            lastTimerRef.current = "00:00";
            setText(timerRef.current, "00:00");
          }
          setText(targetNameRef.current, "No Target");
        }

        schedulePaint();
      });
      unlisteners.push(unlistenSnapshot);

      const unlistenDetailRequest = await listen("dps-detail-v2-request-selection", async () => {
        if (detailSelectionRef.current) {
          const detailData =
            detailSelectionRef.current.mode === "history"
              ? buildHistoryDetailPayload(detailSelectionRef.current.playerId)
              : buildLiveDetailPayload(
                  snapshotRef.current,
                  detailSelectionRef.current.targetId,
                  detailSelectionRef.current.playerId
                );
          await emit("dps-detail-v2-open", {
            selection: detailSelectionRef.current,
            detailData,
          } satisfies DpsDetailV2OpenPayload);
        }
      });
      unlisteners.push(unlistenDetailRequest);

      const unlistenResetRequest = await listen("dps-reset-requested", async () => {
        persistHistoryFromSnapshot(snapshotRef.current);
        await invoke("reset_dps_meter");
        resetUi();
        await uploadPendingHistoryRecords();
      });
      unlisteners.push(unlistenResetRequest);

      const unlistenMainCharacterDetected = await listen<{
        actorId: number;
        actorName: string;
        sid?: string | null;
      }>("dps-main-actor-detected", async (e) => {
        persistHistoryFromSnapshot(snapshotRef.current);
        await invoke("reset_dps_meter"); // only reset the ui
        resetUi();
        await uploadPendingHistoryRecords();
        // add to main actor history
        const p = e.payload;
        const sid = p.sid ? Number(p.sid) : NaN;
        if (p.actorName && Number.isFinite(sid)) {
          Aion2MainActorHistory.add({
            id: `${p.actorName}-${sid}`,
            actorName: p.actorName,
            serverId: sid,
            lastSeenAt: Date.now(),
          });
        }
      });
      unlisteners.push(unlistenMainCharacterDetected);

      const unlistenPing = await listen("ping-history", async (e) => {
        console.log("ping history updated", e.payload);
        setPingHistory(e.payload as [number, number][]);
        setView("ping");
      });
      unlisteners.push(unlistenPing);
    })();

    return () => {
      alive = false;
      if (resizeTimerRef.current) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = 0;
      }
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [
    buildHistoryDetailPayload,
    dpsAppearanceSetting.autoResizeHeight,
    persistHistoryFromSnapshot,
    resizeWindow,
    schedulePaint,
    uploadPendingHistoryRecords,
  ]);

  useEffect(() => {
    void (async () => {
      try {
        if (!dpsAppearanceSetting.autoResizeHeight) {
          await getCurrentWebviewWindow().setSize(new LogicalSize(320, 280));
        } else {
          await resizeWindow(true);
        }
      } catch {
        /* empty */
      }
    })();
  }, [dpsAppearanceSetting.autoResizeHeight, resizeWindow]);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();

    void (async () => {
      try {
        const scaleFactor = await appWindow.scaleFactor();
        const outerSize = await appWindow.outerSize();
        const width = outerSize.width / scaleFactor;

        if (view === "ping") {
          await appWindow.setSize(new LogicalSize(width, 260));
          return;
        }

        if (view === "dps_history") {
          await appWindow.setSize(new LogicalSize(width, 420));
          return;
        }

        if (dpsAppearanceSetting.autoResizeHeight) {
          await resizeWindow(true);
          return;
        }

        await appWindow.setSize(new LogicalSize(320, 280));
      } catch {
        /* empty */
      }
    })();
  }, [dpsAppearanceSetting.autoResizeHeight, resizeWindow, view]);

  useEffect(() => {
    lastTotalDamageRef.current = Number.NaN;
    lastStatsLengthRef.current = -1;
    rowCacheRef.current = [];
    schedulePaint();
  }, [
    dpsAppearanceSetting.classIconStyle,
    dpsAppearanceSetting.mainPlayerColor,
    dpsAppearanceSetting.otherPlayerColor,
    dpsAppearanceSetting.scaleFactor,
    schedulePaint,
  ]);

  useEffect(() => {
    if (dpsAppearanceSetting.autoResizeHeight) {
      void resizeWindow(true);
    }
  }, [dpsAppearanceSetting.autoResizeHeight, dpsAppearanceSetting.scaleFactor, resizeWindow]);

  useEffect(() => {
    const window = getCurrentWebviewWindow();
    const unlisten = window.onCloseRequested(async (event) => {
      event.preventDefault();
      await invoke("set_dps_manual_hidden", { hidden: true });
      try {
        await invoke("stop_dps_meter");
      } catch {
        /* empty */
      }

      try {
        await window.hide();
      } catch {
        /* empty */
      }

      try {
        const pingWindow = await WebviewWindow.getByLabel("dps_ping");
        await pingWindow?.hide();
      } catch {
        /* empty */
      }
    });

    return () => {
      unlisten.then((dispose: () => void) => dispose());
    };
  }, []);

  const handleStartStop = useCallback(async () => {
    try {
      await invoke(isRunning ? "stop_dps_meter" : "start_dps_meter");
    } catch {
      /* empty */
    }
  }, [isRunning]);

  const handleReset = useCallback(async () => {
    persistHistoryFromSnapshot(snapshotRef.current);
    await invoke("reset_dps_meter");
    resetUi();
    await emit("dps-detail-v2-clear");
    await uploadPendingHistoryRecords();
  }, [persistHistoryFromSnapshot, resetUi, uploadPendingHistoryRecords]);

  const handleStart = useCallback(async () => {
    await invoke("start_dps_meter");
  }, []);

  const handleStop = useCallback(async () => {
    await invoke("stop_dps_meter");
  }, []);

  const handleOpenSettings = useCallback(async () => {
    await createWindow("dps_settings", {
      title: "NOIA2 DPS Settings",
      url: "/dps_settings",
      width: 560,
      height: 1080,
      decorations: false,
      transparent: true,
      resizable: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: true,
      focusable: true,
    });

    await waitForWindowReady("dps_settings");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps_v2",
        childLabel: "dps_settings",
        url: "/dps_settings",
        title: "DPS Settings",
        width: 560,
        height: 1080,
        gap: 0,
        decorations: false,
        transparent: true,
        resizable: true,
        shadow: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focus: true,
        focusable: true,
      },
    });
  }, []);

  const handleOpenLog = useCallback(async () => {
    await createWindow("dps_log", {
      title: "NOIA2DPS Log",
      url: "/dps_log",
      width: 560,
      height: 320,
      decorations: false,
      transparent: true,
      resizable: true,
      shadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focus: false,
      focusable: false,
    });

    await waitForWindowReady("dps_log");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps_v2",
        childLabel: "dps_log",
        url: "/dps_log",
        title: "DPS Log",
        width: 560,
        height: 320,
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

  const handleClose = useCallback(async () => {
    await getCurrentWebviewWindow().close();
  }, []);

  const handleOpenHistory = useCallback(() => {
    setView((current) => {
      const next = current === "dps_history" ? "dps" : "dps_history";
      if (next === "dps") {
        setSelectedHistoryId(null);
        setSelectedHistoryRecord(null);
        detailSelectionRef.current = null;
        void emit("dps-detail-v2-clear");
      } else {
        const nextHistoryRecords = Aion2DpsHistory.get();
        setSelectedHistoryId(nextHistoryRecords[0]?.id ?? null);
        setSelectedHistoryRecord(nextHistoryRecords[0] ?? null);
      }
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-sm text-slate-100">
      <div
        className="flex h-7 shrink-0 items-center justify-between border border-white/10 px-2 select-none"
        style={{ backgroundColor: bg }}
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
              ref={timerRef}
              className="font-mono text-xs font-medium text-slate-100 tabular-nums"
              data-tauri-drag-region
            >
              00:00
            </span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5" data-tauri-drag-region>
            <div
              ref={dotRef}
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400"
              data-tauri-drag-region
            />
            <span
              ref={targetNameRef}
              className="truncate text-xs font-medium text-slate-300"
              data-tauri-drag-region
            >
              No Target
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            title="Pin"
            onClick={() => {
              const next = !dpsAppearanceSetting.autoHide;
              void invoke("set_auto_hide_enabled", { enabled: next });
              void saveSettings({
                appearance: { dpsWindow: { autoHide: next } },
              });
            }}
            className={`flex h-5 w-5 items-center justify-center rounded border transition focus-visible:outline-none active:bg-white/5 ${dpsAppearanceSetting.autoHide ? "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white" : "border-amber-400/30 bg-amber-400/15 text-amber-300 hover:bg-amber-400/20 hover:text-amber-200"}`}
          >
            <Pin className="h-3 w-3" />
          </button>

          <button
            type="button"
            title="History"
            onClick={(event) => {
              event.currentTarget.blur();
              handleOpenHistory();
            }}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded border transition",
              view === "dps_history"
                ? "border-cyan-400/40 bg-cyan-400/15 text-cyan-100"
                : "border-white/10 bg-white/5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-100"
            )}
          >
            <History className="h-3 w-3" />
          </button>

          <button
            type="button"
            title={isRunning ? "Stop" : "Start"}
            onClick={() => {
              void handleStartStop();
            }}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              >
                <Settings className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-20 p-0.5">
              <DropdownMenuItem
                className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
                onClick={isRunning ? handleStop : handleStart}
              >
                {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span className="text-xs">{isRunning ? "停止" : "启动"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
                onClick={() => {
                  void handleReset();
                }}
              >
                <RotateCcw className="h-3 w-3" />
                <span className="text-xs">重置</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
                onClick={() => {
                  void handleOpenSettings();
                }}
              >
                <Settings className="h-3 w-3" />
                <span className="text-xs">设置</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
                onClick={() => {
                  void handleOpenLog();
                }}
              >
                <Book className="h-3 w-3" />
                <span className="text-xs">日志</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button
            type="button"
            title="Close"
            onClick={() => {
              void handleClose();
            }}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div
        className={cn("flex-1 overflow-hidden p-1", view === "dps" ? "block" : "hidden")}
        style={{ backgroundColor: bg }}
      >
        <div
          ref={containerRef}
          className="space-y-0"
          onClick={handleContainerClick}
          style={{ zoom: dpsAppearanceSetting.scaleFactor }}
        >
          {dpsAppearanceSetting.panelStyle === "classicBars" && (
            <>
              {Array.from({ length: 8 }, (_, index) => (
                <div key={index} data-row={index} className={ROW_CLASS} style={{ display: "none" }}>
                  <div className={BAR_CLASS} style={{ transform: "scaleX(0)" }} />
                  <div className="relative z-10 flex w-full items-center justify-between pr-1 select-none">
                    <div className="flex min-w-0 flex-1 items-center gap-1 select-none">
                      <div className="relative h-6 w-6 flex-shrink-0">
                        <img
                          className="js-icon h-full w-full rounded-md object-cover shadow-sm"
                          alt="class"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                          onContextMenu={(event) => event.preventDefault()}
                        />
                      </div>
                      <div className="flex min-w-0 items-baseline gap-0 font-mono text-sm">
                        <span className="js-name min-w-0 truncate" />
                        <span className="js-server shrink-0" />
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      <div className="text-right">
                        <span className="js-dmg font-mono text-sm text-gray-100 tabular-nums" />
                      </div>
                      <div className="text-right">
                        <span className="js-dps font-mono text-sm font-medium text-green-400 tabular-nums" />
                        <span className="text-xs text-green-400">/s</span>
                      </div>
                      <div className="text-right">
                        <span className="js-pct font-mono text-sm text-gray-200 tabular-nums" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}

          {dpsAppearanceSetting.panelStyle === "hunterCompact" && (
            <>
              {Array.from({ length: 8 }, (_, i) => (
                <div
                  key={`hunter-${i}`}
                  data-row={i}
                  className="group relative grid h-10 w-full cursor-pointer grid-cols-[30px_minmax(0,1fr)_142px] items-center overflow-hidden border-t border-white/10 px-1 text-left transition first:border-t-0 hover:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-cyan-300/60 focus-visible:outline-none"
                  style={{ display: "none" }}
                >
                  <div
                    className="js-bar absolute inset-y-0 left-0 w-full origin-left transition-transform duration-500"
                    style={{ transform: "scaleX(0)" }}
                  >
                    <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden opacity-80">
                      <div className="absolute inset-0 bg-inherit" />
                      <div className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent_0%,transparent_88%,rgba(255,255,255,0.42)_94%,rgba(255,255,255,0.6)_100%)]" />
                    </div>
                  </div>
                  <div className="absolute inset-x-0 bottom-0 h-px bg-white/[0.06]" />
                  <div className="relative z-10 flex items-center justify-center">
                    <img
                      className="js-icon h-full w-full rounded-md object-cover shadow-sm"
                      alt="class"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                      onContextMenu={(event) => event.preventDefault()}
                    />
                  </div>
                  <div className="relative z-10 min-w-0 py-1 pr-2 pl-2">
                    <div className="flex min-w-0 items-baseline gap-0">
                      <span className="js-name truncate text-[15px] leading-4 font-medium text-slate-50" />
                    </div>
                    <div className="truncate text-[12px] leading-3 font-normal text-slate-500">
                      <span className="js-server" />
                    </div>
                  </div>
                  <div className="relative z-10 grid h-9 w-[142px] grid-cols-[70px_64px] grid-rows-[18px_18px] items-center pr-2 font-mono tabular-nums">
                    <div className="row-span-2 flex items-center justify-end pr-2 text-right">
                      <span className="js-dps text-md leading-none font-semibold text-cyan-50 drop-shadow-[0_0_5px_rgba(103,232,249,0.55)]" />
                      <span className="ml-0.5 self-end pb-0 text-[9px] text-slate-400">/s</span>
                    </div>
                    <div className="flex min-w-0 items-center justify-end gap-1 leading-none">
                      <span className="shrink-0 text-[10px] font-semibold text-slate-500">PCT</span>
                      <span className="js-pct min-w-0 truncate text-[12px] font-medium text-slate-100" />
                    </div>
                    <div className="flex min-w-0 items-center justify-end gap-1 leading-none">
                      <span className="shrink-0 text-[10px] font-medium text-slate-500">DMG</span>
                      <span className="js-dmg min-w-0 truncate text-[11px] font-medium text-slate-300/80" />
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {view === "ping" && (
        <div className="flex min-h-0 flex-1 overflow-hidden p-2" style={{ backgroundColor: bg }}>
          <PingCurve pingHistory={pingHistory} />
        </div>
      )}

      {view === "dps_history" && (
        <div className="flex min-h-0 flex-1 overflow-hidden p-1" style={{ backgroundColor: bg }}>
          <MemoizedDpsHistory
            selectedHistoryId={selectedHistoryId}
            onSelect={(id, record) => {
              setSelectedHistoryId(id);
              setSelectedHistoryRecord(record);
              detailSelectionRef.current = null;
              void emit("dps-detail-v2-clear");
            }}
            onClear={() => {
              setSelectedHistoryId(null);
              setSelectedHistoryRecord(null);
              detailSelectionRef.current = null;
              void emit("dps-detail-v2-clear");
            }}
          />

          <div className="min-w-0 flex-1 overflow-hidden">
            {selectedHistoryRecord && selectedHistoryTargetInfo ? (
              <MemoizedDpsPanel
                targetInfo={selectedHistoryTargetInfo}
                thisTargetPlayerStats={selectedHistoryRecord.thisTargetAllPlayerStats}
                combatInfos={selectedHistoryRecord.combatInfos}
                mainPlayerColor={dpsAppearanceSetting.mainPlayerColor}
                otherPlayerColor={dpsAppearanceSetting.otherPlayerColor}
                barOpacity={100}
                maskNicknames={dpsAppearanceSetting.maskNicknames}
                percentDisplayMode={dpsAppearanceSetting.percentDisplayMode}
                classIconStyle={dpsAppearanceSetting.classIconStyle}
                showTargetHpBar={dpsAppearanceSetting.showTargetHpBar}
                onPlayerClicked={handleHistoryPlayerClick}
              />
            ) : (
              <div className="flex h-full min-h-24 items-center justify-center px-4 text-xs text-slate-400">
                Select a history target
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
