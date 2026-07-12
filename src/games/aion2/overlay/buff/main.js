import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import skillsZhCN from "@/i18n/locales/aion2skills/zh-CN.json";

const DEFAULT_BACKGROUND = [0, 0, 0, 102];
const ICON_SIZE_KEY = "aion2-buff-icon-size";
const ICON_GAP_KEY = "aion2-buff-icon-gap";
const LAYOUT_STORAGE_KEY = "aion2-buff-monitor-layout:v1";
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
let buffContext = null;
let layoutConfig = loadLayoutConfig();
let pickerRowId = null;
let idSeed = Date.now();

const $buffList = document.getElementById("buff-list");
const $buffTitle = document.getElementById("buff-title");
const $buffPicker = document.getElementById("buff-picker");
const $iconSizeInput = document.getElementById("icon-size-input");
const $iconSizeOutput = document.getElementById("icon-size-output");
const $iconGapInput = document.getElementById("icon-gap-input");
const $iconGapOutput = document.getElementById("icon-gap-output");

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
  $iconSizeInput.value = String(size);
  $iconSizeOutput.value = `${size}px`;
  return size;
}

function applyIconGap(value) {
  const gap = Math.min(16, Math.max(0, Number(value) || 5));
  document.documentElement.style.setProperty("--buff-icon-gap", `${gap}px`);
  $iconGapInput.value = String(gap);
  $iconGapOutput.value = `${gap}px`;
  return gap;
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

  const remove = document.createElement("button");
  remove.className = "buff-slot__remove";
  remove.type = "button";
  remove.title = "删除";
  remove.textContent = "×";
  remove.addEventListener("click", (event) => {
    event.stopPropagation();
    row.slots = row.slots.filter((item) => item.id !== slot.id);
    saveCurrentLayout(getCurrentLayout());
    renderBuffLayout();
  });
  element.append(remove);

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
  const layout = getCurrentLayout();

  const rows = layout.rows.map((row) => {
    const element = document.createElement("div");
    element.className = "buff-row";
    element.dataset.tauriDragRegion = "";
    element.append(
      ...row.slots.map((slot) => renderSlot(slot, row)),
      renderAddButton(row),
      renderRemoveRowButton(row)
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
  $buffPicker.hidden = true;
  $buffPicker.replaceChildren();
}

function addSlotToPickerRow(slot) {
  const layout = getCurrentLayout();
  const row = layout.rows.find((item) => item.id === pickerRowId);
  if (!row) return;
  row.slots.push({ id: nextId("slot"), ...slot });
  saveCurrentLayout(layout);
  closePicker();
  renderBuffLayout();
}

function renderCandidateButton(slot) {
  const button = document.createElement("button");
  button.className = "buff-picker__item";
  button.type = "button";
  button.title = slot.type === "empty" ? "空位" : skillName(slot.skillCode);
  button.dataset.type = slot.type;
  button.addEventListener("click", () => addSlotToPickerRow(slot));

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

  const name = document.createElement("span");
  name.textContent = skillName(slot.skillCode);
  button.append(icon, name);
  return button;
}

function renderCandidateList(candidates, type) {
  const fragment = document.createDocumentFragment();
  const list = document.createElement("div");
  list.className = "buff-picker__list";
  list.append(
    ...candidates.map((skillCode) => renderCandidateButton({ type, skillCode: skillShortcode(skillCode) }))
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

function openPicker(rowId, anchor) {
  pickerRowId = rowId;
  const currentRow = getCurrentLayout().rows.find((row) => row.id === rowId);
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
    nav.replaceChildren(...tabs.map((tab) => renderPickerTab(tab, activeTab.key, (key) => {
      activeKey = key;
      renderActiveTab();
    })));
    content.replaceChildren(renderCandidateList(activeTab.candidates, activeType));
  };
  renderActiveTab();

  $buffPicker.replaceChildren(close, quickActions, typeSwitch, nav, content);
  $buffPicker.hidden = false;

  const rect = anchor.getBoundingClientRect();
  const top = Math.min(window.innerHeight - 12, rect.bottom + 6);
  $buffPicker.style.top = `${Math.max(36, top)}px`;
  $buffPicker.style.left = "8px";
  $buffPicker.style.right = "8px";
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
  const isExpiring = isActive && remainingMs < 3000;

  if (element.dataset.active !== String(isActive)) {
    const wasActive = element.dataset.active === "true";
    element.dataset.active = String(isActive);
    element.classList.toggle("is-active", isActive);
    if (!wasActive && isActive) {
      element.classList.remove("is-just-activated");
      void element.offsetWidth;
      element.classList.add("is-just-activated");
    }
  }
  if (element.dataset.expiring !== String(isExpiring)) {
    element.dataset.expiring = String(isExpiring);
    element.classList.toggle("is-expiring", isExpiring);
  }
  if (element.dataset.seconds !== String(remainingSeconds)) {
    element.dataset.seconds = String(remainingSeconds);
    element.querySelector(".buff-slot__duration").textContent =
      remainingSeconds > 0 ? String(remainingSeconds) : "";
  }
}

function updateBuffStates() {
  const now = Date.now();
  const layout = getCurrentLayout();
  const slots = layout.rows.flatMap((row) => row.slots);
  for (const slot of slots) {
    const elements = slot.type === "empty" ? [] : slotElementsByBuffKey.get(buffKey(slot)) || [];
    for (const element of elements) updateSlotElement(slot, element, now);
  }
}

function rememberBuff(type, payload) {
  if (!payload?.skillCode || !Number.isFinite(Number(payload.localEndMs))) return;
  activeBuffs.set(`${type}:${skillShortcode(payload.skillCode)}`, payload);
  updateBuffStates();
}

document.body.addEventListener("mousedown", (event) => {
  if (event.button === 0 && !event.target.closest("button, input, label, .buff-config, .buff-picker")) {
    void getCurrentWindow().startDragging();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closePicker();
});

document.getElementById("close-btn").addEventListener("click", () => {
  void getCurrentWindow().close();
});

document.getElementById("add-row-btn").addEventListener("click", addRow);
document.getElementById("clear-config-btn").addEventListener("click", clearLayout);

$iconSizeInput.addEventListener("input", () => {
  const size = applyIconSize($iconSizeInput.value);
  localStorage.setItem(ICON_SIZE_KEY, String(size));
});

$iconGapInput.addEventListener("input", () => {
  const gap = applyIconGap($iconGapInput.value);
  localStorage.setItem(ICON_GAP_KEY, String(gap));
});

(async function init() {
  applyIconSize(localStorage.getItem(ICON_SIZE_KEY));
  applyIconGap(localStorage.getItem(ICON_GAP_KEY));

  await listen("overlay-lock-toggled", (event) => {
    applyLocked(event.payload?.locked === true);
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

  window.setInterval(updateBuffStates, 250);
})();
