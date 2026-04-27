import { useSearchParams } from "react-router-dom";
import { useState, useEffect, useMemo } from "react";

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { fetchFengwo } from "@/lib/aion2/fetchFengwo";
import { getServerShortName } from "@/lib/aion2/servers";

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

function CharacterBanner({ characterData }: { characterData: Record<string, any> | undefined }) {
  const profile = characterData?.queryResult?.data.profile;

  const combatPower = characterData?.queryResult?.data?.profile?.combatPower;
  const fengwoScore = characterData?.rating?.scores?.score;
  const statList = characterData?.queryResult?.data?.stat?.statList as {
    type: string;
    value: number;
  }[];
  const itemLevel = statList?.find((item) => item?.type === "ItemLevel")?.value;
  const fetchedAt = characterData?.queryResult?.fetchedAt;

  const profileImage = profile?.profileImage || "/images/default-avatar.png";
  const characterName = profile?.characterName || "Unkonwn";
  const characterLevel = profile?.characterLevel || "Unkonwn";
  const characterClass = profile?.className || "";
  const raceName = profile?.raceName || "Unkonwn";
  const serverName = profile?.serverName || "Unkonwn";

  return (
    <Card className="bg-background/60 flex flex-row items-center gap-5 px-5 py-4 backdrop-blur-lg">
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

function EquipmentDetailPage({
  equipmentList,
  // skillList,
  // boardList,
  // titleList,
  // petwing,
  // statList,
  // statEntriesMap,
}: {
  equipmentList: any[];
  skillList: any[];
  // boardList: any[];
  // titleList: any[];
  // petwing: Record<string, any>;
  statList: { type: string }[];
  statEntriesMap: Record<string, StatEntry[]>;
}) {
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
      <div className="grid grid-cols-1 justify-center gap-0 rounded-2xl border p-0 backdrop-blur-lg sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
        {normalEquipmentList.map((eq) => (
          <div key={eq.slotPos}>{renderEquipmentInfo({ eq: eq })}</div>
        ))}
      </div>

      {/* 卡牌 */}
      <div className="grid grid-cols-3 items-center justify-center gap-2 rounded-2xl border p-5 backdrop-blur-lg sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6">
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
    <div>
      <div className="rounded-2xl border backdrop-blur-lg">
        <div className="backdrop-blur-lgsm:grid-cols-6 grid grid-cols-6 justify-center gap-10 p-5 md:grid-cols-8 lg:grid-cols-8">
          {ActiveSkillList.map((skill) => (
            <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
          ))}
        </div>
        <div className="backdrop-blur-lgsm:grid-cols-6 grid grid-cols-6 justify-center gap-10 p-5 md:grid-cols-8 lg:grid-cols-8">
          {PassiveSkillList.map((skill) => (
            <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
          ))}
        </div>
        <div className="backdrop-blur-lgsm:grid-cols-6 grid grid-cols-6 justify-center gap-10 p-5 md:grid-cols-8 lg:grid-cols-8">
          {DpSkillList.map((skill) => (
            <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
          ))}
        </div>
      </div>
    </div>
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
      <Card className="bg-background/60 grid grid-cols-1 justify-center gap-10 rounded-lg p-4 backdrop-blur-lg sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
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

export default function CharacterViewPage() {
  const [loading, setLoading] = useState(true);
  const [characterData, setCharacterData] = useState<Record<string, any>>({});
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
      const data = await fetchFengwo(characterName, serverName);
      setCharacterData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchData();
  }, [characterName, serverId]);

  const [equipmentList, skillList, statList, statEntriesMap] = useMemo(() => {
    // 装备和阿尔卡纳
    const equipmentList = (characterData?.queryResult?.data?.itemDetails || []) as {
      slotPos: number;
      slotPosName: string;
    }[];

    // 技能
    const skillList = characterData?.queryResult?.data?.skill?.skillList || [];

    // 守护力
    const boardList = characterData?.queryResult?.data?.daevanionDetails || [];

    // 称号
    const titleList = characterData?.queryResult?.data?.title?.titleList || [];

    // 翅膀
    // const petwing = characterData?.queryResult?.data?.petwing || {};

    // 属性列表
    const statList = characterData?.queryResult?.data?.stat?.statList || [];

    // 根据装备获取属性字典
    const statEntriesMap = getStatEntriesMap(equipmentList, boardList, titleList, statList);

    return [equipmentList, skillList, statList, statEntriesMap];
  }, [characterData]);
  if (loading) {
    return <Splash></Splash>;
  }
  return (
    <div className="mx-auto max-w-[2000px] pr-5 pl-5">
      <div className="w-full space-y-5">
        <CharacterBanner characterData={characterData}></CharacterBanner>
      </div>

      <div className="flex flex-col gap-4 md:flex-row">
        <div className="w-full space-y-2 md:w-3/4">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v)} className="space-y-2">
            <TabsList variant={"line"} className="w-100">
              <TabsTrigger value="equip">装备卡牌</TabsTrigger>
              <TabsTrigger value="skill">技能等级</TabsTrigger>
              <TabsTrigger value="daevaion">守护石板</TabsTrigger>
              <TabsTrigger value="stat-detail">综合分析</TabsTrigger>
            </TabsList>
            <TabsContent value="equip">
              <EquipmentDetailPage
                equipmentList={equipmentList}
                skillList={skillList}
                // boardList={boardList}
                // titleList={titleList}
                // petwing={petwing}
                statList={statList}
                statEntriesMap={statEntriesMap}
              />
            </TabsContent>
            <TabsContent value="skill">
              <SkillPage skillList={skillList}></SkillPage>
            </TabsContent>
            <TabsContent value="stat-detail">
              <StatDetailPage statEntriesMap={statEntriesMap} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="w-full space-y-2 md:w-1/4">
          {renderStatInfo({ statList: statList })}

          {renderDetailedStatInfo({
            statEntriesMap: statEntriesMap,
            tStats: tStats,
          })}

          {/* 称号 */}

          {/* 宠物翅膀 */}

          {/* 守护力量 */}

          {/* <GearDamageCurveChart /> */}
        </div>
      </div>
    </div>
  );
}
