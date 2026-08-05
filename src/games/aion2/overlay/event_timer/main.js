import { invoke } from "@tauri-apps/api/core";

const STORAGE_KEY = "app-config";
const QUERY_INTERVAL_MS = 5_000;
const RENDER_INTERVAL_MS = 1_000;
const RIFT_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

let bossTimers = [];

const translations = {
  en: {
    mapBoss: "Map Boss",
    openMap: "Open map",
    ready: "Ready",
    shugoFestival: "Shugo Festival",
    dimensionalInvasion: "Dimensional Invasion",
    spaceTimeRift: "Space-Time Rift",
  },
  "zh-CN": {
    mapBoss: "地图 Boss",
    openMap: "请打开地图",
    ready: "已刷新",
    shugoFestival: "树古庆典",
    dimensionalInvasion: "次元入侵",
    spaceTimeRift: "时空裂缝",
  },
  "zh-TW": {
    mapBoss: "地圖 Boss",
    openMap: "請開啟地圖",
    ready: "已刷新",
    shugoFestival: "樹古慶典",
    dimensionalInvasion: "次元入侵",
    spaceTimeRift: "時空裂縫",
  },
  ko: {
    mapBoss: "필드 보스",
    openMap: "지도를 열어주세요",
    ready: "등장",
    shugoFestival: "슈고 축제",
    dimensionalInvasion: "차원 침공",
    spaceTimeRift: "시공의 균열",
  },
};

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("[event-timer] failed to read config:", error);
    return {};
  }
}

function getLanguage() {
  const language = getConfig()?.app?.language;
  return language in translations ? language : "zh-CN";
}

function shouldShowBoss() {
  return getConfig()?.aion2?.eventReminder?.showFieldBossTimers !== false;
}

function applyLanguage() {
  const language = getLanguage();
  const dictionary = translations[language];
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key && dictionary[key]) element.textContent = dictionary[key];
  });
}

function nextHourly(now) {
  const next = new Date(now);
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next.getTime();
}

function nextHalfHourly(now) {
  const next = new Date(now);
  if (next.getMinutes() < 30) next.setMinutes(30, 0, 0);
  else {
    next.setMinutes(30, 0, 0);
    next.setHours(next.getHours() + 1);
  }
  return next.getTime();
}

function nextRift(now) {
  for (const hour of RIFT_HOURS) {
    const candidate = new Date(now);
    candidate.setHours(hour, 0, 0, 0);
    if (candidate.getTime() > now) return candidate.getTime();
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(RIFT_HOURS[0], 0, 0, 0);
  return tomorrow.getTime();
}

function formatCountdown(targetMs) {
  const secondsLeft = Math.max(0, Math.ceil((targetMs - Date.now()) / 1_000));
  const hours = Math.floor(secondsLeft / 3_600);
  const minutes = Math.floor((secondsLeft % 3_600) / 60);
  const seconds = secondsLeft % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function nearestBossTimer() {
  const now = Date.now();
  return bossTimers
    .filter((timer) => timer.targetMs >= now - 300_000)
    .sort((left, right) => left.targetMs - right.targetMs)[0];
}

function render() {
  const dictionary = translations[getLanguage()];
  const bossRow = document.getElementById("boss-row");
  const bossName = document.getElementById("boss-name");
  const bossTime = document.getElementById("boss-time");
  bossRow.hidden = !shouldShowBoss();

  const boss = nearestBossTimer();
  if (boss) {
    bossName.textContent = boss.name || `Boss ${boss.mobCode}`;
    bossTime.textContent =
      boss.targetMs <= Date.now() ? dictionary.ready : formatCountdown(boss.targetMs);
  } else {
    bossName.textContent = dictionary.mapBoss;
    bossTime.textContent = dictionary.openMap;
  }

  const now = Date.now();
  document.getElementById("shugo-time").textContent = formatCountdown(nextHourly(now));
  document.getElementById("invasion-time").textContent = formatCountdown(nextHalfHourly(now));
  document.getElementById("rift-time").textContent = formatCountdown(nextRift(now));
}

async function refreshBossTimers() {
  if (!shouldShowBoss()) return;
  try {
    bossTimers = await invoke("get_field_boss_timers");
    render();
  } catch (error) {
    console.error("[event-timer] failed to query field boss timers:", error);
  }
}

document.getElementById("boss-row").addEventListener("click", async () => {
  try {
    await invoke("toggle_event_timer_boss_window");
  } catch (error) {
    console.error("[event-timer] failed to toggle Boss timer window:", error);
  }
});

window.addEventListener("storage", (event) => {
  if (event.key === STORAGE_KEY) {
    applyLanguage();
    render();
    void refreshBossTimers();
  }
});

applyLanguage();
render();
void refreshBossTimers();
setInterval(render, RENDER_INTERVAL_MS);
setInterval(() => void refreshBossTimers(), QUERY_INTERVAL_MS);
