import type {
  ActorInfo,
  HistoryTargetRecord,
  MainActorRecord,
  SkillStats,
  TargetInfo,
} from "@/types/aion2dps";

export type BattleTargetSummary = {
  key: string;
  targetName: string;
  count: number;
  records: HistoryTargetRecord[];
  lastSeenAt: number;
};

export type BattleActorDpsPoint = {
  actorKey: string;
  actorName: string;
  serverId: number | null;
  dps: number;
  isMainCharacter: boolean;
};

export type BattleRecordChartGroup = {
  recordId: string;
  targetName: string;
  timestamp: number;
  label: string;
  actors: BattleActorDpsPoint[];
};

export function getSkillStatsDamage(stats?: SkillStats | null) {
  return Number(stats?.totalDamage ?? stats?.total_damage ?? 0);
}

export function getHistoryRecordTargetInfo(record: HistoryTargetRecord): TargetInfo | null {
  return record.combatInfos.targetInfos?.[String(record.targetId)] ?? null;
}

export function getHistoryRecordTimestamp(record: HistoryTargetRecord) {
  const targetInfo = getHistoryRecordTargetInfo(record);
  const lastTimes = Object.values(targetInfo?.targetLastTime ?? {});

  if (lastTimes.length > 0) {
    return Math.max(...lastTimes);
  }

  return 0;
}

export function formatHistoryRecordTime(timestampSeconds: number) {
  if (!timestampSeconds || !Number.isFinite(timestampSeconds)) {
    return "--";
  }

  return new Date(timestampSeconds * 1000).toLocaleString([], {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getMainActorId(record: HistoryTargetRecord, mainCharacter: MainActorRecord) {
  const declaredMainActorId = record.combatInfos.mainActorId;
  const declaredMainActor = declaredMainActorId
    ? record.combatInfos.actorInfos?.[String(declaredMainActorId)]
    : null;

  if (
    declaredMainActorId &&
    declaredMainActor?.actorName === mainCharacter.actorName &&
    Number(declaredMainActor?.actorServerId) === mainCharacter.serverId
  ) {
    return String(declaredMainActorId);
  }

  return (
    Object.entries(record.combatInfos.actorInfos ?? {}).find(([, actorInfo]) => {
      return (
        actorInfo?.actorName === mainCharacter.actorName &&
        Number(actorInfo?.actorServerId) === mainCharacter.serverId
      );
    })?.[0] ?? null
  );
}

export function getBattleTargetSummaries(
  historyRecords: HistoryTargetRecord[],
  mainCharacter: MainActorRecord | null
) {
  if (!mainCharacter) {
    return [];
  }

  const summaryMap = new Map<string, BattleTargetSummary>();

  for (const record of historyRecords) {
    const mainActorId = getMainActorId(record, mainCharacter);
    if (!mainActorId) {
      continue;
    }

    const targetInfo = getHistoryRecordTargetInfo(record);
    const targetName = targetInfo?.targetName?.trim() || `Target ${record.targetId}`;
    const targetKey =
      targetInfo?.targetMobCode && Number.isFinite(targetInfo.targetMobCode)
        ? `mob-${targetInfo.targetMobCode}`
        : `name-${targetName}`;
    const timestamp = getHistoryRecordTimestamp(record);
    const current = summaryMap.get(targetKey);

    if (current) {
      current.count += 1;
      current.records.push(record);
      current.lastSeenAt = Math.max(current.lastSeenAt, timestamp);
      continue;
    }

    summaryMap.set(targetKey, {
      key: targetKey,
      targetName,
      count: 1,
      records: [record],
      lastSeenAt: timestamp,
    });
  }

  return Array.from(summaryMap.values()).sort((a, b) => {
    if (a.count !== b.count) {
      return a.count - b.count;
    }
    if (a.lastSeenAt !== b.lastSeenAt) {
      return a.lastSeenAt - b.lastSeenAt;
    }
    return a.targetName.localeCompare(b.targetName, "zh-CN");
  });
}

function buildActorKey(actorInfo: ActorInfo | undefined, actorId: string) {
  const actorName = actorInfo?.actorName?.trim() || `Actor ${actorId}`;
  const serverId = actorInfo?.actorServerId ? Number(actorInfo.actorServerId) : null;
  return {
    actorKey: `${actorName}-${serverId ?? "unknown"}`,
    actorName,
    serverId,
  };
}

export function getBattleRecordChartGroups(
  summary: BattleTargetSummary | null,
  mainCharacter: MainActorRecord | null
) {
  if (!summary || !mainCharacter) {
    return [];
  }

  return summary.records
    .map((record) => {
      const mainActorId = getMainActorId(record, mainCharacter);
      if (!mainActorId) {
        return null;
      }

      const targetInfo = getHistoryRecordTargetInfo(record);
      const timestamp = getHistoryRecordTimestamp(record);
      const lastTime = Math.max(...Object.values(targetInfo?.targetLastTime ?? { fallback: 0 }));

      const actors = Object.entries(record.thisTargetAllPlayerStats ?? {})
        .map(([actorId, stats]) => {
          const actorInfo = record.combatInfos.actorInfos?.[actorId];
          const startTime = Number(targetInfo?.targetStartTime?.[actorId] ?? lastTime);
          const duration = Math.max(1, lastTime - startTime);
          const { actorKey, actorName, serverId } = buildActorKey(actorInfo, actorId);

          return {
            actorKey,
            actorName,
            serverId,
            dps: getSkillStatsDamage(stats) / duration,
            isMainCharacter: actorId === mainActorId,
          };
        })
        .sort((a, b) => {
          if (a.isMainCharacter !== b.isMainCharacter) {
            return a.isMainCharacter ? -1 : 1;
          }
          return b.dps - a.dps;
        });

      return {
        recordId: record.id,
        targetName: summary.targetName,
        timestamp,
        label: formatHistoryRecordTime(timestamp),
        actors,
      } satisfies BattleRecordChartGroup;
    })
    .filter((group): group is BattleRecordChartGroup => group !== null)
    .sort((a, b) => a.timestamp - b.timestamp);
}
