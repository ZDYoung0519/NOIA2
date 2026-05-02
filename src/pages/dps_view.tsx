import { memo, useEffect, useMemo, useRef, useState } from "react";
import dungeons from "@/data/dungeons.json";
import { KdaRingCard, WinRateRingCard } from "@/components/ring-card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/lib/supabase/supabase";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getLocalizedText, type LocalizedText } from "@/lib/i18n-data";
import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import { DpsDetailContent } from "@/components/dps/dps-detail-content";
import { ActorNameCell, getActorClassName } from "@/components/dps/dps-table-cells";
import { useAppSettings } from "@/hooks/use-app-settings";
import type { DpsDetailPayload, HistoryTargetRecord } from "@/types/aion2dps";

import { getServerShortName } from "@/lib/aion2/servers";

type TargetMobStat = {
  mob_code: string;
  target_name: string;
  last_battle_at?: string | null;
};

type RankMobSourceRow = {
  target_mob_code: number | string | null;
  target_name: string | null;
  battle_ended_at?: string | null;
};

type StatByClassMobRow = {
  record_id: string;
  battle_ended_at: string | null;
  main_actor_name: string | null;
  main_actor_class: string | null;
  main_actor_server_id: number;
  main_actor_damage: number | null;
  main_actor_battle_duration: number | null;
  main_actor_dps: number | null;
  party_total_damage: number | null;
  team_dps: number | null;
  total_count: number;
};

type BattleRankItem = {
  recordId: string;
  battleEndedAt: string | null;
  actorName: string;
  actorClass: string;
  actorServerId: number;
  totalDamage: number;
  partyTotalDamage: number;
  fightSeconds: number;
  dps: number;
  teamDps: number;
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
  label: string;
};

type DungeonCard = DungeonDefinition & {
  bosses: DungeonBossCard[];
  hideHeaderCard?: boolean;
};

type DungeonCategory = "all" | "expedition" | "transcendence" | "sanctuary";
type RankSortMode = "personal" | "team";

const PAGE_SIZE = 50;
const RANK_NAME_PAGE_SIZE = 1000;
const IS_DEV = import.meta.env.DEV;

const ALL_RANK_DUNGEON_CARD: DungeonDefinition = {
  dungeon_id: "rank-all",
  name: {
    "zh-CN": "全部 Boss",
    "zh-TW": "全部 Boss",
    en: "All Bosses",
    ko: "All Bosses",
  },
  difficulty: {
    "zh-CN": "Rank",
    "zh-TW": "Rank",
    en: "Rank",
    ko: "Rank",
  },
  boss_ids: [],
};

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

const DUNGEON_CATEGORY_LABELS: Record<DungeonCategory, string> = {
  all: "全部副本",
  expedition: "远征",
  transcendence: "超越",
  sanctuary: "圣域",
};

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

function buildBattleRanks(rows: StatByClassMobRow[], sortMode: RankSortMode): BattleRankItem[] {
  return rows
    .map((row) => ({
      recordId: row.record_id,
      battleEndedAt: row.battle_ended_at ?? null,
      actorName: row.main_actor_name ?? "-",
      actorClass: row.main_actor_class ?? "-",
      actorServerId: row.main_actor_server_id ?? 0,
      totalDamage: Number(row.main_actor_damage ?? 0),
      partyTotalDamage: Number(row.party_total_damage ?? 0),
      fightSeconds: Number(row.main_actor_battle_duration ?? 0),
      dps: Number(row.main_actor_dps ?? 0),
      teamDps: Number(row.team_dps ?? 0),
    }))
    .filter((item) => item.totalDamage > 0 && item.fightSeconds > 0)
    .sort((a, b) => (sortMode === "team" ? b.teamDps - a.teamDps || b.dps - a.dps : b.dps - a.dps));
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getBossDisplayName(stat: TargetMobStat | undefined, mobCode: string) {
  return stat?.target_name ?? `Boss ${mobCode}`;
}

function normalizeTargetMobStats(rows: TargetMobStat[]): TargetMobStat[] {
  return rows.map((row) => ({
    mob_code: String(row.mob_code),
    target_name: row.target_name ?? `Boss ${String(row.mob_code)}`,
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
    if (grouped.has(mobCode)) {
      continue;
    }

    grouped.set(mobCode, {
      mob_code: mobCode,
      target_name: row.target_name ?? `Boss ${mobCode}`,
      last_battle_at: row.battle_ended_at ?? null,
    });
  }

  return [...grouped.values()];
}

async function loadRankBossNames(): Promise<TargetMobStat[]> {
  const rows: RankMobSourceRow[] = [];

  for (let from = 0; ; from += RANK_NAME_PAGE_SIZE) {
    const to = from + RANK_NAME_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("aion2_dps_rank")
      .select("target_mob_code,target_name,battle_ended_at")
      .eq("is_boss", true)
      .order("battle_ended_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as RankMobSourceRow[];
    rows.push(...pageRows);

    if (pageRows.length < RANK_NAME_PAGE_SIZE) {
      break;
    }
  }

  return buildTargetMobStatsFromRankRows(rows);
}

function DpsRankDetailDialog({
  selectedRank,
  selectedMob,
  onOpenChange,
}: {
  selectedRank: BattleRankItem | null;
  selectedMob: TargetMobStat | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { settings } = useAppSettings();
  const [selectedRecord, setSelectedRecord] = useState<HistoryTargetRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const dpsAppearance = settings.appearance.dpsWindow;
  const selectedTargetInfo = selectedRecord
    ? selectedRecord.combatInfos.targetInfos[String(selectedRecord.targetId)]
    : undefined;

  const selectedDetailPayload = useMemo<DpsDetailPayload | null>(() => {
    if (!selectedRecord || selectedPlayerId === null) {
      return null;
    }

    const playerStats = selectedRecord.thisTargetAllPlayerStats?.[String(selectedPlayerId)] ?? null;
    if (!playerStats) {
      return null;
    }

    return {
      mode: "history",
      actorId: selectedPlayerId,
      targetId: selectedRecord.targetId,
      combatInfos: selectedRecord.combatInfos,
      playerStats,
      playerSkillStats:
        selectedRecord.thisTargetAllPlayerSkillStats?.[String(selectedPlayerId)] ?? {},
      playerSkillRecords:
        selectedRecord.thisTargetAllPlayerSkillRecords?.[String(selectedPlayerId)] ?? [],
      playerDpsCurve: [],
    };
  }, [selectedPlayerId, selectedRecord]);

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      if (!selectedRank) {
        setSelectedRecord(null);
        setSelectedPlayerId(null);
        setDetailLoading(false);
        return;
      }

      setDetailLoading(true);
      try {
        const { data, error } = await supabase
          .from("aion2_dps")
          .select("data")
          .eq("record_id", selectedRank.recordId)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!cancelled) {
          const nextRecord = (data?.data as HistoryTargetRecord | null) ?? null;
          setSelectedRecord(nextRecord);
          const nextPlayerIds = Object.keys(nextRecord?.thisTargetAllPlayerStats ?? {});
          setSelectedPlayerId(nextPlayerIds.length > 0 ? Number(nextPlayerIds[0]) : null);
        }
      } catch (error) {
        console.error("failed to load dps rank detail:", error);
        if (!cancelled) {
          setSelectedRecord(null);
          setSelectedPlayerId(null);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedRank]);

  return (
    <Dialog open={selectedRank !== null} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background/95 flex h-[80vh] w-[95vw] max-w-none flex-col overflow-hidden border-white/10 p-0 text-white sm:max-w-[1400px]">
        <DialogHeader className="shrink-0 border-b border-white/10 px-6 py-4">
          <DialogTitle className="text-lg font-semibold">
            {selectedMob?.target_name ?? "Boss"} 伤害详情
          </DialogTitle>
          <p className="text-sm text-white/40">
            {selectedRank
              ? `${selectedRank.actorName} [${getServerShortName(Number(selectedRank.actorServerId))}]`
              : ""}
          </p>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex w-[420px] flex-col border-r border-white/10">
            <div className="shrink-0 px-4 py-3 text-sm font-medium text-white/70">玩家伤害排行</div>

            <div className="flex-1 overflow-y-auto px-3 pb-4">
              {detailLoading ? (
                <div className="px-4 py-8 text-center text-sm text-white/60">正在加载...</div>
              ) : selectedRecord && selectedTargetInfo ? (
                <MemoizedDpsPanel
                  targetInfo={selectedTargetInfo}
                  thisTargetPlayerStats={selectedRecord.thisTargetAllPlayerStats}
                  combatInfos={selectedRecord.combatInfos}
                  mainPlayerColor={dpsAppearance.mainPlayerColor}
                  otherPlayerColor={dpsAppearance.otherPlayerColor}
                  barOpacity={100}
                  maskNicknames={dpsAppearance.maskNicknames}
                  percentDisplayMode={dpsAppearance.percentDisplayMode}
                  onPlayerClicked={setSelectedPlayerId}
                  onPlayerHovered={() => {}}
                  onPlayerHoverEnd={() => {}}
                />
              ) : (
                <div className="px-4 py-8 text-center text-sm text-white/50">
                  未找到这条排行对应的历史明细
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-1 flex-col">
            <div className="shrink-0 border-b border-white/10 px-6 py-3 text-sm font-medium text-white/70">
              技能伤害明细
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {selectedDetailPayload ? (
                <DpsDetailContent payload={selectedDetailPayload} />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-white/50">
                  {detailLoading ? "正在加载 DPS 明细..." : "请在左侧选择一个玩家查看技能详情"}
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const BossCard = memo(function BossCard({
  mobCode,
  label,
  active,
  onSelect,
}: {
  mobCode: string;
  label: string;
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
      <WinRateRingCard label={label} />
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
    <div
      className={[
        "grid grid-cols-1 gap-0",
        dungeonCards.some((dungeon) => dungeon.hideHeaderCard) ? "" : "xl:grid-cols-2",
      ].join(" ")}
    >
      {dungeonCards.map((dungeon) => (
        <div key={dungeon.dungeon_id} className="rounded-xl border border-white/10 p-0">
          <div className="flex flex-wrap items-start">
            {dungeon.hideHeaderCard ? null : (
              <KdaRingCard
                label={getLocalizedText(dungeon.name, language)}
                value={getLocalizedText(dungeon.difficulty, language)}
              />
            )}

            <div className="flex flex-1 flex-wrap items-center">
              {dungeon.bosses.map((boss) => (
                <BossCard
                  key={boss.mobCode}
                  mobCode={boss.mobCode}
                  label={boss.label}
                  active={selectedMobCode === boss.mobCode}
                  onSelect={() => onSelectMob(boss.stat!)}
                />
              ))}
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
  const [rankSortMode, setRankSortMode] = useState<RankSortMode>("personal");
  const [battleRanks, setBattleRanks] = useState<BattleRankItem[]>([]);
  const [page, setPage] = useState(1);
  // const [totalRankCount, setTotalRankCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [rankLoading, setRankLoading] = useState(false);
  const [selectedRank, setSelectedRank] = useState<BattleRankItem | null>(null);
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

        if (requestId !== targetStatsRequestIdRef.current) {
          return;
        }

        const rankBossStats = await loadRankBossNames();

        if (requestId !== targetStatsRequestIdRef.current) {
          return;
        }

        const list = normalizeTargetMobStats(rankBossStats);
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
  }, [rankSortMode, selectedMob, selectedClass]);

  useEffect(() => {
    if (!selectedMob?.mob_code || !selectedClass) {
      return;
    }

    const mobCode = Number(selectedMob.mob_code);
    if (!Number.isFinite(mobCode)) {
      setBattleRanks([]);
      return;
    }

    async function loadBattleRanks() {
      const requestId = ++battleRanksRequestIdRef.current;

      try {
        setRankErrorMessage(null);

        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE; // 多取 1 条，用来判断是否还有下一页

        let query = supabase
          .from("aion2_dps_rank")
          .select(
            `
            record_id,
            battle_ended_at,
            main_actor_name,
            main_actor_class,
            main_actor_server_id,
            main_actor_damage,
            main_actor_battle_duration,
            main_actor_dps,
            party_total_damage,
            team_dps
          `
          )
          .eq("target_mob_code", mobCode)
          .order(rankSortMode === "team" ? "team_dps" : "main_actor_dps", {
            ascending: false,
            nullsFirst: false,
          })
          .range(from, to);

        if (selectedClass !== "ALL") {
          query = query.eq("main_actor_class", selectedClass);
        }

        const { data, error } = await query;

        if (requestId !== battleRanksRequestIdRef.current) {
          return;
        }

        if (error) {
          throw error;
        }

        const rawRows = (data ?? []) as StatByClassMobRow[];
        const rows = rawRows.slice(0, PAGE_SIZE);
        setBattleRanks(buildBattleRanks(rows, rankSortMode));

        const hasNextPage = rawRows.length > PAGE_SIZE;
        setHasNextPage(hasNextPage);

        // 如果你原来用 totalRankCount 控制分页，
        // 这里改成“估算当前已知数量”，避免 count: exact。
        // setTotalRankCount(hasNextPage ? page * PAGE_SIZE + 1 : from + rows.length);

        // 如果你愿意新增 state，更推荐直接用这个控制“下一页”按钮
        // setHasNextRankPage(hasNextPage);
      } catch (error) {
        if (requestId !== battleRanksRequestIdRef.current) {
          return;
        }

        console.error("Failed to load battle ranks:", error);
        setBattleRanks([]);
        setRankErrorMessage(error instanceof Error ? error.message : "Failed to load battle ranks");
      } finally {
        if (requestId === battleRanksRequestIdRef.current) {
          setRankLoading(false);
        }
      }
    }
    void loadBattleRanks();
  }, [page, rankSortMode, selectedClass, selectedMob]);

  const statsByMobCode = useMemo(
    () => new Map(stats.map((item) => [item.mob_code, item])),
    [stats]
  );

  const dungeonCards = useMemo<DungeonCard[]>(() => {
    return (dungeons as DungeonDefinition[]).map((dungeon) => ({
      ...dungeon,
      bosses: dungeon.boss_ids.map((bossId) => {
        const mobCode = String(bossId);
        const stat = statsByMobCode.get(mobCode) ?? {
          mob_code: mobCode,
          target_name: `Boss ${mobCode}`,
          last_battle_at: null,
        };
        return {
          mobCode,
          stat,
          label: getBossDisplayName(stat, mobCode),
        };
      }),
    }));
  }, [statsByMobCode]);

  const allRankDungeonCard = useMemo<DungeonCard>(
    () => ({
      ...ALL_RANK_DUNGEON_CARD,
      hideHeaderCard: true,
      bosses: stats.map((stat) => ({
        mobCode: stat.mob_code,
        stat,
        label: getBossDisplayName(stat, stat.mob_code),
      })),
    }),
    [stats]
  );

  const filteredDungeonCards = useMemo(() => {
    const keyword = bossSearch.trim().toLowerCase();
    const sourceCards = dungeonCategory === "all" ? [allRankDungeonCard] : dungeonCards;

    return sourceCards
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
  }, [allRankDungeonCard, bossSearch, dungeonCards, dungeonCategory]);

  const selectedPageAvgDps = useMemo(() => {
    if (battleRanks.length === 0) {
      return 0;
    }
    const totalDps = battleRanks.reduce(
      (sum, item) => sum + (rankSortMode === "team" ? item.teamDps : item.dps),
      0
    );
    return totalDps / battleRanks.length;
  }, [battleRanks, rankSortMode]);

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
                当前目标：{selectedMob?.target_name ?? "-"} / 职业：
                {getActorClassName(selectedClass)}
              </p>

              <div className="mt-3 inline-flex items-baseline gap-2 rounded-lg border border-[#d9a73a]/30 bg-[#d9a73a]/10 px-3 py-2">
                <span className="text-sm text-white/50">
                  当前页平均{rankSortMode === "team" ? "队伍秒伤" : "个人秒伤"}
                </span>
                <span className="text-xl font-black text-[#d9a73a]">
                  {rankLoading ? "..." : Math.round(selectedPageAvgDps).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              {(["personal", "team"] as RankSortMode[]).map((mode) => {
                const active = rankSortMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setRankSortMode(mode)}
                    className={[
                      "rounded-lg border px-3 py-1.5 text-sm font-semibold transition",
                      active
                        ? "border-[#d9a73a] bg-[#d9a73a]/15 text-[#d9a73a]"
                        : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white",
                    ].join(" ")}
                  >
                    {mode === "team" ? "按队伍秒伤" : "按个人秒伤"}
                  </button>
                );
              })}
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
                    {getActorClassName(actorClass)}
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
                      <th className="px-4 py-3 text-left font-medium">战斗时间</th>
                      <th className="px-4 py-3 text-left font-medium">玩家</th>
                      <th className="px-4 py-3 text-left font-medium">职业</th>
                      <th className="px-4 py-3 text-right font-medium">个人伤害</th>
                      <th className="px-4 py-3 text-right font-medium">队伍总伤害</th>
                      <th className="px-4 py-3 text-right font-medium">战斗时长</th>
                      <th className="px-4 py-3 text-right font-medium">个人秒伤</th>
                      <th className="px-4 py-3 text-right font-medium">队伍秒伤</th>
                      <th className="px-4 py-3 text-right font-medium">伤害详情</th>
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
                        <td className="px-4 py-3 text-white/75">
                          {formatDateTime(item.battleEndedAt)}
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">
                          <ActorNameCell
                            actorName={item.actorName}
                            actorClass={item.actorClass}
                            serverLabel={getServerShortName(Number(item.actorServerId))}
                            to={`/character/view?serverId=${item.actorServerId}&characterName=${item.actorName}`}
                          />
                        </td>
                        <td className="px-4 py-3 text-white/60">
                          {getActorClassName(item.actorClass)}
                        </td>
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
                        <td className="px-4 py-3 text-right font-bold text-[#37b6a9]">
                          {Math.round(item.teamDps).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            className="rounded-md border border-white/10 px-3 py-1 text-sm text-white transition hover:bg-white/10"
                            onClick={() => setSelectedRank(item)}
                          >
                            查看
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-white/60">
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
                    disabled={!hasNextPage}
                    onClick={() => setPage((old) => old + 1)}
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
        <DpsRankDetailDialog
          selectedRank={selectedRank}
          selectedMob={selectedMob}
          onOpenChange={(open) => {
            if (!open) {
              setSelectedRank(null);
            }
          }}
        />
      </section>
    </TooltipProvider>
  );
}
