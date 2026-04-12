import { invoke } from "@tauri-apps/api/core";

export const DPS_METER_CONFIG_KEY = "dps-meter-config";

export type DpsMeterConfig = {
  dpsSnapshotIntervalMs: number;
  memorySnapshotIntervalMs: number;
  bossOnly: boolean;
  myMuzhuangOnly: boolean;
  outputDebugLog: boolean;
};

export const DEFAULT_DPS_METER_CONFIG: DpsMeterConfig = {
  dpsSnapshotIntervalMs: 500,
  memorySnapshotIntervalMs: 1500,
  bossOnly: false,
  myMuzhuangOnly: false,
  outputDebugLog: false,
};

export function loadDpsMeterConfig(): DpsMeterConfig {
  try {
    const raw = localStorage.getItem(DPS_METER_CONFIG_KEY);
    if (!raw) {
      return DEFAULT_DPS_METER_CONFIG;
    }

    return {
      ...DEFAULT_DPS_METER_CONFIG,
      ...JSON.parse(raw),
    };
  } catch {
    return DEFAULT_DPS_METER_CONFIG;
  }
}

export async function syncDpsMeterConfigToBackend(config?: DpsMeterConfig) {
  const resolved = config ?? loadDpsMeterConfig();
  return invoke<DpsMeterConfig>("apply_dps_meter_config", { config: resolved });
}

export async function saveDpsMeterConfig(config: DpsMeterConfig) {
  localStorage.setItem(DPS_METER_CONFIG_KEY, JSON.stringify(config));
  return syncDpsMeterConfigToBackend(config);
}
