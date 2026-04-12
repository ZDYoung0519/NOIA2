import { promises as fs } from "node:fs";
import path from "node:path";

const targetRoot = process.argv[2] ?? "src-tauri/target";
const proxyPrefix = process.argv[3] ?? "https://gh-proxy.com/";

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(fullPath);
      }
      return [fullPath];
    })
  );

  return files.flat();
}

function toProxyUrl(url) {
  if (typeof url !== "string" || !url.startsWith("http")) {
    return url;
  }
  if (url.startsWith(proxyPrefix)) {
    return url;
  }
  return `${proxyPrefix}${url}`;
}

function rewriteManifest(manifest) {
  const next = structuredClone(manifest);

  if (next.platforms && typeof next.platforms === "object") {
    for (const platform of Object.values(next.platforms)) {
      if (platform && typeof platform === "object" && "url" in platform) {
        platform.url = toProxyUrl(platform.url);
      }
    }
  }

  if ("url" in next) {
    next.url = toProxyUrl(next.url);
  }

  return next;
}

async function main() {
  const allFiles = await walk(targetRoot);
  const latestFiles = allFiles.filter(
    (file) =>
      path.basename(file) === "latest.json" &&
      !file.endsWith("latest-proxy.json")
  );

  if (latestFiles.length === 0) {
    throw new Error(`No latest.json found under ${targetRoot}`);
  }

  const outputFiles = [];

  for (const file of latestFiles) {
    const raw = await fs.readFile(file, "utf8");
    const manifest = JSON.parse(raw.replace(/^\uFEFF/, ""));
    const rewritten = rewriteManifest(manifest);
    const outputPath = path.join(path.dirname(file), "latest-proxy.json");
    await fs.writeFile(outputPath, `${JSON.stringify(rewritten, null, 2)}\n`, "utf8");
    outputFiles.push(outputPath);
  }

  for (const file of outputFiles) {
    console.log(file);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
