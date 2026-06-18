export type Poe2ItemValue = [string, number];

export type Poe2ItemStat = {
  name: string;
  values: Poe2ItemValue[];
  displayMode: number;
  type?: number;
  icon?: string;
};

export type Poe2Socket = {
  group: number;
  type: string;
};

export type Poe2SocketedItem = {
  realm: string;
  verified: boolean;
  w: number;
  h: number;
  icon: string;
  support: boolean;
  league: string | null;
  gemSockets: string[];
  sockets: Poe2Socket[];
  name: string;
  typeLine: string;
  baseType: string;
  ilvl: number;
  identified: boolean;
  properties: Poe2ItemStat[];
  requirements: Poe2ItemStat[];
  secDescrText?: string;
  gemBackground?: string;
  gemSkill?: string;
  descrText?: string;
  frameTypeId: string;
  socketedItems: Poe2SocketedItem[];
};

export type Poe2Item = {
  verified: boolean;
  w: number;
  h: number;
  icon: string;
  league: string | null;
  name: string;
  typeLine: string;
  rarity: string;
  ilvl: number;
  identified: boolean;
  properties: Poe2ItemStat[];
  requirements?: Poe2ItemStat[];
  grantedSkills?: Poe2ItemStat[];
  implicitMods?: string[];
  utilityMods?: string[];
  explicitMods?: string[];
  flavourText?: string[];
  descrText?: string;
  frameTypeId: string;
  socketedItems?: Poe2SocketedItem[];
};

const solarOrbSocketed: Poe2SocketedItem = {
  realm: "poe2",
  verified: false,
  w: 1,
  h: 1,
  icon: "/protected/image/promo/poe2/items/SolarOrbSkillGem.png?key=9ZgZH7GxBf4RpgV3mKEw_g",
  support: false,
  league: null,
  gemSockets: ["W", "W"],
  sockets: [
    { group: 0, type: "gem" },
    { group: 1, type: "gem" },
  ],
  name: "",
  typeLine: "Solar Orb",
  baseType: "Solar Orb",
  ilvl: 0,
  identified: true,
  properties: [
    {
      name: "[Spell], [AoESkill|AoE], [Sustained], [Fire], [DurationSkill|Duration], [Orb], [Repeat|Repeatable]",
      values: [],
      displayMode: 0,
    },
    { name: "Level", values: [["9", 0]], displayMode: 0, type: 5 },
    { name: "Cost", values: [["0 Mana", 0]], displayMode: 0 },
    { name: "Cast Time", values: [["0.80s", 0]], displayMode: 0 },
    { name: "[Critical|Critical Hit] Chance", values: [["7.00%", 0]], displayMode: 0 },
  ],
  requirements: [
    { name: "Level", values: [["31", 0]], displayMode: 0, type: 62 },
    { name: "[Intelligence|Int]", values: [["57", 0]], displayMode: 1, type: 65 },
  ],
  secDescrText:
    "Create a fiery [Orb|Orb] that periodically releases fiery pulses. Enemies that are very close to the [Orb|Orb] are [Ignite|Ignited]. Flameblast can target a Solar Orb to be centred on the Orb instead of your location.",
  gemBackground:
    "/protected/image/promo/poe2/items/GemBackground_GemHoverImageSolarOrb.png?key=TWO51BwAcg7nsK9fMHY3Vg",
  gemSkill:
    "/protected/image/promo/poe2/items/GemSkill_SorceressSolarOrb.png?key=Xfz9RozvpzvFMXaa-ybhwQ",
  descrText: "Skills can be managed in the Skills Panel.",
  frameTypeId: "Gem",
  socketedItems: [],
};

const equipmentById: Record<string, Poe2Item> = {
  TheSearingTouch: {
    verified: false,
    w: 1,
    h: 4,
    icon: "/protected/image/promo/poe2/items/TheSearingTouch.png?key=LGF6SEw19Bv7-wLXYLTE3A",
    league: null,
    name: "The Searing Touch",
    typeLine: "Pyrophyte Staff",
    rarity: "Unique",
    ilvl: 33,
    identified: true,
    properties: [{ name: "[Staff]", values: [], displayMode: 0 }],
    requirements: [
      { name: "Level", values: [["31", 0]], displayMode: 0, type: 62 },
      { name: "[Intelligence|Int]", values: [["57", 0]], displayMode: 1, type: 65 },
    ],
    grantedSkills: [
      {
        name: "Grants Skill",
        values: [["Level 9 Solar Orb", 25]],
        displayMode: 0,
        icon: "/protected/image/promo/poe2/items/GemSkill_SorceressSolarOrb.png?key=Xfz9RozvpzvFMXaa-ybhwQ",
      },
    ],
    explicitMods: [
      "111% increased [Fire] Damage",
      "10% increased Cast Speed",
      "100% increased [Flammability] [BuffMagnitude|Magnitude]",
      "100% increased [Ignite|Ignite] [BuffMagnitude|Magnitude]",
      "[Ignite|Ignites] you inflict [AilmentSpread|spread] to other Enemies that stay within 1.5 metres for 1 second",
    ],
    flavourText: ["Burn to cinders, scar and maim,\r", "Rule a world, bathed in flame."],
    frameTypeId: "Unique",
    socketedItems: [solarOrbSocketed],
  },
  CollectorsChainTiaraoftheHydra: {
    verified: false,
    w: 2,
    h: 2,
    icon: "/protected/image/promo/poe2/items/CollectorsChainTiaraoftheHydra.png?key=numMw8t-AoAf2sif01skaw",
    league: null,
    name: "",
    typeLine: "Collector's Chain Tiara of the Hydra",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "Helmet", values: [], displayMode: 0 },
      { name: "[EnergyShield|Energy Shield]", values: [["44", 0]], displayMode: 0, type: 18 },
    ],
    requirements: [
      { name: "Level", values: [["26", 0]], displayMode: 0, type: 62 },
      { name: "[Intelligence|Int]", values: [["49", 0]], displayMode: 1, type: 65 },
    ],
    explicitMods: ["13% increased [ItemRarity|Rarity of Items] found", "Regenerate 10.6 Life per second"],
    frameTypeId: "Magic",
  },
  LoathSkin: {
    verified: false,
    w: 2,
    h: 3,
    icon: "/protected/image/promo/poe2/items/LoathSkin.png?key=EuSBiMQl_0mMZYUenSmDpw",
    league: null,
    name: "Loath Skin",
    typeLine: "Votive Raiment",
    rarity: "Rare",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "Body Armour", values: [], displayMode: 0 },
      { name: "[EnergyShield|Energy Shield]", values: [["99", 1]], displayMode: 0, type: 18 },
    ],
    requirements: [
      { name: "Level", values: [["33", 0]], displayMode: 0, type: 62 },
      { name: "[Intelligence|Int]", values: [["68", 0]], displayMode: 1, type: 65 },
    ],
    explicitMods: [
      "+21 to maximum [EnergyShield|Energy Shield]",
      "+18% to [Fire|Fire] Resistance",
      "Regenerate 3.1 Life per second",
      "+7 to [StunThreshold|Stun Threshold]",
    ],
    frameTypeId: "Rare",
  },
  StallionsFeatheredSandalsoftheStorm: {
    verified: false,
    w: 2,
    h: 2,
    icon: "/protected/image/promo/poe2/items/StallionsFeatheredSandalsoftheStorm.png?key=1yDMU3btFjtkgrX5GVTcGA",
    league: null,
    name: "",
    typeLine: "Stallion's Feathered Sandals of the Storm",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "Boots", values: [], displayMode: 0 },
      { name: "[EnergyShield|Energy Shield]", values: [["38", 0]], displayMode: 0, type: 18 },
    ],
    requirements: [
      { name: "Level", values: [["33", 0]], displayMode: 0, type: 62 },
      { name: "[Intelligence|Int]", values: [["57", 0]], displayMode: 1, type: 65 },
    ],
    explicitMods: ["20% increased Movement Speed", "+20% to [Lightning|Lightning] Resistance"],
    frameTypeId: "Magic",
  },
  AzureJewelledGlovesoftheCloud: {
    verified: false,
    w: 2,
    h: 2,
    icon: "/protected/image/promo/poe2/items/AzureJewelledGlovesoftheCloud.png?key=qh1f5R0022QA5GH7CS2TDw",
    league: null,
    name: "",
    typeLine: "Azure Jewelled Gloves of the Cloud",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "Gloves", values: [], displayMode: 0 },
      { name: "[EnergyShield|Energy Shield]", values: [["22", 0]], displayMode: 0, type: 18 },
    ],
    requirements: [
      { name: "Level", values: [["26", 0]], displayMode: 0, type: 62 },
      { name: "[Intelligence|Int]", values: [["43", 0]], displayMode: 1, type: 65 },
    ],
    explicitMods: ["+27 to maximum Mana", "+7% to [Lightning|Lightning] Resistance"],
    frameTypeId: "Magic",
  },
  MagpiesRubyRingoftheLynx: {
    verified: false,
    w: 1,
    h: 1,
    icon: "/protected/image/promo/poe2/items/MagpiesRubyRingoftheLynx.png?key=y36gG3xQQzwHFURl7xaNHQ",
    league: null,
    name: "",
    typeLine: "Magpie's Ruby Ring of the Lynx",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [{ name: "Ring", values: [], displayMode: 0 }],
    requirements: [{ name: "Level", values: [["8", 0]], displayMode: 0, type: 62 }],
    implicitMods: ["+27% to [Fire|Fire] Resistance"],
    explicitMods: ["9% increased [ItemRarity|Rarity of Items] found", "+11 to [Dexterity|Dexterity]"],
    frameTypeId: "Magic",
  },
  StoutSapphireRingoftheStudent: {
    verified: false,
    w: 1,
    h: 1,
    icon: "/protected/image/promo/poe2/items/StoutSapphireRingoftheStudent.png?key=dJnicyyig8T1Uk1Y28Fcow",
    league: null,
    name: "",
    typeLine: "Stout Sapphire Ring of the Student",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [{ name: "Ring", values: [], displayMode: 0 }],
    requirements: [{ name: "Level", values: [["19", 0]], displayMode: 0, type: 62 }],
    implicitMods: ["+21% to [Cold|Cold] Resistance"],
    explicitMods: ["+64 to maximum Life", "+9 to [Intelligence|Intelligence]"],
    frameTypeId: "Magic",
  },
  SkullLash: {
    verified: false,
    w: 2,
    h: 1,
    icon: "/protected/image/promo/poe2/items/SkullLash.png?key=IosCiNeGLvnMuq8ihVlc5Q",
    league: null,
    name: "Skull Lash",
    typeLine: "Rawhide Belt",
    rarity: "Rare",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "Belt", values: [], displayMode: 0 },
      { name: "Charm Slots", values: [["1", 0]], displayMode: 0 },
    ],
    requirements: [{ name: "Level", values: [["20", 0]], displayMode: 0, type: 62 }],
    implicitMods: ["23% increased Life Recovery from [Flask|Flasks]"],
    explicitMods: [
      "+63 to maximum Mana",
      "7% increased [Charm] Effect Duration",
      "Regenerate 1.8 Life per second",
      "11% reduced [Flask|Flask] Charges used",
    ],
    frameTypeId: "Rare",
  },
  AzureAmuletoftheStudent: {
    verified: false,
    w: 1,
    h: 1,
    icon: "/protected/image/promo/poe2/items/AzureAmuletoftheStudent.png?key=ljMCs_RpT2HGxmvbllZdiw",
    league: null,
    name: "",
    typeLine: "Azure Amulet of the Student",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [{ name: "Amulet", values: [], displayMode: 0 }],
    requirements: [{ name: "Level", values: [["8", 0]], displayMode: 0, type: 62 }],
    implicitMods: ["21% increased Mana Regeneration Rate"],
    explicitMods: ["+9 to [Intelligence|Intelligence]"],
    frameTypeId: "Magic",
  },
  BloomingAntidoteCharmoftheWide: {
    verified: false,
    w: 1,
    h: 1,
    icon: "/protected/image/promo/poe2/items/BloomingAntidoteCharmoftheWide.png?key=KeuqXcJ_KZFNjwwIXtS06g",
    league: null,
    name: "",
    typeLine: "Blooming Antidote Charm of the Wide",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "Charm", values: [], displayMode: 0 },
      { name: "Lasts {0} Seconds", values: [["3", 0]], displayMode: 3 },
      { name: "Consumes {0} of {1} Charges on use", values: [["40", 0], ["100", 1]], displayMode: 3 },
      { name: "Currently has {0} Charges", values: [["100", 0]], displayMode: 3 },
    ],
    requirements: [{ name: "Level", values: [["24", 0]], displayMode: 0, type: 62 }],
    utilityMods: ["Grants Immunity to [Poison|Poison]"],
    implicitMods: ["Used when you become Poisoned"],
    explicitMods: ["Recover 17 Life when Used", "26% increased Charges"],
    descrText:
      "Used automatically when condition is met. Can only hold charges while in belt. Refill at [Wells|Wells] or by killing monsters.",
    frameTypeId: "Magic",
  },
  CompactColossalManaFlaskoftheMedic: {
    verified: false,
    w: 1,
    h: 2,
    icon: "/protected/image/promo/poe2/items/CompactColossalManaFlaskoftheMedic.png?key=tpdhboLAKGx0Ia7AeKUl2g",
    league: null,
    name: "",
    typeLine: "Compact Colossal Mana Flask of the Medic",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "[Flask]", values: [], displayMode: 0 },
      { name: "Recovers {0} Mana over {1} Seconds", values: [["246", 1], ["2.50", 0]], displayMode: 3 },
      { name: "Consumes {0} of {1} Charges on use", values: [["10", 0], ["55", 0]], displayMode: 3 },
      { name: "Currently has {0} Charges", values: [["55", 0]], displayMode: 3 },
    ],
    requirements: [{ name: "Level", values: [["30", 0]], displayMode: 0, type: 62 }],
    explicitMods: ["49% increased Amount Recovered", "25% Chance to gain a Charge when you Kill an Enemy"],
    descrText:
      "Right click to drink. Can only hold charges while in belt. Refill at [Wells|Wells] or by killing monsters.",
    frameTypeId: "Magic",
  },
  SimmeringColossalLifeFlaskoftheFoliage: {
    verified: false,
    w: 1,
    h: 2,
    icon: "/protected/image/promo/poe2/items/SimmeringColossalLifeFlaskoftheFoliage.png?key=nnG8JJsIWR9ByG44DU7Pyw",
    league: null,
    name: "",
    typeLine: "Simmering Colossal Life Flask of the Foliage",
    rarity: "Magic",
    ilvl: 33,
    identified: true,
    properties: [
      { name: "[Flask]", values: [], displayMode: 0 },
      { name: "Recovers {0} Life over {1} Seconds", values: [["450", 0], ["4", 0]], displayMode: 3 },
      { name: "Consumes {0} of {1} Charges on use", values: [["10", 0], ["75", 0]], displayMode: 3 },
      { name: "Currently has {0} Charges", values: [["75", 0]], displayMode: 3 },
    ],
    requirements: [{ name: "Level", values: [["30", 0]], displayMode: 0, type: 62 }],
    explicitMods: ["21% of Recovery applied Instantly", "Gains 0.17 Charges per Second"],
    descrText:
      "Right click to drink. Can only hold charges while in belt. Refill at [Wells|Wells] or by killing monsters.",
    frameTypeId: "Magic",
  },
};

export const slotItemMap = {
  "weapon-main": "TheSearingTouch",
  helmet: "CollectorsChainTiaraoftheHydra",
  gloves: "AzureJewelledGlovesoftheCloud",
  "ring-left": "MagpiesRubyRingoftheLynx",
  "ring-right": "StoutSapphireRingoftheStudent",
  "body-armour": "LoathSkin",
  boots: "StallionsFeatheredSandalsoftheStorm",
  belt: "SkullLash",
  amulet: "AzureAmuletoftheStudent",
  "flask-life": "SimmeringColossalLifeFlaskoftheFoliage",
  "flask-mana": "CompactColossalManaFlaskoftheMedic",
  "flask-utility": "BloomingAntidoteCharmoftheWide",
} as const;

export default equipmentById;
