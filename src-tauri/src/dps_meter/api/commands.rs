use tauri::{AppHandle, Emitter, State};

use crate::dps_meter::capture::windivert_capturer::WinDivertStatus;
use crate::dps_meter::config::DpsMeterConfig;
use crate::dps_meter::engine::meter::DpsMeter;
use crate::dps_meter::history::HistoryRecord;
use crate::dps_meter::models::combat::{CombatSnapshot, PvpCombatStatsRow, PvpWatchInfoResponse};
use crate::dps_meter::models::diagnostics::DpsMeterState;
use crate::dps_meter::storage::data_storage::BuffOverlayContext;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRuntimeCheck {
    pub available: bool,
    pub error_code: Option<i32>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureRuntimeStatus {
    pub windivert: CaptureRuntimeCheck,
    pub npcap: CaptureRuntimeCheck,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepairRuntimeResult {
    pub success: bool,
    pub steps: Vec<String>,
    pub error: Option<String>,
}

#[tauri::command]
pub fn apply_dps_meter_config(
    meter: State<'_, DpsMeter>,
    config: DpsMeterConfig,
) -> Result<DpsMeterConfig, String> {
    Ok(meter.apply_config(config))
}

#[tauri::command]
pub fn get_dps_meter_config(meter: State<'_, DpsMeter>) -> Result<DpsMeterConfig, String> {
    Ok(meter.current_config())
}

#[tauri::command]
pub fn start_dps_meter(meter: State<'_, DpsMeter>) -> Result<(), String> {
    meter.start_dps_meter()
}

#[tauri::command]
pub fn get_dps_snapshot(meter: State<'_, DpsMeter>) -> Result<Option<CombatSnapshot>, String> {
    Ok(meter.get_dps_snapshot(0))
}

#[tauri::command]
pub fn get_pvp_watch_info(
    meter: State<'_, DpsMeter>,
    names: Vec<String>,
) -> Result<PvpWatchInfoResponse, String> {
    Ok(meter.get_pvp_watch_info(&names))
}

#[tauri::command]
pub fn get_pvp_combat_stats(meter: State<'_, DpsMeter>) -> Result<Vec<PvpCombatStatsRow>, String> {
    Ok(meter.get_pvp_combat_stats())
}

#[tauri::command]
pub fn clear_pvp_combat_stats(meter: State<'_, DpsMeter>) -> Result<(), String> {
    meter.clear_pvp_combat_stats();
    Ok(())
}

#[tauri::command]
pub fn get_buff_overlay_context(meter: State<'_, DpsMeter>) -> Result<BuffOverlayContext, String> {
    Ok(meter.get_buff_overlay_context())
}

#[tauri::command]
pub fn get_dps_meter_status(meter: State<'_, DpsMeter>) -> Result<bool, String> {
    Ok(meter.is_running())
}

#[tauri::command]
pub fn reset_dps_meter(meter: State<'_, DpsMeter>) -> Result<(), String> {
    meter.reset_dps_meter(true);
    Ok(())
}

#[tauri::command]
pub fn stop_dps_meter(meter: State<'_, DpsMeter>) -> Result<(), String> {
    meter.stop_dps_meter();
    Ok(())
}

#[tauri::command]
pub fn check_dps_meter_state(meter: State<'_, DpsMeter>) -> Result<DpsMeterState, String> {
    Ok(meter.check_state())
}

#[tauri::command]
pub fn get_last_snapshot(meter: State<'_, DpsMeter>) -> Option<CombatSnapshot> {
    meter.get_last_snapshot()
}

#[tauri::command]
pub fn delete_all_history(app: AppHandle, meter: State<'_, DpsMeter>) -> Result<usize, String> {
    let count = meter.delete_all_history();
    if count > 0 {
        let _ = app.emit("history-updated", ());
    }
    Ok(count)
}

#[tauri::command]
pub fn get_history(meter: State<'_, DpsMeter>) -> Result<Vec<HistoryRecord>, String> {
    Ok(meter.get_history())
}

#[tauri::command]
pub fn delete_history_record(
    app: AppHandle,
    meter: State<'_, DpsMeter>,
    id: String,
) -> Result<bool, String> {
    let deleted = meter.delete_history_record(&id);
    if deleted {
        let _ = app.emit("history-updated", ());
    }
    Ok(deleted)
}

#[tauri::command]
pub fn delete_history_records(
    app: AppHandle,
    meter: State<'_, DpsMeter>,
    ids: Vec<String>,
) -> Result<usize, String> {
    let deleted = meter.delete_history_records(&ids);
    if deleted > 0 {
        let _ = app.emit("history-updated", ());
    }
    Ok(deleted)
}

#[tauri::command]
pub fn mark_history_records_uploaded(
    app: AppHandle,
    meter: State<'_, DpsMeter>,
    ids: Vec<String>,
) -> Result<usize, String> {
    let updated = meter.mark_history_records_uploaded(&ids);
    if updated > 0 {
        let _ = app.emit("history-updated", ());
    }
    Ok(updated)
}

#[tauri::command]
pub fn check_npcap_available() -> Result<WinDivertStatus, String> {
    let mut status = crate::dps_meter::capture::windivert_capturer::check_windivert_status();
    if !status.available {
        match crate::dps_meter::capture::capturer::check_npcap_available() {
            Ok(()) => {
                status.available = true;
                status.error_code = None;
                status.error = None;
            }
            Err(npcap_error) => {
                status.error = Some(format!(
                    "{}; Npcap: {npcap_error}",
                    status
                        .error
                        .unwrap_or_else(|| "WinDivert unavailable".to_string())
                ));
            }
        }
    }
    Ok(status)
}

#[tauri::command]
pub fn check_capture_runtime_status() -> Result<CaptureRuntimeStatus, String> {
    let windivert_status = crate::dps_meter::capture::windivert_capturer::check_windivert_status();
    let npcap_status = match crate::dps_meter::capture::capturer::check_npcap_available() {
        Ok(()) => CaptureRuntimeCheck {
            available: true,
            error_code: None,
            error: None,
        },
        Err(error) => CaptureRuntimeCheck {
            available: false,
            error_code: None,
            error: Some(error),
        },
    };

    Ok(CaptureRuntimeStatus {
        windivert: CaptureRuntimeCheck {
            available: windivert_status.available,
            error_code: windivert_status.error_code,
            error: windivert_status.error,
        },
        npcap: npcap_status,
    })
}

#[tauri::command]
pub async fn repair_windivert_runtime() -> Result<RepairRuntimeResult, String> {
    const WINDIVERT_SYS_URL: &str = "https://tguffyzmkjkxqmmosfhf.supabase.co/storage/v1/object/public/windivert/WinDivert64.sys";

    let mut steps = Vec::new();
    steps.push("正在定位安装目录".to_string());

    let exe_path = std::env::current_exe().map_err(|error| error.to_string())?;
    let install_dir = exe_path
        .parent()
        .ok_or_else(|| "无法定位程序安装目录".to_string())?;
    let target_path = install_dir.join("WinDivert64.sys");

    steps.push(format!("安装目录：{}", install_dir.display()));
    steps.push("正在下载 WinDivert64.sys".to_string());

    let response = match reqwest::Client::new().get(WINDIVERT_SYS_URL).send().await {
        Ok(response) => response,
        Err(error) => {
            steps.push("下载失败".to_string());
            return Ok(RepairRuntimeResult {
                success: false,
                steps,
                error: Some(error.to_string()),
            });
        }
    };

    if !response.status().is_success() {
        let status = response.status();
        steps.push(format!("下载失败：HTTP {status}"));
        return Ok(RepairRuntimeResult {
            success: false,
            steps,
            error: Some(format!("HTTP {status}")),
        });
    }

    let bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(error) => {
            steps.push("读取下载内容失败".to_string());
            return Ok(RepairRuntimeResult {
                success: false,
                steps,
                error: Some(error.to_string()),
            });
        }
    };
    steps.push(format!("下载完成：{} bytes", bytes.len()));
    steps.push(format!("正在写入：{}", target_path.display()));

    if let Err(error) = std::fs::write(&target_path, &bytes) {
        steps.push("写入失败".to_string());
        return Ok(RepairRuntimeResult {
            success: false,
            steps,
            error: Some(format!(
                "{error}。如果安装在 Program Files，请以管理员身份运行 NoiA 后重试。"
            )),
        });
    }

    steps.push("WinDivert64.sys 已写入安装目录".to_string());
    steps.push("正在重新检测 WinDivert".to_string());

    let status = crate::dps_meter::capture::windivert_capturer::check_windivert_status();
    if status.available {
        steps.push("WinDivert 修复完成".to_string());
        Ok(RepairRuntimeResult {
            success: true,
            steps,
            error: None,
        })
    } else {
        let error = status
            .error
            .unwrap_or_else(|| "WinDivert 仍然不可用".to_string());
        steps.push(format!("重新检测失败：{error}"));
        Ok(RepairRuntimeResult {
            success: false,
            steps,
            error: Some(error),
        })
    }
}
