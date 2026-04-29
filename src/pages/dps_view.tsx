import { memo, useEffect, useMemo, useRef, useState } from "react";
import dungeons from "@/data/dungeons.json";
import { KdaRingCard, WinRateRingCard } from "@/components/ring-card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/supabase";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getLocalizedText, type LocalizedText } from "@/lib/i18n-data";

type TargetMobStat = {
  mob_code: string;
  target_name: string;
  battle_count: number;
  last_battle_at?: string | null;
};

type RankMobSourceRow = {
  target_mob_code: number | string | null;
  target_name: string | null;
  battle_ended_at?: string | null;
};

type StatByClassMobRow = {
  record_id: string;
  main_actor_name: string | null;
  main_actor_class: string | null;
  main_actor_damage: number | null;
  main_actor_battle_duration: number | null;
  main_actor_dps: number | null;
  party_total_damage: number | null;
  total_count: number;
};

type BattleRankItem = {
  recordId: string;
  actorName: string;
  actorClass: string;
  totalDamage: number;
  partyTotalDamage: number;
  fightSeconds: number;
  dps: number;
};

type DungeonDefinition = {
  dungeon_id: string;
  name: LocalizedText;
  difficulty: LocalizedText;
  boss_ids: number[];
};

type DungeonBossCard = {
  mobCode: string;
  stat?: TargetMobStat;
  battleCount: number;
  label: string;
};

type DungeonCard = DungeonDefinition & {
  bosses: DungeonBossCard[];
};

type DpsViewMode = "all" | "dungeon";

const PAGE_SIZE = 20;
const IS_DEV = import.meta.env.DEV;

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

function buildBattleRanks(rows: StatByClassMobRow[]): BattleRankItem[] {
  return rows
    .map((row) => ({
      recordId: row.record_id,
      actorName: row.main_actor_name ?? "-",
      actorClass: row.main_actor_class ?? "-",
      totalDamage: Number(row.main_actor_damage ?? 0),
      partyTotalDamage: Number(row.party_total_damage ?? 0),
      fightSeconds: Number(row.main_actor_battle_duration ?? 0),
      dps: Number(row.main_actor_dps ?? 0),
    }))
    .filter((item) => item.totalDamage > 0 && item.fightSeconds > 0)
    .sort((a, b) => b.dps - a.dps);
}

function getBossDisplayName(stat: TargetMobStat | undefined, mobCode: string) {
  return stat?.target_name ?? `Boss ${mobCode}`;
}

function normalizeTargetMobStats(rows: TargetMobStat[]): TargetMobStat[] {
  return rows.map((row) => ({
    mob_code: String(row.mob_code),
    target_name: row.target_name ?? `Boss ${String(row.mob_code)}`,
    battle_count: Number(row.battle_count ?? 0),
    last_battle_at: row.last_battle_at ?? null,
  }));
}

function buildTargetMobStatsFromRankRows(rows: RankMobSourceRow[]): TargetMobStat[] {
  const grouped = new Map<string, TargetMobStat>();

  for (const row of rows) {
    if (row.target_mob_code == null) {
      continue;
    }

    const mobCode = String(row.target_mob_code);
    const existing = grouped.get(mobCode);
    const battleEndedAt = row.battle_ended_at ?? null;

    if (!existing) {
      grouped.set(mobCode, {
        mob_code: mobCode,
        target_name: row.target_name ?? `Boss ${mobCode}`,
        battle_count: 1,
        last_battle_at: battleEndedAt,
      });
      continue;
    }

    existing.battle_count += 1;
    if (battleEndedAt && (!existing.last_battle_at || battleEndedAt > existing.last_battle_at)) {
      existing.last_battle_at = battleEndedAt;
    }
    if (!existing.target_name && row.target_name) {
      existing.target_name = row.target_name;
    }
  }

  return [...grouped.values()].sort((a, b) => {
    const countDiff = b.battle_count - a.battle_count;
    if (countDiff !== 0) {
      return countDiff;
    }

    const aTime = a.last_battle_at ?? "";
    const bTime = b.last_battle_at ?? "";
    if (aTime === bTime) {
      return a.mob_code.localeCompare(b.mob_code);
    }
    return bTime.localeCompare(aTime);
  });
}

const BossCard = memo(function BossCard({
  mobCode,
  label,
  count,
  active,
  onSelect,
}: {
  mobCode: string;
  label: string;
  count: number;
  active: boolean;
  onSelect: () => void;
}) {
  const card = (
    <button
      type="button"
      onClick={onSelect}
      title={IS_DEV ? mobCode : undefined}
      className={[
        "rounded-full transition",
        active
          ? "scale-105 ring-2 ring-[#d9a73a] ring-offset-2 ring-offset-[#171717]"
          : "hover:scale-105",
      ].join(" ")}
    >
      <WinRateRingCard label={label} value={`${count}场`} />
    </button>
  );

  if (!IS_DEV) {
    return card;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent>
        <p>{mobCode}</p>
      </TooltipContent>
    </Tooltip>
  );
});

const AllView = memo(function AllView({
  loading,
  bossSearch,
  onBossSearchChange,
  totalCount,
  filteredStats,
  selectedMobCode,
  onSelectMob,
}: {
  loading: boolean;
  bossSearch: string;
  onBossSearchChange: (value: string) => void;
  totalCount: number;
  filteredStats: TargetMobStat[];
  selectedMobCode: string | null;
  onSelectMob: (item: TargetMobStat) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-center md:justify-start">
        <Input
          value={bossSearch}
          onChange={(event) => onBossSearchChange(event.target.value)}
          placeholder="搜索 Boss 名称"
          className="h-10 w-full max-w-sm border-white/10 bg-white/5 text-white placeholder:text-white/35"
        />
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:justify-start">
        <KdaRingCard label="全部战斗" value={loading ? "..." : String(totalCount)} />

        {loading ? (
          <WinRateRingCard label="加载中" value="..." subValue="请稍候" />
        ) : filteredStats.length > 0 ? (
          filteredStats.map((item) => (
            <BossCard
              key={item.mob_code}
              mobCode={item.mob_code}
              label={item.target_name}
              count={Number(item.battle_count)}
              active={selectedMobCode === item.mob_code}
              onSelect={() => onSelectMob(item)}
            />
          ))
        ) : (
          <WinRateRingCard label="暂无数据" value="0场" />
        )}
      </div>
    </div>
  );
});

const DungeonView = memo(function DungeonView({
  loading,
  dungeonCards,
  language,
  selectedMobCode,
  onSelectMob,
}: {
  loading: boolean;
  dungeonCards: DungeonCard[];
  language: string;
  selectedMobCode: string | null;
  onSelectMob: (item: TargetMobStat) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:justify-start">
        <KdaRingCard label="副本视图" value="..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {dungeonCards.map((dungeon) => (
        <div key={dungeon.dungeon_id} className="rounded-xl border border-white/10 p-4">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
            <KdaRingCard
              label={getLocalizedText(dungeon.name, language)}
              value={getLocalizedText(dungeon.difficulty, language)}
            />

            <div className="flex flex-1 flex-wrap items-center gap-x-8 gap-y-4">
              {dungeon.bosses.map((boss) =>
                boss.stat ? (
                  <BossCard
                    key={boss.mobCode}
                    mobCode={boss.mobCode}
                    label={boss.label}
                    count={boss.battleCount}
                    active={selectedMobCode === boss.mobCode}
                    onSelect={() => onSelectMob(boss.stat!)}
                  />
                ) : (
                  <WinRateRingCard key={boss.mobCode} label={boss.label} value="0场" />
                )
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

export default function DpsViewPage() {
  const { i18n } = useAppTranslation();
  const [stats, setStats] = useState<TargetMobStat[]>([]);
  const [selectedMob, setSelectedMob] = useState<TargetMobStat | null>(null);
  const [bossSearch, setBossSearch] = useState("");
  const [viewMode, setViewMode] = useState<DpsViewMode>("all");
  const [selectedClass, setSelectedClass] = useState("ALL");
  const [battleRanks, setBattleRanks] = useState<BattleRankItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalRankCount, setTotalRankCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [rankLoading, setRankLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rankErrorMessage, setRankErrorMessage] = useState<string | null>(null);
  const targetStatsRequestIdRef = useRef(0);
  const battleRanksRequestIdRef = useRef(0);

  useEffect(() => {
    async function loadTargetStats() {
      const requestId = ++targetStatsRequestIdRef.current;

      try {
        setLoading(true);
        setErrorMessage(null);

        const { data, error } = await supabase
          .from("aion2_dps_rank")
          .select("target_mob_code,target_name")
          .eq("is_boss", true)
          .order("battle_ended_at", { ascending: false });
        debugger;
        if (requestId !== targetStatsRequestIdRef.current) {
          return;
        }
        if (error) throw error;

        const list = normalizeTargetMobStats(
          buildTargetMobStatsFromRankRows((data ?? []) as RankMobSourceRow[])
        );
        setStats(list);
        setSelectedMob((current) => current ?? list[0] ?? null);
      } catch (error) {
        if (requestId !== targetStatsRequestIdRef.current) {
          return;
        }
        console.error("Failed to load target stats:", error);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load target stats");
      } finally {
        if (requestId === targetStatsRequestIdRef.current) {
          setLoading(false);
        }
      }
    }

    void loadTargetStats();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [selectedMob, selectedClass]);

  useEffect(() => {
    if (!selectedMob?.mob_code || !selectedClass) {
      return;
    }

    const mobCode = Number(selectedMob.mob_code);
    if (!Number.isFinite(mobCode)) {
      setBattleRanks([]);
      setTotalRankCount(0);
      return;
    }

    async function loadBattleRanks() {
      const requestId = ++battleRanksRequestIdRef.current;

      try {
        setRankLoading(true);
        setRankErrorMessage(null);

        let query = supabase
          .from("aion2_dps_rank")
          .select(
            "record_id,main_actor_name,main_actor_class,main_actor_damage,main_actor_battle_duration,main_actor_dps,party_total_damage",
            { count: "exact" }
          )
          .eq("target_mob_code", mobCode)
          .order("main_actor_dps", { ascending: false })
          .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

        if (selectedClass !== "ALL") {
          query = query.eq("main_actor_class", selectedClass);
        }

        const { data, error, count } = await query;

        if (requestId !== battleRanksRequestIdRef.current) {
          return;
        }
        if (error) throw error;

        const rows = ((data ?? []) as Omit<StatByClassMobRow, "total_count">[]).map((row) => ({
          ...row,
          total_count: Number(count ?? 0),
        }));
        setBattleRanks(buildBattleRanks(rows));
        setTotalRankCount(Number(count ?? 0));
      } catch (error) {
        if (requestId !== battleRanksRequestIdRef.current) {
          return;
        }
        console.error("Failed to load battle ranks:", error);
        setBattleRanks([]);
        setTotalRankCount(0);
        setRankErrorMessage(error instanceof Error ? error.message : "Failed to load battle ranks");
      } finally {
        if (requestId === battleRanksRequestIdRef.current) {
          setRankLoading(false);
        }
      }
    }

    void loadBattleRanks();
  }, [page, selectedClass, selectedMob]);

  const totalCount = useMemo(
    () => stats.reduce((sum, item) => sum + Number(item.battle_count), 0),
    [stats]
  );

  const filteredStats = useMemo(() => {
    const keyword = bossSearch.trim().toLowerCase();
    if (!keyword) {
      return stats;
    }
    return stats.filter((item) => item.target_name.toLowerCase().includes(keyword));
  }, [bossSearch, stats]);

  const statsByMobCode = useMemo(
    () => new Map(stats.map((item) => [item.mob_code, item])),
    [stats]
  );

  const dungeonCards = useMemo<DungeonCard[]>(() => {
    return (dungeons as DungeonDefinition[]).map((dungeon) => ({
      ...dungeon,
      bosses: dungeon.boss_ids.map((bossId) => {
        const mobCode = String(bossId);
        const stat = statsByMobCode.get(mobCode);
        return {
          mobCode,
          stat,
          battleCount: Number(stat?.battle_count ?? 0),
          label: getBossDisplayName(stat, mobCode),
        };
      }),
    }));
  }, [statsByMobCode]);

  const selectedClassAvgDps = useMemo(() => {
    const totalDamage = battleRanks.reduce((sum, item) => sum + item.totalDamage, 0);
    const totalFightSeconds = battleRanks.reduce((sum, item) => sum + item.fightSeconds, 0);
    return totalFightSeconds > 0 ? totalDamage / totalFightSeconds : 0;
  }, [battleRanks]);

  const totalPages = Math.max(1, Math.ceil(totalRankCount / PAGE_SIZE));
  const selectedMobCode = selectedMob?.mob_code ?? null;
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language;

  useEffect(() => {
    if (viewMode !== "all") {
      return;
    }

    if (filteredStats.length === 0) {
      setSelectedMob(null);
      return;
    }

    if (!selectedMob) {
      setSelectedMob(filteredStats[0]);
      return;
    }

    const stillVisible = filteredStats.some((item) => item.mob_code === selectedMob.mob_code);
    if (!stillVisible) {
      setSelectedMob(filteredStats[0]);
    }
  }, [filteredStats, selectedMob, viewMode]);

  return (
    <TooltipProvider delayDuration={100}>
      <section className="w-full space-y-6 px-6 py-4 text-white">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setViewMode("all")}
            className={[
              "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
              viewMode === "all"
                ? "border-[#d9a73a] bg-[#d9a73a]/15 text-[#d9a73a]"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            全部视图
          </button>
          <button
            type="button"
            onClick={() => setViewMode("dungeon")}
            className={[
              "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
              viewMode === "dungeon"
                ? "border-[#d9a73a] bg-[#d9a73a]/15 text-[#d9a73a]"
                : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
            ].join(" ")}
          >
            副本视图
          </button>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : viewMode === "all" ? (
          <AllView
            loading={loading}
            bossSearch={bossSearch}
            onBossSearchChange={setBossSearch}
            totalCount={totalCount}
            filteredStats={filteredStats}
            selectedMobCode={selectedMobCode}
            onSelectMob={setSelectedMob}
          />
        ) : (
          <DungeonView
            loading={loading}
            dungeonCards={dungeonCards}
            language={currentLanguage}
            selectedMobCode={selectedMobCode}
            onSelectMob={setSelectedMob}
          />
        )}

        <div className="rounded-xl border border-white/10 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white">战斗秒伤排行</h2>
              <p className="mt-1 text-sm text-white/50">
                当前目标：{selectedMob?.target_name ?? "-"} / 职业：{getClassName(selectedClass)}
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
                      <th className="px-4 py-3 text-right font-medium">个人伤害</th>
                      <th className="px-4 py-3 text-right font-medium">队伍总伤害</th>
                      <th className="px-4 py-3 text-right font-medium">战斗时长</th>
                      <th className="px-4 py-3 text-right font-medium">个人秒伤</th>
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
                        <td className="px-4 py-3 text-right text-white/80">
                          {Math.round(item.partyTotalDamage).toLocaleString()}
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
            <div className="py-8 text-center text-sm text-white/50">当前目标和职业暂无数据</div>
          )}
        </div>
      </section>
    </TooltipProvider>
  );
}
