import { Languages } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

const LANGUAGES = ["en", "zh-CN", "zh-TW", "ko"] as const;

export function LanguageToggle() {
  const { i18n, t } = useTranslation();

  const toggleLanguage = async () => {
    const currentLanguage = LANGUAGES.includes(i18n.language as (typeof LANGUAGES)[number])
      ? (i18n.language as (typeof LANGUAGES)[number])
      : "en";
    const currentIndex = LANGUAGES.indexOf(currentLanguage);
    const nextLanguage = LANGUAGES[(currentIndex + 1) % LANGUAGES.length];

    await i18n.changeLanguage(nextLanguage);

    try {
      await invoke("update_tray_menu", {
        showText: t("tray.show", { lng: nextLanguage }),
        quitText: t("tray.quit", { lng: nextLanguage }),
      });
    } catch (error) {
      console.error("Failed to update tray menu:", error);
    }

    await emit("language-changed", { language: nextLanguage });
  };

  return (
    <button
      onClick={toggleLanguage}
      className="title-bar-btn mr-1"
      aria-label={t("language.toggle")}
      title={t("language.current", { language: t(`language.${i18n.language}`) })}
      tabIndex={-1}
    >
      <Languages className="h-4 w-4" />
    </button>
  );
}
