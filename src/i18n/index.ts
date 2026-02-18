import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import Backend from "i18next-http-backend";

// 获取 localStorage 中保存的语言（如果存在），用于后备语言
const savedLocale = localStorage.getItem("locale") || "zh-CN";

i18n
  // 使用 HTTP 后端加载资源
  .use(Backend)
  // 自动检测用户语言
  .use(LanguageDetector)
  // 传递给 react-i18next
  .use(initReactI18next)
  .init({
    // 后备语言：如果检测到的语言没有对应资源，则使用此语言
    fallbackLng: savedLocale,
    // 默认语言（如果检测器未设置，则使用此值）
    lng: savedLocale,
    // 调试模式，开发时可开启
    debug: process.env.NODE_ENV === "development",
    // 命名空间配置
    ns: ["aion2skills", "aion2stats"],
    defaultNS: "aion2skills", // 默认命名空间
    // 后端加载配置
    backend: {
      // 资源加载路径，支持动态插入 {{lng}} 和 {{ns}}
      loadPath: "/locales/{{lng}}/{{ns}}.json",
    },
    // 语言检测器配置（可选）
    detection: {
      // 优先从 localStorage 读取
      order: ["localStorage", "navigator"],
      // 缓存用户语言到 localStorage
      caches: ["localStorage"],
      lookupLocalStorage: "locale", // 与你的 localStorage key 对应
    },
    interpolation: {
      escapeValue: false, // react 已默认转义
    },
    // 防止在开发时多次加载同一资源
    react: {
      useSuspense: false, // 如果不想用 Suspense 可设为 false，但建议保持默认 true 并使用 Suspense
    },
  });

export default i18n;
