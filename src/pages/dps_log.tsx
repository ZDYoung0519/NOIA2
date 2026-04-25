import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Package, RotateCcw, Search } from "lucide-react";

import { TitleBar } from "@/components/title-bar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAppSettings } from "@/hooks/use-app-settings";
import { cn } from "@/lib/utils";
import { MemorySnapshot } from "@/types/aion2dps";

type DpsLogEvent = {
  level: string;
  message: string;
  line: string;
  timestamp: number;
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
  const alpha = Math.min(100, Math.max(0, alphaPercent)) / 100;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const formatLocalLogTime = (timestamp: number) => {
  if (!Number.isFinite(timestamp)) {
    return "--:--:--";
  }

  return new Date(timestamp * 1000).toLocaleTimeString();
};

export default function DpsLogPage() {
  const { settings } = useAppSettings();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [lines, setLines] = useState<DpsLogEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [memorySnapshot, setMemorySnapshot] = useState<MemorySnapshot | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    let unlisten: null | (() => void) = null;
    let unlistenMemory: null | (() => void) = null;

    const setup = async () => {
      unlisten = await listen<DpsLogEvent>("dps-logger", (event) => {
        if (!mounted) {
          return;
        }

        setLines((current) => {
          const next = [...current, event.payload];
          return next.slice(-300);
        });
      });

      unlistenMemory = await listen<MemorySnapshot>("dps-memory", (event) => {
        if (!mounted) {
          return;
        }

        setMemorySnapshot(event.payload);
      });
    };

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
      unlistenMemory?.();
    };
  }, []);

  const filteredLines = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return lines;
    }

    return lines.filter((entry) => {
      const normalizedLine = entry.line.toLowerCase();
      const normalizedMessage = entry.message.toLowerCase();
      const normalizedLevel = entry.level.toLowerCase();
      return (
        normalizedLine.includes(normalizedQuery) ||
        normalizedMessage.includes(normalizedQuery) ||
        normalizedLevel.includes(normalizedQuery)
      );
    });
  }, [lines, searchQuery]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [filteredLines]);

  const shellBackground = useMemo(
    () => hexToRgba(dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity),
    [dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity]
  );
  const titleBarBackground = shellBackground;
  const panelBackground = shellBackground;
  const footerBackground = shellBackground;
  const packetEntries = Object.entries(memorySnapshot?.packetSizes ?? {});
  const totalPacketSize = packetEntries.reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const portPacketEntries = packetEntries.filter(([key]) => /^\d+-\d+$/.test(key));
  const otherPacketEntries = packetEntries.filter(([key]) => !/^\d+-\d+$/.test(key));
  const combatPort = memorySnapshot?.capPort ?? null;
  const packetPortLines = portPacketEntries.map(([key, value]) => ({
    key,
    value: `${(Number(value) / 1000).toFixed(2)}k`,
    isCombatPort: key === combatPort,
  }));
  const otherPacketLines = otherPacketEntries.map(([key, value]) => ({
    key,
    value: `${(Number(value) / 1000).toFixed(2)}k`,
  }));
  const handleClearLogs = () => {
    setLines([]);
  };

  return (
    <div
      className="flex h-screen w-screen flex-col overflow-hidden rounded-lg border border-white/10 text-slate-100"
      style={{ backgroundColor: shellBackground }}
    >
      <TitleBar
        title=""
        showMaximize={false}
        leftActions={
          <div className="flex min-w-0 items-center gap-2" data-tauri-drag-region>
            <div className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">
              <span className="text-xs font-semibold tracking-[0.18em] text-slate-100 uppercase">
                DPS Log
              </span>
            </div>
            <div className="relative w-52 min-w-0" data-tauri-drag-region="false">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search logs"
                className="h-7 border-white/10 bg-white/5 pl-8 text-xs text-slate-100 placeholder:text-slate-400 focus-visible:border-white/20 focus-visible:ring-white/10"
              />
            </div>
            <button
              type="button"
              title="Clear logs"
              onClick={handleClearLogs}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        }
        className="border-white/10"
        style={{ backgroundColor: titleBarBackground }}
      />

      <div
        ref={viewportRef}
        className="flex-1 overflow-y-auto p-2 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/25 [&::-webkit-scrollbar-track]:bg-transparent"
        style={{ backgroundColor: panelBackground, zoom: 1 }}
      >
        <div className="space-y-1 font-mono text-xs">
          {filteredLines.length > 0 ? (
            filteredLines.map((entry, index) => (
              <div
                key={`${entry.timestamp}-${index}`}
                className="rounded border border-white/8 bg-black/10 px-2 py-1 text-slate-200"
              >
                <span
                  className={
                    entry.level === "ERROR"
                      ? "text-rose-300"
                      : entry.level === "DEBUG"
                        ? "text-cyan-300"
                        : "text-emerald-300"
                  }
                >
                  [{formatLocalLogTime(entry.timestamp)}] {entry.line.replace(/^\[[^\]]+\]\s*/, "")}
                </span>
              </div>
            ))
          ) : lines.length > 0 ? (
            <div className="flex min-h-24 items-center justify-center rounded border border-dashed border-white/10 bg-white/[0.03] text-xs text-slate-400">
              No logs matched "{searchQuery}"
            </div>
          ) : (
            <div className="flex min-h-24 items-center justify-center rounded border border-dashed border-white/10 bg-white/[0.03] text-xs text-slate-400">
              Waiting for log output
            </div>
          )}
        </div>
      </div>

      <div
        className="flex items-center justify-between gap-2 border-t border-white/10 px-2 py-1 text-[11px] text-slate-300"
        style={{ backgroundColor: footerBackground }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Package className="h-3 w-3 text-slate-500" />
          <span className="text-xs text-slate-200 select-none">
            {totalPacketSize > 0 ? `${(totalPacketSize / 1000).toFixed(1)}k` : "0k"}
          </span>
          <span className="text-xs text-slate-400 select-none">
            {combatPort ? `combat_port ${combatPort}` : "combat_port --"}
          </span>
          {otherPacketLines.map((entry) => (
            <span
              key={entry.key}
              className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-slate-200"
            >
              <span className="font-mono text-[11px]">{entry.key}</span>
              <span className="font-medium">{entry.value}</span>
            </span>
          ))}
        </div>

        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {packetPortLines.length > 0 ? (
            packetPortLines.map((entry) => (
              <span
                key={entry.key}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1",
                  entry.isCombatPort
                    ? "bg-cyan-500/15 text-cyan-100"
                    : "bg-white/5 text-slate-200"
                )}
              >
                <span className="font-mono text-[11px]">{entry.key}</span>
                <span className="font-medium">{entry.value}</span>
                {entry.isCombatPort ? (
                  <Badge
                    variant="secondary"
                    className="border-cyan-300/30 bg-cyan-400/15 text-cyan-100"
                  >
                    combat_port
                  </Badge>
                ) : null}
              </span>
            ))
          ) : (
            <span className="text-xs text-slate-500">No per-port buffers</span>
          )}
        </div>
      </div>
    </div>
  );
}
