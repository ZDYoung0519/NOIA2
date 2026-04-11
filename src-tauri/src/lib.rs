mod dps_meter;
mod plugins;
use tauri::{Manager, State};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn update_tray_menu(
    app: tauri::AppHandle,
    show_text: String,
    quit_text: String,
) -> Result<(), String> {
    plugins::system_tray::update_tray_menu(&app, &show_text, &quit_text)
}

#[tauri::command]
fn start_dps_meter(
    meter: State<'_, dps_meter::engine::meter::DpsMeter>,
) -> Result<(), String> {
    meter.start_dps_meter()
}

#[tauri::command]
fn get_dps_snapshot(
    meter: State<'_, dps_meter::engine::meter::DpsMeter>,
) -> Result<Option<dps_meter::models::combat::CombatSnapshot>, String> {
    Ok(meter.get_dps_snapshot(0))
}

#[tauri::command]
fn stop_dps_meter(meter: State<'_, dps_meter::engine::meter::DpsMeter>) -> Result<(), String> {
    meter.stop_dps_meter();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When attempting to start a second instance, focus the existing main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(plugins::system_tray::init())
        .setup(|app| {
            let meter = dps_meter::engine::meter::DpsMeter::new(app.handle().clone());
            app.manage(meter);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            update_tray_menu,
            start_dps_meter,
            get_dps_snapshot,
            stop_dps_meter
        ]);
    // .plugin(tauri_plugin_updater::Builder::new().build());

    // // Only enable updater in release mode
    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
