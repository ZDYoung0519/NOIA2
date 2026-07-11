import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import serversData from "../../data/servers.json";

const DEFAULT_OVERLAY_CONFIG = {
  background: [0, 0, 0, 102],
  mainPlayerColor: [193, 81, 21, 204],
  otherPlayerColor: [46, 86, 142, 120],
  fontFamily: "Consolas",
  showPlayerName: true,
  showServer: false,
  showDamage: true,
  showDps: true,
  pctMode: "share",
  damageFormat: "万/亿",
};

const CLASS_ICON_PATH = "/aion2/class/";
const STORAGE_KEY = "app-config";
const WATCH_NAMES_STORAGE_KEY = "aion2-pvp-watch-names";
const WATCH_POLL_MS = 500;
const serverMap = new Map(serversData.map((s) => [s.serverId, s.serverShortName]));
const playerList = document.getElementById("pvp-player-list");
const watchForm = document.getElementById("player-hp-form");
const watchInput = document.getElementById("player-hp-input");
const watchSuggestions = document.getElementById("player-hp-suggestions");
const watchList = document.getElementById("player-hp-list");
const combatStatsList = document.getElementById("pvp-combat-stats-list");
const combatStatsEmpty = document.getElementById("pvp-combat-stats-empty");
const combatStatsClear = document.getElementById("pvp-stats-clear");
const combatStatsSortDamage = document.getElementById("pvp-sort-damage");
const combatStatsSortKills = document.getElementById("pvp-sort-kills");
let overlayConfig = { ...DEFAULT_OVERLAY_CONFIG };
let lastSnapshot = null;
let watchNames = loadWatchNames();
let knownPlayersKey = "";
let combatStatsRows = [];
let combatStatsSort = "damage";

function getServerName(serverId) {
  return serverMap.get(Number(serverId)) || serverId || "";
}

function rgbaStr([r, g, b, a]) {
  return `rgba(${r},${g},${b},${(a / 255).toFixed(2)})`;
}

function applyOverlayConfig(cfg) {
  overlayConfig = { ...DEFAULT_OVERLAY_CONFIG, ...(cfg || {}) };
  const root = document.documentElement;
  const [r, g, b, a] = overlayConfig.background;
  root.style.setProperty("--overlay-bg", rgbaStr(overlayConfig.background));
  root.style.setProperty(
    "--titlebar-bg",
    `rgba(${r},${g},${b},${Math.min(1, (a / 255) * 1.5).toFixed(2)})`
  );
  root.style.setProperty("--color-main-bar", rgbaStr(overlayConfig.mainPlayerColor));
  root.style.setProperty("--color-other-bar", rgbaStr(overlayConfig.otherPlayerColor));
  root.style.setProperty("--font-family", overlayConfig.fontFamily || "Consolas");
}

function hasConfigValue(cfg) {
  return cfg != null && typeof cfg === "object" && Object.keys(cfg).length > 0;
}

function fmtDamage(n) {
  if (n == null || n === 0) return "--";
  if (overlayConfig.damageFormat === "万/亿") {
    if (n < 10_000) return String(n);
    if (n < 100_000_000) return (n / 10_000).toFixed(1) + "w";
    return (n / 100_000_000).toFixed(2) + "e";
  }
  if (n < 10_000) return String(n);
  if (n < 1_000_000) return (n / 1_000).toFixed(1) + "K";
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + "M";
  return (n / 1_000_000_000).toFixed(2) + "B";
}

function fmtDps(n) {
  if (n == null || n === 0) return "--";
  return Math.round(n).toLocaleString("en-US");
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

function maskName(name) {
  if (!overlayConfig.maskNicknames) return name;
  const text = (name || "").trim();
  if (text.length <= 1) return text ? "*" : "";
  if (text.length === 2) return text[0] + "*";
  return text[0] + "*".repeat(text.length - 2) + text[text.length - 1];
}

function getClassIcon(actorClass) {
  if (!actorClass) return "";
  return CLASS_ICON_PATH + actorClass.toLowerCase() + ".png";
}

function loadWatchNames() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WATCH_NAMES_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === "string") : [];
  } catch (_) {
    return [];
  }
}

function saveWatchNames() {
  localStorage.setItem(WATCH_NAMES_STORAGE_KEY, JSON.stringify(watchNames));
}

async function disablePvpMode() {
  let backendConfig = null;

  try {
    backendConfig = await invoke("get_dps_meter_config");
  } catch (err) {
    console.error("[pvp-overlay] get backend config failed:", err);
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const appConfig = JSON.parse(raw);
      appConfig.aion2 = appConfig.aion2 || {};
      appConfig.aion2.backend = {
        ...(backendConfig || {}),
        ...(appConfig.aion2.backend || {}),
        pvpModeOn: false,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appConfig));
      window.dispatchEvent(new CustomEvent("app-config-changed", { detail: appConfig }));
      backendConfig = appConfig.aion2.backend;
    } else if (backendConfig) {
      backendConfig = { ...backendConfig, pvpModeOn: false };
    }
  } catch (err) {
    console.error("[pvp-overlay] persist pvp mode failed:", err);
    if (backendConfig) {
      backendConfig = { ...backendConfig, pvpModeOn: false };
    }
  }

  if (!backendConfig) return;

  try {
    await invoke("apply_dps_meter_config", { config: backendConfig });
  } catch (err) {
    console.error("[pvp-overlay] disable pvp mode failed:", err);
  }
}

function updateKnownPlayers(players) {
  const knownPlayers = Array.isArray(players) ? players : [];
  const seen = new Set();
  const options = [];
  const nextKey = knownPlayers
    .map((player) => `${player.actorId}:${player.actorName}:${player.serverId || ""}`)
    .join("|");

  if (nextKey === knownPlayersKey) {
    return;
  }
  knownPlayersKey = nextKey;

  for (const player of knownPlayers) {
    const name = player.actorName;
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const option = document.createElement("option");
    option.value = name;
    const serverName = getServerName(player.serverId);
    option.label = serverName ? `${name} ${serverName}` : name;
    options.push(option);
  }

  watchSuggestions?.replaceChildren(...options);
}

function addWatchName(name) {
  const trimmed = name.trim();
  if (!trimmed || watchNames.includes(trimmed)) return;
  watchNames = [...watchNames, trimmed];
  saveWatchNames();
  renderWatchInfo([]);
  void refreshWatchInfo();
}

function removeWatchName(name) {
  watchNames = watchNames.filter((item) => item !== name);
  saveWatchNames();
  renderWatchInfo([]);
  void refreshWatchInfo();
}

function createWatchRow(info) {
  const row = document.createElement("div");
  const found = info.actorId != null;
  const isAuto = info.source === "last-dealt";
  const currentHp = Number(info.currentHp ?? 0);
  const maxHp = Number(info.maxHp ?? 0);
  const hpScale =
    found && Number.isFinite(currentHp) && Number.isFinite(maxHp) && maxHp > 0
      ? Math.max(0, Math.min(1, currentHp / maxHp))
      : 0;

  row.className = "player-hp-row";
  row.classList.toggle("is-missing", !found);
  row.classList.toggle("is-auto", isAuto);
  row.style.setProperty("--hp-scale", String(hpScale));

  const bar = document.createElement("div");
  bar.className = "player-hp-row__bar";

  const icon = document.createElement("img");
  icon.className = "player-hp-row__icon";
  const iconSrc = getClassIcon(info.actorClass);
  if (iconSrc) {
    icon.src = iconSrc;
  } else {
    icon.classList.add("is-placeholder");
  }
  icon.addEventListener("error", () => {
    icon.classList.add("is-placeholder");
    icon.removeAttribute("src");
  });

  const name = document.createElement("div");
  name.className = "player-hp-row__name";
  name.textContent = maskName(info.actorName || info.queryName);
  if (isAuto) {
    name.title = "最后攻击";
  }

  const server = document.createElement("div");
  server.className = "player-hp-row__server";
  server.textContent = getServerName(info.serverId);

  const hp = document.createElement("div");
  hp.className = "player-hp-row__hp";
  hp.textContent = found && maxHp > 0 ? `${fmtDamage(currentHp)} / ${fmtDamage(maxHp)}` : "--";

  const pct = document.createElement("div");
  pct.className = "player-hp-row__pct";
  pct.textContent = found ? fmtHpPct(currentHp, maxHp) : "--";

  const remove = document.createElement("button");
  remove.className = "player-hp-row__remove";
  remove.type = "button";
  if (isAuto) {
    remove.textContent = "";
    remove.disabled = true;
    remove.title = "最后攻击";
  } else {
    remove.textContent = "×";
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      removeWatchName(info.queryName);
    });
  }

  row.appendChild(bar);
  row.appendChild(icon);
  row.appendChild(name);
  row.appendChild(server);
  row.appendChild(hp);
  row.appendChild(pct);
  row.appendChild(remove);
  return row;
}

function normalizeWatchInfo(items, lastDealtPlayer) {
  const byName = new Map();
  for (const item of items || []) {
    const key = item.queryName;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(item);
  }

  const manualRows = watchNames.flatMap((name) => {
    const matches = byName.get(name);
    if (matches && matches.length > 0) return matches;
    return [
      {
        queryName: name,
        actorId: null,
        actorName: null,
        serverId: null,
        actorClass: null,
        currentHp: null,
        maxHp: null,
      },
    ];
  });

  if (!lastDealtPlayer?.actorId) {
    return manualRows;
  }

  const duplicated = manualRows.some(
    (row) =>
      row.actorId === lastDealtPlayer.actorId ||
      (row.actorId == null && row.queryName === lastDealtPlayer.actorName)
  );
  const autoRow = { ...lastDealtPlayer, source: "last-dealt" };
  if (!duplicated) {
    return [autoRow, ...manualRows];
  }

  return [
    autoRow,
    ...manualRows.filter(
      (row) => row.actorId !== autoRow.actorId && row.queryName !== autoRow.actorName
    ),
  ];
}

function renderWatchInfo(items, lastDealtPlayer) {
  const rows = normalizeWatchInfo(items, lastDealtPlayer);
  document.body.classList.toggle("has-watch-players", rows.length > 0);
  watchList.replaceChildren(...rows.map(createWatchRow));
}

function renderCombatStats(stats) {
  if (Array.isArray(stats)) {
    combatStatsRows = stats;
  }

  combatStatsSortDamage.classList.toggle("is-active", combatStatsSort === "damage");
  combatStatsSortKills.classList.toggle("is-active", combatStatsSort === "kills");

  const rows = combatStatsRows.sort((a, b) => {
    const primary =
      combatStatsSort === "kills"
        ? (b.kills || 0) - (a.kills || 0)
        : (b.damage || 0) - (a.damage || 0);
    return (
      primary ||
      (b.kills || 0) - (a.kills || 0) ||
      (b.assists || 0) - (a.assists || 0) ||
      (a.deaths || 0) - (b.deaths || 0) ||
      a.actorName.localeCompare(b.actorName)
    );
  });

  combatStatsEmpty.hidden = rows.length > 0;
  combatStatsList.replaceChildren(
    ...rows.map((stats) => {
      const row = document.createElement("div");
      row.className = "pvp-combat-stats__row";

      const name = document.createElement("div");
      name.className = "pvp-combat-stats__name";
      name.textContent = maskName(stats.actorName);
      name.title = stats.actorName;

      const server = document.createElement("span");
      server.className = "pvp-combat-stats__server";
      server.textContent = getServerName(stats.serverId) || "未知";
      name.appendChild(server);

      for (const [key, value] of [
        ["damage", fmtDamage(stats.damage)],
        ["kills", stats.kills],
        ["assists", stats.assists],
        ["deaths", stats.deaths],
      ]) {
        const cell = document.createElement("span");
        cell.className = `pvp-combat-stats__value is-${key}`;
        cell.textContent = String(value || 0);
        row.appendChild(cell);
      }

      row.prepend(name);
      return row;
    })
  );
}

async function refreshWatchInfo() {
  try {
    const [response, combatStats] = await Promise.all([
      invoke("get_pvp_watch_info", { names: watchNames }),
      invoke("get_pvp_combat_stats"),
    ]);
    updateKnownPlayers(response?.knownPlayers || []);
    renderWatchInfo(response?.watchInfo || [], response?.lastDealtPlayer || null);
    renderCombatStats(combatStats);
  } catch (err) {
    console.error("[pvp-overlay] get_pvp_watch_info failed:", err);
  }
}

function startWatchPolling() {
  const poll = async () => {
    await refreshWatchInfo();
    window.setTimeout(poll, WATCH_POLL_MS);
  };
  void poll();
}

function createPlayerRow(player, maxDamage) {
  const row = document.createElement("div");
  row.className = "player-row";
  row.dataset.actorId = String(player.actorId);

  const bar = document.createElement("div");
  bar.className = "player-row__bar";
  bar.style.setProperty(
    "--bar-scale",
    maxDamage > 0 ? String((player.totalDamage || 0) / maxDamage) : "0"
  );

  const content = document.createElement("div");
  content.className = "player-row__content";

  const left = document.createElement("div");
  left.className = "player-row__left";

  const iconWrap = document.createElement("div");
  iconWrap.className = "player-row__icon-wrap";
  const icon = document.createElement("img");
  icon.className = "player-row__icon";
  icon.addEventListener("error", () => {
    icon.style.display = "none";
  });
  const iconSrc = getClassIcon(player.actorClass);
  if (iconSrc) {
    icon.src = iconSrc;
  } else {
    icon.style.display = "none";
  }
  iconWrap.appendChild(icon);

  const nameWrap = document.createElement("div");
  nameWrap.className = "player-row__name-wrap";
  const name = document.createElement("span");
  name.className = "player-row__name";
  name.textContent = maskName(player.actorName || `ID:${player.actorId}`);
  name.style.display = overlayConfig.showPlayerName === false ? "none" : "";

  const server = document.createElement("span");
  server.className = "player-row__server";
  server.textContent = getServerName(player.actorServerId);
  server.style.display = overlayConfig.showServer !== false ? "" : "none";

  nameWrap.appendChild(name);
  nameWrap.appendChild(server);
  left.appendChild(iconWrap);
  left.appendChild(nameWrap);

  const right = document.createElement("div");
  right.className = "player-row__right";

  const damage = document.createElement("span");
  damage.className = "player-row__damage";
  damage.textContent = fmtDamage(player.totalDamage);
  damage.style.display = overlayConfig.showDamage !== false ? "" : "none";

  const dps = document.createElement("span");
  dps.className = "player-row__dps";
  dps.textContent = fmtDps(player.dps);
  const dpsUnit = document.createElement("span");
  dpsUnit.className = "player-row__dps-unit";
  dpsUnit.textContent = "/s";
  dps.appendChild(dpsUnit);
  dps.style.display = overlayConfig.showDps !== false ? "" : "none";

  const share = document.createElement("span");
  share.className = "player-row__share";
  const pctValue =
    overlayConfig.pctMode === "contribution" ? player.damageContribution : player.damageShare;
  share.textContent = fmtShare(pctValue);

  const addWatch = document.createElement("button");
  addWatch.className = "player-row__watch-add";
  addWatch.type = "button";
  addWatch.textContent = "+";
  addWatch.title = "添加监控";
  addWatch.addEventListener("click", (event) => {
    event.stopPropagation();
    if (player.actorName) {
      addWatchName(player.actorName);
    }
  });

  right.appendChild(damage);
  right.appendChild(dps);
  right.appendChild(share);
  right.appendChild(addWatch);
  content.appendChild(left);
  content.appendChild(right);
  row.appendChild(bar);
  row.appendChild(content);
  return row;
}

function renderReceivedDamage(players) {
  const list = Array.isArray(players) ? players : [];
  document.body.classList.toggle("has-players", list.length > 0);
  playerList.replaceChildren();

  if (list.length === 0) {
    return;
  }

  const maxDamage = list.reduce((max, player) => Math.max(max, player.totalDamage || 0), 0);
  for (const player of list) {
    playerList.appendChild(createPlayerRow(player, maxDamage));
  }
}

const currentWindow = getCurrentWindow();

document.getElementById("drag-handle")?.addEventListener("mousedown", async () => {
  try {
    await currentWindow.startDragging();
  } catch (_) {
    /* ignore */
  }
});

document.getElementById("close-btn")?.addEventListener("click", async () => {
  try {
    await disablePvpMode();
    await currentWindow.close();
  } catch (_) {
    /* ignore */
  }
});

(async function init() {
  try {
    const cfg = await invoke("get_overlay_config");
    if (hasConfigValue(cfg)) {
      applyOverlayConfig(cfg);
    }
  } catch (err) {
    console.error("[pvp-overlay] get_overlay_config failed:", err);
  }

  listen("overlay-config-changed", (event) => {
    applyOverlayConfig(event.payload);
  });

  listen("dps-snapshot", (event) => {
    lastSnapshot = event.payload;
    renderReceivedDamage(lastSnapshot?.mainActorReceivedPlayerOverviewStats || []);
  });

  watchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    addWatchName(watchInput.value);
    watchInput.value = "";
  });
  combatStatsClear?.addEventListener("click", async () => {
    combatStatsClear.disabled = true;
    try {
      await invoke("clear_pvp_combat_stats");
      renderCombatStats([]);
    } catch (err) {
      console.error("[pvp-overlay] clear_pvp_combat_stats failed:", err);
    } finally {
      combatStatsClear.disabled = false;
    }
  });
  combatStatsSortDamage?.addEventListener("click", () => {
    combatStatsSort = "damage";
    renderCombatStats();
  });
  combatStatsSortKills?.addEventListener("click", () => {
    combatStatsSort = "kills";
    renderCombatStats();
  });
  renderWatchInfo([]);
  renderCombatStats([]);
  startWatchPolling();

  playerList.addEventListener("click", async (event) => {
    const row = event.target.closest(".player-row");
    if (!row) return;

    const actorId = Number(row.dataset.actorId);
    const targetId = lastSnapshot?.combatInfos?.mainActorId;
    if (!actorId || !targetId) return;

    try {
      await invoke("set_detail_selection", {
        value: { actorId, targetId, mode: "live" },
      });
      await invoke("create_dps_detail");
    } catch (_) {
      /* ignore */
    }
  });
})();
