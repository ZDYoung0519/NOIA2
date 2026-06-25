import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const $content = document.getElementById("log-content");
const $search = document.getElementById("search-input");
const $debugToggle = document.getElementById("debug-toggle");
const $copyAllBtn = document.getElementById("copy-all-btn");
const MAX_LINES = 500;

let logLines = [];

document.getElementById("close-btn").addEventListener("click", async () => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  try {
    await getCurrentWindow().close();
  } catch (_) {}
});

document.getElementById("clear-btn").addEventListener("click", () => {
  logLines = [];
  $content.innerHTML = `<div class="log-empty">Cleared</div>`;
});

$copyAllBtn.addEventListener("click", () => {
  copyText(logLines.map(formatLogLine).join("\n"));
});

$debugToggle.addEventListener("change", async () => {
  const enabled = $debugToggle.checked;
  $debugToggle.disabled = true;
  try {
    $debugToggle.checked = await invoke("set_app_logger_debug_enabled", { enabled });
  } catch (_) {
    $debugToggle.checked = !enabled;
  } finally {
    $debugToggle.disabled = false;
  }
});

function render() {
  const filter = ($search.value || "").toLowerCase();
  let html = "";
  for (const [index, line] of logLines.entries()) {
    if (filter && !line.text.toLowerCase().includes(filter)) continue;
    const level = String(line.level || "").toLowerCase();
    html += `<div class="log-line">
      <span class="log-line__time">${line.time}</span>
      <span class="log-line__level ${level}">${level.toUpperCase()}</span>
      <span class="log-line__msg">${esc(line.text)}</span>
      <button class="log-line__copy" data-copy-index="${index}" title="Copy this log">Copy</button>
    </div>`;
  }
  $content.innerHTML =
    html || `<div class="log-empty">${filter ? "No matches" : "Waiting for log events..."}</div>`;
  $content.scrollTop = $content.scrollHeight;
}

$search.addEventListener("input", render);
$content.addEventListener("click", (event) => {
  const copyButton = event.target.closest("[data-copy-index]");
  if (!copyButton) return;

  const line = logLines[Number(copyButton.dataset.copyIndex)];
  if (!line) return;

  copyText(formatLogLine(line));
});

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

function formatLogLine(line) {
  return `${line.time} ${String(line.level || "").toUpperCase()} ${line.text || ""}`;
}

async function copyText(text) {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

listen("app-logger", (event) => {
  const { level, message, timestamp } = event.payload;
  logLines.push({
    time: fmtTime(timestamp),
    level: String(level || "").toLowerCase(),
    text: message,
  });
  if (logLines.length > MAX_LINES) logLines.shift();
  render();
});

async function initDebugToggle() {
  try {
    $debugToggle.checked = await invoke("get_app_logger_debug_enabled");
  } catch (_) {
    $debugToggle.checked = false;
  }
}

initDebugToggle();

// Footer: capture info from dps-memory
listen("dps-memory", (event) => {
  const d = event.payload;
  document.getElementById("footer-device").textContent = d.capDevice || "--";
  document.getElementById("footer-port").textContent = d.capPort || "--";
  const sizes = d.packetSizes || {};
  const parts = Object.entries(sizes).map(([k, v]) => `${k}:${v}`);
  document.getElementById("footer-sizes").textContent = parts.length ? parts.join(" ") : "";
});
