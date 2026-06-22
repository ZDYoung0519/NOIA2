use tauri::{AppHandle, Emitter, State};

use crate::dps_meter::config::DpsMeterConfig;
use crate::dps_meter::engine::meter::DpsMeter;
use crate::dps_meter::history::HistoryRecord;
use crate::dps_meter::models::combat::CombatSnapshot;
use crate::dps_meter::models::diagnostics::DpsMeterState;

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
pub fn check_npcap_available() -> Result<bool, String> {
    match unsafe { libloading::Library::new("wpcap.dll") } {
        Ok(lib) => {
            drop(lib);
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}
