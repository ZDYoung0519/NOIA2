import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  ArrowLeft,
  Book,
  Clock3,
  Play,
  RotateCcw,
  Square,
  Settings,
  X,
  History,
  Pin,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSettings } from "@/hooks/use-app-settings";
import { Aion2DpsHistory, Aion2MainActorHistory } from "@/lib/localStorageHistory";
import { maskNickname } from "@/lib/name-mask";
import { getServerShortName } from "@/lib/aion2/servers";
import { createWindow, ensureDpsPingWindow } from "@/lib/window";
import { PingCurve } from "@/components/ping-curve";
import { MemoizedDpsHistory } from "@/components/dps-history";
import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import {
  CombatSnapshot,
  DpsDetailPayload,
  HistoryTargetRecord,
  PlayerOverviewStat,
} from "@/types/aion2dps";
import { uploadDpsDataBatch } from "@/lib/supabase/upload-dps-data";
import { cn } from "@/lib/utils";

/* ===================================================================
   helpers
   =================================================================== */
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
  const m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
const HISTORY_THRESHOLD = 1_000_000;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const HUNTER_ROW_CLASS =
  "group relative grid h-10 w-full cursor-pointer grid-cols-[30px_minmax(0,1fr)_142px] items-center overflow-hidden border-t border-white/10 px-1 text-left transition first:border-t-0 hover:bg-white/[0.07] focus-visible:ring-1 focus-visible:ring-cyan-300/60 focus-visible:outline-none";
const CLASSIC_ROW_CLASS =
  "group relative flex h-7.5 cursor-pointer items-center overflow-hidden rounded border border-transparent hover:border hover:border-cyan-500 hover:bg-white/5";
const HUNTER_BAR_CLASS =
  "js-bar absolute inset-y-0 left-0 w-full origin-left transition-transform duration-500 ease-out";
const CLASSIC_BAR_CLASS =
  "js-bar absolute top-0 bottom-0 left-0 w-full origin-left rounded transition-transform duration-500 ease-out";

type DpsNewView = "dps" | "dps_history" | "ping";

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

/* ---- DOM row handle (collected once, written by rAF) ---- */
type Row = {
  root: HTMLElement;
  bar: HTMLElement;
  accentBar?: HTMLElement | null;
  icon: HTMLImageElement;
  name: HTMLElement;
  server: HTMLElement;
  dps: HTMLElement;
  dmg: HTMLElement;
  pct: HTMLElement;
};

type RowPaintCache = {
  visible?: boolean;
  scale?: string;
  colorKey?: string;
  barBackground?: string;
  accentBackground?: string;
  iconSrc?: string;
  name?: string;
  server?: string;
  dps?: string;
  dmg?: string;
  pct?: string;
};

/* ===================================================================
   DpsNewPage
   =================================================================== */
export default function DpsNewPage() {
  const { settings, saveSettings } = useAppSettings();
  const dpsAppearanceSetting = settings.appearance.dpsWindow;

  const bg = hexToRgba(
    dpsAppearanceSetting.backgroundColor,
    dpsAppearanceSetting.backgroundOpacity
  );

  const [isRunning, setIsRunning] = useState(false);
  const [view, setView] = useState<DpsNewView>("dps");
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryRecord, setSelectedHistoryRecord] = useState<HistoryTargetRecord | null>(
    null
  );
  const [pingHistory, setPingHistory] = useState<[number, number][]>([]);

  const dpsAppearanceSettingRef = useRef(dpsAppearanceSetting);

  /* ---- refs synced with state ---- */
  const isRunningRef = useRef(false);
  const mainPlayerNameRef = useRef("");
  const viewRef = useRef<DpsNewView>("dps");

  /* ---- DOM refs ---- */
  const containerRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<Row[]>([]);
  const nameRef = useRef<HTMLSpanElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  /* ---- snapshot state (pure refs, zero react) ---- */
  const snapshotRef = useRef<CombatSnapshot | null>(null);
  const lastDmg = useRef(0);
  const lastStatsLen = useRef(0);
  const lastTimer = useRef("");
  const lastDot = useRef("");
  const pendingPaint = useRef(false);
  const serverNameCache = useRef(new Map<string, string>());
  const detailPayloadRef = useRef<any>(null);
  const selectedPlayerRef = useRef(0);
  const rowPaintCacheRef = useRef<RowPaintCache[]>([]);
  const lastDetailEmitAtRef = useRef(0);

  dpsAppearanceSettingRef.current = dpsAppearanceSetting;
  viewRef.current = view;

  const selectedHistoryTargetInfo = useMemo(() => {
    if (!selectedHistoryRecord) return null;
    return (
      selectedHistoryRecord.combatInfos.targetInfos?.[String(selectedHistoryRecord.targetId)] ??
      null
    );
  }, [selectedHistoryRecord]);

  /* ---- helper: build + push detail payload ---- */
  const pushDetailPayload = useCallback(async (playerId: number) => {
    const w = await WebviewWindow.getByLabel("dps_detail");
    if (!w) {
      selectedPlayerRef.current = 0;
      return;
    }
    const s = snapshotRef.current;
    if (!s?.lastTargetInfo || !s.combatInfos) return;
    const tid = s.lastTargetInfo.id;
    detailPayloadRef.current = {
      mode: "live",
      actorId: playerId,
      targetId: tid,
      combatInfos: s.combatInfos,
      playerStats: s.byTargetPlayerStats?.[String(tid)]?.[String(playerId)] ?? null,
      playerSkillStats: s.byTargetPlayerSkillStats?.[String(tid)]?.[String(playerId)] ?? {},
      playerSkillRecords: [],
      playerDpsCurve: [],
    };
    selectedPlayerRef.current = playerId;
    await emit("dps-detail-update", detailPayloadRef.current);
  }, []);

  const buildHistoryDetailPayload = useCallback(
    (playerId: number): DpsDetailPayload | null => {
      if (!selectedHistoryRecord) return null;
      const playerStats =
        selectedHistoryRecord.thisTargetAllPlayerStats?.[String(playerId)] ?? null;
      if (!playerStats) return null;

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

  /* ---- detail window ---- */
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
      focusable: false,
    });

    await waitForWindowReady("dps_detail");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps_new",
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
  }, []);

  const handleHistoryPlayerClick = useCallback(
    async (playerId: number) => {
      const payload = buildHistoryDetailPayload(playerId);
      if (!payload) return;
      selectedPlayerRef.current = 0;
      detailPayloadRef.current = payload;
      await ensureDetailWindow();
      await emit("dps-detail-update", payload);
    },
    [buildHistoryDetailPayload, ensureDetailWindow]
  );

  /* ---- click delegation on container ---- */
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      const row = (e.target as HTMLElement).closest("[data-row]") as HTMLElement | null;
      if (!row) return;
      const idx = Number(row.dataset.row);
      const s = snapshotRef.current;
      const stats = s?.lastTargetAllPlayersOverviewStats as PlayerOverviewStat[] | undefined;
      if (!stats || idx >= stats.length) return;
      const playerId = stats[idx].actorId;
      void ensureDetailWindow().then(() => pushDetailPayload(playerId));
    },
    [ensureDetailWindow, pushDetailPayload]
  );

  /* ---- tiny DOM helpers (zero react) ---- */
  const setText = (el: HTMLElement | null, v: string, cache?: { current: string }) => {
    if (!el || el.textContent === v) return;
    el.textContent = v;
    if (cache) cache.current = v;
  };
  const setDot = (cls: string) => {
    if (!dotRef.current || cls === lastDot.current) return;
    lastDot.current = cls;
    dotRef.current.className = `h-1.5 w-1.5 shrink-0 rounded-full ${cls}`;
  };

  /* ---- resize ---- */
  const lastHeight = useRef(0);
  const resizeTimer = useRef(0);
  const resizeWindow = useCallback(async (force = false) => {
    if (viewRef.current !== "dps") return;
    const dpsAppearanceSetting = dpsAppearanceSettingRef.current;
    if (!dpsAppearanceSetting.autoResizeHeight) return;
    const c = containerRef.current;
    if (!c) return;
    try {
      const aw = getCurrentWebviewWindow();
      const H = 28,
        B = 2,
        MIN = 120,
        MAX = 1000;
      const th = Math.max(
        MIN,
        Math.min(MAX, Math.ceil(c.scrollHeight * dpsAppearanceSetting.scaleFactor + H + B))
      );
      const sf = await aw.scaleFactor();
      const os = await aw.outerSize();
      if (Math.abs(os.height / sf - th) < 5) {
        lastHeight.current = th;
        return;
      }
      if (!force && Math.abs(lastHeight.current - th) < 5) return;
      lastHeight.current = th;
      await aw.setSize(new LogicalSize(os.width / sf, th));
    } catch {
      /* */
    }
  }, []);

  useEffect(() => {
    const aw = getCurrentWebviewWindow();
    void (async () => {
      try {
        const sf = await aw.scaleFactor();
        if (view === "dps_history") {
          const os = await aw.outerSize();
          const width = os.width / sf;
          await aw.setSize(new LogicalSize(width, 420));
          return;
        }

        if (view === "ping") {
          const os = await aw.outerSize();
          const width = os.width / sf;
          await aw.setSize(new LogicalSize(width, 260));
          return;
        }

        if (view === "dps") return;
      } catch {
        /* */
      }
    })();
  }, [resizeWindow, view]);

  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const sched = () => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = window.setTimeout(() => {
        void resizeWindow();
      }, 50);
    };
    const obs = new ResizeObserver(() => sched());
    obs.observe(c);
    sched();
    return () => obs.disconnect();
  }, [resizeWindow]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        await ensureDpsPingWindow("dps_new");
        const appWindow = getCurrentWebviewWindow();
        await appWindow.setIgnoreCursorEvents(false);
      } catch (error) {
        console.error("initialize dps_new ping window failed:", error);
      }
    }, 1);

    return () => window.clearTimeout(timer);
  }, []);

  /* ---- collect row refs after mount and after skin template changes ---- */
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
    rowPaintCacheRef.current = [];
  }, [dpsAppearanceSetting.panelStyle]);

  /* =================================================================
     event listeners (sync to refs for rAF access)
     ================================================================= */
  const unlistenAll = useRef<Array<() => void>>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const initial = await invoke<boolean>("get_dps_meter_status");
      if (!alive) return;
      setIsRunning(initial);
      isRunningRef.current = initial;
      setDot(initial ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-rose-400");

      const u1 = await listen<boolean>("dps-meter-status", (e) => {
        if (!alive) return;
        const v = Boolean(e.payload);
        setIsRunning(v);
        isRunningRef.current = v;
        setDot(v ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-rose-400");
      });

      const u2 = await listen<CombatSnapshot>("dps-snapshot", (e) => {
        if (!alive) return;
        snapshotRef.current = e.payload;
        schedulePaint();
        const now = Date.now();
        if (selectedPlayerRef.current && now - lastDetailEmitAtRef.current >= 200) {
          lastDetailEmitAtRef.current = now;
          pushDetailPayload(selectedPlayerRef.current).catch(() => {});
        }
        const ti = e.payload.lastTargetInfo;
        if (ti && nameRef.current) {
          setText(
            nameRef.current,
            ti.targetName ||
              `Mob ${ti.targetMobCode}` ||
              (mainPlayerNameRef.current
                ? maskNickname(
                    mainPlayerNameRef.current,
                    dpsAppearanceSettingRef.current.maskNicknames
                  )
                : "No target")
          );
          const lt = Object.values(ti.targetLastTime ?? {}).reduce(
            (a: number, b: number) => Math.max(a, b),
            0
          );
          const st = Object.values(ti.targetStartTime ?? {}).reduce(
            (a: number, b: number) => Math.min(a, b),
            lt
          );
          setText(timerRef.current, fmtTimer(Math.max(0, lt - st)), lastTimer);
          setDot(
            lt > 0
              ? "bg-yellow-300 shadow-[0_0_6px_rgba(253,224,71,0.6)]"
              : "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
          );
        }
      });

      const u3 = await listen<{ actorId: number; actorName: string; sid?: string | null }>(
        "dps-main-actor-detected",
        (e) => {
          if (!alive) return;
          const p = e.payload;
          const sid = p.sid ? Number(p.sid) : NaN;
          if (p.actorName && Number.isFinite(sid)) {
            mainPlayerNameRef.current = p.actorName;
            Aion2MainActorHistory.add({
              id: `${p.actorName}-${sid}`,
              actorName: p.actorName,
              serverId: sid,
              lastSeenAt: Date.now(),
            });
          }
          void (async () => {
            await doReset(false);
            await uploadPending();
            // show main character name when no snapshot data yet
            if (!snapshotRef.current && nameRef.current && p.actorName) {
              setText(
                nameRef.current,
                maskNickname(p.actorName, dpsAppearanceSettingRef.current.maskNicknames)
              );
            }
          })();
        }
      );
      const u4 = await listen("dps-detail-request", async () => {
        if (detailPayloadRef.current) await emit("dps-detail-update", detailPayloadRef.current);
      });
      const u5 = await listen("dps-reset-requested", () => {
        if (!alive) return;
        void doReset();
      });
      const u6 = await listen("ping-history", (event) => {
        if (!alive) return;
        setPingHistory(event.payload as [number, number][]);
        setView("ping");
      });

      unlistenAll.current = [u1, u2, u3, u4, u5, u6];
    })();
    return () => {
      alive = false;
      unlistenAll.current.forEach((f) => f());
    };
  }, []);

  /* =================================================================
     paint �?on-demand rAF, only runs when snapshot changes
     ================================================================= */
  const schedulePaint = () => {
    if (pendingPaint.current) return;
    pendingPaint.current = true;
    requestAnimationFrame(() => {
      pendingPaint.current = false;
      const s = snapshotRef.current;
      if (!s || !isRunningRef.current || viewRef.current !== "dps") return;
      const stats = s.lastTargetAllPlayersOverviewStats as PlayerOverviewStat[] | undefined;
      const len = stats?.length ?? 0;
      if (s.totalDamage === lastDmg.current && len === lastStatsLen.current) return;

      lastDmg.current = s.totalDamage;
      lastStatsLen.current = len;

      if (!stats || len === 0) {
        for (const [index, r] of rowsRef.current.entries()) {
          const cache = rowPaintCacheRef.current[index] ?? {};
          if (cache.visible !== false) {
            r.root.style.display = "none";
            cache.visible = false;
            rowPaintCacheRef.current[index] = cache;
          }
        }
        return;
      }

      const mainId = s.combatInfos?.mainActorId;
      const maxDmg = stats[0]?.totalDamage ?? 1;
      const dpsAppearanceSetting = dpsAppearanceSettingRef.current;
      const isHunterSkin = dpsAppearanceSetting.panelStyle === "hunterCompact";

      stats.slice(0, 8).forEach((p, i) => {
        const r = rowsRef.current[i];
        if (!r) return;
        const cache = rowPaintCacheRef.current[i] ?? {};
        const dmg = p.totalDamage ?? 0;
        if (cache.visible !== true) {
          r.root.style.display = "";
          cache.visible = true;
        }
        const scale = `scaleX(${dmg / maxDmg})`;
        if (cache.scale !== scale) {
          r.bar.style.transform = scale;
          if (r.accentBar) {
            r.accentBar.style.transform = scale;
          }
          cache.scale = scale;
        }
        const playerColor =
          mainId != null && p.actorId === mainId
            ? dpsAppearanceSetting.mainPlayerColor
            : dpsAppearanceSetting.otherPlayerColor;
        const colorKey = `${dpsAppearanceSetting.panelStyle}|${playerColor}`;
        if (cache.colorKey !== colorKey) {
          const barBackground = isHunterSkin
            ? `linear-gradient(90deg, ${colorToRgba(playerColor, 0.22)} 0%, ${colorToRgba(playerColor, 0.12)} 78%, transparent 100%)`
            : playerColor;
          if (cache.barBackground !== barBackground) {
            r.bar.style.background = barBackground;
            cache.barBackground = barBackground;
          }
          const barOpacity = isHunterSkin ? "1" : "";
          if (r.bar.style.opacity !== barOpacity) {
            r.bar.style.opacity = barOpacity;
          }
          if (r.accentBar) {
            const accentBackground = `linear-gradient(90deg, transparent 0%, ${colorToRgba(playerColor, 1)} 85%, ${colorToRgba(playerColor, 0.9)} 100%)`;
            if (cache.accentBackground !== accentBackground) {
              r.accentBar.style.background = accentBackground;
              cache.accentBackground = accentBackground;
            }
          }
          cache.colorKey = colorKey;
        }

        const iconSrc = p.actorClass
          ? dpsAppearanceSetting.classIconStyle === "default"
            ? `/images/class/${p.actorClass.toLowerCase()}.webp`
            : `/images/class/${p.actorClass.toLowerCase()}.png`
          : "/images/aion2.png";
        if (r.icon.dataset.src !== iconSrc) {
          r.icon.style.display = "";
          r.icon.src = iconSrc;
          r.icon.dataset.src = iconSrc;
          cache.iconSrc = iconSrc;
        }

        const name = p.actorName || `Player ${p.actorId}`;
        if (cache.name !== name) {
          setText(r.name, name);
          cache.name = name;
        }
        let server = "";
        if (p.actorServerId) {
          let serverName = serverNameCache.current.get(p.actorServerId);
          if (!serverName) {
            serverName = getServerShortName(Number(p.actorServerId));
            serverNameCache.current.set(p.actorServerId, serverName);
          }
          server = `[${serverName}]`;
        }
        if (cache.server !== server) {
          setText(r.server, server);
          cache.server = server;
        }
        const dps = fmtDps(p.dps);
        if (cache.dps !== dps) {
          setText(r.dps, dps);
          cache.dps = dps;
        }
        const damage = fmtDmg(dmg);
        if (cache.dmg !== damage) {
          setText(r.dmg, damage);
          cache.dmg = damage;
        }
        const pct = `${(p.damageShare * 100).toFixed(1)}%`;
        if (cache.pct !== pct) {
          setText(r.pct, pct);
          cache.pct = pct;
        }
        rowPaintCacheRef.current[i] = cache;
      });
      for (let i = stats.length; i < 8; i++) {
        const row = rowsRef.current[i];
        if (!row) continue;
        const cache = rowPaintCacheRef.current[i] ?? {};
        if (cache.visible !== false) {
          row.root.style.display = "none";
          cache.visible = false;
          rowPaintCacheRef.current[i] = cache;
        }
      }
    });
  };

  useEffect(() => {
    if (view === "dps") {
      schedulePaint();
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          void resizeWindow(true);
        });
      });
    }
  }, [resizeWindow, view]);

  useEffect(() => {
    lastDmg.current = Number.NaN;
    lastStatsLen.current = -1;
    for (const row of rowsRef.current) {
      row.icon.dataset.src = "";
    }
    schedulePaint();
  }, [
    dpsAppearanceSetting.classIconStyle,
    dpsAppearanceSetting.mainPlayerColor,
    dpsAppearanceSetting.otherPlayerColor,
    dpsAppearanceSetting.panelStyle,
  ]);

  useEffect(() => {
    void resizeWindow(true);
  }, [dpsAppearanceSetting.autoResizeHeight, dpsAppearanceSetting.scaleFactor, resizeWindow]);

  /* ---- window close ---- */
  useEffect(() => {
    const aw = getCurrentWebviewWindow();
    const u = aw.onCloseRequested(async () => {
      try {
        await invoke("stop_dps_meter");
      } catch {
        /* */
      }
    });
    return () => {
      u.then((f: () => void) => f());
    };
  }, []);

  /* =================================================================
     reset & upload
     ================================================================= */
  const doReset = useCallback(async (clearUI = true) => {
    try {
      const snap = snapshotRef.current;
      // Save to history regardless
      await invoke("reset_dps_meter");
      if (clearUI) {
        snapshotRef.current = null;
        lastDmg.current = 0;
        lastStatsLen.current = 0;
        rowPaintCacheRef.current = [];
        selectedPlayerRef.current = 0;
        for (const r of rowsRef.current) r.root.style.display = "none";
        setText(
          nameRef.current,
          mainPlayerNameRef.current
            ? maskNickname(mainPlayerNameRef.current, dpsAppearanceSettingRef.current.maskNicknames)
            : "No target"
        );
        setText(timerRef.current, "00:00");
      }
      if (!snap) return;
      const records = Object.entries(snap.byTargetPlayerStats ?? {}).flatMap(([tid, ps]) => {
        const nid = Number(tid);
        const td = Object.values(ps ?? {}).reduce(
          (s: number, st: any) => s + (st?.total_damage ?? 0),
          0
        );
        if (!Number.isFinite(nid) || td <= HISTORY_THRESHOLD) return [];
        return [
          {
            id: `${tid}-${Date.now()}`,
            targetId: nid,
            thisTargetAllPlayerStats: clone(ps),
            thisTargetAllPlayerSkillStats: clone(snap.byTargetPlayerSkillStats?.[tid] ?? {}),
            thisTargetAllPlayerSkillRecords: {},
            combatInfos: clone({
              ...snap.combatInfos,
              targetInfos: snap.combatInfos.targetInfos?.[tid]
                ? { [tid]: snap.combatInfos.targetInfos[tid] }
                : {},
            }),
          },
        ];
      });
      if (records.length > 0)
        Aion2DpsHistory.addMany(records.map((r: any) => ({ ...r, uploaded: false })) as any);
    } catch (e) {
      console.error("reset failed:", e);
    }
  }, []);

  const uploadPending = async () => {
    const all = Aion2DpsHistory.get();
    const pending = all.filter((r: any) => !r.uploaded);
    if (pending.length === 0) return;
    try {
      await uploadDpsDataBatch(pending);
      Aion2DpsHistory.updateMany(pending.map((r: any) => ({ id: r.id, uploaded: true })) as any);
    } catch (e) {
      console.error("upload failed:", e);
    }
  };

  const onStart = useCallback(async () => {
    try {
      await invoke("start_dps_meter");
    } catch {
      /* */
    }
  }, []);
  const onStop = useCallback(async () => {
    try {
      await invoke("stop_dps_meter");
    } catch {
      /* */
    }
  }, []);
  const onClose = useCallback(async () => {
    await getCurrentWebviewWindow().close();
  }, []);

  const handleOpenHistory = useCallback(() => {
    setView((current) => {
      const next = current === "dps_history" ? "dps" : "dps_history";
      if (next === "dps") {
        detailPayloadRef.current = null;
        setSelectedHistoryId(null);
        setSelectedHistoryRecord(null);
        void emit("dps-detail-clear");
      } else {
        selectedPlayerRef.current = 0;
      }
      return next;
    });
  }, []);

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
      focus: false,
      focusable: false,
    });

    await waitForWindowReady("dps_settings");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps_new",
        childLabel: "dps_settings",
        url: "/dps_settings",
        title: "DPS Settings",
        width: 560,
        height: 1080,
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
      focus: false,
      focusable: false,
    });

    await waitForWindowReady("dps_log");

    await invoke("ensure_tracked_window", {
      options: {
        parentLabel: "dps_new",
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
        focus: false,
        focusable: false,
      },
    });
  }, []);

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden rounded-sm text-slate-100"
      style={{ backgroundColor: bg }}
    >
      {/* title bar */}
      <div
        className="flex h-7 shrink-0 items-center justify-between rounded-t-[5px] border border-white/10 px-2 text-slate-100 select-none"
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
              ref={nameRef}
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
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded border transition focus-visible:outline-none active:bg-white/5",
              dpsAppearanceSetting.autoHide
                ? "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
                : "border-amber-400/30 bg-amber-400/15 text-amber-300 hover:bg-amber-400/20 hover:text-amber-200"
            )}
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
                onClick={isRunning ? onStop : onStart}
              >
                {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span className="text-xs">{isRunning ? "停止" : "启动"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3"
                onClick={() => {
                  void doReset();
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
            onClick={onClose}
            className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* body: status message + 8 skeleton rows */}
      <div
        className={cn(
          "flex-1 overflow-hidden",
          dpsAppearanceSetting.panelStyle === "hunterCompact" ? "p-0" : "p-1",
          view === "dps" ? "block" : "hidden"
        )}
        onClick={handleContainerClick}
      >
        <div
          ref={containerRef}
          className={cn(
            "space-y-0",
            dpsAppearanceSetting.panelStyle === "hunterCompact"
              ? "w-full min-w-[260px] overflow-hidden rounded-b-[5px] border-x border-b border-white/10 text-slate-50"
              : "pb-1"
          )}
        >
          {dpsAppearanceSetting.panelStyle === "hunterCompact"
            ? Array.from({ length: 8 }, (_, i) => (
                <div
                  key={`hunter-${i}`}
                  data-row={i}
                  className={HUNTER_ROW_CLASS}
                  style={{ display: "none" }}
                >
                  <div className={HUNTER_BAR_CLASS} style={{ transform: "scaleX(0)" }} />
                  <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/[0.04]" />
                  <div
                    className="js-accent-bar absolute bottom-0 left-0 h-[3px] w-full origin-left overflow-hidden transition-transform duration-500"
                    style={{ transform: "scaleX(0)" }}
                  />
                  <div className="relative z-10 flex items-center justify-center">
                    <img
                      className="js-icon h-8 w-8 rounded object-cover"
                      alt="class"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                      onContextMenu={(event) => event.preventDefault()}
                    />
                  </div>
                  <div className="relative z-10 min-w-0 py-1 pr-2 pl-2">
                    <div className="flex min-w-0 items-baseline gap-0">
                      <span className="js-name text-md truncate leading-4 font-medium text-slate-50" />
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
              ))
            : Array.from({ length: 8 }, (_, i) => (
                <div
                  key={`classic-${i}`}
                  data-row={i}
                  className={CLASSIC_ROW_CLASS}
                  style={{ display: "none" }}
                >
                  <div className={CLASSIC_BAR_CLASS} style={{ transform: "scaleX(0)" }} />
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
                        <span className="js-dps font-mono text-sm font-medium text-green-400 tabular-nums after:content-['/s']" />
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

      {view === "ping" && (
        <div className="flex min-h-0 flex-1 overflow-hidden p-2">
          <PingCurve pingHistory={pingHistory} />
        </div>
      )}

      {view === "dps_history" && (
        <div className="flex min-h-0 flex-1 overflow-hidden p-1">
          <MemoizedDpsHistory
            selectedHistoryId={selectedHistoryId}
            onSelect={(id, record) => {
              setSelectedHistoryId(id);
              setSelectedHistoryRecord(record);
              detailPayloadRef.current = null;
              selectedPlayerRef.current = 0;
              void emit("dps-detail-clear");
            }}
            onClear={() => {
              setSelectedHistoryId(null);
              setSelectedHistoryRecord(null);
              detailPayloadRef.current = null;
              selectedPlayerRef.current = 0;
              void emit("dps-detail-clear");
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
