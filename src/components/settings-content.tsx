import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Activity,
  ExternalLink,
  HeartHandshake,
  Info,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
} from "lucide-react";
import { toast } from "sonner";

import { MemoizedDpsPanel } from "@/components/dps/dps-panel";
import { LanguageToggle } from "@/components/language-toggle";
import { ShortcutInput } from "@/components/shortcut-input";
import { useTheme } from "@/components/theme-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { Switch } from "@/components/ui/switch";
import { useAppSettings } from "@/hooks/use-app-settings";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useManualUpdateCheck } from "@/components/updater-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatStorageSize, getLocalStorageSummary } from "@/lib/storage-summary";
import { cn } from "@/lib/utils";
import { MAX_PACKET_SIZE_THRESHOLD_OPTIONS } from "@/lib/dps-meter-config";
import { CombatInfos, SkillStats, TargetInfo } from "@/types/aion2dps";

type SettingSection = "general" | "dps" | "support" | "about";
type SupportListItem = {
  nickname: string;
  href: string;
  avatarSrc?: string;
  avatarFallback: string;
};

const SUPPORT_WECHAT_QR_PATH = "/images/afdian.jpg";
const SUPPORT_LIST: SupportListItem[] = [];
const TECHNICAL_ACKNOWLEDGEMENTS: SupportListItem[] = [
  {
    nickname: "TK-open-public/",
    href: "https://github.com/TK-open-public/Aion2-Dps-Meter",
    avatarSrc: "https://avatars.githubusercontent.com/u/253818446?s=48&v=4",
    avatarFallback: "AF",
  },
  {
    nickname: "taengu",
    href: "https://github.com/taengu/Aion2-Dps-Meter",
    avatarFallback: "https://avatars.githubusercontent.com/u/7606218?s=48&v=4",
  },
  {
    nickname: "p62003",
    href: "https://github.com/p62003/aletheia_AION2_DPS_Meter",
    avatarFallback: "https://avatars.githubusercontent.com/u/125135560?s=48&v=4",
  },
];

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

function SettingsSectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="space-y-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  );
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-muted-foreground text-sm font-semibold tracking-[0.18em] uppercase">
        {title}
      </h3>
      <div className="divide-border divide-y overflow-hidden rounded-2xl border backdrop-blur-sm">
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
  control: ReactNode;
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

function SupportList({
  items,
  emptyText,
  onOpenLink,
}: {
  items: SupportListItem[];
  emptyText: string;
  onOpenLink: (href: string) => void;
}) {
  if (items.length === 0) {
    return <div className="text-muted-foreground px-5 py-6 text-sm">{emptyText}</div>;
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <div
          key={`${item.nickname}-${item.href}`}
          className="flex items-center justify-between gap-4 px-5 py-4 not-last:border-b"
        >
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="lg">
              {item.avatarSrc ? <AvatarImage src={item.avatarSrc} alt={item.nickname} /> : null}
              <AvatarFallback>{item.avatarFallback}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="text-sm font-medium">{item.nickname}</div>
              <div className="text-muted-foreground truncate text-xs">{item.href}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => onOpenLink(item.href)}>
            <ExternalLink data-icon="inline-start" />
            Open
          </Button>
        </div>
      ))}
    </div>
  );
}

export function SettingsContent() {
  const [activeSection, setActiveSection] = useState<SettingSection>("general");
  const [appVersion, setAppVersion] = useState("");
  const [clearStorageOpen, setClearStorageOpen] = useState(false);
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

  const previewCombatInfos = useMemo<CombatInfos>(
    () => ({
      actorInfos: {
        1001: {
          id: 1001,
          actorName: "MainPlayer",
          actorClass: "ASSASSIN",
          actorServerId: "1001",
          actorSkillSpec: {},
        },
        1002: {
          id: 1002,
          actorName: "Supporter",
          actorClass: "CLERIC",
          actorServerId: "1002",
          actorSkillSpec: {},
        },
        1003: {
          id: 1003,
          actorName: "Blaster",
          actorClass: "RANGER",
          actorServerId: "1003",
          actorSkillSpec: {},
        },
      },
      targetInfos: {
        9001: {
          id: 9001,
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
      mainActorName: "MainPlayer",
      lastTargetByMainActor: 9001,
      lastTarget: 9001,
      timeNow: 120,
    }),
    []
  );

  const previewTargetInfo = useMemo<TargetInfo | undefined>(
    () => previewCombatInfos.targetInfos["9001"],
    [previewCombatInfos]
  );

  const previewStats = useMemo<Record<number, SkillStats>>(
    () => ({
      1001: {
        counts: 96,
        total_damage: 420000,
        minDamage: 1200,
        maxDamage: 9800,
        specialCounts: {},
      },
      1002: {
        counts: 74,
        total_damage: 258000,

        minDamage: 800,
        maxDamage: 6600,
        specialCounts: {},
      },
      1003: {
        counts: 68,
        total_damage: 186000,
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

  const handleOpenLink = useCallback((href: string) => {
    void openUrl(href);
  }, []);

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
      id: "support" as SettingSection,
      label: t("settings.supportPage.title"),
      icon: HeartHandshake,
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

      <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
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
                    <ShortcutInput value={showDpsShortcut} onChange={handleShowDpsShortcutChange} />
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
                  description={t("settings.dps.snapshotIntervalDescription")}
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
                  description={t("settings.dps.memorySnapshotIntervalDescription")}
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
                  label={t("settings.dps.maxPacketSizeThreshold")}
                  description={t("settings.dps.maxPacketSizeThresholdDescription")}
                  control={
                    <Select
                      value={String(settings.dpsMeter.maxPacketSizeThreshold)}
                      onValueChange={(value) => {
                        void saveSettings({
                          dpsMeter: {
                            maxPacketSizeThreshold: Number(value),
                          },
                        });
                      }}
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MAX_PACKET_SIZE_THRESHOLD_OPTIONS.map((value) => (
                          <SelectItem key={value} value={String(value)}>
                            {value / 1024} KB
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  }
                />
                <SettingsRow
                  label={t("settings.dps.enableResyncOnStall")}
                  description={t("settings.dps.enableResyncOnStallDescription")}
                  control={
                    <Switch
                      checked={settings.dpsMeter.enableResyncOnStall}
                      onCheckedChange={(checked) => {
                        void saveSettings({
                          dpsMeter: {
                            enableResyncOnStall: checked,
                          },
                        });
                      }}
                    />
                  }
                />
                <SettingsRow
                  label={t("settings.dps.resyncDelay")}
                  description={t("settings.dps.resyncDelayDescription")}
                  control={
                    <div className="flex w-44 items-center gap-2">
                      <Input
                        type="number"
                        min={100}
                        step={500}
                        value={settings.dpsMeter.resyncDelayMs}
                        onChange={(event) => {
                          const nextValue = Number(event.currentTarget.value || 500);
                          void saveSettings({
                            dpsMeter: {
                              resyncDelayMs: nextValue,
                            },
                          });
                        }}
                        disabled={!settings.dpsMeter.enableResyncOnStall}
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
                  label={t("settings.dps.showDetailOnHover")}
                  control={
                    <Switch
                      checked={dpsAppearance.showDetailOnHover}
                      onCheckedChange={(checked) => {
                        void saveSettings({
                          appearance: {
                            dpsWindow: {
                              showDetailOnHover: checked,
                            },
                          },
                        });
                      }}
                    />
                  }
                />
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
                  label={t("settings.dps.scaleFactor")}
                  control={
                    <div className="flex w-64 items-center gap-3">
                      <input
                        type="range"
                        min={0.5}
                        max={1.5}
                        step={0.1}
                        value={dpsAppearance.scaleFactor}
                        onChange={(event) => {
                          void saveSettings({
                            appearance: {
                              dpsWindow: {
                                scaleFactor: Number(event.currentTarget.value || 1),
                              },
                            },
                          });
                        }}
                        className="w-full"
                      />
                      <span className="text-muted-foreground w-12 text-right text-xs">
                        {dpsAppearance.scaleFactor.toFixed(1)}
                      </span>
                    </div>
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
                  label={t("settings.dps.panelColor")}
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
                  label={t("settings.dps.panelOpacity")}
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
                  label={t("settings.dps.mainPlayerBar")}
                  control={
                    <input
                      type="color"
                      value={dpsAppearance.mainPlayerColor}
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
                      value={dpsAppearance.otherPlayerColor}
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

              <SettingsGroup title={t("settings.dps.previewGroup")}>
                <div className="space-y-3 px-5 py-5">
                  <div className="text-sm font-medium">{t("settings.dps.previewWindowTitle")}</div>
                  <div
                    className="max-w-100 overflow-auto rounded-xl border border-white/10 p-3"
                    style={{
                      backgroundColor: hexToRgba(
                        dpsAppearance.backgroundColor,
                        dpsAppearance.backgroundOpacity
                      ),
                    }}
                  >
                    <MemoizedDpsPanel
                      targetInfo={previewTargetInfo}
                      thisTargetPlayerStats={previewStats}
                      combatInfos={previewCombatInfos}
                      mainPlayerColor={dpsAppearance.mainPlayerColor}
                      otherPlayerColor={dpsAppearance.otherPlayerColor}
                      barOpacity={100}
                      maskNicknames={dpsAppearance.maskNicknames}
                      onPlayerClicked={() => {}}
                    />
                  </div>
                </div>
              </SettingsGroup>
            </div>
          )}

          {activeSection === "support" && (
            <div className="space-y-8">
              <SettingsSectionHeader
                title={t("settings.supportPage.title")}
                description={t("settings.supportPage.description")}
              />

              <SettingsGroup title={t("settings.supportPage.supportMethodsGroup")}>
                <div className="grid gap-4 px-5 py-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="bg-muted/30 overflow-hidden rounded-2xl border">
                    <img
                      src={SUPPORT_WECHAT_QR_PATH}
                      alt={t("settings.supportPage.qrAlt")}
                      className="aspect-square w-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col justify-between gap-4">
                    <div className="space-y-2">
                      <div className="text-base font-semibold">
                        {t("settings.supportPage.supportUs")}
                      </div>
                      <p className="text-muted-foreground text-sm leading-6">
                        {t("settings.supportPage.supportDescription")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => handleOpenLink("https://afdian.com/")}
                      >
                        <HeartHandshake data-icon="inline-start" />
                        {t("settings.supportPage.openSupportLink")}
                      </Button>
                    </div>
                  </div>
                </div>
              </SettingsGroup>

              <SettingsGroup title={t("settings.supportPage.sponsorGroup")}>
                <SupportList
                  items={SUPPORT_LIST}
                  emptyText={t("settings.supportPage.noSupporters")}
                  onOpenLink={handleOpenLink}
                />
              </SettingsGroup>

              <SettingsGroup title={t("settings.supportPage.technicalGroup")}>
                <SupportList
                  items={TECHNICAL_ACKNOWLEDGEMENTS}
                  emptyText={t("settings.supportPage.noTechnicalCredits")}
                  onOpenLink={handleOpenLink}
                />
              </SettingsGroup>
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
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setClearStorageOpen(true)}
                    >
                      {t("settings.aboutPage.clearCache")}
                    </Button>
                  }
                />
                {storageSummary.entries.length === 0 ? (
                  <div className="text-muted-foreground px-5 py-6 text-sm">
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
            <Button variant="outline" onClick={() => setClearStorageOpen(false)}>
              {t("about.close")}
            </Button>
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
    </>
  );
}
