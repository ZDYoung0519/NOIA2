import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useWebSocket, WebSocketMessage } from "./hooks/useWebSocket";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Swords,
  RotateCcw,
  HistoryIcon,
  ArrowLeft,
  Settings,
} from "lucide-react";

import { getCurrentWindow, Window, PhysicalSize } from "@tauri-apps/api/window";
import { useTranslation } from "react-i18next";
import { CombatStats, PlayerStats, CombatSummaryStats } from "./types";

import { TargetCarousel } from "./components/TargetCarousel";
import { useAppSettings } from "./hooks/useSettings";
import { SettingPanel } from "./components/SettingPanel";
import SkillList from "./components/SkillList";
import { MemoryStatsRow, MemoryStats } from "./components/MemoryStatsRow";

import { useCombatStats } from "./hooks/useCombatStats";
import { Aion2CombatHistory } from "@/lib/localStorageHistory";

const renderClassIcon = (className: string) => {
  const iconPath = `images/class/${className.toLowerCase()}.webp`;
  return (
    <div className="relative w-6 h-6 rounded overflow-hidden ring-1 ring-white/10">
      <img
        src={iconPath}
        alt={`${className} icon`}
        className="w-full h-full object-cover"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
};

const renderSkillIcon = (skill: number) => {
  const iconPath = `images/skills/${skill}.webp`;
  return (
    <div className="relative w-full h-full border border-white/10">
      <img
        src={iconPath}
        alt={`${skill} icon`}
        className="w-full h-full object-cover rounded"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toString();
};

const StatusDot = ({ active }: { active: boolean }) => (
  <div className="relative flex items-center justify-center w-2 h-2">
    <div
      className={`absolute inset-0 rounded-full ${active ? "bg-emerald-400" : "bg-rose-400"} animate-pulse opacity-75`}
    />
    <div
      className={`relative w-1.5 h-1.5 rounded-full ${active ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" : "bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.6)]"}`}
    />
  </div>
);

function DPSMeterPage() {
  const { t } = useTranslation(["aion2dps"]);

  const [combatStats, setCombatStats] = useState<CombatStats | null>(null);
  const [memoryData, setMemoryData] = useState<MemoryStats | null>(null);
  const [view, setView] = useState<string>("dps");
  const [currentTarget, setCurrentTarget] = useState<number | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<number | null>(null);

  const handleMessage = useCallback((msg: WebSocketMessage) => {
    if (msg.type === "dps:data") setCombatStats(msg.payload as CombatStats);
    else if (msg.type === "dps:memory") setMemoryData(msg.payload);
    else if (msg.type === "dps:summary") {
      const combatData = msg.payload as CombatStats;

      const targetList = Object.entries(
        combatData.overview_stats_by_target,
      ).map(([id, stats]) => {
        const start = combatData.target_start_time?.[Number(id)];
        const last = combatData.target_last_time?.[Number(id)];
        const durationMs = last && start ? last - start : 0;
        const durationSec = durationMs / 1000;
        const dps = durationSec > 0 ? stats.total_damage / durationSec : 0;
        const mobCode = combatData.mob_code[Number(id)];

        return {
          id: Number(id),
          mobCode: Number(mobCode),
          total_damage: stats.total_damage,
          duration: durationMs,
          dps: Math.round(dps * 100) / 100,
          player_stats: combatData.overview_stats_by_target_player[Number(id)],
        };
      });

      // 保留mob，并且受到伤害大于500000
      const filteredTargetList = targetList.filter(
        (tgt) => tgt.mobCode != null && tgt.total_damage > 500000,
      );

      if (filteredTargetList.length <= 0) return null;

      const combatSummary = {
        id: crypto.randomUUID(),

        data: msg.payload,
        created_at: Date.now().toLocaleString(),
      } as CombatSummaryStats;

      Aion2CombatHistory.updateOne(combatSummary);
    }
  }, []);

  const { isConnected, send } = useWebSocket({
    url: "ws://localhost:51985",
    onMessage: handleMessage,
  });

  const handleReset = useCallback(() => {
    console.log(getCurrentWindow().label);
    send({ type: "command:reset" });
    setView("dps");
    setCurrentTarget(null);
    setCurrentPlayer(null);
  }, [send]);

  const { settings, saveSettings } = useAppSettings(handleReset);

  const {
    currentTargetDamage,
    actual_running_time,
    playerStatsArray,
    maxDamagePlayer,
    nicknameMap,
    targetList,
    mainPlayerName,
    curPlayerTargetDetailedSkillsArray,
    actorClassMap,
    actorSkillSlots,
    parsedSkillCodeMap,
    mobCodeMap,
    auto_target,
  } = useCombatStats({
    combatStats,
    view,
    currentPlayer,
    currentTarget,
    settings,
  });

  useMemo(() => {
    if (settings.autoTarget) setCurrentTarget(auto_target);
  }, [auto_target]);

  // 窗口高度管理
  const contentRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<Window | null>(null);
  const lastHeightRef = useRef<number>(0);
  const updateWindowHeight = useCallback(async () => {
    if (!contentRef.current || !windowRef.current) return;
    const TITLEBAR_HEIGHT = 68; // 8px + 9px 两个 header 的高度
    const PADDING = 16; // 上下 padding 总和
    const MIN_HEIGHT = 100;
    const MAX_HEIGHT = 2000;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const contentHeight = Math.floor(contentRef.current.scrollHeight * 1.1);
    const newHeight = Math.max(
      MIN_HEIGHT,
      Math.min(MAX_HEIGHT, contentHeight + TITLEBAR_HEIGHT + PADDING),
    );
    if (Math.abs(newHeight - lastHeightRef.current) > 5) {
      lastHeightRef.current = newHeight;
      await windowRef.current.setSize(new PhysicalSize(400, newHeight));
      console.log("窗口高度已更新:", newHeight, "内容高度:", contentHeight);
    }
  }, []);

  // 初始化窗口引用并设置圆角
  useEffect(() => {
    const initWindow = async () => {
      const win = getCurrentWindow();
      windowRef.current = win;
    };
    initWindow();
  }, []);

  // 当数据变化时更新高度
  useEffect(() => {
    updateWindowHeight();
  }, [combatStats, view, currentTarget, currentPlayer, updateWindowHeight]);

  const handleClose = useCallback(async () => {
    await new Promise((r) => setTimeout(r, 10));
    send({ type: "command:quit" });
    await new Promise((r) => setTimeout(r, 10));
    if (windowRef.current) await windowRef.current.hide();
  }, [send]);

  const handleStartClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    await invoke<string>("start_packet_server");
  };

  useEffect(() => {
    let unlisten: () => void;
    listen("app-exit", (event) => {
      console.log("收到退出事件，执行清理", event.payload);
      handleClose();
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  const renderPlayerDpsRow = (
    player: PlayerStats,
    index: number,
    totalDamage: number,
    maxDamagePlayer: number,
    duration: number,
    nicknameMap: Record<number, string>,
    actorClassMap: Record<number, string>,
    mobCodeMap: Record<number, number>,
    onClick: () => void,
  ) => {
    if (player.total_damage <= 0) return;
    const dps = duration > 0 ? player.total_damage / duration : 0;
    const percentage =
      totalDamage > 0 ? (player.total_damage / totalDamage) * 100 : 0;
    const fillPercent =
      maxDamagePlayer > 0 ? (player.total_damage / maxDamagePlayer) * 100 : 0;
    const nickName = nicknameMap[player.playerId];
    const isMainPlayer = nickName === mainPlayerName;
    const displayName = nickName ?? `Unkonwn(${player.playerId})`;
    const actorClass =
      actorClassMap[player.playerId]?.toLowerCase() ?? "unknown";

    const isMob = mobCodeMap.hasOwnProperty(player.playerId);

    // 使用设置中的颜色
    const barColor = isMainPlayer
      ? settings.mainPlayerColor
      : settings.otherPlayerColor;

    return (
      <div
        onClick={onClick}
        key={`${player.playerId}-${index}`}
        className="group relative flex items-center h-7 px-2 rounded cursor-pointer overflow-hidden transition-all duration-200 hover:bg-white/5"
      >
        <div
          className="absolute left-0 top-0 bottom-0 transition-all duration-500"
          style={{
            width: `${fillPercent}%`,
            background: barColor,
          }}
        />

        <div className="relative z-10 w-4 text-[10px] font-mono text-white/30 text-center">
          {index + 1}
        </div>

        <div className="relative z-10 ml-1">{renderClassIcon(actorClass)}</div>

        <div className="relative z-10 flex-1 min-w-0 ml-2 flex items-baseline gap-1.5">
          <span
            className={`text-xs font-medium truncate ${isMainPlayer ? "text-indigo-200" : "text-white/90"}`}
          >
            {isMob ? "[mod]" : ""}
            {displayName} ({player.playerId})
          </span>
          {/* <span className="text-[10px] text-white/30">{player.counts}次</span> */}
        </div>

        <div className="relative z-10 flex items-baseline gap-3 text-xs font-mono">
          <span className="text-white/80 tabular-nums">
            {formatNumber(player.total_damage)}
          </span>
          <span className="text-amber-300/80 tabular-nums">
            {formatNumber(Math.floor(dps))}
            <span className="text-[9px] text-amber-300/40 ml-0.5">/s</span>
          </span>
          <span className="text-[10px] text-white/30 w-10 text-right tabular-nums">
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  };

  // 计算背景样式
  const bgOpacity = settings.bgOpacity / 100; // 0-1

  return (
    <div
      className="fixed inset-0 backdrop-blur-lg rounded-lg"
      style={{ backgroundColor: `rgba(0, 0, 0, ${bgOpacity})` }}
    >
      <div className="w-full h-full flex flex-col shadow-2xl">
        <div
          className="h-8 px-2 flex items-center justify-between border-b border-white/5"
          data-tauri-drag-region
          style={{ borderRadius: "12px 12px 0 0" }}
        >
          <div className="flex items-center gap-2">
            <StatusDot active={isConnected} />
            <Swords className="w-3.5 h-3.5 text-indigo-300" />
            <span
              className="text-xs font-medium text-white/80 tracking-tight select-none"
              data-tauri-drag-region
            >
              {mainPlayerName}
            </span>
            {!isConnected && (
              <button
                onClick={handleStartClick}
                className="ml-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] text-white/60 transition-colors"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                <RotateCcw className="w-2.5 h-2.5" />
                启动
              </button>
            )}
          </div>

          <div
            className="flex items-center gap-0.5"
            style={{ WebkitAppRegion: "no-drag" } as any}
          >
            <button
              onClick={() => setView("settings")}
              className={`flex items-center gap-1 px-1.5 py-1 rounded transition-colors ${
                view === "settings"
                  ? "bg-white/20 text-white/90"
                  : "hover:bg-white/10 text-white/50 hover:text-white/80"
              }`}
            >
              <Settings className="w-3 h-3" />
              <span className="text-[10px]">设置</span>
            </button>

            <button className="flex items-center gap-1 px-1.5 py-1 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors">
              <HistoryIcon className="w-3 h-3" />
              <span className="text-[10px]">历史</span>
            </button>

            <button
              onClick={handleClose}
              className="p-1.5 rounded hover:bg-rose-500/20 text-white/50 hover:text-rose-300 transition-colors"
              style={{ WebkitAppRegion: "no-drag" } as any}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="h-9 px-0 flex items-center gap-2 bg-white/[0.02] border-b border-white/5">
          {view !== "dps" && (
            <button
              onClick={() => setView("dps")}
              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          )}

          {view === "dps" && (
            <button
              onClick={handleReset}
              className="p-1.5 rounded hover:bg-white/10 text-white/50 hover:text-white/80 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
          <div className="flex-1 flex items-center justify-between">
            <div className="text-xs font-medium text-white/70 truncate max-w-[200px] select-none">
              Time: {actual_running_time.toFixed(0)}s | Dmg:{" "}
              {formatNumber(currentTargetDamage)}
            </div>

            <TargetCarousel
              targets={targetList}
              nicknameMap={nicknameMap}
              currentTarget={currentTarget}
              onChange={setCurrentTarget}
            />
          </div>
        </div>

        <div
          ref={contentRef}
          className="content p-0 gap-0"
          style={{
            overflow: "visible",
          }}
        >
          {/* 设置面板 - 使用分离的组件 */}
          {view === "settings" && (
            <SettingPanel
              settings={settings}
              saveSettings={saveSettings}
              onClose={() => setView("dps")}
            />
          )}

          {view === "dps" && (
            <div className="p-0">
              {playerStatsArray.map((player, index) =>
                renderPlayerDpsRow(
                  player,
                  index,
                  currentTargetDamage,
                  maxDamagePlayer,
                  actual_running_time,
                  nicknameMap,
                  actorClassMap,
                  mobCodeMap,
                  () => {
                    setView("skill");
                    setCurrentPlayer(player.playerId);
                  },
                ),
              )}
            </div>
          )}

          {view === "skill" && (
            <SkillList
              curPlayerTargetDetailedSkillsArray={
                curPlayerTargetDetailedSkillsArray
              }
              curPlayerSkillSlots={
                currentPlayer ? actorSkillSlots[currentPlayer] : {}
              }
              // duration={running_time}
              t={t}
              renderSkillIcon={renderSkillIcon}
              formatNumber={formatNumber}
              parsedSkillCodeMap={parsedSkillCodeMap}
            />
          )}

          {memoryData && settings.showMemory && (
            <MemoryStatsRow
              cpu_percent={memoryData.cpu_percent}
              rss={memoryData.rss}
              channel_size={memoryData.channel_size}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default DPSMeterPage;
