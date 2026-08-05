import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

const STORAGE_KEY = "app-config";
const QUERY_INTERVAL_MS = 5_000;
const RENDER_INTERVAL_MS = 1_000;
let timers = [];

const translations = {
  en: {
    title: "Map Bosses",
    description: "Live Boss countdowns",
    empty: "No Boss timers found",
    emptyHint: "Open the map in Aion 2 to load the timers.",
    map: "Map",
    ready: "Ready",
    close: "Close",
  },
  "zh-CN": {
    title: "地图 Boss",
    description: "实时刷新首领倒计时",
    empty: "尚未获取 Boss 计时",
    emptyHint: "请在永恒之塔 2 中打开地图以加载计时。",
    map: "地图",
    ready: "已刷新",
    close: "关闭",
  },
  "zh-TW": {
    title: "地圖 Boss",
    description: "即時更新首領倒數",
    empty: "尚未取得 Boss 計時",
    emptyHint: "請在永恆之塔 2 中開啟地圖以載入計時。",
    map: "地圖",
    ready: "已刷新",
    close: "關閉",
  },
  ko: {
    title: "필드 보스",
    description: "실시간 보스 카운트다운",
    empty: "보스 타이머가 없습니다",
    emptyHint: "아이온 2에서 지도를 열어 타이머를 불러오세요.",
    map: "지도",
    ready: "등장",
    close: "닫기",
  },
};

function getLanguage() {
  try {
    const config = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    const language = config?.app?.language;
    return language in translations ? language : "zh-CN";
  } catch (error) {
    console.error("[event-timer-boss] failed to read language config:", error);
    return "zh-CN";
  }
}

function applyLanguage() {
  const language = getLanguage();
  const dictionary = translations[language];
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key && dictionary[key]) element.textContent = dictionary[key];
  });
  document.getElementById("close-button").ariaLabel = dictionary.close;
}

function formatCountdown(targetMs, dictionary) {
  const remainingSeconds = Math.max(0, Math.ceil((targetMs - Date.now()) / 1_000));
  if (remainingSeconds === 0) return dictionary.ready;
  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);
  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  const seconds = remainingSeconds % 60;
  const clock = [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  return days > 0 ? `${days}d ${clock}` : clock;
}

function render() {
  const list = document.getElementById("boss-list");
  const dictionary = translations[getLanguage()];
  list.replaceChildren();

  if (timers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = dictionary.empty;
    const hint = document.createElement("span");
    hint.textContent = dictionary.emptyHint;
    empty.append(title, hint);
    list.append(empty);
    return;
  }

  const sortedTimers = [...timers].sort((left, right) => left.targetMs - right.targetMs);
  for (const timer of sortedTimers) {
    const row = document.createElement("div");
    row.className = "boss-row";
    const icon = document.createElement("img");
    icon.src = "/aion2/bossIcon.png";
    icon.alt = "";
    const info = document.createElement("div");
    info.className = "boss-info";
    const name = document.createElement("strong");
    name.textContent = timer.name || `Boss ${timer.mobCode}`;
    const meta = document.createElement("span");
    meta.textContent = `${dictionary.map} ${timer.mapId} · ${timer.mobCode}`;
    const countdown = document.createElement("time");
    countdown.dateTime = new Date(timer.targetMs).toISOString();
    countdown.textContent = formatCountdown(timer.targetMs, dictionary);
    info.append(name, meta);
    row.append(icon, info, countdown);
    list.append(row);
  }
}

async function refresh() {
  try {
    timers = await invoke("get_field_boss_timers");
    render();
  } catch (error) {
    console.error("[event-timer-boss] failed to query field boss timers:", error);
  }
}

document.getElementById("close-button").addEventListener("click", async () => {
  try {
    await getCurrentWindow().close();
  } catch (error) {
    console.error("[event-timer-boss] failed to close window:", error);
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) applyLanguage();
});

applyLanguage();
render();
void refresh();
setInterval(render, RENDER_INTERVAL_MS);
setInterval(() => void refresh(), QUERY_INTERVAL_MS);
