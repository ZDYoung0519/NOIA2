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

const SOURCE_TABLE = process.env.SOURCE_TABLE ?? "NOIA2DPS";
const TARGET_TABLE = process.env.TARGET_TABLE ?? "aion2_dps";
const FETCH_BATCH_SIZE = Number(process.env.FETCH_BATCH_SIZE ?? 100);
const UPSERT_BATCH_SIZE = Number(process.env.UPSERT_BATCH_SIZE ?? 200);
const DRY_RUN = process.argv.includes("--dry-run");

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

function getSkillStatsTotalDamage(stats) {
  return Number(stats?.total_damage ?? 0);
}

function getMinTime(values) {
  const numericValues = Object.values(values ?? {}).filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return 0;
  }
  return Math.min(...numericValues);
}

function getMaxTime(values) {
  const numericValues = Object.values(values ?? {}).filter((value) => Number.isFinite(value));
  if (numericValues.length === 0) {
    return 0;
  }
  return Math.max(...numericValues);
}

function getDuration(startTime, lastTime) {
  if (startTime > 0 && lastTime > startTime) {
    return lastTime - startTime;
  }
  return 0;
}

function toIsoDateTime(timestampSeconds) {
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
    return null;
  }
  return new Date(timestampSeconds * 1000).toISOString();
}

function normalizeRowData(data) {
  if (!data) {
    return null;
  }
  if (typeof data === "string") {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data;
}

function transformHistoryRecord(record, fallbackCreatedAt) {
  const targetIdKey = String(record?.targetId ?? "");
  const targetInfo = record?.combatInfos?.targetInfos?.[targetIdKey];
  const actorInfos = record?.combatInfos?.actorInfos ?? {};

  const mainActorId = record?.combatInfos?.mainActorId;
  const mainActorIdKey = String(mainActorId ?? "");
  const mainActorInfo = mainActorIdKey ? actorInfos[mainActorIdKey] : undefined;

  const battleStartTime = targetInfo?.targetStartTime ?? {};
  const battleLastTime = targetInfo?.targetLastTime ?? {};
  const teamBattleStartTime = getMinTime(battleStartTime);
  const teamBattleLastTime = getMaxTime(battleLastTime);
  const teamBattleDuration = getDuration(teamBattleStartTime, teamBattleLastTime);

  const partyTotalDamage = Object.values(record?.thisTargetAllPlayerStats ?? {}).reduce(
    (sum, stats) => sum + getSkillStatsTotalDamage(stats),
    0
  );

  const teamDps = teamBattleDuration > 0 ? partyTotalDamage / teamBattleDuration : 0;

  const mainActorDamage =
    mainActorId != null
      ? getSkillStatsTotalDamage(record?.thisTargetAllPlayerStats?.[String(mainActorId)])
      : 0;

  const mainActorBattleStartTime =
    mainActorId != null ? Number(battleStartTime[String(mainActorId)] ?? 0) : 0;
  const mainActorBattleLastTime =
    mainActorId != null ? Number(battleLastTime[String(mainActorId)] ?? 0) : 0;
  const mainActorBattleDuration = getDuration(mainActorBattleStartTime, mainActorBattleLastTime);
  const mainActorDps =
    mainActorBattleDuration > 0 ? mainActorDamage / mainActorBattleDuration : 0;

  return {
    record_id: record?.id ?? null,
    created_at: fallbackCreatedAt ?? new Date().toISOString(),
    battle_ended_at: toIsoDateTime(teamBattleLastTime),
    target_mob_code: targetInfo?.targetMobCode ?? null,
    target_name: targetInfo?.targetName ?? null,
    is_boss: targetInfo?.isBoss ?? false,
    target_max_hp: targetInfo?.maxHp ?? null,
    battle_start_time: battleStartTime,
    battle_last_time: battleLastTime,
    team_battle_duration: teamBattleDuration,
    party_total_damage: partyTotalDamage,
    team_dps: teamDps,
    main_actor_name: record?.combatInfos?.mainActorName ?? null,
    main_actor_server_id: mainActorInfo?.actorServerId ?? null,
    main_actor_class: mainActorInfo?.actorClass ?? null,
    main_actor_damage: mainActorDamage,
    main_actor_battle_duration: mainActorBattleDuration,
    main_actor_dps: mainActorDps,
    data: record,
  };
}

async function fetchFirstBatch() {
  const { data, error } = await supabase
    .from(SOURCE_TABLE)
    .select("id, created_at, data")
    .order("created_at", { ascending: true })
    .limit(FETCH_BATCH_SIZE);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function fetchNextBatch(lastCreatedAt) {
  const { data, error } = await supabase
    .from(SOURCE_TABLE)
    .select("id, created_at, data")
    .gt("created_at", lastCreatedAt)
    .order("created_at", { ascending: true })
    .limit(FETCH_BATCH_SIZE);

  if (error) {
    throw error;
  }

  return data ?? [];
}

async function upsertBatch(rows) {
  const { error } = await supabase.from(TARGET_TABLE).upsert(rows, {
    onConflict: "record_id",
    ignoreDuplicates: false,
  });

  if (error) {
    throw error;
  }
}

async function main() {
  console.log(
    `Migrating DPS data from ${SOURCE_TABLE} to ${TARGET_TABLE}${DRY_RUN ? " (dry run)" : ""}...`
  );

  let fetched = 0;
  let migrated = 0;
  let skipped = 0;
  let lastCreatedAt = null;

  for (;;) {
    const batch = lastCreatedAt == null ? await fetchFirstBatch() : await fetchNextBatch(lastCreatedAt);
    if (batch.length === 0) {
      break;
    }

    fetched += batch.length;

    const transformedRows = [];

    for (const row of batch) {
      const record = normalizeRowData(row.data);
      if (!record) {
        skipped += 1;
        continue;
      }

      const transformed = transformHistoryRecord(record, row.created_at ?? undefined);
      if (!transformed.record_id) {
        skipped += 1;
        continue;
      }

      transformedRows.push(transformed);
    }

    if (DRY_RUN) {
      migrated += transformedRows.length;
    } else {
      for (let i = 0; i < transformedRows.length; i += UPSERT_BATCH_SIZE) {
        const chunk = transformedRows.slice(i, i + UPSERT_BATCH_SIZE);
        await upsertBatch(chunk);
        migrated += chunk.length;
      }
    }

    console.log(
      `Processed source rows +${batch.length}: migrated=${migrated}, skipped=${skipped}, lastCreatedAt=${batch[batch.length - 1]?.created_at ?? "n/a"}`
    );

    lastCreatedAt = batch[batch.length - 1]?.created_at ?? null;
  }

  console.log(
    `Migration completed. fetched=${fetched}, migrated=${migrated}, skipped=${skipped}${DRY_RUN ? " (dry run)" : ""}`
  );
}

main().catch((error) => {
  console.error("Migration failed:", error);
  process.exit(1);
});
