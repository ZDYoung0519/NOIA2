import { invoke } from "@tauri-apps/api/core";

export const DPS_METER_CONFIG_KEY = "dps-meter-config";
export const MAX_PACKET_SIZE_THRESHOLD_OPTIONS = [2048, 4096, 8192, 16384] as const;

export type DpsMeterConfig = {
  dpsSnapshotIntervalMs: number;
  memorySnapshotIntervalMs: number;
  maxPacketSizeThreshold: number;
  enableResyncOnStall: boolean;
  resyncDelayMs: number;
  bossOnly: boolean;
  myMuzhuangOnly: boolean;
  outputDebugLog: boolean;
};

export const DEFAULT_DPS_METER_CONFIG: DpsMeterConfig = {
  dpsSnapshotIntervalMs: 250,
  memorySnapshotIntervalMs: 1000,
  maxPacketSizeThreshold: 4096,
  enableResyncOnStall: true,
  resyncDelayMs: 500,
  bossOnly: true,
  myMuzhuangOnly: true,
  outputDebugLog: false,
};

function normalizeMaxPacketSizeThreshold(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (
    MAX_PACKET_SIZE_THRESHOLD_OPTIONS.includes(
      numeric as (typeof MAX_PACKET_SIZE_THRESHOLD_OPTIONS)[number]
    )
  ) {
    return numeric;
  }
  return DEFAULT_DPS_METER_CONFIG.maxPacketSizeThreshold;
}

function normalizeDpsMeterConfig(input?: Partial<DpsMeterConfig>): DpsMeterConfig {
  const resyncDelayMs = Number(input?.resyncDelayMs ?? DEFAULT_DPS_METER_CONFIG.resyncDelayMs);
  return {
    ...DEFAULT_DPS_METER_CONFIG,
    ...(input ?? {}),
    maxPacketSizeThreshold: normalizeMaxPacketSizeThreshold(input?.maxPacketSizeThreshold),
    enableResyncOnStall:
      input?.enableResyncOnStall ?? DEFAULT_DPS_METER_CONFIG.enableResyncOnStall,
    resyncDelayMs: Number.isFinite(resyncDelayMs)
      ? Math.min(30000, Math.max(100, resyncDelayMs))
      : DEFAULT_DPS_METER_CONFIG.resyncDelayMs,
    outputDebugLog: input?.outputDebugLog ?? DEFAULT_DPS_METER_CONFIG.outputDebugLog,
  };
}

export function loadDpsMeterConfig(): DpsMeterConfig {
  try {
    const raw = localStorage.getItem(DPS_METER_CONFIG_KEY);
    if (!raw) {
      return DEFAULT_DPS_METER_CONFIG;
    }

    return normalizeDpsMeterConfig(JSON.parse(raw) as Partial<DpsMeterConfig>);
  } catch {
    return DEFAULT_DPS_METER_CONFIG;
  }
}

export async function syncDpsMeterConfigToBackend(config?: DpsMeterConfig) {
  const resolved = normalizeDpsMeterConfig(config ?? loadDpsMeterConfig());
  return invoke<DpsMeterConfig>("apply_dps_meter_config", { config: resolved });
}

export async function saveDpsMeterConfig(config: DpsMeterConfig) {
  const resolved = normalizeDpsMeterConfig(config);
  localStorage.setItem(DPS_METER_CONFIG_KEY, JSON.stringify(resolved));
  return syncDpsMeterConfigToBackend(resolved);
}
