import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import skillsZhCN from "@/i18n/locales/aion2skills/zh-CN.json";

const DEFAULT_BACKGROUND = [0, 0, 0, 102];
const APP_CONFIG_STORAGE_KEY = "app-config";
const LAYOUT_STORAGE_KEY = "aion2-buff-monitor-layout:v1";
const STATIC_BUFF_SKILL_CODES = new Set([1816, 1819]);
const CLASS_ORDER = [
  "GLADIATOR",
  "TEMPLAR",
  "ASSASSIN",
  "RANGER",
  "SORCERER",
  "ELEMENTALIST",
  "CLERIC",
  "CHANTER",
  "FIGHTER",
];
const CLASS_NAMES = {
  GLADIATOR: "剑星",
  TEMPLAR: "守护星",
  ASSASSIN: "杀星",
  RANGER: "弓星",
  SORCERER: "魔道星",
  ELEMENTALIST: "精灵星",
  CLERIC: "治愈星",
  CHANTER: "护法星",
  FIGHTER: "拳星",
};

const activeBuffs = new Map();
const slotElementsByBuffKey = new Map();
let renderedBuffSlots = [];
let updateTimer = 0;
let buffContext = null;
let layoutConfig = loadLayoutConfig();
let pickerRowId = null;
let pickerSlotId = null;
let idSeed = Date.now();
let showOnlyActive = true;
let iconStyle = "style1";

const $buffList = document.getElementById("buff-list");
const $buffTitle = document.getElementById("buff-title");
const $buffPicker = document.getElementById("buff-picker");

function nextId(prefix) {
  idSeed += 1;
  return `${prefix}_${idSeed.toString(36)}`;
}

function applyBackground(config) {
  const [r, g, b, a] = config?.background || DEFAULT_BACKGROUND;
  document.documentElement.style.setProperty("--overlay-bg", `rgba(${r},${g},${b},${a / 255})`);
}

function applyIconSize(value) {
  const size = Math.min(64, Math.max(24, Number(value) || 34));
  document.documentElement.style.setProperty("--buff-icon-size", `${size}px`);
  document.documentElement.style.setProperty(
    "--buff-duration-size",
    `${Math.min(24, Math.max(13, Math.round(size * 0.42)))}px`
  );
  return size;
}

function applyIconGap(value) {
  const parsed = Number(value);
  const gap = Math.min(16, Math.max(0, Number.isFinite(parsed) ? parsed : 5));
  document.documentElement.style.setProperty("--buff-icon-gap", `${gap}px`);
  return gap;
}

function applyIconStyle(value) {
  iconStyle = value === "style2" ? "style2" : "style1";
  document.body.dataset.iconStyle = iconStyle;
}

function applyLocked(locked) {
  document.body.classList.toggle("is-click-through", locked);
  if (locked) closePicker();
}

function resolveSkillId(skillCode) {
  const raw = String(skillCode);
  const candidates = [raw, raw.length === 4 ? raw.padEnd(8, "0") : raw.slice(0, 8)];
  if (raw.length > 8) candidates.push(raw.slice(0, 8).replace(/\d$/, "0"));
  if (raw.length > 6) candidates.push(raw.slice(0, 6).padEnd(8, "0"));
  return [...new Set(candidates)].find((id) => skillsZhCN[id]) || raw.slice(0, 8);
}

function skillShortcode(skillCode) {
  return Number(String(skillCode).slice(0, 4));
}

function skillName(skillCode) {
  const resolvedId = resolveSkillId(skillCode);
  return skillsZhCN[resolvedId] || `技能 ${skillCode}`;
}

function buffKey(slot) {
  return `${slot.type}:${skillShortcode(slot.skillCode)}`;
}

function shouldPlayActivationAnimation(slot) {
  return !STATIC_BUFF_SKILL_CODES.has(skillShortcode(slot.skillCode));
}

function shouldShowRemainingTime(slot) {
  return !STATIC_BUFF_SKILL_CODES.has(skillShortcode(slot.skillCode));
}

function loadLayoutConfig() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAYOUT_STORAGE_KEY));
    if (parsed?.version === 1 && parsed.classes && typeof parsed.classes === "object") {
      return parsed;
    }
  } catch (_) {
    /* use defaults */
  }

  return { version: 1, classes: {} };
}

function saveLayoutConfig() {
  localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layoutConfig));
}

function currentActorClass() {
  return buffContext?.actorClass || null;
}

function getCurrentLayout() {
  const actorClass = currentActorClass();
  if (!actorClass) return { rows: [] };

  layoutConfig.classes[actorClass] ||= {
    rows: [{ id: nextId("row"), slots: [] }],
  };
  return layoutConfig.classes[actorClass];
}

function saveCurrentLayout(layout) {
  const actorClass = currentActorClass();
  if (!actorClass) return;
  layoutConfig.classes[actorClass] = layout;
  saveLayoutConfig();
}

function applyBuffMonitorSettings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(APP_CONFIG_STORAGE_KEY) || "{}");
    const buffMonitor = parsed?.aion2?.buffMonitor;
    showOnlyActive = buffMonitor?.showOnlyActive !== false;
    applyIconStyle(buffMonitor?.iconStyle);
    applyIconSize(buffMonitor?.iconSize);
    applyIconGap(buffMonitor?.iconGap);
  } catch (_) {
    showOnlyActive = true;
    applyIconStyle(null);
    applyIconSize(null);
    applyIconGap(null);
  }
}

function addSlotElement(slot, element) {
  if (slot.type === "empty") return;
  const key = buffKey(slot);
  const elements = slotElementsByBuffKey.get(key) || [];
  elements.push(element);
  slotElementsByBuffKey.set(key, elements);
}

function renderIcon(slot) {
  const icon = document.createElement("img");
  icon.className = "buff-slot__icon";
  icon.alt = "";
  icon.draggable = false;

  if (slot.type === "empty") {
    icon.removeAttribute("src");
    return icon;
  }

  const resolvedId = resolveSkillId(slot.skillCode);
  icon.src = `/aion2/skill/${resolvedId.length === 6 ? resolvedId : resolvedId.slice(0, 4)}.png`;
  icon.addEventListener("error", () => icon.closest(".buff-slot")?.classList.add("has-no-icon"), {
    once: true,
  });
  return icon;
}

function renderSlot(slot, row) {
  const element = document.createElement("div");
  element.className = [
    "buff-slot",
    slot.type === "bossDebuff" ? "is-boss-debuff" : "",
    slot.type === "selfBuff" ? "is-player-buff" : "",
    slot.type === "empty" ? "is-empty" : "",
  ]
    .filter(Boolean)
    .join(" ");
  element.title =
    slot.type === "empty"
      ? "空位"
      : `${slot.type === "bossDebuff" ? "Boss Debuff" : "自身 Buff"} · ${skillName(slot.skillCode)}`;
  element.dataset.tauriDragRegion = "";

  const duration = document.createElement("span");
  duration.className = "buff-slot__duration";
  element.append(renderIcon(slot), duration);

  if (slot.type !== "empty") {
    const code = document.createElement("span");
    code.className = "buff-slot__code";
    code.textContent = String(skillShortcode(slot.skillCode));
    element.append(code);
  }

  addSlotElement(slot, element);
  return element;
}

function renderAddButton(row) {
  const button = document.createElement("button");
  button.className = "buff-row__add";
  button.type = "button";
  button.title = "添加 Buff";
  button.textContent = "+";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    openPicker(row.id, button);
  });
  return button;
}

function renderRemoveRowButton(row) {
  const button = document.createElement("button");
  button.className = "buff-row__remove";
  button.type = "button";
  button.title = "删除这一行";
  button.textContent = "×";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const layout = getCurrentLayout();
    layout.rows = layout.rows.filter((item) => item.id !== row.id);
    if (layout.rows.length === 0) {
      layout.rows.push({ id: nextId("row"), slots: [] });
    }
    saveCurrentLayout(layout);
    if (pickerRowId === row.id) closePicker();
    renderBuffLayout();
  });
  return button;
}

function renderBuffLayout() {
  slotElementsByBuffKey.clear();
  renderedBuffSlots = [];
  const layout = getCurrentLayout();

  const rows = layout.rows.map((row) => {
    const element = document.createElement("div");
    element.className = "buff-row";
    element.dataset.tauriDragRegion = "";
    element.append(
      ...row.slots.map((slot) => {
        if (slot.type !== "empty") renderedBuffSlots.push(slot);
        return renderSlot(slot, row);
      })
    );
    return element;
  });

  $buffList.replaceChildren(...rows);
  updateBuffStates();
}

function addRow() {
  const layout = getCurrentLayout();
  layout.rows.push({ id: nextId("row"), slots: [] });
  saveCurrentLayout(layout);
  renderBuffLayout();
}

function clearLayout() {
  const actorClass = currentActorClass();
  if (!actorClass) return;
  layoutConfig.classes[actorClass] = { rows: [{ id: nextId("row"), slots: [] }] };
  saveLayoutConfig();
  closePicker();
  renderBuffLayout();
}

function closePicker() {
  pickerRowId = null;
  pickerSlotId = null;
  if (!$buffPicker) return;
  $buffPicker.hidden = true;
  $buffPicker.replaceChildren();
}

function applyPickerSlot(slot) {
  const layout = getCurrentLayout();
  const row = layout.rows.find((item) => item.id === pickerRowId);
  if (!row) return;
  const slotIndex = pickerSlotId ? row.slots.findIndex((item) => item.id === pickerSlotId) : -1;
  if (slotIndex >= 0) {
    row.slots[slotIndex] = { id: pickerSlotId, ...slot };
  } else {
    row.slots.push({ id: nextId("slot"), ...slot });
  }
  saveCurrentLayout(layout);
  closePicker();
  renderBuffLayout();
}

function renderCandidateButton(slot) {
  const button = document.createElement("button");
  button.className = "buff-picker__item";
  button.type = "button";
  button.title =
    slot.type === "empty"
      ? "空位"
      : `${skillName(slot.skillCode)} (${skillShortcode(slot.skillCode)})`;
  button.dataset.type = slot.type;
  button.addEventListener("click", () => applyPickerSlot(slot));

  if (slot.type === "empty") {
    const mark = document.createElement("span");
    mark.className = "buff-picker__empty-icon";
    mark.textContent = "空";
    button.append(mark, document.createTextNode("空位"));
    return button;
  }

  const resolvedId = resolveSkillId(slot.skillCode);
  const icon = document.createElement("img");
  icon.src = `/aion2/skill/${resolvedId.length === 6 ? resolvedId : resolvedId.slice(0, 4)}.png`;
  icon.alt = "";
  icon.draggable = false;
  icon.addEventListener("error", () => icon.remove(), { once: true });

  const text = document.createElement("span");
  text.className = "buff-picker__text";

  const name = document.createElement("span");
  name.className = "buff-picker__name";
  name.textContent = skillName(slot.skillCode);

  const code = document.createElement("span");
  code.className = "buff-picker__code";
  code.textContent = String(skillShortcode(slot.skillCode));

  text.append(name, code);
  button.append(icon, text);
  return button;
}

function renderCandidateList(candidates, type) {
  const fragment = document.createDocumentFragment();
  const list = document.createElement("div");
  list.className = "buff-picker__list";
  list.append(
    ...candidates.map((skillCode) =>
      renderCandidateButton({ type, skillCode: skillShortcode(skillCode) })
    )
  );

  if (candidates.length === 0) {
    const empty = document.createElement("div");
    empty.className = "buff-picker__empty";
    empty.textContent = "暂无候选 Buff";
    fragment.append(empty);
    return fragment;
  }

  fragment.append(list);
  return fragment;
}

function renderPickerTab(tab, activeKey, onSelect) {
  const button = document.createElement("button");
  button.className = "buff-picker__tab";
  button.type = "button";
  button.textContent = tab.label;
  button.dataset.active = String(tab.key === activeKey);
  button.addEventListener("click", () => onSelect(tab.key));
  return button;
}

function renderPickerTypeButton(type, activeType, onSelect) {
  const button = document.createElement("button");
  button.className = "buff-picker__type";
  button.type = "button";
  button.textContent = type === "bossDebuff" ? "添加为 Boss Debuff" : "添加为自身 Buff";
  button.dataset.type = type;
  button.dataset.active = String(type === activeType);
  button.addEventListener("click", () => onSelect(type));
  return button;
}

function positionPicker() {
  if (!$buffPicker) return;
  if ($buffPicker.hidden) return;
  const listRect = $buffList.getBoundingClientRect();
  const top = Math.max(36, listRect.top + 6);
  const bottom = 8;
  $buffPicker.style.top = `${top}px`;
  $buffPicker.style.left = "8px";
  $buffPicker.style.right = "8px";
  $buffPicker.style.bottom = `${bottom}px`;
  $buffPicker.style.maxHeight = "";
}

function openPicker(rowId, anchor, slotId = null) {
  if (!$buffPicker) return;
  pickerRowId = rowId;
  pickerSlotId = slotId;
  const currentRow = getCurrentLayout().rows.find((row) => row.id === rowId);
  const currentSlot = slotId ? currentRow?.slots.find((slot) => slot.id === slotId) : null;
  const byClass = buffContext?.selfBuffCandidateSkillCodesByClass || {};
  const tabs = CLASS_ORDER.map((actorClass) => ({
    key: actorClass,
    label: CLASS_NAMES[actorClass] || actorClass,
    candidates: byClass[actorClass] || [],
  }));
  let activeKey = CLASS_ORDER.includes(buffContext?.actorClass)
    ? buffContext.actorClass
    : tabs[0]?.key;
  let activeType = currentRow?.slots.some((slot) => slot.type === "bossDebuff")
    ? "bossDebuff"
    : "selfBuff";
  if (currentSlot?.type === "selfBuff" || currentSlot?.type === "bossDebuff") {
    activeType = currentSlot.type;
  }

  const close = document.createElement("button");
  close.className = "buff-picker__close";
  close.type = "button";
  close.title = "关闭";
  close.textContent = "×";
  close.addEventListener("click", closePicker);

  const quickActions = document.createElement("div");
  quickActions.className = "buff-picker__quick";
  quickActions.append(renderCandidateButton({ type: "empty" }));

  const typeSwitch = document.createElement("div");
  typeSwitch.className = "buff-picker__types";

  const topbar = document.createElement("div");
  topbar.className = "buff-picker__topbar";
  topbar.append(quickActions, typeSwitch);

  const nav = document.createElement("div");
  nav.className = "buff-picker__tabs";

  const content = document.createElement("section");
  content.className = "buff-picker__section";

  const renderActiveTab = () => {
    const activeTab = tabs.find((tab) => tab.key === activeKey) || tabs[0];
    typeSwitch.replaceChildren(
      renderPickerTypeButton("selfBuff", activeType, (type) => {
        activeType = type;
        renderActiveTab();
      }),
      renderPickerTypeButton("bossDebuff", activeType, (type) => {
        activeType = type;
        renderActiveTab();
      })
    );
    nav.replaceChildren(
      ...tabs.map((tab) =>
        renderPickerTab(tab, activeTab.key, (key) => {
          activeKey = key;
          renderActiveTab();
        })
      )
    );
    content.replaceChildren(renderCandidateList(activeTab.candidates, activeType));
  };
  renderActiveTab();

  $buffPicker.replaceChildren(close, topbar, nav, content);
  $buffPicker.hidden = false;
  positionPicker();
}

async function refreshBuffContext() {
  try {
    const nextContext = await invoke("get_buff_overlay_context");
    if (nextContext.actorClass !== buffContext?.actorClass) {
      activeBuffs.clear();
      closePicker();
    }
    buffContext = nextContext;
    $buffTitle.textContent = nextContext.actorClass
      ? `BUFF · ${CLASS_NAMES[nextContext.actorClass] || nextContext.actorClass}`
      : "BUFF";
    renderBuffLayout();
  } catch (_) {
    /* meter may not be running yet */
  }
}

function updateSlotElement(slot, element, now) {
  if (slot.type === "empty") return;

  const buff = activeBuffs.get(buffKey(slot));
  const remainingMs = buff ? Number(buff.localEndMs) - now : 0;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const isActive = remainingSeconds > 0;
  const isExpiring = isActive && remainingMs < 3000 && shouldPlayActivationAnimation(slot);
  const isHiddenInClickThrough = showOnlyActive && !isActive;

  if (element.dataset.active !== String(isActive)) {
    element.dataset.active = String(isActive);
    element.classList.toggle("is-active", isActive);
  }
  if (element.dataset.hiddenInClickThrough !== String(isHiddenInClickThrough)) {
    element.dataset.hiddenInClickThrough = String(isHiddenInClickThrough);
    element.classList.toggle("is-hidden-in-click-through", isHiddenInClickThrough);
  }
  if (element.dataset.expiring !== String(isExpiring)) {
    element.dataset.expiring = String(isExpiring);
    element.classList.toggle("is-expiring", isExpiring);
  }
  if (element.dataset.seconds !== String(remainingSeconds)) {
    element.dataset.seconds = String(remainingSeconds);
    element.querySelector(".buff-slot__duration").textContent =
      remainingSeconds > 0 && shouldShowRemainingTime(slot) ? String(remainingSeconds) : "";
  }
}

function pruneExpiredBuffs(now) {
  for (const [key, buff] of activeBuffs) {
    const localEndMs = Number(buff?.localEndMs);
    if (!Number.isFinite(localEndMs) || localEndMs <= now) {
      activeBuffs.delete(key);
    }
  }
}

function getNextBuffUpdateAt(now) {
  let nextUpdateAt = Infinity;

  for (const buff of activeBuffs.values()) {
    const localEndMs = Number(buff?.localEndMs);
    if (!Number.isFinite(localEndMs) || localEndMs <= now) continue;

    const remainingMs = localEndMs - now;
    const nextSecondBoundary = localEndMs - (Math.ceil(remainingMs / 1000) - 1) * 1000;
    nextUpdateAt = Math.min(nextUpdateAt, nextSecondBoundary, localEndMs);
  }

  return nextUpdateAt;
}

function updateBuffStates() {
  if (updateTimer) {
    window.clearTimeout(updateTimer);
    updateTimer = 0;
  }

  const now = Date.now();

  for (const slot of renderedBuffSlots) {
    const elements = slotElementsByBuffKey.get(buffKey(slot)) || [];
    for (const element of elements) updateSlotElement(slot, element, now);
  }

  pruneExpiredBuffs(now);
  const nextUpdateAt = getNextBuffUpdateAt(now);

  if (Number.isFinite(nextUpdateAt)) {
    const delay = Math.min(1000, Math.max(80, nextUpdateAt - Date.now()));
    updateTimer = window.setTimeout(updateBuffStates, delay);
  }
}

function rememberBuff(type, payload) {
  const localEndMs = Number(payload?.lastEndMs ?? payload?.localEndMs);
  if (!payload?.skillCode || !Number.isFinite(localEndMs)) return;
  activeBuffs.set(`${type}:${skillShortcode(payload.skillCode)}`, {
    ...payload,
    localEndMs,
  });
  updateBuffStates();
}

document.body.addEventListener("mousedown", (event) => {
  if (
    event.button === 0 &&
    !event.target.closest("button, input, label, .buff-config, .buff-picker")
  ) {
    void getCurrentWindow().startDragging();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePicker();
});

document.getElementById("close-btn").addEventListener("click", () => {
  void getCurrentWindow().close();
});

(async function init() {
  applyBuffMonitorSettings();

  window.addEventListener("storage", (event) => {
    if (event.key === APP_CONFIG_STORAGE_KEY) {
      applyBuffMonitorSettings();
      renderBuffLayout();
    }
    if (event.key === LAYOUT_STORAGE_KEY) {
      layoutConfig = loadLayoutConfig();
      renderBuffLayout();
    }
  });

  await listen("buff-monitor-layout-changed", (event) => {
    if (event.payload?.version === 1) {
      layoutConfig = event.payload;
    } else {
      layoutConfig = loadLayoutConfig();
    }
    renderBuffLayout();
  });

  await listen("buff-monitor-lock-toggled", (event) => {
    applyLocked(event.payload?.enabled === true);
  });

  await listen("dps-main-actor-buff", (event) => {
    rememberBuff("selfBuff", event.payload);
  });

  await listen("dps-boss-debuff", (event) => {
    rememberBuff("bossDebuff", event.payload);
  });

  await listen("dps-main-actor-detected", () => {
    void refreshBuffContext();
  });

  await refreshBuffContext();

  try {
    applyLocked(await invoke("get_dps_overlay_locked"));
  } catch (_) {
    applyLocked(false);
  }

  try {
    applyBackground(await invoke("get_overlay_config"));
  } catch (_) {
    applyBackground(null);
  }

  await listen("overlay-config-changed", (event) => {
    applyBackground(event.payload);
  });
})();
