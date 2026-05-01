import { useState, useRef, useEffect, useMemo, memo } from "react";
import { MemorySnapshot } from "@/types/aion2dps";
import { listen } from "@tauri-apps/api/event";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";

export default function DpsPingPage() {
  const [memorySnapshot, setMemorySnapshot] = useState<MemorySnapshot | null>(null);
  const lastMemorySignatureRef = useRef<string | null>(null);
  const unlistenMemoryRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      try {
        // 收听 dps-memory, 更新内存占用
        unlistenMemoryRef.current = await listen<MemorySnapshot>("dps-memory", (event) => {
          if (!mounted) {
            return;
          }

          const nextMemory = event.payload;
          const nextSignature = JSON.stringify({
            cpuPercent: nextMemory.cpuPercent,
            rssMb: nextMemory.rssMb,
            capPort: nextMemory.capPort,
            pingMs: nextMemory.pingMs,
            mainActorName: nextMemory.mainActorName,
            packetSizes: nextMemory.packetSizes,
          });

          if (lastMemorySignatureRef.current === nextSignature) {
            return;
          }

          lastMemorySignatureRef.current = nextSignature;
          setMemorySnapshot(nextMemory);
        });
      } catch (error) {
        console.error("setup dps page listeners failed:", error);
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

  const footerData = useMemo(() => {
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
    const pingValue =
      typeof pingMs === "number" && Number.isFinite(pingMs) ? `${Math.round(pingMs)} ms` : "--";

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
      pingActive:
        typeof memorySnapshot?.pingMs === "number" && Number.isFinite(memorySnapshot.pingMs),
      pingTone:
        typeof memorySnapshot?.pingMs !== "number" || !Number.isFinite(memorySnapshot.pingMs)
          ? "text-white/60"
          : memorySnapshot.pingMs < 60
            ? "text-green-400"
            : memorySnapshot.pingMs < 120
              ? "text-yellow-400"
              : "text-rose-400",
    };
  }, [memorySnapshot]);

  type FooterData = {
    cpu: string;
    ram: string;
    ping: string;
    packetTotalKb: string;
    packetTooltipLines: string[];
    packetPortLines: Array<{ key: string; value: string; isCombatPort: boolean }>;
    combatPort: string | null;
    mainActorName: string;
    pingActive: boolean;
    pingTone: string;
  };

  type BottomStatusBarProps = {
    footerData: FooterData;
    maskNicknames?: boolean;
  };

  const MemoizedBottomStatusBar = memo(function BottomStatusBar({
    footerData,
  }: BottomStatusBarProps) {
    return (
      <div className="flex h-5 items-center justify-end gap-1 px-2 py-0 text-[11px] text-slate-300">
        {/* <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
          <div className="flex items-center gap-1">
            <Cpu className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs text-slate-200 select-none">{footerData.cpu}</span>
          </div>

          <div className="flex items-center gap-1">
            <Database className="h-3.5 w-3.5 text-slate-500" />
            <span className="text-xs text-slate-200 select-none">{footerData.ram}</span>
          </div>

          <div className="flex items-center gap-1">
            <Package className="h-3.5 w-3.5 text-slate-500" />
            <button type="button" className="cursor-help text-xs text-slate-200 select-none">
              {footerData.packetTotalKb}
            </button>
          </div>
        </div> */}

        <div className="flex flex-row gap-2">
          {footerData.pingActive ? (
            <div className={cn("flex items-center gap-1", footerData.pingTone)}>
              <Wifi className="h-4 w-4" />
              <span className="text-stroke-2 text-stroke-black text-sm">{footerData.ping}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-white/60">
              <WifiOff className="h-4 w-4" />
              <span className="text-sm select-none">--</span>
            </div>
          )}
        </div>
      </div>
    );
  });

  return (
    <div className="flex h-20 w-25 flex-row justify-start gap-0">
      <MemoizedBottomStatusBar footerData={footerData} />
    </div>
  );
}
