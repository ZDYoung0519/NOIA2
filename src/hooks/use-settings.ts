import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

// =============================================================================
// Types
// =============================================================================

type Theme = "light" | "dark" | "system";
type Language = "en" | "zh-CN" | "zh-TW" | "ko";
type RGBA = [number, number, number, number];
type PvpOverlayPosition = "bottom" | "right" | "free";

interface AppSettings {
  theme: Theme;
  language: Language;
}

interface ShortcutSettings {
  showDpsOverlay: string;
  resetDpsMeter: string;
  toggleLock: string;
}

interface BackendSettings {
  dpsSnapshotIntervalMs: number;
  memorySnapshotIntervalMs: number;
  maxPacketSizeThreshold: number;
  stallResyncDelayMs: number;
  bossOnly: boolean;
  pvpModeOn: boolean;
  pvpOverlayPosition: PvpOverlayPosition;
  showPossibleBoss: boolean;
  myMuzhuangOnly: boolean;
  hideUnknownPlayers: boolean;
  maxPlayerCount: number;
}

interface OverlaySettings {
  fontFamily: string;
  locked: boolean;
  alwaysOnTop: boolean;
  background: RGBA;
  mainPlayerColor: RGBA;
  otherPlayerColor: RGBA;
  showPlayerName: boolean;
  showServer: boolean;
  showDamage: boolean;
  showDps: boolean;
  pctMode: "contribution" | "share";
  showBossHp: boolean;
  maskNicknames: boolean;
  contentScale: number;
  detailWindowMode: "follow" | "center";
  autoResizeHeight: boolean;
  damageFormat: "万/亿" | "K/M/B";
}

interface Aion2Settings {
  shortcuts: ShortcutSettings;
  backend: BackendSettings;
  overlay: OverlaySettings;
  autoHideEnabled: boolean;
  autoCloseMain: boolean;
}

export interface AppConfig {
  version: number;
  app: AppSettings;
  aion2: Aion2Settings;
}

// =============================================================================
// Defaults
// =============================================================================

const DEFAULTS: AppConfig = {
  version: 1,
  app: {
    theme: "system",
    language: "zh-CN",
  },
  aion2: {
    shortcuts: {
      showDpsOverlay: "Alt+E",
      resetDpsMeter: "Alt+Q",
      toggleLock: "Alt+CapsLock",
    },
    backend: {
      dpsSnapshotIntervalMs: 200,
      memorySnapshotIntervalMs: 2000,
      maxPacketSizeThreshold: 8192,
      stallResyncDelayMs: 200,
      bossOnly: true,
      pvpModeOn: false,
      pvpOverlayPosition: "bottom",
      showPossibleBoss: false,
      myMuzhuangOnly: true,
      hideUnknownPlayers: true,
      maxPlayerCount: 10,
    },
    overlay: {
      fontFamily: "Consolas",
      locked: false,
      alwaysOnTop: false,
      background: [0, 0, 0, 102],
      mainPlayerColor: [193, 81, 21, 204],
      otherPlayerColor: [46, 86, 142, 120],
      showPlayerName: true,
      showServer: false,
      showDamage: false,
      showDps: true,
      pctMode: "contribution",
      showBossHp: false,
      maskNicknames: false,
      contentScale: 1,
      detailWindowMode: "follow",
      autoResizeHeight: true,
      damageFormat: "万/亿",
    },
    autoHideEnabled: true,
    autoCloseMain: true,
  },
};

const STORAGE_KEY = "app-config";

// =============================================================================
// Helpers
// =============================================================================

function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Deep merge with defaults to fill missing keys from newer versions
      return deepMerge(DEFAULTS, parsed);
    }
  } catch (e) {
    console.error("[useSettings] failed to load config:", e);
  }
  return {
    ...DEFAULTS,
    aion2: {
      ...DEFAULTS.aion2,
      shortcuts: { ...DEFAULTS.aion2.shortcuts },
      backend: { ...DEFAULTS.aion2.backend },
      overlay: { ...DEFAULTS.aion2.overlay },
    },
  };
}

function deepMerge<T>(defaults: T, overrides: Partial<T>): T {
  const result = { ...defaults };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const ov = overrides[key];
    if (ov === undefined || ov === null) continue;
    if (typeof ov === "object" && !Array.isArray(ov) && typeof defaults[key] === "object") {
      (result as Record<string, unknown>)[key as string] = deepMerge(
        defaults[key] as Record<string, unknown>,
        ov as Record<string, unknown>
      );
    } else {
      (result as Record<string, unknown>)[key as string] = ov;
    }
  }
  return result;
}

function setNested(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): Record<string, unknown> {
  const keys = path.split(".");
  const clone = JSON.parse(JSON.stringify(obj));
  let current: Record<string, unknown> = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]] = value;
  return clone;
}

// =============================================================================
// Hook
// =============================================================================

export function useSettings() {
  const [config, setConfig] = useState<AppConfig>(loadConfig);
  const configRef = useRef(config);
  configRef.current = config;

  // Push backend config to Rust DpsMeter when changed
  const syncBackend = useCallback(async (cfg: AppConfig) => {
    try {
      await invoke("apply_dps_meter_config", {
        config: cfg.aion2.backend,
      });
    } catch (e) {
      console.error("[useSettings] syncBackend failed:", e);
    }
  }, []);

  // Push overlay config to all windows (including overlay if open)
  const syncOverlay = useCallback(async (cfg: AppConfig) => {
    try {
      await invoke("set_overlay_config", { value: cfg.aion2.overlay });
      await invoke("set_dps_overlay_locked", { locked: cfg.aion2.overlay.locked });
      await invoke("set_dps_always_on_top", { enabled: cfg.aion2.overlay.alwaysOnTop });
    } catch (e) {
      console.error("[useSettings] syncOverlay failed:", e);
    }
  }, []);

  // Push auto-hide setting to Rust
  const syncLanguage = useCallback(async (cfg: AppConfig) => {
    try {
      await invoke("set_language", { language: cfg.app.language });
    } catch (e) {
      console.error("[useSettings] syncLanguage failed:", e);
    }
  }, []);

  const syncAutoHide = useCallback(async (cfg: AppConfig) => {
    try {
      await invoke("set_auto_hide_enabled", {
        enabled: cfg.aion2.autoHideEnabled,
      });
    } catch (e) {
      console.error("[useSettings] syncAutoHide failed:", e);
    }
  }, []);

  // Push shortcuts to Rust
  const syncShortcuts = useCallback(async (cfg: AppConfig) => {
    try {
      await invoke("sync_shortcuts", {
        cfg: {
          showDpsOverlay: cfg.aion2.shortcuts.showDpsOverlay,
          resetDpsMeter: cfg.aion2.shortcuts.resetDpsMeter,
          toggleLock: cfg.aion2.shortcuts.toggleLock,
        },
      });
    } catch (e) {
      console.error("[useSettings] syncShortcuts failed:", e);
    }
  }, []);

  // Persist + smart sync: only push to affected subsystem
  const applyAndSync = useCallback(
    async (newConfig: AppConfig, path?: string) => {
      setConfig(newConfig);
      configRef.current = newConfig;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));

      if (!path) {
        // Full sync: reset, import, or initial load
        await syncBackend(newConfig);
        await syncOverlay(newConfig);
        await syncShortcuts(newConfig);
        await syncAutoHide(newConfig);
      } else if (path.startsWith("aion2.backend")) {
        await syncBackend(newConfig);
      } else if (path.startsWith("aion2.overlay")) {
        await syncOverlay(newConfig);
      } else if (path.startsWith("aion2.shortcuts")) {
        await syncShortcuts(newConfig);
      } else if (path === "aion2.autoHideEnabled") {
        await syncAutoHide(newConfig);
        await syncLanguage(newConfig);
      } else if (path.startsWith("app.language")) {
        await syncLanguage(newConfig);
      }
      // app.* only needs localStorage
    },
    [syncBackend, syncOverlay, syncShortcuts, syncAutoHide, syncLanguage]
  );

  // Update a single key or whole section by path
  const updateSettings = useCallback(
    async (path: string, value: unknown) => {
      const current = configRef.current;
      const updated = setNested(
        current as unknown as Record<string, unknown>,
        path,
        value
      ) as unknown as AppConfig;
      await applyAndSync(updated, path);
    },
    [applyAndSync]
  );

  // Reset to defaults
  const resetSettings = useCallback(async () => {
    await applyAndSync(JSON.parse(JSON.stringify(DEFAULTS)));
  }, [applyAndSync]);

  // Import from JSON file
  const importConfig = useCallback(
    async (json: string) => {
      const imported = JSON.parse(json);
      const merged = deepMerge(DEFAULTS, imported) as AppConfig;
      await applyAndSync(merged);
    },
    [applyAndSync]
  );

  // Export config as JSON string
  const exportConfig = useCallback(() => {
    return JSON.stringify(configRef.current, null, 2);
  }, []);

  // Push overlay config to overlay window (call after create_dps_overlay)
  const pushOverlayConfig = useCallback(async () => {
    try {
      await invoke("set_overlay_config", { value: configRef.current.aion2.overlay });
      await invoke("set_dps_overlay_locked", {
        locked: configRef.current.aion2.overlay.locked,
      });
      await invoke("set_dps_always_on_top", {
        enabled: configRef.current.aion2.overlay.alwaysOnTop,
      });
    } catch (e) {
      console.error("[useSettings] pushOverlayConfig failed:", e);
    }
  }, []);

  // Initial sync on mount
  useEffect(() => {
    applyAndSync(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const reloadFromStorage = () => {
      const nextConfig = loadConfig();
      setConfig(nextConfig);
      configRef.current = nextConfig;
    };

    const handleCustomConfigChanged = (event: Event) => {
      const nextConfig = (event as CustomEvent<AppConfig>).detail;
      if (!nextConfig) {
        reloadFromStorage();
        return;
      }
      setConfig(nextConfig);
      configRef.current = nextConfig;
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        reloadFromStorage();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("app-config-changed", handleCustomConfigChanged);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("app-config-changed", handleCustomConfigChanged);
    };
  }, []);

  return {
    config,
    updateSettings,
    resetSettings,
    importConfig,
    exportConfig,
    pushOverlayConfig,
  };
}
