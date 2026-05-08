import npcNamesData from "@/data/npc_names_zh.json";
import dungeonsData from "@/data/dungeons.json";

type NpcNameEntry = {
  name?: string;
  level?: number;
  npcType?: string;
  npcSubType?: string;
  mainCategory?: string;
};

type LocalizedText = Record<string, string | undefined>;

type DungeonEntry = {
  dungeon_id: string;
  name: LocalizedText;
  difficulty: LocalizedText;
  boss_ids: number[];
};

const npcNames = npcNamesData as Record<string, NpcNameEntry>;
const dungeons = dungeonsData as DungeonEntry[];
const dungeonByMobCode = new Map<string, DungeonEntry>();

for (const dungeon of dungeons) {
  for (const bossId of dungeon.boss_ids) {
    dungeonByMobCode.set(String(bossId), dungeon);
  }
}

export function getNpcName(npcId: number | string): string | undefined {
  return npcNames[String(npcId)]?.name;
}

export function getNpcDisplayName(npcId: number | string): string {
  return getNpcName(npcId) ?? `Boss ${String(npcId)}`;
}

export function getNpcById(npcId: number | string): NpcNameEntry | undefined {
  return npcNames[String(npcId)];
}

export function getDungeonByMobCode(mobCode: number | string): DungeonEntry | undefined {
  return dungeonByMobCode.get(String(mobCode));
}

export function getDungeonNameByMobCode(
  mobCode: number | string,
  language = "zh-CN"
): string | undefined {
  const dungeon = getDungeonByMobCode(mobCode);
  if (!dungeon) {
    return undefined;
  }

  return dungeon.name[language] ?? dungeon.name["zh-CN"] ?? dungeon.name.en;
}

export function getDungeonDisplayNameByMobCode(
  mobCode: number | string,
  language = "zh-CN"
): string {
  return getDungeonNameByMobCode(mobCode, language) ?? "未知副本";
}
