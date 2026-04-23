import { useState } from "react";
import { Check, Languages } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const LANGUAGES = ["en", "zh-CN", "zh-TW", "ko"] as const;

export function LanguageToggle() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);

  const currentLanguage = LANGUAGES.includes(i18n.language as (typeof LANGUAGES)[number])
    ? (i18n.language as (typeof LANGUAGES)[number])
    : "en";

  const handleChangeLanguage = async (nextLanguage: (typeof LANGUAGES)[number]) => {
    if (nextLanguage === currentLanguage) {
      setOpen(false);
      return;
    }

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
    setOpen(false);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="title-bar-btn mr-1"
        aria-label={t("language.toggle")}
        title={t("language.current", { language: t(`language.${currentLanguage}`) })}
        tabIndex={-1}
      >
        <Languages className="h-4 w-4" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("language.toggle")}</DialogTitle>
            <DialogDescription>
              {t("language.current", { language: t(`language.${currentLanguage}`) })}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            {LANGUAGES.map((language) => {
              const selected = language === currentLanguage;

              return (
                <Button
                  key={language}
                  type="button"
                  variant={selected ? "secondary" : "outline"}
                  className={cn("justify-between", selected && "pointer-events-none")}
                  onClick={() => void handleChangeLanguage(language)}
                >
                  <span>{t(`language.${language}`)}</span>
                  {selected ? <Check data-icon="inline-end" /> : null}
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
