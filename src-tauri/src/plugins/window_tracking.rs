use std::collections::HashSet;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

pub struct TrackedWindowPairs(pub Mutex<HashSet<String>>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackedWindowOptions {
    pub parent_label: String,
    pub child_label: String,
    pub url: String,
    pub title: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub gap: Option<f64>,
    pub decorations: Option<bool>,
    pub transparent: Option<bool>,
    pub resizable: Option<bool>,
    pub shadow: Option<bool>,
    pub always_on_top: Option<bool>,
    pub skip_taskbar: Option<bool>,
}

fn pair_key(parent_label: &str, child_label: &str) -> String {
    format!("{parent_label}->{child_label}")
}

fn position_child_next_to_parent<R: Runtime>(
    parent_window: &WebviewWindow<R>,
    child_window: &WebviewWindow<R>,
    gap: f64,
) -> Result<(), String> {
    let parent_position = parent_window.outer_position().map_err(|e| e.to_string())?;
    let parent_size = parent_window.outer_size().map_err(|e| e.to_string())?;

    child_window
        .set_position(PhysicalPosition::new(
            parent_position.x + parent_size.width as i32 + gap as i32,
            parent_position.y,
        ))
        .map_err(|e| e.to_string())
}

fn schedule_position_sync<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    child_label: &str,
    gap: f64,
) {
    let app = app.clone();
    let parent_label = parent_label.to_string();
    let child_label = child_label.to_string();

    std::thread::spawn(move || {
        for delay_ms in [30u64, 80, 160] {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
            let Some(parent) = app.get_webview_window(&parent_label) else {
                return;
            };
            let Some(child) = app.get_webview_window(&child_label) else {
                return;
            };
            let _ = position_child_next_to_parent(&parent, &child, gap);
        }
    });
}

fn register_tracking_if_needed<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    child_label: &str,
    gap: f64,
) -> Result<(), String> {
    let key = pair_key(parent_label, child_label);
    let tracked_pairs_state = app.state::<TrackedWindowPairs>();
    let mut tracked_pairs = tracked_pairs_state
        .0
        .lock()
        .map_err(|_| "failed to lock tracked window pairs".to_string())?;

    if tracked_pairs.contains(&key) {
        return Ok(());
    }

    let parent_window = app
        .get_webview_window(parent_label)
        .ok_or_else(|| format!("parent window '{parent_label}' not found"))?;
    let child_window = app
        .get_webview_window(child_label)
        .ok_or_else(|| format!("child window '{child_label}' not found"))?;

    tracked_pairs.insert(key.clone());
    drop(tracked_pairs);

    let app_for_move = app.clone();
    let parent_for_move = parent_label.to_string();
    let child_for_move = child_label.to_string();
    parent_window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) | WindowEvent::Resized(_) => {
            let Some(parent) = app_for_move.get_webview_window(&parent_for_move) else {
                return;
            };
            let Some(child) = app_for_move.get_webview_window(&child_for_move) else {
                return;
            };
            let _ = position_child_next_to_parent(&parent, &child, gap);
        }
        WindowEvent::Destroyed => {
            if let Some(child) = app_for_move.get_webview_window(&child_for_move) {
                let _ = child.close();
            }
        }
        _ => {}
    });

    let app_for_cleanup = app.clone();
    let key_for_cleanup = key;
    child_window.on_window_event(move |event| {
        if let WindowEvent::Destroyed = event {
            if let Ok(mut tracked) = app_for_cleanup.state::<TrackedWindowPairs>().0.lock() {
                tracked.remove(&key_for_cleanup);
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn ensure_tracked_window<R: Runtime>(
    app: AppHandle<R>,
    options: TrackedWindowOptions,
) -> Result<(), String> {
    let gap = options.gap.unwrap_or(10.0);
    let width = options.width.unwrap_or(520.0);
    let height = options.height.unwrap_or(620.0);
    let parent_window = app
        .get_webview_window(&options.parent_label)
        .ok_or_else(|| format!("parent window '{}' not found", options.parent_label))?;

    if let Some(existing_window) = app.get_webview_window(&options.child_label) {
        let _ = existing_window.show();
        let _ = existing_window.unminimize();
        let _ = existing_window.set_focus();
        position_child_next_to_parent(&parent_window, &existing_window, gap)?;
        register_tracking_if_needed(&app, &options.parent_label, &options.child_label, gap)?;
        schedule_position_sync(&app, &options.parent_label, &options.child_label, gap);
        return Ok(());
    }

    let child_window = WebviewWindowBuilder::new(
        &app,
        &options.child_label,
        WebviewUrl::App(options.url.into()),
    )
    .title(options.title.unwrap_or_else(|| "DPS Detail".to_string()))
    .inner_size(width, height)
    .decorations(options.decorations.unwrap_or(false))
    .transparent(options.transparent.unwrap_or(true))
    .resizable(options.resizable.unwrap_or(true))
    .shadow(options.shadow.unwrap_or(false))
    .always_on_top(options.always_on_top.unwrap_or(true))
    .skip_taskbar(options.skip_taskbar.unwrap_or(true))
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    child_window.show().map_err(|e| e.to_string())?;
    child_window.unminimize().map_err(|e| e.to_string())?;
    child_window.set_focus().map_err(|e| e.to_string())?;
    position_child_next_to_parent(&parent_window, &child_window, gap)?;
    register_tracking_if_needed(&app, &options.parent_label, &options.child_label, gap)?;
    schedule_position_sync(&app, &options.parent_label, &options.child_label, gap);

    Ok(())
}

#[tauri::command]
pub fn resize_window<R: Runtime>(
    app: AppHandle<R>,
    label: String,
    width: Option<f64>,
    height: Option<f64>,
) -> Result<(), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window '{label}' not found"))?;
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let current_size = window.inner_size().map_err(|e| e.to_string())?;
    let logical_size = current_size.to_logical::<f64>(scale_factor);

    window
        .set_size(LogicalSize::new(
            width.unwrap_or(logical_size.width).max(10.0),
            height.unwrap_or(logical_size.height).max(10.0),
        ))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_window_size<R: Runtime>(app: AppHandle<R>, label: String) -> Result<(f64, f64), String> {
    let window = app
        .get_webview_window(&label)
        .ok_or_else(|| format!("window '{label}' not found"))?;
    let scale_factor = window.scale_factor().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let logical_size = size.to_logical::<f64>(scale_factor);
    Ok((logical_size.width, logical_size.height))
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("window-tracking")
        .setup(|app, _| {
            app.manage(TrackedWindowPairs(Mutex::new(HashSet::new())));
            Ok(())
        })
        .build()
}
