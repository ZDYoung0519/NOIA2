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

  const tAion2Skill = (skillId: string | number) =>
    i18n.t(String(skillId), {
      ns: "aion2skills",
      defaultValue: `#${skillId}`,
    });

  const tAion2Stats = (statType: string) =>
    i18n.t(statType, {
      ns: "aion2stats",
      defaultValue: statType,
    });

  return { t, i18n, tAion2Skill, tAion2Stats, tSkill: tAion2Skill };
}
