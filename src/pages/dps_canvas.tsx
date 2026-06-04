import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Play, RotateCcw, Square, Settings, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSettings } from "@/hooks/use-app-settings";
import { Aion2DpsHistory, Aion2MainActorHistory } from "@/lib/localStorageHistory";
import { getServerShortName } from "@/lib/aion2/servers";
import { CombatSnapshot, PlayerOverviewStat } from "@/types/aion2dps";
import { uploadDpsDataBatch } from "@/lib/supabase/upload-dps-data";

/* ---- helpers ---- */
function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${Math.max(0, Math.min(100, alpha)) / 100})`;
}
function fmt(n: number) { return Math.floor(n).toLocaleString(); }
function fmtDps(n: number) { return Math.round(n).toLocaleString(); }
function fmtDmg(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}e`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(n >= 100_000 ? 0 : 1)}w`;
  return fmt(n);
}
const HISTORY_THRESHOLD = 1_000_000;
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/* ===================================================================
   DpsCanvasPage
   =================================================================== */
export default function DpsCanvasPage() {
  const { settings } = useAppSettings();
  const dps = settings.appearance.dpsWindow;
  const bgColor = hexToRgba(dps.backgroundColor, dps.backgroundOpacity);

  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const snapshotRef = useRef<CombatSnapshot | null>(null);
  const pendingPaint = useRef(false);
  const iconCache = useRef(new Map<string, HTMLImageElement>());
  const serverCache = useRef(new Map<string, string>());

  const getIcon = (cls: string) => {
    let img = iconCache.current.get(cls);
    if (!img) {
      img = new Image();
      img.src = `/images/class/${cls.toLowerCase()}.webp`;
      iconCache.current.set(cls, img);
    }
    return img;
  };

  // ---- canvas paint ----
  const paint = () => {
    const c = canvasRef.current; if (!c) return;
    const s = snapshotRef.current;
    const W = c.clientWidth;
    c.width = W * devicePixelRatio;
    c.height = c.clientHeight * devicePixelRatio;
    const ctx = c.getContext("2d")!; ctx.scale(devicePixelRatio, devicePixelRatio);

    ctx.clearRect(0, 0, W, c.clientHeight);
    if (dps.backgroundOpacity > 0) { ctx.fillStyle = bgColor; ctx.fillRect(0, 0, W, c.clientHeight); }

    if (!s || !isRunningRef.current) return;
    const stats = s.lastTargetAllPlayersOverviewStats as PlayerOverviewStat[] | undefined;
    if (!stats || stats.length === 0) return;

    const sf = dps.scaleFactor;
    const ROW_H = 30 * sf; const PAD = 4 * sf; const ICON = 24 * sf;
    const maxDmg = stats[0]?.totalDamage ?? 1;
    const mainId = s.combatInfos?.mainActorId;
    stats.slice(0, 8).forEach((p, i) => {
      const y = PAD + i * ROW_H;
      const dmg = p.totalDamage ?? 0;
      const pct = dmg / maxDmg;

      // bar background
      ctx.fillStyle = (mainId != null && p.actorId === mainId) ? dps.mainPlayerColor : dps.otherPlayerColor;
      ctx.globalAlpha = 0.2;
      ctx.fillRect(PAD, y, (W - PAD * 2) * pct, ROW_H);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(PAD, y, (W - PAD * 2) * pct, ROW_H);
      ctx.globalAlpha = 1;

      // class icon
      if (p.actorClass) {
        const img = getIcon(p.actorClass);
        if (img.complete) {
          ctx.drawImage(img, PAD + 2, y + 3, ICON - 4, ICON - 4);
        }
      }

      // name — text-xs (12px) semibold tracking-tight
      const nameX = PAD + ICON + 4;
      ctx.fillStyle = "#fff"; ctx.font = `600 ${12 * sf}px ui-sans-serif,system-ui,sans-serif`;
      ctx.fillText(p.actorName || `P${p.actorId}`, nameX, y + 18 * sf, W - nameX - 170 * sf);

      // server — text-[10px] font-medium
      if (p.actorServerId) {
        let srv = serverCache.current.get(p.actorServerId);
        if (!srv) { srv = getServerShortName(Number(p.actorServerId)); serverCache.current.set(p.actorServerId, srv); }
        ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.font = `500 ${10 * sf}px ui-sans-serif,system-ui,sans-serif`;
        const nameW = ctx.measureText(p.actorName || `P${p.actorId}`).width;
        ctx.fillText(`@${srv}`, nameX + nameW + 4 * sf, y + 18 * sf);
      }

      // dps — text-xs monospace
      ctx.textAlign = "right";
      ctx.fillStyle = "rgba(255,255,255,0.6)"; ctx.font = `${12 * sf}px ui-monospace,SFMono-Regular,Menlo,monospace`;
      ctx.fillText(fmtDps(p.dps), W - PAD - 100 * sf, y + 19 * sf);

      // dmg — text-xs semibold
      ctx.fillStyle = "rgba(255,255,255,0.85)"; ctx.font = `600 ${12 * sf}px ui-monospace,SFMono-Regular,Menlo,monospace`;
      ctx.fillText(fmtDmg(dmg), W - PAD - 42 * sf, y + 19 * sf);

      // pct — text-[11px] semibold
      ctx.fillStyle = "#67e8f9"; ctx.font = `600 ${11 * sf}px ui-monospace,SFMono-Regular,Menlo,monospace`;
      ctx.fillText(`${(p.damageShare * 100).toFixed(1)}%`, W - PAD, y + 19 * sf);
      ctx.textAlign = "left";
    });
  };

  const schedulePaint = () => {
    if (pendingPaint.current) return;
    pendingPaint.current = true;
    requestAnimationFrame(() => { pendingPaint.current = false; paint(); });
  };

  // ---- resize ----
  const lastHeight = useRef(0); const resizeTimer = useRef(0);
  const resizeWindow = useCallback(async () => {
    if (!dps.autoResizeHeight) return;
    const c = canvasRef.current; if (!c) return;
    try {
      const aw = getCurrentWebviewWindow();
      const H = 28, B = 2, MIN = 10, MAX = 1000;
      const th = Math.max(MIN, Math.min(MAX, Math.ceil(c.clientHeight * dps.scaleFactor + H + B)));
      const sf = await aw.scaleFactor(); const os = await aw.outerSize();
      if (Math.abs(os.height / sf - th) < 5) { lastHeight.current = th; return; }
      if (Math.abs(lastHeight.current - th) < 5) return;
      lastHeight.current = th;
      await aw.setSize(new LogicalSize(os.width / sf, th));
    } catch { /* */ }
  }, [dps.autoResizeHeight, dps.scaleFactor]);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const obs = new ResizeObserver(() => {
      if (resizeTimer.current) clearTimeout(resizeTimer.current);
      resizeTimer.current = window.setTimeout(() => { void resizeWindow(); paint(); }, 50);
    });
    obs.observe(c);
    return () => obs.disconnect();
  }, [resizeWindow]);

  // ---- event listeners ----
  const unlistenAll = useRef<Array<() => void>>([]);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const initial = await invoke<boolean>("get_dps_meter_status");
      if (!alive) return;
      setIsRunning(initial);
      isRunningRef.current = initial;

      const u1 = await listen<boolean>("dps-meter-status", (e) => {
        if (!alive) return;
        const v = Boolean(e.payload);
        setIsRunning(v); isRunningRef.current = v;
      });

      const u2 = await listen<CombatSnapshot>("dps-snapshot", (e) => {
        if (!alive) return;
        snapshotRef.current = e.payload;
        schedulePaint();
      });

      const u3 = await listen<{ actorId: number; actorName: string; sid?: string | null }>(
        "dps-main-actor-detected", (e) => {
          if (!alive) return;
          const p = e.payload;
          const sid = p.sid ? Number(p.sid) : NaN;
          if (p.actorName && Number.isFinite(sid)) {
            Aion2MainActorHistory.add({ id: `${p.actorName}-${sid}`, actorName: p.actorName, serverId: sid, lastSeenAt: Date.now() });
          }
          void (async () => { await doReset(); await uploadPending(); })();
        }
      );
      unlistenAll.current = [u1, u2, u3];
    })();
    return () => { alive = false; unlistenAll.current.forEach((f) => f()); };
  }, []);

  // ---- window close ----
  useEffect(() => {
    const aw = getCurrentWebviewWindow();
    const u = aw.onCloseRequested(async () => { try { await invoke("stop_dps_meter"); } catch { /* */ } });
    return () => { u.then((f: () => void) => f()); };
  }, []);

  // ---- reset & upload ----
  const doReset = useCallback(async () => {
    try {
      const snap = snapshotRef.current;
      snapshotRef.current = null;
      paint();
      await invoke("reset_dps_meter");
      if (!snap) return;
      const records = Object.entries(snap.byTargetPlayerStats ?? {}).flatMap(([tid, ps]) => {
        const nid = Number(tid);
        const td = Object.values(ps ?? {}).reduce((s: number, st: any) => s + (st?.total_damage ?? 0), 0);
        if (!Number.isFinite(nid) || td <= HISTORY_THRESHOLD) return [];
        return [{
          id: `${tid}-${Date.now()}`, targetId: nid,
          thisTargetAllPlayerStats: clone(ps),
          thisTargetAllPlayerSkillStats: clone(snap.byTargetPlayerSkillStats?.[tid] ?? {}),
          thisTargetAllPlayerSkillRecords: {},
          combatInfos: clone({ ...snap.combatInfos, targetInfos: snap.combatInfos.targetInfos?.[tid] ? { [tid]: snap.combatInfos.targetInfos[tid] } : {} }),
        }];
      });
      if (records.length > 0) Aion2DpsHistory.addMany(records.map((r: any) => ({ ...r, uploaded: false })) as any);
    } catch (e) { console.error("reset failed:", e); }
  }, []);

  const uploadPending = async () => {
    const all = Aion2DpsHistory.get();
    const pending = all.filter((r: any) => !r.uploaded);
    if (pending.length === 0) return;
    try { await uploadDpsDataBatch(pending); Aion2DpsHistory.updateMany(pending.map((r: any) => ({ id: r.id, uploaded: true })) as any); } catch { /* */ }
  };

  const onStart = useCallback(async () => { try { await invoke("start_dps_meter"); } catch { /* */ } }, []);
  const onStop = useCallback(async () => { try { await invoke("stop_dps_meter"); } catch { /* */ } }, []);
  const onClose = useCallback(async () => { await getCurrentWebviewWindow().close(); }, []);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden rounded-sm text-slate-100">
      <div className="flex h-7 shrink-0 items-center justify-between rounded-t-[5px] border border-white/10 bg-black/40 px-2 select-none">
        <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400" data-tauri-drag-region />
          <span className="truncate text-xs font-medium text-slate-300" data-tauri-drag-region>DPS Canvas</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" onClick={onClose} className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-rose-500/20 hover:text-rose-100"><X className="h-3 w-3" /></button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex h-5 w-5 items-center justify-center rounded border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"><Settings className="h-3 w-3" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-20 p-0.5">
              <DropdownMenuItem className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3" onClick={isRunning ? onStop : onStart}>
                {isRunning ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                <span className="text-xs">{isRunning ? "停止" : "开始"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-1.5 px-1.5 py-0.5 text-xs [&_svg]:size-3" onClick={() => { void doReset(); }}>
                <RotateCcw className="h-3 w-3" /><span className="text-xs">清空</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <canvas ref={canvasRef} className="flex-1 w-full" />
    </div>
  );
}
