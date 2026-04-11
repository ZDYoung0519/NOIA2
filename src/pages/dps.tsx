import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  History,
  Play,
  RotateCcw,
  Settings2,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { MemoizedDpsPanel } from "@/components/dps/DpsPannel";
import { TitleBar } from "@/components/title-bar";
import { Toaster } from "@/components/ui/sonner";

import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { createWindow } from "@/lib/window";
import { cn } from "@/lib/utils";
import { CombatSnapshot } from "@/types/aion2dps";

const hexToRgba = (hex: string, alphaPercent: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex = safeHex.length === 3
    ? safeHex.split("").map((char) => `${char}${char}`).join("")
    : safeHex;

  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);
  const alpha = Math.min(100, Math.max(0, alphaPercent)) / 100;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const darkenHex = (hex: string, amount: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex = safeHex.length === 3
    ? safeHex.split("").map((char) => `${char}${char}`).join("")
    : safeHex;

  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp(parseInt(normalizedHex.slice(0, 2), 16) - amount);
  const g = clamp(parseInt(normalizedHex.slice(2, 4), 16) - amount);
  const b = clamp(parseInt(normalizedHex.slice(4, 6), 16) - amount);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
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
          "flex h-screen w-screen flex-col overflow-hidden border-border rounded-lg border",
          className
        )}
      >
        {titleBar}
        <main className={contentClassName}>{children}</main>
      </div>

  );
}


export default function DpsPage() {
  const { settings } = useAppSettings();
  const { t } = useAppTranslation();
  const dpsAppearance = settings.appearance.dpsWindow;
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

      const contentHeight = element.scrollHeight * dpsAppearance.scaleFactor;
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
    const contentElement = contentRef.current;
    if (!contentElement || !dpsAppearance.autoResizeHeight) {
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
  }, [resizeWindow, snapshot, currentTarget, isRunning, dpsAppearance.autoResizeHeight, dpsAppearance.scaleFactor]);

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

  const targetName = displayTargetInfo?.targetName || t("dps.target.none");
  const shellBackground = hexToRgba(
    dpsAppearance.backgroundColor,
    dpsAppearance.backgroundOpacity
  );
  const titleBarBackground = hexToRgba(
    darkenHex(dpsAppearance.backgroundColor, 22),
    Math.min(100, dpsAppearance.backgroundOpacity + 18)
  );
  const panelBackground = hexToRgba(dpsAppearance.panelColor, dpsAppearance.panelOpacity);

  const handleStartDpsMeter = async () => {
    try {
      await invoke("start_dps_meter");
      toast.success(t("dps.toast.started"));
    } catch (error) {
      console.error("start dps meter failed:", error);
      toast.error(t("dps.toast.startFailed"));
    }
  };

  const handleStopDpsMeter = async () => {
    try {
      await invoke("stop_dps_meter");
      toast.info(t("dps.toast.stopped"));
    } catch (error) {
      console.error("stop dps meter failed:", error);
      toast.error(t("dps.toast.stopFailed"));
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
      toast.success(t("dps.toast.reset"));
    } catch (error) {
      console.error("reset dps meter failed:", error);
      toast.error(t("dps.toast.resetFailed"));
    }
  };

  const handleOpenSettings = async () => {
    await createWindow("settings", {
      title: t("settings.title"),
      url: "/settings",
      width: 760,
      height: 560,
      minWidth: 680,
      minHeight: 10,
      resizable: true,
      transparent: true,
      decorations: false,
      parent: "dps",
    });
  };

  const handleOpenHistory = () => {
    toast.info(t("dps.toast.historyComing"));
  };

  const rightActions = (
    <div className="flex items-center gap-1 pr-1">
      {isRunning ? (
        <TitleIconButton active onClick={handleStopDpsMeter} title={t("dps.actions.stop")} tone="danger">
          <Square className="h-3.5 w-3.5" />
        </TitleIconButton>
      ) : (
        <TitleIconButton active onClick={handleStartDpsMeter} title={t("dps.actions.start")} tone="accent">
          <Play className="h-3.5 w-3.5" />
        </TitleIconButton>
      )}
      <TitleIconButton onClick={handleReset} title={t("dps.actions.reset")}>
        <RotateCcw className="h-3.5 w-3.5" />
      </TitleIconButton>
      <TitleIconButton onClick={handleOpenSettings} title={t("dps.actions.settings")}>
        <Settings2 className="h-3.5 w-3.5" />
      </TitleIconButton>
      <TitleIconButton onClick={handleOpenHistory} title={t("dps.actions.history")}>
        <History className="h-3.5 w-3.5" />
      </TitleIconButton>
    </div>
  );

  const leftActions = (
    <div className="flex min-w-0 items-center gap-2 " data-tauri-drag-region>
      <div
        className={cn(
          "h-2.5 w-2.5 rounded-full shadow-[0_0_14px_currentColor]",
          isRunning ? "bg-emerald-400 text-emerald-400" : "bg-red-400 text-amber-400"
        )}
      />
      
      <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1" data-tauri-drag-region>
        <span className="truncate text-xs font-semibold tracking-[0.18em] text-slate-100 uppercase" data-tauri-drag-region>
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
          className="border-white/10"
          style={{ backgroundColor: titleBarBackground }}
        />
      }
      className="border-white/10 text-slate-100"
      contentClassName="flex flex-1 items-start"
    >
      <Toaster />

      <div
        ref={contentRef}
        className="flex w-full self-start flex-col bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_32%)]"
        style={{
          backgroundColor: shellBackground,
          zoom: dpsAppearance.scaleFactor,
        }}
      >
        <section
          className="flex flex-col rounded-2xl border border-white/10 "
          style={{ backgroundColor: panelBackground }}
        >
            {/* {currentTarget !== null && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full border border-white/10 px-3 text-xs text-slate-300 hover:bg-white/10 hover:text-white"
                onClick={() => setCurrentTarget(null)}
              >
                Follow Auto Target
              </Button>
            )} */}


          <div className="px-2 py-2">
            {dpsPanelData ? (
              <MemoizedDpsPanel
                targetInfo={dpsPanelData.targetInfo || undefined}
                thisTargetPlayerStats={dpsPanelData.thisTargetPlayerStats || undefined}
                combatInfos={dpsPanelData.combatInfos || undefined}
                mainPlayerColor={dpsAppearance.mainPlayerColor}
                otherPlayerColor={dpsAppearance.otherPlayerColor}
                onPlayerClicked={() => {}}
              />
            ) : (
              <div className="flex h-full min-h-10 items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[0.03] text-center">
                <div className="space-y-1 px-4">
                  <div className="text-sm font-medium text-slate-100">{t("dps.panel.waitingTitle")}</div>

                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </WindowFrame>
  );
}
