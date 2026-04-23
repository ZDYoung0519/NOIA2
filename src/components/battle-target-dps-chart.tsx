import * as React from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Aion2DpsHistory } from "@/lib/localStorageHistory";
import {
  getBattleRecordChartGroups,
  getBattleTargetSummaries,
} from "@/lib/dps-history-analysis";
import type { MainActorRecord } from "@/types/aion2dps";

type BattleTargetDpsChartProps = {
  mainCharacter: MainActorRecord | null;
  selectedTargetKey: string | null;
  onSelectTargetKey: (targetKey: string | null) => void;
};

function formatDps(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}k`;
  }
  return Math.round(value).toString();
}

function sanitizeKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export default function BattleTargetDpsChart({
  mainCharacter,
  selectedTargetKey,
  onSelectTargetKey,
}: BattleTargetDpsChartProps) {
  const targetSummaries = React.useMemo(
    () => getBattleTargetSummaries(Aion2DpsHistory.get(), mainCharacter),
    [mainCharacter]
  );

  React.useEffect(() => {
    if (targetSummaries.length === 0) {
      if (selectedTargetKey !== null) {
        onSelectTargetKey(null);
      }
      return;
    }

    const hasSelected = targetSummaries.some((summary) => summary.key === selectedTargetKey);
    if (!hasSelected) {
      onSelectTargetKey(targetSummaries[0].key);
    }
  }, [onSelectTargetKey, selectedTargetKey, targetSummaries]);

  const selectedTarget =
    targetSummaries.find((summary) => summary.key === selectedTargetKey) ?? null;

  const chartGroups = React.useMemo(
    () => getBattleRecordChartGroups(selectedTarget, mainCharacter),
    [mainCharacter, selectedTarget]
  );

  const actorMetrics = React.useMemo(() => {
    const actorMap = new Map<
      string,
      {
        label: string;
        color: string;
        totalDps: number;
        count: number;
        isMainCharacter: boolean;
      }
    >();

    for (const group of chartGroups) {
      for (const actor of group.actors) {
        const key = sanitizeKey(actor.actorKey);
        const current = actorMap.get(key);

        actorMap.set(key, {
          label: actor.isMainCharacter ? `${actor.actorName} (Main)` : actor.actorName,
          color: actor.isMainCharacter ? "var(--primary)" : "var(--secondary)",
          totalDps: (current?.totalDps ?? 0) + actor.dps,
          count: (current?.count ?? 0) + 1,
          isMainCharacter: actor.isMainCharacter,
        });
      }
    }

    return Array.from(actorMap.entries()).sort(([, a], [, b]) => {
      const avgA = a.totalDps / a.count;
      const avgB = b.totalDps / b.count;
      return avgA - avgB;
    });
  }, [chartGroups]);

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {};

    for (const [key, metric] of actorMetrics) {
      config[key] = {
        label: metric.label,
        color: metric.color,
      };
    }

    return config;
  }, [actorMetrics]);

  const chartData = React.useMemo(() => {
    return chartGroups.map((group) => {
      const row: Record<string, number | string> = {
        label: group.label,
        recordTime: group.label,
      };

      for (const actor of group.actors) {
        row[sanitizeKey(actor.actorKey)] = Math.round(actor.dps);
      }

      return row;
    });
  }, [chartGroups]);

  const chartWidth = React.useMemo(() => {
    const maxActors = Math.max(1, ...chartGroups.map((group) => group.actors.length));
    return Math.max(chartGroups.length * Math.max(72, maxActors * 24), 520);
  }, [chartGroups]);

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-foreground text-[20px] font-semibold md:text-[22px]">
          Battle DPS History
        </h3>

        {targetSummaries.length > 0 ? (
          <Select
            value={selectedTargetKey ?? targetSummaries[0]?.key ?? ""}
            onValueChange={(value) => onSelectTargetKey(value || null)}
          >
            <SelectTrigger className="h-11 min-w-56 rounded-2xl bg-card">
              <SelectValue placeholder="Select target" />
            </SelectTrigger>
            <SelectContent>
              {targetSummaries.map((summary) => (
                <SelectItem key={summary.key} value={summary.key}>
                  {summary.targetName} ({summary.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <Card className="rounded-[28px] border border-border/50 bg-card shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-[18px] font-semibold">
            {selectedTarget?.targetName ?? "Select a battle target"}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 pt-2">
          {!mainCharacter ? (
            <div className="rounded-[22px] border border-border/50 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              Select a main character to view DPS history.
            </div>
          ) : !selectedTarget ? (
            <div className="rounded-[22px] border border-border/50 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              Select a battle target from the left list.
            </div>
          ) : chartGroups.length === 0 ? (
            <div className="rounded-[22px] border border-border/50 bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
              No chartable DPS history for this target.
            </div>
          ) : (
            <div className="overflow-x-auto pb-2">
              <div style={{ width: chartWidth }}>
                <ChartContainer config={chartConfig} className="h-[340px] w-full">
                  <BarChart accessibilityLayer data={chartData} barGap={4} barCategoryGap={20}>
                    <CartesianGrid vertical={false} strokeDasharray="4 4" />
                    <XAxis
                      dataKey="recordTime"
                      tickLine={false}
                      tickMargin={10}
                      axisLine={false}
                      interval={0}
                      angle={-32}
                      textAnchor="end"
                      height={64}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tickMargin={10}
                      tickFormatter={(value) => formatDps(Number(value))}
                    />
                    <ChartTooltip
                      cursor={false}
                      content={<ChartTooltipContent indicator="dashed" />}
                    />
                    {actorMetrics.map(([key, metric]) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        name={metric.label}
                        fill={`var(--color-${key})`}
                        radius={4}
                        maxBarSize={18}
                      />
                    ))}
                  </BarChart>
                </ChartContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
