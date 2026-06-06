import { useCallback, useEffect, useRef, useState } from "react";

import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow, WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Lock, Unlock, Wifi, WifiOff } from "lucide-react";

import { useAppSettings } from "@/hooks/use-app-settings";
import { cn } from "@/lib/utils";
import { MemorySnapshot } from "@/types/aion2dps";

const PARENT_WINDOW_LABELS = ["dps_v2", "dps_new", "dps"] as const;
const PING_WINDOW_HEIGHT = 25;
const MIN_WINDOW_WIDTH = 25;
const PING_BUTTON_BASE_CLASS = "flex cursor-pointer items-center gap-1 hover:brightness-110";

const setText = (element: HTMLElement | null, value: string) => {
  if (!element || element.textContent === value) {
    return;
  }

  element.textContent = value;
};

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

const getDpsParentWindow = async () => {
  const windows = await Promise.all(
    PARENT_WINDOW_LABELS.map(async (label) => WebviewWindow.getByLabel(label))
  );
  const existingWindows = windows.filter((window): window is WebviewWindow => Boolean(window));

  for (const window of existingWindows) {
    if ((await window.isVisible()) && !(await window.isMinimized())) {
      return window;
    }
  }

  return existingWindows[0] ?? null;
};

export default function DpsPingPage() {
  const { settings } = useAppSettings();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [locked, setLocked] = useState(false);
  const lastMemorySignatureRef = useRef<string | null>(null);
  const unlistenMemoryRef = useRef<null | (() => void)>(null);
  const lastSyncedWidthRef = useRef(0);
  const pingHistoryRef = useRef<[number, number][]>([]);
  const pingButtonRef = useRef<HTMLButtonElement | null>(null);
  const wifiIconRef = useRef<SVGSVGElement | null>(null);
  const wifiOffIconRef = useRef<SVGSVGElement | null>(null);
  const pingTextRef = useRef<HTMLSpanElement | null>(null);
  const cpuTextRef = useRef<HTMLSpanElement | null>(null);
  const memoryTextRef = useRef<HTMLSpanElement | null>(null);

  const syncSizeWithParent = useCallback(async () => {
    try {
      const appWindow = getCurrentWebviewWindow();
      const parentWindow = await getDpsParentWindow();

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

  const updateFooterDom = useCallback((memory: MemorySnapshot) => {
    const pingMs = memory.pingMs;
    const pingActive = typeof pingMs === "number" && Number.isFinite(pingMs);
    const pingTone = !pingActive
      ? "text-white/60"
      : pingMs < 60
        ? "text-green-400"
        : pingMs < 120
          ? "text-yellow-400"
          : "text-rose-400";

    pingHistoryRef.current = memory.pingHistory ?? [];
    setText(pingTextRef.current, pingActive ? `${Math.round(pingMs)} ms` : "--");
    setText(cpuTextRef.current, formatPercent(memory.cpuPercent));
    setText(memoryTextRef.current, formatMemory(memory.rssMb));

    if (pingButtonRef.current) {
      pingButtonRef.current.className = cn(PING_BUTTON_BASE_CLASS, pingTone);
    }
    if (wifiIconRef.current) {
      wifiIconRef.current.style.display = pingActive ? "" : "none";
    }
    if (wifiOffIconRef.current) {
      wifiOffIconRef.current.style.display = pingActive ? "none" : "";
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        unlistenMemoryRef.current = await listen<MemorySnapshot>("dps-memory", (event) => {
          if (!mounted) {
            return;
          }

          const nextMemory = event.payload;
          pingHistoryRef.current = nextMemory.pingHistory ?? [];

          const nextSignature = `${nextMemory.pingMs ?? ""}|${nextMemory.cpuPercent ?? ""}|${nextMemory.rssMb ?? ""}`;

          if (lastMemorySignatureRef.current === nextSignature) {
            return;
          }

          lastMemorySignatureRef.current = nextSignature;
          updateFooterDom(nextMemory);
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
  }, [updateFooterDom]);

  useEffect(() => {
    let mounted = true;
    const unlisteners: Array<() => void> = [];

    const setup = async () => {
      try {
        const parentWindows = await Promise.all(
          PARENT_WINDOW_LABELS.map(async (label) => WebviewWindow.getByLabel(label))
        );

        for (const parentWindow of parentWindows) {
          if (!parentWindow || !mounted) {
            continue;
          }

          const unlisten = await parentWindow.onResized(() => {
            void syncSizeWithParent();
          });
          unlisteners.push(unlisten);
        }

        await syncSizeWithParent();
      } catch (error) {
        console.error("setup dps_ping parent resize listener failed:", error);
      }
    };

    void setup();

    return () => {
      mounted = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [syncSizeWithParent]);

  const toggleLock = async () => {
    try {
      const parent = await getDpsParentWindow();
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
          {dpsAppearance.pingWindowShowLatency && (
            <button
              ref={pingButtonRef}
              type="button"
              className={cn(PING_BUTTON_BASE_CLASS, "text-white/60")}
              onClick={async () => {
                if (!locked) {
                  await emit("ping-history", pingHistoryRef.current);
                }
              }}
            >
              <Wifi ref={wifiIconRef} className="h-4 w-4" style={{ display: "none" }} />
              <WifiOff ref={wifiOffIconRef} className="h-4 w-4" />
              <span ref={pingTextRef} className="text-stroke-2 text-stroke-black text-sm">
                --
              </span>
            </button>
          )}

          {dpsAppearance.pingWindowShowCpu && (
            <div className="flex items-center gap-1 text-slate-200">
              <span className="text-[10px] font-semibold text-slate-400">CPU</span>
              <span ref={cpuTextRef} className="text-stroke-2 text-stroke-black text-sm">
                --
              </span>
            </div>
          )}

          {dpsAppearance.pingWindowShowMemory && (
            <div className="flex items-center gap-1 text-slate-200">
              <span className="text-[10px] font-semibold text-slate-400">MEM</span>
              <span ref={memoryTextRef} className="text-stroke-2 text-stroke-black text-sm">
                --
              </span>
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
