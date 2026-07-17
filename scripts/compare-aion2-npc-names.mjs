import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

const sourcePath = path.join(rootDir, "npc_names.json");
const npcDataPath = path.join(rootDir, "npc_data.json");
const targetPath = path.join(rootDir, "src", "games", "aion2", "data", "npc_names_zh.json");
const outArgIndex = process.argv.indexOf("--out");
const outPath =
  outArgIndex >= 0 && process.argv[outArgIndex + 1]
    ? path.resolve(rootDir, process.argv[outArgIndex + 1])
    : path.join(rootDir, "scripts", "output", "missing-aion2-npc-names.json");

const [sourceNpcNames, npcData, targetNpcNames] = await Promise.all([
  readJson(sourcePath),
  readJson(npcDataPath),
  readJson(targetPath),
]);

const bossCodes = new Set(
  Object.entries(npcData)
    .filter(([, value]) => value?.is_boss === true)
    .map(([code]) => code)
);

const missingEntries = Object.fromEntries(
  Object.entries(sourceNpcNames)
    .filter(([code]) => bossCodes.has(code) && !Object.hasOwn(targetNpcNames, code))
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([code, value]) => [
      code,
      {
        name: value?.zh_TW ?? value?.zh_CN ?? value?.en ?? "",
        level: 0,
        npcType: "",
        npcSubType: "",
        mainCategory: "monster",
      },
    ])
);

const summary = {
  source: path.relative(rootDir, sourcePath),
  npcData: path.relative(rootDir, npcDataPath),
  target: path.relative(rootDir, targetPath),
  sourceTotal: Object.keys(sourceNpcNames).length,
  bossTotal: bossCodes.size,
  targetTotal: Object.keys(targetNpcNames).length,
  missingTotal: Object.keys(missingEntries).length,
};

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(missingEntries, null, 2)}\n`, "utf8");

console.log(`source total: ${summary.sourceTotal}`);
console.log(`boss total: ${summary.bossTotal}`);
console.log(`target total: ${summary.targetTotal}`);
console.log(`missing boss total: ${summary.missingTotal}`);
console.log(`wrote missing entries to: ${path.relative(rootDir, outPath)}`);

async function readJson(filePath) {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content);
}
