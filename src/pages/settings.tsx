import { useCallback, useEffect, useMemo, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { Activity, Keyboard, Monitor, Moon, Palette, Sun } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { TitleBar } from "@/components/title-bar";
import { WindowFrame } from "@/components/window-frame";
import { LanguageToggle } from "@/components/language-toggle";
import { ShortcutInput } from "@/components/shortcut-input";
import { Toaster } from "@/components/ui/sonner";
import { MemoizedDpsPanel } from "@/components/dps/DpsPannel";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useAppSettings } from "@/hooks/use-app-settings";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { toggleWindow } from "@/lib/window";

const hexToRgba = (hex: string, alphaPercent: number) => {
  const safeHex = hex.replace("#", "");
  const normalizedHex =
    safeHex.length === 3 ? safeHex.split("").map((char) => `${char}${char}`).join("") : safeHex;
  const r = parseInt(normalizedHex.slice(0, 2), 16);
  const g = parseInt(normalizedHex.slice(2, 4), 16);
  const b = parseInt(normalizedHex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.min(100, Math.max(0, alphaPercent)) / 100})`;
};

type SettingSection = "appearance" | "shortcut" | "dps";

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingSection>("appearance");
  const { t } = useAppTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, saveSettings } = useAppSettings();
  const dpsAppearance = settings.appearance.dpsWindow;
  const mainAppearance = settings.appearance.mainWindow;

  const previewCombatInfos = useMemo(
    () => ({
      actorInfos: {
        1001: { id: 1001, actorName: "You", actorClass: "ASSASSIN", actorServerId: "1", actorSkillSpec: {} },
        1002: { id: 1002, actorName: "Support", actorClass: "CLERIC", actorServerId: "2", actorSkillSpec: {} },
        1003: { id: 1003, actorName: "Ranger", actorClass: "RANGER", actorServerId: "3", actorSkillSpec: {} },
      },
      targetInfos: {
        1: {
          id: 1,
          targetMobCode: 2400032,
          targetName: "Training Dummy",
          isBoss: false,
          targetStartTime: { 1001: 0, 1002: 0, 1003: 0 },
          targetLastTime: { 1001: 120, 1002: 120, 1003: 120 },
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
      1001: { counts: 96, total_damage: 420000, totalDamage: 420000, minDamage: 1200, maxDamage: 9800, specialCounts: {} },
      1002: { counts: 74, total_damage: 258000, totalDamage: 258000, minDamage: 800, maxDamage: 6600, specialCounts: {} },
      1003: { counts: 68, total_damage: 186000, totalDamage: 186000, minDamage: 900, maxDamage: 7200, specialCounts: {} },
    }),
    []
  );

  const handleShowMainWindow = useCallback(async () => {
    await toggleWindow("main");
  }, []);

  useEffect(() => {
    if (settings.shortcut) {
      void registerShortcut(settings.shortcut, handleShowMainWindow);
    }
  }, [handleShowMainWindow, settings.shortcut]);

  const handleShortcutChange = async (newShortcut: string) => {
    const oldShortcut = settings.shortcut;

    if (newShortcut) {
      await saveSettings({ shortcut: newShortcut });
      await registerShortcut(newShortcut, handleShowMainWindow, oldShortcut);
      await emit("shortcut-changed", { shortcut: newShortcut });
      toast.success(t("settings.shortcut.setSuccess", { shortcut: newShortcut }));
    } else {
      await saveSettings({ shortcut: "" });
      if (oldShortcut) {
        await unregisterShortcut(oldShortcut);
      }
      await emit("shortcut-changed", { shortcut: "" });
      toast.info(t("settings.shortcut.cleared"));
    }
  };

  const menuItems = [
    { id: "appearance" as SettingSection, label: t("settings.appearance.title"), icon: Palette },
    { id: "shortcut" as SettingSection, label: t("settings.shortcut.title"), icon: Keyboard },
    { id: "dps" as SettingSection, label: t("settings.dps.title"), icon: Activity },
  ];

  return (
    <WindowFrame titleBar={<TitleBar title={t("settings.title")} showMaximize={false} />} contentClassName="flex flex-1 overflow-hidden">
      <Toaster />
      <aside className="border-border flex w-40 flex-col border-r p-4">
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

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl p-4">
          {activeSection === "appearance" && (
            <div className="space-y-4">
              <div>
                <h2 className="mb-1 text-lg font-semibold">{t("settings.appearance.title")}</h2>
                <p className="text-muted-foreground text-sm">{t("settings.appearance.description")}</p>
              </div>

              <div className="space-y-0">
                <div className="flex items-center justify-between py-2.5">
                  <label className="text-sm font-medium">{t("settings.appearance.theme")}</label>
                  <div className="flex gap-2">
                    <Button variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => setTheme("light")} className="flex items-center gap-1.5">
                      <Sun className="h-3.5 w-3.5" />
                      {t("settings.appearance.light")}
                    </Button>
                    <Button variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => setTheme("dark")} className="flex items-center gap-1.5">
                      <Moon className="h-3.5 w-3.5" />
                      {t("settings.appearance.dark")}
                    </Button>
                    <Button variant={theme === "system" ? "default" : "outline"} size="sm" onClick={() => setTheme("system")} className="flex items-center gap-1.5">
                      <Monitor className="h-3.5 w-3.5" />
                      {t("settings.appearance.system")}
                    </Button>
                  </div>
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between py-2.5">
                  <label className="text-sm font-medium">{t("settings.appearance.language")}</label>
                  <LanguageToggle />
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">{t("settings.appearance.mainWindowTitle")}</h3>
                  <p className="text-muted-foreground mt-1 text-xs">{t("settings.appearance.mainWindowDescription")}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium">{t("settings.appearance.backgroundColor")}</label>
                      <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.appearance.backgroundColorDescription")}</p>
                    </div>
                    <input type="color" value={mainAppearance.backgroundColor} onChange={(event) => void saveSettings({ appearance: { mainWindow: { backgroundColor: event.currentTarget.value } } })} />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium">{t("settings.appearance.backgroundOpacity")}</label>
                      <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.appearance.backgroundOpacityDescription")}</p>
                    </div>
                    <div className="flex w-56 items-center gap-3">
                      <input type="range" min={0} max={100} step={1} value={mainAppearance.backgroundOpacity} onChange={(event) => void saveSettings({ appearance: { mainWindow: { backgroundOpacity: Number(event.currentTarget.value) } } })} className="w-full" />
                      <span className="text-muted-foreground w-10 text-xs">{mainAppearance.backgroundOpacity}%</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold">{t("settings.appearance.dpsWindowTitle")}</h3>
                  <p className="text-muted-foreground mt-1 text-xs">{t("settings.appearance.dpsWindowDescription")}</p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium">{t("settings.appearance.autoResizeHeight")}</label>
                      <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.appearance.autoResizeHeightDescription")}</p>
                    </div>
                    <input type="checkbox" className="h-4 w-4" checked={dpsAppearance.autoResizeHeight} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { autoResizeHeight: event.currentTarget.checked } } })} />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium">{t("settings.appearance.showHeaderStats")}</label>
                      <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.appearance.showHeaderStatsDescription")}</p>
                    </div>
                    <input type="checkbox" className="h-4 w-4" checked={dpsAppearance.showHeaderStats} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { showHeaderStats: event.currentTarget.checked } } })} />
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-medium">{t("settings.appearance.scaleFactor")}</label>
                      <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.appearance.scaleFactorDescription")}</p>
                    </div>
                    <div className="flex w-56 items-center gap-3">
                      <input type="range" min={0.8} max={1.4} step={0.05} value={dpsAppearance.scaleFactor} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { scaleFactor: Number(event.currentTarget.value) } } })} className="w-full" />
                      <span className="text-muted-foreground w-12 text-xs">{Math.round(dpsAppearance.scaleFactor * 100)}%</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.appearance.shellColor")}</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={dpsAppearance.backgroundColor} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { backgroundColor: event.currentTarget.value } } })} />
                        <span className="text-muted-foreground text-xs">{dpsAppearance.backgroundColor}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.appearance.shellOpacity")}</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min={0} max={100} step={1} value={dpsAppearance.backgroundOpacity} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { backgroundOpacity: Number(event.currentTarget.value) } } })} className="w-full" />
                        <span className="text-muted-foreground w-10 text-xs">{dpsAppearance.backgroundOpacity}%</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.appearance.panelColor")}</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={dpsAppearance.panelColor} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { panelColor: event.currentTarget.value } } })} />
                        <span className="text-muted-foreground text-xs">{dpsAppearance.panelColor}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.appearance.panelOpacity")}</label>
                      <div className="flex items-center gap-3">
                        <input type="range" min={0} max={100} step={1} value={dpsAppearance.panelOpacity} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { panelOpacity: Number(event.currentTarget.value) } } })} className="w-full" />
                        <span className="text-muted-foreground w-10 text-xs">{dpsAppearance.panelOpacity}%</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.appearance.mainPlayerBar")}</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={dpsAppearance.mainPlayerColor.startsWith("#") ? dpsAppearance.mainPlayerColor : "#22c55e"} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { mainPlayerColor: event.currentTarget.value } } })} />
                        <span className="text-muted-foreground text-xs">{dpsAppearance.mainPlayerColor}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">{t("settings.appearance.otherPlayerBar")}</label>
                      <div className="flex items-center gap-3">
                        <input type="color" value={dpsAppearance.otherPlayerColor.startsWith("#") ? dpsAppearance.otherPlayerColor : "#38bdf8"} onChange={(event) => void saveSettings({ appearance: { dpsWindow: { otherPlayerColor: event.currentTarget.value } } })} />
                        <span className="text-muted-foreground text-xs">{dpsAppearance.otherPlayerColor}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-xl border p-3">
                  <div className="mb-2">
                    <h4 className="text-sm font-semibold">{t("settings.appearance.previewTitle")}</h4>
                    <p className="text-muted-foreground mt-1 text-xs">{t("settings.appearance.previewDescription")}</p>
                  </div>

                  <div className="rounded-2xl border border-white/10 p-2 text-slate-100" style={{ backgroundColor: hexToRgba(dpsAppearance.backgroundColor, dpsAppearance.backgroundOpacity) }}>
                    <div className="space-y-2 rounded-2xl border border-white/10 p-2" style={{ backgroundColor: hexToRgba(dpsAppearance.panelColor, dpsAppearance.panelOpacity), zoom: dpsAppearance.scaleFactor }}>
                      {dpsAppearance.showHeaderStats && (
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg border border-white/10 p-2 text-xs">
                            <div className="text-slate-400">{t("dps.stats.totalDamage")}</div>
                            <div className="mt-1 font-semibold text-slate-100">864,000</div>
                          </div>
                          <div className="rounded-lg border border-white/10 p-2 text-xs">
                            <div className="text-slate-400">{t("dps.stats.participants")}</div>
                            <div className="mt-1 font-semibold text-slate-100">3</div>
                          </div>
                          <div className="rounded-lg border border-white/10 p-2 text-xs">
                            <div className="text-slate-400">{t("dps.stats.targetState")}</div>
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
            <div className="space-y-4">
              <div>
                <h2 className="mb-1 text-lg font-semibold">{t("settings.shortcut.title")}</h2>
                <p className="text-muted-foreground text-sm">{t("settings.shortcut.description")}</p>
              </div>

              <div className="space-y-0">
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">{t("settings.shortcut.showMain")}</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.shortcut.showMainDesc")}</p>
                  </div>
                  <ShortcutInput value={settings.shortcut} onChange={handleShortcutChange} />
                </div>
              </div>
            </div>
          )}

          {activeSection === "dps" && (
            <div className="space-y-4">
              <div>
                <h2 className="mb-1 text-lg font-semibold">{t("settings.dps.title")}</h2>
                <p className="text-muted-foreground text-sm">{t("settings.dps.description")}</p>
              </div>

              <div className="space-y-0">
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">{t("settings.dps.snapshotInterval")}</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.dps.snapshotIntervalDescription")}</p>
                  </div>
                  <div className="flex w-40 items-center gap-2">
                    <Input type="number" min={50} step={50} value={settings.dpsMeter.dpsSnapshotIntervalMs} onChange={(event) => void saveSettings({ dpsMeter: { dpsSnapshotIntervalMs: Number(event.currentTarget.value || 500) } })} />
                    <span className="text-muted-foreground text-xs">ms</span>
                  </div>
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">{t("settings.dps.bossOnly")}</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.dps.bossOnlyDescription")}</p>
                  </div>
                  <input type="checkbox" className="h-4 w-4" checked={settings.dpsMeter.bossOnly} onChange={(event) => void saveSettings({ dpsMeter: { bossOnly: event.currentTarget.checked } })} />
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">{t("settings.dps.myMuzhuangOnly")}</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.dps.myMuzhuangOnlyDescription")}</p>
                  </div>
                  <input type="checkbox" className="h-4 w-4" checked={settings.dpsMeter.myMuzhuangOnly} onChange={(event) => void saveSettings({ dpsMeter: { myMuzhuangOnly: event.currentTarget.checked } })} />
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">{t("settings.dps.outputDebugLog")}</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">{t("settings.dps.outputDebugLogDescription")}</p>
                  </div>
                  <input type="checkbox" className="h-4 w-4" checked={settings.dpsMeter.outputDebugLog} onChange={(event) => void saveSettings({ dpsMeter: { outputDebugLog: event.currentTarget.checked } })} />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </WindowFrame>
  );
}
