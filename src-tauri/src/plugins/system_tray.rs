use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime, WebviewWindow, WebviewWindowBuilder,
};

fn ensure_main_window<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, String> {
    if let Some(window) = app.get_webview_window("main") {
        return Ok(window);
    }

    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|config| config.label == "main")
        .ok_or_else(|| "main window config not found".to_string())?;

    WebviewWindowBuilder::from_config(app, window_config)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    match ensure_main_window(app) {
        Ok(window) => {
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
        Err(error) => {
            eprintln!("failed to show main window from tray: {error}");
        }
    }
}

// Update tray menu with localized text
pub fn update_tray_menu(app: &AppHandle, show_text: &str, quit_text: &str) -> Result<(), String> {
    let menu = Menu::with_id_and_items(
        app,
        "system-tray",
        &[
            &MenuItem::with_id(app, "show", show_text, true, None::<&str>)
                .map_err(|e| e.to_string())?,
            &PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?,
            &MenuItem::with_id(app, "quit", quit_text, true, None::<&str>)
                .map_err(|e| e.to_string())?,
        ],
    )
    .map_err(|e| e.to_string())?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("system-tray")
        .setup(|app, _| {
            // Create tray menu with default English text
            let menu = Menu::with_id_and_items(
                app,
                "system-tray",
                &[
                    &MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
                ],
            )?;

            // Build tray icon
            TrayIconBuilder::with_id("main-tray")
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Tauri App Template")
                .show_menu_on_left_click(false)
                .on_tray_icon_event(|tray, event| match event {
                    TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } => {
                        let app = tray.app_handle();
                        show_main_window(&app);
                    }
                    _ => {}
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        show_main_window(app);
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        // .on_window_ready(move |window| {
        //     let window_clone = window.clone();
        //     window.on_window_event(move |event| {
        //         if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        //             if window_clone.label() == "main" {
        //                 let _ = window_clone.hide();
        //                 api.prevent_close();
        //             }
        //         }
        //     });
        // })
        .build()
}
