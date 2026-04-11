import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  Activity,
  Clock3,
  History,
  Play,
  RotateCcw,
  Settings2,
  Square,
  Swords,
  Target,
} from "lucide-react";
import { toast } from "sonner";

import { MemoizedDpsPanel } from "@/components/dps/DpsPannel";
import { TitleBar } from "@/components/title-bar";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { WindowFrame } from "@/components/window-frame";
import { useAppSettings } from "@/hooks/use-app-settings";
import { createWindow } from "@/lib/window";
import { cn } from "@/lib/utils";
import { CombatSnapshot } from "@/types/aion2dps";

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
        "flex h-7 w-7 items-center justify-center rounded-md border text-slate-300 transition",
        "border-white/10 bg-white/5 hover:bg-white/10 hover:text-white",
        active && tone === "accent" && "border-cyan-400/40 bg-cyan-500/15 text-cyan-200",
        tone === "danger" && "hover:border-rose-400/40 hover:bg-rose-500/15 hover:text-rose-100"
      )}
    >
      {children}
    </button>
  );
}

export default function DpsPage() {
  const { settings } = useAppSettings();
  const [isRunning, setIsRunning] = useState(false);
  const [snapshot, setSnapshot] = useState<CombatSnapshot | null>(null);
  const [currentTarget, setCurrentTarget] = useState<number | null>(null);

  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const lastWindowHeightRef = useRef<number | null>(null);
  const unlistenSnapshotRef = useRef<null | (() => void)>(null);
  const unlistenStatusRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        const status = await invoke<boolean>("get_dps_meter_status");
        if (mounted) {
          setIsRunning(status);
        }

        unlistenSnapshotRef.current = await listen<CombatSnapshot>("dps-snapshot", (event) => {
          if (!mounted) {
            return;
          }
          setSnapshot(event.payload);
        });

        unlistenStatusRef.current = await listen<boolean>("dps-meter-status", (event) => {
          if (!mounted) {
            return;
          }

          const running = Boolean(event.payload);
          setIsRunning(running);
          if (!running) {
            setSnapshot(null);
            setCurrentTarget(null);
          }
        });
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
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
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

  const resizeWindow = useCallback(async () => {
    if (!contentRef.current) {
      return;
    }

    const appWindow = getCurrentWebviewWindow();
    const TITLE_BAR_HEIGHT = 32;
    const WINDOW_BORDER_HEIGHT = 2;
    const MIN_HEIGHT = 230;
    const MAX_HEIGHT = 1000;

    try {
      const element = contentRef.current;
      if (!element) {
        return;
      }

      const contentHeight = element.scrollHeight;
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
  }, []);

  useEffect(() => {
    const contentElement = contentRef.current;
    if (!contentElement) {
      return;
    }

    const RESIZE_DEBOUNCE_MS = 120;
    const scheduleResize = () => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }

      resizeTimerRef.current = window.setTimeout(() => {
        resizeTimerRef.current = null;
        window.requestAnimationFrame(() => {
          void resizeWindow();
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
  }, [resizeWindow, snapshot, currentTarget, isRunning, settings]);

  const resolvedTargetId = useMemo(() => {
    return currentTarget ?? snapshot?.combatInfos?.lastTargetByMainActor ?? snapshot?.combatInfos?.lastTarget ?? null;
  }, [snapshot, currentTarget]);

  const displayTargetInfo = useMemo(() => {
    if (!snapshot || resolvedTargetId === null) {
      return null;
    }
    return snapshot.combatInfos?.targetInfos?.[String(resolvedTargetId)] ?? null;
  }, [snapshot, resolvedTargetId]);

  const dpsPanelData = useMemo(() => {
    if (!snapshot || resolvedTargetId === null) {
      return null;
    }
    return {
      targetId: resolvedTargetId,
      thisTargetPlayerStats: snapshot.byTargetPlayerStats?.[String(resolvedTargetId)] ?? null,
      targetInfo: displayTargetInfo,
      combatInfos: snapshot.combatInfos ?? null,
    };
  }, [snapshot, resolvedTargetId, displayTargetInfo]);

  const targetName = displayTargetInfo?.targetName || "No Target";
  const totalDamage = snapshot?.totalDamage ?? 0;
  const actorCount = dpsPanelData?.thisTargetPlayerStats
    ? Object.keys(dpsPanelData.thisTargetPlayerStats).length
    : 0;
  const targetLabel = displayTargetInfo?.isBoss
    ? "Boss Target"
    : displayTargetInfo?.targetMobCode
      ? `Mob ${displayTargetInfo.targetMobCode}`
      : "Waiting";

  const handleStartDpsMeter = async () => {
    try {
      await invoke("start_dps_meter");
      toast.success("DPS Meter started");
    } catch (error) {
      console.error("start dps meter failed:", error);
      toast.error("Failed to start DPS Meter");
    }
  };

  const handleStopDpsMeter = async () => {
    try {
      await invoke("stop_dps_meter");
      toast.info("DPS Meter stopped");
    } catch (error) {
      console.error("stop dps meter failed:", error);
      toast.error("Failed to stop DPS Meter");
    }
  };

  const handleReset = async () => {
    try {
      await invoke("reset_dps_meter");
      setSnapshot(null);
      setCurrentTarget(null);
      lastWindowHeightRef.current = null;
      window.requestAnimationFrame(() => {
        void resizeWindow();
      });
      toast.success("DPS panel reset");
    } catch (error) {
      console.error("reset dps meter failed:", error);
      toast.error("Failed to reset DPS panel");
    }
  };

  const handleOpenSettings = async () => {
    await createWindow("settings", {
      title: "Settings",
      url: "/settings",
      width: 760,
      height: 560,
      minWidth: 680,
      minHeight: 480,
      resizable: true,
      transparent: true,
      decorations: false,
      parent: "dps",
    });
  };

  const handleOpenHistory = () => {
    toast.info("History view is coming next");
  };

  const rightActions = (
    <div className="flex items-center gap-1 pr-1">
      {isRunning ? (
        <TitleIconButton active onClick={handleStopDpsMeter} title="Stop meter" tone="danger">
          <Square className="h-3.5 w-3.5" />
        </TitleIconButton>
      ) : (
        <TitleIconButton active onClick={handleStartDpsMeter} title="Start meter" tone="accent">
          <Play className="h-3.5 w-3.5" />
        </TitleIconButton>
      )}
      <TitleIconButton onClick={handleReset} title="Reset meter">
        <RotateCcw className="h-3.5 w-3.5" />
      </TitleIconButton>
      <TitleIconButton onClick={handleOpenSettings} title="Open settings">
        <Settings2 className="h-3.5 w-3.5" />
      </TitleIconButton>
      <TitleIconButton onClick={handleOpenHistory} title="Open history">
        <History className="h-3.5 w-3.5" />
      </TitleIconButton>
    </div>
  );

  const leftActions = (
    <div className="flex min-w-0 items-center gap-2">
      <div
        className={cn(
          "h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor]",
          isRunning ? "bg-emerald-400 text-emerald-400" : "bg-amber-400 text-amber-400"
        )}
      />
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
        <Target className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate text-xs font-semibold tracking-[0.18em] text-slate-100 uppercase">
          {targetName}
        </span>
      </div>
    </div>
  );

  return (
    <WindowFrame
      titleBar={
        <TitleBar
          title=""
          showMaximize={false}
          leftActions={leftActions}
          rightActions={rightActions}
        />
      }
      className="bg-slate-950/88 text-slate-100 backdrop-blur-2xl"
      contentClassName="flex flex-1 items-start bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_32%),linear-gradient(180deg,rgba(15,23,42,0.95),rgba(2,6,23,0.9))]"
    >
      <Toaster />

      <div ref={contentRef} className="flex w-full self-start flex-col gap-2 p-2">
        <section className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              <Swords className="h-3.5 w-3.5" />
              Total Damage
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">
              {totalDamage.toLocaleString()}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              <Activity className="h-3.5 w-3.5" />
              Participants
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-100">{actorCount}</div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/6 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              Target State
            </div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-100">{targetLabel}</div>
          </div>
        </section>

        <section className="flex flex-col rounded-2xl border border-white/10 bg-black/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <div className="flex items-center justify-between border-b border-white/8 px-3 py-2">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Live DPS Panel
              </div>
              <div className="mt-0.5 text-sm font-medium text-slate-100">{targetName}</div>
            </div>

            {currentTarget !== null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={() => setCurrentTarget(null)}
              >
                Follow Auto Target
              </Button>
            )}
          </div>

          <div className="px-2 py-2">
            {dpsPanelData ? (
              <MemoizedDpsPanel
                targetInfo={dpsPanelData.targetInfo || undefined}
                thisTargetPlayerStats={dpsPanelData.thisTargetPlayerStats || undefined}
                combatInfos={dpsPanelData.combatInfos || undefined}
                mainPlayerColor="linear-gradient(90deg, rgba(34,197,94,0.5), rgba(16,185,129,0.12))"
                otherPlayerColor="linear-gradient(90deg, rgba(56,189,248,0.36), rgba(59,130,246,0.08))"
                onPlayerClicked={() => {}}
              />
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-center">
                <div className="space-y-1 px-4">
                  <div className="text-sm font-medium text-slate-100">Waiting for combat data</div>
                  <div className="text-xs text-slate-400">
                    Start the meter and lock onto a target to populate this panel.
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </WindowFrame>
  );
}
