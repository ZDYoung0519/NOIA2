import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import { LanguageToggle } from "@/components/language-toggle";
import { Moon, Sun, Monitor, Palette, Gamepad2, HeartHandshake, Info } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useAppTranslation } from "@/hooks/use-app-translation";
import { Aion2Settings } from "@/components/aion2-settings";
import { SupportAcknowledgementsSettings } from "@/components/support-acknowledgements-settings";
import { AboutSettings } from "@/components/about-settings";
import { SettingsGroup, SettingsRow, SettingsSectionHeader } from "@/components/settings-layout";

type SettingSection = "appearance" | "aion2" | "support" | "about";

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingSection>("appearance");
  const { t } = useAppTranslation();
  const { theme, setTheme } = useTheme();

  const menuItems: { id: SettingSection; label: string; icon: typeof Palette }[] = [
    { id: "appearance", label: t("settings.appearance.title"), icon: Palette },
    { id: "aion2", label: t("settings.aion2.title"), icon: Gamepad2 },
    { id: "support", label: "支持与鸣谢", icon: HeartHandshake },
    { id: "about", label: "关于", icon: Info },
  ];

  return (
    <div className="flex h-full min-h-0 w-full">
      <Toaster />
      <aside className="border-border bg-background/35 flex w-44 shrink-0 flex-col border-r p-4">
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

      <div className="min-w-0 flex-1 overflow-auto">
        <div className="w-full p-5 lg:p-8">
          {activeSection === "appearance" && (
            <div className="flex flex-col gap-8">
              <SettingsSectionHeader
                title={t("settings.appearance.title")}
                description={t("settings.appearance.description")}
              />

              <SettingsGroup title={t("settings.appearance.title")}>
                <SettingsRow
                  label={t("settings.appearance.theme")}
                  description={t("settings.appearance.themeDesc")}
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
                  description={t("settings.appearance.languageDesc")}
                  control={<LanguageToggle />}
                />
              </SettingsGroup>
            </div>
          )}

          {activeSection === "aion2" && <Aion2Settings />}
          {activeSection === "support" && <SupportAcknowledgementsSettings />}
          {activeSection === "about" && <AboutSettings />}
        </div>
      </div>
    </div>
  );
}
