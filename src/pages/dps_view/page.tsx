import { invoke } from "@tauri-apps/api/core";
import { Aion2CombatHistory } from "@/lib/localStorageHistory";
import { CombatStats, CombatSummaryStats } from "../dps/types";
import { useEffect, useState } from "react";

import {
  Swords,
  Target,
  Users,
  Shield,
  Wand2,
  Zap,
  Sword,
  ChevronRight,
  Clock,
} from "lucide-react";

const classIconMap: Record<string, React.ElementType> = {
  GLADIATOR: Swords,
  TEMPLAR: Shield,
  RANGER: Target,
  ASSASSIN: Swords,
  SORCERER: Wand2,
  CLERIC: Shield,
  ELEMENTALIST: Wand2,
  CHANTER: Shield,
};

const classColorMap: Record<string, string> = {
  GLADIATOR: "from-red-500 to-orange-500",
  TEMPLAR: "from-blue-500 to-cyan-500",
  RANGER: "from-green-500 to-emerald-500",
  ASSASSIN: "from-purple-500 to-pink-500",
  SORCERER: "from-indigo-500 to-purple-500",
  CLERIC: "from-yellow-500 to-amber-500",
  ELEMENTALIST: "from-cyan-500 to-blue-500",
  CHANTER: "from-orange-500 to-red-500",
};

const getClassIcon = (className: string) => {
  const Icon = classIconMap[className.toUpperCase()];
  return Icon ? <Icon className="w-4 h-4" /> : <Users className="w-4 h-4" />;
};

const formatNumber = (num: number) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + "M";
  if (num >= 1000) return (num / 1000).toFixed(1) + "K";
  return num.toLocaleString();
};

const CombatProfileCard: React.FC<{
  combat: CombatSummaryStats;
  index: number;
}> = ({ combat, index }) => {
  // 当前选中的目标ID（-1表示所有目标）
  if (!combat) return;

  const [selectedTargetId, setSelectedTargetId] = useState<number>(0);

  const combatData = combat.data as CombatStats;
  // const overview_stats_by_target = combatData.overview_stats_by_target;

  const targetList = Object.entries(combatData.overview_stats_by_target).map(
    ([id, stats]) => {
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
    },
  );

  // 保留mob，并且受到伤害大于500000
  const validTargetList = targetList.filter(
    (tgt) => tgt.mobCode != null && tgt.total_damage > 500000,
  );

  const currentTarget = validTargetList[selectedTargetId];
  const currentTargetId = currentTarget.id;
  const currentTargetDamageByPlayer =
    combatData.overview_stats_by_target_player[currentTargetId];

  debugger;

  const currentTargetDamageByPlayerList = Object.entries(
    currentTargetDamageByPlayer,
  )
    .map(([key, value]) => ({
      id: Number(key), // 或者 key 已经是字符串，需要转换
      ...value,
    }))
    .filter((player) => player.total_damage > 1000)
    .sort((a, b) => b.total_damage - a.total_damage);

  const maxPlayerDamage = Math.max(
    ...currentTargetDamageByPlayerList.map((p) => p.total_damage),
    1,
  );

  const totalDamageSum = currentTargetDamageByPlayerList.reduce(
    (sum, e) => sum + e.total_damage,
    0,
  );

  debugger;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-slate-900/30 hover:border-purple-500/30 transition-all duration-300 hover:shadow-[0_0_30px_rgba(168,85,247,0.15)]">
      {/* 顶部渐变条 */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 via-blue-500 to-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />

      <div className="p-6">
        {/* 头部：副本名称 + 核心数据 */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white mb-1">
              战斗记录 #{String(index + 1).padStart(3, "0")}
            </h3>
            {/* <p className="text-sm text-slate-500 font-mono">
              {new Date().toLocaleDateString("zh-CN")} · {validPlayers.length}{" "}
              人小队
            </p> */}
          </div>

          {/* 核心指标卡片 */}
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-xs text-slate-500 mb-1 flex items-center justify-end gap-1">
                <Target className="w-3 h-3" />
                选中目标伤害
              </div>
              <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                {formatNumber(currentTarget.total_damage)}
              </div>
            </div>
            <div className="w-px bg-slate-800" />
            <div className="text-right">
              <div className="text-xs text-slate-500 mb-1 flex items-center justify-end gap-1">
                <Zap className="w-3 h-3" /> 目标 DPS
              </div>
              <div className="text-2xl font-bold text-white">
                {formatNumber(currentTarget.dps)}
              </div>
            </div>
          </div>
        </div>

        {/* 主体内容：左侧目标列表 + 右侧玩家伤害占比 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
              <Target className="w-4 h-4" />
              <span>选择目标</span>
              <span className="ml-auto text-xs text-slate-600">
                {validTargetList.length} 个
              </span>
            </div>

            <div className="space-y-2">
              {/* 单个目标列表 */}
              {validTargetList.map((target, index) => (
                <button
                  key={target.id}
                  onClick={() => setSelectedTargetId(index)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ${
                    selectedTargetId === index
                      ? "bg-purple-500/10 border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]"
                      : "bg-slate-950/30 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/50"
                  }`}
                >
                  <div
                    className={`p-2 rounded-md ${
                      selectedTargetId === index
                        ? "bg-gradient-to-br from-orange-500 to-red-500"
                        : "bg-slate-800"
                    }`}
                  >
                    <Sword
                      className={`w-4 h-4 ${selectedTargetId === index ? "text-white" : "text-slate-400"}`}
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <div
                      className={`text-sm font-medium ${selectedTargetId === index ? "text-white" : "text-slate-300"}`}
                    >
                      Mob {target.mobCode} (#{target.id})
                    </div>
                    <div className="text-xs text-slate-500 flex gap-2">
                      <span>{formatNumber(target.total_damage)}</span>
                      <span>·</span>
                      <span>{(target.duration / 1000).toFixed(1)}s</span>
                    </div>
                  </div>
                  {selectedTargetId === index && (
                    <ChevronRight className="w-4 h-4 text-purple-400" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 右侧：玩家对该目标的伤害占比 */}
          <div className="lg:col-span-8">
            <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
              <Users className="w-4 h-4" />
              <span>
                玩家伤害占比 ·
                {selectedTargetId === -1
                  ? "所有目标"
                  : `Target #${selectedTargetId}`}
              </span>
            </div>

            {currentTargetDamageByPlayerList.map((player, idx) => {
              const barWidth = (player.total_damage / maxPlayerDamage) * 100;
              const className = combatData.actor_class_map[player.id] || "";
              // if (!className) return;
              const gradientClass =
                classColorMap[className.toUpperCase()] ||
                "from-slate-500 to-slate-600";
              const playerName = combatData.nickname_map[player.id];

              return (
                <div key={player.id} className="group/player">
                  <div className="flex items-center gap-3 mb-1.5">
                    {/* 排名 */}
                    <span
                      className={`text-xs font-bold w-5 ${
                        idx === 0
                          ? "text-yellow-400"
                          : idx === 1
                            ? "text-slate-300"
                            : idx === 2
                              ? "text-orange-400"
                              : "text-slate-600"
                      }`}
                    >
                      #{idx + 1}
                    </span>

                    {/* 职业图标 */}
                    <div
                      className={`p-1 rounded bg-gradient-to-br ${gradientClass}`}
                    >
                      {getClassIcon(className)}
                    </div>

                    {/* 玩家名 */}
                    <span className="text-sm font-medium text-slate-200 w-24 truncate">
                      {playerName} (# {player.id})
                    </span>

                    {/* 伤害数值 */}
                    <span className="text-xs text-slate-400 w-16 text-right">
                      {formatNumber(player.total_damage)}
                    </span>

                    {/* 占比条背景容器 */}
                    <div className="flex-1 h-2 bg-slate-950 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${gradientClass} relative transition-all duration-500`}
                        style={{ width: `${Math.max(barWidth, 3)}%` }}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 animate-shimmer" />
                      </div>
                    </div>

                    {/* 百分比 */}
                    <span className="text-sm font-bold text-white w-12 text-right font-mono">
                      {((player.total_damage / totalDamageSum) * 100).toFixed(
                        1,
                      )}
                      %
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const CombatList: React.FC<{ combatStatsList: CombatSummaryStats[] }> = ({
  combatStatsList,
}) => {
  if (combatStatsList.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-900 mb-4">
          <Clock className="w-8 h-8 text-slate-600" />
        </div>
        <h3 className="text-lg font-medium text-slate-400 mb-2">
          暂无战斗记录
        </h3>
        <p className="text-sm text-slate-600">
          开始一场战斗后，数据将自动显示在这里
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {combatStatsList.map((combat, idx) => (
        <CombatProfileCard key={idx} combat={combat} index={idx} />
      ))}
    </div>
  );
};

export function DPSHistory() {
  const [combatHistory, setCombatHistory] = useState<CombatSummaryStats[]>([]);

  useEffect(() => {
    const localHistory = Aion2CombatHistory.get() as CombatSummaryStats[];
    setCombatHistory(localHistory);
  }, []);

  return (
    <div className="min-h-screen">
      {/* 头部区域 */}
      <div className="">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold text-white mb-1">
                战斗历史
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 ml-2">
                  记录
                </span>
              </h2>
              <p className="text-slate-500 text-sm">
                共 {combatHistory.length} 场战斗记录 ·
                只有超过100w的战斗才会被记录于此
              </p>
            </div>
            <div className="flex items-center gap-2 text-sm text-slate-500 gap-5">
              <button className="px-8 py-4 bg-slate-800/50 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group">
                清空记录
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <CombatList combatStatsList={combatHistory} />
      </div>
    </div>
  );
}
export default function DPSViewPage() {
  const [view, setView] = useState<string | null>("history");

  const handleOpenDPS = async () => {
    try {
      await invoke("show_window", { label: "dps" });
    } catch (err) {
      console.error("无法打开 DPS 窗口:", err);
    }
  };

  return (
    <>
      <section className="relative z-10 py-24">
        <div className="max-w-7xl mx-auto">
          <div className=" px-6 flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 space-y-6">
              <h2 className="text-4xl font-bold text-white leading-tight">
                数据可视化
                <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                  掌控战场每一秒
                </span>
              </h2>
              <p className="text-slate-400 text-lg leading-relaxed">
                NOIA2 采用了全新的 WebGL
                渲染引擎，将复杂的战斗日志转化为直观的动态图表。
                不仅记录伤害，更分析你的每一次走位与技能释放时机。
              </p>
              <ul className="space-y-4">
                {[
                  "NpCap低延迟数据抓取技术，自适应Dps、技能伤害统计",
                  "使用方法：点击“打开DPS统计”，点击弹窗上的“启动”，等待指示灯变绿",
                  "耐心等待后台抓包服务启动，尽量不要重复点击，退出程序前请先关闭DPS窗口",
                ].map((item, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-3 text-slate-300"
                  >
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Mock UI Window */}
            <div className="flex-1 w-full max-w-lg">
              <div className="relative rounded-xl bg-slate-950 border border-slate-800 shadow-2xl overflow-hidden group">
                {/* Window Header */}
                <div className="h-8 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                  <div className="ml-auto text-xs text-slate-600 font-mono">
                    NOIA2 Client v0.9.1
                  </div>
                </div>

                {/* Window Content (Mock) */}
                <div className="p-6 font-mono text-xs space-y-4">
                  <div className="flex justify-between items-end mb-6">
                    <div>
                      <div className="text-slate-500 mb-1">TARGET</div>
                      <div className="text-xl text-white font-bold">
                        Dragon Lord Beritra
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-slate-500 mb-1">DPS RANK</div>
                      <div className="text-xl text-green-400 font-bold">#1</div>
                    </div>
                  </div>

                  {/* Fake Chart Bars */}
                  <div className="space-y-2">
                    {[85, 62, 45, 30, 12].map((h, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-slate-500 w-8">{i + 1}.</span>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-purple-600 to-blue-500 rounded-full"
                            style={{ width: `${h}%`, opacity: 1 - i * 0.15 }}
                          />
                        </div>
                        <span className="text-slate-300 w-12 text-right">
                          {h}k
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800 flex gap-2">
                    <span className="px-2 py-1 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Skill Chain: 98%
                    </span>
                    <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      Crit Rate: 45%
                    </span>
                  </div>
                </div>

                {/* Hover Effect */}
                <div className="absolute inset-0 bg-gradient-to-tr from-purple-600/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </div>
            </div>
          </div>
          <div className="px-10 flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-12">
            <button
              className="px-8 py-4 bg-white text-slate-950 rounded-xl font-bold text-lg hover:bg-slate-200 transition-all hover:scale-105 active:scale-95 shadow-[0_0_20px_rgba(255,255,255,0.3)] flex items-center justify-center gap-2"
              onClick={handleOpenDPS}
            >
              打开DPS统计
            </button>
            <button
              onClick={() => setView("history")}
              className="px-8 py-4 bg-slate-800/50 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
            >
              查看战斗历史
            </button>

            <button
              onClick={() => setView("rank")}
              className="px-8 py-4 bg-slate-800/50 backdrop-blur-md border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-slate-800 transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-2 group"
            >
              DPS 排行榜
            </button>
          </div>
        </div>
      </section>
      {view == "history" && <DPSHistory />}
      {view == "rank" && <></>}
    </>
  );
}
