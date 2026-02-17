import {
  CharacterProps,
  StatEntry,
  StatType,
  templates,
  STAT_NAME_MAP,
} from "../types";

export const REVERSE_STAT_NAME_MAP = Object.fromEntries(
  Object.entries(STAT_NAME_MAP).map(([key, value]) => [value, key]),
);

function getStatType(name: string): string {
  const key = REVERSE_STAT_NAME_MAP[name];
  if (!key) {
    console.warn("未识别的属性:", name);
  }
  return key ?? ("Unknown" as any);
}

const toNum = (v: unknown): number => {
  if (typeof v === "number") return v;
  const str = String(v).trim().replace(/%/g, ""); // 去掉 %
  return Number.isFinite(Number(str)) ? Number(str) : 0;
};

function calStatSecondList(stat: { type: string; value: number }) {
  const { type, value } = stat;
  if (!(type in templates)) {
    console.warn(`未知类型: ${type}`);
    return [];
  }

  const templateList = templates[type as StatType];

  // 确定系数
  const baseTypes = new Set(["STR", "DEX", "INT", "CON", "AGI", "WIS"]);
  const coefficient = baseTypes.has(type) ? 0.1 : 0.2;
  const computedValue = value * coefficient;

  return templateList.map((item) => ({
    type: item.type,
    value: computedValue.toFixed(2),
  }));
}

export function getStatEntriesMap(
  characterData: CharacterProps,
  statList: Record<string, any>[],
): Record<string, StatEntry[]> {
  const equipmentList = characterData.info.equipmentList ?? [];

  const boardList = (characterData.info.daevanion.boardList ?? []) as {
    name: string;
    openStatEffectList: [];
  }[];
  const statsEntries: Array<StatEntry> = [];

  statsEntries.push({
    type: getStatType("攻擊力"),
    name: "攻擊力",
    value: 61,
    minValue: 61,
    from: "人物基础",
    icon: "/game_icons/aion2.png",
    unit: "",
  });

  // 装备
  equipmentList.forEach((eq) => {
    const info = eq.item_info;
    if (!info) return;

    /* mainStats */
    info.mainStats?.forEach((item: any) => {
      item.name = item.name.split("[")[0];
      const unit = String(item.value).includes("%") ? "%" : "";
      const value = toNum(item.value) + toNum(item?.extra);
      const minValue = item?.minValue ?? value;

      const type = getStatType(item.name);
      if (type != item.id) {
        console.warn("不匹配的属性名:", item.name, type, item.id);
      }

      statsEntries.push({
        type: type,
        name: REVERSE_STAT_NAME_MAP[type],
        value: value,
        minValue: minValue,
        icon: item.icon || eq.icon || "",
        from: `${eq.name}${item.exceed ? "[突破]" : ""}`,
        unit: unit,
      });
    });

    /* subStats */
    info.subStats?.forEach((item: any) => {
      item.name = item.name.split("[")[0];
      const value = toNum(item.value) + toNum(item?.extra);
      const minValue = item?.minValue ?? value;
      const unit = String(item.value).includes("%") ? "%" : "";

      const type = getStatType(item.name);
      if (type != item.id) {
        console.warn("不匹配的属性名:", item.name, type, item.id);
      }

      statsEntries.push({
        type: type,
        name: item.name,
        value: value,
        minValue: minValue,
        icon: item.icon || eq.icon || "",
        from: `${eq.name}[灵魂刻印]`,
        unit: unit,
      });
    });

    /* magicStoneStat */
    info.magicStoneStat?.forEach((item: any) => {
      item.name = item.name.split("[")[0];

      const isPCT = [
        "武器傷害增幅",
        "暴擊傷害增幅",
        "後方傷害增幅",
        "傷害增幅",
      ].includes(item.name);

      const value = isPCT
        ? (toNum(item.value) + toNum(item?.extra)) / 100
        : toNum(item.value) + toNum(item?.extra);
      const unit = isPCT ? "%" : String(item.value).includes("%") ? "%" : "";

      const minValue = item?.minValue ?? null;

      const type = getStatType(item.name);
      if (type != item.id) {
        console.warn("不匹配的属性名:", item.name, type, item.id);
      }

      statsEntries.push({
        type: type,
        name: item.name,
        value: value,
        minValue: minValue,
        icon: item.icon || eq.icon || "",
        from: `${eq.name}[神石]`,
        unit: unit,
      });
    });
  });

  // 守护力
  boardList.forEach((board) => {
    (board?.openStatEffectList || []).forEach((item: any) => {
      const [name, value] = item.desc.split(" ");
      const unit = String(value).includes("%") ? "%" : "";
      statsEntries.push({
        type: getStatType(name),
        name: name,
        value: toNum(value),
        minValue: toNum(value),
        from: `${board.name}[守护力]`,
        icon: "/game_icons/aion2.png",
        unit: unit,
      });
    });
  });

  // 称号属性
  const titleList = characterData.info.title?.titleList as {
    id: string;
    equipCategory: string;
    name: string;
    grade: string;
    equipStatList: { desc: string }[];
    statList: { desc: string }[];
  }[];
  titleList.forEach((item) => {
    const equipStatList = item?.equipStatList;
    equipStatList.forEach((stat) => {
      const [name, value] = stat.desc.split(" ");
      const unit = String(value).includes("%") ? "%" : "";
      statsEntries.push({
        type: getStatType(name),
        name: name,
        value: toNum(value),
        minValue: toNum(value),
        from: `${item.name}[称号]`,
        icon: "/game_icons/aion2.png",
        unit: unit,
      });
    });
  });

  // 翅膀属性

  // 装备外观收集

  // 称号收集

  // 翅膀收集

  // 宠物收集

  // 主神属性转换
  statList.forEach((stat) => {
    const statSecondList = calStatSecondList(
      stat as { type: string; value: number },
    );
    statSecondList.forEach((statSecond) => {
      statsEntries.push({
        type: statSecond.type,
        name: STAT_NAME_MAP[statSecond?.type as keyof typeof STAT_NAME_MAP],
        value: Number(statSecond.value),
        minValue: Number(statSecond.value),
        from:
          STAT_NAME_MAP[stat?.type as keyof typeof STAT_NAME_MAP] + "-属性转换",
        icon: "/game_icons/aion2.png",
        unit: "%",
      });
    });
  });

  function groupStatsByType(entries: StatEntry[]): Record<string, StatEntry[]> {
    return entries.reduce(
      (acc, entry) => {
        const { type } = entry;
        // 如果当前 type 还没有对应的数组，则初始化一个空数组
        if (!acc[type]) {
          acc[type] = [];
        }
        // 将当前条目加入对应 type 的数组
        acc[type].push(entry);
        return acc;
      },
      {} as Record<string, StatEntry[]>,
    );
  }

  return groupStatsByType(statsEntries);
}

export function getStatSum(
  statTypes: string | string[],
  statEntriesMap: Record<string, StatEntry[]>,
  mode: string = "value",
): { total: number; entries: StatEntry[] } {
  // 统一为数组
  const types = Array.isArray(statTypes) ? statTypes : [statTypes];

  // 收集所有匹配的条目
  const filteredList: StatEntry[] = [];
  for (const type of types) {
    const entries = statEntriesMap[type];
    if (entries) {
      filteredList.push(...entries);
    }
  }

  // 计算总和
  let total = 0;
  if (mode === "value") {
    total = filteredList.reduce((sum, entry) => sum + entry.value, 0);
  } else if (mode === "min") {
    total = filteredList.reduce(
      (sum, entry) => sum + Number(entry.minValue ?? entry.value),
      0,
    );
  }
  return {
    total,
    entries: filteredList,
  };
}

export function calCharacterScore(
  statEntriesMap: Record<string, StatEntry[]>,
): {
  parts: Array<{ name: string; value: number; details: string[] }>;
  finalScore: number;
} {
  const targetDefense = 3000;
  const targetEvasion = 0;
  const targetCriticalResist = 0;
  const targetDecreaseCriticalDamage = 0;
  const targetDecreaseBackAttack = 0;
  const targetDecreaseDamage = 65;
  const targetPerfectResist = 0;
  const targetHardHitResist = 0;
  const targetAdditionalHitResistRate = 0;
  const backAttackRatio = 0.8;
  const skillCoefficient = 0.75;

  const getSum = (
    types: string | string[],
    mode: "value" | "min" = "value",
  ): number => getStatSum(types, statEntriesMap, mode).total;

  // ---------- 基础属性总值（value 模式） ----------
  const WeaponFixingDamage = getSum("WeaponFixingDamage");
  const FixingDamage = getSum("FixingDamage");
  const DamageRatio = getSum("DamageRatio");
  const DefensePierce = getSum("DefensePierce");

  const WeaponAccuracy = getSum("WeaponAccuracy");
  const Accuracy = getSum("Accuracy");
  const AccuracyRatio = getSum("AccuracyRatio");

  const AmplifyBackAttack = getSum("AmplifyBackAttack");
  const BackAttackDamage = getSum("BackAttackDamage");

  const WeaponCritical = getSum("WeaponCritical");
  const Critical = getSum("Critical");
  const CriticalRatio = getSum("CriticalRatio");
  const AmplifyCriticalDamage = getSum("AmplifyCriticalDamage");
  const CriticalAddDamage = getSum("CriticalAddDamage");

  const AmplifyAllDamage = getSum("AmplifyAllDamage");
  const PvEAmplifyDamage = getSum("PvEAmplifyDamage");
  const BossNpcAmplifyDamage = getSum("BossNpcAmplifyDamage");

  const Perfect = getSum("Perfect");
  const HardHit = getSum("HardHit");
  const AdditionalHitRate = getSum("AdditionalHitRate");

  // ---------- min 模式（用于最小攻击） ----------
  const minWeaponFixingDamage = getSum("WeaponFixingDamage", "min");
  const minFixingDamage = getSum("FixingDamage", "min");

  // ---------- 攻击乘区 DamagePart ----------
  const damageTotal = WeaponFixingDamage + FixingDamage;
  const damagePartRaw = damageTotal * (1 + DamageRatio / 100);
  const damagePartValue =
    damagePartRaw * skillCoefficient - (targetDefense - DefensePierce) / 10;
  const damagePartDetails = [
    `攻击乘区 = 攻击力 * 技能倍率 - (防御力 - 贯穿) / 10`,
    `${damagePartValue.toFixed(2)} = ${damagePartRaw.toFixed(2)} * ${skillCoefficient} - (${targetDefense} - ${DefensePierce}) / 10`,
  ];

  // ---------- 背击命中乘区 AccuracyPart ----------
  const accuracyTotal = (WeaponAccuracy + Accuracy) * (1 + AccuracyRatio / 100);
  const actualAccuracy = Math.min(
    (accuracyTotal - targetEvasion + 1500) / (1400 + 1500),
    1,
  );
  const actualAccuracyRatio = Math.max(actualAccuracy, 0);
  const backAttackCeof1 =
    (100 + AmplifyBackAttack - targetDecreaseBackAttack) / 100;
  const backAttackCeof2 = (damagePartRaw + BackAttackDamage) / damagePartRaw; // 注意此处用原始攻击力（不含技能系数）
  const accuracyPartValue =
    backAttackRatio * backAttackCeof1 * backAttackCeof2 +
    (1 - backAttackRatio) *
      (actualAccuracyRatio * 1 + (1 - actualAccuracyRatio) * 0.4);
  const accuracyPartDetails = [
    `背击命中乘区: 背击率 * 背击增幅1 * 背击增幅2 + (1-背击率) * [命中率*1 + (1-命中率)*0.4]`,
    `背击率: ${(backAttackRatio * 100).toFixed(1)}%`,
    `背击增幅1: (1 + 背击伤害增幅 - 被击伤害抵抗) = ${(backAttackCeof1 * 100).toFixed(2)}%`,
    `背击增幅2: (攻击力 + 背击攻击力) / 攻击力 = ${(backAttackCeof2 * 100).toFixed(2)}%`,
    `命中率: (命中 - 闪避 + 1500) / 2900 = ${(actualAccuracyRatio * 100).toFixed(2)}%`,
  ];

  // ---------- 暴击爆伤乘区 CriticalPart ----------
  const criticalTotal = (WeaponCritical + Critical) * (1 + CriticalRatio / 100);
  const criticalRatio = Math.min(
    1.0461 /
      (1 + Math.exp(-0.006 * (criticalTotal - targetCriticalResist - 1024.52))),
    0.8,
  );
  const criticalCeof1 = (damagePartRaw + CriticalAddDamage) / damagePartRaw;
  const criticalCeof2 =
    (150 + AmplifyCriticalDamage - targetDecreaseCriticalDamage) / 100;
  const criticalPartValue =
    criticalRatio * criticalCeof1 * criticalCeof2 + (1 - criticalRatio) * 1;
  const criticalPartDetails = [
    `暴击爆伤乘区: 暴击率 * 暴击增幅1 * 暴击增幅2 + (1-暴击率) * 1`,
    `暴击率: 1.0461 / (1 + exp(-0.006 * (暴击 - 暴击抵抗 - 1024.52))) = ${(criticalRatio * 100).toFixed(2)}%`,
    `暴击增幅1: (攻击力 + 暴击攻击力) / 攻击力 = ${criticalCeof1.toFixed(3)}`,
    `暴击增幅2: (1.5 + 暴击伤害增幅 - 暴击伤害抵抗) = ${criticalCeof2.toFixed(3)}`,
  ];

  // ---------- 伤害增幅乘区 AmplifyPart ----------
  const amplifyDamage =
    AmplifyAllDamage + PvEAmplifyDamage + BossNpcAmplifyDamage;
  const amplifyPartRaw = 1 + (amplifyDamage - targetDecreaseDamage) / 100;
  const amplifyPartValue = Math.min(Math.max(amplifyPartRaw, 1), 2); // 限制在 [1,2]
  const amplifyPartDetails = [
    `伤害增幅乘区: 1 + (伤害增幅 - 目标伤害抗性) / 100，限制在 [1,2]`,
    `伤害增幅: 伤害增幅 + PvE伤害增幅 + 首领伤害增幅 = ${amplifyDamage.toFixed(2)}%`,
    `目标伤害抗性: ${targetDecreaseDamage}%`,
    `计算值: ${amplifyPartRaw.toFixed(3)}，最终: ${amplifyPartValue.toFixed(3)}`,
  ];

  // ---------- 完美乘区 PerfectPart ----------
  const minDamageTotal = minWeaponFixingDamage + minFixingDamage;
  const maxDamageTotal = WeaponFixingDamage + FixingDamage;
  const perfectCeof = (maxDamageTotal / (maxDamageTotal + minDamageTotal)) * 2;
  const perfectRatioRaw = (Perfect - targetPerfectResist) / 100;
  const perfectRatio = Math.min(Math.max(perfectRatioRaw, 0), 1);
  const perfectPartValue = perfectRatio * perfectCeof + (1 - perfectRatio);
  const perfectPartDetails = [
    `完美乘区: 完美率 * 完美系数 + (1-完美率) * 1`,
    `完美系数: 最大攻击 / (最大攻击 + 最小攻击) * 2 = ${(perfectCeof * 100).toFixed(2)}%`,
    `完美率: (完美 - 完美抵抗) / 100 = ${(perfectRatio * 100).toFixed(2)}%`,
    `最大攻击: ${maxDamageTotal.toFixed(2)}`,
    `最小攻击: ${minDamageTotal.toFixed(2)}`,
  ];

  // ---------- 强击乘区 HardHitPart ----------
  const hardHitRatioRaw = (HardHit - targetHardHitResist) / 100;
  const hardHitRatio = Math.min(Math.max(hardHitRatioRaw, 0), 1);
  const hardHitPartValue = hardHitRatio * 2 + (1 - hardHitRatio);
  const hardHitPartDetails = [
    `强击乘区: 强击率 * 2 + (1-强击率) * 1`,
    `强击率: (强击 - 强击抵抗) / 100 = ${(hardHitRatio * 100).toFixed(2)}%`,
  ];

  // ---------- 多段打击乘区 AdditionalHitPart ----------
  const additionalHitRatioRaw =
    (AdditionalHitRate - targetAdditionalHitResistRate) / 100;
  const additionalHitRatio = Math.min(Math.max(additionalHitRatioRaw, 0), 1);
  const additionalHitPartValue = 1 + 0.2 * additionalHitRatio;
  const additionalHitPartDetails = [
    `多段打击乘区: 1 + 0.2*多段打击概率`,
    `多段打击概率 p = (多段打击 - 多段打击抵抗) / 100 = ${(additionalHitRatio * 100).toFixed(2)}%`,
    `计算结果: ${additionalHitPartValue.toFixed(3)}`,
  ];

  // ---------- 最终分数 ----------
  const finalScore =
    damagePartValue *
    accuracyPartValue *
    criticalPartValue *
    amplifyPartValue *
    hardHitPartValue *
    perfectPartValue *
    additionalHitPartValue;

  const parts = [
    { name: "攻击乘区", value: damagePartValue, details: damagePartDetails },
    {
      name: "背击命中乘区",
      value: accuracyPartValue,
      details: accuracyPartDetails,
    },
    {
      name: "暴击爆伤乘区",
      value: criticalPartValue,
      details: criticalPartDetails,
    },
    {
      name: "伤害增幅乘区",
      value: amplifyPartValue,
      details: amplifyPartDetails,
    },
    { name: "完美乘区", value: perfectPartValue, details: perfectPartDetails },
    { name: "强击乘区", value: hardHitPartValue, details: hardHitPartDetails },
    {
      name: "多段打击乘区",
      value: additionalHitPartValue,
      details: additionalHitPartDetails,
    },
  ];

  return {
    parts,
    finalScore,
  };
}

export function processCharacterData(
  characterData: CharacterProps,
): CharacterProps {
  const statList = characterData.info.stat.statList;
  const statEntriesMap = getStatEntriesMap(characterData, statList);
  const { parts, finalScore } = calCharacterScore(statEntriesMap);
  characterData.processed.statEntriesMap = statEntriesMap;
  characterData.processed.parts = parts;
  characterData.processed.finalScore = finalScore;

  const itemLevel =
    characterData.info.stat.statList.find((s: any) => s.type === "ItemLevel")
      ?.value || 0;
  characterData.scores = {
    PvEScore: finalScore,
    ItemLevel: itemLevel,
  };
  return characterData;
}
