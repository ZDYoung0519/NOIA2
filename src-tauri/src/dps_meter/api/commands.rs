use tauri::State;

use crate::dps_meter::config::DpsMeterConfig;
use crate::dps_meter::engine::meter::DpsMeter;
use crate::dps_meter::models::combat::CombatSnapshot;

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
    meter.reset_dps_meter();
    Ok(())
}

#[tauri::command]
pub fn stop_dps_meter(meter: State<'_, DpsMeter>) -> Result<(), String> {
    meter.stop_dps_meter();
    Ok(())
}
