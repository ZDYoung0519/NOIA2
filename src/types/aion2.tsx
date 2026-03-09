// 服务器相关
export type RaceType = "天族" | "魔族";

export interface ServerGroup {
  race: RaceType;
  servers: string[];
}

export interface ServerDropdownProps {
  value?: string;
  groups: ServerGroup[];
  onChange: (server: string, faction: RaceType) => void;
  disabled?: boolean;
}

export const TIEN_SERVERS = [
  "所有",
  "希埃爾",
  "奈薩肯",
  "白傑爾",
  "凱西內爾",
  "尤斯迪埃",
  "艾瑞爾",
  "普雷奇翁",
  "梅斯蘭泰達",
  "希塔尼耶",
  "納尼亞",
  "塔哈巴達",
  "路特斯",
  "菲爾諾斯",
  "達彌努",
  "卡薩卡",
  "巴卡爾摩",
  "天加隆",
  "科奇隆",
] as const;

export const ASMODIAN_SERVERS = [
  "所有",
  "伊斯拉佩爾",
  "吉凱爾",
  "崔妮爾",
  "露梅爾",
  "瑪爾庫坦",
  "阿斯佩爾",
  "艾萊修奇卡",
  "布里特拉",
  "奈蒙",
  "哈達爾",
  "盧德萊",
  "鄔爾古倫",
  "默尼",
  "奧達爾",
  "簡卡卡",
  "克羅梅德",
  "奎靈",
  "巴巴隆",
] as const;

// 职业
export const CLASSES = [
  "殺星",
  "劍星",
  "護法星",
  "治愈星",
  "守護星",
  "魔道星",
  "精靈星",
  "弓星",
] as const;

export type StatEntry = {
  type: string;
  name: string;
  value: number;
  minValue: number | null;
  from: string;
  icon: string;
  unit: string;
};

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
    { type: "Cooldown", value: 0 },
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
} as const; // 使用 as const 可以更精确地推断类型

export type StatType = keyof typeof templates;

export interface CharacterProps {
  characterId: string;
  serverId: string;
  updatedAt: string;
  profile: {
    pcId: number;
    gender: number;
    raceId: number;
    titleId: number;
    raceName: string;
    serverId: number;
    className: string;
    titleName: string;
    genderName: string;
    regionName: string;
    serverName: string;
    titleGrade: string;
    characterId: string;
    profileImage: string;
    characterName: string;
    characterLevel: string;
  };
  info: {
    equipmentList: any[];
    skinList: any[];
    pet: Record<string, any>;
    wing: Record<string, any>;
    skillList: any[];
    daevanion: any;
    ranking: Record<string, any>;
    title: Record<string, any>;
    stat: Record<string, any>;
  };
  processed: {
    statEntriesMap: Record<string, any[]>;
    parts: Array<{ name: string; value: number; details: string[] }>;
    statsProfile: Record<string, any>;
    finalScore: Number;
  };
  scores: Record<string, number>;
}

export interface BuildDataProps {
  id: string;
  updatedAt: string;
  profile: {
    buildName: string;
    className: string;
    labels: string[];
    author: string | null;
    authorId: string | null;
  };
  info: {
    equipmentList: any[];
    skinList: any[];
    pet: Record<string, any>;
    wing: Record<string, any>;
    skillList: any[];
    daevanion: any;
    ranking: Record<string, any>;
    title: Record<string, any>;
    stat: Record<string, any>;
  };
  processed: {
    statEntriesMap: Record<string, any[]>;
    parts: Array<{ name: string; value: number; details: string[] }>;
    finalScore: Number;
  };
  scores: Record<string, number>;
}

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
  HPMaxRatio: "生命力增加",

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
  SealStoneAddDamage: "封印石額外傷害",
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
  ShieldBlock: "铁壁",
  ShieldBlockPierce: "铁壁贯穿",
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
  BossNpcAddDamage: "首領攻擊力",
  BossNpcDefense: "首領防禦力",
  BossNpcAmplifyDamage: "首領傷害增幅",
  BossNpcDecreaseDamage: "首領傷害耐性",
  CoolTimeDecrease: "冷卻時間減少",
};

export type GradeType =
  | "Common"
  | "Rare"
  | "Legend"
  | "Unique"
  | "Epic"
  | "Special";

export const gradeConfig = {
  Common: {
    bg: `url("/images/aion2/SlotCommon.webp")`,
    border: "border-white-400",
    text: "text-white-400",
    bgDark: "bg-white-800",
    lightBg: "bg-white-50",
  },
  Rare: {
    bg: `url("/images/aion2/Rare.webp")`,
    border: "border-green-300",
    text: "text-green-300",
    bgDark: "bg-green-900",
    lightBg: "bg-green-50",
  },
  Legend: {
    bg: `url("/images/aion2/SlotLegend.webp")`,
    border: "border-blue-400",
    text: "text-blue-400",
    bgDark: "bg-blue-900",
    lightBg: "bg-blue-50",
  },
  Unique: {
    bg: `url("/images/aion2/SlotUnique.webp")`,
    border: "border-yellow-400",
    text: "text-yellow-400",
    bgDark: "bg-yellow-900",
    lightBg: "bg-yellow-50",
  },
  Epic: {
    bg: `url("/images/aion2/SlotEpic.webp")`,
    border: "border-orange-500",
    text: "text-orange-500",
    bgDark: "bg-transparent",
    lightBg: "bg-orange-50",
  },
  Special: {
    bg: `url("/images/aion2/SlotSpecial.webp")`,
    border: "border-teal-500",
    text: "text-teal-500",
    bgDark: "bg-transparent",
    lightBg: "bg-teal-50",
  },
};
