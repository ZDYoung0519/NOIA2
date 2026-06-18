import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ko", label: "한국어" },
];

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  const switchLanguage = async (newLang: string) => {
    if (newLang === i18n.language) return;
    await i18n.changeLanguage(newLang);

    try {
      await invoke("update_tray_menu", {
        showText: t("tray.show", { lng: newLang }),
        quitText: t("tray.quit", { lng: newLang }),
      });
    } catch (_) { /* ignore */ }

    try {
      const raw = localStorage.getItem("app-config");
      const cfg = raw ? JSON.parse(raw) : {};
      cfg.app = { ...(cfg.app || {}), language: newLang };
      localStorage.setItem("app-config", JSON.stringify(cfg));
    } catch (_) { /* ignore */ }

    try {
      await invoke("set_language", { language: newLang });
    } catch (_) { /* ignore */ }
    await emit("language-changed", { language: newLang });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="title-bar-btn mr-1"
          aria-label={t("language.toggle")}
          tabIndex={-1}
        >
          <Languages className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => switchLanguage(lang.code)}
            className={i18n.language === lang.code ? "font-bold" : ""}
          >
            {lang.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
