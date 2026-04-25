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

import enStats from "./locales/stats/en.json";
import zhCNStats from "./locales/stats/zh-CN.json";
import zhTWStats from "./locales/stats/zh-TW.json";
import koStats from "./locales/stats/ko.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { ui: en, skills: enSkills, stats: enStats },
      "zh-CN": { ui: zhCN, skills: zhCNSkills, stats: zhCNStats },
      "zh-TW": { ui: zhTW, skills: zhTWSkills, stats: zhTWStats },
      ko: { ui: ko, skills: koSkills, stats: koStats },
    },
    defaultNS: "ui",
    ns: ["ui", "skills", "stats"],
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
