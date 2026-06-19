import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { t, setLanguage } from "../../i18n.js";
import serversData from "../../data/servers.json";

// Server name lookup
const _serverMap = new Map(serversData.map((s) => [s.serverId, s.serverShortName]));
function getServerName(serverId) {
  return _serverMap.get(Number(serverId)) || serverId || "";
}

// =============================================================================
// Auto-resize window height based on player count
// =============================================================================
const BASE_WIDTH = 320;
const STORAGE_KEY = "app-config";
const DEFAULT_OVERLAY_CONFIG = {
  locked: false,
  alwaysOnTop: false,
  background: [0, 0, 0, 102],
  mainPlayerColor: [193, 81, 21, 204],
  otherPlayerColor: [46, 86, 142, 120],
  showPlayerName: true,
  showServer: true,
  showDamage: true,
  showDps: true,
  pctMode: "contribution",
  contentScale: 1,
  detailWindowMode: "follow",
  autoResizeHeight: true,
  damageFormat: "万/亿",
};
let lastHeight = 0;
let lastPlayerCount = 0;
let contentScale = 1;

function syncScaledOverlayLayout() {
  if (!$scaledOverlay || !$scaledOverlayInner) return;
  const scaledHeight = $scaledOverlayInner.offsetHeight * contentScale;
  $scaledOverlay.style.setProperty("--overlay-scaled-height", `${scaledHeight}px`);
}

function computeExpectedHeight() {
  const tbH = $titleBar ? $titleBar.offsetHeight : 0;
  const diagH = $diag?.textContent ? $diag.offsetHeight : 0;
  const bossH = lastBossVisible ? 30 : 0;
  const playersH = lastPlayerCount > 0 ? 3 + lastPlayerCount * 28 : 0;
  const contentPad = 8;
  const statusH = 22;
  return tbH + diagH + bossH + playersH + contentPad + statusH;
}

async function autoResize() {
  if (overlayConfig?.autoResizeHeight === false) return;
  syncScaledOverlayLayout();
  const h = computeExpectedHeight();
  if (Math.abs(h - lastHeight) > 5) {
    lastHeight = h;
    try {
      const win = getCurrentWindow();
      const currentSize = await win.innerSize();
      const scaleFactor = await win.scaleFactor();
      const w = currentSize.width / scaleFactor;
      await win.setSize(new LogicalSize(w, h));
    } catch (err) {
      console.error("[dps-overlay] autoResize failed:", err);
    }
  }
}

// =============================================================================
// DOM cache
// =============================================================================
const $playerList = document.getElementById("player-list");
const $diag = document.getElementById("diag-message");
const $titleBar = document.querySelector(".title-bar");
const $titleLabel = document.querySelector(".title-bar__label");
const $content = document.querySelector(".content");
const $statusPing = document.getElementById("status-ping");
const $statusDps = document.getElementById("status-team-dps");
const $statusFightTime = document.getElementById("status-fight-time");
const $statusBar = document.querySelector(".status-bar");
const $scaledOverlay = document.getElementById("scaled-overlay");
const $scaledOverlayInner = document.getElementById("scaled-overlay-inner");
const $pinBtn = document.getElementById("pin-btn");
const $bossRow = document.getElementById("boss-row");
const $bossRowBar = document.getElementById("boss-row-bar");
const $bossRowName = document.getElementById("boss-row-name");
const $bossRowHp = document.getElementById("boss-row-hp");
const $bossRowPct = document.getElementById("boss-row-pct");
const $bossRowIcon = document.getElementById("boss-row-icon");

// =============================================================================
// Overlay config (applied via CSS variables)
// =============================================================================
let mainActorName = null;
let overlayConfig = null;
let lastSnapshot = null;
let lastBossVisible = false;

function rgbaStr([r, g, b, a]) {
  return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
}

function clampContentScale(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(1.5, Math.max(0.7, n));
}

function updatePinButton() {
  const active = overlayConfig?.alwaysOnTop === true;
  $pinBtn.classList.toggle("is-active", active);
  $pinBtn.setAttribute("aria-pressed", active ? "true" : "false");
}

function persistOverlayConfigToLocalStorage(cfg) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const appConfig = JSON.parse(raw);
    appConfig.aion2 = appConfig.aion2 || {};
    appConfig.aion2.overlay = { ...(appConfig.aion2.overlay || {}), ...cfg };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appConfig));
  } catch (err) {
    console.error("[dps-overlay] persist overlay config failed:", err);
  }
}

function syncAlwaysOnTopToBackend(enabled) {
  invoke("set_dps_always_on_top", { enabled }).catch((err) => {
    console.error("[dps-overlay] sync always-on-top failed:", err);
  });
}

function syncLockedToBackend(locked) {
  invoke("set_dps_overlay_locked", { locked }).catch((err) => {
    console.error("[dps-overlay] sync locked failed:", err);
  });
}

async function setAlwaysOnTop(enabled) {
  const nextConfig = {
    ...DEFAULT_OVERLAY_CONFIG,
    ...(overlayConfig || {}),
    alwaysOnTop: enabled,
  };
  applyOverlayConfig(nextConfig);
  persistOverlayConfigToLocalStorage(nextConfig);
  try {
    await invoke("set_overlay_config", { value: nextConfig });
  } catch (err) {
    console.error("[dps-overlay] set always-on-top failed:", err);
  }
}

function applyOverlayConfig(cfg) {
  overlayConfig = { ...DEFAULT_OVERLAY_CONFIG, ...(cfg || {}) };
  const root = document.documentElement;
  const [r, g, b, a] = overlayConfig.background;
  contentScale = clampContentScale(overlayConfig.contentScale);
  root.style.setProperty("--overlay-content-scale", String(contentScale));
  root.style.setProperty("--overlay-bg", rgbaStr(overlayConfig.background));
  // Title bar: same RGB, slightly higher alpha for contrast
  root.style.setProperty(
    "--titlebar-bg",
    `rgba(${r},${g},${b},${Math.min(1, (a / 255) * 1.5).toFixed(2)})`
  );
  root.style.setProperty("--color-main-bar", rgbaStr(overlayConfig.mainPlayerColor));
  root.style.setProperty("--color-other-bar", rgbaStr(overlayConfig.otherPlayerColor));
  root.style.setProperty("--font-family", overlayConfig.fontFamily || "Consolas");
  updatePinButton();
  syncLockedToBackend(overlayConfig.locked === true);
  syncAlwaysOnTopToBackend(overlayConfig.alwaysOnTop === true);
  // Re-render existing rows immediately with new config
  if (lastSnapshot) {
    updatePlayerList(lastSnapshot);
  }
  autoResize();
}

// =============================================================================
// Drag & close
// =============================================================================
document.getElementById("drag-handle").addEventListener("mousedown", () => {
  getCurrentWindow().startDragging();
});
document.getElementById("close-btn").addEventListener("click", async () => {
  try {
    await getCurrentWindow().close();
  } catch (_) {
    /* ignore */
  }
});

$pinBtn.addEventListener("click", () => {
  setAlwaysOnTop(overlayConfig?.alwaysOnTop !== true);
});

document.getElementById("settings-btn").addEventListener("click", async () => {
  try {
    await invoke("create_dps_settings");
  } catch (_) {
    /* ignore */
  }
});

document.getElementById("reset-btn").addEventListener("click", async () => {
  try {
    await invoke("reset_dps_meter");
  } catch (_) {
    /* ignore */
  }
});

document.getElementById("history-btn").addEventListener("click", async () => {
  try {
    await invoke("create_dps_history");
  } catch (_) {
    /* ignore */
  }
});

function buildBattleReport(snap) {
  const players = snap.lastTargetAllPlayersOverviewStats || [];
  const targetInfo = snap.lastTargetInfo;
  const allDmg = players.reduce((s, p) => s + p.totalDamage, 0);
  const fightStart = targetInfo?.targetStartTime ? Math.min(...Object.values(targetInfo.targetStartTime)) : 0;
  const fightEnd = targetInfo?.targetLastTime ? Math.max(...Object.values(targetInfo.targetLastTime)) : 0;
  const dur = Math.max(0, fightEnd - fightStart);
  const teamDps = dur > 0 ? allDmg / dur : 0;

  const fmtDmg = (n) => (n >= 1e8 ? (n / 1e8).toFixed(2) + "e" : n >= 1e4 ? (n / 1e4).toFixed(1) + "w" : String(n));
  const fmtTime = (s) => { const m = Math.floor(s / 60), sec = Math.floor(s % 60); return m + "m" + String(sec).padStart(2, "0") + "s"; };

  let report = `战斗时长：${fmtTime(dur)}，总计伤害：${fmtDmg(allDmg)}，秒伤：${Math.round(teamDps).toLocaleString("en-US")}\n`;
  const classes = ["剑星", "守护星", "杀星", "弓星", "魔道星", "精灵星", "治愈星", "护法星"];
  const classMap = { GLADIATOR: "剑星", TEMPLAR: "守护星", ASSASSIN: "杀星", RANGER: "弓星", SORCERER: "魔道星", ELEMENTALIST: "精灵星", CLERIC: "治愈星", CHANTER: "护法星" };
  for (const cls of classes) {
    const p = players.find((p) => classMap[p.actorClass] === cls);
    if (!p) continue;
    report += `${cls}：${p.actorName || "ID:" + p.actorId}，总计伤害：${fmtDmg(p.totalDamage)}，秒伤：${Math.round(p.dps).toLocaleString("en-US")}\n`;
  }
  report += `\n数据来源 NoiA2，Bilibili搜索作者【燃烧的浅蓝】`;
  return report;
}

document.getElementById("copy-report-btn").addEventListener("click", async () => {
  if (!lastSnapshot) return;
  const report = buildBattleReport(lastSnapshot);
  try {
    await navigator.clipboard.writeText(report);
    invoke("show_system_notification", {
      title: "NoiA2",
      body: "战斗数据已经复制到粘贴板",
    }).catch(() => {});
  } catch (_) {
    /* ignore */
  }
});

// =============================================================================
// Diagnostic messages (checked in priority order)
// =============================================================================
const DIAG_MESSAGES = [
  { key: "npcapAvailable", i18n: "dps-overlay.diagNpcap" },
  { key: "meterRunning", i18n: "dps-overlay.diagMeter" },
  { key: "hasGameData", i18n: "dps-overlay.diagGameData" },
  { key: "playerIdentified", i18n: "dps-overlay.diagPlayerId" },
];

async function runDiagnostic() {
  try {
    const state = await invoke("check_dps_meter_state");
    for (const diag of DIAG_MESSAGES) {
      if (!state[diag.key]) {
        $diag.textContent = t(diag.i18n);
        return false;
      }
    }
    $diag.textContent = "";
    return true;
  } catch (err) {
    console.error("[dps-overlay] diagnostic failed:", err);
    $diag.textContent = "Diagnostic error — check console";
    return false;
  }
}

// =============================================================================
// Formatters
// =============================================================================
function fmtDamage(n) {
  if (n == null || n === 0) return "--";
  if (overlayConfig?.damageFormat === "万/亿") return fmtDamageZh(n);
  // K/M/B
  if (n < 10_000) return String(n);
  if (n < 1_000_000) return (n / 1_000).toFixed(1) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + "M";
  return (n / 1_000_000_000).toFixed(2) + "B";
}

function fmtDamageZh(n) {
  if (n < 10_000) return String(n);
  if (n < 100_000_000) return (n / 10_000).toFixed(1) + "w";
  return (n / 100_000_000).toFixed(2) + "e";
}

function fmtDps(n) {
  if (n == null || n === 0) return "--";
  return Math.round(n).toLocaleString("en-US");
}

function maskName(name) {
  if (!overlayConfig?.maskNicknames) return name;
  const t = (name || "").trim();
  if (t.length <= 1) return t ? "*" : "";
  if (t.length === 2) return t[0] + "*";
  return t[0] + "*".repeat(t.length - 2) + t[t.length - 1];
}

function fmtShare(n) {
  if (n == null) return "--";
  const pct = n * 100;
  if (pct >= 99.95) return "100%";
  return pct.toFixed(1) + "%";
}

function fmtHpPct(currentHp, maxHp) {
  if (!Number.isFinite(currentHp) || !Number.isFinite(maxHp) || maxHp <= 0) return "--";
  const pct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
  if (pct >= 99.95) return "100%";
  return pct.toFixed(1) + "%";
}

function fmtDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "--";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getObjectValues(obj) {
  return Object.values(obj || {})
    .map(Number)
    .filter(Number.isFinite);
}

function getLastTargetInfo(snap) {
  if (snap.lastTargetInfo) return snap.lastTargetInfo;
  const targetId = snap.combatInfos?.lastTarget;
  if (targetId == null) return null;
  return (
    snap.combatInfos?.targetInfos?.[targetId] ??
    snap.combatInfos?.targetInfos?.[String(targetId)] ??
    null
  );
}

function getTeamBattleDuration(targetInfo) {
  const startTimes = getObjectValues(targetInfo?.targetStartTime);
  const lastTimes = getObjectValues(targetInfo?.targetLastTime);
  if (startTimes.length === 0 || lastTimes.length === 0) return 0;
  const start = Math.min(...startTimes);
  const end = Math.max(...lastTimes);
  return Math.max(0, end - start);
}

// =============================================================================
// Class icon
// =============================================================================
const CLASS_ICON_PATH = "/aion2/class/";

function getClassIcon(actorClass) {
  if (!actorClass) return "";
  return CLASS_ICON_PATH + actorClass.toLowerCase() + ".png";
}

// =============================================================================
// State: last rendered strings (avoid redundant DOM writes)
// =============================================================================

// =============================================================================
// Render: overview stats
// =============================================================================
function updateOverview(snap) {
  const players = snap.lastTargetAllPlayersOverviewStats;
  const targetInfo = getLastTargetInfo(snap);
  let totalDps = 0;
  if (players) {
    for (let i = 0; i < players.length; i++) {
      totalDps += players[i].dps ?? 0;
    }
  }
  $statusDps.textContent = fmtDps(totalDps);
  $statusFightTime.textContent = fmtDuration(getTeamBattleDuration(targetInfo));
  updateBossRow(targetInfo);
}

function updateBossRow(targetInfo) {
  const hasTarget = targetInfo != null;
  const showBossBar = hasTarget && overlayConfig?.showBossHp !== false;

  if (!hasTarget) {
    $titleLabel.textContent = "NoiA METER";
    $bossRow.style.display = "none";
    if (lastBossVisible) {
      lastBossVisible = false;
      autoResize();
    }
    return;
  }

  // Title always follows boss name regardless of HP bar setting
  const name = targetInfo.targetName || `Target ${targetInfo.id ?? ""}`.trim();
  $titleLabel.textContent = name;

  // Boss HP bar visibility is controlled by showBossHp setting
  $bossRow.style.display = showBossBar ? "" : "none";

  if (!showBossBar) {
    if (lastBossVisible) {
      lastBossVisible = false;
      autoResize();
    }
    return;
  }

  const currentHp = Number(targetInfo.currentHp ?? 0);
  const maxHp = Number(targetInfo.maxHp ?? 0);
  const hpScale =
    Number.isFinite(currentHp) && Number.isFinite(maxHp) && maxHp > 0
      ? Math.max(0, Math.min(1, currentHp / maxHp))
      : 0;
  const hpText =
    Number.isFinite(maxHp) && maxHp > 0
      ? `${fmtDamage(currentHp)} / ${fmtDamage(maxHp)}`
      : "-- / --";

  $bossRowName.textContent = maskName(name);
  $bossRowHp.textContent = hpText;
  $bossRowPct.textContent = fmtHpPct(currentHp, maxHp);
  $bossRowBar.style.setProperty("--bar-scale", hpScale);

  if (!lastBossVisible) {
    lastBossVisible = true;
    autoResize();
  }
}

// =============================================================================
// Player list — pre-allocated rows with diff/minimal DOM writes
// =============================================================================
const MAX_ROWS = 10;
const playerRows = new Map(); // actorId → { row, cells }
const rowPool = []; // pre-built hidden rows for reuse
let rowTemplate = null;

function buildRowTemplate() {
  // bar
  const bar = document.createElement("div");
  bar.className = "player-row__bar";

  // content wrapper (z-10)
  const content = document.createElement("div");
  content.className = "player-row__content";

  // -- left group --
  const left = document.createElement("div");
  left.className = "player-row__left";

  const iconWrap = document.createElement("div");
  iconWrap.className = "player-row__icon-wrap";

  const icon = document.createElement("img");
  icon.className = "player-row__icon";
  icon.alt = "";
  icon.addEventListener("error", () => {
    icon.style.display = "none";
  });
  icon.addEventListener("contextmenu", (e) => e.preventDefault());
  iconWrap.appendChild(icon);

  const nameWrap = document.createElement("div");
  nameWrap.className = "player-row__name-wrap";

  const nameEl = document.createElement("span");
  nameEl.className = "player-row__name";
  const serverEl = document.createElement("span");
  serverEl.className = "player-row__server";
  nameWrap.appendChild(nameEl);
  nameWrap.appendChild(serverEl);

  left.appendChild(iconWrap);
  left.appendChild(nameWrap);

  // -- right group --
  const right = document.createElement("div");
  right.className = "player-row__right";

  const damage = document.createElement("span");
  damage.className = "player-row__damage";

  const dpsWrap = document.createElement("span");
  dpsWrap.className = "player-row__dps";
  // dps value + /s unit are separate text nodes so we only update the value
  const dpsVal = document.createTextNode("");
  dpsWrap.appendChild(dpsVal);
  const dpsUnit = document.createElement("span");
  dpsUnit.className = "player-row__dps-unit";
  dpsUnit.textContent = "/s";
  dpsWrap.appendChild(dpsUnit);

  const share = document.createElement("span");
  share.className = "player-row__share";

  right.appendChild(damage);
  right.appendChild(dpsWrap);
  right.appendChild(share);

  content.appendChild(left);
  content.appendChild(right);

  const row = document.createElement("div");
  row.className = "player-row";
  row.style.display = "none";
  row.appendChild(bar);
  row.appendChild(content);

  rowTemplate = {
    row,
    bar,
    icon,
    nameEl,
    serverEl,
    damage,
    dpsVal,
    share,
  };
}

function getRow() {
  if (rowPool.length > 0) return rowPool.pop();
  if (!rowTemplate) buildRowTemplate();
  const t = rowTemplate;
  return {
    row: t.row.cloneNode(true),
    bar: null, // filled below
    icon: null,
    nameEl: null,
    serverEl: null,
    damage: null,
    dpsVal: null,
    share: null,
  };
}

function populateRowRefs(raw) {
  // Direct child access (more reliable than querySelector on detached clones)
  const bar = raw.row.children[0];
  const content = raw.row.children[1];
  const left = content.children[0];
  const right = content.children[1];

  const iconWrap = left.children[0];
  const icon = iconWrap.children[0];
  const nameWrap = left.children[1];
  const nameEl = nameWrap.children[0];
  const serverEl = nameWrap.children[1];

  const damage = right.children[0];
  const dpsWrap = right.children[1];
  const share = right.children[2];
  const dpsVal = dpsWrap.firstChild;

  // Re-attach listeners lost during cloneNode
  icon.addEventListener("error", () => {
    icon.style.display = "none";
  });
  icon.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    row: raw.row,
    cells: {
      bar,
      icon,
      nameEl,
      serverEl,
      damage,
      dpsVal,
      share,
      _barScale: -1,
      _iconSrc: "",
      _nameRaw: "",
      _serverRaw: "",
      _damageRaw: "",
      _dpsRaw: "",
      _shareRaw: "",
    },
  };
}

function createPlayerRow(p) {
  const raw = getRow();
  const entry = populateRowRefs(raw);
  const c = entry.cells;

  // Icon
  const iconSrc = getClassIcon(p.actorClass);
  if (iconSrc) {
    c.icon.src = iconSrc;
    c.icon.style.display = "";
  } else {
    c.icon.style.display = "none";
  }
  c._iconSrc = iconSrc;

  // Show row
  entry.row.style.display = "";

  return entry;
}

function updatePlayerRow(entry, p, maxDamage) {
  const c = entry.cells;

  // Background bar — GPU-composited via CSS var on ::after
  const barScale = maxDamage > 0 ? p.totalDamage / maxDamage : 0;
  if (barScale !== c._barScale) {
    c.bar.style.setProperty("--bar-scale", barScale);
    c._barScale = barScale;
  }

  // Icon
  const iconSrc = getClassIcon(p.actorClass);
  if (iconSrc !== c._iconSrc) {
    if (iconSrc) {
      c.icon.src = iconSrc;
      c.icon.style.display = "";
    } else {
      c.icon.style.display = "none";
    }
    c._iconSrc = iconSrc;
  }

  const cfg = overlayConfig || {};

  // Name
  if (cfg.showPlayerName !== false) {
    const nameText = p.actorName || `ID:${p.actorId}`;
    if (nameText !== c._nameRaw) {
      c.nameEl.textContent = maskName(nameText);
      c._nameRaw = nameText;
    }
    c.nameEl.style.display = "";
  } else {
    c.nameEl.style.display = "none";
  }

  // Server
  if (cfg.showServer !== false) {
    const serverText = getServerName(p.actorServerId);
    if (serverText !== c._serverRaw) {
      c.serverEl.textContent = serverText;
      c._serverRaw = serverText;
    }
    c.serverEl.style.display = "";
  } else {
    c.serverEl.style.display = "none";
  }

  // Damage
  if (cfg.showDamage !== false) {
    const dmgText = fmtDamage(p.totalDamage);
    if (dmgText !== c._damageRaw) {
      c.damage.textContent = dmgText;
      c._damageRaw = dmgText;
    }
    c.damage.style.display = "";
  } else {
    c.damage.style.display = "none";
  }

  // DPS
  if (cfg.showDps !== false) {
    const dpsText = fmtDps(p.dps);
    if (dpsText !== c._dpsRaw) {
      c.dpsVal.textContent = dpsText;
      c._dpsRaw = dpsText;
    }
    c.dpsVal.parentElement.style.display = "";
  } else {
    c.dpsVal.parentElement.style.display = "none";
  }

  // Percentage (contribution or share based on pctMode)
  const pctValue = cfg.pctMode === "share" ? p.damageShare : p.damageContribution;
  const shareText = fmtShare(pctValue);
  if (shareText !== c._shareRaw) {
    c.share.textContent = shareText;
    c._shareRaw = shareText;
  }
}

function updatePlayerList(snap, fullRebuild) {
  const players = snap.lastTargetAllPlayersOverviewStats;

  // Track main actor for .is-main class
  mainActorName = snap.combatInfos?.mainActorName ?? null;

  // Full rebuild: clear everything
  if (fullRebuild) {
    for (const [, entry] of playerRows) {
      entry.row.remove();
      rowPool.push(entry.row);
    }
    playerRows.clear();
  }

  // Toggle has-players based on player count (backend already filtered)
  if (players && players.length > 0) {
    document.body.classList.add("has-players");
  } else {
    document.body.classList.remove("has-players");
  }

  // Hide all rows when no players
  if (!players || players.length === 0) {
    for (const [, entry] of playerRows) {
      entry.row.style.display = "none";
      rowPool.push(entry.row);
    }
    playerRows.clear();
    if (lastPlayerCount !== 0) {
      lastPlayerCount = 0;
      autoResize();
    }
    return;
  }

  // Trigger autoResize only when player count changes
  if (players.length !== lastPlayerCount) {
    lastPlayerCount = players.length;
    autoResize();
  }

  // Max totalDamage for background bar scaling
  let maxDamage = 0;
  for (let i = 0; i < players.length; i++) {
    if (players[i].totalDamage > maxDamage) maxDamage = players[i].totalDamage;
  }

  const seen = new Set();

  for (let i = 0; i < players.length; i++) {
    const p = players[i];

    seen.add(p.actorId);

    let entry = playerRows.get(p.actorId);
    if (!entry) {
      entry = createPlayerRow(p);
      playerRows.set(p.actorId, entry);
    }
    updatePlayerRow(entry, p, maxDamage);

    // Mark main player row + attach actorId for click handler
    const isMain = mainActorName != null && p.actorName === mainActorName;
    entry.row.classList.toggle("is-main", isMain);
    entry.row.dataset.actorId = p.actorId;

    // Move row to correct position if needed
    const target = $playerList.children[i];
    if (target !== entry.row) {
      $playerList.insertBefore(entry.row, target || null);
    }
  }

  // Hide stale rows (players who left combat)
  for (const [id, entry] of playerRows) {
    if (!seen.has(id)) {
      entry.row.style.display = "none";
      rowPool.push(entry.row);
      playerRows.delete(id);
    }
  }

}

// =============================================================================
// Init
// =============================================================================
(async function init() {
  // Pull initial overlay config from Rust store (avoids race with event timing)
  try {
    const cfg = await invoke("get_overlay_config");
    if (cfg && Object.keys(cfg).length > 0) {
      applyOverlayConfig(cfg);
    }
  } catch (e) {
    console.error("[dps-overlay] get_overlay_config failed:", e);
  }

  // Listen for subsequent overlay config changes
  listen("overlay-config-changed", (event) => {
    applyOverlayConfig(event.payload);
  });

  // Diagnostic polling
  let allOk = await runDiagnostic();
  if (!allOk) {
    const poll = setInterval(async () => {
      allOk = await runDiagnostic();
      if (allOk) {
        clearInterval(poll);
        autoResize();
      }
    }, 2000);
  } else {
    autoResize();
  }

  // Initial resize to fit current content
  autoResize();

  // Pull language + config on startup
  try {
    const lang = await invoke("get_language");
    setLanguage(lang);
  } catch (_) {
    /* ignore */
  }

  // Lock toggle — show/hide title bar based on Rust state
  listen("overlay-lock-toggled", (event) => {
    const locked = event.payload?.locked ?? false;
    const titleBar = document.querySelector(".title-bar");
    if (titleBar) {
      titleBar.style.display = locked ? "none" : "";
    }
    document.body.style.pointerEvents = locked ? "none" : "";
    if (!locked && titleBar) {
      titleBar.style.pointerEvents = "auto";
    }
    autoResize();
  });

  // Language sync
  listen("language-changed", (event) => {
    setLanguage(event.payload.language);
    runDiagnostic();
  });

  try {
    // Memory / ping status
    const $pingIcon = $statusPing?.previousElementSibling;
    listen("dps-memory", (event) => {
      const d = event.payload;
      if (d.pingMs != null) {
        const ping = Math.round(d.pingMs);
        $statusPing.textContent = `${ping} ms`;
        let cls = "status-bar__ping ";
        if (ping < 60) {
          cls += "good";
        } else if (ping <= 120) {
          cls += "warn";
        } else {
          cls += "bad";
        }
        $statusPing.className = cls;
        if ($pingIcon) {
          $pingIcon.style.color = ping < 60 ? "#4ade80" : ping <= 120 ? "#facc15" : "#ef4444";
        }
      }
    });

    await listen("dps-snapshot", (event) => {
      const snap = event.payload;
      lastSnapshot = snap;
      updateOverview(snap);
      updatePlayerList(snap);
    });
  } catch (err) {
    console.error("[dps-overlay] listen failed:", err);
    $diag.textContent = "Event listener error — check console";
  }

  // Player row click → open detail window
  $playerList.addEventListener("click", async (e) => {
    const row = e.target.closest(".player-row");
    if (!row) return;
    const actorId = Number(row.dataset.actorId);
    if (!actorId) return;

    try {
      await invoke("set_detail_selection", {
        value: { actorId, mode: "live" },
      });
      await invoke("create_dps_detail");
      await emit("select-player-detail", payload);
    } catch (_) {
      /* ignore */
    }
  });
})();
