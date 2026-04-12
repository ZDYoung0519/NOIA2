import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/ui/en.json";
import zhCN from "./locales/ui/zh-CN.json";
import zhTW from "./locales/ui/zh-TW.json";
import ko from "./locales/ui/ko.json";
import enSkills from "./locales/skill/en.json";
import zhCNSkills from "./locales/skill/zh-CN.json";
import zhTWSkills from "./locales/skill/zh-TW.json";
import koSkills from "./locales/skill/ko.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { ui: en, skills: enSkills },
      "zh-CN": { ui: zhCN, skills: zhCNSkills },
      "zh-TW": { ui: zhTW, skills: zhTWSkills },
      ko: { ui: ko, skills: koSkills },
    },
    defaultNS: "ui",
    ns: ["ui", "skills"],
    fallbackLng: "en",
    supportedLngs: ["en", "zh-CN", "zh-TW", "ko"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
    },
  });

export default i18n;
