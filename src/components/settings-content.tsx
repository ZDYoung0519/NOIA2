import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import {
  Activity,
  Info,
  Monitor,
  Moon,
  RefreshCw,
  HeartHandshake,
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
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useManualUpdateCheck } from "@/components/updater-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { formatStorageSize, getLocalStorageSummary } from "@/lib/storage-summary";

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

type SettingSection = "general" | "dps" | "about";

const SUPPORT_WECHAT_QR_PATH = "/images/support-wechat-qr.png";

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
  const [activeSection, setActiveSection] = useState<SettingSection>("general");
  const [appVersion, setAppVersion] = useState("");
  const [clearStorageOpen, setClearStorageOpen] = useState(false);
  const [supportDialogOpen, setSupportDialogOpen] = useState(false);
  const [supportImageError, setSupportImageError] = useState(false);
  const [storageSummary, setStorageSummary] = useState(() => getLocalStorageSummary());
  const { t } = useAppTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, saveSettings } = useAppSettings();
  const { checkUpdate, checking, showNoUpdate } = useManualUpdateCheck();
  const dpsAppearance = settings.appearance.dpsWindow;
  const showMainShortcut = settings.shortcuts.showMain;
  const showDpsShortcut = settings.shortcuts.showDps;
  const resetDpsShortcut = settings.shortcuts.resetDps;

  useEffect(() => {
    void getVersion().then(setAppVersion);
  }, []);

  const refreshStorageSummary = useCallback(() => {
    setStorageSummary(getLocalStorageSummary());
  }, []);

  useEffect(() => {
    refreshStorageSummary();
  }, [refreshStorageSummary, activeSection]);

  useEffect(() => {
    const handleFocus = () => {
      refreshStorageSummary();
    };

    const handleStorage = () => {
      refreshStorageSummary();
    };

    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, [refreshStorageSummary]);

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

  const handleShortcutChange = async (newShortcut: string) => {
    if (newShortcut) {
      await saveSettings({
        shortcuts: {
          showMain: newShortcut,
        },
      });
      toast.success(t("settings.shortcut.setSuccess", { shortcut: newShortcut }));
    } else {
      await saveSettings({
        shortcuts: {
          showMain: "",
        },
      });
      toast.info(t("settings.shortcut.cleared"));
    }
  };

  const handleShowDpsShortcutChange = async (newShortcut: string) => {
    if (newShortcut) {
      await saveSettings({
        shortcuts: {
          showDps: newShortcut,
        },
      });
      toast.success(t("settings.shortcut.setSuccess", { shortcut: newShortcut }));
    } else {
      await saveSettings({
        shortcuts: {
          showDps: "",
        },
      });
      toast.info(t("settings.shortcut.cleared"));
    }
  };

  const handleResetDpsShortcutChange = async (newShortcut: string) => {
    if (newShortcut) {
      await saveSettings({
        shortcuts: {
          resetDps: newShortcut,
        },
      });
      toast.success(t("settings.shortcut.setSuccess", { shortcut: newShortcut }));
    } else {
      await saveSettings({
        shortcuts: {
          resetDps: "",
        },
      });
      toast.info(t("settings.shortcut.cleared"));
    }
  };

  const menuItems = [
    {
      id: "general" as SettingSection,
      label: t("settings.general.title"),
      icon: Monitor,
    },
    {
      id: "dps" as SettingSection,
      label: t("settings.dps.title"),
      icon: Activity,
    },
    {
      id: "about" as SettingSection,
      label: t("settings.aboutPage.title"),
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
          {activeSection === "general" && (
            <div className="space-y-8">
              <SettingsSectionHeader
                title={t("settings.general.title")}
                description={t("settings.general.description")}
              />

              <SettingsGroup title={t("settings.general.appearanceGroup")}>
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

              <SettingsGroup title={t("settings.general.shortcutsGroup")}>
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
              <SettingsSectionHeader
                title={t("settings.dps.title")}
                description={t("settings.dps.description")}
              />

              <SettingsGroup title={t("settings.dps.runtimeGroup")}>
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
                    <Switch
                      checked={settings.dpsMeter.bossOnly}
                      onCheckedChange={(checked) => {
                        void saveSettings({
                          dpsMeter: {
                            bossOnly: checked,
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label={t("settings.dps.myMuzhuangOnly")}
                  control={
                    <Switch
                      checked={settings.dpsMeter.myMuzhuangOnly}
                      onCheckedChange={(checked) => {
                        void saveSettings({
                          dpsMeter: {
                            myMuzhuangOnly: checked,
                          },
                        });
                      }}
                    />
                  }
                />
              </SettingsGroup>

              <SettingsGroup title={t("settings.dps.windowAppearanceGroup")}>
                <SettingsRow
                  label={t("settings.dps.autoResizeHeight")}
                  control={
                    <Switch
                      checked={dpsAppearance.autoResizeHeight}
                      onCheckedChange={(checked) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              autoResizeHeight: checked,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label={t("settings.dps.maskNicknames")}
                  control={
                    <Switch
                      checked={dpsAppearance.maskNicknames}
                      onCheckedChange={(checked) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              maskNicknames: checked,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label={t("settings.dps.scaleFactor")}
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
                  label={t("settings.dps.shellColor")}
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
                  label={t("settings.dps.shellOpacity")}
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
                  label={t("settings.dps.panelColor")}
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
                  label={t("settings.dps.panelOpacity")}
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
                  label={t("settings.dps.mainPlayerBar")}
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
                  label={t("settings.dps.otherPlayerBar")}
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
                <SettingsRow
                  label={t("settings.dps.barOpacity")}
                  control={
                    <div className="flex w-64 items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={1}
                        value={dpsAppearance.barOpacity}
                        onChange={(event) => {
                          void saveSettings({
                            appearance: {
                              dpsWindow: {
                                barOpacity: Number(event.currentTarget.value),
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                      <span className="text-muted-foreground w-10 text-right text-xs">
                        {dpsAppearance.barOpacity}%
                      </span>
                    </div>
                  }
                />
              </SettingsGroup>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {t("settings.dps.previewGroup")}
                </h3>
                <div className="rounded-xl border p-3">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold">{t("settings.dps.previewWindowTitle")}</h4>
                  </div>

                  <div
                    className="rounded-2xl border border-white/10 p-2 text-slate-100 max-w-150 items-center justify-center"
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


                      <MemoizedDpsPanel
                        targetInfo={previewCombatInfos.targetInfos[1]}
                        thisTargetPlayerStats={previewStats as never}
                        combatInfos={previewCombatInfos as never}
                        mainPlayerColor={dpsAppearance.mainPlayerColor}
                        otherPlayerColor={dpsAppearance.otherPlayerColor}
                        barOpacity={dpsAppearance.barOpacity}
                        maskNicknames={dpsAppearance.maskNicknames}
                        onPlayerClicked={() => undefined}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === "about" && (
            <div className="space-y-8">
              <SettingsSectionHeader
                title={t("settings.aboutPage.title")}
                description={t("settings.aboutPage.description")}
              />

              <SettingsGroup title={t("settings.aboutPage.applicationGroup")}>
                <SettingsRow
                  label={t("about.version")}
                  description={showNoUpdate ? t("updater.upToDate") : undefined}
                  control={
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{appVersion}</span>
                      <Button onClick={checkUpdate} variant="outline" size="sm" disabled={checking}>
                        <RefreshCw
                          data-icon="inline-start"
                          className={checking ? "animate-spin" : undefined}
                        />
                        {checking ? t("updater.checking") : t("updater.checkForUpdates")}
                      </Button>
                    </div>
                  }
                />
              </SettingsGroup>

              <SettingsGroup title={t("settings.aboutPage.supportGroup")}>
                <SettingsRow
                  label={t("settings.aboutPage.supportUs")}
                  description={t("settings.aboutPage.supportDescription")}
                  control={
                    <Button onClick={() => setSupportDialogOpen(true)} variant="outline">
                      <HeartHandshake data-icon="inline-start" />
                      {t("settings.aboutPage.supportUs")}
                    </Button>
                  }
                />
              </SettingsGroup>

              <SettingsGroup title={t("settings.aboutPage.storageGroup")}>
                <SettingsRow
                  label={t("settings.aboutPage.currentUsage")}
                  description={t("settings.aboutPage.entries", {
                    count: storageSummary.entries.length,
                  })}
                  control={
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">
                        {formatStorageSize(storageSummary.totalBytes)}
                      </span>
                      <Button variant="outline" size="sm" onClick={refreshStorageSummary}>
                        <RefreshCw data-icon="inline-start" />
                        {t("settings.aboutPage.refresh")}
                      </Button>
                    </div>
                  }
                />
                <SettingsRow
                  label={t("settings.aboutPage.clearCache")}
                  description={t("settings.aboutPage.clearCacheDescription")}
                  control={
                    <Button variant="destructive" size="sm" onClick={() => setClearStorageOpen(true)}>
                      {t("settings.aboutPage.clearCache")}
                    </Button>
                  }
                />
                {storageSummary.entries.length === 0 ? (
                  <div className="px-5 py-6 text-sm text-muted-foreground">
                    {t("settings.aboutPage.noStorageData")}
                  </div>
                ) : (
                  storageSummary.entries.map((entry) => (
                    <SettingsRow
                      key={entry.key}
                      label={entry.key}
                      description={`${entry.bytes.toLocaleString()} bytes`}
                      control={
                        <span className="text-sm font-medium">
                          {formatStorageSize(entry.bytes)}
                        </span>
                      }
                    />
                  ))
                )}
              </SettingsGroup>
            </div>
          )}
        </div>
      </div>

      <Dialog open={clearStorageOpen} onOpenChange={setClearStorageOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.aboutPage.clearDialogTitle")}</DialogTitle>
            <DialogDescription>{t("settings.aboutPage.clearDialogDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearStorageOpen(false)}>{t("about.close")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                localStorage.clear();
                setClearStorageOpen(false);
                refreshStorageSummary();
                window.location.reload();
              }}
            >
              {t("settings.aboutPage.clearAndReload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={supportDialogOpen}
        onOpenChange={(open) => {
          setSupportDialogOpen(open);
          if (open) {
            setSupportImageError(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("settings.aboutPage.supportDialogTitle")}</DialogTitle>
            <DialogDescription>{t("settings.aboutPage.supportDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {supportImageError ? (
              <div className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center">
                <div className="text-sm font-medium">{t("settings.aboutPage.supportDialogMissing")}</div>
                <div className="text-muted-foreground text-xs leading-5">
                  {t("settings.aboutPage.supportDialogMissingHint", {
                    path: SUPPORT_WECHAT_QR_PATH,
                  })}
                </div>
              </div>
            ) : (
              <img
                src={SUPPORT_WECHAT_QR_PATH}
                alt="WeChat support QR code"
                className="size-64 rounded-2xl border object-contain"
                onError={() => setSupportImageError(true)}
              />
            )}
            <p className="text-muted-foreground text-center text-sm leading-6">
              {t("settings.aboutPage.supportDialogThanks")}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupportDialogOpen(false)}>{t("about.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
