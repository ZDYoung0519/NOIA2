import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function useAppTranslation() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const unlistenLanguageChanged = listen<{ language: string }>("language-changed", (event) => {
      i18n.changeLanguage(event.payload.language);
    });

    return () => {
      unlistenLanguageChanged.then((fn) => fn());
    };
  }, [i18n]);

  const tSkill = (skillId: string | number) =>
    i18n.t(String(skillId), {
      ns: "skills",
      defaultValue: `#${skillId}`,
    });

  return { t, tSkill, i18n };
}
