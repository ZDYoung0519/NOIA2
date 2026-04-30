import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

import { TitleBar } from "@/components/title-bar";
import { DpsDetailContent } from "@/components/dps/dps-detail-content";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getServerShortName } from "@/lib/aion2/servers";
import { hideWindow } from "@/lib/window";
import { DpsDetailPayload } from "@/types/aion2dps";

const hexToRgba = (hex: string, alphaPercent: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex =
    safeHex.length === 3
      ? safeHex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : safeHex;
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${Math.min(100, Math.max(0, alphaPercent)) / 100})`;
};

export default function DpsDetailPage() {
  const { settings } = useAppSettings();
  const { t } = useAppTranslation();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [payload, setPayload] = useState<DpsDetailPayload | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      const unlistenUpdate = await listen<DpsDetailPayload>("dps-detail-update", (event) => {
        if (!mounted) {
          return;
        }
        setPayload(event.payload);
      });

      const unlistenClear = await listen("dps-detail-clear", () => {
        if (!mounted) {
          return;
        }
        setPayload(null);
      });

      await emit("dps-detail-request");

      return () => {
        unlistenUpdate();
        unlistenClear();
      };
    };

    const cleanupPromise = setup();
    return () => {
      mounted = false;
      void cleanupPromise.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    const unlistenClose = appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await emit("dps-detail-window-closed");
      await hideWindow("dps_detail", 10_000);
    });

    return () => {
      void unlistenClose.then((fn) => fn());
    };
  }, []);

  const resizeWindow = useCallback(async () => {
    if (!contentRef.current) {
      return;
    }

    try {
      const [currentWidth] = await invoke<[number, number]>("get_window_size", {
        label: "dps_detail",
      });
      const nextHeight = Math.max(
        180,
        Math.min(1400, Math.ceil(contentRef.current.scrollHeight + 2))
      );

      await invoke("resize_window", {
        label: "dps_detail",
        width: currentWidth,
        height: nextHeight,
      });
    } catch (error) {
      console.error("resize dps detail failed:", error);
    }
  }, []);

  useEffect(() => {
    if (resizeTimerRef.current !== null) {
      window.clearTimeout(resizeTimerRef.current);
    }

    resizeTimerRef.current = window.setTimeout(() => {
      resizeTimerRef.current = null;
      window.requestAnimationFrame(() => {
        void resizeWindow();
      });
    }, 60);

    return () => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [payload, resizeWindow]);

  const shellBackground = hexToRgba(dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity);
  const titleBarBackground = shellBackground;
  const panelBackground = shellBackground;
  const actorInfo = payload
    ? (payload.combatInfos.actorInfos?.[String(payload.actorId)] ?? null)
    : null;
  const actorName = actorInfo?.actorName ?? "Unknown";
  const actorClass = actorInfo?.actorClass ?? "";
  const actorServerName = actorInfo?.actorServerId
    ? getServerShortName(Number(actorInfo.actorServerId))
    : "--";
  const actorIcon = actorClass ? `images/class/${actorClass.toLowerCase()}.webp` : "icon.png";

  return (
    <div
      className="flex w-screen flex-col overflow-hidden rounded-lg border border-white/10 text-slate-100"
      style={{ backgroundColor: shellBackground }}
      ref={contentRef}
    >
      <TitleBar
        title=""
        showMaximize={false}
        leftActions={
          <div className="flex min-w-0 items-center gap-2" data-tauri-drag-region>
            <img
              src={actorIcon}
              alt={actorClass || "actor"}
              className="h-6 w-6 rounded object-cover"
              onError={(event) => {
                (event.target as HTMLImageElement).src = "icon.png";
              }}
            />
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <span className="truncate text-xs font-semibold tracking-[0.18em] text-slate-100 uppercase">
                {actorName}
              </span>
              <span className="text-xs text-slate-400">[{actorServerName}]</span>
            </div>
          </div>
        }
        rightActions={
          <div className="mr-1 rounded-full border border-white/10 bg-white/5 px-2 py-1 text-xs font-semibold tracking-[0.18em] text-slate-300 uppercase">
            {payload?.mode === "history" ? t("dps.detail.modeHistory") : t("dps.detail.modeLive")}
          </div>
        }
        className="border-white/10"
        style={{ backgroundColor: titleBarBackground }}
      />

      <div
        className="flex w-full flex-col gap-2 self-start bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_32%)] p-2"
        style={{ zoom: 1 }}
      >
        <div className="rounded-lg p-0" style={{ backgroundColor: panelBackground }}>
          <DpsDetailContent payload={payload} />
        </div>
      </div>
    </div>
  );
}
