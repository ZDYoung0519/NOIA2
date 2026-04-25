// 属性名映射表
export const STAT_NAME_MAP = {
  None: "無",
  STR: "威力",
  DEX: "敏捷",
  INT: "知識",
  CON: "體力",
  AGI: "精確",
  WIS: "意志",
  Justice: "正義",
  Freedom: "自由",
  Illusion: "幻象",
  Life: "生命",
  Time: "時間",
  Light: "光明",
  Destruction: "破壞",
  Death: "死亡",
  Wisdom: "智慧",
  Destiny: "命運",
  Space: "空間",
  Dark: "黑暗",

  WeaponFixingDamage: "攻擊力",
  FixingDamage: "額外攻擊力",
  DamageRatio: "攻擊力增加",
  ArmorDefense: "防禦力",
  Defense: "額外防禦力",
  DefenseRatio: "防禦力增加",
  AccuracyRatio: "命中增加",
  CriticalRatio: "暴擊增加",
  MaxHPRatio: "生命力增加",
  WeaponAccuracy: "命中",
  ArmorEvasion: "迴避",
  Accuracy: "額外命中",
  Evasion: "額外迴避",
  Critical: "暴擊",
  CriticalResist: "暴擊抵抗",
  CriticalResistRatio: "暴擊抵抗比率",
  HPMax: "生命力",
  MPMax: "精神力",
  CombatSpeed: "戰鬥速度",
  MoveSpeed: "移動速度",
  DefensePierce: "貫穿",
  SealStoneAddDamage: "封魂石額外傷害",
  CriticalAddDamage: "暴擊攻擊力",
  CriticalDamageDefense: "暴擊防禦力",
  BackAttackDamage: "後方攻擊力",
  BackAttackDefense: "後方防禦力",
  AmplifyAllDamage: "傷害增幅",
  DecreaseDamage: "傷害耐性",
  AmplifyWeaponDamage: "武器傷害增幅",
  DecreaseWeaponDamage: "武器傷害耐心",
  AmplifyCriticalDamage: "暴擊傷害增幅",
  DecreaseCriticalDamage: "暴擊傷害耐性",
  AmplifyBackAttack: "後方傷害增幅",
  DecreaseBackAttack: "後方傷害耐性",
  AdditionalHitRate: "多段打擊擊中",
  AdditionalHitResistRate: "多段打擊抵抗",
  BackCritical: "後方攻擊力",
  BackCriticalResist: "後方防禦力",
  Block: "格擋",
  WeaponBlockPierce: "格擋贯穿",
  ShieldBlock: "鐵壁",
  IgnoreIronWall: "鐵壁貫穿",
  Restoration: "再生",
  RestorationPierce: "再生贯穿",
  Perfect: "完美",
  HardHit: "強擊",
  PerfectResist: "完美抵抗",
  HardHitResist: "強擊抵抗",
  PvEAddDamage: "PVE攻擊力",
  PvEDamageDefense: "PVE防禦力",
  PvEAccuracy: "PVE命中",
  PvEEvasion: "PVE迴避",
  PvEAmplifyDamage: "PVE傷害增幅",
  PvEDecreaseDamage: "PVE傷害耐性",

  PvPAddDamage: "PVP攻擊力",
  PvPDamageDefense: "PVP防禦力",
  PvPAccuracy: "PVP命中",
  PvPEvasion: "PVP迴避",
  PvPAmplifyDamage: "PVP傷害增幅",
  PvPDecreaseDamage: "PVP傷害耐性",
  BossNpcAddDamage: "首領攻擊力",
  BossNpcDefense: "首領防禦力",
  BossNpcAmplifyDamage: "首領傷害增幅",
  BossNpcDecreaseDamage: "首領傷害耐性",
  CoolTimeDecrease: "冷卻時間減少",
  HpPotionRate: "生命力藥水恢復增加",
  HpHuifu: "生命力自然恢復",
};

// 主要属性类型列表
export const MAIN_STAT_TYPES = [
  "STR",
  "DEX",
  "INT",
  "CON",
  "AGI",
  "WIS",
  "Justice",
  "Freedom",
  "Illusion",
  "Life",
  "Time",
  "Destruction",
  "Death",
  "Wisdom",
  "Destiny",
  "Space",
];

// 反转映射表，方便根据中文名查找属性类型
export const REVERSE_STAT_NAME_MAP = Object.fromEntries(
  Object.entries(STAT_NAME_MAP).map(([key, value]) => [value, key])
);

// 属性条目类型定义
export type StatEntry = {
  type: string;
  name: string;
  value: number;
  minValue: number | null;
  from: string;
  icon: string;
  unit: string;
};

export function getStatSum(
  statTypes: string | string[],
  statEntriesMap: Record<string, StatEntry[]>,
  mode: string = "value"
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
    total = filteredList.reduce((sum, entry) => sum + Number(entry.minValue ?? entry.value), 0);
  }
  return {
    total,
    entries: filteredList,
  };
}

function getStatTypeFromTwName(name: string): string {
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

// 主神属性映射到对应的次级属性模板
export const templates = {
  STR: [{ type: "DamageRatio", value: 0 }],
  DEX: [
    { type: "EvasionRatio", value: 0 },
    { type: "Block", value: 0 },
    { type: "CriticalResist", value: 0 },
  ],
  INT: [{ type: "StatusHit", value: 0 }],
  CON: [{ type: "HPRatio", value: 0 }],
  AGI: [
    { type: "AccuracyRatio", value: 0 },
    { type: "CriticalRatio", value: 0 },
  ],
  WIS: [{ type: "StatusResist", value: 0 }],
  Justice: [
    { type: "Defense", value: 0 },
    { type: "Perfect", value: 0 },
  ],
  Freedom: [
    { type: "AccuracyRatio", value: 0 },
    { type: "EvasionRatio", value: 0 },
  ],
  Illusion: [
    { type: "CoolTimeDecrease", value: 0 },
    { type: "BlockPierce", value: 0 },
  ],
  Life: [
    { type: "HPRatio", value: 0 },
    { type: "Regen", value: 0 },
  ],
  Time: [
    { type: "CombatSpeed", value: 0 },
    { type: "HardHitResist", value: 0 },
  ],
  Destruction: [
    { type: "DamageRatio", value: 0 },
    { type: "PerfectResist", value: 0 },
  ],
  Death: [
    { type: "CriticalRatio", value: 0 },
    { type: "RegenPierce", value: 0 },
  ],
  Wisdom: [
    { type: "MPCost", value: 0 },
    { type: "HardHit", value: 0 },
  ],
  Destiny: [
    { type: "MPRatio", value: 0 },
    { type: "Block", value: 0 },
  ],
  Space: [
    { type: "MoveSpeed", value: 0 },
    { type: "Block", value: 0 },
  ],
} as const;

export type MainStatType = keyof typeof templates;

function calStatSecondList(stat: { type: string; value: number }) {
  const { type, value } = stat;
  const validValue = Math.min(Math.max(value, 0), 200); // 限制在0-200范围内

  if (!(type in templates)) {
    console.warn(`未知类型: ${type}`);
    return [];
  }

  const templateList = templates[type as MainStatType];

  // 确定系数
  const baseTypes = new Set(["STR", "DEX", "INT", "CON", "AGI", "WIS"]);
  const coefficient = baseTypes.has(type) ? 0.1 : 0.2;
  const computedValue = validValue * coefficient;

  return templateList.map((item) => ({
    type: item.type,
    value: computedValue.toFixed(2),
  }));
}

// 将玩家所有物品属性转换为属性条目Map, key:属性类型，value:该属性类型的所有条目列表
export function getStatEntriesMap(
  equipmentList: any[],
  boardList: {
    name: string;
    openStatEffectList: [];
  }[],
  titleList: {
    id: string;
    equipCategory: string;
    name: string;
    grade: string;
    equipStatList: { desc: string }[];
    statList: { desc: string }[];
  }[],
  statList: Record<string, any>[]
): Record<string, StatEntry[]> {
  const DEFAULT_ICON = "images/aion2/aion2.png";

  // 基础属性
  const statsEntries: Array<StatEntry> = [];
  statsEntries.push({
    type: getStatTypeFromTwName("攻擊力"),
    name: "攻擊力",
    value: 61,
    minValue: 61,
    from: "人物基础",
    icon: DEFAULT_ICON,
    unit: "",
  });

  // 装备
  equipmentList.forEach((eq) => {
    const info = eq.detail;
    if (!info) return;

    /* mainStats */
    info.mainStats?.forEach((item: any) => {
      item.name = item.name.split("[")[0];
      const unit = String(item.value).includes("%") ? "%" : "";
      const value = toNum(item.value) + toNum(item?.extra);
      const minValue = item?.minValue ?? value;

      const type = getStatTypeFromTwName(item.name);
      if (type != item.id) {
        console.warn("不匹配的属性名:", item.name, type, item.id);
      }

      statsEntries.push({
        type: type,
        name: item.name,
        value: value,
        minValue: minValue,
        icon: item.icon || info.icon || DEFAULT_ICON,
        from: `${info.name}${item.exceed ? "[突破]" : ""}`,
        unit: unit,
      });
    });

    /* subStats */
    info.subStats?.forEach((item: any) => {
      item.name = item.name.split("[")[0];
      const value = toNum(item.value) + toNum(item?.extra);
      const minValue = item?.minValue ?? value;
      const unit = String(item.value).includes("%") ? "%" : "";

      const type = getStatTypeFromTwName(item.name);
      if (type != item.id) {
        console.warn("不匹配的属性名:", item.name, type, item.id);
      }
      statsEntries.push({
        type: type,
        name: item.name,
        value: value,
        minValue: minValue,
        icon: item.icon || info.icon || DEFAULT_ICON,
        from: `${info.name}[灵魂刻印]`,
        unit: unit,
      });
    });

    /* magicStoneStat */
    info.magicStoneStat?.forEach((item: any) => {
      item.name = item.name.split("[")[0];

      const isPCT = ["武器傷害增幅", "暴擊傷害增幅", "後方傷害增幅", "傷害增幅"].includes(
        item.name
      );

      const value = isPCT
        ? (toNum(item.value) + toNum(item?.extra)) / 100
        : toNum(item.value) + toNum(item?.extra);
      const unit = isPCT ? "%" : String(item.value).includes("%") ? "%" : "";

      const minValue = item?.minValue ?? null;

      const type = getStatTypeFromTwName(item.name);
      if (type != item.id) {
        console.warn("不匹配的属性名:", item.name, type, item.id);
      }

      statsEntries.push({
        type: type,
        name: item.name,
        value: value,
        minValue: minValue,
        icon: item.icon || eq.icon || "",
        from: `${info.name}[神石]`,
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
        type: getStatTypeFromTwName(name),
        name: name,
        value: toNum(value),
        minValue: toNum(value),
        from: `${board.name}[守护力]`,
        icon: "images/aion2/aion2.png",
        unit: unit,
      });
    });
  });

  // 称号属性
  titleList.forEach((item) => {
    const equipStatList = item?.equipStatList;
    equipStatList.forEach((stat) => {
      const [name, value] = stat.desc.split(" ");
      const unit = String(value).includes("%") ? "%" : "";
      statsEntries.push({
        type: getStatTypeFromTwName(name),
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
    debugger;
    const statSecondList = calStatSecondList(stat as { type: string; value: number });
    statSecondList.forEach((statSecond) => {
      statsEntries.push({
        type: statSecond.type,
        name: STAT_NAME_MAP[statSecond?.type as keyof typeof STAT_NAME_MAP],
        value: Number(statSecond.value),
        minValue: Number(statSecond.value),
        from: STAT_NAME_MAP[stat?.type as keyof typeof STAT_NAME_MAP] + "-属性转换",
        icon: DEFAULT_ICON,
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
      {} as Record<string, StatEntry[]>
    );
  }

  return groupStatsByType(statsEntries);
}
