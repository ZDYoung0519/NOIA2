export type LocalizedText = string | Partial<Record<"zh-CN" | "zh-TW" | "en" | "ko", string>>;

export function normalizeLocale(locale: string | undefined | null) {
  if (!locale) {
    return "en";
  }

  if (locale === "zh" || locale.startsWith("zh-CN")) {
    return "zh-CN";
  }
  if (locale.startsWith("zh-TW") || locale.startsWith("zh-HK")) {
    return "zh-TW";
  }
  if (locale.startsWith("ko")) {
    return "ko";
  }
  return "en";
}

export function getLocalizedText(
  value: LocalizedText | undefined,
  locale: string | undefined | null,
  fallbackLocale = "en"
) {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  const normalizedLocale = normalizeLocale(locale);
  return (
    value[normalizedLocale as keyof typeof value] ??
    value[fallbackLocale as keyof typeof value] ??
    value["en"] ??
    Object.values(value).find((entry) => typeof entry === "string" && entry.length > 0) ??
    ""
  );
}
