import * as React from "react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Aion2DpsHistory } from "@/lib/localStorageHistory";
import { getMainActorId } from "@/lib/dps-history-analysis";
import type { MainActorRecord } from "@/types/aion2dps";

type RecentTeammate = {
  id: string;
  actorName: string;
  serverId: number | null;
  count: number;
};

type RecentTeammatesCardProps = {
  mainCharacter: MainActorRecord | null;
};

function getInitials(name: string) {
  const trimmed = name.trim();
  return trimmed ? trimmed.slice(0, 2).toUpperCase() : "NA";
}

function buildRecentTeammates(mainCharacter: MainActorRecord | null) {
  if (!mainCharacter) {
    return [];
  }

  const teammateMap = new Map<string, RecentTeammate>();

  for (const record of Aion2DpsHistory.get()) {
    const mainActorId = getMainActorId(record, mainCharacter);
    if (!mainActorId) {
      continue;
    }

    for (const actorId of Object.keys(record.thisTargetAllPlayerStats ?? {})) {
      if (actorId === mainActorId) {
        continue;
      }

      const actorInfo = record.combatInfos.actorInfos?.[actorId];
      const actorName = actorInfo?.actorName?.trim();
      if (!actorName) {
        continue;
      }

      const serverId = actorInfo?.actorServerId ? Number(actorInfo.actorServerId) : null;
      const teammateId = `${actorName}-${serverId ?? "unknown"}`;
      const current = teammateMap.get(teammateId);

      teammateMap.set(teammateId, {
        id: teammateId,
        actorName,
        serverId,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return Array.from(teammateMap.values())
    .sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return a.actorName.localeCompare(b.actorName, "zh-CN");
    })
    .slice(0, 4);
}

export default function RecentTeammatesCard({ mainCharacter }: RecentTeammatesCardProps) {
  const teammates = React.useMemo(() => buildRecentTeammates(mainCharacter), [mainCharacter]);

  return (
    <div className="min-w-0 pt-1">
      <h3 className="mb-6 text-[18px] font-semibold text-foreground md:text-[20px]">
        Recent teammates
      </h3>

      {!mainCharacter ? (
        <div className="rounded-3xl border border-border/50 bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
          No main character selected.
        </div>
      ) : teammates.length === 0 ? (
        <div className="rounded-3xl border border-border/50 bg-muted/30 px-4 py-5 text-sm text-muted-foreground">
          No teammate history found for {mainCharacter.actorName}.
        </div>
      ) : (
        <div className="space-y-5">
          {teammates.map((teammate) => (
            <div key={teammate.id} className="flex items-center gap-4">
              <Avatar className="h-11 w-11">
                <AvatarFallback>{getInitials(teammate.actorName)}</AvatarFallback>
              </Avatar>

              <div className="min-w-0">
                <div className="truncate text-[15px] font-medium text-foreground">
                  {teammate.actorName}
                </div>
                <div className="text-xs text-muted-foreground">
                  {teammate.count} fights
                  {teammate.serverId !== null ? ` | Server ${teammate.serverId}` : ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
