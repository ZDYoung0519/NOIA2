import en from "@/i18n/locales/aion2overlay/en.json";
import zhCN from "@/i18n/locales/aion2overlay/zh-CN.json";
import zhTW from "@/i18n/locales/aion2overlay/zh-TW.json";
import ko from "@/i18n/locales/aion2overlay/ko.json";

const LOCALES = { en, "zh-CN": zhCN, "zh-TW": zhTW, ko };
let lang = "zh-CN";

export function t(key, params) {
  let val = key.split(".").reduce((o, k) => o?.[k], LOCALES[lang]) ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      val = val.replaceAll(`{{${k}}}`, String(v));
    }
  }
  return val;
}

export function setLanguage(l) {
  lang = Object.hasOwn(LOCALES, l) ? l : "zh-CN";
}

export function getLanguage() {
  return lang;
}
