import { invoke } from "@tauri-apps/api/core";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import skillsZhCN from "@/i18n/locales/aion2skills/zh-CN.json";

const DEFAULT_BACKGROUND = [0, 0, 0, 102];
const ICON_SIZE_KEY = "aion2-buff-icon-size";
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
const buffs = new Map();
const buffSlots = new Map();
let buffContext = null;
let selectedSkillCodes = new Set();
let compactWindowSize = null;
const $buffList = document.getElementById("buff-list");
const $buffTitle = document.getElementById("buff-title");
const $config = document.getElementById("buff-config");
const $configList = document.getElementById("buff-config-list");
const $configEmpty = document.getElementById("buff-config-empty");
const $iconSizeInput = document.getElementById("icon-size-input");
const $iconSizeOutput = document.getElementById("icon-size-output");

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

function applyLocked(locked) {
  document.body.classList.toggle("is-click-through", locked);

  if (locked && !$config.hidden) {
    $config.hidden = true;
    if (compactWindowSize) {
      void getCurrentWindow().setSize(compactWindowSize);
      compactWindowSize = null;
    }
  }
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

function storageKey(actorClass) {
  return `aion2-buff-monitor:${actorClass}`;
}

function loadSelectedSkillCodes(context) {
  if (!context?.actorClass) return new Set();
  const candidates = new Set(context.selfBuffCandidateSkillCodes || []);

  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(context.actorClass)));
    if (Array.isArray(saved)) {
      return new Set(saved.map(skillShortcode).filter((skillCode) => candidates.has(skillCode)));
    }
  } catch (_) {
    /* use template defaults */
  }

  return new Set();
}

function saveSelectedSkillCodes() {
  if (!buffContext?.actorClass) return;
  localStorage.setItem(storageKey(buffContext.actorClass), JSON.stringify([...selectedSkillCodes]));
}

function renderConfig() {
  const candidates = buffContext?.selfBuffCandidateSkillCodes || [];
  $configEmpty.hidden = candidates.length > 0;
  $configList.replaceChildren(
    ...candidates.map((skillCode) => {
      const label = document.createElement("label");
      label.className = "buff-config__item";

      const order = document.createElement("span");
      order.className = "buff-config__order";
      const selectedOrder = [...selectedSkillCodes].indexOf(skillCode);
      order.textContent = selectedOrder >= 0 ? String(selectedOrder + 1) : "";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = selectedSkillCodes.has(skillCode);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedSkillCodes.add(skillCode);
        else selectedSkillCodes.delete(skillCode);
        saveSelectedSkillCodes();
        renderConfig();
        renderBuffSlots();
      });

      const resolvedId = resolveSkillId(skillCode);
      const icon = document.createElement("img");
      icon.src = `/aion2/skill/${resolvedId.length === 6 ? resolvedId : resolvedId.slice(0, 4)}.png`;
      icon.alt = "";
      icon.draggable = false;
      icon.addEventListener("error", () => icon.remove(), { once: true });

      const name = document.createElement("span");
      name.textContent = skillName(skillCode);

      label.append(order, checkbox, icon, name);
      return label;
    })
  );
}

async function refreshBuffContext() {
  try {
    const nextContext = await invoke("get_buff_overlay_context");
    if (nextContext.actorClass !== buffContext?.actorClass) {
      buffs.clear();
      buffContext = nextContext;
      selectedSkillCodes = loadSelectedSkillCodes(nextContext);
    } else {
      buffContext = nextContext;
    }
    $buffTitle.textContent = nextContext.actorClass
      ? `BUFF · ${CLASS_NAMES[nextContext.actorClass] || nextContext.actorClass}`
      : "BUFF";
    renderConfig();
    renderBuffSlots();
  } catch (_) {
    /* meter may not be running yet */
  }
}

function updateBuffSlot(skillCode, now = Date.now()) {
  const slot = buffSlots.get(String(skillCode));
  if (!slot) return;

  const buff = buffs.get(String(skillCode));
  const remainingMs = buff ? Number(buff.localEndMs) - now : 0;
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const isActive = remainingSeconds > 0;
  const isExpiring = isActive && remainingMs < 3000;

  if (slot.dataset.active !== String(isActive)) {
    slot.dataset.active = String(isActive);
    slot.classList.toggle("is-active", isActive);
  }
  if (slot.dataset.expiring !== String(isExpiring)) {
    slot.dataset.expiring = String(isExpiring);
    slot.classList.toggle("is-expiring", isExpiring);
  }
  if (slot.dataset.seconds !== String(remainingSeconds)) {
    slot.dataset.seconds = String(remainingSeconds);
    slot.querySelector(".buff-slot__duration").textContent =
      remainingSeconds > 0 ? String(remainingSeconds) : "";
  }
}

function updateBuffStates() {
  const now = Date.now();
  for (const skillCode of selectedSkillCodes) updateBuffSlot(skillCode, now);
}

function renderBuffSlots() {
  buffSlots.clear();

  const slots = [...selectedSkillCodes].map((skillCode) => {
    const resolvedId = resolveSkillId(skillCode);
    const slot = document.createElement("div");
    slot.className = "buff-slot is-player-buff";
    slot.title = skillName(skillCode);
    slot.dataset.tauriDragRegion = "";

    const icon = document.createElement("img");
    icon.className = "buff-slot__icon";
    icon.src = `/aion2/skill/${resolvedId.length === 6 ? resolvedId : resolvedId.slice(0, 4)}.png`;
    icon.alt = "";
    icon.draggable = false;
    icon.addEventListener("error", () => slot.classList.add("has-no-icon"), { once: true });

    const duration = document.createElement("span");
    duration.className = "buff-slot__duration";

    slot.append(icon, duration);
    buffSlots.set(String(skillCode), slot);
    return slot;
  });

  $buffList.replaceChildren(...slots);
  updateBuffStates();
}

document.body.addEventListener("mousedown", (event) => {
  if (event.button === 0 && !event.target.closest("button, input, label, .buff-config")) {
    void getCurrentWindow().startDragging();
  }
});

document.getElementById("close-btn").addEventListener("click", () => {
  void getCurrentWindow().close();
});

document.getElementById("clear-config-btn").addEventListener("click", () => {
  selectedSkillCodes.clear();
  saveSelectedSkillCodes();
  renderConfig();
  renderBuffSlots();
});

$iconSizeInput.addEventListener("input", () => {
  const size = applyIconSize($iconSizeInput.value);
  localStorage.setItem(ICON_SIZE_KEY, String(size));
});

document.getElementById("config-btn").addEventListener("click", async () => {
  const opening = $config.hidden;
  $config.hidden = !opening;
  const window = getCurrentWindow();

  try {
    const scaleFactor = await window.scaleFactor();
    if (opening) {
      const size = await window.innerSize();
      compactWindowSize = new LogicalSize(size.width / scaleFactor, size.height / scaleFactor);
      await window.setSize(
        new LogicalSize(compactWindowSize.width, Math.max(compactWindowSize.height, 360))
      );
    } else if (compactWindowSize) {
      await window.setSize(compactWindowSize);
      compactWindowSize = null;
    }
  } catch (_) {
    /* keep the current size */
  }
});

(async function init() {
  applyIconSize(localStorage.getItem(ICON_SIZE_KEY));

  await listen("overlay-lock-toggled", (event) => {
    applyLocked(event.payload?.locked === true);
  });

  await listen("dps-main-actor-buff", (event) => {
    const buff = event.payload;
    if (!buff?.skillCode || !Number.isFinite(Number(buff.localEndMs))) return;
    const shortcode = skillShortcode(buff.skillCode);
    buffs.set(String(shortcode), buff);
    updateBuffSlot(shortcode);
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
