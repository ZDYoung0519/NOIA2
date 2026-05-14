import { memo, useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Aion2DpsHistory } from "@/lib/localStorageHistory";
import { HistoryTargetRecord, SkillStats } from "@/types/aion2dps";

const getSkillStatsDamage = (stats?: SkillStats | null) => Number(stats?.total_damage ?? 0);

const getTargetTotalDamage = (playerStats?: Record<string, SkillStats> | null) =>
  Object.values(playerStats ?? {}).reduce((sum, stats) => sum + getSkillStatsDamage(stats), 0);

const getTargetLastTime = (record: HistoryTargetRecord) => {
  const targetInfo = record.combatInfos.targetInfos?.[String(record.targetId)];
  const lastTimes = Object.values(targetInfo?.targetLastTime ?? {});
  return lastTimes.length > 0 ? Math.max(...lastTimes) : 0;
};

const formatLocalRecordTime = (timestampSeconds: number) => {
  if (!timestampSeconds || !Number.isFinite(timestampSeconds)) return "--";
  return new Date(timestampSeconds * 1000).toLocaleTimeString();
};

type DpsHistoryProps = {
  selectedHistoryId: string | null;
  onSelect: (id: string, record: HistoryTargetRecord) => void;
  onClear: () => void;
};

export const MemoizedDpsHistory = memo(function DpsHistory({
  selectedHistoryId,
  onSelect,
  onClear,
}: DpsHistoryProps) {
  const [historyRecords, setHistoryRecords] = useState<HistoryTargetRecord[]>([]);

  useEffect(() => {
    setHistoryRecords(Aion2DpsHistory.get());
  }, []);

  const handleClear = useCallback(() => {
    Aion2DpsHistory.clear();
    setHistoryRecords([]);
    onClear();
  }, [onClear]);

  if (historyRecords.length === 0) {
    return (
      <aside className="w-30">
        <div className="flex min-h-24 items-center justify-center px-3 text-center text-sm text-slate-500">
          No history
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-30">
      <div className="flex items-center justify-between gap-2 px-1 py-1">
        <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-300 uppercase">
          History
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleClear}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-md transition",
                "bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white"
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Clear history</TooltipContent>
        </Tooltip>
      </div>

      <div
        className="max-h-[250px] overflow-y-auto p-0"
        style={{
          scrollbarColor: "rgba(148,163,184,0.35) transparent",
          scrollbarWidth: "thin",
        }}
      >
        <div className="space-y-0">
          {historyRecords.map((record) => {
            const recordTargetInfo = record.combatInfos.targetInfos?.[String(record.targetId)];
            const recordDamage = getTargetTotalDamage(record.thisTargetAllPlayerStats);
            const recordTime = getTargetLastTime(record);
            const isBoss = record.combatInfos.targetInfos?.[String(record.targetId)]?.isBoss;

            return (
              <button
                key={record.id}
                type="button"
                onClick={() => onSelect(record.id, record)}
                className={cn(
                  "w-full px-1.5 py-0.5 text-left transition",
                  selectedHistoryId === record.id
                    ? "border-cyan-400/40 bg-cyan-500/12 text-cyan-50"
                    : "border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]"
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 shrink-0 rounded-full",
                      record.uploaded ? "bg-green-400" : "bg-amber-400"
                    )}
                    title={record.uploaded ? "已上传" : "未上传"}
                  />
                  <div className="truncate text-sm font-semibold">
                    {recordTargetInfo?.targetName ||
                      `Mob ${recordTargetInfo?.targetMobCode}` ||
                      `Target ${record.targetId}`}
                  </div>
                  {isBoss && (
                    <span className="rounded-full border border-amber-300/30 bg-amber-400/10 px-0.5 py-0.5 text-[8px] text-amber-200 uppercase">
                      Boss
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[10px] text-slate-500">
                  <span className="truncate text-slate-400">{recordDamage.toLocaleString()}</span>
                  <span>{formatLocalRecordTime(recordTime)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
});
