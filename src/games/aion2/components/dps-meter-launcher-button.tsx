import { useEffect, useMemo, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Play, Square } from "lucide-react";
import { toast } from "sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useSettings } from "@/hooks/use-settings";

import { cn } from "@/lib/utils";

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
  const { t } = useAppTranslation();
  const { config } = useSettings();
  const [isDpsMeterRunning, setIsDpsMeterRunning] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<"start" | "stop" | "show" | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const autoCloseMain = config.aion2.autoCloseMain;

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
        setPendingAction("stop");
        setIsDpsMeterRunning(false);
        setStartedAt(null);
        setElapsedSeconds(0);
        clearStartedAt();
        await invoke("destroy_dps_overlay");
      } else {
        setPendingAction("start");
        await invoke("create_dps_overlay");
        const nextStartedAt = Date.now();
        setIsDpsMeterRunning(true);
        setStartedAt(nextStartedAt);
        persistStartedAt(nextStartedAt);

        if (autoCloseMain) {
          await invoke("show_system_notification", {
            title: "NoiA2",
            body: t("aion2Home.meterRunningNotification"),
          });
          const appWindow = getCurrentWebviewWindow();
          await appWindow.close();
        }
      }
    } catch (error) {
      console.error("toggle dps meter failed:", error);
      toast.error(t("aion2Home.meterToggleFailed"));
    } finally {
      setPendingAction(null);
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
        {isPending
          ? pendingAction === "stop"
            ? t("aion2Home.stopping")
            : pendingAction === "show"
              ? t("aion2Home.stopping")
              : t("aion2Home.starting")
          : isDpsMeterRunning
            ? elapsedText
            : t("aion2Home.startMeter")}
      </span>
    </button>
  );
}
