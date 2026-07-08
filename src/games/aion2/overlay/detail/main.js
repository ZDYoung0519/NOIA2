import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { t, setLanguage } from "../../i18n.js";
import skillsEn from "@/i18n/locales/aion2skills/en.json";
import skillsZhCN from "@/i18n/locales/aion2skills/zh-CN.json";
import skillsZhTW from "@/i18n/locales/aion2skills/zh-TW.json";
import skillsKo from "@/i18n/locales/aion2skills/ko.json";
import serversData from "@/games/aion2/data/servers.json";

const SKILLS = { en: skillsEn, "zh-CN": skillsZhCN, "zh-TW": skillsZhTW, ko: skillsKo };
let currentSkills = skillsEn;

// ── Server name lookup ──
const serverMap = new Map(serversData.map((s) => [s.serverId, s.serverName]));
function getServerName(serverId) {
  return serverMap.get(Number(serverId)) || serverId || "";
}

// ── DOM ──
const $modeBadge = document.getElementById("mode-badge");
const $content = document.getElementById("detail-content");
const $titleBar = document.querySelector(".detail-titlebar");
const $playerIcon = document.getElementById("player-icon");
const $playerName = document.getElementById("player-name");
const $playerServer = document.getElementById("player-server");
const $playerPower = document.getElementById("player-power");
const $playerPowerText = document.getElementById("player-power-text");

document.getElementById("close-btn").addEventListener("click", async () => {
  try {
    await getCurrentWindow().close();
  } catch (_) {
    /* ignore */
  }
});

document.getElementById("detail-drag-handle").addEventListener("mousedown", () => {
  getCurrentWindow().startDragging();
});

// ── Auto-resize ──
let lastDetailHeight = 0;
async function autoResize() {
  const h = ($titleBar?.offsetHeight || 0) + ($content?.offsetHeight || 0);
  if (Math.abs(h - lastDetailHeight) > 1) {
    lastDetailHeight = h;
    try {
      const win = getCurrentWindow();
      const size = await win.innerSize();
      const sf = await win.scaleFactor();
      const w = size.width / sf;
      await win.setSize(new LogicalSize(w, h));
    } catch (_) {
      /* ignore */
    }
  }
}

// ── State ──
let mode = "live";
let selectedActorId = null;
let selectedTargetId = null;
let frozenRecord = null;
let lastSnapshot = null;
let isBuffPanelOpen = false;

// ── Formatters ──
function fmtDamage(n) {
  if (!n) return "0";
  if (n < 1e4) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(1) + "K";
  if (n < 1e9) return (n / 1e6).toFixed(2) + "M";
  return (n / 1e9).toFixed(2) + "B";
}
function fmtFull(n) {
  return Math.round(n || 0).toLocaleString("en-US");
}
function fmtPower(n) {
  const value = Number(n);
  if (!Number.isFinite(value) || value <= 0) return "";
  return (value / 1000).toFixed(1) + "k";
}
function esc(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function fmtPct(n) {
  return (n || 0).toFixed(1) + "%";
}
function fmtDuration(s) {
  if (!s || s <= 0) return "--";
  if (s < 60) return Math.floor(s) + "s";
  const m = Math.floor(s / 60),
    sec = Math.floor(s % 60);
  return m + "m " + String(sec).padStart(2, "0") + "s";
}
function getClassIcon(c) {
  return c ? "/aion2/class/" + c.toLowerCase() + ".png" : "";
}
function normalizeSkillId(id) {
  // 取前8位，不足8位只保留已有的位数，只有使用技能名称才需要normalize，
  // 技能已经在后端分组，
  // 前端不需要任何实际的合并操作
  return String(id).slice(0, 8);
}
function skillLookupCandidates(id) {
  const raw = String(id);
  const candidates = [raw, normalizeSkillId(raw)];
  if (raw.length > 8) {
    candidates.push(raw.slice(0, 8).replace(/\d$/, "0"));
  }
  if (raw.length > 6) {
    candidates.push(raw.slice(0, 6).padEnd(8, "0"));
  }
  return [...new Set(candidates)];
}
function resolveSkillId(id) {
  return (
    skillLookupCandidates(id).find((candidate) => currentSkills[candidate]) || normalizeSkillId(id)
  );
}
function skillName(id) {
  const k = resolveSkillId(id);
  return currentSkills[k] || "Skill #" + id;
}
function skillIcon(id) {
  const base = resolveSkillId(id);
  return base.length === 6
    ? "/aion2/skill/" + base + ".png"
    : "/aion2/skill/" + base.slice(0, 4) + ".png";
}
function specDots(slots) {
  const set = new Set((slots || []).filter((n) => n >= 1 && n <= 5));
  return [1, 2, 3, 4, 5].map((s) => set.has(s));
}
function getSpecial(stats, key) {
  return Number(stats?.specialCounts?.[key] ?? 0);
}
function fmtTimelineTime(seconds) {
  if (!Number.isFinite(seconds)) return "--";
  return seconds < 60 ? `${seconds.toFixed(1)}s` : fmtDuration(seconds);
}
function getTargetBuffs(dataSource, targetId) {
  if (targetId == null) return [];
  return (
    dataSource?.useBuffsByTarget?.[String(targetId)] ||
    dataSource?.useBuffsByTarget?.[targetId] ||
    []
  );
}
function renderBuffTimeline(buffs, fightStart, fightEnd) {
  const fightStartMs = Math.floor(fightStart * 1000);
  const fightEndMs = Math.floor(fightEnd * 1000);
  const fightDurationMs = Math.max(1, fightEndMs - fightStartMs);
  const rows = (buffs || [])
    .map((buff) => {
      const startMs = Number(buff.localStartMs);
      const endMs = Number(buff.localEndMs);
      if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
      const visibleStart = Math.max(startMs, fightStartMs);
      const visibleEnd = Math.min(endMs, fightEndMs);
      if (visibleEnd <= visibleStart) return null;
      const left = ((visibleStart - fightStartMs) / fightDurationMs) * 100;
      const width = ((visibleEnd - visibleStart) / fightDurationMs) * 100;
      const startSec = (visibleStart - fightStartMs) / 1000;
      const endSec = (visibleEnd - fightStartMs) / 1000;
      const name = skillName(buff.skillCode);
      const icon = skillIcon(buff.skillCode);
      const label = `${name} ${fmtTimelineTime(startSec)}-${fmtTimelineTime(endSec)}`;
      return `
        <div class="buff-timeline__row">
          <div class="buff-timeline__name">
            ${icon ? `<img class="buff-timeline__icon" src="${icon}" alt="" onerror="this.style.display='none'"/>` : ""}
            <span>${esc(name)}</span>
          </div>
          <div class="buff-timeline__track">
            <div class="buff-timeline__bar" style="left:${left.toFixed(2)}%;width:${Math.max(width, 0.8).toFixed(2)}%" title="${esc(label)}"></div>
          </div>
        </div>`;
    })
    .filter(Boolean);

  return `
    <div class="buff-timeline">
      ${
        rows.length > 0
          ? rows.join("")
          : `<div class="buff-timeline__empty">${t("dps-detail.noBuffs")}</div>`
      }
    </div>`;
}
function mergeSkillStats(target, source) {
  target.totalDamage += source.totalDamage || 0;
  target.counts += source.counts || 0;
  target.maxDamage = Math.max(target.maxDamage, source.maxDamage || 0);
  target.minDamage = Math.min(target.minDamage, source.minDamage || 1e99);
  for (const [k, v] of Object.entries(source.specialCounts || {})) {
    target.specialCounts[k] = (target.specialCounts[k] || 0) + v;
  }
}
function emptySkillStats() {
  return {
    totalDamage: 0,
    counts: 0,
    maxDamage: 0,
    minDamage: 1e99,
    specialCounts: {},
  };
}

// ── Render ──
function setMode(m) {
  mode = m;
  $modeBadge.textContent = mode === "history" ? t("dps-overlay.history") : t("dps-overlay.live");
  $modeBadge.className = "titlebar__mode " + (mode === "history" ? "is-history" : "is-live");
}

function render() {
  if (!selectedActorId) {
    $playerName.textContent = "Player";
    $playerServer.textContent = "";
    $playerPower.style.display = "none";
    $playerIcon.style.display = "none";
    $content.innerHTML = `<div class="empty">${t("dps-detail.empty")}</div>`;
    return;
  }

  // Gather data
  let playerNameText = `ID:${selectedActorId}`,
    playerClass = "",
    playerServer = "",
    playerPower = "",
    iconSrc = "";
  let totalDmg = 0,
    skillMap = {},
    targetInfo = null,
    currentTargetId = null,
    actorInfo = null,
    playerStats = null;

  // Unified data source: snapshot from live, or record from history
  const dataSource = mode === "history" && frozenRecord ? frozenRecord : lastSnapshot;
  if (!dataSource) {
    $content.innerHTML = `<div class="empty">${t("dps-detail.noData")}</div>`;
    return;
  }

  // ── Actor info ──
  actorInfo = dataSource.combatInfos?.actorInfos?.[selectedActorId] || null;
  playerNameText = actorInfo?.actorName || playerNameText;
  playerClass = actorInfo?.actorClass || "";
  playerServer = getServerName(actorInfo?.actorServerId);
  playerPower = fmtPower(actorInfo?.combatPower);
  iconSrc = playerClass ? getClassIcon(playerClass) : "";

  // ── Target info (for fight duration) ──
  if (mode === "history") {
    targetInfo = dataSource.targetInfo || null;
    currentTargetId = dataSource.targetId ?? targetInfo?.id ?? null;
  } else {
    const targetId = selectedTargetId ?? dataSource.combatInfos?.lastTargetByMainActor;
    currentTargetId = targetId ?? null;
    if (targetId != null) {
      targetInfo =
        dataSource.combatInfos?.targetInfos?.[targetId] || dataSource.lastTargetInfo || null;
    }
  }

  // ── Player overview stats ──
  if (mode === "history") {
    playerStats = dataSource.playerStats?.[selectedActorId] || null;
  } else {
    playerStats =
      (
        (selectedTargetId != null
          ? Object.values(dataSource.byTargetPlayerStats?.[selectedTargetId] || {})
          : dataSource.lastTargetAllPlayersOverviewStats) || []
      ).find((p) => p.actorId === selectedActorId) || null;
  }

  // ── Skill stats ──
  let rawSkillMap = {};
  if (mode === "history") {
    rawSkillMap = dataSource.playerSkillStats?.[selectedActorId] || {};
  } else {
    // Only show skills for the current boss target, not all targets merged together
    const lastTargetId = selectedTargetId ?? dataSource.combatInfos?.lastTargetByMainActor;
    const targetStats = dataSource.byTargetPlayerSkillStats || {};
    const targetSkillStats = (lastTargetId != null ? targetStats[lastTargetId] : null) || {};
    rawSkillMap = targetSkillStats[selectedActorId] || {};
  }
  skillMap = {};
  for (const [sid, st] of Object.entries(rawSkillMap)) {
    if (!skillMap[sid]) skillMap[sid] = emptySkillStats();
    mergeSkillStats(skillMap[sid], st);
  }
  for (const s of Object.values(skillMap)) {
    if (s.minDamage === 1e99) s.minDamage = 0;
    totalDmg += s.totalDamage;
  }

  // Titlebar
  setMode(mode);
  $playerName.textContent = playerNameText;
  $playerServer.textContent = playerServer ? `[${playerServer}]` : "";
  if (playerPower) {
    $playerPowerText.textContent = playerPower;
    $playerPower.style.display = "";
  } else {
    $playerPower.style.display = "none";
  }
  if (iconSrc) {
    $playerIcon.src = iconSrc;
    $playerIcon.style.display = "";
  } else {
    $playerIcon.style.display = "none";
  }

  // Skills sorted
  const skills = Object.entries(skillMap).map(([sid, s]) => ({ skillId: sid, ...s }));
  skills.sort((a, b) => b.totalDamage - a.totalDamage);
  const maxDmg = skills.length > 0 ? skills[0].totalDamage : 1;
  const totalSkillDmg = skills.reduce((s, r) => s + r.totalDamage, 0);

  // Summary
  const totalHits = Math.max(1, playerStats?.counts || skills.reduce((s, r) => s + r.counts, 0));
  const fightStart = targetInfo?.targetStartTime?.[selectedActorId] || 0;
  const fightEnd = targetInfo?.targetLastTime?.[selectedActorId] || 0;
  const fightDur = Math.max(1, fightEnd - fightStart);
  const dps = totalDmg / fightDur;
  const allSpecials = skills.reduce((acc, s) => {
    for (const [k, v] of Object.entries(s.specialCounts || {})) acc[k] = (acc[k] || 0) + v;
    return acc;
  }, {});
  const critR = totalHits > 0 ? fmtPct(((allSpecials["CRITICAL"] || 0) / totalHits) * 100) : "--";
  const backR = totalHits > 0 ? fmtPct(((allSpecials["BACK"] || 0) / totalHits) * 100) : "--";
  const frontR = totalHits > 0 ? fmtPct(((allSpecials["FRONT"] || 0) / totalHits) * 100) : "--";
  const doubleR = totalHits > 0 ? fmtPct(((allSpecials["DOUBLE"] || 0) / totalHits) * 100) : "--";
  const perfectR = totalHits > 0 ? fmtPct(((allSpecials["PERFECT"] || 0) / totalHits) * 100) : "--";
  const parryR = totalHits > 0 ? fmtPct(((allSpecials["PARRY"] || 0) / totalHits) * 100) : "--";
  const multiR = totalHits > 0 ? fmtPct(((allSpecials["MULTIHIT"] || 0) / totalHits) * 100) : "--";

  // Spec dots from actor info
  const skillSpecMap = actorInfo?.actorSkillSpec || {};

  let html = `<div class="summary-grid summary-row4">`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.damage")}</div><div class="summary-box__value">${fmtFull(totalDmg)}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.dps")}</div><div class="summary-box__value dps">${fmtFull(dps)}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.fight")}</div><div class="summary-box__value">${fmtDuration(fightDur)}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.hits")}</div><div class="summary-box__value">${totalHits}</div></div>`;
  html += `</div><div class="summary-grid summary-row7">`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.critical")}</div><div class="summary-box__value crit">${critR}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.back")}</div><div class="summary-box__value back">${backR}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.front")}</div><div class="summary-box__value front">${frontR}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.double")}</div><div class="summary-box__value double">${doubleR}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.perfect")}</div><div class="summary-box__value perfect">${perfectR}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.parry")}</div><div class="summary-box__value parry">${parryR}</div></div>`;
  html += `<div class="summary-box"><div class="summary-box__label">${t("dps-detail.multi")}</div><div class="summary-box__value multi">${multiR}</div></div>`;
  html += `</div>`;

  // Skill table
  if (skills.length > 0) {
    html += `<div class="skill-table-wrap"><div class="skill-table-scroll"><div class="skill-table">`;
    // Header
    html += `<div class="skill-header"><span>${t("dps-detail.skill")}</span><span>${t("dps-detail.spec")}</span><span>${t("dps-detail.count")}</span><span>${t("dps-detail.critical")}%</span><span>${t("dps-detail.perfect")}%</span><span>${t("dps-detail.double")}%</span><span>${t("dps-detail.front")}%</span><span>${t("dps-detail.back")}%</span><span>${t("dps-detail.parry")}%</span><span>${t("dps-detail.multi")}%</span><span>${t("dps-detail.multiHitDmg")}</span><span>${t("dps-detail.min")}</span><span>${t("dps-detail.max")}</span><span>${t("dps-detail.avg")}</span><span>${t("dps-detail.total")}</span></div>`;
    for (const s of skills) {
      const sc = getSpecial(s, "CRITICAL");
      const bk = getSpecial(s, "BACK");
      const fr = getSpecial(s, "FRONT");
      const db = getSpecial(s, "DOUBLE");
      const pf = getSpecial(s, "PERFECT");
      const pa = getSpecial(s, "PARRY");
      const mu = getSpecial(s, "MULTIHIT");
      const muDmg = getSpecial(s, "MULTIHITDMG");
      // Build multi-hit tooltip: show each hit variant count & probability
      let muTip = "";
      if (muDmg > 0) {
        const lines = Object.entries(s.specialCounts || {})
          .filter(
            ([k, v]) => k.startsWith("MULTIHIT") && k !== "MULTIHIT" && k !== "MULTIHITDMG" && v > 0
          )
          .sort(
            ([a], [b]) => parseInt(a.replace("MULTIHIT", "")) - parseInt(b.replace("MULTIHIT", ""))
          )
          .map(([k, v]) => {
            const hits = k.replace("MULTIHIT", "");
            const pct = s.counts > 0 ? fmtPct((v / s.counts) * 100) : "--";
            return `${hits}hits: ${v} (${pct})`;
          });
        if (lines.length > 0) {
          muTip = "Multi-hit\n" + lines.join("\n");
        }
      }
      const avgDmg = s.counts > 0 ? Math.floor(s.totalDamage / s.counts) : 0;
      const pct = totalSkillDmg > 0 ? ((s.totalDamage / totalSkillDmg) * 100).toFixed(1) : "0.0";
      const dots = specDots(skillSpecMap[s.skillId]);
      const icon = skillIcon(s.skillId);
      const name = skillName(s.skillId);

      html += `<div class="skill-row">`;
      html += `<span class="skill-name-cell">${icon ? `<img class="skill-icon" src="${icon}" alt="" onerror="this.style.display='none'"/>` : ""}<span class="skill-name-text">${esc(name)}</span></span>`;
      html += `<span class="spec-dots">${dots.map((a) => `<span class="spec-dot${a ? " active" : ""}"></span>`).join("")}</span>`;
      html += `<span class="color-slate">${s.counts}</span>`;
      html += `<span class="color-rose">${s.counts > 0 ? fmtPct((sc / s.counts) * 100) : "--"}</span>`;
      html += `<span class="color-emerald">${s.counts > 0 ? fmtPct((pf / s.counts) * 100) : "--"}</span>`;
      html += `<span class="color-yellow">${s.counts > 0 ? fmtPct((db / s.counts) * 100) : "--"}</span>`;
      html += `<span class="color-cyan">${s.counts > 0 ? fmtPct((fr / s.counts) * 100) : "--"}</span>`;
      html += `<span class="color-indigo">${s.counts > 0 ? fmtPct((bk / s.counts) * 100) : "--"}</span>`;
      html += `<span class="color-slate">${s.counts > 0 ? fmtPct((pa / s.counts) * 100) : "--"}</span>`;
      html += `<span class="color-rose">${s.counts > 0 ? fmtPct((mu / s.counts) * 100) : "--"}</span>`;
      html += `<span class="color-slate"${muTip ? ` data-tooltip="${esc(muTip)}"` : ""}>${muDmg > 0 ? fmtFull(muDmg) : "--"}</span>`;
      html += `<span class="color-slate">${s.minDamage > 0 ? fmtFull(s.minDamage) : "--"}</span>`;
      html += `<span class="color-slate">${fmtFull(s.maxDamage)}</span>`;
      html += `<span class="color-slate">${fmtFull(avgDmg)}</span>`;
      html += `<span class="skill-total-cell"><div class="skill-total-bar" style="width:${pct}%"></div><span class="color-amber" style="position:relative;z-index:1">${fmtFull(s.totalDamage)} (${pct}%)</span></span>`;
      html += `</div>`;
    }
    html += `</div></div></div>`;
  } else {
    html += `<div class="empty">${t("dps-detail.noData")}</div>`;
  }
  html += `
    <details class="buff-panel" ${isBuffPanelOpen ? "open" : ""}>
      <summary class="buff-panel__summary">
        <span>${t("dps-detail.playerBuffs")}</span>
        <span class="buff-panel__chevron">▾</span>
      </summary>
      <div class="buff-panel__body">
        ${renderBuffTimeline(getTargetBuffs(dataSource, selectedActorId), fightStart, fightEnd)}
      </div>
    </details>`;
  $content.innerHTML = html;
  $content.querySelector(".buff-panel")?.addEventListener("toggle", (event) => {
    isBuffPanelOpen = event.currentTarget.open;
    requestAnimationFrame(() => requestAnimationFrame(autoResize));
  });
  // Resize after DOM update settles
  requestAnimationFrame(() => requestAnimationFrame(autoResize));
}

// ── Init ──
(async function init() {
  try {
    const lang = await invoke("get_language");
    setLanguage(lang);
    currentSkills = SKILLS[lang] || skillsEn;
  } catch (e) {
    console.error("[dps-detail] get_language failed:", e);
  }

  // Pull last snapshot as fallback (in case combat already ended)
  try {
    const snap = await invoke("get_last_snapshot");
    if (snap) lastSnapshot = snap;
  } catch (_) {
    /* ignore */
  }

  // Pull pending selection (written before window was created)
  try {
    const selection = await invoke("get_detail_selection");
    console.log("[dps-detail] init selection:", JSON.stringify(selection));
    if (selection && selection.actorId) {
      selectedActorId = selection.actorId;
      selectedTargetId = selection.targetId ?? null;
      mode = selection.mode || "live";
      console.log("[dps-detail] init mode:", mode, "actorId:", selectedActorId);
      if (mode === "history") {
        frozenRecord = selection.record || null;
      }
      render();
    }
  } catch (_) {
    /* ignore */
  }

  // Init titlebar + empty text (set before render() replaces the .empty element)
  const $emptyEl = document.querySelector(".empty");
  if ($emptyEl) $emptyEl.textContent = t("dps-detail.empty");
  $modeBadge.textContent = t("dps-overlay.live");
  $modeBadge.className = "titlebar__mode is-live";

  listen("language-changed", (event) => {
    setLanguage(event.payload.language);
    currentSkills = SKILLS[event.payload.language] || skillsEn;
    render();
  });

  listen("dps-snapshot", (event) => {
    lastSnapshot = event.payload;
    if (mode === "live" && selectedActorId) render();
  });

  listen("select-player-detail", async (event) => {
    console.log("[dps-detail] event received:", JSON.stringify(event.payload));
    let payload = event.payload;
    if (!payload || !payload.actorId) {
      try {
        payload = await invoke("get_detail_selection");
        console.log("[dps-detail] fallback get_detail_selection:", JSON.stringify(payload));
      } catch (_) {
        /* ignore */
      }
    }
    if (!payload || !payload.actorId) return;
    selectedActorId = payload.actorId;
    selectedTargetId = payload.targetId ?? null;
    mode = payload.mode || "live";
    console.log("[dps-detail] event mode:", mode, "actorId:", selectedActorId);
    if (mode === "history") frozenRecord = payload.record || null;
    render();
  });
})();
