mod dps_meter;
mod plugins;

use crate::plugins::window_tracking::{ensure_tracked_window, TrackedWindowOptions, TrackedWindowPosition};
use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

#[cfg(any(windows, target_os = "linux"))]
use tauri_plugin_deep_link::DeepLinkExt;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(plugins::aion2_focus::init())
        .plugin(plugins::system_tray::init())
        .plugin(plugins::window_tracking::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            update_tray_menu,
            dps_meter::api::commands::apply_dps_meter_config,
            dps_meter::api::commands::get_dps_meter_config,
            dps_meter::api::commands::start_dps_meter,
            dps_meter::api::commands::get_dps_snapshot,
            dps_meter::api::commands::get_dps_meter_status,
            dps_meter::api::commands::reset_dps_meter,
            dps_meter::api::commands::stop_dps_meter,
            dps_meter::api::commands::check_npcap_available,
            plugins::aion2_focus::set_dps_manual_hidden,
            plugins::aion2_focus::set_auto_hide_enabled,
            plugins::http::http_request,
            plugins::window_tracking::ensure_tracked_window,
            plugins::window_tracking::resize_window,
            plugins::window_tracking::get_window_size
        ])
        .setup(|app| {
            #[cfg(any(windows, target_os = "linux"))]
            {
                app.deep_link().register_all()?;
            }

            let meter = dps_meter::engine::meter::DpsMeter::new(app.handle().clone());
            app.manage(meter);
            if let Some(window) = app.get_webview_window("dps_v2") {
                let _ = window.show();
                let _ = window.unminimize();
            }
            let _ = ensure_tracked_window(
                app.handle().clone(),
                TrackedWindowOptions {
                    parent_label: "dps_v2".to_string(),
                    child_label: "dps_ping".to_string(),
                    url: "/dps_ping".to_string(),
                    title: Some("DPS Ping".to_string()),
                    width: Some(150.0),
                    height: Some(20.0),
                    gap: Some(0.0),
                    position: Some(TrackedWindowPosition::Bottom),
                    decorations: Some(false),
                    transparent: Some(true),
                    resizable: Some(true),
                    shadow: Some(false),
                    always_on_top: Some(true),
                    skip_taskbar: Some(true),
                    focus: Some(false),
                    focusable: Some(false),
                },
            );
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Ok(())
        });

    #[cfg(not(debug_assertions))]
    let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());
    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
