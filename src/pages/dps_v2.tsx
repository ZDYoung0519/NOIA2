import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Clock3, Play, RotateCcw, Square, X } from "lucide-react";

import { useAppSettings } from "@/hooks/use-app-settings";
import { getServerShortName } from "@/lib/aion2/servers";
import type { CombatSnapshot, PlayerOverviewStat } from "@/types/aion2dps";

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

function colorToRgba(color: string, alpha: number) {
  const trimmed = color.trim();
  if (trimmed.startsWith("#")) {
    return hexToRgba(trimmed, alpha * 100);
  }

  const match = trimmed.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return color;
  }

  const [r, g, b] = match[1].split(",").map((part) => Number(part.trim()));
  if (![r, g, b].every((channel) => Number.isFinite(channel))) {
    return color;
  }

  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
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

const ROW_CLASS =
  "group relative flex h-7.5 cursor-default items-center overflow-hidden rounded border border-transparent";
const BAR_CLASS = "js-bar absolute inset-y-0 left-0 w-full origin-left rounded";

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
  const { settings } = useAppSettings();
  const dpsAppearanceSetting = settings.appearance.dpsWindow;
  const bg = hexToRgba(
    dpsAppearanceSetting.backgroundColor,
    dpsAppearanceSetting.backgroundOpacity
  );

  const [isRunning, setIsRunning] = useState(false);

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
      const mainActorId = snapshot.combatInfos?.mainActorId;

      stats.slice(0, 8).forEach((player, index) => {
        const row = rows[index];
        if (!row) {
          return;
        }

        const cache = rowCacheRef.current[index] ?? {};
        const damage = player.totalDamage ?? 0;
        const scale = `scaleX(${damage / Math.max(1, maxDamage)})`;
        const playerColor =
          mainActorId != null && player.actorId === mainActorId
            ? dpsAppearanceSetting.mainPlayerColor
            : dpsAppearanceSetting.otherPlayerColor;
        const background = colorToRgba(playerColor, 0.5);
        const iconSrc = player.actorClass
          ? dpsAppearanceSetting.classIconStyle === "default"
            ? `/images/class/${player.actorClass.toLowerCase()}.webp`
            : `/images/class/${player.actorClass.toLowerCase()}.png`
          : "/images/aion2.png";
        const name = player.actorName || `Player ${player.actorId}`;
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
        const pct = `${(player.damageShare * 100).toFixed(1)}%`;

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
    rowCacheRef.current = [];
    setText(targetNameRef.current, "No Target");
    setText(timerRef.current, "00:00");
    for (const row of rowsRef.current) {
      row.root.style.display = "none";
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    rowsRef.current = Array.from({ length: 8 }, (_, index) => {
      const root = container.querySelector<HTMLElement>(`[data-row="${index}"]`)!;
      return {
        root,
        bar: root.querySelector<HTMLElement>(".js-bar")!,
        icon: root.querySelector<HTMLImageElement>(".js-icon")!,
        name: root.querySelector<HTMLElement>(".js-name")!,
        server: root.querySelector<HTMLElement>(".js-server")!,
        dps: root.querySelector<HTMLElement>(".js-dps")!,
        dmg: root.querySelector<HTMLElement>(".js-dmg")!,
        pct: root.querySelector<HTMLElement>(".js-pct")!,
      };
    });
    rowCacheRef.current = [];
  }, []);

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
        const targetInfo = event.payload.lastTargetInfo;
        if (targetInfo) {
          setText(targetNameRef.current, targetInfo.targetName || `Mob ${targetInfo.targetMobCode}`);
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
    })();

    return () => {
      alive = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [schedulePaint]);

  useEffect(() => {
    void (async () => {
      try {
        await getCurrentWebviewWindow().setSize(new LogicalSize(320, 280));
      } catch {
        /* empty */
      }
    })();
  }, []);

  useEffect(() => {
    lastTotalDamageRef.current = Number.NaN;
    lastStatsLengthRef.current = -1;
    rowCacheRef.current = [];
    schedulePaint();
  }, [
    dpsAppearanceSetting.classIconStyle,
    dpsAppearanceSetting.mainPlayerColor,
    dpsAppearanceSetting.otherPlayerColor,
    schedulePaint,
  ]);

  useEffect(() => {
    const window = getCurrentWebviewWindow();
    const unlisten = window.onCloseRequested(async () => {
      try {
        await invoke("stop_dps_meter");
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
    try {
      await invoke("reset_dps_meter");
      resetUi();
    } catch {
      /* empty */
    }
  }, [resetUi]);

  const handleClose = useCallback(async () => {
    await getCurrentWebviewWindow().close();
  }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-sm text-slate-100">
      <div
        className="flex h-7 shrink-0 items-center justify-between border border-white/10 px-2 select-none"
        style={{ backgroundColor: bg }}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
          <div className="flex h-full shrink-0 items-center gap-1.5" data-tauri-drag-region>
            <Clock3 className="h-3.5 w-3.5 text-slate-400" data-tauri-drag-region />
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
            title={isRunning ? "Stop" : "Start"}
            onClick={() => {
              void handleStartStop();
            }}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
          </button>
          <button
            type="button"
            title="Reset"
            onClick={() => {
              void handleReset();
            }}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
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

      <div className="flex-1 overflow-hidden p-1" style={{ backgroundColor: bg }}>
        <div ref={containerRef} className="space-y-0">
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
        </div>
      </div>
    </div>
  );
}
