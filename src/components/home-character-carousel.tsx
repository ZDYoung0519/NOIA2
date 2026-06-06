import { useEffect, useMemo, useState } from "react";

import { LoaderCircle, Menu, RefreshCcw } from "lucide-react";

import { renderEquipSlotSmall } from "@/components/aion2/slot-equip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchFengwoV2 } from "@/lib/aion2/fetchFengwo";
import { getBattleRecordChartGroups, getBattleTargetSummaries } from "@/lib/dps-history-analysis";
import { getServerName, getServerShortName } from "@/lib/aion2/servers";
import { Aion2DpsHistory, Aion2MainActorHistory } from "@/lib/localStorageHistory";
import type { MainActorRecord } from "@/types/aion2dps";

type FengwoResult = {
  queryResult?: {
    data?: {
      profile?: {
        combatPower?: number;
      };
      stat?: {
        statList?: { type: string; value: number }[];
      };
      skill?: {
        skillList?: Array<{
          name: string;
          icon: string;
          category: string;
          skillLevel: number;
          needLevel: number;
          equip?: boolean;
        }>;
      };
      itemDetails?: Array<{
        slotPos: number;
        detail: {
          icon: string;
          name: string;
          grade: string;
          enchantLevel: number;
          exceedLevel: number;
        };
      }>;
    };
  };
  rating?: {
    scores?: {
      score?: number;
    };
  };
};

type CharacterDetailState = {
  loading: boolean;
  result: FengwoResult | null;
};

type RecentBossSummary = {
  key: string;
  name: string;
  count: number;
  maxDps: number;
  avgDps: number;
};

function formatLastSeenAt(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "未知";
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function LoadingPanel({ className }: { className: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-md border border-white/10 bg-white/6 text-white/70 ${className}`}
    >
      <LoaderCircle className="h-5 w-5 animate-spin" />
    </div>
  );
}

function StatPill({
  icon,
  alt,
  value,
  iconClassName,
}: {
  icon: string;
  alt: string;
  value: string;
  iconClassName: string;
}) {
  return (
    <div className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <img src={icon} alt={alt} className={iconClassName} />
      <span className="text-[15px] font-semibold text-white tabular-nums drop-shadow-[0_1px_6px_rgba(0,0,0,0.28)]">
        {value}
      </span>
    </div>
  );
}

function buildRecentBossSummaries(mainCharacter: MainActorRecord | null): RecentBossSummary[] {
  if (!mainCharacter) {
    return [];
  }

  return getBattleTargetSummaries(Aion2DpsHistory.get(), mainCharacter)
    .slice(0, 4)
    .map((summary) => {
      const dpsValues = getBattleRecordChartGroups(summary, mainCharacter)
        .map((group) => group.actors.find((actor) => actor.isMainCharacter)?.dps ?? 0)
        .filter((value) => Number.isFinite(value) && value > 0);

      const maxDps = dpsValues.length > 0 ? Math.max(...dpsValues) : 0;
      const avgDps =
        dpsValues.length > 0
          ? dpsValues.reduce((sum, value) => sum + value, 0) / dpsValues.length
          : 0;

      return {
        key: summary.key,
        name: summary.targetName,
        count: summary.count,
        maxDps,
        avgDps,
      };
    });
}

function formatDpsPerSecond(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "--/s";
  }

  return `${Math.round(value).toLocaleString("en-US")}/s`;
}

export function HomeCharacterCarousel() {
  const [actors, setActors] = useState<MainActorRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [detailState, setDetailState] = useState<CharacterDetailState>({
    loading: false,
    result: null,
  });

  const activeActor = actors[activeIndex] ?? null;
  const activeServerName = activeActor ? getServerName(activeActor.serverId) : "未知服务器";

  const loadActors = () => {
    const nextActors = Aion2MainActorHistory.get()
      .slice()
      .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

    setActors(nextActors);
    setActiveIndex(0);
  };

  const refreshActiveActor = () => {
    if (!activeActor) {
      return;
    }

    setDetailReloadKey((current) => current + 1);
  };

  useEffect(() => {
    loadActors();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!activeActor) {
      setDetailState({
        loading: false,
        result: null,
      });
      return () => {
        cancelled = true;
      };
    }

    setDetailState((current) => ({
      loading: true,
      result: current.result,
    }));

    void (async () => {
      try {
        const result = await fetchFengwoV2(
          activeActor.actorName,
          getServerShortName(activeActor.serverId)
        );
        if (cancelled) {
          return;
        }

        setDetailState({
          loading: false,
          result,
        });
      } catch (error) {
        console.error("fetch fengwo failed:", error);
        if (!cancelled) {
          setDetailState({
            loading: false,
            result: null,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeActor?.actorName, activeActor?.serverId, detailReloadKey]);

  const { combatPower, itemLevel, fengwoScore, equipmentList } = useMemo(() => {
    const result = detailState.result;
    const statList = result?.queryResult?.data?.stat?.statList ?? [];
    const equipment = result?.queryResult?.data?.itemDetails ?? [];

    return {
      combatPower: result?.queryResult?.data?.profile?.combatPower,
      itemLevel: statList.find((item) => item?.type === "ItemLevel")?.value,
      fengwoScore: result?.rating?.scores?.score,
      equipmentList: equipment,
    };
  }, [detailState.result]);

  const recentBosses = useMemo(() => buildRecentBossSummaries(activeActor), [activeActor]);
  return (
    <>
      <section className="rounded-md border border-white/15 bg-black/45 p-4 shadow-2xl backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setSwitchOpen(true)}
            className="flex min-w-0 cursor-pointer items-center gap-2 text-left transition hover:text-[#F4C06A]"
          >
            <Menu size={18} className="shrink-0" />
            <span className="truncate text-lg font-bold text-white hover:text-[#F4C06A]">
              {activeActor?.actorName ?? "主角色"}
            </span>
          </button>
          <div className="ml-4 flex shrink-0 items-center gap-3 text-xs">
            <span className="max-w-[96px] truncate text-white/80">{activeServerName}</span>
            <span className="whitespace-nowrap text-white/55">
              上次登录 {activeActor ? formatLastSeenAt(activeActor.lastSeenAt) : "--"}
            </span>
            <button
              type="button"
              onClick={refreshActiveActor}
              className="shrink-0 text-white/70 transition hover:text-white"
              aria-label="刷新当前角色"
              disabled={!activeActor}
            >
              <RefreshCcw size={17} />
            </button>
          </div>
        </div>

        {activeActor ? (
          <>
            {detailState.loading ? (
              <LoadingPanel className="h-[150px]" />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <StatPill
                    icon="/images/aion2/profile_level_icon_pc.png"
                    alt="Item level"
                    iconClassName="h-4.5 w-3.5 opacity-85"
                    value={String(itemLevel ?? "--")}
                  />

                  <StatPill
                    icon="/images/aion2/profile_power_icon_pc.png"
                    alt="Combat power"
                    iconClassName="h-4.5 w-4.5 opacity-85"
                    value={
                      typeof combatPower === "number" ? `${(combatPower / 1000).toFixed(1)}k` : "--"
                    }
                  />

                  <StatPill
                    icon="/images/aion2/fengwo.png"
                    alt="Fengwo score"
                    iconClassName="h-4.5 w-4.5 opacity-90"
                    value={typeof fengwoScore === "number" ? fengwoScore.toFixed(0) : "--"}
                  />
                </div>

                <div className="mt-4">
                  {equipmentList.length > 0 ? (
                    <div className="grid grid-cols-10 gap-2">
                      {equipmentList.map((eq) => (
                        <div key={eq.slotPos}>
                          {renderEquipSlotSmall({ eq, size: 8, text_size: 10 })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-md border border-dashed border-white/12 bg-white/4 px-4 py-6 text-center text-sm text-white/55">
                      暂无装备数据
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-4 space-y-3 border-t border-white/8 pt-3">
              <div className="px-1 py-1">
                <div className="mb-2 text-[11px] font-medium tracking-[0.08em] text-white/42 uppercase">
                  近期副本 Boss
                </div>
                {recentBosses.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentBosses.map((boss) => (
                      <div
                        key={boss.key}
                        className="border-b border-white/6 px-2 py-1.5 last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium text-white/80">
                            {boss.name}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-white/92 tabular-nums">
                            {boss.count}次
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/42">
                          <span className="font-medium text-[#F4C06A]">
                            最高 {formatDpsPerSecond(boss.maxDps)}
                          </span>
                          <span>平均 {formatDpsPerSecond(boss.avgDps)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-1 text-sm text-white/40">暂无副本记录</div>
                )}
              </div>

              {/* <div className="px-1 py-1">
                <div className="mb-2 text-[11px] font-medium tracking-[0.08em] text-white/42 uppercase">
                  近期合作队友
                </div>
                {recentTeammates.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentTeammates.map((teammate) => (
                      <div
                        key={teammate.id}
                        className="flex items-center justify-between gap-3 border-b border-white/6 px-2 py-1.5 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-white/80">
                            {teammate.actorName}
                          </div>
                          <div className="truncate text-[11px] text-white/38">
                            {teammate.serverId !== null
                              ? getServerName(teammate.serverId)
                              : "未知服务器"}
                          </div>
                        </div>
                        <span className="shrink-0 text-sm font-semibold text-white/92 tabular-nums">
                          {teammate.count}次
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-1 text-sm text-white/40">暂无队友记录</div>
                )}
              </div> */}
            </div>
          </>
        ) : (
          <div className="rounded-md border border-dashed border-white/12 bg-white/4 px-4 py-8 text-center text-sm text-white/55">
            暂无主角色记录
          </div>
        )}
      </section>

      <Dialog open={switchOpen} onOpenChange={setSwitchOpen}>
        <DialogContent className="bg-background/95 max-w-md border-white/10 text-white backdrop-blur-sm">
          <DialogHeader>
            <DialogTitle>切换角色</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {actors.length > 0 ? (
              actors.map((actor, index) => (
                <button
                  key={actor.id}
                  type="button"
                  onClick={() => {
                    setActiveIndex(index);
                    setSwitchOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left transition ${
                    index === activeIndex
                      ? "border-[#F4C06A]/60 bg-[#F4C06A]/10 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{actor.actorName}</div>
                    <div className="mt-1 text-xs text-white/55">
                      {getServerName(actor.serverId)} | 最近登录{" "}
                      {formatLastSeenAt(actor.lastSeenAt)}
                    </div>
                  </div>
                  <div className="ml-3 shrink-0 rounded-full bg-white/10 px-2 py-1 text-xs">
                    {getInitial(actor.actorName)}
                  </div>
                </button>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-white/12 bg-white/4 px-4 py-8 text-center text-sm text-white/55">
                暂无可切换角色
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
