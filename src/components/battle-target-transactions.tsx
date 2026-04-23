import * as React from "react";
import { Swords } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Aion2DpsHistory } from "@/lib/localStorageHistory";
import {
  formatHistoryRecordTime,
  getBattleTargetSummaries,
} from "@/lib/dps-history-analysis";
import { cn } from "@/lib/utils";
import type { MainActorRecord } from "@/types/aion2dps";

type BattleTargetTransactionsProps = {
  mainCharacter: MainActorRecord | null;
  selectedTargetKey: string | null;
  onSelectTargetKey: (targetKey: string | null) => void;
};

function TargetIcon() {
  return (
    <div className="border-border/50 bg-muted text-muted-foreground flex size-8 items-center justify-center rounded-full border">
      <Swords className="h-4 w-4" />
    </div>
  );
}

export default function BattleTargetTransactions({
  mainCharacter,
  selectedTargetKey,
  onSelectTargetKey,
}: BattleTargetTransactionsProps) {
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

  return (
    <div className="min-w-0">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-foreground text-[20px] font-semibold md:text-[22px]">
          Transactions
        </h3>

        <Button className="h-11 rounded-2xl px-5 text-sm font-medium shadow-none">
          Ask a report
        </Button>
      </div>

      {!mainCharacter ? (
        <div className="rounded-[26px] border border-border/50 bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
          Select a main character to inspect battle targets.
        </div>
      ) : targetSummaries.length === 0 ? (
        <div className="rounded-[26px] border border-border/50 bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
          No battle history found for {mainCharacter.actorName}.
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {targetSummaries.map((summary) => {
            const isSelected = summary.key === selectedTargetKey;

            return (
              <button
                key={summary.key}
                type="button"
                onClick={() => onSelectTargetKey(summary.key)}
                className={cn(
                  "flex items-center justify-between gap-4 rounded-[24px] border border-transparent px-3 py-2 text-left transition",
                  isSelected && "border-border/50 bg-card shadow-sm",
                  !isSelected && "hover:bg-muted/40"
                )}
              >
                <div className="flex min-w-0 items-center gap-4">
                  <TargetIcon />

                  <div className="min-w-0">
                    <p className="text-foreground truncate text-[15px] font-medium md:text-[16px]">
                      {summary.targetName}
                    </p>
                    <p className="text-muted-foreground mt-1 text-xs">
                      Last battle {formatHistoryRecordTime(summary.lastSeenAt)}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <div className="text-primary text-[16px] font-semibold">{summary.count}</div>
                  <div className="text-muted-foreground text-xs">fights</div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
