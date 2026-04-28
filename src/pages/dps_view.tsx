import { useEffect, useMemo, useState } from "react";
import { KdaRingCard, WinRateRingCard } from "@/components/ring-card";
import { supabase } from "@/lib/supabase/supabase";

type TargetMobStat = {
  mob_code: string;
  target_name: string;
  battle_count: number;
};

type StatByClassMobRow = {
  record_id: string;
  data: any;
  total_count: number;
};

type BattleRankItem = {
  recordId: string;
  actorName: string;
  actorClass: string;
  totalDamage: number;
  fightSeconds: number;
  dps: number;
};

const PAGE_SIZE = 20;

const ACTOR_CLASSES = [
  "ALL",
  "GLADIATOR",
  "TEMPLAR",
  "ASSASSIN",
  "RANGER",
  "SORCERER",
  "ELEMENTALIST",
  "CLERIC",
  "CHANTER",
];

const ACTOR_CLASS_NAME_MAP: Record<string, string> = {
  ALL: "全部",
  GLADIATOR: "剑星",
  TEMPLAR: "守护星",
  ASSASSIN: "杀星",
  RANGER: "弓星",
  SORCERER: "魔道星",
  ELEMENTALIST: "精灵星",
  CLERIC: "治愈星",
  CHANTER: "护法星",
};

function getClassName(actorClass: string) {
  return ACTOR_CLASS_NAME_MAP[actorClass] ?? actorClass;
}

function getMainActorId(data: any) {
  return String(data?.combatInfos?.mainActorId ?? "");
}

function getMainActorInfo(data: any, actorId: string) {
  return data?.combatInfos?.actorInfos?.[actorId] ?? null;
}

function getTargetInfo(data: any) {
  const targetId = String(data?.targetId ?? "");
  return data?.combatInfos?.targetInfos?.[targetId] ?? null;
}

function getTotalDamage(data: any, actorId: string) {
  const stat = data?.thisTargetAllPlayerStats?.[actorId];

  if (!stat) return 0;
  if (typeof stat === "number") return stat;

  return Number(stat.total_damage ?? stat.max_damage ?? 0);
}

function getFightSeconds(data: any, actorId: string) {
  const targetInfo = getTargetInfo(data);

  const start = Number(targetInfo?.targetStartTime?.[actorId] ?? 0);
  const end = Number(targetInfo?.targetLastTime?.[actorId] ?? 0);

  return start > 0 && end > start ? end - start : 0;
}

function buildBattleRanks(rows: StatByClassMobRow[]): BattleRankItem[] {
  return rows
    .map((row) => {
      const data = row.data;
      const actorId = getMainActorId(data);
      const actorInfo = getMainActorInfo(data, actorId);

      const totalDamage = getTotalDamage(data, actorId);
      const fightSeconds = getFightSeconds(data, actorId);
      const dps = fightSeconds > 0 ? totalDamage / fightSeconds : 0;

      return {
        recordId: row.record_id,
        actorName: actorInfo?.actorName ?? data?.combatInfos?.mainActorName ?? "-",
        actorClass: actorInfo?.actorClass ?? "-",
        totalDamage,
        fightSeconds,
        dps,
      };
    })
    .filter((item) => item.totalDamage > 0 && item.fightSeconds > 0)
    .sort((a, b) => b.dps - a.dps);
}

export default function DpsViewPage() {
  const [stats, setStats] = useState<TargetMobStat[]>([]);
  const [selectedMob, setSelectedMob] = useState<TargetMobStat | null>(null);
  const [selectedClass, setSelectedClass] = useState("ALL");
  const [battleRanks, setBattleRanks] = useState<BattleRankItem[]>([]);

  const [page, setPage] = useState(1);
  const [totalRankCount, setTotalRankCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [rankLoading, setRankLoading] = useState(false);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rankErrorMessage, setRankErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadTargetStats() {
      try {
        setLoading(true);
        setErrorMessage(null);

        const { data, error } = await supabase.rpc("get_dps_target_mob_stats");
        if (error) throw error;

        const list = (data ?? []) as TargetMobStat[];
        setStats(list);

        if (list.length > 0) {
          setSelectedMob(list[0]);
        }
      } catch (error) {
        console.error("获取目标统计失败:", error);
        setErrorMessage(error instanceof Error ? error.message : "获取目标统计失败");
      } finally {
        setLoading(false);
      }
    }

    loadTargetStats();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedMob, selectedClass]);

  useEffect(() => {
    if (!selectedMob?.mob_code || !selectedClass) return;

    async function loadBattleRanks() {
      try {
        setRankLoading(true);
        setRankErrorMessage(null);

        const { data, error } = await supabase.rpc("get_stat_by_class_mob", {
          p_mob_code: selectedMob?.mob_code,
          p_actor_class: selectedClass,
          p_limit: PAGE_SIZE,
          p_offset: (page - 1) * PAGE_SIZE,
        });

        if (error) throw error;

        const rows = (data ?? []) as StatByClassMobRow[];

        setBattleRanks(buildBattleRanks(rows));
        setTotalRankCount(Number(rows[0]?.total_count ?? 0));
      } catch (error) {
        console.error("获取排行失败:", error);
        setBattleRanks([]);
        setTotalRankCount(0);
        setRankErrorMessage(error instanceof Error ? error.message : "获取排行失败");
      } finally {
        setRankLoading(false);
      }
    }

    loadBattleRanks();
  }, [selectedMob, selectedClass, page]);

  const totalCount = useMemo(() => {
    return stats.reduce((sum, item) => sum + Number(item.battle_count), 0);
  }, [stats]);

  const selectedClassAvgDps = useMemo(() => {
    const totalDamage = battleRanks.reduce((sum, item) => sum + item.totalDamage, 0);
    const totalFightSeconds = battleRanks.reduce((sum, item) => sum + item.fightSeconds, 0);

    return totalFightSeconds > 0 ? totalDamage / totalFightSeconds : 0;
  }, [battleRanks]);

  const totalPages = Math.max(1, Math.ceil(totalRankCount / PAGE_SIZE));

  return (
    <section className="w-full space-y-6 px-6 py-4 text-white">
      {errorMessage ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {errorMessage}
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:justify-start">
          <KdaRingCard label="全部战斗" value={loading ? "..." : String(totalCount)} />

          {loading ? (
            <WinRateRingCard label="加载中" value="..." subValue="请稍候" />
          ) : stats.length > 0 ? (
            stats.map((item) => {
              const count = Number(item.battle_count);
              const percent = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
              const active = selectedMob?.mob_code === item.mob_code;

              return (
                <button
                  key={item.mob_code}
                  type="button"
                  onClick={() => setSelectedMob(item)}
                  className={[
                    "rounded-full transition",
                    active
                      ? "scale-105 ring-2 ring-[#d9a73a] ring-offset-2 ring-offset-[#171717]"
                      : "hover:scale-105",
                  ].join(" ")}
                >
                  <WinRateRingCard
                    label={item.target_name}
                    value={`${percent}%`}
                    subValue={`${count}场`}
                  />
                </button>
              );
            })
          ) : (
            <WinRateRingCard label="暂无数据" value="0%" subValue="0场" />
          )}
        </div>
      )}

      <div className="rounded-xl border border-white/10 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">战斗秒伤排行</h2>
            <p className="mt-1 text-sm text-white/50">
              当前目标：{selectedMob?.target_name ?? "-"} / 职业：
              {getClassName(selectedClass)}
            </p>

            <div className="mt-3 inline-flex items-baseline gap-2 rounded-lg border border-[#d9a73a]/30 bg-[#d9a73a]/10 px-3 py-2">
              <span className="text-sm text-white/50">当前页平均秒伤</span>
              <span className="text-xl font-black text-[#d9a73a]">
                {rankLoading ? "..." : Math.round(selectedClassAvgDps).toLocaleString()}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ACTOR_CLASSES.map((actorClass) => {
              const active = selectedClass === actorClass;
              return (
                <button
                  key={actorClass}
                  type="button"
                  onClick={() => setSelectedClass(actorClass)}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                    active
                      ? "border-[#d9a73a] bg-[#d9a73a]/15 text-[#d9a73a]"
                      : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {getClassName(actorClass)}
                </button>
              );
            })}
          </div>
        </div>

        {rankErrorMessage ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {rankErrorMessage}
          </div>
        ) : rankLoading ? (
          <div className="py-8 text-center text-sm text-white/50">排行加载中...</div>
        ) : battleRanks.length > 0 ? (
          <>
            <div className="overflow-hidden rounded-lg border border-white/10">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-white/5 text-white/60">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">排名</th>
                    <th className="px-4 py-3 text-left font-medium">玩家</th>
                    <th className="px-4 py-3 text-left font-medium">职业</th>
                    <th className="px-4 py-3 text-right font-medium">总伤害</th>
                    <th className="px-4 py-3 text-right font-medium">战斗时长</th>
                    <th className="px-4 py-3 text-right font-medium">秒伤</th>
                  </tr>
                </thead>

                <tbody>
                  {battleRanks.map((item, index) => (
                    <tr
                      key={item.recordId}
                      className="border-t border-white/10 hover:bg-white/[0.03]"
                    >
                      <td className="px-4 py-3 text-white/70">
                        #{(page - 1) * PAGE_SIZE + index + 1}
                      </td>
                      <td className="px-4 py-3 font-semibold text-white">{item.actorName}</td>
                      <td className="px-4 py-3 text-white/60">{getClassName(item.actorClass)}</td>
                      <td className="px-4 py-3 text-right text-white/80">
                        {Math.round(item.totalDamage).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-white/60">
                        {item.fightSeconds.toFixed(1)} 秒
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-[#d9a73a]">
                        {Math.round(item.dps).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
              <div>
                共 {totalRankCount.toLocaleString()} 条，当前第 {page} / {totalPages} 页
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1 || rankLoading}
                  onClick={() => setPage((old) => Math.max(1, old - 1))}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  上一页
                </button>

                <button
                  type="button"
                  disabled={page >= totalPages || rankLoading}
                  onClick={() => setPage((old) => Math.min(totalPages, old + 1))}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-semibold text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  下一页
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="py-8 text-center text-sm text-white/50">当前目标 + 职业暂无数据</div>
        )}
      </div>
    </section>
  );
}
