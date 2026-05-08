import npcNamesData from "@/data/npc_names_zh.json";

type NpcNameEntry = {
  name?: string;
  level?: number;
  npcType?: string;
  npcSubType?: string;
  mainCategory?: string;
};

const npcNames = npcNamesData as Record<string, NpcNameEntry>;

export function getNpcName(npcId: number | string): string | undefined {
  return npcNames[String(npcId)]?.name;
}

export function getNpcDisplayName(npcId: number | string): string {
  return getNpcName(npcId) ?? `Boss ${String(npcId)}`;
}

export function getNpcById(npcId: number | string): NpcNameEntry | undefined {
  return npcNames[String(npcId)];
}
