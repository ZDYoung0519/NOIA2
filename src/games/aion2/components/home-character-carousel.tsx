import { useEffect, useMemo, useState } from "react";

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ExternalLink, LoaderCircle, Menu, RefreshCcw, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/custom-tooltip";
import { renderEquipSlotSmall } from "@/games/aion2/components/aion2_ui/slot-equip";
import { fetchFengwoV2 } from "@/games/aion2/lib/fetchFengwo";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { getServerName, getServerShortName } from "@/games/aion2/lib/servers";

import type { HistoryRecord, PlayerOverviewStat } from "@/games/aion2/types/aion2dps";

type FengwoResult = {
  queryResult?: {
    data?: {
      profile?: {
        combatPower?: number;
      };
      stat?: {
        statList?: { type: string; value: number }[];
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

type HistoryActor = {
  id: string;
  actorId: number;
  actorName: string;
  serverId: number | null;
  serverRaw: string;
  lastSeenAt: number;
  records: HistoryRecord[];
};

type RecentBossSummary = {
  key: string;
  name: string;
  count: number;
  maxDps: number;
  avgDps: number;
  lastSeenAt: number;
};

function parseServerId(value: string | null | undefined) {
  const serverId = Number(value);
  return Number.isFinite(serverId) ? serverId : null;
}

function formatLastSeenAt(timestamp: number, tFn: (k: string) => string) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return tFn("aion2Home.unknown");
  }

  return new Date(timestamp).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDpsPerSecond(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "--/s";
  }

  return `${Math.round(value).toLocaleString("en-US")}/s`;
}

function getInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function getTargetName(record: HistoryRecord) {
  return record.targetInfo?.targetName?.trim() || `Target ${record.targetId}`;
}

function getTargetKey(record: HistoryRecord) {
  const mobCode = record.targetInfo?.targetMobCode;
  if (typeof mobCode === "number" && Number.isFinite(mobCode)) {
    return `mob-${mobCode}`;
  }

  return `name-${getTargetName(record)}`;
}

function getMainPlayer(record: HistoryRecord): PlayerOverviewStat | null {
  const mainActorId = record.combatInfos.mainActorId;
  if (mainActorId) {
    return record.playerStats[String(mainActorId)] ?? null;
  }

  const mainActorName = record.combatInfos.mainActorName?.trim();
  if (!mainActorName) {
    return null;
  }

  return (
    Object.values(record.playerStats).find(
      (player) => player.actorName?.trim() === mainActorName
    ) ?? null
  );
}

function buildActors(records: HistoryRecord[]) {
  const actors = new Map<string, HistoryActor>();

  for (const record of records) {
    const player = getMainPlayer(record);
    if (!player?.actorName) {
      continue;
    }

    const actorName = player.actorName.trim();
    const serverRaw = String(player.actorServerId ?? "");
    const serverId = parseServerId(serverRaw);
    const key = `${actorName}-${serverRaw || "unknown"}`;
    const current = actors.get(key);

    if (current) {
      current.lastSeenAt = Math.max(current.lastSeenAt, record.createdAt);
      current.records.push(record);
      continue;
    }

    actors.set(key, {
      id: key,
      actorId: player.actorId,
      actorName,
      serverId,
      serverRaw,
      lastSeenAt: record.createdAt,
      records: [record],
    });
  }

  return Array.from(actors.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

function buildRecentBossSummaries(actor: HistoryActor | null): RecentBossSummary[] {
  if (!actor) {
    return [];
  }

  const summaries = new Map<string, RecentBossSummary & { dpsTotal: number }>();

  for (const record of actor.records) {
    const player = getMainPlayer(record);
    if (!player || player.actorName !== actor.actorName) {
      continue;
    }

    const key = getTargetKey(record);
    const dps = Number(player.dps ?? 0);
    const current = summaries.get(key);

    if (current) {
      current.count += 1;
      current.maxDps = Math.max(current.maxDps, dps);
      current.dpsTotal += dps;
      current.avgDps = current.dpsTotal / current.count;
      current.lastSeenAt = Math.max(current.lastSeenAt, record.createdAt);
      continue;
    }

    summaries.set(key, {
      key,
      name: getTargetName(record),
      count: 1,
      maxDps: dps,
      avgDps: dps,
      dpsTotal: dps,
      lastSeenAt: record.createdAt,
    });
  }

  return Array.from(summaries.values())
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
    .slice(0, 4);
}

export function HomeCharacterCarousel() {
  const { t } = useAppTranslation();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [deletingActorId, setDeletingActorId] = useState<string | null>(null);
  const [detailReloadKey, setDetailReloadKey] = useState(0);
  const [detailState, setDetailState] = useState<CharacterDetailState>({
    loading: false,
    result: null,
  });

  const actors = useMemo(() => buildActors(records), [records]);
  const activeActor = actors[activeIndex] ?? null;
  const activeServerName = activeActor?.serverId
    ? getServerShortName(activeActor.serverId)
    : t("aion2Home.unknownServer");
  const recentBosses = useMemo(() => buildRecentBossSummaries(activeActor), [activeActor]);

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      try {
        const nextRecords = await invoke<HistoryRecord[]>("get_history");
        if (!mounted) {
          return;
        }

        setRecords(nextRecords);
        setActiveIndex((current) =>
          Math.min(current, Math.max(0, buildActors(nextRecords).length - 1))
        );
      } catch (error) {
        console.error("load dps history failed:", error);
      }
    }

    void loadHistory();

    let unlisten: (() => void) | undefined;
    void listen("history-updated", () => {
      void loadHistory();
    }).then((handler) => {
      unlisten = handler;
    });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!activeActor) {
      setDetailState({ loading: false, result: null });
      return () => {
        cancelled = true;
      };
    }

    setDetailState((current) => ({ loading: true, result: current.result }));

    void (async () => {
      try {
        const serverShortName = activeActor.serverId
          ? getServerShortName(activeActor.serverId)
          : activeActor.serverRaw;
        const result = await fetchFengwoV2(activeActor.actorName, serverShortName);
        if (!cancelled) {
          setDetailState({ loading: false, result });
        }
      } catch (error) {
        console.error("fetch fengwo failed:", error);
        if (!cancelled) {
          setDetailState({ loading: false, result: null });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeActor, detailReloadKey]);

  const { combatPower, itemLevel, fengwoScore, equipmentList } = useMemo(() => {
    const result = detailState.result;
    const statList = result?.queryResult?.data?.stat?.statList ?? [];

    return {
      combatPower: result?.queryResult?.data?.profile?.combatPower,
      itemLevel: statList.find((item) => item?.type === "ItemLevel")?.value,
      fengwoScore: result?.rating?.scores?.score,
      equipmentList: result?.queryResult?.data?.itemDetails ?? [],
    };
  }, [detailState.result]);

  const characterLink =
    activeActor && activeActor.serverId
      ? `/aion2/character/view?serverId=${activeActor.serverId}&characterName=${activeActor.actorName}`
      : "/aion2/character";

  async function deleteActorHistory(actor: HistoryActor) {
    if (!window.confirm(`确定删除 ${actor.actorName} 的全部战斗历史吗？`)) {
      return;
    }

    setDeletingActorId(actor.id);
    try {
      await invoke<number>("delete_history_records", {
        ids: actor.records.map((record) => record.id),
      });
    } catch (error) {
      console.error("delete character history failed:", error);
    } finally {
      setDeletingActorId(null);
    }
  }

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
              {activeActor?.actorName ?? t("aion2Home.mainCharacter")}
            </span>
          </button>

          <div className="ml-4 flex shrink-0 items-center gap-3 text-xs">
            <span className="max-w-[96px] truncate text-white/80">{activeServerName}</span>
            <span className="whitespace-nowrap text-white/55">
              {t("aion2Home.lastLogin")}{" "}
              {activeActor ? formatLastSeenAt(activeActor.lastSeenAt, t) : "--"}
            </span>

            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  to={characterLink}
                  className="shrink-0 cursor-pointer text-white/70 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:text-white hover:shadow-2xl"
                >
                  <ExternalLink size={20} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" className="rounded-full px-3 py-1.5">
                查看角色详情
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDetailReloadKey((current) => current + 1)}
                  className="shrink-0 cursor-pointer text-white/70 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 hover:text-white hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={t("aion2Home.refresh")}
                  disabled={!activeActor}
                >
                  <RefreshCcw size={20} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="center" className="rounded-full px-3 py-1.5">
                刷新
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {activeActor ? (
          <>
            {detailState.loading ? (
              <div className="flex h-[150px] items-center justify-center rounded-md border border-white/10 bg-white/6 text-white/70">
                <LoaderCircle className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <img
                      src="/aion2/profile_level_icon_pc.png"
                      alt=""
                      className="h-4.5 w-3.5 opacity-85"
                    />
                    <span className="text-[15px] font-semibold text-white tabular-nums drop-shadow-[0_1px_6px_rgba(0,0,0,0.28)]">
                      {String(itemLevel ?? "--")}
                    </span>
                  </div>
                  <div className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <img
                      src="/aion2/profile_power_icon_pc.png"
                      alt=""
                      className="h-4.5 w-4.5 opacity-85"
                    />
                    <span className="text-[15px] font-semibold text-white tabular-nums drop-shadow-[0_1px_6px_rgba(0,0,0,0.28)]">
                      {typeof combatPower === "number"
                        ? `${(combatPower / 1000).toFixed(1)}k`
                        : "--"}
                    </span>
                  </div>
                  <div className="flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.045] px-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                    <img src="/aion2/fengwo.png" alt="" className="h-4.5 w-4.5 opacity-90" />
                    <span className="text-[15px] font-semibold text-white tabular-nums drop-shadow-[0_1px_6px_rgba(0,0,0,0.28)]">
                      {typeof fengwoScore === "number" ? fengwoScore.toFixed(0) : "--"}
                    </span>
                  </div>
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

            <div className="mt-4 border-t border-white/8 pt-3">
              <div className="px-1 py-1">
                <div className="mb-2 text-[11px] font-medium tracking-[0.08em] text-white/42 uppercase select-none">
                  {t("aion2Home.recentBosses")}
                </div>
                {recentBosses.length > 0 ? (
                  <div className="space-y-1.5">
                    {recentBosses.map((boss) => (
                      <div
                        key={boss.key}
                        className="border-b border-white/6 px-2 py-1.5 last:border-b-0"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="min-w-0 truncate text-sm font-medium text-white/80 select-none">
                            {boss.name}
                          </span>
                          <span className="shrink-0 text-sm font-semibold text-white/92 tabular-nums select-none">
                            {boss.count}
                            {t("aion2Home.times")}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-white/42 select-none">
                          <span className="font-medium text-[#F4C06A]">
                            {t("aion2Home.highest")} {formatDpsPerSecond(boss.maxDps)}
                          </span>
                          <span>
                            {t("aion2Home.average")} {formatDpsPerSecond(boss.avgDps)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-1 text-sm text-white/40">{t("aion2Home.noBossRecords")}</div>
                )}
              </div>
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
            <DialogTitle>{t("aion2Home.switchCharacter")}</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {actors.length > 0 ? (
              actors.map((actor, index) => (
                <div
                  key={actor.id}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left transition ${
                    index === activeIndex
                      ? "border-[#F4C06A]/60 bg-[#F4C06A]/10 text-white"
                      : "border-white/10 bg-white/5 text-white/80 hover:bg-white/10"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveIndex(index);
                      setSwitchOpen(false);
                    }}
                    className="min-w-0 flex-1 cursor-pointer text-left"
                  >
                    <div className="truncate font-semibold">{actor.actorName}</div>
                    <div className="mt-1 text-xs text-white/55">
                      {actor.serverId
                        ? getServerName(actor.serverId)
                        : actor.serverRaw || t("aion2Home.unknownServer")}{" "}
                      | {t("aion2Home.lastLogin")} {formatLastSeenAt(actor.lastSeenAt, t)}
                    </div>
                  </button>
                  <div className="ml-3 flex shrink-0 items-center gap-2">
                    <div className="rounded-full bg-white/10 px-2 py-1 text-xs">
                      {getInitial(actor.actorName)}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => void deleteActorHistory(actor)}
                          disabled={deletingActorId !== null}
                          className="cursor-pointer text-white/45 transition hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`删除 ${actor.actorName} 的历史记录`}
                        >
                          {deletingActorId === actor.id ? (
                            <LoaderCircle size={17} className="animate-spin" />
                          ) : (
                            <Trash2 size={17} />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left">删除角色历史</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
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
