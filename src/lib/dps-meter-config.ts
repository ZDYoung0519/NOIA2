import { invoke } from "@tauri-apps/api/core";

export const DPS_METER_CONFIG_KEY = "dps-meter-config";

export type DpsMeterConfig = {
  dpsSnapshotIntervalMs: number; // dps 推送的延迟间隔
  memorySnapshotIntervalMs: number; // 内存使用情况推送的延迟间隔
  bossOnly: boolean; // 只显示boss
  myMuzhuangOnly: boolean; // 只显示我的木桩
};

export const DEFAULT_DPS_METER_CONFIG: DpsMeterConfig = {
  dpsSnapshotIntervalMs: 250,
  memorySnapshotIntervalMs: 1000,
  bossOnly: true,
  myMuzhuangOnly: true,
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
