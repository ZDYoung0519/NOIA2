import { useCallback, useEffect, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { TitleBar } from "@/components/title-bar";
import { WindowFrame } from "@/components/window-frame";
import { LanguageToggle } from "@/components/language-toggle";
import { ShortcutInput } from "@/components/shortcut-input";
import { Moon, Sun, Monitor, Palette, Keyboard, Activity } from "lucide-react";
import { registerShortcut, unregisterShortcut } from "@/lib/shortcut";
import { toggleWindow } from "@/lib/window";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { useAppSettings } from "@/hooks/use-app-settings";

type SettingSection = "appearance" | "shortcut" | "dps";

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingSection>("appearance");
  const { t } = useAppTranslation();
  const { theme, setTheme } = useTheme();
  const { settings, saveSettings } = useAppSettings();

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
  ];

  return (
    <WindowFrame
      titleBar={<TitleBar title={t("settings.title")} showMaximize={false} />}
      contentClassName="flex flex-1 overflow-hidden"
    >
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
                <p className="text-muted-foreground text-sm">
                  {t("settings.appearance.description")}
                </p>
              </div>

              <div className="space-y-0">
                <div className="flex items-center justify-between py-2.5">
                  <label className="text-sm font-medium">{t("settings.appearance.theme")}</label>
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
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between py-2.5">
                  <label className="text-sm font-medium">{t("settings.appearance.language")}</label>
                  <LanguageToggle />
                </div>
              </div>
            </div>
          )}

          {activeSection === "shortcut" && (
            <div className="space-y-4">
              <div>
                <h2 className="mb-1 text-lg font-semibold">{t("settings.shortcut.title")}</h2>
                <p className="text-muted-foreground text-sm">
                  {t("settings.shortcut.description")}
                </p>
              </div>

              <div className="space-y-0">
                <div className="flex items-center justify-between py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">{t("settings.shortcut.showMain")}</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {t("settings.shortcut.showMainDesc")}
                    </p>
                  </div>
                  <ShortcutInput value={settings.shortcut} onChange={handleShortcutChange} />
                </div>
              </div>
            </div>
          )}

          {activeSection === "dps" && (
            <div className="space-y-4">
              <div>
                <h2 className="mb-1 text-lg font-semibold">DPS Meter</h2>
                <p className="text-muted-foreground text-sm">
                  配置后端 DPS 快照发送频率、日志输出和战斗过滤规则。
                </p>
              </div>

              <div className="space-y-0">
                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">DPS Snapshot Interval</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      后端向前端发送 DPS 快照的时间间隔，单位毫秒。
                    </p>
                  </div>
                  <div className="flex w-40 items-center gap-2">
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
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">BOSS_ONLY</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      开启后只统计目标为 Boss 的战斗数据。
                    </p>
                  </div>
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
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">MY_MUZHUANG_ONLY</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      开启后，木桩目标只统计主角色自己造成的伤害。
                    </p>
                  </div>
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
                </div>

                <div className="border-t" />

                <div className="flex items-center justify-between gap-4 py-2.5">
                  <div className="flex-1">
                    <label className="text-sm font-medium">OUTPUT_DEBUG_LOG</label>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      开启后将额外输出 DPS 抓包和分发调试日志到后端日志文件。
                    </p>
                  </div>
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
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </WindowFrame>
  );
}
