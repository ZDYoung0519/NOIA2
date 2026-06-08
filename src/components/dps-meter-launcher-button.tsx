import { useEffect, useMemo, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { useAppSettings } from "@/hooks/use-app-settings";
import { hideDpsWindows, showDpsWindows } from "@/lib/window";

const DPS_METER_STARTED_AT_KEY = "dps-meter-started-at";

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function readStartedAt() {
  const raw = window.localStorage.getItem(DPS_METER_STARTED_AT_KEY);
  if (!raw) {
    return null;
  }

  const numeric = Number(raw);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function persistStartedAt(timestamp: number) {
  window.localStorage.setItem(DPS_METER_STARTED_AT_KEY, String(timestamp));
}

function clearStartedAt() {
  window.localStorage.removeItem(DPS_METER_STARTED_AT_KEY);
}

export function DpsMeterLauncherButton() {
  const [isDpsMeterRunning, setIsDpsMeterRunning] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const { settings } = useAppSettings();
  const autoCloseMain = settings.autoCloseMainOnStartup;

  useEffect(() => {
    let alive = true;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      try {
        const initial = await invoke<boolean>("get_dps_meter_status");
        if (!alive) {
          return;
        }

        setIsDpsMeterRunning(initial);
        if (initial) {
          const persistedStartedAt = readStartedAt() ?? Date.now();
          setStartedAt(persistedStartedAt);
          persistStartedAt(persistedStartedAt);
        }
      } catch (error) {
        console.error("get dps meter status failed:", error);
      }

      const unlistenStatus = await listen<boolean>("dps-meter-status", (event) => {
        if (!alive) {
          return;
        }

        const nextRunning = Boolean(event.payload);
        setIsDpsMeterRunning(nextRunning);
        setStartedAt((current) => {
          if (!nextRunning) {
            return null;
          }

          const nextStartedAt = current ?? readStartedAt() ?? Date.now();
          persistStartedAt(nextStartedAt);
          return nextStartedAt;
        });
        if (!nextRunning) {
          setElapsedSeconds(0);
          clearStartedAt();
        }
      });

      unlisteners.push(unlistenStatus);
    })();

    return () => {
      alive = false;
      unlisteners.forEach((dispose) => dispose());
    };
  }, []);

  useEffect(() => {
    if (!isDpsMeterRunning || !startedAt) {
      return;
    }

    setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isDpsMeterRunning, startedAt]);

  const elapsedText = useMemo(() => formatElapsed(elapsedSeconds), [elapsedSeconds]);

  const handleToggle = async () => {
    if (isPending) {
      return;
    }

    setIsPending(true);
    try {
      if (isDpsMeterRunning) {
        await invoke("stop_dps_meter");
        await invoke("set_dps_manual_hidden", { hidden: true });
        setIsDpsMeterRunning(false);
        setStartedAt(null);
        setElapsedSeconds(0);
        clearStartedAt();
        hideDpsWindows();
      } else {
        await invoke("start_dps_meter");
        await invoke("set_dps_manual_hidden", { hidden: false });
        await showDpsWindows();

        const nextStartedAt = Date.now();
        setIsDpsMeterRunning(true);
        setStartedAt(nextStartedAt);
        persistStartedAt(nextStartedAt);

        if (autoCloseMain) {
          await invoke("show_system_notification", {
            title: "NOIA2",
            body: "水表已经运行，请切换至游戏内窗口查看",
          });
          const appWindow = getCurrentWebviewWindow();
          await appWindow.close();
        }
      }
    } catch (error) {
      console.error("toggle dps meter failed:", error);
      toast.error("水表状态切换失败");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={handleToggle}
      className={cn(
        "flex h-[54px] w-[260px] items-center justify-center gap-3 rounded-r-md px-4 shadow-xl transition disabled:pointer-events-none disabled:opacity-70",
        isDpsMeterRunning
          ? "bg-red-500/70 text-white hover:bg-red-400/80"
          : "bg-white/90 text-neutral-800 hover:bg-white"
      )}
    >
      {isDpsMeterRunning ? (
        <Square size={24} fill="currentColor" strokeWidth={1.5} />
      ) : (
        <Play size={24} fill="currentColor" strokeWidth={1.5} className="ml-0.5" />
      )}
      <span className="truncate text-[22px] font-bold tracking-widest">
        {isPending ? "正在关闭..." : isDpsMeterRunning ? elapsedText : "启动水表"}
      </span>
    </button>
  );
}
