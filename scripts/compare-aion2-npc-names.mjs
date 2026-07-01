import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const mobsPath = path.join(rootDir, "src", "data", "aion2", "mobs.json");
const npcNamesPath = path.join(
  rootDir,
  "src",
  "data",
  "aion2",
  "npc_names_zh.json",
);

const outputJson = process.argv.includes("--json");
const bossOnly = process.argv.includes("--boss-only");
const outArgIndex = process.argv.indexOf("--out");
const outPath =
  outArgIndex >= 0 && process.argv[outArgIndex + 1]
    ? path.resolve(rootDir, process.argv[outArgIndex + 1])
    : null;

const [mobs, npcNames] = await Promise.all([
  readJson(mobsPath),
  readJson(npcNamesPath),
]);

if (!Array.isArray(mobs)) {
  throw new Error(`Expected mobs.json to be an array: ${mobsPath}`);
}

const npcNameCodes = new Set(Object.keys(npcNames));
const mobByCode = new Map();
const knownNameTranslations = new Map();

for (const mob of mobs) {
  if (mob?.code === undefined || mob?.code === null) {
    continue;
  }

  const code = String(mob.code);
  const knownNpcName = npcNames[code]?.name;
  if (mob.name && knownNpcName && !knownNameTranslations.has(mob.name)) {
    knownNameTranslations.set(mob.name, knownNpcName);
  }

  if (!mobByCode.has(code)) {
    mobByCode.set(code, {
      code,
      name: mob.name ?? "",
      suggestedZhName: mob.name ? (knownNameTranslations.get(mob.name) ?? "") : "",
      boss: Boolean(mob.boss),
    });
  }
}

let missing = [...mobByCode.values()]
  .filter((mob) => !npcNameCodes.has(mob.code))
  .map((mob) => ({
    ...mob,
    suggestedZhName: knownNameTranslations.get(mob.name) ?? mob.suggestedZhName,
  }))
  .sort((a, b) => Number(a.code) - Number(b.code));

if (bossOnly) {
  missing = missing.filter((mob) => mob.boss);
}

const result = {
  mobsTotal: mobs.length,
  uniqueMobCodes: mobByCode.size,
  npcNamesTotal: npcNameCodes.size,
  missingTotal: missing.length,
  missingBossTotal: missing.filter((mob) => mob.boss).length,
  missing,
};

if (outputJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`mobs.json total rows: ${result.mobsTotal}`);
  console.log(`mobs.json unique codes: ${result.uniqueMobCodes}`);
  console.log(`npc_names_zh.json codes: ${result.npcNamesTotal}`);
  console.log(`missing codes${bossOnly ? " (boss only)" : ""}: ${result.missingTotal}`);
  console.log(`missing boss codes: ${result.missingBossTotal}`);

  if (missing.length > 0) {
    console.log("");
    console.log("Missing entries:");
    for (const mob of missing) {
      const bossMark = mob.boss ? " boss" : "";
      const suggestedName = mob.suggestedZhName
        ? `\t=> ${mob.suggestedZhName}`
        : "";
      console.log(`${mob.code}\t${mob.name}${bossMark}${suggestedName}`);
    }
  }
}

if (outPath) {
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(`${outPath}`, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`\nWrote missing entries to ${outPath}`);
}

async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}
