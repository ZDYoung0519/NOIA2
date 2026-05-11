import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Lock, Unlock, Wifi, WifiOff } from "lucide-react";

import { useAppSettings } from "@/hooks/use-app-settings";
import { cn } from "@/lib/utils";
import { MemorySnapshot } from "@/types/aion2dps";

type FooterData = {
  cpu: string;
  ram: string;
  ping: string;
  packetTotalKb: string;
  packetTooltipLines: string[];
  packetPortLines: Array<{
    key: string;
    value: string;
    isCombatPort: boolean;
  }>;
  combatPort: string | null;
  mainActorName: string;
  pingActive: boolean;
  pingTone: string;
  pingHistory: [number, number][];
};

const PARENT_WINDOW_LABEL = "dps";
const PING_WINDOW_HEIGHT = 25;
const MIN_WINDOW_WIDTH = 25;

export default function DpsPingPage() {
  const { settings } = useAppSettings();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [memorySnapshot, setMemorySnapshot] = useState<MemorySnapshot | null>(null);
  const [locked, setLocked] = useState(false);
  const lastMemorySignatureRef = useRef<string | null>(null);
  const unlistenMemoryRef = useRef<null | (() => void)>(null);
  const lastSyncedWidthRef = useRef(0);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        unlistenMemoryRef.current = await listen<MemorySnapshot>("dps-memory", (event) => {
          if (!mounted) {
            return;
          }

          const nextMemory = event.payload;

          const nextSignature = JSON.stringify({
            cpuPercent: nextMemory.cpuPercent,
            rssMb: nextMemory.rssMb,
            vmsMb: nextMemory.vmsMb,
            memoryPercent: nextMemory.memoryPercent,
            capDevice: nextMemory.capDevice,
            capPort: nextMemory.capPort,
            pingMs: nextMemory.pingMs,
            mainActorName: nextMemory.mainActorName,
            packetSizes: nextMemory.packetSizes,
            pingHistory: nextMemory.pingHistory,
          });

          if (lastMemorySignatureRef.current === nextSignature) {
            return;
          }

          lastMemorySignatureRef.current = nextSignature;
          setMemorySnapshot(nextMemory);
        });
      } catch (error) {
        console.error("setup dps ping listeners failed:", error);
      }
    };

    void setup();

    return () => {
      mounted = false;

      if (unlistenMemoryRef.current) {
        void unlistenMemoryRef.current();
        unlistenMemoryRef.current = null;
      }
    };
  }, []);

  const syncSizeWithParent = useCallback(async () => {
    try {
      const appWindow = getCurrentWebviewWindow();
      const parentWindow = await WebviewWindow.getByLabel(PARENT_WINDOW_LABEL);

      if (!parentWindow) {
        return;
      }

      const parentOuterSize = await parentWindow.outerSize();
      const parentScaleFactor = await parentWindow.scaleFactor();

      const parentLogicalWidth = Math.round(parentOuterSize.width / parentScaleFactor);

      const targetWidth = Math.max(MIN_WINDOW_WIDTH, parentLogicalWidth);
      if (Math.abs(targetWidth - lastSyncedWidthRef.current) < 1) {
        return;
      }

      lastSyncedWidthRef.current = targetWidth;
      await appWindow.setSize(new LogicalSize(targetWidth, PING_WINDOW_HEIGHT));
    } catch (error) {
      console.error("sync dps_ping size with parent failed:", error);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    let unlisten: null | (() => void) = null;

    const setup = async () => {
      try {
        const parentWindow = await WebviewWindow.getByLabel(PARENT_WINDOW_LABEL);
        if (!parentWindow || !mounted) {
          return;
        }

        unlisten = await parentWindow.onResized(() => {
          void syncSizeWithParent();
        });
        await syncSizeWithParent();
      } catch (error) {
        console.error("setup dps_ping parent resize listener failed:", error);
      }
    };

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [syncSizeWithParent]);

  useEffect(() => {
    void syncSizeWithParent();
  }, [syncSizeWithParent, memorySnapshot]);

  const footerData = useMemo<FooterData>(() => {
    const formatMemory = (mb?: number | null) => {
      if (typeof mb !== "number" || !Number.isFinite(mb)) {
        return "--";
      }

      return `${mb.toFixed(1)}M`;
    };

    const formatPercent = (value?: number | null) => {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "--";
      }

      return `${value.toFixed(1)}%`;
    };

    const pingMs = memorySnapshot?.pingMs;

    const pingActive = typeof pingMs === "number" && Number.isFinite(pingMs);

    const pingValue = pingActive ? `${Math.round(pingMs)} ms` : "--";

    const packetEntries = Object.entries(memorySnapshot?.packetSizes ?? {});
    const totalPacketSize = packetEntries.reduce((sum, [, value]) => sum + Number(value || 0), 0);

    const portPacketEntries = packetEntries.filter(([key]) => /^\d+-\d+$/.test(key));

    const otherPacketEntries = packetEntries.filter(([key]) => !/^\d+-\d+$/.test(key));

    const combatPort = memorySnapshot?.capPort ?? null;

    const packetTooltipLines =
      packetEntries.length > 0
        ? [
            `Total: ${(totalPacketSize / 1000).toFixed(2)}k`,
            combatPort ? `Combat port: ${combatPort}` : "Combat port: --",
            ...otherPacketEntries.map(
              ([key, value]) => `${key}: ${(Number(value) / 1000).toFixed(2)}k`
            ),
          ]
        : ["No buffers"];

    const packetPortLines = portPacketEntries.map(([key, value]) => ({
      key,
      value: `${(Number(value) / 1000).toFixed(2)}k`,
      isCombatPort: key === combatPort,
    }));

    return {
      cpu: formatPercent(memorySnapshot?.cpuPercent),
      ram: formatMemory(memorySnapshot?.rssMb),
      ping: pingValue,
      packetTotalKb: totalPacketSize > 0 ? `${(totalPacketSize / 1000).toFixed(1)}k` : "0k",
      packetTooltipLines,
      packetPortLines,
      combatPort,
      mainActorName: memorySnapshot?.mainActorName ?? "--",
      pingHistory: memorySnapshot?.pingHistory ?? [],
      pingActive,
      pingTone: !pingActive
        ? "text-white/60"
        : pingMs < 60
          ? "text-green-400"
          : pingMs < 120
            ? "text-yellow-400"
            : "text-rose-400",
    };
  }, [memorySnapshot]);

  const toggleLock = async () => {
    try {
      const parent = await WebviewWindow.getByLabel("dps");
      if (!parent) return;

      const nextLocked = !locked;
      setLocked(nextLocked);

      // 锁定：穿透；解锁：恢复
      await parent.setIgnoreCursorEvents(nextLocked);
      await emit("dps-click-through-changed", { clickThrough: nextLocked });
    } catch (err) {
      console.error("toggle lock failed:", err);
    }
  };

  const isRightAligned = dpsAppearance.pingWindowAlignment === "right";
  const hasMetric =
    dpsAppearance.pingWindowShowLatency ||
    dpsAppearance.pingWindowShowCpu ||
    dpsAppearance.pingWindowShowMemory;

  return (
    <div className="flex h-[25px] w-screen flex-row overflow-hidden">
      <div
        className={cn(
          "flex h-[25px] w-full items-center gap-1 px-2 py-0 text-[11px] text-slate-300",
          isRightAligned ? "flex-row-reverse justify-start" : "flex-row justify-start"
        )}
      >
        <div
          className={cn(
            "flex min-w-0 items-center gap-2 select-none",
            isRightAligned ? "flex-row-reverse" : "flex-row"
          )}
        >
          {dpsAppearance.pingWindowShowLatency &&
            (footerData.pingActive ? (
              <button
                type="button"
                className={cn(
                  "flex cursor-pointer items-center gap-1 hover:brightness-110",
                  footerData.pingTone
                )}
                onClick={async () => {
                  if (!locked) {
                    await emit("ping-history", footerData.pingHistory);
                  }
                }}
              >
                <Wifi className="h-4 w-4" />
                <span className="text-stroke-2 text-stroke-black text-sm">{footerData.ping}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1 text-white/60">
                <WifiOff className="h-4 w-4" />
                <span className="text-sm select-none">--</span>
              </div>
            ))}

          {dpsAppearance.pingWindowShowCpu && (
            <div className="flex items-center gap-1 text-slate-200">
              <span className="text-[10px] font-semibold text-slate-400">CPU</span>
              <span className="text-stroke-2 text-stroke-black text-sm">{footerData.cpu}</span>
            </div>
          )}

          {dpsAppearance.pingWindowShowMemory && (
            <div className="flex items-center gap-1 text-slate-200">
              <span className="text-[10px] font-semibold text-slate-400">MEM</span>
              <span className="text-stroke-2 text-stroke-black text-sm">{footerData.ram}</span>
            </div>
          )}

          {!hasMetric && <span className="text-sm text-white/60">--</span>}
        </div>
        <button
          type="button"
          onClick={toggleLock}
          className={cn(
            "flex cursor-pointer items-center justify-center px-1 py-1 transition hover:brightness-110",
            locked
              ? "rounded border border-rose-400/40 bg-rose-500/15 text-rose-200"
              : "border-white/10 text-slate-300"
          )}
          title={locked ? "已锁定" : "未锁定（点击锁定）"}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
        </button>
      </div>
    </div>
  );
}
