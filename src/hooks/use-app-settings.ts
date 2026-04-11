import { useCallback, useEffect, useMemo, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import {
  DEFAULT_DPS_METER_CONFIG,
  DPS_METER_CONFIG_KEY,
  type DpsMeterConfig,
  syncDpsMeterConfigToBackend,
} from "@/lib/dps-meter-config";

export const APP_SETTINGS_KEY = "app-settings";
const APP_SETTINGS_UPDATED_EVENT = "app-settings-updated";
const LEGACY_SHORTCUT_KEY = "global-shortcut-show-main";
const LEGACY_DPS_SETTINGS_KEY = "dps-settings";

export type MainWindowAppearance = {
  backgroundColor: string;
  backgroundOpacity: number;
};

export type DpsWindowAppearance = {
  backgroundColor: string;
  backgroundOpacity: number;
  panelColor: string;
  panelOpacity: number;
  mainPlayerColor: string;
  otherPlayerColor: string;
  scaleFactor: number;
  autoResizeHeight: boolean;
  showHeaderStats: boolean;
};

export type AppSettings = {
  shortcut: string;
  dpsMeter: DpsMeterConfig;
  appearance: {
    mainWindow: MainWindowAppearance;
    dpsWindow: DpsWindowAppearance;
  };
};

export type AppSettingsUpdate = {
  shortcut?: string;
  dpsMeter?: Partial<DpsMeterConfig>;
  appearance?: {
    mainWindow?: Partial<MainWindowAppearance>;
    dpsWindow?: Partial<DpsWindowAppearance>;
  };
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  shortcut: "",
  dpsMeter: DEFAULT_DPS_METER_CONFIG,
  appearance: {
    mainWindow: {
      backgroundColor: "#0f172a",
      backgroundOpacity: 92,
    },
    dpsWindow: {
      backgroundColor: "#020617",
      backgroundOpacity: 0,
      panelColor: "#0f172a",
      panelOpacity: 76,
      mainPlayerColor: "rgba(34,197,94,0.42)",
      otherPlayerColor: "rgba(56,189,248,0.28)",
      scaleFactor: 1,
      autoResizeHeight: true,
      showHeaderStats: true,
    },
  },
};

type LegacyDpsSettings = {
  bgColor?: string;
  mainPlayerColor?: string;
  otherPlayerColor?: string;
  autoResizeHeight?: boolean;
  scaleFactor?: number;
};

function normalizeColorValue(value: unknown, fallback: string) {
  if (typeof value !== "string" || value.trim() === "") {
    return fallback;
  }

  const trimmed = value.trim();
  if (trimmed.startsWith("linear-gradient")) {
    return fallback;
  }

  if (trimmed.startsWith("#") || trimmed.startsWith("rgb")) {
    return trimmed;
  }

  return fallback;
}

function clampPercentage(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(100, Math.max(0, numeric));
}

function clampScaleFactor(value: unknown, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(1.4, Math.max(0.8, numeric));
}

type PartialAppSettings = {
  shortcut?: string;
  dpsMeter?: Partial<DpsMeterConfig>;
  appearance?: {
    mainWindow?: Partial<MainWindowAppearance>;
    dpsWindow?: Partial<DpsWindowAppearance>;
  };
};

function normalizeSettings(input?: PartialAppSettings): AppSettings {
  return {
    shortcut: input?.shortcut ?? DEFAULT_APP_SETTINGS.shortcut,
    dpsMeter: {
      ...DEFAULT_DPS_METER_CONFIG,
      ...(input?.dpsMeter ?? {}),
    },
    appearance: {
      mainWindow: {
        ...DEFAULT_APP_SETTINGS.appearance.mainWindow,
        ...(input?.appearance?.mainWindow ?? {}),
        backgroundColor: normalizeColorValue(
          input?.appearance?.mainWindow?.backgroundColor,
          DEFAULT_APP_SETTINGS.appearance.mainWindow.backgroundColor
        ),
        backgroundOpacity: clampPercentage(
          input?.appearance?.mainWindow?.backgroundOpacity,
          DEFAULT_APP_SETTINGS.appearance.mainWindow.backgroundOpacity
        ),
      },
      dpsWindow: {
        ...DEFAULT_APP_SETTINGS.appearance.dpsWindow,
        ...(input?.appearance?.dpsWindow ?? {}),
        backgroundColor: normalizeColorValue(
          input?.appearance?.dpsWindow?.backgroundColor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.backgroundColor
        ),
        panelColor: normalizeColorValue(
          input?.appearance?.dpsWindow?.panelColor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.panelColor
        ),
        mainPlayerColor: normalizeColorValue(
          input?.appearance?.dpsWindow?.mainPlayerColor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.mainPlayerColor
        ),
        otherPlayerColor: normalizeColorValue(
          input?.appearance?.dpsWindow?.otherPlayerColor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.otherPlayerColor
        ),
        backgroundOpacity: clampPercentage(
          input?.appearance?.dpsWindow?.backgroundOpacity,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.backgroundOpacity
        ),
        panelOpacity: clampPercentage(
          input?.appearance?.dpsWindow?.panelOpacity,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.panelOpacity
        ),
        scaleFactor: clampScaleFactor(
          input?.appearance?.dpsWindow?.scaleFactor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.scaleFactor
        ),
      },
    },
  };
}

function loadLegacyDpsAppearance(): Partial<DpsWindowAppearance> {
  try {
    const raw = localStorage.getItem(LEGACY_DPS_SETTINGS_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as LegacyDpsSettings;
    return {
      backgroundColor: parsed.bgColor ? parsed.bgColor : undefined,
      mainPlayerColor: parsed.mainPlayerColor,
      otherPlayerColor: parsed.otherPlayerColor,
      autoResizeHeight: parsed.autoResizeHeight,
      scaleFactor: parsed.scaleFactor,
    };
  } catch {
    return {};
  }
}

function loadAppSettingsFromStorage(): AppSettings {
  try {
    const raw = localStorage.getItem(APP_SETTINGS_KEY);
    if (raw) {
      return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>);
    }

    const legacyShortcut = localStorage.getItem(LEGACY_SHORTCUT_KEY) ?? "";
    const legacyDpsMeterRaw = localStorage.getItem(DPS_METER_CONFIG_KEY);
    const legacyDpsMeter = legacyDpsMeterRaw
      ? ({ ...DEFAULT_DPS_METER_CONFIG, ...JSON.parse(legacyDpsMeterRaw) } as DpsMeterConfig)
      : DEFAULT_DPS_METER_CONFIG;

    return normalizeSettings({
      shortcut: legacyShortcut,
      dpsMeter: legacyDpsMeter,
      appearance: {
        dpsWindow: loadLegacyDpsAppearance(),
      },
    });
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
    let mounted = true;

    const setup = async () => {
      const unlisten = await listen<AppSettings>(APP_SETTINGS_UPDATED_EVENT, (event) => {
        if (!mounted) {
          return;
        }

        const next = normalizeSettings(event.payload);
        setSettings((current) => {
          const currentSerialized = JSON.stringify(current);
          const nextSerialized = JSON.stringify(next);
          return currentSerialized === nextSerialized ? current : next;
        });
      });

      return unlisten;
    };

    const cleanupPromise = setup();
    return () => {
      mounted = false;
      void cleanupPromise.then((cleanup) => cleanup());
    };
  }, []);

  useEffect(() => {
    void syncDpsMeterConfigToBackend(settings.dpsMeter);
  }, [settings.dpsMeter]);

  const mergeSettings = useCallback(
    (current: AppSettings, updater: AppSettingsUpdate | ((current: AppSettings) => AppSettings)) => {
      return typeof updater === "function"
        ? normalizeSettings(updater(current))
        : normalizeSettings({
            ...current,
            ...updater,
            dpsMeter: {
              ...current.dpsMeter,
              ...(updater.dpsMeter ?? {}),
            },
            appearance: {
              mainWindow: {
                ...current.appearance.mainWindow,
                ...(updater.appearance?.mainWindow ?? {}),
              },
              dpsWindow: {
                ...current.appearance.dpsWindow,
                ...(updater.appearance?.dpsWindow ?? {}),
              },
            },
          });
    },
    []
  );

  const saveSettings = useMemo(
    () =>
      async (updater: AppSettingsUpdate | ((current: AppSettings) => AppSettings)) => {
        const next = mergeSettings(settings, updater);
        setSettings(next);
        localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(next));
        await emit(APP_SETTINGS_UPDATED_EVENT, next);
      },
    [mergeSettings, settings]
  );

  return { settings, saveSettings };
}
