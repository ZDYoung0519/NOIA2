import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { uploadDpsDataBatch } from "@/games/aion2/lib/upload-records-to-supbase";
import { t, setLanguage } from "../../i18n.js";

// ── DOM ──
const $list = document.getElementById("record-list");
const $count = document.getElementById("header-count");
const $empty = document.getElementById("empty");
const $upload = document.getElementById("upload-btn");
const $uploadStatus = document.getElementById("upload-status");
let allRecords = [];
let expandedId = null;
let isUploading = false;

document.getElementById("close-btn").addEventListener("click", async () => {
  try {
    await getCurrentWindow().close();
  } catch (_) {
    /* ignore */
  }
});

function setUploadStatus(message, type = "") {
  $uploadStatus.textContent = message;
  $uploadStatus.className = `upload-status${type ? ` is-${type}` : ""}`;
  $uploadStatus.style.display = message ? "block" : "none";
}

function setUploadControlsDisabled(disabled) {
  $upload.disabled = disabled || allRecords.length === 0;
  document.getElementById("delete-all-btn").disabled = disabled || allRecords.length === 0;
  document.querySelectorAll("[data-upload]").forEach((button) => {
    button.disabled = disabled || button.dataset.uploaded === "true";
  });
}

async function markUploaded(ids) {
  if (ids.length === 0) return 0;
  const updated = await invoke("mark_history_records_uploaded", { ids });
  const idSet = new Set(ids);
  allRecords = allRecords.map((record) =>
    idSet.has(record.id) ? { ...record, uploaded: true } : record
  );
  return updated;
}

async function uploadRecords(records, emptyMessage) {
  if (isUploading) return;
  if (records.length === 0) {
    if (emptyMessage) {
      setUploadStatus(emptyMessage, "error");
    }
    return;
  }

  isUploading = true;
  setUploadControlsDisabled(true);
  $upload.textContent = t("dps-history.queueing");
  setUploadStatus(t("dps-history.uploading", { current: 0, total: records.length }), "uploading");

  try {
    const result = await uploadDpsDataBatch(records, {
      onProgress(progress) {
        setUploadStatus(
          t("dps-history.uploadingProgress", {
            current: progress.current,
            total: progress.total,
            queued: progress.queued,
            skipped: progress.skipped,
            failed: progress.failed,
          }),
          "uploading",
        );
      },
    });
    const marked = await markUploaded(result.uploadedRecordIds);
    setUploadStatus(
      t("dps-history.uploadComplete", {
        queued: result.queued,
        skipped: result.skipped,
        failed: result.failed,
        marked: marked,
      }),
      result.failed > 0 ? "error" : "success"
    );
    render(allRecords);
  } catch (error) {
    console.error("[dps-history] queue upload failed:", error);
    setUploadStatus(error?.message || t("dps-history.uploadFailed"), "error");
  } finally {
    isUploading = false;
    $upload.textContent = t("dps-history.upload");
    setUploadControlsDisabled(false);
  }
}

document.getElementById("delete-all-btn").addEventListener("click", async () => {
  if (allRecords.length === 0) {
    setUploadStatus(t("dps-history.noRecordsToDelete"), "error");
    return;
  }
  try {
    const count = await invoke("delete_all_history");
    setUploadStatus(t("dps-history.deletedCount", { count }), "success");
    await load();
  } catch (e) {
    setUploadStatus(e?.message || t("dps-history.deleteFailed"), "error");
  }
});

$upload.addEventListener("click", async () => {
  await uploadRecords(
    allRecords.filter((record) => !record.uploaded),
    t("dps-history.noUnuploadedRecords")
  );
});

// ── Formatters ──
function fmtDamage(n) {
  if (!n) return "0";
  if (n < 1e4) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(1) + "K";
  if (n < 1e9) return (n / 1e6).toFixed(2) + "M";
  return (n / 1e9).toFixed(2) + "B";
}
function fmtTime(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function fmtDps(n) {
  if (!n) return "--";
  return Math.round(n).toLocaleString("en-US");
}
function fmtPct(n) {
  return (n * 100).toFixed(1) + "%";
}
function esc(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}
function getTargetName(r) {
  return r.targetInfo?.targetName || `Target #${r.targetId}`;
}
function getClassIcon(c) {
  return c ? "/aion2/class/" + c.toLowerCase() + ".png" : "";
}
function hasActorName(p) {
  return typeof p?.actorName === "string" && p.actorName.trim().length > 0;
}
function getRecognizedPlayers(record) {
  return Object.values(record.playerStats || {})
    .filter(hasActorName)
    .sort((a, b) => b.totalDamage - a.totalDamage);
}
function getAllPlayers(record) {
  return Object.values(record.playerStats || {}).sort((a, b) => b.totalDamage - a.totalDamage);
}

// ── Render record list ──
function render(records) {
  allRecords = records;
  const lbl = records.length === 1 ? t("dps-history.record") : t("dps-history.records");
  const pendingCount = records.filter((record) => !record.uploaded).length;
  $count.textContent = `${records.length} ${lbl} · ${pendingCount} ${t("dps-history.pending")}`;
  setUploadControlsDisabled(isUploading);

  if (records.length === 0) {
    $empty.style.display = "";
    $list.innerHTML = "";
    setUploadControlsDisabled(isUploading);
    return;
  }
  $empty.style.display = "none";
  records.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

  let html = "";
  for (const r of records) {
    const name = getTargetName(r);
    const isBoss = r.targetInfo?.isBoss;
    const playerCount = getRecognizedPlayers(r).length;
    const uploaded = r.uploaded === true;
    html += `
      <div class="record-row" data-id="${r.id}">
        <button class="record-row__delete" data-delete="${r.id}" title="Delete">&times;</button>
        <div class="record-row__header">
          <span class="record-row__name">${esc(name)}</span>
          <span class="record-row__boss ${isBoss ? "is-boss" : "is-not-boss"}">${isBoss ? t("dps-history.boss") : t("dps-history.mob")}</span>
        </div>
        <div class="record-row__meta">
          <span class="record-row__damage">${fmtDamage(r.totalDamage)}</span>
          <span class="record-row__time">${fmtTime(r.createdAt)}</span>
        </div>
        <div class="record-row__players">${playerCount} ${playerCount === 1 ? t("dps-history.player") : t("dps-history.players")}</div>
        <div class="record-row__actions">
          <span class="record-row__uploaded ${uploaded ? "is-uploaded" : "is-pending"}">${uploaded ? t("dps-history.uploaded") : t("dps-history.notUploaded")}</span>
          <button class="record-row__upload" data-upload="${r.id}" data-uploaded="${uploaded}" ${uploaded ? "disabled" : ""}>${uploaded ? t("dps-history.uploaded") : t("dps-history.upload")}</button>
        </div>
        <div class="record-row__detail" id="detail-${r.id}" style="display:none"></div>
      </div>`;
  }
  $list.innerHTML = html;
  expandedId = null;
  setUploadControlsDisabled(isUploading);
}

// ── Expand record → show player list ──
function toggleExpand(id) {
  const record = allRecords.find((r) => r.id === id);
  if (!record) return;
  const detailEl = document.getElementById("detail-" + id);
  if (!detailEl) return;

  if (expandedId === id) {
    detailEl.style.display = "none";
    expandedId = null;
    return;
  }

  // Collapse previous
  if (expandedId) {
    const prev = document.getElementById("detail-" + expandedId);
    if (prev) prev.style.display = "none";
  }

  const players = getAllPlayers(record);
  let html = `<div class="detail-player-list">`;
  for (const p of players) {
    const icon = getClassIcon(p.actorClass);
    const name = p.actorName || `ID:${p.actorId}`;
    html += `
      <div class="detail-player-row" data-actor-id="${p.actorId}">
        ${icon ? `<img class="detail-player-row__icon" src="${icon}" alt="" onerror="this.style.display='none'"/>` : ""}
        <span class="detail-player-row__name">${esc(name)}</span>
        <span class="detail-player-row__damage">${fmtDamage(p.totalDamage)}</span>
        <span class="detail-player-row__dps">${fmtDps(p.dps)}</span>
        <span class="detail-player-row__share">${fmtPct(p.damageShare)}</span>
      </div>`;
  }
  if (players.length === 0) {
    html += `<div class="detail-player-empty">${t("dps-detail.noData")}</div>`;
  }
  html += `</div>`;
  detailEl.innerHTML = html;
  detailEl.style.display = "";
  expandedId = id;
}

// ── Click handler ──
$list.addEventListener("click", async (e) => {
  // Upload one record
  if (e.target.closest("[data-upload]")) {
    e.stopPropagation();
    e.preventDefault();
    const id = e.target.closest("[data-upload]").dataset.upload;
    const record = allRecords.find((r) => r.id === id);
    if (!record || record.uploaded) return;
    await uploadRecords([record], t("dps-history.noRecordToQueue"));
    return;
  }

  // Delete
  if (e.target.closest("[data-delete]")) {
    e.stopPropagation();
    e.preventDefault();
    try {
      await invoke("delete_history_record", {
        id: e.target.closest("[data-delete]").dataset.delete,
      });
    } catch (_) {}
    return;
  }

  // Player row click → open detail window
  const playerRow = e.target.closest(".detail-player-row");
  if (playerRow) {
    e.stopPropagation();
    const actorId = Number(playerRow.dataset.actorId);
    const record = allRecords.find((r) => r.id === expandedId);
    if (!record || !actorId) return;
    try {
      await invoke("set_detail_selection", {
        value: { actorId, mode: "history", record },
      });
      await invoke("create_dps_detail");
    } catch (_) {}
    return;
  }

  if (e.target.closest(".record-row__detail")) {
    return;
  }

  // Record row click → expand/collapse
  const row = e.target.closest(".record-row");
  if (!row) return;
  toggleExpand(row.dataset.id);
});

// ── Init ──
(async function init() {
  try {
    const lang = await invoke("get_language");
    setLanguage(lang);
  } catch (_) {}

  async function load() {
    try {
      const records = await invoke("get_history");
      render(records);
    } catch (e) {
      console.error("[dps-history] load failed:", e);
    }
  }
  function setEmptyText() {
    $empty.textContent = t("dps-history.empty");
  }
  setEmptyText();

  listen("language-changed", (event) => {
    setLanguage(event.payload.language);
    setEmptyText();
    if (allRecords.length > 0) render(allRecords);
  });

  await load();
  await uploadRecords(
    allRecords.filter((record) => !record.uploaded),
    ""
  );
  listen("history-updated", () => load());
})();
