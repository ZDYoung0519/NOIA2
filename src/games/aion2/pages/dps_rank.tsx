import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { BarChart3, Eye, LoaderCircle, RefreshCcw, Trophy } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { supabase } from "@/lib/supabase";

import { getKnownBossMobCodes, getNpcDisplayName } from "@/games/aion2/lib/npc-names";
import { getServerShortName } from "@/games/aion2/lib/servers";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import dungeonsData from "@/games/aion2/data/dungeons.json";
import skillNamesZhCN from "@/i18n/locales/aion2skills/zh-CN.json";
import type { BuffSummary, HistoryRecord, PlayerOverviewStat } from "@/games/aion2/types/aion2dps";

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
  FIGHTER: "拳星",
};

export function getActorClassName(actorClass: string | null | undefined) {
  if (!actorClass) {
    return "-";
  }
  return ACTOR_CLASS_NAME_MAP[actorClass] ?? actorClass;
}

type LocalizedText = Record<string, string | undefined>;

type DungeonDefinition = {
  dungeon_id: string;
  name: LocalizedText;
  difficulty: LocalizedText;
  boss_ids: number[];
};

type DungeonGroup = "expedition" | "transcendence" | "sanctuary" | "other";

type DungeonRow = {
  dungeon: DungeonDefinition;
  bossIds: string[];
};

type DungeonOption = {
  key: string;
  group: DungeonGroup;
  name: string;
  rows: DungeonRow[];
};

type RankRow = {
  id: number;
  record_id: string;
  battle_ended_at: string | null;
  target_name: string | null;
  main_actor_name: string;
  main_actor_server_id: string | null;
  main_actor_class: string | null;
  main_actor_damage: number;
  main_actor_battle_duration: number;
  main_actor_dps: number;
  team_dps: number | null;
};

type RankSkillStats = {
  counts?: number;
  totalDamage?: number;
  minDamage?: number;
  maxDamage?: number;
  specialCounts?: Record<string, number>;
};

type RankSkillDetails = Record<string, RankSkillStats>;

type PartyDpsPlayer = {
  actor_id: number;
  actor_name: string;
  server_id: string;
  actor_class: string;
  damage: number;
  duration_ms: number;
  dps: number;
};

const SKILL_NAMES = skillNamesZhCN as Record<string, string>;

type BossRankState = {
  loading: boolean;
  error: string | null;
  rows: RankRow[];
};

type ClassBoxStatRow = {
  id: number;
  target_mob_code: number;
  target_name: string | null;
  main_actor_class: string;
  sample_count: number;
  min_dps: number | null;
  q1_dps: number | null;
  median_dps: number | null;
  q3_dps: number | null;
  max_dps: number | null;
  avg_dps: number | null;
  refreshed_at: string | null;
};

type ClassBoxStatsState = {
  loading: boolean;
  error: string | null;
  rows: ClassBoxStatRow[];
};

type MainActorIdentity = {
  key: string;
  actorName: string;
  serverId: string;
  actorClass: string | null;
  lastSeenAt: number;
};

type MyRankRow = {
  actor: MainActorIdentity;
  loading: boolean;
  error: string | null;
  rank: number | null;
  row: RankRow | null;
};

type MyRankState = {
  loading: boolean;
  error: string | null;
  rows: MyRankRow[];
};

const EXTRA_ALLOWED_DPS_UPLOAD_MOB_CODES = ["2400032", "2400035"];
const ALLOWED_BOSS_IDS = [...getKnownBossMobCodes(), ...EXTRA_ALLOWED_DPS_UPLOAD_MOB_CODES];
const ALLOWED_BOSS_ID_SET = new Set(ALLOWED_BOSS_IDS.map(String));
const DUNGEONS = dungeonsData as DungeonDefinition[];
const TOP_LIMIT = 10;
const WEBP_REPLAY_INTERVAL_MS = 1000;

function Aion2Loading({ label }: { label: string }) {
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setReplayKey((current) => current + 1);
    }, WEBP_REPLAY_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <img
        key={replayKey}
        src={`/aion2.webp?replay=${replayKey}`}
        alt=""
        className="size-28 object-contain"
        draggable={false}
      />
      <span>{label}</span>
    </div>
  );
}

const DUNGEON_GROUPS: Array<{ key: DungeonGroup; label: string }> = [
  { key: "expedition", label: "远征" },
  { key: "transcendence", label: "超越" },
  { key: "sanctuary", label: "圣域" },
  { key: "other", label: "其他" },
];

const ACTOR_CLASSES = [
  "ALL",
  "GLADIATOR",
  "TEMPLAR",
  "ASSASSIN",
  "RANGER",
  "SORCERER",
  "ELEMENTALIST",
  "CLERIC",
  "CHANTER",
  "FIGHTER",
];

const CLASS_BOX_ORDER = ACTOR_CLASSES.filter((actorClass) => actorClass !== "ALL");

function getDungeonGroup(dungeonId: string): DungeonGroup {
  if (dungeonId.startsWith("0")) return "expedition";
  if (dungeonId.startsWith("1")) return "transcendence";
  if (dungeonId.startsWith("2")) return "sanctuary";
  return "other";
}

function localize(text: LocalizedText | undefined) {
  return text?.["zh-CN"] ?? text?.["zh-TW"] ?? text?.en ?? text?.ko ?? "-";
}

function createTrainingDummyDungeon(): DungeonDefinition {
  return {
    dungeon_id: "training-dummy",
    name: { "zh-CN": "木桩" },
    difficulty: { "zh-CN": "训练" },
    boss_ids: EXTRA_ALLOWED_DPS_UPLOAD_MOB_CODES.map(Number),
  };
}

function buildDungeonOptions() {
  const optionMap = new Map<string, DungeonOption>();
  const bossIdsInDungeon = new Set<string>();

  for (const dungeon of DUNGEONS) {
    const bossIds = dungeon.boss_ids
      .map(String)
      .filter((bossId) => ALLOWED_BOSS_ID_SET.has(bossId));

    if (bossIds.length === 0) continue;

    const group = getDungeonGroup(dungeon.dungeon_id);
    const name = localize(dungeon.name);
    const key = `${group}:${name}`;
    const option = optionMap.get(key) ?? {
      key,
      group,
      name,
      rows: [],
    };

    bossIds.forEach((bossId) => bossIdsInDungeon.add(bossId));
    option.rows.push({ dungeon, bossIds });
    optionMap.set(key, option);
  }

  const options = Array.from(optionMap.values()).map((option) => ({
    ...option,
    rows: option.rows.sort((left, right) =>
      left.dungeon.dungeon_id.localeCompare(right.dungeon.dungeon_id)
    ),
  }));

  const extraBossIds = ALLOWED_BOSS_IDS.filter((bossId) => !bossIdsInDungeon.has(String(bossId)));
  if (extraBossIds.length > 0) {
    options.push({
      key: "other:training-dummy",
      group: "other",
      name: "木桩",
      rows: [
        {
          dungeon: createTrainingDummyDungeon(),
          bossIds: extraBossIds.map(String),
        },
      ],
    });
  }

  return options.sort((left, right) => {
    const leftGroupIndex = DUNGEON_GROUPS.findIndex((group) => group.key === left.group);
    const rightGroupIndex = DUNGEON_GROUPS.findIndex((group) => group.key === right.group);
    if (leftGroupIndex !== rightGroupIndex) return leftGroupIndex - rightGroupIndex;

    const leftFirstId = left.rows[0]?.dungeon.dungeon_id ?? "";
    const rightFirstId = right.rows[0]?.dungeon.dungeon_id ?? "";
    return leftFirstId.localeCompare(rightFirstId);
  });
}

const DUNGEON_OPTIONS = buildDungeonOptions();

function groupDungeonOptions(options: DungeonOption[]) {
  const groups: Record<DungeonGroup, DungeonOption[]> = {
    expedition: [],
    transcendence: [],
    sanctuary: [],
    other: [],
  };

  for (const option of options) {
    groups[option.group].push(option);
  }

  return groups;
}

const DUNGEON_OPTIONS_BY_GROUP = groupDungeonOptions(DUNGEON_OPTIONS);

function getClassIconSrc(classCode: string | null | undefined) {
  if (!classCode || classCode === "ALL") return null;
  return `/aion2/class/${classCode.toLowerCase()}.webp`;
}

function ClassIcon({
  classCode,
  className,
}: {
  classCode: string | null | undefined;
  className?: string;
}) {
  const src = getClassIconSrc(classCode);
  if (!src) return null;

  return (
    <img
      src={src}
      alt=""
      className={cn("size-5 shrink-0 object-contain", className)}
      onError={(event) => {
        event.currentTarget.style.display = "none";
      }}
    />
  );
}

function ClassSelect({
  value,
  onValueChange,
}: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-10 min-w-[180px] border-white/10 bg-black/45 text-white">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {ACTOR_CLASSES.map((classCode) => (
            <SelectItem key={classCode} value={classCode}>
              <span className="flex items-center gap-2">
                <ClassIcon classCode={classCode} />
                <span>{classCode === "ALL" ? "全部职业" : getActorClassName(classCode)}</span>
              </span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function getDungeonBossIds(option: DungeonOption | undefined) {
  if (!option) return [];
  return [...new Set(option.rows.flatMap((row) => row.bossIds))];
}

function BossPicker({
  option,
  value,
  onValueChange,
}: {
  option: DungeonOption | undefined;
  value: string;
  onValueChange: (value: string) => void;
}) {
  const bossIds = getDungeonBossIds(option);

  return (
    <div className="flex items-start gap-3">
      <div className="mt-2 w-12 shrink-0 text-sm font-semibold text-white/55">Boss</div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {bossIds.map((bossId) => (
          <button
            key={bossId}
            type="button"
            onClick={() => onValueChange(bossId)}
            className={cn(
              "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              value === bossId
                ? "border-white/25 bg-white/15 text-white"
                : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:bg-white/[0.08] hover:text-white/85"
            )}
          >
            {getNpcDisplayName(bossId)}
          </button>
        ))}
      </div>
    </div>
  );
}

function formatNumber(value: number | null | undefined) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number) || number <= 0) return "-";
  return Math.round(number).toLocaleString("en-US");
}

function formatDate(value: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatServer(serverId: string | null) {
  if (!serverId) return "未知";

  const numericId = Number(serverId);
  if (Number.isFinite(numericId)) {
    return getServerShortName(numericId);
  }

  return serverId;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return "加载失败";
}

function getMainPlayer(record: HistoryRecord): PlayerOverviewStat | null {
  const mainActorId = record.combatInfos.mainActorId;
  if (mainActorId) {
    return record.playerStats[String(mainActorId)] ?? null;
  }

  const mainActorName = record.combatInfos.mainActorName?.trim();
  if (!mainActorName) return null;

  return (
    Object.values(record.playerStats).find(
      (player) => player.actorName?.trim() === mainActorName
    ) ?? null
  );
}

function buildMainActors(records: HistoryRecord[]) {
  const actors = new Map<string, MainActorIdentity>();

  for (const record of records) {
    const player = getMainPlayer(record);
    const actorName = player?.actorName?.trim();
    const serverId = String(player?.actorServerId ?? "").trim();
    if (!player || !actorName || !serverId) continue;

    const key = `${actorName}-${serverId}`;
    const current = actors.get(key);
    if (current) {
      current.lastSeenAt = Math.max(current.lastSeenAt, record.createdAt);
      if (!current.actorClass && player.actorClass) {
        current.actorClass = player.actorClass;
      }
      continue;
    }

    actors.set(key, {
      key,
      actorName,
      serverId,
      actorClass: player.actorClass || null,
      lastSeenAt: record.createdAt,
    });
  }

  return Array.from(actors.values()).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

async function loadMyRankForActor(
  bossId: string,
  actor: MainActorIdentity,
  actorClass: string
): Promise<MyRankRow> {
  let ownQuery = supabase
    .from("dps_leaderboard_v2")
    .select(
      [
        "id",
        "record_id",
        "battle_ended_at",
        "target_name",
        "main_actor_name:actor_name",
        "main_actor_server_id:server_id",
        "main_actor_class:actor_class",
        "main_actor_damage:damage",
        "main_actor_battle_duration:duration_ms",
        "main_actor_dps:dps",
        "team_dps",
      ].join(",")
    )
    .eq("target_mob_code", Number(bossId))
    .eq("actor_name", actor.actorName)
    .eq("server_id", actor.serverId)
    .order("dps", { ascending: false, nullsFirst: false })
    .order("damage", { ascending: false, nullsFirst: false })
    .limit(1);

  if (actorClass !== "ALL") {
    ownQuery = ownQuery.eq("actor_class", actorClass);
  }

  const { data, error } = await ownQuery;
  if (error) throw error;

  const row = ((data ?? [])[0] ?? null) as unknown as RankRow | null;
  if (!row) {
    return {
      actor,
      loading: false,
      error: null,
      rank: null,
      row: null,
    };
  }

  let countQuery = supabase
    .from("dps_leaderboard_v2")
    .select("record_id", { count: "exact", head: true })
    .eq("target_mob_code", Number(bossId))
    .gt("dps", Number(row.main_actor_dps ?? 0));

  if (actorClass !== "ALL") {
    countQuery = countQuery.eq("actor_class", actorClass);
  }

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  return {
    actor,
    loading: false,
    error: null,
    rank: (count ?? 0) + 1,
    row,
  };
}

function RankBadge({ rank }: { rank: number }) {
  const className =
    rank === 1
      ? "border-amber-300/35 bg-amber-300/15 text-amber-200"
      : rank === 2
        ? "border-slate-200/25 bg-slate-200/10 text-slate-100"
        : rank === 3
          ? "border-orange-300/25 bg-orange-300/10 text-orange-200"
          : "border-white/10 bg-white/5 text-white/55";

  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border text-xs font-bold shadow-lg",
        className
      )}
    >
      {rank}
    </span>
  );
}

function getRankRowClass(index: number) {
  if (index === 0) {
    return "[&>td]:border-amber-300/25 [&>td]:bg-amber-300/[0.075]";
  }
  if (index === 1) {
    return "[&>td]:border-slate-200/15 [&>td]:bg-slate-200/[0.045]";
  }
  if (index === 2) {
    return "[&>td]:border-orange-300/15 [&>td]:bg-orange-300/[0.045]";
  }
  return undefined;
}

function getSkillLookupCandidates(skillCode: string) {
  const raw = String(skillCode);
  const normalized = raw.slice(0, 8);
  const candidates = [raw, normalized];
  if (raw.length > 8) candidates.push(raw.slice(0, 8).replace(/\d$/, "0"));
  if (raw.length > 6) candidates.push(raw.slice(0, 6).padEnd(8, "0"));
  return [...new Set(candidates)];
}

function resolveSkillCode(skillCode: string) {
  return (
    getSkillLookupCandidates(skillCode).find((candidate) => SKILL_NAMES[candidate]) ??
    String(skillCode).slice(0, 8)
  );
}

function getSkillName(skillCode: string) {
  const resolved = resolveSkillCode(skillCode);
  return SKILL_NAMES[resolved] ?? `Skill #${skillCode}`;
}

function getSkillIcon(skillCode: string) {
  const resolved = resolveSkillCode(skillCode);
  const iconCode = resolved.length === 6 ? resolved : resolved.slice(0, 4);
  return `/aion2/skill/${iconCode}.png`;
}

function getSpecialRate(stats: RankSkillStats, key: string) {
  const count = Number(stats.counts ?? 0);
  const specialCount = Number(stats.specialCounts?.[key] ?? 0);
  return count > 0 ? `${((specialCount / count) * 100).toFixed(1)}%` : "--";
}

function formatDurationMs(durationMs: number) {
  const seconds = durationMs / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.floor(seconds % 60)).padStart(2, "0")}s`;
}

function BuffSection({ title, buffs }: { title: string; buffs: BuffSummary[] }) {
  const sortedBuffs = [...buffs].sort(
    (left, right) => Number(right.coverage ?? 0) - Number(left.coverage ?? 0)
  );

  return (
    <details open className="group shrink-0 rounded-lg border border-white/10 bg-black/15">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-white/75">
        <span>{title}</span>
        <span className="flex items-center gap-2 text-xs text-white/35">
          {sortedBuffs.length} 个
          <span className="transition-transform group-open:rotate-180">▾</span>
        </span>
      </summary>
      <div className="grid grid-cols-6 gap-2 border-t border-white/8 p-2">
        {sortedBuffs.length === 0 ? (
          <div className="col-span-full py-6 text-center text-sm text-white/35">
            暂无 {title} 数据
          </div>
        ) : (
          sortedBuffs.map((buff, index) => {
            const coverage = Math.max(0, Math.min(100, Number(buff.coverage ?? 0) * 100));
            const skillCode = String(buff.skillCode);
            return (
              <div
                key={`${buff.skillCode}-${buff.actorId}-${index}`}
                className="flex min-w-0 items-center gap-2 rounded-md border border-white/8 bg-white/[0.025] p-2"
              >
                <img
                  src={getSkillIcon(skillCode)}
                  alt=""
                  className="size-8 shrink-0 rounded-md border border-white/10 object-cover shadow-md"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-medium text-white/80">
                      {getSkillName(skillCode)}
                    </span>
                    <span className="shrink-0 text-[10px] font-medium text-amber-300">
                      {coverage >= 99.95 ? "100%" : `${coverage.toFixed(1)}%`}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.045]">
                    <div
                      className="h-full min-w-0.5 rounded-full bg-gradient-to-r from-orange-100 via-pink-300 to-rose-400"
                      style={{ width: `${coverage}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </details>
  );
}

function SkillDetailsButton({ row }: { row: RankRow }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<RankSkillDetails | null>(null);
  const [playerBuffs, setPlayerBuffs] = useState<BuffSummary[]>([]);
  const [bossBuffs, setBossBuffs] = useState<BuffSummary[]>([]);
  const [partyDps, setPartyDps] = useState<PartyDpsPlayer[]>([]);

  const loadDetails = async () => {
    setOpen(true);
    if (details || loading) return;

    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from("dps_leaderboard_v2")
      .select("skill_details,player_buffs,boss_buffs,party_dps")
      .eq("id", row.id)
      .single();

    if (queryError) {
      setError(getErrorMessage(queryError));
    } else {
      setDetails((data?.skill_details ?? {}) as RankSkillDetails);
      setPlayerBuffs((data?.player_buffs ?? []) as BuffSummary[]);
      setBossBuffs((data?.boss_buffs ?? []) as BuffSummary[]);
      setPartyDps((data?.party_dps ?? []) as PartyDpsPlayer[]);
    }
    setLoading(false);
  };

  const skills = Object.entries(details ?? {}).sort(
    ([, left], [, right]) => Number(right.totalDamage ?? 0) - Number(left.totalDamage ?? 0)
  );
  const totalDamage = skills.reduce((sum, [, stats]) => sum + Number(stats.totalDamage ?? 0), 0);
  const totalHits = skills.reduce((sum, [, stats]) => sum + Number(stats.counts ?? 0), 0);
  const maxPartyDamage = Math.max(1, ...partyDps.map((player) => Number(player.damage ?? 0)));
  const partyTotalDamage = partyDps.reduce((sum, player) => sum + Number(player.damage ?? 0), 0);

  return (
    <>
      <Button type="button" variant="ghost" size="xs" onClick={() => void loadDetails()}>
        <Eye data-icon="inline-start" />
        详情
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-background/95 h-[min(90vh,920px)] w-[calc(100vw-2rem)] max-w-[1600px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-white/10 text-white backdrop-blur-sm sm:max-w-[min(96vw,1600px)]">
          <DialogHeader>
            <DialogTitle>{row.main_actor_name} · 技能详情</DialogTitle>
            <DialogDescription>
              {formatDate(row.battle_ended_at)} · DPS {formatNumber(row.main_actor_dps)}
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-[320px_minmax(0,1fr)] gap-3 overflow-hidden">
            <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-white/10 bg-black/20">
              <div className="flex items-center justify-between border-b border-white/8 px-3 py-2.5">
                <span className="text-sm font-semibold text-white/85">队伍 DPS</span>
                <span className="text-xs text-white/35">{partyDps.length} 人</span>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {partyDps.length === 0 ? (
                  <div className="py-10 text-center text-sm text-white/35">暂无队伍数据</div>
                ) : (
                  partyDps.map((player, index) => {
                    const isMain =
                      player.actor_name === row.main_actor_name &&
                      player.server_id === row.main_actor_server_id;
                    const damageShare =
                      partyTotalDamage > 0 ? (Number(player.damage) / partyTotalDamage) * 100 : 0;
                    return (
                      <div
                        key={`${player.server_id}-${player.actor_name}-${index}`}
                        className={`relative mb-1 h-12 overflow-hidden rounded-md ${isMain ? "ring-1 ring-yellow-300/35" : ""}`}
                      >
                        <div
                          className={`absolute inset-y-1 left-0 rounded-r ${isMain ? "bg-yellow-400/18" : "bg-sky-400/12"}`}
                          style={{ width: `${(Number(player.damage) / maxPartyDamage) * 100}%` }}
                        />
                        <div className="relative flex h-full items-center gap-2 px-2">
                          <span className="w-5 shrink-0 text-center text-xs font-semibold text-white/35">
                            {index + 1}
                          </span>
                          <img
                            src={getClassIconSrc(player.actor_class) ?? ""}
                            alt=""
                            className="size-7 shrink-0 rounded object-cover"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-baseline gap-1">
                              <span className="truncate text-sm font-medium text-white/85">
                                {player.actor_name}
                              </span>
                              <span className="shrink-0 text-[10px] text-white/35">
                                {formatServer(player.server_id)}
                              </span>
                            </div>
                            <div className="text-xs font-medium text-emerald-300 tabular-nums">
                              {formatNumber(player.dps)} DPS
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-xs text-white/65 tabular-nums">
                              {formatNumber(player.damage)}
                            </div>
                            <div className="text-[10px] text-white/35 tabular-nums">
                              {damageShare.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </aside>

            <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto pr-1">
              <div className="grid grid-cols-5 gap-2">
                {[
                  ["伤害", formatNumber(row.main_actor_damage), "text-white/90"],
                  ["DPS", formatNumber(row.main_actor_dps), "text-emerald-300"],
                  ["队伍 DPS", formatNumber(row.team_dps), "text-cyan-300"],
                  ["战斗", formatDurationMs(row.main_actor_battle_duration), "text-white/90"],
                  ["命中", formatNumber(totalHits), "text-white/90"],
                ].map(([label, value, valueClass]) => (
                  <div
                    key={label}
                    className="rounded-md border border-white/8 bg-white/[0.025] px-3 py-2"
                  >
                    <div className="text-[11px] tracking-wide text-white/35 uppercase">{label}</div>
                    <div className={`mt-0.5 text-base font-semibold tabular-nums ${valueClass}`}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="min-h-[360px] shrink-0 overflow-auto rounded-lg border border-white/10 bg-black/15 shadow-inner">
                {loading ? (
                  <div className="p-10 text-sm text-white/55">
                    <Aion2Loading label="正在查询技能详情..." />
                  </div>
                ) : error ? (
                  <div className="text-destructive p-10 text-center text-sm">{error}</div>
                ) : skills.length === 0 ? (
                  <div className="p-10 text-center text-sm text-white/45">暂无技能详情</div>
                ) : (
                  <table className="w-full min-w-[1060px] border-collapse text-sm tabular-nums">
                    <thead className="sticky top-0 bg-[#070a10]/95 text-xs tracking-[0.08em] text-white/40 uppercase shadow-lg">
                      <tr>
                        <th className="px-3 py-2.5 text-left">技能</th>
                        <th className="px-2 py-2.5 text-right">次数</th>
                        <th className="px-2 py-2.5 text-right">暴击%</th>
                        <th className="px-2 py-2.5 text-right">完美%</th>
                        <th className="px-2 py-2.5 text-right">双击%</th>
                        <th className="px-2 py-2.5 text-right">正面%</th>
                        <th className="px-2 py-2.5 text-right">背击%</th>
                        <th className="px-2 py-2.5 text-right">招架%</th>
                        <th className="px-2 py-2.5 text-right">多段%</th>
                        <th className="px-2 py-2.5 text-right">最低</th>
                        <th className="px-2 py-2.5 text-right">最高</th>
                        <th className="px-2 py-2.5 text-right">平均</th>
                        <th className="min-w-48 px-3 py-2.5 text-right">总伤害</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skills.map(([skillCode, stats]) => {
                        const damage = Number(stats.totalDamage ?? 0);
                        const share = totalDamage > 0 ? (damage / totalDamage) * 100 : 0;
                        const count = Number(stats.counts ?? 0);
                        const average = count > 0 ? Math.floor(damage / count) : 0;
                        return (
                          <tr
                            key={skillCode}
                            className="border-t border-white/[0.04] transition odd:bg-white/[0.012] hover:bg-white/[0.052] hover:shadow-[inset_2px_0_0_rgba(250,204,21,0.58)]"
                          >
                            <td className="px-3 py-2 text-left">
                              <div
                                className="flex min-w-0 items-center gap-2"
                                title={`${getSkillName(skillCode)} (${skillCode})`}
                              >
                                <img
                                  src={getSkillIcon(skillCode)}
                                  alt=""
                                  className="size-7 shrink-0 rounded-md border border-white/10 object-cover shadow-md"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                                <div className="min-w-0">
                                  <div className="max-w-36 truncate font-medium text-white/85">
                                    {getSkillName(skillCode)}
                                  </div>
                                  <div className="text-[10px] text-white/30">{skillCode}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right text-white/70">
                              {formatNumber(count)}
                            </td>
                            <td className="px-2 py-2 text-right text-rose-300">
                              {getSpecialRate(stats, "CRITICAL")}
                            </td>
                            <td className="px-2 py-2 text-right text-emerald-300">
                              {getSpecialRate(stats, "PERFECT")}
                            </td>
                            <td className="px-2 py-2 text-right text-yellow-300">
                              {getSpecialRate(stats, "DOUBLE")}
                            </td>
                            <td className="px-2 py-2 text-right text-cyan-300">
                              {getSpecialRate(stats, "FRONT")}
                            </td>
                            <td className="px-2 py-2 text-right text-indigo-300">
                              {getSpecialRate(stats, "BACK")}
                            </td>
                            <td className="px-2 py-2 text-right text-white/65">
                              {getSpecialRate(stats, "PARRY")}
                            </td>
                            <td className="px-2 py-2 text-right text-rose-300">
                              {getSpecialRate(stats, "MULTIHIT")}
                            </td>
                            <td className="px-2 py-2 text-right text-white/65">
                              {formatNumber(stats.minDamage)}
                            </td>
                            <td className="px-2 py-2 text-right text-white/65">
                              {formatNumber(stats.maxDamage)}
                            </td>
                            <td className="px-2 py-2 text-right text-white/65">
                              {formatNumber(average)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="relative overflow-hidden rounded bg-white/[0.025] px-2 py-1 whitespace-nowrap">
                                <div
                                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-400/20 to-yellow-400/8"
                                  style={{ width: `${share}%` }}
                                />
                                <span className="relative font-medium text-amber-300">
                                  {formatNumber(damage)} ({share.toFixed(1)}%)
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <BuffSection title="个人 Buff" buffs={playerBuffs} />
              <BuffSection title="Boss Buff" buffs={bossBuffs} />
            </section>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BossRankCard({
  bossId,
  actorClass,
  refreshKey,
  mainActors,
  mainActorsLoading,
  mainActorsError,
}: {
  bossId: string;
  actorClass: string;
  refreshKey: number;
  mainActors: MainActorIdentity[];
  mainActorsLoading: boolean;
  mainActorsError: string | null;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<BossRankState>({
    loading: true,
    error: null,
    rows: [],
  });
  const [myRankState, setMyRankState] = useState<MyRankState>({
    loading: true,
    error: null,
    rows: [],
  });

  useEffect(() => {
    let cancelled = false;

    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    void (async () => {
      try {
        let query = supabase
          .from("dps_leaderboard_v2")
          .select(
            [
              "id",
              "record_id",
              "battle_ended_at",
              "target_name",
              "main_actor_name:actor_name",
              "main_actor_server_id:server_id",
              "main_actor_class:actor_class",
              "main_actor_damage:damage",
              "main_actor_battle_duration:duration_ms",
              "main_actor_dps:dps",
              "team_dps",
            ].join(",")
          )
          .eq("target_mob_code", Number(bossId))
          .order("dps", { ascending: false, nullsFirst: false })
          .order("damage", { ascending: false, nullsFirst: false })
          .limit(TOP_LIMIT);

        if (actorClass !== "ALL") {
          query = query.eq("actor_class", actorClass);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            rows: (data ?? []) as unknown as RankRow[],
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: getErrorMessage(error),
            rows: [],
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [actorClass, bossId, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    if (mainActorsLoading) {
      setMyRankState((current) => ({
        ...current,
        loading: true,
        error: null,
      }));
      return () => {
        cancelled = true;
      };
    }

    if (mainActorsError) {
      setMyRankState({
        loading: false,
        error: mainActorsError,
        rows: [],
      });
      return () => {
        cancelled = true;
      };
    }

    const visibleActors =
      actorClass === "ALL"
        ? mainActors
        : mainActors.filter((actor) => actor.actorClass === actorClass);

    if (visibleActors.length === 0) {
      setMyRankState({
        loading: false,
        error: null,
        rows: [],
      });
      return () => {
        cancelled = true;
      };
    }

    setMyRankState({
      loading: true,
      error: null,
      rows: [],
    });

    void (async () => {
      const rows = await Promise.all(
        visibleActors.map(async (actor): Promise<MyRankRow> => {
          try {
            return await loadMyRankForActor(bossId, actor, actorClass);
          } catch (error) {
            return {
              actor,
              loading: false,
              error: getErrorMessage(error),
              rank: null,
              row: null,
            };
          }
        })
      );

      if (!cancelled) {
        setMyRankState({
          loading: false,
          error: null,
          rows,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [actorClass, bossId, mainActors, mainActorsError, mainActorsLoading, refreshKey]);

  const bossName = state.rows[0]?.target_name || getNpcDisplayName(bossId);
  const bestActorName = state.rows[0]?.main_actor_name;
  const bestDps = state.rows[0]?.main_actor_dps ?? 0;

  return (
    <section className="relative min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/35 p-5 shadow-lg backdrop-blur-xl">
      <div className="relative mb-5 flex items-start justify-between gap-3 border-b border-white/8 pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="flex size-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/70">
              <Trophy className="size-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-lg font-bold text-white">{bossName}</h3>
              <div className="mt-0.5 text-xs text-white/42">
                {actorClass === "ALL" ? "全部职业" : getActorClassName(actorClass)} · Top{" "}
                {TOP_LIMIT}
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/45">
              #{bossId}
            </span>
          </div>
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          <div className="text-[11px] font-medium tracking-[0.08em] text-white/38 uppercase">
            当前最高 DPS
          </div>
          <div className="mt-0.5 text-xl font-semibold whitespace-nowrap text-white tabular-nums">
            {formatNumber(bestDps)} <span className="text-xs font-medium text-white/35">/s</span>
          </div>
          <div className="mt-0.5 text-xs text-white/45">{bestActorName ?? "暂无记录"}</div>
        </div>
      </div>

      {state.loading ? (
        <div className="flex h-[245px] items-center justify-center rounded-md border border-white/10 bg-white/[0.025] text-sm text-white/55">
          <Aion2Loading label="加载中" />
        </div>
      ) : state.error ? (
        <div className="flex h-[245px] items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 px-4 text-center text-sm text-red-200">
          {state.error}
        </div>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[900px] border-separate border-spacing-y-2 text-sm">
            <thead className="text-[11px] tracking-[0.12em] text-white/35 uppercase">
              <tr>
                <th className="w-16 px-4 py-1 text-left">排名</th>
                <th className="px-4 py-1 text-left">角色</th>
                <th className="px-4 py-1 text-right">DPS</th>
                <th className="px-4 py-1 text-right">总伤害</th>
                <th className="px-4 py-1 text-right">战斗记录</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-white/40">
                    暂无排行记录
                  </td>
                </tr>
              ) : null}

              {state.rows.map((row, index) => (
                <tr
                  key={`${row.id}-${row.record_id}`}
                  className={cn("group relative transition", getRankRowClass(index))}
                >
                  <td className="rounded-l-lg border-y border-l border-white/8 bg-white/[0.025] px-4 py-3.5 backdrop-blur-md transition group-hover:bg-white/[0.06]">
                    <RankBadge rank={index + 1} />
                  </td>
                  <td className="border-y border-white/8 bg-white/[0.025] px-4 py-3.5 backdrop-blur-md transition group-hover:bg-white/[0.06]">
                    <div className="flex min-w-0 items-center gap-3">
                      <ClassIcon classCode={row.main_actor_class} className="size-11" />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`/aion2/character/view?serverId=${row.main_actor_server_id || ""}&characterName=${encodeURIComponent(row.main_actor_name)}`}
                              className="w-fit max-w-full truncate border-b border-transparent font-semibold text-white transition-colors hover:border-white/35 hover:text-white"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(
                                  `/aion2/character/view?serverId=${row.main_actor_server_id || ""}&characterName=${encodeURIComponent(row.main_actor_name)}`
                                );
                              }}
                            >
                              {row.main_actor_name}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent side="top">前往查看角色详情</TooltipContent>
                        </Tooltip>
                        <span className="text-xs text-white/40">
                          {getActorClassName(row.main_actor_class)} ·{" "}
                          {formatServer(row.main_actor_server_id)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="border-y border-white/8 bg-white/[0.025] px-4 py-3.5 text-right text-xl font-semibold text-white tabular-nums backdrop-blur-md transition group-hover:bg-white/[0.06]">
                    {formatNumber(row.main_actor_dps)}{" "}
                    <span className="text-[10px] font-medium text-white/30">/s</span>
                  </td>
                  <td className="border-y border-white/8 bg-white/[0.025] px-4 py-3.5 text-right text-white/70 tabular-nums backdrop-blur-md transition group-hover:bg-white/[0.06]">
                    {formatNumber(row.main_actor_damage)}
                  </td>
                  <td className="rounded-r-lg border-y border-r border-white/8 bg-white/[0.025] px-4 py-3.5 text-right text-white/45 tabular-nums backdrop-blur-md transition group-hover:bg-white/[0.06]">
                    <div className="flex flex-col items-end gap-1">
                      <span>{formatDate(row.battle_ended_at)}</span>
                      <SkillDetailsButton row={row} />
                    </div>
                  </td>
                </tr>
              ))}

              <tr className="border-t border-[#F4C06A]/25 bg-[#F4C06A]/[0.08]">
                <td
                  colSpan={5}
                  className="px-3 py-2 text-[11px] font-semibold tracking-[0.08em] text-[#F4C06A]/85 uppercase"
                >
                  我的排名
                </td>
              </tr>

              {myRankState.loading ? (
                <tr className="border-t border-[#F4C06A]/15 bg-[#F4C06A]/[0.045]">
                  <td colSpan={5} className="px-3 py-3 text-sm text-white/50">
                    <span className="inline-flex items-center">
                      <LoaderCircle className="mr-2 size-4 animate-spin" />
                      正在查询角色排名...
                    </span>
                  </td>
                </tr>
              ) : myRankState.error ? (
                <tr className="border-t border-[#F4C06A]/15 bg-[#F4C06A]/[0.045]">
                  <td colSpan={5} className="px-3 py-3 text-sm text-red-200">
                    {myRankState.error}
                  </td>
                </tr>
              ) : myRankState.rows.length === 0 ? (
                <tr className="border-t border-[#F4C06A]/15 bg-[#F4C06A]/[0.045]">
                  <td colSpan={5} className="px-3 py-3 text-sm text-white/45">
                    无
                  </td>
                </tr>
              ) : (
                myRankState.rows.map((myRank) => (
                  <tr
                    key={`my-${myRank.actor.key}`}
                    className="border-t border-[#F4C06A]/15 bg-[#F4C06A]/[0.045] transition hover:bg-[#F4C06A]/[0.075]"
                  >
                    <td className="px-1 py-2.5">
                      {myRank.rank ? (
                        <RankBadge rank={myRank.rank} />
                      ) : (
                        <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-[#F4C06A]/20 bg-black/20 px-2 text-xs font-bold text-white/45">
                          无
                        </span>
                      )}
                    </td>
                    <td className="px-0 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <ClassIcon classCode={myRank.actor.actorClass} className="size-9" />
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`/aion2/character/view?serverId=${myRank.actor.serverId}&characterName=${encodeURIComponent(myRank.actor.actorName)}`}
                              className="max-w-32 truncate border-b border-transparent font-semibold text-white transition-colors hover:border-white/35"
                              onClick={(e) => {
                                e.preventDefault();
                                navigate(
                                  `/aion2/character/view?serverId=${myRank.actor.serverId}&characterName=${encodeURIComponent(myRank.actor.actorName)}`
                                );
                              }}
                            >
                              {myRank.actor.actorName}
                            </a>
                          </TooltipTrigger>
                          <TooltipContent side="top">前往查看角色详情</TooltipContent>
                        </Tooltip>
                        <span className="shrink-0 text-xs text-white/45">
                          {formatServer(myRank.actor.serverId)}
                        </span>
                      </div>
                    </td>
                    {myRank.error ? (
                      <td colSpan={3} className="px-1 py-2.5 text-right text-red-200">
                        加载失败
                      </td>
                    ) : (
                      <>
                        <td className="px-1 py-2.5 text-right font-semibold text-[#F4C06A] tabular-nums">
                          {formatNumber(myRank.row?.main_actor_dps)}
                        </td>
                        <td className="px-1 py-2.5 text-right text-white/70 tabular-nums">
                          {formatNumber(myRank.row?.main_actor_damage)}
                        </td>
                        <td className="px-1 py-2.5 text-right text-white/45 tabular-nums">
                          <div className="flex flex-col items-end gap-1">
                            <span>{formatDate(myRank.row?.battle_ended_at ?? null)}</span>
                            {myRank.row ? <SkillDetailsButton row={myRank.row} /> : null}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function getFiniteDps(value: number | null | undefined) {
  const numericValue = Number(value ?? 0);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : 0;
}

function ClassBoxPlot({ row, maxDps }: { row: ClassBoxStatRow; maxDps: number }) {
  const min = getFiniteDps(row.min_dps);
  const q1 = getFiniteDps(row.q1_dps);
  const median = getFiniteDps(row.median_dps);
  const q3 = getFiniteDps(row.q3_dps);
  const max = getFiniteDps(row.max_dps);
  const scale = Math.max(1, maxDps);

  const pct = (value: number) => `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;
  const boxLeft = pct(q1);
  const boxWidth = `${Math.max(1, ((q3 - q1) / scale) * 100)}%`;

  return (
    <div className="relative h-9 min-w-[220px] flex-1">
      <div className="absolute top-1/2 right-0 left-0 h-px -translate-y-1/2 bg-white/10" />
      <div
        className="absolute top-1/2 h-px -translate-y-1/2 bg-white/35"
        style={{ left: pct(min), width: `${Math.max(1, ((max - min) / scale) * 100)}%` }}
      />
      <div
        className="absolute top-1/2 h-5 -translate-y-1/2 rounded-sm border border-[#F4C06A]/45 bg-[#F4C06A]/18"
        style={{ left: boxLeft, width: boxWidth }}
      />
      <div
        className="absolute top-1/2 h-7 w-px -translate-y-1/2 bg-[#F4C06A]"
        style={{ left: pct(median) }}
      />
      {[min, max].map((value, index) => (
        <div
          key={`${row.main_actor_class}-${index}-${value}`}
          className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-white/45"
          style={{ left: pct(value) }}
        />
      ))}
    </div>
  );
}

function BossClassBoxStatsCard({ bossId, refreshKey }: { bossId: string; refreshKey: number }) {
  const [state, setState] = useState<ClassBoxStatsState>({
    loading: true,
    error: null,
    rows: [],
  });

  useEffect(() => {
    let cancelled = false;

    setState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    void (async () => {
      try {
        const { data, error } = await supabase
          .from("aion2_dps_class_box_stats_v2")
          .select(
            [
              "id",
              "target_mob_code",
              "target_name",
              "main_actor_class",
              "sample_count",
              "min_dps",
              "q1_dps",
              "median_dps",
              "q3_dps",
              "max_dps",
              "avg_dps",
              "refreshed_at",
            ].join(",")
          )
          .eq("target_mob_code", Number(bossId))
          .order("median_dps", { ascending: false, nullsFirst: false })
          .order("sample_count", { ascending: false, nullsFirst: false });

        if (error) throw error;

        const classOrder = new Map(CLASS_BOX_ORDER.map((actorClass, index) => [actorClass, index]));
        const rows = ((data ?? []) as unknown as ClassBoxStatRow[]).sort((left, right) => {
          const medianDiff = getFiniteDps(right.median_dps) - getFiniteDps(left.median_dps);
          if (medianDiff !== 0) return medianDiff;
          return (
            (classOrder.get(left.main_actor_class) ?? 999) -
            (classOrder.get(right.main_actor_class) ?? 999)
          );
        });

        if (!cancelled) {
          setState({
            loading: false,
            error: null,
            rows,
          });
        }
      } catch (error) {
        if (!cancelled) {
          setState({
            loading: false,
            error: getErrorMessage(error),
            rows: [],
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bossId, refreshKey]);

  const bossName = state.rows[0]?.target_name || getNpcDisplayName(bossId);
  const maxDps = Math.max(1, ...state.rows.map((row) => getFiniteDps(row.max_dps)));
  const totalSamples = state.rows.reduce((sum, row) => sum + Number(row.sample_count ?? 0), 0);
  const refreshedAt = state.rows[0]?.refreshed_at ?? null;

  return (
    <section className="min-w-0 rounded-md border border-white/15 bg-black/45 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-white">{bossName}</h3>
            <span className="shrink-0 rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-white/45">
              #{bossId}
            </span>
          </div>
          <div className="mt-1 text-xs text-white/42">样本 {totalSamples.toLocaleString()}</div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-[11px] font-medium tracking-[0.08em] text-white/38 uppercase">
            Updated
          </div>
          <div className="mt-0.5 text-sm font-semibold whitespace-nowrap text-white/55">
            {formatDate(refreshedAt)}
          </div>
        </div>
      </div>

      {state.loading ? (
        <div className="flex h-[320px] items-center justify-center rounded-md border border-white/10 bg-white/[0.025] text-sm text-white/55">
          <Aion2Loading label="加载中" />
        </div>
      ) : state.error ? (
        <div className="flex h-[320px] items-center justify-center rounded-md border border-red-500/25 bg-red-500/10 px-4 text-center text-sm text-red-200">
          {state.error}
        </div>
      ) : state.rows.length === 0 ? (
        <div className="flex h-[320px] items-center justify-center rounded-md border border-white/10 bg-white/[0.025] px-4 text-center text-sm text-white/40">
          暂无职业统计记录
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-[120px_1fr_86px] gap-3 px-2 text-[11px] tracking-[0.08em] text-white/38 uppercase">
            <span>职业</span>
            <span>箱型分布</span>
            <span className="text-right">中位数</span>
          </div>
          {state.rows.map((row) => (
            <div
              key={`${bossId}-${row.main_actor_class}`}
              className="grid grid-cols-[120px_1fr_86px] items-center gap-3 rounded-md border border-white/8 bg-white/[0.035] px-2 py-2 transition hover:bg-white/[0.055]"
            >
              <div className="flex min-w-0 items-center gap-2">
                <ClassIcon classCode={row.main_actor_class} />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">
                    {getActorClassName(row.main_actor_class)}
                  </div>
                  <div className="text-xs text-white/38">
                    n={Number(row.sample_count ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
              <ClassBoxPlot row={row} maxDps={maxDps} />
              <div className="text-right">
                <div className="font-semibold text-[#F4C06A] tabular-nums">
                  {formatNumber(row.median_dps)}
                </div>
                <div className="text-[11px] text-white/38 tabular-nums">
                  avg {formatNumber(row.avg_dps)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function DungeonClassStatsRowSection({ row, refreshKey }: { row: DungeonRow; refreshKey: number }) {
  return (
    <section className="rounded-md border border-white/15 bg-black/35 p-4 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-white/8 pb-3">
        <div>
          <h2 className="text-xl font-bold text-white">{localize(row.dungeon.name)}</h2>
          <div className="mt-1 text-sm text-white/45">{localize(row.dungeon.difficulty)}</div>
        </div>
        <span className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-white/45">
          dungeon_id {row.dungeon.dungeon_id}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        {row.bossIds.map((bossId) => (
          <BossClassBoxStatsCard
            key={`${row.dungeon.dungeon_id}-${bossId}-class-box`}
            bossId={bossId}
            refreshKey={refreshKey}
          />
        ))}
      </div>
    </section>
  );
}

function DungeonPicker({
  activeDungeonKey,
  onDungeonChange,
}: {
  activeDungeonKey: string;
  onDungeonChange: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {DUNGEON_GROUPS.map((group) => (
        <div key={group.key} className="flex items-start gap-3">
          <div className="mt-2 w-12 shrink-0 text-sm font-semibold text-white/55">
            {group.label}
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            {DUNGEON_OPTIONS_BY_GROUP[group.key].length === 0 ? (
              <span className="rounded-md border border-white/8 bg-white/[0.03] px-3 py-2 text-sm text-white/35">
                暂无副本
              </span>
            ) : (
              DUNGEON_OPTIONS_BY_GROUP[group.key].map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onDungeonChange(option.key)}
                  className={cn(
                    "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                    activeDungeonKey === option.key
                      ? "border-white/25 bg-white/15 text-white"
                      : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:bg-white/[0.08] hover:text-white/85"
                  )}
                >
                  {option.name}
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function SelectedDungeonRank({
  option,
  bossId,
  actorClass,
  refreshKey,
  mainActors,
  mainActorsLoading,
  mainActorsError,
}: {
  option: DungeonOption | undefined;
  bossId: string;
  actorClass: string;
  refreshKey: number;
  mainActors: MainActorIdentity[];
  mainActorsLoading: boolean;
  mainActorsError: string | null;
}) {
  if (!option || !bossId) {
    return (
      <section className="rounded-md border border-white/15 bg-black/35 p-8 text-center text-sm text-white/45 shadow-2xl backdrop-blur-xl">
        暂无可展示的排行副本
      </section>
    );
  }

  return (
    <BossRankCard
      key={`${option.key}-${bossId}`}
      bossId={bossId}
      actorClass={actorClass}
      refreshKey={refreshKey}
      mainActors={mainActors}
      mainActorsLoading={mainActorsLoading}
      mainActorsError={mainActorsError}
    />
  );
}

function SelectedDungeonClassStats({
  option,
  refreshKey,
}: {
  option: DungeonOption | undefined;
  refreshKey: number;
}) {
  if (!option) {
    return (
      <section className="rounded-md border border-white/15 bg-black/35 p-8 text-center text-sm text-white/45 shadow-2xl backdrop-blur-xl">
        暂无可展示的职业统计副本
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {option.rows.map((row, index) => (
        <DungeonClassStatsRowSection
          key={`${row.dungeon.dungeon_id}-${localize(row.dungeon.difficulty)}-${index}-class`}
          row={row}
          refreshKey={refreshKey}
        />
      ))}
    </div>
  );
}

function getDefaultDungeonKey() {
  return DUNGEON_OPTIONS[0]?.key ?? "";
}

function findDungeonOption(key: string) {
  return DUNGEON_OPTIONS.find((option) => option.key === key);
}

export default function Aion2DpsRankPage() {
  const [activePage, setActivePage] = useState<"rank" | "classStats">("rank");
  const [activeDungeonKey, setActiveDungeonKey] = useState(getDefaultDungeonKey);
  const [activeBossId, setActiveBossId] = useState("");
  const [actorClass, setActorClass] = useState("ALL");
  const [refreshKey, setRefreshKey] = useState(0);
  const [mainActors, setMainActors] = useState<MainActorIdentity[]>([]);
  const [mainActorsLoading, setMainActorsLoading] = useState(true);
  const [mainActorsError, setMainActorsError] = useState<string | null>(null);

  const activeDungeon = useMemo(() => {
    return findDungeonOption(activeDungeonKey) ?? DUNGEON_OPTIONS[0];
  }, [activeDungeonKey]);

  useEffect(() => {
    const bossIds = getDungeonBossIds(activeDungeon);
    setActiveBossId((current) => (bossIds.includes(current) ? current : (bossIds[0] ?? "")));
  }, [activeDungeon]);

  useEffect(() => {
    let cancelled = false;

    setMainActorsLoading(true);
    setMainActorsError(null);

    void (async () => {
      try {
        const records = await invoke<HistoryRecord[]>("get_history");
        if (!cancelled) {
          setMainActors(buildMainActors(records));
          setMainActorsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          setMainActors([]);
          setMainActorsError(getErrorMessage(error));
          setMainActorsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-transparent text-white">
      <main className="absolute inset-0 z-20 overflow-hidden">
        <div className="h-full overflow-y-auto px-10 pt-10 pb-10">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-5">
            <section className="relative overflow-hidden rounded-xl border border-white/10 bg-black/35 p-5 shadow-lg backdrop-blur-xl">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="flex items-center gap-3">
                  <div className="flex size-11 items-center justify-center rounded-lg border border-white/10 bg-white/[0.06] text-white/75">
                    {activePage === "rank" ? <Trophy size={22} /> : <BarChart3 size={22} />}
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold tracking-wide text-white">
                      {activePage === "rank" ? "DPS 排行榜" : "职业统计"}
                    </h1>
                    <p className="mt-1 text-sm text-white/55">
                      {activePage === "rank"
                        ? `选择副本与 Boss，查看该首领前 ${TOP_LIMIT} 名及你的角色排名。`
                        : "选择副本后展示该副本所有难度的 Boss 职业箱型分布，数据来自定时维护的统计表。"}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Tabs
                    value={activePage}
                    onValueChange={(value) => setActivePage(value as "rank" | "classStats")}
                  >
                    <TabsList className="border border-white/10 bg-black/45">
                      <TabsTrigger
                        value="rank"
                        className="text-white/65 data-[state=active]:text-white"
                      >
                        DPS排行
                      </TabsTrigger>
                      <TabsTrigger
                        value="classStats"
                        className="text-white/65 data-[state=active]:text-white"
                      >
                        职业统计
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {activePage === "rank" ? (
                    <ClassSelect value={actorClass} onValueChange={setActorClass} />
                  ) : null}
                  <Button
                    variant="outline"
                    onClick={() => setRefreshKey((current) => current + 1)}
                    className="h-10 border-white/10 bg-white/5 text-white/75 backdrop-blur-xl hover:border-[#F4C06A]/35 hover:bg-[#F4C06A]/10 hover:text-[#F4C06A]"
                  >
                    <RefreshCcw data-icon="inline-start" />
                    刷新
                  </Button>
                </div>
              </div>

              <div className="mt-5 border-t border-white/8 pt-4">
                <DungeonPicker
                  activeDungeonKey={activeDungeon?.key ?? ""}
                  onDungeonChange={setActiveDungeonKey}
                />
                {activePage === "rank" ? (
                  <div className="mt-3 border-t border-white/[0.06] pt-3">
                    <BossPicker
                      option={activeDungeon}
                      value={activeBossId}
                      onValueChange={setActiveBossId}
                    />
                  </div>
                ) : null}
              </div>
            </section>

            {activePage === "rank" ? (
              <SelectedDungeonRank
                option={activeDungeon}
                bossId={activeBossId}
                actorClass={actorClass}
                refreshKey={refreshKey}
                mainActors={mainActors}
                mainActorsLoading={mainActorsLoading}
                mainActorsError={mainActorsError}
              />
            ) : (
              <SelectedDungeonClassStats option={activeDungeon} refreshKey={refreshKey} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
