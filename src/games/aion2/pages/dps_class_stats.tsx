import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BarChart3, Medal, Search, Sigma, UsersRound } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppTranslation } from "@/hooks/use-app-translation";
import {
  getDungeonDifficultyByMobCode,
  getDungeonDisplayNameByMobCode,
  getKnownBossMobCodes,
  getNpcDisplayName,
} from "@/games/aion2/lib/npc-names";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

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

export function getActorClassName(actorClass: string | null | undefined) {
  if (!actorClass) {
    return "-";
  }
  return ACTOR_CLASS_NAME_MAP[actorClass] ?? actorClass;
}

type TargetMobStat = {
  mob_code: string;
  target_name: string;
  last_battle_at?: string | null;
};

type ClassStatsRow = {
  main_actor_class: string;
  sample_count: number;
  top_10_percent_count: number;
  top_10_percent_avg_dps: number | null;
  median_dps: number | null;
  avg_dps: number | null;
  max_dps: number | null;
};

type MetricMode = "top10" | "median" | "avg";

const METRIC_OPTIONS: Array<{
  value: MetricMode;
  label: string;
  description: string;
}> = [
  {
    value: "top10",
    label: "前 10%",
    description: "每个职业最高段玩家的平均秒伤",
  },
  {
    value: "median",
    label: "中位数",
    description: "更接近普通高频玩家水平",
  },
  {
    value: "avg",
    label: "总体平均",
    description: "该职业全部排行记录平均值",
  },
];

const CLASS_ORDER = [
  "GLADIATOR",
  "TEMPLAR",
  "ASSASSIN",
  "RANGER",
  "SORCERER",
  "ELEMENTALIST",
  "CLERIC",
  "CHANTER",
];

function getMetricValue(row: ClassStatsRow, metric: MetricMode) {
  if (metric === "median") {
    return Number(row.median_dps ?? 0);
  }
  if (metric === "avg") {
    return Number(row.avg_dps ?? 0);
  }
  return Number(row.top_10_percent_avg_dps ?? 0);
}

function getMetricLabel(metric: MetricMode) {
  return METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? "前 10%";
}

function formatDps(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return "-";
  }
  return Math.round(numericValue).toLocaleString();
}

function formatTime(value: string | null | undefined) {
  if (!value) {
    return "暂无记录";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildKnownBosses(language: string): TargetMobStat[] {
  return getKnownBossMobCodes()
    .map((mobCode) => {
      const dungeonName = getDungeonDisplayNameByMobCode(mobCode, language);
      const dungeonDifficulty = getDungeonDifficultyByMobCode(mobCode, language);
      const bossName = getNpcDisplayName(mobCode);

      return {
        mob_code: mobCode,
        target_name: [dungeonName, dungeonDifficulty, bossName].filter(Boolean).join(" · "),
        last_battle_at: null,
      };
    })
    .sort((a, b) => a.target_name.localeCompare(b.target_name));
}

function ClassIcon({ actorClass }: { actorClass: string }) {
  return (
    <img
      src={`/images/class/${actorClass.toLowerCase()}.webp`}
      alt={actorClass}
      className="size-8 rounded-lg"
      loading="lazy"
    />
  );
}

function MetricCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string;
  subtext: string;
  icon: typeof BarChart3;
}) {
  return (
    <Card className="bg-card/52 border-white/10 py-4 shadow-sm backdrop-blur-md">
      <CardContent className="flex items-center justify-between gap-4 px-4">
        <div className="min-w-0">
          <p className="text-muted-foreground text-sm">{label}</p>
          <p className="text-foreground mt-1 truncate text-2xl font-semibold">{value}</p>
          <p className="text-muted-foreground mt-1 truncate text-xs">{subtext}</p>
        </div>
        <div className="bg-background/65 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-white/10">
          <Icon />
        </div>
      </CardContent>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, index) => (
        <Skeleton key={index} className="h-20 rounded-2xl bg-white/10" />
      ))}
    </div>
  );
}

export default function DpsClassStatsPage() {
  const { i18n } = useAppTranslation();
  const currentLanguage = i18n.resolvedLanguage ?? i18n.language;
  const bosses = useMemo(() => buildKnownBosses(currentLanguage), [currentLanguage]);
  const [selectedMobCode, setSelectedMobCode] = useState("");
  const [bossSearch, setBossSearch] = useState("");
  const [metricMode, setMetricMode] = useState<MetricMode>("top10");
  const [statsRows, setStatsRows] = useState<ClassStatsRow[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const statsRequestIdRef = useRef(0);

  useEffect(() => {
    setSelectedMobCode((current) => current || bosses[0]?.mob_code || "");
  }, [bosses]);

  useEffect(() => {
    if (!selectedMobCode) {
      setStatsRows([]);
      return;
    }

    async function loadClassStats() {
      const requestId = ++statsRequestIdRef.current;

      try {
        setStatsLoading(true);
        setErrorMessage(null);

        const { data, error } = await supabase.rpc("get_aion2_dps_rank_class_stats_by_boss", {
          p_target_mob_code: Number(selectedMobCode),
        });

        if (requestId !== statsRequestIdRef.current) {
          return;
        }

        if (error) {
          throw error;
        }

        setStatsRows((data ?? []) as ClassStatsRow[]);
      } catch (error) {
        if (requestId !== statsRequestIdRef.current) {
          return;
        }
        console.error("Failed to load class stats:", error);
        setStatsRows([]);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "职业统计加载失败，请确认 SQL 函数已经在 Supabase 执行"
        );
      } finally {
        if (requestId === statsRequestIdRef.current) {
          setStatsLoading(false);
        }
      }
    }

    void loadClassStats();
  }, [selectedMobCode]);

  const selectedBoss = useMemo(
    () => bosses.find((boss) => boss.mob_code === selectedMobCode) ?? null,
    [bosses, selectedMobCode]
  );

  const filteredBosses = useMemo(() => {
    const keyword = bossSearch.trim().toLowerCase();
    if (!keyword) {
      return bosses;
    }

    return bosses.filter(
      (boss) => boss.target_name.toLowerCase().includes(keyword) || boss.mob_code.includes(keyword)
    );
  }, [bossSearch, bosses]);

  const sortedRows = useMemo(() => {
    const classOrderMap = new Map(CLASS_ORDER.map((actorClass, index) => [actorClass, index]));

    return [...statsRows].sort((a, b) => {
      const diff = getMetricValue(b, metricMode) - getMetricValue(a, metricMode);
      if (diff !== 0) {
        return diff;
      }
      return (
        (classOrderMap.get(a.main_actor_class) ?? 999) -
        (classOrderMap.get(b.main_actor_class) ?? 999)
      );
    });
  }, [metricMode, statsRows]);

  const maxMetricValue = useMemo(
    () => Math.max(1, ...sortedRows.map((row) => getMetricValue(row, metricMode))),
    [metricMode, sortedRows]
  );

  const totalSamples = useMemo(
    () => statsRows.reduce((sum, row) => sum + Number(row.sample_count ?? 0), 0),
    [statsRows]
  );

  const leader = sortedRows[0] ?? null;
  const medianLeader = useMemo(
    () => [...statsRows].sort((a, b) => Number(b.median_dps ?? 0) - Number(a.median_dps ?? 0))[0],
    [statsRows]
  );
  const averageDps = useMemo(() => {
    if (statsRows.length === 0) {
      return 0;
    }

    const weightedDps = statsRows.reduce(
      (sum, row) => sum + Number(row.avg_dps ?? 0) * Number(row.sample_count ?? 0),
      0
    );
    return weightedDps / Math.max(1, totalSamples);
  }, [statsRows, totalSamples]);

  return (
    <section className="text-foreground flex w-full flex-col gap-5 px-6 py-5">
      <div className="bg-card/45 flex flex-col gap-4 rounded-3xl p-5 shadow-sm ring-1 ring-white/10 backdrop-blur-md">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="bg-background/70 text-muted-foreground">
              职业秒伤统计
            </Badge>
            <h1 className="text-foreground mt-3 text-3xl font-semibold tracking-normal">
              Boss 职业表现对比
            </h1>
            <p className="text-muted-foreground mt-2 text-sm leading-6">
              基于 dps_rank 中每个玩家在对应 Boss 的最好成绩，按职业统计前 10%
              平均秒伤、中位数秒伤和总体平均秒伤。
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row xl:justify-end">
            <div className="relative min-w-[240px]">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 -translate-y-1/2" />
              <Input
                value={bossSearch}
                onChange={(event) => setBossSearch(event.target.value)}
                placeholder="搜索 Boss 名称或 ID"
                className="bg-background/65 h-10 rounded-xl border-white/10 pl-10"
              />
            </div>

            <Select value={selectedMobCode} onValueChange={setSelectedMobCode}>
              <SelectTrigger className="bg-background/65 h-10 min-w-[300px] rounded-xl border-white/10">
                <SelectValue placeholder="选择 Boss" />
              </SelectTrigger>
              <SelectContent className="max-h-[360px]">
                <SelectGroup>
                  {filteredBosses.map((boss) => (
                    <SelectItem key={boss.mob_code} value={boss.mob_code}>
                      {boss.target_name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {METRIC_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={metricMode === option.value ? "secondary" : "ghost"}
              onClick={() => setMetricMode(option.value)}
              className={cn(
                "h-auto rounded-xl px-3 py-2 text-left",
                metricMode === option.value
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/70 hover:text-foreground"
              )}
            >
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-semibold">{option.label}</span>
                <span className="text-xs opacity-70">{option.description}</span>
              </span>
            </Button>
          ))}
        </div>
      </div>

      {errorMessage ? (
        <Alert variant="destructive" className="border-destructive/30 bg-card/70">
          <AlertCircle />
          <AlertTitle>统计数据加载失败</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard
          label="当前 Boss"
          value={selectedBoss?.target_name ?? "-"}
          subtext={`最后记录：${formatTime(selectedBoss?.last_battle_at)}`}
          icon={Medal}
        />
        <MetricCard
          label="样本数量"
          value={totalSamples.toLocaleString()}
          subtext={`${statsRows.length.toLocaleString()} 个职业参与统计`}
          icon={UsersRound}
        />
        <MetricCard
          label={`${getMetricLabel(metricMode)}最高职业`}
          value={leader ? getActorClassName(leader.main_actor_class) : "-"}
          subtext={
            leader
              ? `${formatDps(getMetricValue(leader, metricMode))} DPS / 全局均值 ${formatDps(averageDps)}`
              : "暂无数据"
          }
          icon={Sigma}
        />
      </div>

      <Card className="bg-card/52 border-white/10 py-0 shadow-sm backdrop-blur-md">
        <CardHeader className="border-b border-white/10 px-5 py-4">
          <div>
            <CardTitle className="text-lg">职业秒伤分布</CardTitle>
            <CardDescription>
              当前按照 {getMetricLabel(metricMode)} 排序，条形长度随当前指标动态归一化。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-5 py-5">
          {statsLoading ? (
            <StatsSkeleton />
          ) : sortedRows.length > 0 ? (
            <div className="flex flex-col gap-3">
              {sortedRows.map((row, index) => {
                const metricValue = getMetricValue(row, metricMode);
                const width = `${Math.max(4, (metricValue / maxMetricValue) * 100)}%`;
                const top10Count = Number(row.top_10_percent_count ?? 1);

                return (
                  <div
                    key={row.main_actor_class}
                    className="group bg-background/58 hover:bg-background/72 rounded-2xl p-3 ring-1 ring-white/10 transition"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                      <div className="flex min-w-[220px] items-center gap-3">
                        <span className="text-muted-foreground text-sm tabular-nums">
                          #{index + 1}
                        </span>
                        <ClassIcon actorClass={row.main_actor_class} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">
                            {getActorClassName(row.main_actor_class)}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            样本 {Number(row.sample_count ?? 0).toLocaleString()} · 前 10% 取{" "}
                            {top10Count.toLocaleString()} 条
                          </p>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="bg-muted/55 h-3 overflow-hidden rounded-full">
                          <div
                            className="bg-primary/75 group-hover:bg-primary h-full rounded-full transition-[width] duration-500 ease-out"
                            style={{ width }}
                          />
                        </div>
                      </div>

                      <div className="grid min-w-[420px] grid-cols-3 gap-2 text-right max-lg:min-w-0 max-lg:text-left">
                        <div>
                          <p className="text-muted-foreground text-xs">前 10%</p>
                          <p className="font-semibold tabular-nums">
                            {formatDps(row.top_10_percent_avg_dps)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">中位数</p>
                          <p
                            className={cn(
                              "font-semibold tabular-nums",
                              medianLeader?.main_actor_class === row.main_actor_class &&
                                "text-primary"
                            )}
                          >
                            {formatDps(row.median_dps)}
                          </p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">总体平均</p>
                          <p className="font-semibold tabular-nums">{formatDps(row.avg_dps)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-background/45 flex min-h-[240px] flex-col items-center justify-center rounded-2xl text-center ring-1 ring-white/10">
              <BarChart3 className="text-muted-foreground mb-3" />
              <p className="font-semibold">暂无职业统计</p>
              <p className="text-muted-foreground mt-1 text-sm">
                当前 Boss 还没有可用于统计的 dps_rank 记录。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
