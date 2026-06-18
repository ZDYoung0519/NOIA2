import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import ko from "./locales/ko.json";

import enAion2Stats from "./locales/aion2stats/en.json";
import zhCNAion2Stats from "./locales/aion2stats/zh-CN.json";
import zhTWAion2Stats from "./locales/aion2stats/zh-TW.json";
import koAion2Stats from "./locales/aion2stats/ko.json";

import enSkills from "./locales/aion2skills/en.json";
import zhCNSkills from "./locales/aion2skills/zh-CN.json";
import zhTWSkills from "./locales/aion2skills/zh-TW.json";
import koSkills from "./locales/aion2skills/ko.json";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { ui: en, aion2skills: enSkills, aion2stats: enAion2Stats },
      "zh-CN": { ui: zhCN, aion2skills: zhCNSkills, aion2stats: zhCNAion2Stats },
      "zh-TW": { ui: zhTW, aion2skills: zhTWSkills, aion2stats: zhTWAion2Stats },
      ko: { ui: ko, aion2skills: koSkills, aion2stats: koAion2Stats },
    },
    defaultNS: "ui",
    ns: ["ui", "aion2skills", "aion2stats"],
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
