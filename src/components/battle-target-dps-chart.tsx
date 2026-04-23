import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Aion2DpsHistory } from "@/lib/localStorageHistory";
import {
  getBattleRecordChartGroups,
  getBattleTargetSummaries,
  type BattleRecordChartGroup,
} from "@/lib/dps-history-analysis";
import type { MainActorRecord } from "@/types/aion2dps";

type BattleTargetDpsChartProps = {
  mainCharacter: MainActorRecord | null;
  selectedTargetKey: string | null;
};

const TEAMMATE_COLORS = [
  "hsl(var(--chart-2, 340 70% 70%))",
  "hsl(214 88% 64%)",
  "hsl(160 65% 52%)",
  "hsl(39 96% 58%)",
  "hsl(272 72% 68%)",
  "hsl(10 82% 66%)",
];

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

function getLegend(groups: BattleRecordChartGroup[]) {
  const colorMap = new Map<string, { name: string; color: string; isMainCharacter: boolean }>();
  let teammateIndex = 0;

  for (const group of groups) {
    for (const actor of group.actors) {
      if (colorMap.has(actor.actorKey)) {
        continue;
      }

      colorMap.set(actor.actorKey, {
        name: actor.actorName,
        color: actor.isMainCharacter
          ? "var(--primary)"
          : TEAMMATE_COLORS[teammateIndex++ % TEAMMATE_COLORS.length],
        isMainCharacter: actor.isMainCharacter,
      });
    }
  }

  return colorMap;
}

export default function BattleTargetDpsChart({
  mainCharacter,
  selectedTargetKey,
}: BattleTargetDpsChartProps) {
  const targetSummaries = React.useMemo(
    () => getBattleTargetSummaries(Aion2DpsHistory.get(), mainCharacter),
    [mainCharacter]
  );

  const selectedTarget =
    targetSummaries.find((summary) => summary.key === selectedTargetKey) ?? null;

  const chartGroups = React.useMemo(
    () => getBattleRecordChartGroups(selectedTarget, mainCharacter),
    [mainCharacter, selectedTarget]
  );

  const legend = React.useMemo(() => getLegend(chartGroups), [chartGroups]);
  const maxDps = React.useMemo(() => {
    return Math.max(1, ...chartGroups.flatMap((group) => group.actors.map((actor) => actor.dps)));
  }, [chartGroups]);

  const yAxisTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    value: maxDps * ratio,
  }));

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-foreground text-[20px] font-semibold md:text-[22px]">
          Battle DPS History
        </h3>
      </div>

      <Card className="border-border/50 bg-card rounded-[28px] border shadow-none">
        <CardContent className="p-4 pt-2">
          {!mainCharacter ? (
            <div className="border-border/50 bg-muted/30 text-muted-foreground rounded-[22px] border px-4 py-6 text-sm">
              Select a main character to view DPS history.
            </div>
          ) : !selectedTarget ? (
            <div className="border-border/50 bg-muted/30 text-muted-foreground rounded-[22px] border px-4 py-6 text-sm">
              Select a battle target from the left list.
            </div>
          ) : chartGroups.length === 0 ? (
            <div className="border-border/50 bg-muted/30 text-muted-foreground rounded-[22px] border px-4 py-6 text-sm">
              No chartable DPS history for this target.
            </div>
          ) : (
            <div className="flex gap-4">
              <div className="text-muted-foreground relative flex h-[320px] w-16 flex-col justify-between pb-12 text-right text-xs">
                {yAxisTicks.map((tick) => (
                  <div key={tick.ratio}>{formatDps(tick.value)}</div>
                ))}
              </div>

              <div className="relative min-w-0 flex-1 overflow-x-auto pb-2">
                <div className="pointer-events-none absolute inset-x-0 top-0 bottom-12">
                  {yAxisTicks.slice(0, -1).map((tick) => (
                    <div
                      key={tick.ratio}
                      className="border-border/60 absolute inset-x-0 border-t border-dashed"
                      style={{ top: `${(1 - tick.ratio) * 100}%` }}
                    />
                  ))}
                </div>

                <div className="flex min-h-[320px] items-end gap-4 pr-2">
                  {chartGroups.map((group) => {
                    const groupWidth = Math.max(92, group.actors.length * 18 + 28);

                    return (
                      <div
                        key={group.recordId}
                        className="relative flex shrink-0 flex-col items-center justify-end gap-3"
                        style={{ width: groupWidth }}
                      >
                        <div className="flex h-[260px] items-end gap-1.5">
                          {group.actors.map((actor) => {
                            const actorLegend = legend.get(actor.actorKey);
                            const height = `${Math.max((actor.dps / maxDps) * 100, 3)}%`;

                            return (
                              <Tooltip key={actor.actorKey}>
                                <TooltipTrigger asChild>
                                  <div className="flex h-full items-end">
                                    <div
                                      className={
                                        actor.isMainCharacter
                                          ? "w-4 rounded-t-full rounded-b-sm transition-all"
                                          : "w-3 rounded-t-full rounded-b-sm transition-all"
                                      }
                                      style={{
                                        height,
                                        backgroundColor: actorLegend?.color,
                                        boxShadow: actor.isMainCharacter
                                          ? "0 0 18px color-mix(in oklch, var(--primary) 45%, transparent)"
                                          : undefined,
                                      }}
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <div className="text-background font-medium">
                                    {actor.actorName}
                                  </div>
                                  <div className="text-muted-foreground mt-1">
                                    DPS: {formatDps(actor.dps)}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>

                        <div className="flex flex-col items-center gap-1 text-center">
                          <span className="text-foreground max-w-full text-xs font-medium">
                            {group.label}
                          </span>
                          <span className="text-muted-foreground text-[11px]">
                            {group.actors.length} players
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
