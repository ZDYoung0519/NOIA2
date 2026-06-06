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
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  DEFAULT_DPS_METER_CONFIG,
  DPS_METER_CONFIG_KEY,
  type DpsMeterConfig,
  syncDpsMeterConfigToBackend,
} from "@/lib/dps-meter-config";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { hideDpsWindows, showDpsWindows, toggleWindow } from "@/lib/window";

export const APP_SETTINGS_KEY = "app-settings";
const LEGACY_SHORTCUT_KEY = "global-shortcut-show-main";
const LEGACY_DPS_SETTINGS_KEY = "dps-settings";

export type MainWindowAppearance = {
  backgroundColor: string;
  backgroundOpacity: number;
};

export type DpsWindowAppearance = {
  autoHide: boolean;
  panelStyle: "classicBars" | "hunterCompact";
  backgroundColor: string;
  backgroundOpacity: number;
  autoResizeHeight: boolean;
  autoReset: boolean;
  scaleFactor: number;
  maskNicknames: boolean;
  mainPlayerColor: string;
  otherPlayerColor: string;
  classIconStyle: "default" | "colored";
  percentDisplayMode: "contribution" | "damageShare";
  showDetailOnHover: boolean;
  detailWindowPosition: "follow" | "center";
  showTargetHpBar: boolean;
  pingWindowAlignment: "left" | "right";
  pingWindowShowLatency: boolean;
  pingWindowShowCpu: boolean;
  pingWindowShowMemory: boolean;
};

export type AppSettings = {
  shortcuts: {
    showMain: string;
    showDps: string;
    resetDps: string;
  };
  dpsMeter: DpsMeterConfig;
  autoCloseMainOnStartup: boolean;
  appearance: {
    mainWindow: MainWindowAppearance;
    dpsWindow: DpsWindowAppearance;
  };
};

export type AppSettingsUpdate = {
  shortcuts?: Partial<AppSettings["shortcuts"]>;
  dpsMeter?: Partial<DpsMeterConfig>;
  autoCloseMainOnStartup?: boolean;
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
  autoCloseMainOnStartup: false,
  appearance: {
    mainWindow: {
      backgroundColor: "#0f172a",
      backgroundOpacity: 92,
    },
    dpsWindow: {
      autoHide: true,
      panelStyle: "classicBars",
      backgroundColor: "#000000",
      backgroundOpacity: 75,
      autoResizeHeight: true,
      autoReset: false,
      scaleFactor: 1,
      maskNicknames: false,
      mainPlayerColor: "rgba(34,197,94,0.42)",
      otherPlayerColor: "rgba(56,189,248,0.28)",
      classIconStyle: "default",
      percentDisplayMode: "contribution",
      showDetailOnHover: false,
      detailWindowPosition: "follow",
      showTargetHpBar: false,
      pingWindowAlignment: "left",
      pingWindowShowLatency: true,
      pingWindowShowCpu: false,
      pingWindowShowMemory: false,
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
  autoCloseMainOnStartup?: boolean;
  autoRunDpsOnStartup?: boolean;
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
    autoCloseMainOnStartup:
      input?.autoCloseMainOnStartup ??
      input?.autoRunDpsOnStartup ??
      DEFAULT_APP_SETTINGS.autoCloseMainOnStartup,
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
        autoHide:
          input?.appearance?.dpsWindow?.autoHide ??
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.autoHide,
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
        autoReset:
          input?.appearance?.dpsWindow?.autoReset ??
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.autoReset,
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
        panelStyle:
          input?.appearance?.dpsWindow?.panelStyle === "classicBars"
            ? "classicBars"
            : input?.appearance?.dpsWindow?.panelStyle === "hunterCompact"
              ? "hunterCompact"
              : DEFAULT_APP_SETTINGS.appearance.dpsWindow.panelStyle,

        percentDisplayMode:
          input?.appearance?.dpsWindow?.percentDisplayMode === "contribution"
            ? "contribution"
            : input?.appearance?.dpsWindow?.percentDisplayMode === "damageShare"
              ? "damageShare"
              : DEFAULT_APP_SETTINGS.appearance.dpsWindow.percentDisplayMode,

        classIconStyle:
          input?.appearance?.dpsWindow?.classIconStyle === "default"
            ? "default"
            : input?.appearance?.dpsWindow?.classIconStyle === "colored"
              ? "colored"
              : DEFAULT_APP_SETTINGS.appearance.dpsWindow.classIconStyle,
        pingWindowAlignment:
          input?.appearance?.dpsWindow?.pingWindowAlignment === "right" ? "right" : "left",
        pingWindowShowLatency:
          input?.appearance?.dpsWindow?.pingWindowShowLatency ??
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.pingWindowShowLatency,
        pingWindowShowCpu:
          input?.appearance?.dpsWindow?.pingWindowShowCpu ??
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.pingWindowShowCpu,
        pingWindowShowMemory:
          input?.appearance?.dpsWindow?.pingWindowShowMemory ??
          DEFAULT_APP_SETTINGS.appearance.dpsWindow.pingWindowShowMemory,
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
    void invoke("set_auto_hide_enabled", {
      enabled: settings.appearance.dpsWindow.autoHide,
    });
  }, [settings.appearance.dpsWindow.autoHide]);

  const { showMain, showDps, resetDps } = settings.shortcuts;

  useEffect(() => {
    if (getCurrentWebviewWindow().label !== "main") {
      return;
    }

    const handleShowMainWindow = async () => {
      await toggleWindow("main");
    };

    const registerAllShortcuts = async () => {
      if (showMain) {
        await registerShortcut(showMain, handleShowMainWindow);
      }
    };

    void registerAllShortcuts();

    return () => {
      void unregisterShortcut(showMain);
    };
  }, [showMain]);

  useEffect(() => {
    const currentWindow = getCurrentWebviewWindow();
    const isClassicDpsWindow = currentWindow.label === "dps";
    const isLightDpsWindow = currentWindow.label === "dps_new" || currentWindow.label === "dps_v2";

    if (!isClassicDpsWindow && !isLightDpsWindow) {
      return;
    }

    const handleToggleDpsWindow = async () => {
      const dpsWindow = currentWindow;
      const shouldHide = (await dpsWindow.isVisible()) && !(await dpsWindow.isMinimized());

      if (shouldHide) {
        await invoke("set_dps_manual_hidden", { hidden: true });
        await hideDpsWindows();
        return;
      } else {
        await invoke("set_dps_manual_hidden", { hidden: false });
        await showDpsWindows();
      }
    };

    const handleResetDps = async () => {
      await emit("dps-reset-requested");
    };

    const registerDpsShortcuts = async () => {
      if ((isClassicDpsWindow || isLightDpsWindow) && showDps) {
        await registerShortcut(showDps, handleToggleDpsWindow);
      }
      if (resetDps) {
        await registerShortcut(resetDps, handleResetDps);
      }
    };

    void registerDpsShortcuts();

    return () => {
      if (isClassicDpsWindow || isLightDpsWindow) {
        void unregisterShortcut(showDps);
      }
      void unregisterShortcut(resetDps);
    };
  }, [showDps, resetDps]);

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
            autoCloseMainOnStartup:
              updater.autoCloseMainOnStartup ?? current.autoCloseMainOnStartup,
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
