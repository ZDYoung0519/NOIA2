import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { emit } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Activity,
  Github,
  Info,
  Keyboard,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import { LanguageToggle } from "@/components/language-toggle";
import { ShortcutInput } from "@/components/shortcut-input";
import { useTheme } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useManualUpdateCheck } from "@/components/updater-dialog";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { toggleWindow } from "@/lib/window";
import { cn } from "@/lib/utils";
import packageJson from "../../package.json";

const hexToRgba = (hex: string, alphaPercent: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex =
    safeHex.length === 3
      ? safeHex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : safeHex;
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(100, Math.max(0, alphaPercent)) / 100})`;
};

type SettingSection = "appearance" | "shortcut" | "dps" | "about";

const techVersions = {
  tauri: packageJson.dependencies["@tauri-apps/api"].replace(/^\^/, "v"),
  react: packageJson.dependencies.react.replace(/^\^/, "v"),
  typescript: packageJson.devDependencies.typescript.replace(/^~/, "v"),
};

function SettingsSectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {title}
      </h3>
      <div className="divide-border overflow-hidden rounded-2xl border bg-background/50 backdrop-blur-sm divide-y">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  label,
  description,
  control,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[72px] items-center justify-between gap-6 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <div className="text-muted-foreground mt-1 text-xs leading-5">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

export function SettingsContent() {
  const [activeSection, setActiveSection] = useState<SettingSection>("appearance");
  const [appVersion, setAppVersion] = useState("");
  const { t } = useAppTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, saveSettings } = useAppSettings();
  const { checkUpdate, checking, showNoUpdate } = useManualUpdateCheck();
  const dpsAppearance = settings.appearance.dpsWindow;
  const mainAppearance = settings.appearance.mainWindow;
  const showMainShortcut = settings.shortcuts.showMain;
  const showDpsShortcut = settings.shortcuts.showDps;
  const resetDpsShortcut = settings.shortcuts.resetDps;

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  const previewCombatInfos = useMemo(
    () => ({
      actorInfos: {
        1001: {
          id: 1001,
          actorName: "You",
          actorClass: "ASSASSIN",
          actorServerId: "1",
          actorSkillSpec: {},
        },
        1002: {
          id: 1002,
          actorName: "Support",
          actorClass: "CLERIC",
          actorServerId: "2",
          actorSkillSpec: {},
        },
        1003: {
          id: 1003,
          actorName: "Ranger",
          actorClass: "RANGER",
          actorServerId: "3",
          actorSkillSpec: {},
        },
      },
      targetInfos: {
        1: {
          id: 1,
          targetMobCode: 2400032,
          targetName: "Training Dummy",
          isBoss: false,
          targetStartTime: {
            1001: 0,
            1002: 0,
            1003: 0,
          },
          targetLastTime: {
            1001: 120,
            1002: 120,
            1003: 120,
          },
        },
      },
      mainActorId: 1001,
      mainActorName: "You",
      lastTargetByMainActor: 1,
      lastTarget: 1,
      timeNow: 120,
    }),
    []
  );

  const previewStats = useMemo(
    () => ({
      1001: {
        counts: 96,
        total_damage: 420000,
        totalDamage: 420000,
        minDamage: 1200,
        maxDamage: 9800,
        specialCounts: {},
      },
      1002: {
        counts: 74,
        total_damage: 258000,
        totalDamage: 258000,
        minDamage: 800,
        maxDamage: 6600,
        specialCounts: {},
      },
      1003: {
        counts: 68,
        total_damage: 186000,
        totalDamage: 186000,
        minDamage: 900,
        maxDamage: 7200,
        specialCounts: {},
      },
    }),
    []
  );

  const handleShowMainWindow = useCallback(async () => {
    await toggleWindow("main");
  }, []);

  useEffect(() => {
    if (showMainShortcut) {
      void registerShortcut(showMainShortcut, handleShowMainWindow);
    }
  }, [handleShowMainWindow, showMainShortcut]);

  const handleShortcutChange = async (newShortcut: string) => {
    const oldShortcut = showMainShortcut;

    if (newShortcut) {
      await saveSettings({
        shortcuts: {
          showMain: newShortcut,
        },
      });
      await registerShortcut(newShortcut, handleShowMainWindow, oldShortcut);
      await emit("shortcut-changed", { shortcut: newShortcut });
      toast.success(t("settings.shortcut.setSuccess", { shortcut: newShortcut }));
    } else {
      await saveSettings({
        shortcuts: {
          showMain: "",
        },
      });
      if (oldShortcut) {
        await unregisterShortcut(oldShortcut);
      }
      await emit("shortcut-changed", { shortcut: "" });
      toast.info(t("settings.shortcut.cleared"));
    }
  };

  const handleShowDpsShortcutChange = async (newShortcut: string) => {
    await saveSettings({
      shortcuts: {
        showDps: newShortcut,
      },
    });
  };

  const handleResetDpsShortcutChange = async (newShortcut: string) => {
    await saveSettings({
      shortcuts: {
        resetDps: newShortcut,
      },
    });
  };

  const handleOpenGithub = async () => {
    await openUrl("https://github.com/kitlib/tauri-app-template");
  };

  const menuItems = [
    {
      id: "appearance" as SettingSection,
      label: t("settings.appearance.title"),
      icon: Palette,
    },
    {
      id: "shortcut" as SettingSection,
      label: t("settings.shortcut.title"),
      icon: Keyboard,
    },
    {
      id: "dps" as SettingSection,
      label: "DPS Meter",
      icon: Activity,
    },
    {
      id: "about" as SettingSection,
      label: t("about.title"),
      icon: Info,
    },
  ];

  return (
    <>
      <Toaster />
      <aside className="border-border flex h-full w-44 shrink-0 flex-col border-r p-4">
        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  activeSection === item.id
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="w-full p-5 lg:p-8">
          {activeSection === "appearance" && (
            <div className="space-y-8">
              <SettingsSectionHeader
                title={t("settings.appearance.title")}
                description={t("settings.appearance.description")}
              />

              <SettingsGroup title="General">
                <SettingsRow
                  label={t("settings.appearance.theme")}
                  control={
                    <div className="flex gap-2">
                      <Button
                        variant={theme === "light" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("light")}
                        className="flex items-center gap-1.5"
                      >
                        <Sun className="h-3.5 w-3.5" />
                        {t("settings.appearance.light")}
                      </Button>
                      <Button
                        variant={theme === "dark" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("dark")}
                        className="flex items-center gap-1.5"
                      >
                        <Moon className="h-3.5 w-3.5" />
                        {t("settings.appearance.dark")}
                      </Button>
                      <Button
                        variant={theme === "system" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setTheme("system")}
                        className="flex items-center gap-1.5"
                      >
                        <Monitor className="h-3.5 w-3.5" />
                        {t("settings.appearance.system")}
                      </Button>
                    </div>
                  }
                />
                <SettingsRow
                  label={t("settings.appearance.language")}
                  control={<LanguageToggle />}
                />
              </SettingsGroup>

              <SettingsGroup title="Main Window">
                <SettingsRow
                  label="Background Color"
                  control={
                    <input
                      type="color"
                      value={mainAppearance.backgroundColor}
                      onChange={(event) => {
                        void saveSettings({
                          appearance: {
                            mainWindow: {
                              backgroundColor: event.currentTarget.value,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label="Background Opacity"
                  control={
                    <div className="flex w-64 items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={mainAppearance.backgroundOpacity}
                        onChange={(event) => {
                          void saveSettings({
                            appearance: {
                              mainWindow: {
                                backgroundOpacity: Number(event.currentTarget.value),
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                      <span className="text-muted-foreground w-10 text-right text-xs">
                        {mainAppearance.backgroundOpacity}%
                      </span>
                    </div>
                  }
                />
              </SettingsGroup>

              <SettingsGroup title="DPS Window">
                <SettingsRow
                  label="Auto Resize Height"
                  control={
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={dpsAppearance.autoResizeHeight}
                      onChange={(event) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              autoResizeHeight: event.currentTarget.checked,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label="Show Header Stats"
                  control={
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={dpsAppearance.showHeaderStats}
                      onChange={(event) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              showHeaderStats: event.currentTarget.checked,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label="Scale Factor"
                  control={
                    <div className="flex w-64 items-center gap-3">
                      <input
                        type="range"
                        min={0.8}
                        max={1.4}
                        step={0.05}
                        value={dpsAppearance.scaleFactor}
                        onChange={(event) => {
                          void saveSettings({
                            appearance: {
                              dpsWindow: {
                                scaleFactor: Number(event.currentTarget.value),
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                      <span className="text-muted-foreground w-12 text-right text-xs">
                        {Math.round(dpsAppearance.scaleFactor * 100)}%
                      </span>
                    </div>
                  }
                />
                <SettingsRow
                  label="Shell Color"
                  control={
                    <input
                      type="color"
                      value={dpsAppearance.backgroundColor}
                      onChange={(event) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              backgroundColor: event.currentTarget.value,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label="Shell Opacity"
                  control={
                    <div className="flex w-64 items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={dpsAppearance.backgroundOpacity}
                        onChange={(event) => {
                          void saveSettings({
                            appearance: {
                              dpsWindow: {
                                backgroundOpacity: Number(event.currentTarget.value),
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                      <span className="text-muted-foreground w-10 text-right text-xs">
                        {dpsAppearance.backgroundOpacity}%
                      </span>
                    </div>
                  }
                />
                <SettingsRow
                  label="Panel Color"
                  control={
                    <input
                      type="color"
                      value={dpsAppearance.panelColor}
                      onChange={(event) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              panelColor: event.currentTarget.value,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label="Panel Opacity"
                  control={
                    <div className="flex w-64 items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={dpsAppearance.panelOpacity}
                        onChange={(event) => {
                          void saveSettings({
                            appearance: {
                              dpsWindow: {
                                panelOpacity: Number(event.currentTarget.value),
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                      <span className="text-muted-foreground w-10 text-right text-xs">
                        {dpsAppearance.panelOpacity}%
                      </span>
                    </div>
                  }
                />
                <SettingsRow
                  label="Main Player Bar"
                  control={
                    <input
                      type="color"
                      value={
                        dpsAppearance.mainPlayerColor.startsWith("#")
                          ? dpsAppearance.mainPlayerColor
                          : "#22c55e"
                      }
                      onChange={(event) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              mainPlayerColor: event.currentTarget.value,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label="Other Player Bar"
                  control={
                    <input
                      type="color"
                      value={
                        dpsAppearance.otherPlayerColor.startsWith("#")
                          ? dpsAppearance.otherPlayerColor
                          : "#38bdf8"
                      }
                      onChange={(event) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              otherPlayerColor: event.currentTarget.value,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
              </SettingsGroup>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  DPS Preview
                </h3>
                <div className="rounded-xl border p-3">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold">DPS Window Preview</h4>
                  </div>

                  <div
                    className="rounded-2xl border border-white/10 p-2 text-slate-100"
                    style={{
                      backgroundColor: hexToRgba(
                        dpsAppearance.backgroundColor,
                        dpsAppearance.backgroundOpacity
                      ),
                    }}
                  >
                    <div
                      className="space-y-2 rounded-2xl border border-white/10 p-2"
                      style={{
                        backgroundColor: hexToRgba(
                          dpsAppearance.panelColor,
                          dpsAppearance.panelOpacity
                        ),
                        zoom: dpsAppearance.scaleFactor,
                      }}
                    >
                      {dpsAppearance.showHeaderStats && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg border border-white/10 p-2 text-xs">
                            <div className="text-slate-400">Total Damage</div>
                            <div className="mt-1 font-semibold text-slate-100">864,000</div>
                          </div>
                          <div className="rounded-lg border border-white/10 p-2 text-xs">
                            <div className="text-slate-400">Participants</div>
                            <div className="mt-1 font-semibold text-slate-100">3</div>
                          </div>
                          <div className="rounded-lg border border-white/10 p-2 text-xs">
                            <div className="text-slate-400">Target</div>
                            <div className="mt-1 font-semibold text-slate-100">Training Dummy</div>
                          </div>
                        </div>
                      )}

                      <MemoizedDpsPanel
                        targetInfo={previewCombatInfos.targetInfos[1]}
                        thisTargetPlayerStats={previewStats as never}
                        combatInfos={previewCombatInfos as never}
                        mainPlayerColor={dpsAppearance.mainPlayerColor}
                        otherPlayerColor={dpsAppearance.otherPlayerColor}
                        onPlayerClicked={() => undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "shortcut" && (
            <div className="space-y-8">
              <SettingsSectionHeader
                title={t("settings.shortcut.title")}
                description={t("settings.shortcut.description")}
              />

              <SettingsGroup title="Global Shortcuts">
                <SettingsRow
                  label={t("settings.shortcut.showMain")}
                  control={
                    <ShortcutInput value={showMainShortcut} onChange={handleShortcutChange} />
                  }
                />
                <SettingsRow
                  label={t("settings.shortcut.showDps")}
                  control={
                    <ShortcutInput
                      value={showDpsShortcut}
                      onChange={handleShowDpsShortcutChange}
                    />
                  }
                />
                <SettingsRow
                  label={t("settings.shortcut.resetDps")}
                  control={
                    <ShortcutInput
                      value={resetDpsShortcut}
                      onChange={handleResetDpsShortcutChange}
                    />
                  }
                />
              </SettingsGroup>
            </div>
          )}

          {activeSection === "dps" && (
            <div className="space-y-8">
              <SettingsSectionHeader title={t("settings.dps.title")} />

              <SettingsGroup title="Runtime">
                <SettingsRow
                  label={t("settings.dps.snapshotInterval")}
                  control={
                    <div className="flex w-44 items-center gap-2">
                      <Input
                        type="number"
                        min={50}
                        step={50}
                        value={settings.dpsMeter.dpsSnapshotIntervalMs}
                        onChange={(event) => {
                          const nextValue = Number(event.currentTarget.value || 500);
                          void saveSettings({
                            dpsMeter: {
                              dpsSnapshotIntervalMs: nextValue,
                            },
                          });
                        }}
                      />
                      <span className="text-muted-foreground text-xs">ms</span>
                    </div>
                  }
                />
                <SettingsRow
                  label={t("settings.dps.memorySnapshotInterval")}
                  control={
                    <div className="flex w-44 items-center gap-2">
                      <Input
                        type="number"
                        min={100}
                        step={100}
                        value={settings.dpsMeter.memorySnapshotIntervalMs}
                        onChange={(event) => {
                          const nextValue = Number(event.currentTarget.value || 1500);
                          void saveSettings({
                            dpsMeter: {
                              memorySnapshotIntervalMs: nextValue,
                            },
                          });
                        }}
                      />
                      <span className="text-muted-foreground text-xs">ms</span>
                    </div>
                  }
                />
                <SettingsRow
                  label={t("settings.dps.bossOnly")}
                  control={
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={settings.dpsMeter.bossOnly}
                      onChange={(event) => {
                        void saveSettings({
                          dpsMeter: {
                            bossOnly: event.currentTarget.checked,
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label={t("settings.dps.myMuzhuangOnly")}
                  control={
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={settings.dpsMeter.myMuzhuangOnly}
                      onChange={(event) => {
                        void saveSettings({
                          dpsMeter: {
                            myMuzhuangOnly: event.currentTarget.checked,
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label={t("settings.dps.outputDebugLog")}
                  control={
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={settings.dpsMeter.outputDebugLog}
                      onChange={(event) => {
                        void saveSettings({
                          dpsMeter: {
                            outputDebugLog: event.currentTarget.checked,
                          },
                        });
                      }}
                    />
                  }
                />
              </SettingsGroup>
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-8">
              <SettingsSectionHeader
                title={t("about.title")}
                description={t("about.appName")}
              />

              <SettingsGroup title="Application">
                <SettingsRow
                  label={t("about.version")}
                  control={<span className="text-sm font-medium">{appVersion}</span>}
                />
                <SettingsRow
                  label="Tauri"
                  control={<span className="text-sm font-medium">{techVersions.tauri}</span>}
                />
                <SettingsRow
                  label="React"
                  control={<span className="text-sm font-medium">{techVersions.react}</span>}
                />
                <SettingsRow
                  label="TypeScript"
                  control={<span className="text-sm font-medium">{techVersions.typescript}</span>}
                />
              </SettingsGroup>

              <SettingsGroup title="Actions">
                <SettingsRow
                  label={t("about.github")}
                  control={
                    <Button onClick={handleOpenGithub} variant="outline">
                      <Github className="mr-2 h-4 w-4" />
                      {t("about.github")}
                    </Button>
                  }
                />
                <SettingsRow
                  label={t("updater.checkForUpdates")}
                  description={showNoUpdate ? t("updater.upToDate") : undefined}
                  control={
                    <Button onClick={checkUpdate} variant="outline" disabled={checking}>
                      <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
                      {checking ? t("updater.checking") : t("updater.checkForUpdates")}
                    </Button>
                  }
                />
              </SettingsGroup>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
