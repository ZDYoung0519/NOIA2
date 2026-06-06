import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Minus, X } from "lucide-react";

import { DpsDetailContent } from "@/components/dps/dps-detail-content";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getServerShortName } from "@/lib/aion2/servers";
import { hideWindow } from "@/lib/window";
import type { CombatSnapshot, DpsDetailPayload } from "@/types/aion2dps";

type DpsDetailV2Mode = "live" | "history";

type DpsDetailV2Selection = {
  mode: DpsDetailV2Mode;
  targetId: number;
  playerId: number;
};

type DpsDetailV2OpenPayload = {
  selection: DpsDetailV2Selection;
  detailData: DpsDetailPayload | null;
};

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

function buildLivePayload(
  snapshot: CombatSnapshot | null,
  targetId: number | null,
  playerId: number | null
): DpsDetailPayload | null {
  if (!snapshot || targetId == null || playerId == null) {
    return null;
  }

  const playerStats =
    snapshot.byTargetPlayerStats?.[String(targetId)]?.[String(playerId)] ?? null;
  if (!playerStats) {
    return null;
  }

  return {
    mode: "live",
    actorId: playerId,
    targetId,
    combatInfos: snapshot.combatInfos,
    playerStats,
    playerSkillStats:
      snapshot.byTargetPlayerSkillStats?.[String(targetId)]?.[String(playerId)] ?? {},
  };
}

function DpsDetailTitleBar({
  actorIcon,
  actorName,
  actorServerName,
  modeLabel,
}: {
  actorIcon: string;
  actorName: string;
  actorServerName: string;
  modeLabel: string;
}) {
  const handleMinimize = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.minimize();
  };

  const handleClose = async () => {
    const appWindow = getCurrentWebviewWindow();
    await appWindow.close();
  };

  return (
    <div className="drag-region text-card-foreground relative z-20 flex h-12 shrink-0 items-center justify-between bg-background/90 px-3.5 select-none">
      <div className="flex min-w-0 items-center gap-2.5">
        <img
          src={actorIcon}
          alt={actorName}
          className="h-6 w-6 rounded object-cover"
          onError={(event) => {
            (event.target as HTMLImageElement).src = "icon.png";
          }}
        />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-semibold text-white/92">{actorName}</span>
          <span className="text-[11px] text-white/46">[{actorServerName}]</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-[11px] font-semibold tracking-[0.16em] text-white/72 uppercase">
          {modeLabel}
        </div>
        <button
          type="button"
          onClick={handleMinimize}
          className="no-drag-region flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/72 transition hover:bg-white/14 hover:text-white"
          aria-label="Minimize"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleClose}
          className="no-drag-region flex h-9 w-9 items-center justify-center rounded-full bg-white/8 text-white/72 transition hover:bg-rose-500/20 hover:text-rose-50"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function DpsDetailV2Page() {
  const { settings } = useAppSettings();
  const { t } = useAppTranslation();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [mode, setMode] = useState<DpsDetailV2Mode>("live");
  const [selectedTargetId, setSelectedTargetId] = useState<number | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<DpsDetailPayload | null>(null);
  const latestSnapshotRef = useRef<CombatSnapshot | null>(null);
  const lastValidLiveDetailRef = useRef<DpsDetailPayload | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const resizeTimerRef = useRef<number | null>(null);

  const rebuildLiveDetail = useCallback(
    (snapshot: CombatSnapshot | null, targetId: number | null, playerId: number | null) => {
      const next = buildLivePayload(snapshot, targetId, playerId);
      if (next) {
        lastValidLiveDetailRef.current = next;
        setDetailData(next);
        return;
      }

      setDetailData(lastValidLiveDetailRef.current);
    },
    []
  );

  useEffect(() => {
    let mounted = true;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      const unlistenOpen = await listen<DpsDetailV2OpenPayload>("dps-detail-v2-open", (event) => {
        if (!mounted) {
          return;
        }

        const { selection, detailData: seedDetailData } = event.payload;
        setMode(selection.mode);
        setSelectedTargetId(selection.targetId);
        setSelectedPlayerId(selection.playerId);

        if (selection.mode === "live") {
          if (seedDetailData) {
            lastValidLiveDetailRef.current = seedDetailData;
            setDetailData(seedDetailData);
          }
          rebuildLiveDetail(latestSnapshotRef.current, selection.targetId, selection.playerId);
        } else {
          setDetailData(seedDetailData);
        }
      });
      unlisteners.push(unlistenOpen);

      const unlistenSnapshot = await listen<CombatSnapshot>("dps-snapshot", (event) => {
        if (!mounted) {
          return;
        }

        latestSnapshotRef.current = event.payload;
        if (mode === "live") {
          rebuildLiveDetail(event.payload, selectedTargetId, selectedPlayerId);
        }
      });
      unlisteners.push(unlistenSnapshot);

      const unlistenClear = await listen("dps-detail-v2-clear", () => {
        if (!mounted) {
          return;
        }

        setSelectedTargetId(null);
        setSelectedPlayerId(null);
        lastValidLiveDetailRef.current = null;
        setDetailData(null);
      });
      unlisteners.push(unlistenClear);

      await emit("dps-detail-v2-request-selection");
    })();

    return () => {
      mounted = false;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [mode, rebuildLiveDetail, selectedPlayerId, selectedTargetId]);

  useEffect(() => {
    const appWindow = getCurrentWebviewWindow();
    const unlistenClose = appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await hideWindow("dps_detail_v2", 10_000);
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
        label: "dps_detail_v2",
      });
      const nextHeight = Math.max(
        180,
        Math.min(1400, Math.ceil(contentRef.current.scrollHeight + 2))
      );

      await invoke("resize_window", {
        label: "dps_detail_v2",
        width: currentWidth,
        height: nextHeight,
      });
    } catch (error) {
      console.error("resize dps detail v2 failed:", error);
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
  }, [detailData, resizeWindow]);

  const shellBackground = hexToRgba(dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity);
  const actorInfo =
    detailData && selectedPlayerId != null
      ? (detailData.combatInfos.actorInfos?.[String(selectedPlayerId)] ?? null)
      : null;
  const actorName = actorInfo?.actorName ?? "Unknown";
  const actorClass = actorInfo?.actorClass ?? "";
  const actorServerName = actorInfo?.actorServerId
    ? getServerShortName(Number(actorInfo.actorServerId))
    : "--";
  const actorIcon = actorClass
    ? dpsAppearance.classIconStyle === "default"
      ? `images/class/${actorClass.toLowerCase()}.webp`
      : `images/class/${actorClass.toLowerCase()}.png`
    : "icon.png";

  return (
    <div
      className="flex w-screen flex-col overflow-hidden rounded-lg border border-white/10 text-slate-100"
      style={{ backgroundColor: shellBackground }}
      ref={contentRef}
    >
      <DpsDetailTitleBar
        actorIcon={actorIcon}
        actorName={actorName}
        actorServerName={actorServerName}
        modeLabel={mode === "history" ? t("dps.detail.modeHistory") : t("dps.detail.modeLive")}
      />

      <div className="flex w-full flex-col gap-2 self-start bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.14),transparent_32%)] p-2">
        <div className="rounded-lg p-0" style={{ backgroundColor: shellBackground }}>
          <DpsDetailContent payload={detailData} />
        </div>
      </div>
    </div>
  );
}
