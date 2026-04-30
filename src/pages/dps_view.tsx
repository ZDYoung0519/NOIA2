import { memo, useEffect, useMemo, useRef, useState } from "react";
import dungeons from "@/data/dungeons.json";
import { KdaRingCard, WinRateRingCard } from "@/components/ring-card";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/supabase";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getLocalizedText, type LocalizedText } from "@/lib/i18n-data";
import { Link } from "react-router-dom";

import { getServerShortName } from "@/lib/aion2/servers";

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
  main_actor_server_id: number;
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
  actorServerId: number;
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

type DungeonCategory = "all" | "expedition" | "transcendence" | "sanctuary";

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

const DUNGEON_CATEGORY_LABELS: Record<DungeonCategory, string> = {
  all: "全部副本",
  expedition: "远征",
  transcendence: "超越",
  sanctuary: "圣域",
};

function getClassName(actorClass: string) {
  return ACTOR_CLASS_NAME_MAP[actorClass] ?? actorClass;
}

function getDungeonCategory(dungeonId: string): Exclude<DungeonCategory, "all"> | null {
  if (dungeonId.startsWith("0")) {
    return "expedition";
  }
  if (dungeonId.startsWith("1")) {
    return "transcendence";
  }
  if (dungeonId.startsWith("2")) {
    return "sanctuary";
  }
  return null;
}

function buildBattleRanks(rows: StatByClassMobRow[]): BattleRankItem[] {
  return rows
    .map((row) => ({
      recordId: row.record_id,
      actorName: row.main_actor_name ?? "-",
      actorClass: row.main_actor_class ?? "-",
      actorServerId: row.main_actor_server_id ?? 0,
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

  if (dungeonCards.length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:justify-start">
        <WinRateRingCard label="暂无数据" value="0场" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
  const [dungeonCategory, setDungeonCategory] = useState<DungeonCategory>("expedition");
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
          .select("target_mob_code,target_name,battle_ended_at")
          .eq("is_boss", true)
          .order("battle_ended_at", { ascending: false });

        if (requestId !== targetStatsRequestIdRef.current) {
          return;
        }

        if (error) {
          throw error;
        }

        const list = normalizeTargetMobStats(
          buildTargetMobStatsFromRankRows((data ?? []) as RankMobSourceRow[])
        );
        setStats(list);
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
        setRankErrorMessage(null);
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        let query = supabase
          .from("aion2_dps_rank")
          .select(
            `
            record_id,
            main_actor_name,
            main_actor_class,
            main_actor_server_id,
            main_actor_damage,
            main_actor_battle_duration,
            main_actor_dps,
            party_total_damage
            `,
            { count: "exact" }
          )
          .eq("target_mob_code", mobCode)
          .order("main_actor_dps", { ascending: false, nullsFirst: false })
          .range(from, to);
        if (selectedClass !== "ALL") {
          query = query.eq("main_actor_class", selectedClass);
        }
        const { data, error, count } = await query;
        if (requestId !== battleRanksRequestIdRef.current) {
          return;
        }
        if (error) {
          throw error;
        }
        const rows = (data ?? []) as StatByClassMobRow[];
        setBattleRanks(buildBattleRanks(rows));
        setTotalRankCount(count ?? 0);
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

  const filteredDungeonCards = useMemo(() => {
    const keyword = bossSearch.trim().toLowerCase();

    return dungeonCards
      .filter((dungeon) => {
        if (dungeonCategory === "all") {
          return true;
        }
        return getDungeonCategory(dungeon.dungeon_id) === dungeonCategory;
      })
      .map((dungeon) => {
        if (!keyword) {
          return dungeon;
        }

        return {
          ...dungeon,
          bosses: dungeon.bosses.filter((boss) => boss.label.toLowerCase().includes(keyword)),
        };
      })
      .filter((dungeon) => dungeon.bosses.length > 0 || !keyword);
  }, [bossSearch, dungeonCards, dungeonCategory]);

  const selectedClassAvgDps = useMemo(() => {
    const totalDamage = battleRanks.reduce((sum, item) => sum + item.totalDamage, 0);
    const totalFightSeconds = battleRanks.reduce((sum, item) => sum + item.fightSeconds, 0);
    return totalFightSeconds > 0 ? totalDamage / totalFightSeconds : 0;
  }, [battleRanks]);

  const totalPages = Math.max(1, Math.ceil(totalRankCount / PAGE_SIZE));
  const selectedMobCode = selectedMob?.mob_code ?? null;
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language;

  useEffect(() => {
    const visibleMobCodes = new Set(
      filteredDungeonCards.flatMap((dungeon) => dungeon.bosses.map((boss) => boss.mobCode))
    );

    if (visibleMobCodes.size === 0) {
      setSelectedMob(null);
      return;
    }

    if (!selectedMob) {
      const nextMobCode = filteredDungeonCards[0]?.bosses[0]?.mobCode;
      if (nextMobCode) {
        const nextStat = statsByMobCode.get(nextMobCode);
        setSelectedMob(nextStat ?? null);
      }
      return;
    }

    if (!visibleMobCodes.has(selectedMob.mob_code)) {
      const nextMobCode = filteredDungeonCards[0]?.bosses[0]?.mobCode;
      if (nextMobCode) {
        const nextStat = statsByMobCode.get(nextMobCode);
        setSelectedMob(nextStat ?? null);
      } else {
        setSelectedMob(null);
      }
    }
  }, [filteredDungeonCards, selectedMob, statsByMobCode]);

  return (
    <TooltipProvider delayDuration={100}>
      <section className="w-full space-y-6 px-6 py-4 text-white">
        <div className="space-y-4">
          <div className="flex justify-center md:justify-start">
            <Input
              value={bossSearch}
              onChange={(event) => setBossSearch(event.target.value)}
              placeholder="搜索 Boss 名称"
              className="h-10 w-full max-w-sm border-white/10 bg-white/5 text-white placeholder:text-white/35"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(["expedition", "transcendence", "sanctuary", "all"] as DungeonCategory[]).map(
              (category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setDungeonCategory(category)}
                  className={[
                    "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                    dungeonCategory === category
                      ? "border-[#d9a73a] bg-[#d9a73a]/15 text-[#d9a73a]"
                      : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  {DUNGEON_CATEGORY_LABELS[category]}
                </button>
              )
            )}
          </div>
        </div>

        {errorMessage ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {errorMessage}
          </div>
        ) : (
          <DungeonView
            loading={loading}
            dungeonCards={filteredDungeonCards}
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
                        <td className="px-4 py-3 font-semibold text-white">
                          <Link
                            to={`/character/view?serverId=${item.actorServerId}&characterName=${item.actorName}`}
                            className="text-white/90 transition hover:text-white hover:underline"
                            onClick={(event) => {
                              event.stopPropagation();
                            }}
                          >
                            {item.actorName}
                            <span className="ml-1 text-white/50">
                              [{getServerShortName(Number(item.actorServerId))}]
                            </span>
                          </Link>
                        </td>
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
            <div className="py-8 text-center text-sm text-white/50">当前目标和职业暂无数据。</div>
          )}
        </div>
      </section>
    </TooltipProvider>
  );
}
