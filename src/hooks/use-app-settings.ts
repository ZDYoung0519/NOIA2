import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DPS_METER_CONFIG,
  DPS_METER_CONFIG_KEY,
  type DpsMeterConfig,
  syncDpsMeterConfigToBackend,
} from "@/lib/dps-meter-config";

export const APP_SETTINGS_KEY = "app-settings";
const LEGACY_SHORTCUT_KEY = "global-shortcut-show-main";

export type AppSettings = {
  shortcut: string;
  dpsMeter: DpsMeterConfig;
};

const DEFAULT_APP_SETTINGS: AppSettings = {
  shortcut: "",
  dpsMeter: DEFAULT_DPS_METER_CONFIG,
};

function loadAppSettingsFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        shortcut: parsed.shortcut ?? DEFAULT_APP_SETTINGS.shortcut,
        dpsMeter: {
          ...DEFAULT_DPS_METER_CONFIG,
          ...(parsed.dpsMeter ?? {}),
        },
      };
    }

    const legacyShortcut = localStorage.getItem(LEGACY_SHORTCUT_KEY) ?? "";
    const legacyDpsMeterRaw = localStorage.getItem(DPS_METER_CONFIG_KEY);
    const legacyDpsMeter = legacyDpsMeterRaw
      ? ({ ...DEFAULT_DPS_METER_CONFIG, ...JSON.parse(legacyDpsMeterRaw) } as DpsMeterConfig)
      : DEFAULT_DPS_METER_CONFIG;

    return {
      shortcut: legacyShortcut,
      dpsMeter: legacyDpsMeter,
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettingsFromStorage());

  useEffect(() => {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    void syncDpsMeterConfigToBackend(settings.dpsMeter);
  }, [settings.dpsMeter]);

  const saveSettings = useMemo(
    () =>
      async (
        updater:
          | Partial<AppSettings>
          | ((current: AppSettings) => AppSettings)
      ) => {
        setSettings((current) => {
          const next =
            typeof updater === "function"
              ? updater(current)
              : {
                  ...current,
                  ...updater,
                  dpsMeter: {
                    ...current.dpsMeter,
                    ...(updater.dpsMeter ?? {}),
                  },
                };
          return next;
        });
      },
    []
  );

  return { settings, saveSettings };
}
