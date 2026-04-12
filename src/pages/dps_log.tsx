import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

import { TitleBar } from "@/components/title-bar";
import { useAppSettings } from "@/hooks/use-app-settings";

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

const darkenHex = (hex: string, amount: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex =
    safeHex.length === 3
      ? safeHex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : safeHex;

  const clamp = (value: number) => Math.max(0, Math.min(255, value));
  const r = clamp(parseInt(normalizedHex.slice(0, 2), 16) - amount);
  const g = clamp(parseInt(normalizedHex.slice(2, 4), 16) - amount);
  const b = clamp(parseInt(normalizedHex.slice(4, 6), 16) - amount);

  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b
    .toString(16)
    .padStart(2, "0")}`;
};

export default function DpsLogPage() {
  const { settings } = useAppSettings();
  const dpsAppearance = settings.appearance.dpsWindow;
  const [lines, setLines] = useState<DpsLogEvent[]>([]);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;
    let unlisten: null | (() => void) = null;

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
    };

    void setup();

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }
    viewport.scrollTop = viewport.scrollHeight;
  }, [lines]);

  const shellBackground = useMemo(
    () => hexToRgba(dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity),
    [dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity]
  );
  const titleBarBackground = useMemo(
    () =>
      hexToRgba(
        darkenHex(dpsAppearance.backgroundColor, 22),
        Math.min(100, dpsAppearance.backgroundOpacity + 18)
      ),
    [dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity]
  );
  const panelBackground = useMemo(
    () => hexToRgba(dpsAppearance.panelColor, dpsAppearance.panelOpacity),
    [dpsAppearance.panelColor, dpsAppearance.panelOpacity]
  );

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
          </div>
        }
        className="border-white/10"
        style={{ backgroundColor: titleBarBackground }}
      />

      <div
        ref={viewportRef}
        className="flex-1 overflow-y-auto p-2 [scrollbar-color:rgba(148,163,184,0.35)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400/25 [&::-webkit-scrollbar-track]:bg-transparent"
        style={{ backgroundColor: panelBackground, zoom: dpsAppearance.scaleFactor }}
      >
        <div className="space-y-1 font-mono text-xs">
          {lines.length > 0 ? (
            lines.map((entry, index) => (
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
                  {entry.line}
                </span>
              </div>
            ))
          ) : (
            <div className="flex min-h-24 items-center justify-center rounded border border-dashed border-white/10 bg-white/[0.03] text-xs text-slate-400">
              Waiting for log output
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
