import { useSearchParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";

import { Info, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/custom-tooltip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fetchFengwo, formatFengwoResponse } from "@/lib/aion2/fetchFengwo";
import { getServerShortName } from "@/lib/aion2/servers";
import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import { DpsDetailContent } from "@/components/dps/dps-detail-content";
import { ActorNameCell, getActorClassName } from "@/components/dps/dps-table-cells";

import { renderEquipmentInfo } from "@/components/aion2/slot-equip";
import { renderArcanaSlot } from "@/components/aion2/slot-arcana";
import { renderSkillSlot } from "@/components/aion2/slot-skill";
import {
  renderStatInfo,
  renderDetailedStatInfo,
  renderStat,
  FormulaStat,
} from "@/components/aion2/stat-info";
import { getStatEntriesMap, StatEntry } from "@/lib/aion2/stat-utils";
import { useAppTranslation } from "@/hooks/use-app-translation";

import Splash from "./Splash";
import { CharacterProps } from "@/types/character";
import { DaevanionGrid } from "@/components/aion2/daevanion-board";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/supabase";
import { useAppSettings } from "@/hooks/use-app-settings";
import { DpsDetailPayload, HistoryTargetRecord } from "@/types/aion2dps";

function CharacterBanner({
  profile,
  fetchedAt,
  characterScores,
}: {
  profile: CharacterProps["data"]["profile"];
  fetchedAt: string;
  characterScores: Record<string, number>;
}) {
  const profileImage = profile?.profileImage || "/images/default-avatar.png";
  const characterName = profile?.characterName || "Unkonwn";
  const characterLevel = profile?.characterLevel || "Unkonwn";
  const characterClass = profile?.className || "";
  const raceName = profile?.raceName || "Unkonwn";
  const serverName = profile?.serverName || "Unkonwn";

  const itemLevel = characterScores?.itemLevel || 0;
  const combatPower = characterScores?.combatPower || 0;
  const fengwoScore = characterScores?.fengwoScore || 0;

  return (
    <Card className="bg-background/30 flex flex-row items-center gap-5 px-5 py-4 backdrop-blur-sm">
      {/* 左侧信息区 */}
      <div className="flex flex-1 flex-col gap-2">
        {/* 角色名 */}
        <div className="text-2xl font-bold">{characterName}</div>

        {/* 职业/等级/服务器/种族 */}
        <p className="text-muted-foreground text-sm">
          {characterClass} Lv.{characterLevel} · {serverName} · {raceName}
        </p>

        {/* 评分标签组 */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5">
            <img
              src="/images/aion2/profile_level_icon_pc.png"
              alt="Item level"
              className="h-5 w-4"
            />
            <span className="text-sm font-semibold text-white">{itemLevel ?? "--"}</span>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5">
            <img
              src="/images/aion2/profile_power_icon_pc.png"
              alt="Combat power"
              className="h-5 w-5"
            />
            <span className="text-sm font-semibold text-white">
              {typeof combatPower === "number" ? (combatPower / 1000).toFixed(2) + "k" : "--"}
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-white/8 px-3 py-1.5">
            <img src="/images/aion2/fengwo.png" alt="Fengwo score" className="h-5 w-5" />
            <span className="text-sm font-semibold text-white">
              {typeof fengwoScore === "number" ? fengwoScore.toFixed(0) : "--"}
            </span>
          </div>
        </div>

        {/* 更新时间 */}
        <p className="text-muted-foreground/60 mt-1 text-xs">
          数据更新于 {new Date(fetchedAt).toLocaleString()}
        </p>
      </div>

      {/* 右侧头像 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={profileImage}
        alt={characterName}
        className="border-primary/60 h-36 w-36 shrink-0 rounded-full border-3 object-cover"
      />
    </Card>
  );
}

function EquipmentDetailPage({ equipmentList }: { equipmentList: any[] }) {
  const EquipmentSlotNames = [
    "MainHand",
    "SubHand",
    "Helmet",
    "Shoulder",
    "Torso",
    "Belt",
    "Pants",
    "Gloves",
    "Cape",
    "Boots",
    "Earring1",
    "Earring2",
    "Necklace",
    "Amulet",
    "Ring1",
    "Ring2",
    "Bracelet1",
    "Bracelet2",
    "Rune1",
    "Rune2",
  ];

  const normalEquipmentList = equipmentList.filter((eq) => !(eq.slotPos >= 41 && eq.slotPos <= 46));
  const rankMap = new Map(EquipmentSlotNames.map((name, idx) => [name, idx]));
  normalEquipmentList.sort((a, b) => {
    const ra = Number(rankMap.get(a.slotPosName) ?? 999);
    const rb = Number(rankMap.get(b.slotPosName) ?? 999);
    return ra - rb;
  });

  // 阿尔卡纳
  const ArcanaList = equipmentList.filter((eq) => eq.slotPos >= 41 && eq.slotPos <= 46);

  return (
    <div className="w-full space-y-2">
      {/* 装备 */}
      <Card className="bg-background/30 grid grid-cols-1 justify-center gap-0 rounded-2xl border p-4 backdrop-blur-sm sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
        {normalEquipmentList.map((eq) => (
          <div key={eq.slotPos}>{renderEquipmentInfo({ eq: eq })}</div>
        ))}
      </Card>

      {/* 卡牌 */}
      <div className="bg-background/30 grid grid-cols-3 items-center justify-center gap-2 rounded-2xl border p-4 p-5 backdrop-blur-sm sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6">
        {ArcanaList.map((eq) => (
          <div key={eq.slotPos}>{renderArcanaSlot({ eq: eq })}</div>
        ))}
      </div>
    </div>
  );
}

function SkillPage({ skillList }: { skillList: any[] }) {
  const ActiveSkillList = skillList.filter((s) => s.category === "Active");
  const PassiveSkillList = skillList.filter((s) => s.category === "Passive");
  const DpSkillList = skillList.filter((s) => s.category === "Dp");
  return (
    <Card className="bg-background/30 rounded-2xl border p-4 backdrop-blur-sm">
      <div className="grid grid-cols-6 justify-center gap-10 p-5 md:grid-cols-8 lg:grid-cols-15">
        {ActiveSkillList.map((skill) => (
          <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
        ))}
      </div>
      <div className="b grid grid-cols-6 justify-center gap-10 p-5 md:grid-cols-8 lg:grid-cols-15">
        {PassiveSkillList.map((skill) => (
          <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
        ))}
      </div>
      <div className="grid grid-cols-6 justify-center gap-10 p-5 md:grid-cols-8 lg:grid-cols-15">
        {DpSkillList.map((skill) => (
          <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
        ))}
      </div>
    </Card>
  );
}

export function DaevanionTabs({
  daevanionDetails = [],
  activeNodes = [],
}: {
  daevanionDetails: CharacterProps["data"]["daevanionDetails"];
  activeNodes: CharacterProps["data"]["activeNodes"];
}) {
  const [activeBoard, setActiveBoard] = useState("");

  useEffect(() => {
    if (daevanionDetails.length === 0) return;
    const exists = daevanionDetails.some((board) => String(board.boardId) === activeBoard);
    if (!activeBoard || !exists) {
      setActiveBoard(String(daevanionDetails[0].boardId));
    }
  }, [daevanionDetails, activeBoard]);

  const activeNodeMap = useMemo(() => {
    const map = new Map<number, CharacterProps["data"]["activeNodes"]>();

    for (const node of activeNodes) {
      const list = map.get(node.boardId) ?? [];
      list.push(node);
      map.set(node.boardId, list);
    }

    return map;
  }, [activeNodes]);

  const currentBoard = daevanionDetails.find((board) => String(board.boardId) === activeBoard);
  const currentEffects =
    currentBoard?.detail?.openStatEffectList?.filter((effect) => effect?.desc?.trim()) ?? [];
  debugger;
  const allEffects = daevanionDetails.flatMap((board) =>
    (board.detail.openStatEffectList ?? [])
      .filter((effect) => effect?.desc?.trim())
      .map((effect) => ({
        desc: effect.desc,
      }))
  );

  if (daevanionDetails.length === 0) {
    return <div className="text-muted-foreground text-sm">暂无节点数据</div>;
  }

  return (
    <Card className="bg-background/30 relative overflow-auto rounded-2xl border p-4 backdrop-blur-sm">
      <Tabs value={activeBoard} onValueChange={setActiveBoard}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <TabsList>
            {daevanionDetails.map((board) => (
              <TabsTrigger key={board.boardId} value={String(board.boardId)}>
                {board.boardName || `Board ${board.boardId}`}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex items-center gap-2">
            <EffectTooltip
              icon={<Sparkles className="h-4 w-4" />}
              label="当前效果"
              title={`${currentBoard?.boardName || `Board ${activeBoard}`} 激活效果`}
              effects={currentEffects.map((effect) => effect.desc)}
            />

            <EffectTooltip
              icon={<Info className="h-4 w-4" />}
              label="全部效果"
              title="全部激活效果"
              effects={allEffects.map((effect) => `${effect.desc}`)}
            />
          </div>
        </div>

        {daevanionDetails.map((board) => (
          <TabsContent key={board.boardId} value={String(board.boardId)}>
            <DaevanionGrid
              boarderId={board.boardId}
              activeNodes={activeNodeMap.get(board.boardId) ?? []}
              cellSize={65}
            />
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

function TitleSkinPage({ title }: { title: CharacterProps["data"]["title"] }) {
  const titleList = title?.titleList ?? [];

  if (!titleList.length) {
    return <div className="text-muted-foreground text-sm">暂无称号数据</div>;
  }

  return (
    <div className="flex flex-row gap-3">
      {titleList.map((item) => (
        <Card key={item.id} className="bg-background/40 w-full rounded-2xl border p-0">
          <CardContent className="flex flex-col gap-4 p-2">
            <div className="bg-muted/40 flex w-full shrink-0 flex-row items-center justify-center gap-5 rounded-xl p-3">
              <img
                src={getIcon(item.equipCategory)}
                className="h-14 w-14 object-contain"
                draggable={false}
              />
              <div className="space-y-1">
                <h3 className={cn("truncate text-lg font-semibold", gradeColor(item.grade))}>
                  {item.name}
                </h3>
                <div className="text-muted-foreground text-md flex flex-row items-center justify-center gap-5 text-xs">
                  {getCategory(item.equipCategory)}
                  <div className="">
                    <span className="font-semibold">{item.ownedCount}</span>
                    <span className="text-muted-foreground">/{item.totalCount}</span>
                  </div>
                </div>
                <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full rounded-full"
                    style={{ width: `${Math.min(100, item.ownedPercent ?? 0)}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col space-y-3">
              <div className="flex flex-row items-center gap-2">
                {/* <Badge variant="secondary">{item.ownedPercent}%</Badge> */}
                {/* <Badge variant="outline">{item.grade}</Badge> */}
              </div>

              <div className="flex flex-col gap-2 px-5">
                <div className="flex flex-col gap-0">
                  <div>收集效果</div>
                  {item.statList.map((item, index) => (
                    <div key={index} className="text-muted-foreground mb-2 text-xs">
                      {item.desc}
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-0">
                  <div>装备效果</div>
                  {item.equipStatList.map((item, index) => (
                    <div key={index} className="text-muted-foreground mb-2 text-xs">
                      {item.desc}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function getIcon(category?: string) {
  return (
    {
      Attack: "https://assets.playnccdn.com/static-aion2/characters/img/info/title_icon_attack.png",
      Defense:
        "https://assets.playnccdn.com/static-aion2/characters/img/info/title_icon_defense.png",
      Support:
        "https://assets.playnccdn.com/static-aion2/characters/img/info/title_icon_support.png",
    }[category ?? ""] ??
    "https://assets.playnccdn.com/static-aion2/characters/img/info/title_icon_attack.png"
  );
}

function getCategory(category?: string) {
  return (
    {
      Attack: "攻擊系列",
      Defense: "防禦系列",
      Support: "輔助系列",
    }[category ?? ""] ??
    category ??
    "未知系列"
  );
}

function gradeColor(grade?: string) {
  return (
    {
      Common: "text-muted-foreground",
      Rare: "text-sky-500",
      Unique: "text-violet-500",
      Legend: "text-amber-500",
    }[grade ?? ""] ?? "text-foreground"
  );
}

function EffectTooltip({
  icon,
  label,
  title,
  effects,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  effects: string[];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          {icon}
          {label}
        </Button>
      </TooltipTrigger>

      <TooltipContent align="end" className="max-w-md">
        <div className="max-h-80 space-y-2 overflow-auto text-xs">
          <p className="text-foreground font-medium">{title}</p>

          {effects.length > 0 ? (
            <div className="text-muted-foreground space-y-1">
              {effects.map((desc, index) => (
                <p key={index}>{desc}</p>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">暂无激活效果</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function StatDetailPage({ statEntriesMap }: { statEntriesMap: Record<string, StatEntry[]> }) {
  // 防御属性
  const Defense = { total: 3000, entries: [] };
  const Evasion = { total: 0, entries: [] };
  const CriticalResist = { total: 0, entries: [] };
  const DecreaseDamage = { total: 65, entries: [] };
  const DecreaseCriticalDamage = { total: 0, entries: [] };
  const DecreaseBackAttack = { total: 0, entries: [] };
  const PerfectResist = { total: 0, entries: [] };
  const HardHitResist = { total: 0, entries: [] };
  const AdditionalHitResistRate = { total: 0, entries: [] };

  const { tStats } = useAppTranslation();

  return (
    <div className="space-y-5">
      {/* <ScoreBanner characterData={characterData} /> */}
      <Card className="bg-background/60 grid grid-cols-1 justify-center gap-10 rounded-lg p-4 backdrop-blur-sm sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
        <div className="space-y-3">
          <FormulaStat
            formula="({WeaponFixingDamage}+{FixingDamage})*(1+{DamageRatio}/100)"
            statEntriesMap={statEntriesMap}
            name={"WeaponFixingDamage"}
            round={2}
            t={tStats}
          />
          <FormulaStat
            formula="({WeaponAccuracy}+{Accuracy})*(1+{AccuracyRatio}/100)"
            statEntriesMap={statEntriesMap}
            name={"WeaponAccuracy"}
            round={0}
            t={tStats}
          />
          <FormulaStat
            formula="({Critical}+{WeaponCritical})*(1+{CriticalRatio}/100)"
            statEntriesMap={statEntriesMap}
            name={"Critical"}
            round={0}
            t={tStats}
          />
          <FormulaStat
            formula="({AmplifyAllDamage}+{PvEAmplifyDamage}+{BossNpcAmplifyDamage})"
            statEntriesMap={statEntriesMap}
            name={"AmplifyAllDamage"}
            round={1}
            unit="%"
            t={tStats}
          />

          <FormulaStat
            formula="{AmplifyCriticalDamage}"
            statEntriesMap={statEntriesMap}
            name={"AmplifyCriticalDamage"}
            round={1}
            unit="%"
            t={tStats}
          />

          <FormulaStat
            formula="{AmplifyBackAttack}"
            statEntriesMap={statEntriesMap}
            name={"AmplifyBackAttack"}
            round={1}
            unit="%"
            t={tStats}
          />

          <FormulaStat
            formula="{Perfect}"
            statEntriesMap={statEntriesMap}
            name={"Perfect"}
            round={1}
            unit="%"
            t={tStats}
          />

          <FormulaStat
            formula="{HardHit}"
            statEntriesMap={statEntriesMap}
            name={"HardHit"}
            round={1}
            unit="%"
            t={tStats}
          />

          <FormulaStat
            formula="{AdditionalHitRate}"
            statEntriesMap={statEntriesMap}
            name={"AdditionalHitRate"}
            round={1}
            unit="%"
            t={tStats}
          />

          <FormulaStat
            formula="{CombatSpeed}"
            statEntriesMap={statEntriesMap}
            name={"CombatSpeed"}
            round={1}
            unit="%"
            t={tStats}
          />

          <FormulaStat
            formula="{CoolTimeDecrease}"
            statEntriesMap={statEntriesMap}
            name={"CoolTimeDecrease"}
            round={1}
            unit="%"
            t={tStats}
          />
        </div>
        <div className="space-y-3">
          {renderStat(Defense, "Defense", "", 0, tStats)}
          {renderStat(Evasion, "Evasion", "", 0, tStats)}
          {renderStat(CriticalResist, "CriticalResist", "", 0, tStats)}
          {renderStat(DecreaseDamage, "DecreaseDamage", "", 0, tStats)}
          {renderStat(DecreaseCriticalDamage, "DecreaseBackAttack", "", 0, tStats)}
          {renderStat(DecreaseBackAttack, "DecreaseBackAttack", "", 0, tStats)}
          {renderStat(PerfectResist, "PerfectResist", "", 0, tStats)}
          {renderStat(HardHitResist, "HardHitResist", "", 0, tStats)}
          {renderStat(AdditionalHitResistRate, "AdditionalHitResistRate", "", 0, tStats)}
        </div>
      </Card>
    </div>
  );
}

type HistoryBattleRow = {
  record_id: string;
  battle_ended_at: string | null;
  target_name: string | null;
  target_mob_code: number | null;
  main_actor_name: string | null;
  main_actor_server_id: string | null;
  main_actor_class: string | null;
  main_actor_damage: number | null;
  main_actor_battle_duration: number | null;
  main_actor_dps: number | null;
  party_total_damage: number | null;
  team_dps: number | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DpsHistoryDialogTable({ dpsRows }: { dpsRows: HistoryBattleRow[] }) {
  const { settings } = useAppSettings();
  const [selectedRow, setSelectedRow] = useState<HistoryBattleRow | null>(null);
  const [selectedRecord, setSelectedRecord] = useState<HistoryTargetRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);

  const dpsAppearance = settings.appearance.dpsWindow;
  const selectedTargetInfo = selectedRecord
    ? selectedRecord.combatInfos.targetInfos[String(selectedRecord.targetId)]
    : undefined;
  const selectedDetailPayload = useMemo<DpsDetailPayload | null>(() => {
    if (!selectedRecord || selectedPlayerId === null) {
      return null;
    }

    const playerStats = selectedRecord.thisTargetAllPlayerStats?.[String(selectedPlayerId)] ?? null;
    if (!playerStats) {
      return null;
    }

    return {
      mode: "history",
      actorId: selectedPlayerId,
      targetId: selectedRecord.targetId,
      combatInfos: selectedRecord.combatInfos,
      playerStats,
      playerSkillStats:
        selectedRecord.thisTargetAllPlayerSkillStats?.[String(selectedPlayerId)] ?? {},
      playerSkillRecords:
        selectedRecord.thisTargetAllPlayerSkillRecords?.[String(selectedPlayerId)] ?? [],
      playerDpsCurve: [],
    };
  }, [selectedPlayerId, selectedRecord]);

  useEffect(() => {
    let cancelled = false;

    const loadDetail = async () => {
      if (!selectedRow) {
        setSelectedRecord(null);
        setDetailLoading(false);
        setSelectedPlayerId(null);
        return;
      }

      setDetailLoading(true);
      try {
        const { data, error } = await supabase
          .from("aion2_dps")
          .select("data")
          .eq("record_id", selectedRow.record_id)
          .maybeSingle();

        if (error) {
          throw error;
        }

        if (!cancelled) {
          const nextRecord = (data?.data as HistoryTargetRecord | null) ?? null;
          setSelectedRecord(nextRecord);
          const nextPlayerIds = Object.keys(nextRecord?.thisTargetAllPlayerStats ?? {});
          setSelectedPlayerId(nextPlayerIds.length > 0 ? Number(nextPlayerIds[0]) : null);
        }
      } catch (error) {
        console.error("failed to load dps detail:", error);
        if (!cancelled) {
          setSelectedRecord(null);
          setSelectedPlayerId(null);
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    };

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedRow]);

  return (
    <>
      <Card className="">
        <div className="max-h-[1000px] overflow-y-auto">
          <table className="bg-background/35 w-full border-collapse border-white/10 p-0 text-sm text-white backdrop-blur-sm">
            <thead className="bg-white/5 text-white/60">
              <tr>
                <th className="px-4 py-3 text-left font-medium">战斗时间</th>
                <th className="px-4 py-3 text-left font-medium">目标</th>
                <th className="px-4 py-3 text-left font-medium">玩家</th>
                <th className="px-4 py-3 text-left font-medium">职业</th>
                <th className="px-4 py-3 text-right font-medium">个人伤害</th>
                <th className="px-4 py-3 text-right font-medium">队伍总伤害</th>
                <th className="px-4 py-3 text-right font-medium">战斗时长</th>
                <th className="px-4 py-3 text-right font-medium">个人秒伤</th>
                <th className="px-4 py-3 text-right font-medium">队伍秒伤</th>
                <th className="px-4 py-3 text-right font-medium">伤害详情</th>
              </tr>
            </thead>
            <tbody>
              {dpsRows.map((row) => (
                <tr key={row.record_id} className="border-t border-white/10 hover:bg-white/[0.03]">
                  <td className="px-4 py-3 text-white/75">{formatDateTime(row.battle_ended_at)}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-white">
                      {row.target_name ?? `Boss ${row.target_mob_code ?? "-"}`}
                    </div>
                    <div className="mt-1 text-xs text-white/40">
                      MobCode: {row.target_mob_code ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <ActorNameCell
                      actorName={row.main_actor_name ?? "-"}
                      actorClass={row.main_actor_class}
                      serverLabel={
                        row.main_actor_server_id
                          ? getServerShortName(Number(row.main_actor_server_id))
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-white/65">
                    {getActorClassName(row.main_actor_class)}
                  </td>
                  <td className="px-4 py-3 text-right text-white/85">
                    {Math.round(Number(row.main_actor_damage ?? 0)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-white/85">
                    {Math.round(Number(row.party_total_damage ?? 0)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right text-white/65">
                    {Number(row.main_actor_battle_duration ?? 0).toFixed(1)} 秒
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#d9a73a]">
                    {Math.round(Number(row.main_actor_dps ?? 0)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-[#37b6a9]">
                    {Math.round(Number(row.team_dps ?? 0)).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      className="rounded-md border border-white/10 px-3 py-1 text-sm text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={() => setSelectedRow(row)}
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={selectedRow !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="bg-background/95 flex h-[80vh] w-[95vw] max-w-none flex-col overflow-hidden border-white/10 p-0 text-white sm:max-w-[1400px]">
          {/* ================= Header ================= */}
          <DialogHeader className="shrink-0 border-b border-white/10 px-6 py-4">
            <DialogTitle className="text-lg font-semibold">
              {selectedRow?.target_name ?? `Boss ${selectedRow?.target_mob_code ?? "-"}`} 伤害详情
            </DialogTitle>
            <p className="text-sm text-white/40">点击左侧玩家查看技能明细</p>
          </DialogHeader>

          {/* ================= 主体 ================= */}
          <div className="flex flex-1 overflow-hidden">
            {/* ================= 左侧：DPS排行 ================= */}
            <div className="flex w-[420px] flex-col border-r border-white/10">
              <div className="shrink-0 px-4 py-3 text-sm font-medium text-white/70">
                玩家伤害排行
              </div>

              <div className="flex-1 overflow-y-auto px-3 pb-4">
                {detailLoading ? (
                  <div className="px-4 py-8 text-center text-sm text-white/60">正在加载...</div>
                ) : selectedRecord && selectedTargetInfo ? (
                  <MemoizedDpsPanel
                    targetInfo={selectedTargetInfo}
                    thisTargetPlayerStats={selectedRecord.thisTargetAllPlayerStats}
                    combatInfos={selectedRecord.combatInfos}
                    mainPlayerColor={dpsAppearance.mainPlayerColor}
                    otherPlayerColor={dpsAppearance.otherPlayerColor}
                    barOpacity={100}
                    maskNicknames={dpsAppearance.maskNicknames}
                    percentDisplayMode={dpsAppearance.percentDisplayMode}
                    onPlayerClicked={setSelectedPlayerId}
                    onPlayerHovered={() => {}}
                    onPlayerHoverEnd={() => {}}
                  />
                ) : null}
              </div>
            </div>

            {/* ================= 右侧：技能详情 ================= */}
            <div className="flex flex-1 flex-col">
              <div className="shrink-0 border-b border-white/10 px-6 py-3 text-sm font-medium text-white/70">
                技能伤害明细
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {selectedDetailPayload ? (
                  <div className="">
                    <DpsDetailContent payload={selectedDetailPayload} />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-white/50">
                    {detailLoading ? "正在加载 DPS 明细..." : "请在左侧选择一个玩家查看技能详情"}
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CharacterViewPage() {
  const [loading, setLoading] = useState(true);
  const [characterData, setCharacterData] = useState<CharacterProps>();
  const [characterScores, setCharacterScores] = useState<{
    itemLevel: number;
    combatPower: number;
    fengwoScore: number;
  }>({
    itemLevel: 0,
    combatPower: 0,
    fengwoScore: 0,
  });

  const [characterDpsRows, setCharacterDpsRows] = useState<HistoryBattleRow[]>([]);

  const [activeTab, setActiveTab] = useState<string>("equip");
  const [searchParams] = useSearchParams();
  const characterName = searchParams.get("characterName") || "";
  const serverId = searchParams.get("serverId") || "";

  const { tStats } = useAppTranslation();

  const fetchData = async () => {
    try {
      if (!characterName || !serverId) {
        setLoading(false);
        return;
      }
      const serverName = getServerShortName(Number(serverId));
      setLoading(true);

      // 查询蜂窝接口，并且获取评分
      const data1 = await fetchFengwo(characterName, serverName);
      const character = await formatFengwoResponse(data1);
      const combatPower = data1?.queryResult?.data?.profile?.combatPower;
      const fengwoScore = data1?.rating?.scores?.score;
      const itemLevel = character.data.statList?.find((item) => item?.type === "ItemLevel")?.value;
      setCharacterScores({
        itemLevel: itemLevel,
        combatPower: combatPower,
        fengwoScore: fengwoScore,
      });

      setCharacterData(character);

      // 查询角色战斗历史
      const { data } = await supabase
        .from("aion2_dps")
        .select(
          "record_id,battle_ended_at,target_name,target_mob_code,main_actor_name,main_actor_server_id,main_actor_class,main_actor_damage,main_actor_battle_duration,main_actor_dps,party_total_damage,team_dps"
        )
        .eq("main_actor_name", characterName.trim())
        .eq("main_actor_server_id", serverId.trim())
        .gt("main_actor_battle_duration", 0)
        .gt("main_actor_damage", 1000000)
        .order("battle_ended_at", { ascending: false })
        .limit(200);

      setCharacterDpsRows((data ?? []) as HistoryBattleRow[]);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, [characterName, serverId]);

  const [statEntriesMap] = useMemo(() => {
    if (!characterData) return [{} as Record<string, never>];
    const statEntriesMap = getStatEntriesMap(characterData);
    return [statEntriesMap];
  }, [characterData]);

  if (loading) {
    return <Splash></Splash>;
  }

  if (!characterData) return <div>页面出错</div>;

  return (
    <div className="mx-auto max-w-[2000px] pt-10 pr-15 pb-20 pl-15">
      <div className="w-full space-y-20">
        <CharacterBanner
          profile={characterData.data.profile}
          fetchedAt={characterData.fetchedAt}
          characterScores={characterScores}
        ></CharacterBanner>
      </div>

      <div className="flex flex-col gap-4 pt-5 md:flex-row">
        <div className="w-full space-y-2 md:w-3/4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="space-y-2">
            <TabsList variant="line" className="">
              <TabsTrigger value="equip" className="text-lg">
                装备卡牌
              </TabsTrigger>
              <TabsTrigger value="skill" className="text-lg">
                技能等级
              </TabsTrigger>
              <TabsTrigger value="daevanion" className="text-lg">
                守护石板
              </TabsTrigger>
              <TabsTrigger value="title-skin" className="text-lg">
                称号外观
              </TabsTrigger>

              <TabsTrigger value="petwing" className="text-lg">
                排名
              </TabsTrigger>

              <TabsTrigger value="dps-history" className="text-lg">
                战斗历史
              </TabsTrigger>

              <TabsTrigger value="stat-detail" className="text-lg">
                综合分析
              </TabsTrigger>
            </TabsList>
            <TabsContent value="equip">
              <EquipmentDetailPage equipmentList={characterData.data.equipmentDetailList} />
            </TabsContent>
            <TabsContent value="skill">
              <SkillPage skillList={characterData.data.skillList}></SkillPage>
            </TabsContent>
            <TabsContent value="daevanion">
              <DaevanionTabs
                daevanionDetails={characterData.data.daevanionDetails}
                activeNodes={characterData.data.activeNodes}
              />
            </TabsContent>

            <TabsContent value="title-skin">
              <TitleSkinPage title={characterData.data.title} />
            </TabsContent>

            <TabsContent value="dps-history">
              <DpsHistoryDialogTable dpsRows={characterDpsRows} />
            </TabsContent>

            <TabsContent value="stat-detail">
              <StatDetailPage statEntriesMap={statEntriesMap} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="w-full space-y-2 md:w-1/4">
          {renderStatInfo({ statList: characterData.data.statList })}
          {renderDetailedStatInfo({
            statEntriesMap: statEntriesMap,
            tStats: tStats,
          })}
        </div>
      </div>
    </div>
  );
}
