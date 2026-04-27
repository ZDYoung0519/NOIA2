import { useState } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "../custom-tooltip";
import { Separator } from "@/components/ui/separator";
import { getStatSum } from "@/lib/aion2/stat-utils";
import { Card } from "@/components/ui/card";

import { useMemo } from "react";

export function renderStatInfo({ statList }: { statList: { type: string }[] }) {
  // 主属性类型
  const mainStatTypes = ["STR", "DEX", "INT", "CON", "AGI", "WIS"];

  // 分离主属性和副属性
  const mainStats = statList.filter((stat) => mainStatTypes.includes(stat.type));

  const subStats = statList.filter((stat) => !mainStatTypes.includes(stat.type)).slice(0, -1);

  // 主属性渲染
  const renderMainStat = (stat: Record<string, any>) => {
    const statSecondList = stat.statSecondList as [];
    return (
      <Tooltip key={stat.type}>
        <TooltipTrigger asChild>
          <div className="">
            <div className="flex flex-col items-center gap-0 p-0">
              {/* 图片 */}
              <div className="flex h-12 w-12 items-center justify-center rounded-full transition-colors">
                <img
                  src={`/images/aion2/stat_${stat.type.toLowerCase()}.png`}
                  alt={stat.name}
                  className="h-12 w-12 object-contain"
                />
              </div>
              {/* 属性名和值 */}
              <div className="text-center text-lg font-bold">{stat.name}</div>
              <div className="text-md text-primary">{stat.value}</div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <div className="space-y-2">
            {statSecondList && statSecondList.length > 0 && (
              <div className="space-y-1">
                {statSecondList.map((item, index) => (
                  <div key={index} className="flex items-start gap-2 text-sm">
                    <div className="bg-primary mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full" />
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
                  className="h-6 w-6 object-contain"
                  onError={(e) => {
                    e.currentTarget.src = "/images/aion2/stat_default.png";
                  }}
                />
              </div>

              {/* 属性名和值 */}
              <div className="text-mg text-center font-bold" title={displayName}>
                {displayName}
              </div>
              <div className="text-sm">{stat.value}</div>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="p-2">
          <div className="space-y-2 text-center">
            {statSecondList && statSecondList.length > 0 && (
              <div className="max-w-[150px] space-y-1 text-xs">
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
    <div className="bg-background/60 z-0 backdrop-blur-lg">
      <div className="space-y-5 p-4">
        {mainStats.length > 0 && (
          <div>
            <div className="grid grid-cols-3 gap-5 md:grid-cols-3 lg:grid-cols-3">
              {mainStats.map(renderMainStat)}
            </div>
          </div>
        )}
        <Separator />
        {subStats.length > 0 && (
          <div>
            <div className="grid grid-cols-5 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-5">
              {subStats.map(renderSubStat)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function useFormulaStats(formula: string, statEntriesMap: Record<string, any[]>) {
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

export function renderStat(
  stat: { total: number; entries: any[] },
  name: string,
  unit: string,
  round: number,
  t: any
) {
  const NUMROW = 20;
  const rowCount = Math.min(stat.entries.length, NUMROW);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="hover:bg-primary/5 flex h-8 cursor-pointer items-center justify-between rounded p-4">
          <span className="font-medium">{t(`${name}`)}</span>
          <span className="text-md font-bold">
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
                  {entry.icon && <img src={entry.icon} alt="" className="h-4 w-4" />}
                  <span>{entry.from}</span>
                  <span className="flex-1 truncate" />
                  <span className="font-medium">
                    {entry.name}+
                    {entry.minValue != null && entry.value != entry.minValue
                      ? `${entry.minValue}~${entry.value}`
                      : entry.value}
                    {unit}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-center text-sm text-gray-400">Empty</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

export function renderDetailedStatInfo({
  statEntriesMap,
  tStats,
}: {
  statEntriesMap: Record<string, any[]>;
  tStats: any;
}) {
  const Damage = getStatSum(["FixingDamage", "WeaponFixingDamage"], statEntriesMap);
  const DamageRatio = getStatSum(["DamageRatio"], statEntriesMap);
  const Accuracy = getStatSum(["Accuracy", "WeaponAccuracy"], statEntriesMap);
  const AccuracyRatio = getStatSum(["AccuracyRatio"], statEntriesMap);
  const Critical = getStatSum(["Critical", "WeaponCritical"], statEntriesMap);
  const CriticalRatio = getStatSum(["CriticalRatio"], statEntriesMap);
  const AmplifyAllDamage = getStatSum(
    ["AmplifyAllDamage", "PvEAmplifyDamage", "BossNpcAmplifyDamage"],
    statEntriesMap
  );
  statEntriesMap;
  const AmplifyCriticalDamage = getStatSum(["AmplifyCriticalDamage"], statEntriesMap);
  const AmplifyBackAttack = getStatSum(["AmplifyBackAttack"], statEntriesMap);
  const Perfect = getStatSum(["Perfect"], statEntriesMap);
  const HardHit = getStatSum(["HardHit"], statEntriesMap);
  const AdditionalHitRate = getStatSum(["AdditionalHitRate"], statEntriesMap);
  const CombatSpeed = getStatSum(["CombatSpeed"], statEntriesMap);
  const MoveSpeed = getStatSum(["MoveSpeed"], statEntriesMap);
  const CoolTimeDecrease = getStatSum(["CoolTimeDecrease"], statEntriesMap);

  return (
    <Card className="bg-background/60 p-2 text-sm backdrop-blur-lg">
      <div className="space-y-3">
        {renderStat(Damage, "WeaponFixingDamage", "", 0, tStats)}
        {renderStat(DamageRatio, "DamageRatio", "%", 1, tStats)}
        {renderStat(Accuracy, "WeaponAccuracy", "", 0, tStats)}
        {renderStat(AccuracyRatio, "AccuracyRatio", "%", 1, tStats)}
        {renderStat(Critical, "Critical", "", 0, tStats)}
        {renderStat(CriticalRatio, "CriticalRatio", "%", 1, tStats)}
        {renderStat(AmplifyAllDamage, "AmplifyAllDamage", "%", 1, tStats)}
        {renderStat(AmplifyCriticalDamage, "AmplifyCriticalDamage", "%", 1, tStats)}
        {renderStat(AmplifyBackAttack, "AmplifyBackAttack", "%", 1, tStats)}
        {renderStat(Perfect, "Perfect", "%", 1, tStats)}
        {renderStat(HardHit, "HardHit", "%", 1, tStats)}
        {renderStat(AdditionalHitRate, "AdditionalHitRate", "%", 1, tStats)}
        {renderStat(CombatSpeed, "CombatSpeed", "%", 1, tStats)}
        {renderStat(MoveSpeed, "MoveSpeed", "%", 1, tStats)}
        {renderStat(CoolTimeDecrease, "CoolTimeDecrease", "%", 1, tStats)}
      </div>
      <Separator />
      {/* <div className="flex justify-center">
        <Button className="flex items-center" onClick={() => setActiveTab && setActiveTab("stat")}>
          <ExternalLink />
          查看属性详情
        </Button>
      </div> */}
    </Card>
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
