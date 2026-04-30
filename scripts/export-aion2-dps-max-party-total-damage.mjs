import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const entries = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    entries[key] = value;
  }

  return entries;
}

const envFromFile = loadDotEnvFile(path.resolve(process.cwd(), ".env"));

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.VITE_SUPABASE_URL ??
  envFromFile.SUPABASE_URL ??
  envFromFile.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.VITE_SUPABASE_ANON_KEY ??
  envFromFile.SUPABASE_SERVICE_ROLE_KEY ??
  envFromFile.SUPABASE_ANON_KEY ??
  envFromFile.VITE_SUPABASE_ANON_KEY;

const SOURCE_TABLE = process.env.SOURCE_TABLE ?? "aion2_dps";
const FETCH_BATCH_SIZE = Number(process.env.FETCH_BATCH_SIZE ?? 1000);
const OUTPUT_PATH =
  process.env.OUTPUT_PATH ??
  path.resolve(process.cwd(), "scripts", "output", "aion2-dps-max-party-total-damage.json");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "Missing Supabase credentials. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or provide them in .env."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

function coerceNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

async function fetchBatch(cursor) {
  let query = supabase
    .from(SOURCE_TABLE)
    .select("record_id,created_at,target_mob_code,target_name,target_max_hp,party_total_damage")
    .not("target_mob_code", "is", null)
    .order("created_at", { ascending: true })
    .order("record_id", { ascending: true })
    .limit(FETCH_BATCH_SIZE);

  if (cursor) {
    const createdAt = cursor.createdAt;
    const recordId = cursor.recordId;
    query = query.or(
      `created_at.gt.${createdAt},and(created_at.eq.${createdAt},record_id.gt.${recordId})`
    );
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return data ?? [];
}

async function main() {
  console.log(`Exporting max party_total_damage per mob from ${SOURCE_TABLE}...`);

  const maxDamageByMobCode = new Map();
  let fetched = 0;
  let cursor = null;

  for (;;) {
    const batch = await fetchBatch(cursor);
    if (batch.length === 0) {
      break;
    }

    fetched += batch.length;

    for (const row of batch) {
      const mobCode = String(row.target_mob_code);
      const partyTotalDamage = coerceNumber(row.party_total_damage);
      const targetMaxHp = coerceNumber(row.target_max_hp);
      const targetName = typeof row.target_name === "string" ? row.target_name.trim() : "";
      const current = maxDamageByMobCode.get(mobCode) ?? {
        name: "",
        maxDamage: 0,
        maxHp: 0,
      };

      if (partyTotalDamage > current.maxDamage) {
        current.maxDamage = partyTotalDamage;
        if (targetName) {
          current.name = targetName;
        }
      } else if (!current.name && targetName) {
        current.name = targetName;
      }

      if (targetMaxHp > current.maxHp) {
        current.maxHp = targetMaxHp;
      }

      maxDamageByMobCode.set(mobCode, current);
    }

    const lastRow = batch[batch.length - 1];
    cursor = {
      createdAt: lastRow.created_at,
      recordId: lastRow.record_id,
    };

    console.log(
      `Processed +${batch.length} rows. fetched=${fetched}, uniqueMobCodes=${maxDamageByMobCode.size}, lastCreatedAt=${lastRow.created_at}`
    );
  }

  const output = {
    generatedAt: new Date().toISOString(),
    sourceTable: SOURCE_TABLE,
    totalRowsScanned: fetched,
    totalMobCodes: maxDamageByMobCode.size,
    values: Object.fromEntries(
      [...maxDamageByMobCode.entries()].sort((left, right) => Number(left[0]) - Number(right[0]))
    ),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Export completed. output=${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error("Export failed:", error);
  process.exit(1);
});
