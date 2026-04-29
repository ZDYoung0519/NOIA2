import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  DEFAULT_DPS_METER_CONFIG,
  DPS_METER_CONFIG_KEY,
  type DpsMeterConfig,
  syncDpsMeterConfigToBackend,
} from "@/lib/dps-meter-config";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { toggleWindow } from "@/lib/window";

export const APP_SETTINGS_KEY = "app-settings";
const LEGACY_SHORTCUT_KEY = "global-shortcut-show-main";
const LEGACY_DPS_SETTINGS_KEY = "dps-settings";

export type MainWindowAppearance = {
  backgroundColor: string;
  backgroundOpacity: number;
};

export type DpsWindowAppearance = {
  backgroundColor: string;
  backgroundOpacity: number;
  autoResizeHeight: boolean;
  scaleFactor: number;
  maskNicknames: boolean;
  mainPlayerColor: string;
  otherPlayerColor: string;
  percentDisplayMode: "contribution" | "damageShare";
  showDetailOnHover: boolean;
};

export type AppSettings = {
  shortcuts: {
    showMain: string;
    showDps: string;
    resetDps: string;
  };
  dpsMeter: DpsMeterConfig;
  appearance: {
    mainWindow: MainWindowAppearance;
    dpsWindow: DpsWindowAppearance;
  };
};

export type AppSettingsUpdate = {
  shortcuts?: Partial<AppSettings["shortcuts"]>;
  dpsMeter?: Partial<DpsMeterConfig>;
  appearance?: {
    mainWindow?: Partial<MainWindowAppearance>;
    dpsWindow?: Partial<DpsWindowAppearance>;
  };
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  shortcuts: {
    showMain: "",
    showDps: "",
    resetDps: "",
  },
  dpsMeter: DEFAULT_DPS_METER_CONFIG,
  appearance: {
    mainWindow: {
      backgroundColor: "#0f172a",
      backgroundOpacity: 92,
    },
    dpsWindow: {
      backgroundColor: "#000000",
      backgroundOpacity: 75,
      autoResizeHeight: true,
      scaleFactor: 1,
      maskNicknames: false,
      mainPlayerColor: "rgba(34,197,94,0.42)",
      otherPlayerColor: "rgba(56,189,248,0.28)",
      percentDisplayMode: "contribution",
      showDetailOnHover: false,
    },
  },
};

type LegacyDpsSettings = {
  bgColor?: string;
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
  return Math.min(1.5, Math.max(0.5, numeric));
}

type PartialAppSettings = {
  shortcut?: string;
  shortcuts?: Partial<AppSettings["shortcuts"]>;
  dpsMeter?: Partial<DpsMeterConfig>;
  appearance?: {
    mainWindow?: Partial<MainWindowAppearance>;
    dpsWindow?: Partial<DpsWindowAppearance>;
  };
};

function normalizeSettings(input?: PartialAppSettings): AppSettings {
  return {
    shortcuts: {
      ...DEFAULT_APP_SETTINGS.shortcuts,
      showMain:
        input?.shortcuts?.showMain ?? input?.shortcut ?? DEFAULT_APP_SETTINGS.shortcuts.showMain,
      showDps: input?.shortcuts?.showDps ?? DEFAULT_APP_SETTINGS.shortcuts.showDps,
      resetDps: input?.shortcuts?.resetDps ?? DEFAULT_APP_SETTINGS.shortcuts.resetDps,
    },
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
        backgroundOpacity: clampPercentage(
          input?.appearance?.dpsWindow?.backgroundOpacity,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.backgroundOpacity
        ),
        autoResizeHeight:
          input?.appearance?.dpsWindow?.autoResizeHeight ??
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.autoResizeHeight,
        scaleFactor: clampScaleFactor(
          input?.appearance?.dpsWindow?.scaleFactor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.scaleFactor
        ),
        maskNicknames:
          input?.appearance?.dpsWindow?.maskNicknames ??
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.maskNicknames,
        mainPlayerColor: normalizeColorValue(
          input?.appearance?.dpsWindow?.mainPlayerColor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.mainPlayerColor
        ),
        otherPlayerColor: normalizeColorValue(
          input?.appearance?.dpsWindow?.otherPlayerColor,
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.otherPlayerColor
        ),
        percentDisplayMode:
          input?.appearance?.dpsWindow?.percentDisplayMode === "contribution"
            ? "contribution"
            : input?.appearance?.dpsWindow?.percentDisplayMode === "damageShare"
              ? "damageShare"
              : DEFAULT_APP_SETTINGS.appearance.dpsWindow.percentDisplayMode,
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
      shortcuts: {
        showMain: legacyShortcut,
      },
      dpsMeter: legacyDpsMeter,
      appearance: {
        dpsWindow: loadLegacyDpsAppearance(),
      },
    });
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

type AppSettingsContextValue = {
  settings: AppSettings;
  saveSettings: (
    updater: AppSettingsUpdate | ((current: AppSettings) => AppSettings)
  ) => Promise<void>;
};

const AppSettingsContext = createContext<AppSettingsContextValue | null>(null);

function AppSettingsProviderInner({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettingsFromStorage());

  useEffect(() => {
    localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    let mounted = true;

    const setup = async () => {
      const unlisten = await listen<AppSettings>("app-settings-updated", (event) => {
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

  useEffect(() => {
    if (getCurrentWebviewWindow().label !== "main") {
      return;
    }

    const handleShowMainWindow = async () => {
      await toggleWindow("main");
    };

    const registerAllShortcuts = async () => {
      const { showMain } = settings.shortcuts;

      if (showMain) {
        await registerShortcut(showMain, handleShowMainWindow);
      }
    };

    void registerAllShortcuts();

    return () => {
      const { showMain } = settings.shortcuts;
      void unregisterShortcut(showMain);
    };
  }, [settings.shortcuts.showMain]);

  useEffect(() => {
    if (getCurrentWebviewWindow().label !== "dps") {
      return;
    }

    const handleToggleDpsWindow = async () => {
      await toggleWindow("dps");
    };

    const handleResetDps = async () => {
      await emit("dps-reset-requested");
    };

    const registerDpsShortcuts = async () => {
      const { showDps, resetDps } = settings.shortcuts;

      if (showDps) {
        await registerShortcut(showDps, handleToggleDpsWindow);
      }
      if (resetDps) {
        await registerShortcut(resetDps, handleResetDps);
      }
    };

    void registerDpsShortcuts();

    return () => {
      const { showDps, resetDps } = settings.shortcuts;
      void unregisterShortcut(showDps);
      void unregisterShortcut(resetDps);
    };
  }, [settings.shortcuts.showDps, settings.shortcuts.resetDps]);

  const mergeSettings = useCallback(
    (
      current: AppSettings,
      updater: AppSettingsUpdate | ((current: AppSettings) => AppSettings)
    ) => {
      return typeof updater === "function"
        ? normalizeSettings(updater(current))
        : normalizeSettings({
            ...current,
            ...updater,
            shortcuts: {
              ...current.shortcuts,
              ...(updater.shortcuts ?? {}),
            },
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
    () => async (updater: AppSettingsUpdate | ((current: AppSettings) => AppSettings)) => {
      const next = mergeSettings(settings, updater);
      setSettings(next);
      localStorage.setItem(APP_SETTINGS_KEY, JSON.stringify(next));
      await emit("app-settings-updated", next);
    },
    [mergeSettings, settings]
  );

  const value = useMemo(
    () => ({
      settings,
      saveSettings,
    }),
    [saveSettings, settings]
  );

  return createElement(AppSettingsContext.Provider, { value }, children);
}

export function AppSettingsProvider({ children }: { children: ReactNode }) {
  return createElement(AppSettingsProviderInner, null, children);
}

export function useAppSettings() {
  const context = useContext(AppSettingsContext);

  if (!context) {
    throw new Error("useAppSettings must be used within an AppSettingsProvider");
  }

  return context;
}
