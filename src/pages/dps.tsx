import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WindowFrame } from "@/components/window-frame";
import { TitleBar } from "@/components/title-bar";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import {
  Activity,
  Play,
  Square,
  Sword,
  Target,
  Timer,
  TrendingUp,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SkillStats = {
  counts: number;
  totalDamage: number;
  minDamage: number;
  maxDamage: number;
  specialCounts: Record<string, number>;
};

type SkillRecord = {
  time: number;
  skillCode: number;
  oriSkillCode: number;
  skillSpec: number[];
  damage: number;
  multiHitDamage: number;
  specialCounts: Record<string, number>;
  dot: boolean;
};

type ActorInfo = {
  id: number;
  actorName?: string | null;
  actorServerId?: string | null;
  actorClass?: string | null;
  actorSkillSpec: Record<string, number[]>;
};

type TargetInfo = {
  id: number;
  targetMobCode?: number | null;
  targetName?: string | null;
  isBoss: boolean;
  targetStartTime: Record<string, number>;
  targetLastTime: Record<string, number>;
};

type CombatInfos = {
  actorInfos: Record<string, ActorInfo>;
  targetInfos: Record<string, TargetInfo>;
  mainActorId?: number | null;
  mainActorName?: string | null;
  lastTargetByMainActor?: number | null;
  lastTarget?: number | null;
  timeNow: number;
};

type CombatSnapshot = {
  totalDamage: number;
  byTargetPlayerSkillStats: Record<string, Record<string, Record<string, SkillStats>>>;
  byTargetPlayerStats: Record<string, Record<string, SkillStats>>;
  byTargetPlayerSkillRecords: Record<string, Record<string, SkillRecord[]>>;
  byTargetPlayerDpsCurve: Record<string, Record<string, Array<[number, number]>>>;
  combatInfos: CombatInfos;
};

type SummaryMetrics = {
  currentDps: number;
  totalDamage: number;
  combatTime: number;
  mainActorName: string;
  targetName: string;
  lastTargetId: number | null;
};

type DpsListEntry = {
  actorId: number;
  actorName: string;
  actorClass: string;
  totalDamage: number;
  counts: number;
  dps: number;
  critCount: number;
};

function buildSummary(snapshot: CombatSnapshot | null): SummaryMetrics {
  if (!snapshot) {
    return {
      currentDps: 0,
      totalDamage: 0,
      combatTime: 0,
      mainActorName: "-",
      targetName: "-",
      lastTargetId: null,
    };
  }

  const targetInfos = Object.values(snapshot.combatInfos.targetInfos ?? {});
  const startedAt = targetInfos.flatMap((target) => Object.values(target.targetStartTime ?? {}));
  const endedAt = targetInfos.flatMap((target) => Object.values(target.targetLastTime ?? {}));

  const startTime = startedAt.length ? Math.min(...startedAt) : snapshot.combatInfos.timeNow;
  const endTime = endedAt.length ? Math.max(...endedAt) : snapshot.combatInfos.timeNow;
  const combatTime = Math.max(endTime - startTime, 0.1);
  const currentDps = snapshot.totalDamage / combatTime;

  const lastTargetId =
    snapshot.combatInfos.lastTargetByMainActor ?? snapshot.combatInfos.lastTarget ?? null;
  const targetName =
    (lastTargetId !== null
      ? snapshot.combatInfos.targetInfos[String(lastTargetId)]?.targetName
      : undefined) ?? "训练木桩";

  return {
    currentDps,
    totalDamage: snapshot.totalDamage,
    combatTime,
    mainActorName: snapshot.combatInfos.mainActorName ?? "Noia",
    targetName,
    lastTargetId,
  };
}

function buildDpsList(
  snapshot: CombatSnapshot | null,
  lastTargetId: number | null
): DpsListEntry[] {
  if (!snapshot || lastTargetId === null) {
    return [];
  }

  const targetStats = snapshot.byTargetPlayerStats[String(lastTargetId)] ?? {};
  const targetInfo = snapshot.combatInfos.targetInfos[String(lastTargetId)];

  return Object.entries(targetStats)
    .map(([actorId, stats]) => {
      const safeStats = stats ?? {
        counts: 0,
        totalDamage: 0,
        minDamage: 0,
        maxDamage: 0,
        specialCounts: {},
      };
      const actorInfo = snapshot.combatInfos.actorInfos[actorId];
      const startTime = Number(
        targetInfo?.targetStartTime?.[actorId] ?? snapshot.combatInfos.timeNow
      );
      const lastTime = Number(
        targetInfo?.targetLastTime?.[actorId] ?? snapshot.combatInfos.timeNow
      );
      const combatTime = Math.max(lastTime - startTime, 0.1);
      const totalDamage = Number(safeStats.totalDamage ?? 0);
      const counts = Number(safeStats.counts ?? 0);
      const critCount = Number(safeStats.specialCounts?.CRITICAL ?? 0);

      return {
        actorId: Number(actorId),
        actorName: actorInfo?.actorName ?? `Actor ${actorId}`,
        actorClass: actorInfo?.actorClass ?? "-",
        totalDamage,
        counts,
        dps: totalDamage / combatTime,
        critCount,
      };
    })
    .sort((a, b) => b.totalDamage - a.totalDamage);
}

export default function DpsPage() {
  const [snapshot, setSnapshot] = useState<CombatSnapshot | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [maxDps, setMaxDps] = useState(1000);
  const unlistenRef = useRef<null | (() => void)>(null);

  const summary = useMemo(() => buildSummary(snapshot), [snapshot]);
  const dpsList = useMemo(
    () => buildDpsList(snapshot, summary.lastTargetId),
    [snapshot, summary.lastTargetId]
  );

  useEffect(() => {
    setMaxDps((current) => Math.max(current, summary.currentDps * 1.2 || 1000));
  }, [summary.currentDps]);

  useEffect(() => {
    let mounted = true;

    const setupListener = async () => {
      try {
        unlistenRef.current = await listen<CombatSnapshot>("dps-snapshot", (event) => {
          if (!mounted) {
            return;
          }
          setSnapshot(event.payload);
          setIsRunning(true);
        });
      } catch (error) {
        console.error("listen dps-snapshot failed:", error);
      }
    };

    void setupListener();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        void unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, []);

  const handleStartDpsMeter = async () => {
    try {
      await invoke("start_dps_meter");
      setIsRunning(true);
      toast.success("DPS Meter 已启动");
    } catch (error) {
      console.error("start dps meter failed:", error);
      toast.error("启动 DPS Meter 失败");
      setIsRunning(false);
    }
  };

  const handleStopDpsMeter = async () => {
    try {
      await invoke("stop_dps_meter");
    } catch (error) {
      console.error("stop dps meter failed:", error);
    } finally {
      setIsRunning(false);
      setSnapshot(null);
      setMaxDps(1000);
      toast.info("已重置显示数据");
    }
  };

  return (
    <WindowFrame
      titleBar={<TitleBar title="DPS 面板" showMaximize={false} />}
      contentClassName="flex flex-1 overflow-hidden bg-muted/10"
    >
      <Toaster />

      <div className="flex h-full w-full flex-col items-center gap-6 p-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">战斗统计</h1>
          <p className="text-muted-foreground">接收 Rust DPS 快照并显示核心数据</p>
        </div>

        <div className="grid w-full max-w-5xl gap-6 md:grid-cols-3">
          <Card
            className={cn(
              "border-2 transition-all duration-300",
              summary.currentDps > 0
                ? "border-primary shadow-lg shadow-primary/10"
                : "border-border"
            )}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                当前 DPS
              </CardTitle>
              <Activity className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold tabular-nums">
                {summary.currentDps.toFixed(0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">按总伤害和战斗时长计算</p>
              <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{
                    width: `${Math.min((summary.currentDps / maxDps) * 100, 100)}%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                总伤害
              </CardTitle>
              <Sword className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold tabular-nums text-red-500">
                {summary.totalDamage.toLocaleString()}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">快照中的累计伤害</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                战斗时长
              </CardTitle>
              <Timer className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold tabular-nums text-blue-500">
                {summary.combatTime.toFixed(1)}s
              </div>
              <p className="mt-1 text-xs text-muted-foreground">由开始和最后命中时间推导</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid w-full max-w-5xl gap-6 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                主角色
              </CardTitle>
              <User className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{summary.mainActorName}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                来自 combatInfos.mainActorName
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                当前目标
              </CardTitle>
              <Target className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{summary.targetName}</div>
              <p className="mt-1 text-xs text-muted-foreground">
                来自主角色最后一次命中的目标
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>当前目标 DPS 列表</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  显示 `lastTargetId` 对应目标下的所有玩家统计
                </p>
              </div>
              <Sword className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent className="p-0">
              {dpsList.length === 0 ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  暂无当前目标伤害数据
                </div>
              ) : (
                <div className="divide-y">
                  {dpsList.map((entry, index) => (
                    <div
                      key={entry.actorId}
                      className="grid grid-cols-[56px_1.5fr_0.9fr_1fr_0.8fr_0.7fr] items-center gap-3 px-4 py-3 text-sm"
                    >
                      <div className="text-lg font-bold tabular-nums text-muted-foreground">
                        #{index + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{entry.actorName}</div>
                        <div className="text-xs text-muted-foreground">{entry.actorClass}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">
                          {entry.dps.toFixed(0)}
                        </div>
                        <div className="text-xs text-muted-foreground">DPS</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">
                          {entry.totalDamage.toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground">伤害</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{entry.counts}</div>
                        <div className="text-xs text-muted-foreground">命中</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold tabular-nums">{entry.critCount}</div>
                        <div className="text-xs text-muted-foreground">暴击</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="flex h-full min-h-64 items-center justify-center border-dashed bg-muted/20">
            <div className="space-y-2 text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">DPS 曲线区域可在下一步接入</p>
            </div>
          </Card>
        </div>

        <div className="flex gap-4">
          <Button
            size="lg"
            onClick={handleStartDpsMeter}
            disabled={isRunning}
            className="w-36 gap-2"
          >
            {isRunning ? (
              <>
                <span className="animate-pulse">●</span>
                进行中
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                启动 Meter
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={handleStopDpsMeter}
            disabled={!isRunning && !snapshot}
            className="w-36 gap-2"
          >
            <Square className="h-4 w-4" />
            重置
          </Button>
        </div>
      </div>
    </WindowFrame>
  );
}
