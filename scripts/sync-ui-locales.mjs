import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT_DIR = process.cwd();
const UI_LOCALES_DIR = path.join(ROOT_DIR, "src", "i18n", "locales", "ui");
const SOURCE_LOCALE = "en";
const TARGET_LOCALES = ["zh-CN", "zh-TW", "ko"];

const args = new Set(process.argv.slice(2));
const shouldRemoveExtra = args.has("--remove-extra");
const useTranslationApi = args.has("--translate");

const translationConfig = {
  url: process.env.TRANSLATE_API_URL ?? "",
  apiKey: process.env.TRANSLATE_API_KEY ?? "",
  model: process.env.TRANSLATE_API_MODEL ?? "libretranslate",
};

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(filePath, content, "utf8");
}

function collectMissingLeafEntries(sourceNode, targetNode, basePath = "") {
  const missing = [];

  if (!isPlainObject(sourceNode)) {
    return missing;
  }

  const safeTargetNode = isPlainObject(targetNode) ? targetNode : {};

  for (const [key, sourceValue] of Object.entries(sourceNode)) {
    const currentPath = basePath ? `${basePath}.${key}` : key;
    const targetValue = safeTargetNode[key];

    if (isPlainObject(sourceValue)) {
      missing.push(...collectMissingLeafEntries(sourceValue, targetValue, currentPath));
      continue;
    }

    if (targetValue === undefined) {
      missing.push({
        path: currentPath,
        sourceText: sourceValue,
      });
    }
  }

  return missing;
}

function setDeepValue(target, dottedPath, value) {
  const segments = dottedPath.split(".");
  let cursor = target;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    if (!isPlainObject(cursor[segment])) {
      cursor[segment] = {};
    }
    cursor = cursor[segment];
  }

  cursor[segments[segments.length - 1]] = value;
}

function syncLocaleTree(sourceNode, targetNode, options = {}) {
  if (!isPlainObject(sourceNode)) {
    return targetNode === undefined ? sourceNode : targetNode;
  }

  const nextTarget = isPlainObject(targetNode) ? { ...targetNode } : {};

  for (const [key, sourceValue] of Object.entries(sourceNode)) {
    if (isPlainObject(sourceValue)) {
      nextTarget[key] = syncLocaleTree(sourceValue, nextTarget[key], options);
      continue;
    }

    if (nextTarget[key] === undefined) {
      nextTarget[key] = sourceValue;
    }
  }

  if (options.removeExtra) {
    for (const key of Object.keys(nextTarget)) {
      if (!(key in sourceNode)) {
        delete nextTarget[key];
      }
    }
  }

  return nextTarget;
}

async function translateTexts(entries, targetLocale) {
  if (!entries.length) {
    return new Map();
  }

  if (!useTranslationApi) {
    return new Map(entries.map((entry) => [entry.path, entry.sourceText]));
  }

  if (!translationConfig.url) {
    throw new Error(
      "Missing TRANSLATE_API_URL. Set it before using --translate, or run without --translate."
    );
  }

  const translated = new Map();

  for (const entry of entries) {
    const response = await fetch(translationConfig.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(translationConfig.apiKey
          ? {
              Authorization: `Bearer ${translationConfig.apiKey}`,
            }
          : {}),
      },
      body: JSON.stringify({
        q: entry.sourceText,
        source: SOURCE_LOCALE,
        target: targetLocale,
        format: "text",
        model: translationConfig.model,
      }),
    });

    if (!response.ok) {
      throw new Error(`Translation request failed for ${entry.path}: ${response.status}`);
    }

    const data = await response.json();
    const text =
      data.translatedText ??
      data.translation ??
      data.text ??
      data.output ??
      entry.sourceText;

    translated.set(entry.path, text);
  }

  return translated;
}

async function main() {
  const sourcePath = path.join(UI_LOCALES_DIR, `${SOURCE_LOCALE}.json`);
  const sourceLocale = await readJson(sourcePath);

  for (const locale of TARGET_LOCALES) {
    const targetPath = path.join(UI_LOCALES_DIR, `${locale}.json`);
    const targetLocale = await readJson(targetPath);

    const nextLocale = syncLocaleTree(sourceLocale, targetLocale, {
      removeExtra: shouldRemoveExtra,
    });

    const missingEntries = collectMissingLeafEntries(sourceLocale, targetLocale);
    const translations = await translateTexts(missingEntries, locale);

    for (const [entryPath, value] of translations.entries()) {
      setDeepValue(nextLocale, entryPath, value);
    }

    await writeJson(targetPath, nextLocale);

    console.log(
      `[sync-ui-locales] ${locale}: added ${missingEntries.length} missing entries${shouldRemoveExtra ? ", removed extras" : ""}`
    );
  }
}

main().catch((error) => {
  console.error("[sync-ui-locales] failed:", error);
  process.exitCode = 1;
});
