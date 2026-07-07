mod dps_meter;
mod plugins;

use tauri::{Manager, RunEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_window_state::StateFlags;

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
fn show_system_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When attempting to start a second instance, focus the existing main window
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
                let _ = window.unminimize();
                let _ = window.show();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(plugins::logger::init())
        .plugin(plugins::shortcut::global_shortcut_plugin())
        .plugin(plugins::shortcut::init())
        .plugin(plugins::system_tray::init())
        .plugin(plugins::aion2_overlay::init())
        .plugin(plugins::aion2_focus::init())
        .plugin(plugins::window_tracking::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            update_tray_menu,
            show_system_notification,
            plugins::system_tray::quit_application,
            plugins::logger::get_app_logger_debug_enabled,
            plugins::logger::set_app_logger_debug_enabled,
            plugins::http::http_request,
            dps_meter::api::commands::apply_dps_meter_config,
            dps_meter::api::commands::get_dps_meter_config,
            dps_meter::api::commands::start_dps_meter,
            dps_meter::api::commands::get_dps_snapshot,
            dps_meter::api::commands::get_pvp_watch_info,
            dps_meter::api::commands::get_dps_meter_status,
            dps_meter::api::commands::reset_dps_meter,
            dps_meter::api::commands::stop_dps_meter,
            dps_meter::api::commands::check_dps_meter_state,
            dps_meter::api::commands::get_last_snapshot,
            dps_meter::api::commands::get_history,
            dps_meter::api::commands::delete_all_history,
            dps_meter::api::commands::delete_history_record,
            dps_meter::api::commands::mark_history_records_uploaded,
            dps_meter::api::commands::check_npcap_available,
            plugins::aion2_overlay::create_dps_overlay,
            plugins::aion2_overlay::destroy_dps_overlay,
            plugins::aion2_overlay::create_pvp_overlay,
            plugins::aion2_overlay::create_dps_history,
            plugins::aion2_overlay::toggle_dps_overlay_locked,
            plugins::aion2_overlay::set_dps_overlay_locked,
            plugins::aion2_overlay::create_dps_log,
            plugins::aion2_overlay::create_dps_detail,
            plugins::aion2_overlay::create_dps_settings,
            plugins::window_tracking::ensure_tracked_window,
            plugins::aion2_overlay::get_overlay_config,
            plugins::aion2_overlay::set_overlay_config,
            plugins::aion2_overlay::get_language,
            plugins::aion2_overlay::set_language,
            plugins::aion2_overlay::get_detail_selection,
            plugins::aion2_overlay::set_detail_selection,
            plugins::aion2_focus::set_dps_manual_hidden,
            plugins::aion2_focus::set_auto_hide_enabled,
            plugins::aion2_focus::set_dps_always_on_top,
            plugins::shortcut::sync_shortcuts,
        ])
        .setup(|app| {
            let logger = app
                .state::<std::sync::Arc<plugins::logger::AppLogger>>()
                .inner()
                .clone();
            let meter = dps_meter::engine::meter::DpsMeter::new(app.handle().clone(), logger);
            app.manage(meter);
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            app.deep_link().register_all()?;
            Ok(())
        });

    // // Only enable updater in release mode
    // #[cfg(not(debug_assertions))]
    // let builder = builder.plugin(tauri_plugin_updater::Builder::new().build());

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::ExitRequested { api, .. } = event {
            if let Some(state) = app_handle.try_state::<plugins::system_tray::AppLifecycleState>() {
                if !plugins::system_tray::should_allow_exit(state) {
                    api.prevent_exit();
                }
            }
        }
    });
}
