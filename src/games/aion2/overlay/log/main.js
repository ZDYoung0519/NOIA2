import { listen } from "@tauri-apps/api/event";

const $content = document.getElementById("log-content");
const $search = document.getElementById("search-input");
const $empty = document.querySelector(".log-empty");
const MAX_LINES = 500;

let logLines = [];

document.getElementById("close-btn").addEventListener("click", async () => {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  try { await getCurrentWindow().close(); } catch (_) {}
});

document.getElementById("clear-btn").addEventListener("click", () => {
  logLines = [];
  $content.innerHTML = `<div class="log-empty">Cleared</div>`;
});

function render() {
  const filter = ($search.value || "").toLowerCase();
  let html = "";
  for (const line of logLines) {
    if (filter && !line.text.toLowerCase().includes(filter)) continue;
    html += `<div class="log-line">
      <span class="log-line__time">${line.time}</span>
      <span class="log-line__level ${line.level}">${line.level.toUpperCase()}</span>
      <span class="log-line__msg">${esc(line.text)}</span>
    </div>`;
  }
  $content.innerHTML = html || `<div class="log-empty">${filter ? "No matches" : "Waiting for log events..."}</div>`;
  $content.scrollTop = $content.scrollHeight;
}

$search.addEventListener("input", render);

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s || "";
  return d.innerHTML;
}

function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

listen("dps-logger", (event) => {
  const { level, message, timestamp } = event.payload;
  logLines.push({ time: fmtTime(timestamp), level, text: message });
  if (logLines.length > MAX_LINES) logLines.shift();
  render();
});

// Footer: capture info from dps-memory
listen("dps-memory", (event) => {
  const d = event.payload;
  document.getElementById("footer-device").textContent = d.capDevice || "--";
  document.getElementById("footer-port").textContent = d.capPort || "--";
  const sizes = d.packetSizes || {};
  const parts = Object.entries(sizes).map(([k, v]) => `${k}:${v}`);
  document.getElementById("footer-sizes").textContent = parts.length ? parts.join(" ") : "";
});
