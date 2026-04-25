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
  useFormulaStats,
} from "@/components/aion2/stat-info";
import { getStatEntriesMap, StatEntry } from "@/lib/aion2/stat-utils";
import { useAppTranslation } from "@/hooks/use-app-translation";

function EquipmentDetailPage({
  equipmentList,
  skillList,
  // boardList,
  // titleList,
  // petwing,
  statList,
  statEntriesMap,
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
  const ActiveSkillList = skillList.filter((s) => s.category === "Active");
  const PassiveSkillList = skillList.filter((s) => s.category === "Passive");
  const DpSkillList = skillList.filter((s) => s.category === "Dp");

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <div className="w-full space-y-2 md:w-3/4">
        {/* 装备 */}
        <Card className="bg-background/60 grid grid-cols-1 justify-center gap-0 rounded-lg p-0 backdrop-blur-lg sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2">
          {normalEquipmentList.map((eq) => (
            <div key={eq.slotPos}>{renderEquipmentInfo({ eq: eq })}</div>
          ))}
        </Card>

        <Card className="bg-background/60 grid grid-cols-3 justify-center gap-2 rounded-lg p-5 backdrop-blur-lg sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6">
          {ArcanaList.map((eq) => (
            <div key={eq.slotPos}>{renderArcanaSlot({ eq: eq })}</div>
          ))}
        </Card>

        <Card className="bg-background/60 rounded-lg backdrop-blur-lg">
          <div className="grid grid-cols-6 justify-center gap-10 p-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-8">
            {ActiveSkillList.map((skill) => (
              <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
            ))}
          </div>
          <div className="grid grid-cols-6 justify-center gap-10 p-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-8">
            {PassiveSkillList.map((skill) => (
              <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
            ))}
          </div>
          <div className="grid grid-cols-6 justify-center gap-10 p-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-8">
            {DpSkillList.map((skill) => (
              <div key={skill.name}>{renderSkillSlot({ skill: skill, scaleFactor: 1 })}</div>
            ))}
          </div>
        </Card>
      </div>

      <div className="w-full space-y-2 md:w-1/4">
        {renderStatInfo({ statList: statList })}

        {renderDetailedStatInfo({
          statEntriesMap: statEntriesMap,
        })}

        {/* 称号 */}

        {/* 宠物翅膀 */}

        {/* 守护力量 */}

        {/* <GearDamageCurveChart /> */}
      </div>
    </div>
  );
}

export function FormulaStat({
  formula,
  statEntriesMap,
  name,
  round,
  t,
  unit = "",
}: {
  formula: string;
  statEntriesMap: Record<string, any[]>;
  name: string;
  round: number;
  t: (key: string) => string;
  unit?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  const { fieldNames, fieldStats, totalValue } = useFormulaStats(formula, statEntriesMap);

  const formulaTranslated = useMemo(() => {
    let result = formula;
    fieldNames.forEach((field) => {
      const translated = t(field);
      result = result.replace(new RegExp(`\\{${field}\\}`, "g"), translated);
    });
    return result;
  }, [formula, fieldNames, t]);

  const toggleExpand = () => setExpanded((prev) => !prev);

  return (
    <div className="">
      <div
        className="hover:bg-primary/5 flex h-8 cursor-pointer items-center justify-between rounded p-4"
        onClick={toggleExpand}
      >
        <span className="font-medium">{t(`${name}`)}</span>
        <span className="text-md font-bold">
          {totalValue.toFixed(round)}
          {unit}
        </span>
      </div>

      {expanded && (
        <div className="mt-1 space-y-1 border-t pt-2 pr-4 pb-2 pl-4">
          {fieldNames.map((field) => {
            const stat = fieldStats[field];
            return renderStat(stat, field, unit, round, t);
          })}
          <div className="text-muted-foreground mt-2 border-t pt-2 text-sm">
            <div>Formula: {formulaTranslated}</div>
            <div>
              Final: {totalValue.toFixed(round)}
              {unit}
            </div>
          </div>
        </div>
      )}
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
  const [searchParams] = useSearchParams();

  const characterName = searchParams.get("characterName") || "";
  const serverId = searchParams.get("serverId") || "";

  const [loading, setLoading] = useState(true);

  const [characterData, setCharacterData] = useState<Record<string, any>>();

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
    return <div>加载中</div>;
  }

  return (
    <div className="mx-auto max-w-[2000px] pr-5 pl-5">
      <Tabs onValueChange={() => {}} className="space-y-2">
        <TabsList variant={"line"} className="w-100">
          <TabsTrigger value="equip">装备详情</TabsTrigger>
          <TabsTrigger value="stat">属性分析</TabsTrigger>
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
        <TabsContent value="stat">
          <StatDetailPage statEntriesMap={statEntriesMap} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
