import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Tooltip,
  TooltipTrigger,
  TooltipProvider,
  TooltipContent,
} from "@/components/aion2/custom-tooltip";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, RotateCwSquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import { renderSkillSlot } from "@/components/aion2/SlotSkill";
import { renderEquipSlotWithTooltip } from "@/components/aion2/SlotEquipment";
import { renderArcanaSlot } from "@/components/aion2/SlotArcana";
import { GradeType, gradeConfig } from "@/components/aion2/common";

import { CharacterProps } from "./types";
import { Aion2CharacterHistory } from "@/lib/localStorageHistory";
import { getCharacterData } from "./utils/getCharacterData";
import { getStatSum, processCharacterData } from "./utils/processCharacterData";
import { useTranslation } from "react-i18next";

import { uploadCharacterData } from "@/lib/uploadCharacterData";

import { toast } from "sonner"; // 使用 sonner 的 toast

function renderCharacterBanner({ character }: { character: CharacterProps }) {
  const profile = character.profile;
  const profileImage = profile?.profileImage || "/images/default-avatar.png";
  const characterName = profile?.characterName || "Unkonwn";
  const characterLevel = profile?.characterLevel || "Unkonwn";
  const characterClass = profile?.className || "";
  const raceName = profile?.raceName || "Unkonwn";
  const serverName = profile?.serverName || "Unkonwn";

  const PvEScore = character.scores?.PvEScore?.toFixed(0) || "--";
  const FengwoScore = character.scores?.FengwoScore?.toFixed(0) || "--";

  const handleOpenInBD = () => {
    // if (!character) return;
    // const buildData: CharacterBuildProps = {
    //   id: "temp",
    //   buildName: characterName,
    //   buildClass: characterClass,
    //   author: { uid: "" },
    //   updatedTime: new Date().toISOString(),
    //   isUploaded: false,
    //   buildContent: character,
    // };
    // Aion2BUILDHistory.add(buildData);
    // setShowAddedDialog(true);
  };

  const refetch = () => {
    Aion2CharacterHistory.remove(character.characterId);
    location.reload();
  };

  return (
    <Card className="bg-background/60 backdrop-blur-lg">
      <CardHeader className="flex flex-row items-center gap-5">
        {/* 头像 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={profileImage}
          alt={characterName}
          className="w-28 h-28 rounded-full object-cover border-3 border-primary/60"
        />

        {/* 左侧信息区 */}
        <div className="flex-1">
          <CardTitle className="text-3xl font-bold">{characterName}</CardTitle>

          <p className="text-sm text-muted-foreground mt-1">
            {characterClass} Lv.{characterLevel} {serverName}种族: {raceName}
          </p>

          <p className="text-xs text-muted-foreground mt-1">
            数据更新于 {new Date(character.updatedAt).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-col gap-3 text-right">
          <div className="flex flex-row gap-5">
            <div>
              <div className="text-xs text-muted-foreground">道具等级</div>
              <div className="text-2xl font-semibold">
                {character.info.stat.statList.find(
                  (s: any) => s.type === "ItemLevel",
                )?.value || 0}
              </div>
              <div className="text-xs text-muted-foreground">排行 --/--</div>
            </div>

            <div>
              <div className="text-xs text-muted-foreground">蜂窝评分</div>
              <div className="text-2xl font-semibold">{FengwoScore}</div>
              <div className="text-xs text-muted-foreground">排行 --/--</div>
            </div>
            {/* 综合评分 */}
            <div>
              <div className="text-xs text-muted-foreground">伤害评分</div>
              <div className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
                {PvEScore}
              </div>
              <div className="text-xs text-muted-foreground">排行 --/--</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button onClick={refetch} className="bg-purple-600 text-white">
            <RotateCwSquare /> 刷新
          </Button>
          <Button onClick={handleOpenInBD}>
            <ExternalLink /> BD模拟
          </Button>
          {/* <Button onClick={handleShare}>

            <ExternalLink />
            分享
          </Button> */}
        </div>
      </CardHeader>
    </Card>
  );
}

function AnimatedTabContent({
  value,
  children,
  // className,
}: {
  value: string;
  children: React.ReactNode;
  // className?: string;
}) {
  return (
    <TabsContent value={value}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        {children}
      </motion.div>
    </TabsContent>
  );
}

const isEffectValue = (s: string) => {
  return (
    Number(String(s !== null && s !== void 0 ? s : "").replace("%", "")) != 0
  );
};
function renderEquipmentInfo({ eq }: { eq: Record<string, any> }) {
  // const grade = (eq?.grade || "Common") as GradeType;
  // const cfg = gradeConfig[grade] || gradeConfig.Common;
  const info = eq.item_info;

  const soulBindRate = Number(eq.item_info?.soulBindRate);
  const magicStoneStat = eq.item_info?.magicStoneStat;
  // const godStoneStat = eq.item_info?.godStoneStat;
  return (
    <div className="rounded-lg p-2">
      {renderEquipSlotWithTooltip({ eq: eq })}

      <div className="grid grid-cols-3 gap-0 text-sm">
        <div className="p-3 space-y-2 ">
          {info?.mainStats?.map((s: any, idx: number) => (
            <div
              key={idx}
              className={`flex justify-between ${
                s.exceed ? "text-orange-500" : ""
              }`}
            >
              <span>{s.name}</span>
              {!s.exceed ? (
                <>
                  {isEffectValue(s.minValue) ? `${s.minValue}~` : ""}
                  {isEffectValue(s.value) ? `${s.value}` : ""}
                  {isEffectValue(s.extra) ? `(+${s.extra})` : ""}
                </>
              ) : (
                <>{isEffectValue(s.extra) ? `+${s.extra}` : ""}</>
              )}
            </div>
          ))}
        </div>

        {soulBindRate && (
          <>
            <div className="p-3 space-y-2">
              {info?.subStats?.length > 0 && (
                <>
                  {info.subStats.map((s: any) => (
                    <div key={s.id} className="flex justify-between">
                      <span>{s.name}</span>
                      <span className="">{s.value}</span>
                    </div>
                  ))}
                </>
              )}
              {info?.subSkills?.map((s: any) => (
                <div key={s.id} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <img
                      src={"/images/aion2/icon_skill.png"}
                      alt=""
                      className="w-4 h-4 select-none"
                    />
                    <span className="text-teal-400 underline">{s.name}</span>
                  </div>

                  <span className="text-sm">Lv.+{s.level}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="p-3 space-y-2">
          <div className="grid grid-cols-1 gap-2">
            {magicStoneStat?.map((s: any, idx: number) => (
              <div
                key={`${s.id}-${idx}`}
                className={`flex items-center space-x-2 ${
                  gradeConfig[s.grade as GradeType]?.text
                }`}
              >
                <img src={s.icon} alt="" className="w-5 h-5 select-none" />
                <span className="text-left">
                  {s.name}
                  {s.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function renderStatInfo({ characterData }: { characterData: CharacterProps }) {
  const statList = characterData.info.stat.statList as { type: string }[];

  // 主属性类型
  const mainStatTypes = ["STR", "DEX", "INT", "CON", "AGI", "WIS"];

  // 分离主属性和副属性
  const mainStats = statList.filter((stat) =>
    mainStatTypes.includes(stat.type),
  );

  const subStats = statList
    .filter((stat) => !mainStatTypes.includes(stat.type))
    .slice(0, -1);

  // 主属性渲染
  const renderMainStat = (stat: Record<string, any>) => {
    const statSecondList = stat.statSecondList as [];
    return (
      <Tooltip key={stat.type}>
        <TooltipTrigger asChild>
          <div className="">
            <div className="flex flex-col items-center gap-0 p-0">
              {/* 图片 */}
              <div className="flex items-center justify-center w-12 h-12 rounded-full transition-colors">
                <img
                  src={`/images/aion2/stat_${stat.type.toLowerCase()}.png`}
                  alt={stat.name}
                  className="w-12 h-12 object-contain"
                />
              </div>
              {/* 属性名和值 */}
              <div className="text-lg font-bold text-center">{stat.name}</div>
              <div className="text-md  text-primary">{stat.value}</div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            {statSecondList && statSecondList.length > 0 && (
              <div className="space-y-1">
                {statSecondList.map((item, index) => (
                  <div key={index} className="text-sm flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  const renderSubStat = (stat: Record<string, any>) => {
    const displayName = stat.name.split("[")[0].trim();
    const statSecondList = stat.statSecondList as [];

    return (
      <Tooltip key={stat.type}>
        <TooltipTrigger asChild>
          <div className="p-0">
            <div className="flex flex-col items-center">
              {/* 图片 - 小尺寸 */}
              <div className="mb-1">
                <img
                  src={`/images/aion2/stat_lords_${stat.type.toLowerCase()}.png`}
                  alt={displayName}
                  className="w-6 h-6 object-contain"
                  onError={(e) => {
                    e.currentTarget.src = "/images/aion2/stat_default.png";
                  }}
                />
              </div>

              {/* 属性名和值 */}
              <div
                className="text-mg font-bold text-center"
                title={displayName}
              >
                {displayName}
              </div>
              <div className="text-sm">{stat.value}</div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-2">
          <div className="text-center space-y-2">
            {statSecondList && statSecondList.length > 0 && (
              <div className="text-xs space-y-1 max-w-[150px]">
                {statSecondList.slice(0, 2).map((item, index) => (
                  <div key={index} className="truncate text-left">
                    {item}
                  </div>
                ))}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <div className="bg-background/60 backdrop-blur-lg z-0">
      <div className="p-4 space-y-5">
        {mainStats.length > 0 && (
          <div>
            <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-3 gap-5">
              {mainStats.map(renderMainStat)}
            </div>
          </div>
        )}
        <Separator />
        {subStats.length > 0 && (
          <div>
            <div className="grid grid-cols-5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5 gap-3">
              {subStats.map(renderSubStat)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function renderStat(
  stat: { total: number; entries: any[] },
  name: string,
  unit: string,
  round: number,
  t: any,
) {
  const NUMROW = 20;
  const rowCount = Math.min(stat.entries.length, NUMROW);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-between hover:bg-primary/5 rounded cursor-pointer h-8 p-4">
          <span className="font-medium">{t(`${name}`)}</span>
          <span className="font-bold text-md">
            {stat.total.toFixed(round)}
            {unit}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="p-3" side="left" align="start">
        <div>
          {stat.entries && stat.entries.length > 0 ? (
            <div
              className="grid"
              style={{
                display: "grid",
                gridTemplateRows: `repeat(${rowCount}, minmax(0, auto))`,
                gridAutoFlow: "column",
                gap: "0.5rem 1rem", // 行间距 0.5rem，列间距 1rem
              }}
            >
              {stat.entries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm">
                  {entry.icon && (
                    <img src={entry.icon} alt="" className="w-4 h-4" />
                  )}
                  <span>{entry.from}</span>
                  <span className="truncate flex-1" />
                  <span className="font-medium">
                    {entry.name}+
                    {entry.minValue != null
                      ? `${entry.minValue}~${entry.value}`
                      : entry.value}
                    {unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-400 text-center py-2">Empty</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function renderMoreStatInfo({
  characterData,
  t,
  setActiveTab,
}: {
  characterData: CharacterProps;
  t: any;
  setActiveTab?: (v: string) => void;
}) {
  const statEntriesMap = characterData.processed.statEntriesMap;

  const Damage = getStatSum(
    ["FixingDamage", "WeaponFixingDamage"],
    statEntriesMap,
  );
  const DamageRatio = getStatSum(["DamageRatio"], statEntriesMap);
  const Accuracy = getStatSum(["Accuracy", "WeaponAccuracy"], statEntriesMap);
  const AccuracyRatio = getStatSum(["AccuracyRatio"], statEntriesMap);
  const Critical = getStatSum(["Critical", "WeaponCritical"], statEntriesMap);
  const CriticalRatio = getStatSum(["CriticalRatio"], statEntriesMap);
  const AmplifyAllDamage = getStatSum(
    ["AmplifyAllDamage", "PvEAmplifyDamage", "BossNpcAmplifyDamage"],
    statEntriesMap,
  );
  statEntriesMap;
  const AmplifyCriticalDamage = getStatSum(
    ["AmplifyCriticalDamage"],
    statEntriesMap,
  );
  const AmplifyBackAttack = getStatSum(["AmplifyBackAttack"], statEntriesMap);
  const Perfect = getStatSum(["Perfect"], statEntriesMap);
  const HardHit = getStatSum(["HardHit"], statEntriesMap);
  const AdditionalHitRate = getStatSum(["AdditionalHitRate"], statEntriesMap);
  const CombatSpeed = getStatSum(["CombatSpeed"], statEntriesMap);
  const MoveSpeed = getStatSum(["MoveSpeed"], statEntriesMap);
  const CoolTimeDecrease = getStatSum(["CoolTimeDecrease"], statEntriesMap);

  return (
    <Card className="p-2 text-sm bg-background/60 backdrop-blur-lg">
      <div className="space-y-3 ">
        {renderStat(Damage, "WeaponFixingDamage", "", 0, t)}
        {renderStat(DamageRatio, "DamageRatio", "%", 1, t)}
        {renderStat(Accuracy, "WeaponAccuracy", "", 0, t)}
        {renderStat(AccuracyRatio, "AccuracyRatio", "%", 1, t)}
        {renderStat(Critical, "Critical", "", 0, t)}
        {renderStat(CriticalRatio, "CriticalRatio", "%", 1, t)}
        {renderStat(AmplifyAllDamage, "AmplifyAllDamage", "%", 1, t)}
        {renderStat(AmplifyCriticalDamage, "AmplifyCriticalDamage", "%", 1, t)}
        {renderStat(AmplifyBackAttack, "AmplifyBackAttack", "%", 1, t)}
        {renderStat(Perfect, "Perfect", "%", 1, t)}
        {renderStat(HardHit, "HardHit", "%", 1, t)}
        {renderStat(AdditionalHitRate, "AdditionalHitRate", "%", 1, t)}
        {renderStat(CombatSpeed, "CombatSpeed", "%", 1, t)}
        {renderStat(MoveSpeed, "MoveSpeed", "%", 1, t)}
        {renderStat(CoolTimeDecrease, "CoolTimeDecrease", "%", 1, t)}
      </div>
      <Separator />
      <div className="flex justify-center ">
        <Button
          className="flex items-center"
          onClick={() => setActiveTab && setActiveTab("stat")}
        >
          <ExternalLink />
          查看属性详情
        </Button>
      </div>
    </Card>
  );
}

function EquipmentDetailPage({
  characterData,
  t,
  setActiveTab,
}: {
  characterData: CharacterProps;
  t: any;
  setActiveTab?: (v: string) => void;
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

  const equipmentList = characterData?.info?.equipmentList;
  // const skinList = characterData.equipment;
  // const petwing = characterData.petwing;
  const skillList = characterData?.info?.skillList;

  const normalEquipmentList = equipmentList.filter(
    (eq) => !(eq.slotPos >= 41 && eq.slotPos <= 45),
  );

  const rankMap = new Map(EquipmentSlotNames.map((name, idx) => [name, idx]));
  normalEquipmentList.sort((a, b) => {
    const ra = rankMap.get(a.slotPosName) ?? 999;
    const rb = rankMap.get(b.slotPosName) ?? 999;
    return ra - rb;
  });

  const ArcanaList = equipmentList.filter(
    (eq) => eq.slotPos >= 41 && eq.slotPos <= 46,
  );

  const ActiveSkillList = skillList.filter((s) => s.category === "Active");
  const PassiveSkillList = skillList.filter((s) => s.category === "Passive");
  const DpSkillList = skillList.filter((s) => s.category === "Dp");

  return (
    <div className="flex flex-col md:flex-row gap-4">
      <div className="w-full md:w-3/4 space-y-2">
        {/* 装备 */}
        <Card className="grid justify-center grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-0 p-0  rounded-lg bg-background/60 backdrop-blur-lg">
          {normalEquipmentList.map((eq) => (
            <div key={eq.slotPos}>{renderEquipmentInfo({ eq: eq })}</div>
          ))}
        </Card>

        <Card className="grid justify-center grid-cols-3 sm:grid-cols-3 md:grid-cols-6 lg:grid-cols-6 gap-2 p-5  rounded-lg bg-background/60 backdrop-blur-lg">
          {ArcanaList.map((eq) => (
            <div key={eq.slotPos}>{renderArcanaSlot({ eq: eq })}</div>
          ))}
        </Card>

        {/* 技能 */}
        <Card className="rounded-lg bg-background/60 backdrop-blur-lg">
          <div className="grid justify-center grid-cols-6 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-8 gap-10 p-5">
            {ActiveSkillList.map((skill) => (
              <div key={skill.name}>{renderSkillSlot({ skill: skill })}</div>
            ))}
          </div>
          <div className="grid justify-center grid-cols-6 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-8 gap-10 p-5">
            {PassiveSkillList.map((skill) => (
              <div key={skill.name}>{renderSkillSlot({ skill: skill })}</div>
            ))}
          </div>
          <div className="grid justify-center grid-cols-6 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-8 gap-10 p-5">
            {DpSkillList.map((skill) => (
              <div key={skill.name}>{renderSkillSlot({ skill: skill })}</div>
            ))}
          </div>
        </Card>
      </div>

      <div className="w-full md:w-1/4 space-y-2">
        {/* 排名 */}
        {/* {renderScorePanel({ character: characterData })} */}

        {/* 属性 */}
        {renderStatInfo({ characterData: characterData })}

        {renderMoreStatInfo({
          characterData: characterData,
          t: t,
          setActiveTab: setActiveTab,
        })}

        {/* 称号 */}

        {/* 宠物翅膀 */}

        {/* 守护力量 */}

        {/* <GearDamageCurveChart /> */}
      </div>
    </div>
  );
}

export function useFormulaStats(
  formula: string,
  statEntriesMap: Record<string, any[]>,
) {
  const fieldNames = useMemo(() => {
    const matches = formula.match(/\{(\w+)\}/g) || [];
    return Array.from(new Set(matches.map((m) => m.slice(1, -1))));
  }, [formula]);

  const { fieldStats, totalValue } = useMemo(() => {
    const stats: Record<string, { total: number; entries: any[] }> = {};
    fieldNames.forEach((field) => {
      stats[field] = getStatSum([field], statEntriesMap);
    });

    let expr = formula;
    fieldNames.forEach((field) => {
      const val = stats[field].total;
      expr = expr.replace(new RegExp(`\\{${field}\\}`, "g"), val.toString());
    });
    let total = 0;
    try {
      const fn = new Function(`return (${expr})`);
      const result = fn();
      total = Number.isFinite(result) ? result : 0;
    } catch (error) {
      console.error("公式计算失败", error);
    }
    return { fieldStats: stats, totalValue: total };
  }, [fieldNames, formula, statEntriesMap]);

  return { fieldNames, fieldStats, totalValue };
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

  const { fieldNames, fieldStats, totalValue } = useFormulaStats(
    formula,
    statEntriesMap,
  );

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
        className="flex items-center justify-between hover:bg-primary/5 rounded cursor-pointer h-8 p-4"
        onClick={toggleExpand}
      >
        <span className="font-medium">{t(`${name}`)}</span>
        <span className="font-bold text-md">
          {totalValue.toFixed(round)}
          {unit}
        </span>
      </div>

      {expanded && (
        <div className="pl-4 pr-4 pb-2 space-y-1 border-t mt-1 pt-2">
          {fieldNames.map((field) => {
            const stat = fieldStats[field];
            return renderStat(stat, field, unit, round, t);
          })}
          <div className="text-sm text-muted-foreground pt-2 border-t mt-2">
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

function ScoreBanner({ characterData }: { characterData: CharacterProps }) {
  const parts = characterData.processed.parts;
  const finalScore = characterData.processed.finalScore;
  return (
    <Card className="flex flex-col items-center justify-center p-6 rounded-lg bg-background/60 backdrop-blur-lg">
      <div className="text-4xl font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400">
        总评分: {finalScore.toFixed(0)}
      </div>
      <div className="flex flex-wrap gap-4 justify-center">
        {parts.map((part, idx) => (
          <Tooltip key={idx}>
            <TooltipTrigger asChild>
              <div className="bg-primary/10 px-4 py-2 rounded-full cursor-help">
                {part.name}: {part.value.toFixed(3)}
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <div className="space-y-1 w-full">
                {part.details.map((line, i) => (
                  <div key={i} className="text-sm text-gray-200">
                    {line}
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </Card>
  );
}

function StatDetailPage({
  characterData,
  t,
}: {
  characterData: CharacterProps;
  t: any;
  setActiveTab?: (v: string) => void;
}) {
  const statEntriesMap = characterData.processed.statEntriesMap;

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

  return (
    <div className="space-y-5">
      <ScoreBanner characterData={characterData} />
      <Card className="grid justify-center grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-10 p-4 rounded-lg bg-background/60 backdrop-blur-lg">
        <div className="space-y-3 ">
          <FormulaStat
            formula="({WeaponFixingDamage}+{FixingDamage})*(1+{DamageRatio}/100)"
            statEntriesMap={statEntriesMap}
            name={"WeaponFixingDamage"}
            round={2}
            t={t}
          />
          <FormulaStat
            formula="({WeaponAccuracy}+{Accuracy})*(1+{AccuracyRatio}/100)"
            statEntriesMap={statEntriesMap}
            name={"WeaponAccuracy"}
            round={0}
            t={t}
          />
          <FormulaStat
            formula="({Critical}+{WeaponCritical})*(1+{CriticalRatio}/100)"
            statEntriesMap={statEntriesMap}
            name={"Critical"}
            round={0}
            t={t}
          />
          <FormulaStat
            formula="({AmplifyAllDamage}+{PvEAmplifyDamage}+{BossNpcAmplifyDamage})"
            statEntriesMap={statEntriesMap}
            name={"AmplifyAllDamage"}
            round={1}
            unit="%"
            t={t}
          />

          <FormulaStat
            formula="{AmplifyCriticalDamage}"
            statEntriesMap={statEntriesMap}
            name={"AmplifyCriticalDamage"}
            round={1}
            unit="%"
            t={t}
          />

          <FormulaStat
            formula="{AmplifyBackAttack}"
            statEntriesMap={statEntriesMap}
            name={"AmplifyBackAttack"}
            round={1}
            unit="%"
            t={t}
          />

          <FormulaStat
            formula="{Perfect}"
            statEntriesMap={statEntriesMap}
            name={"Perfect"}
            round={1}
            unit="%"
            t={t}
          />

          <FormulaStat
            formula="{HardHit}"
            statEntriesMap={statEntriesMap}
            name={"HardHit"}
            round={1}
            unit="%"
            t={t}
          />

          <FormulaStat
            formula="{AdditionalHitRate}"
            statEntriesMap={statEntriesMap}
            name={"AdditionalHitRate"}
            round={1}
            unit="%"
            t={t}
          />

          <FormulaStat
            formula="{CombatSpeed}"
            statEntriesMap={statEntriesMap}
            name={"CombatSpeed"}
            round={1}
            unit="%"
            t={t}
          />

          <FormulaStat
            formula="{CoolTimeDecrease}"
            statEntriesMap={statEntriesMap}
            name={"CoolTimeDecrease"}
            round={1}
            unit="%"
            t={t}
          />
        </div>
        <div className="space-y-3 ">
          {renderStat(Defense, "Defense", "", 0, t)}
          {renderStat(Evasion, "Evasion", "", 0, t)}
          {renderStat(CriticalResist, "CriticalResist", "", 0, t)}
          {renderStat(DecreaseDamage, "DecreaseDamage", "", 0, t)}
          {renderStat(DecreaseCriticalDamage, "DecreaseBackAttack", "", 0, t)}
          {renderStat(DecreaseBackAttack, "DecreaseBackAttack", "", 0, t)}
          {renderStat(PerfectResist, "PerfectResist", "", 0, t)}
          {renderStat(HardHitResist, "HardHitResist", "", 0, t)}
          {renderStat(
            AdditionalHitResistRate,
            "AdditionalHitResistRate",
            "",
            0,
            t,
          )}
        </div>
      </Card>
    </div>
  );
}

export default function CharacterViewPage() {
  const { t } = useTranslation(["aion2stats"]);
  const [searchParams] = useSearchParams();

  const characterId = searchParams.get("characterId") || "";
  const serverId = searchParams.get("serverId") || "";

  const [loading, setLoading] = useState(true);
  const [characterData, setCharacterData] = useState<CharacterProps>();
  const [activeTab, setActiveTab] = useState<string>("equip");
  // const [progress, setProgress] = useState("正在初始化…");

  const fetchData = async (refresh = false) => {
    try {
      if (!characterId || !serverId) {
        setLoading(false);
        return;
      }

      setLoading(true);

      // 1. 先读缓存
      if (!refresh) {
        const cached = Aion2CharacterHistory.getOne(characterId);
        if (cached) {
          setCharacterData(cached);
          setLoading(false);
          return;
        }
      }

      // setProgress("正在拉取角色数据…");
      // 2. 调接口（把 setProgress 传进去）
      const data = await getCharacterData(characterId, serverId, "zh");

      // 3. 处理角色数据
      const processedData = processCharacterData(data);

      // 4. 更新变量
      setCharacterData(processedData);

      Aion2CharacterHistory.add(data); // 添加到本地缓存

      toast.success("加载成功", {
        description: "已经成功从官方API接口读取数据",
      });

      // 上传到数据库
      try {
        await uploadCharacterData([processedData]);
        toast.success("上传成功", {
          description: "已经成功上传至数据排行榜",
        });
      } catch {
        toast.error("上传失败", {
          description: "无法上传至数据排行榜，请登录后刷新重试",
        });
      }
    } catch (e) {
      console.error(e);
      // setProgress("加载失败，可点击重试");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(false);
  }, [characterId, serverId]);

  function LoadingSkeleton() {
    return (
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <div className="w-full space-y-5">
          {/* Banner 骨架 */}
          <Card className="bg-background/60 backdrop-blur-lg">
            <CardHeader className="flex flex-row items-center gap-5">
              <Skeleton className="w-28 h-28 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-4 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="flex flex-col gap-3 text-right">
                <div className="flex flex-row gap-5">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="space-y-1">
                      <Skeleton className="h-3 w-12" />
                      <Skeleton className="h-6 w-16" />
                      <Skeleton className="h-3 w-12" />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </CardHeader>
          </Card>

          {/* Tabs 骨架 */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
            {/* 装备详情区域骨架 */}
            <div className="flex flex-col md:flex-row gap-4">
              <div className="w-full md:w-3/4 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-32 w-full rounded-lg" />
                  ))}
                </div>
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>
              <div className="w-full md:w-1/4 space-y-2">
                <Skeleton className="h-40 w-full rounded-lg" />
                <Skeleton className="h-60 w-full rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </TooltipProvider>
    );
  }

  if (loading) {
    return (
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <div className="w-full space-y-5">
          {/* 骨架屏 */}
          <LoadingSkeleton />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <div>
      <TooltipProvider delayDuration={0} skipDelayDuration={0}>
        <div className="w-full space-y-5 ">
          {renderCharacterBanner({
            character: characterData as CharacterProps,
          })}
        </div>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v)}
          className="space-y-2"
        >
          <TabsList variant={"line"} className="w-100">
            <TabsTrigger value="equip">装备详情</TabsTrigger>
            <TabsTrigger value="stat">属性分析</TabsTrigger>
          </TabsList>

          <AnimatedTabContent value="equip">
            <EquipmentDetailPage
              characterData={characterData as CharacterProps}
              t={t}
              setActiveTab={setActiveTab}
            />
          </AnimatedTabContent>

          <AnimatedTabContent value="stat">
            <StatDetailPage
              characterData={characterData as CharacterProps}
              t={t}
            />
          </AnimatedTabContent>
        </Tabs>
      </TooltipProvider>
    </div>
  );
}
