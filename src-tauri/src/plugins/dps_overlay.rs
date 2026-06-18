use std::sync::RwLock;

use serde_json::Value;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder,
};

use crate::dps_meter::engine::meter::DpsMeter;

const DPS_OVERLAY_LABEL: &str = "dps-overlay";

/// Create the DPS overlay window and start the DPS meter.
///
/// If the window already exists, it will be shown instead of creating a new one.
/// The window is transparent, always-on-top, and decoration-less.
/// Interaction is controlled via CSS `pointer-events` on the frontend side:
/// - Title bar: interactive (draggable)
/// - Content area: click-through via CSS
#[tauri::command]
pub async fn create_dps_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // Enable auto-show for future focus events
    super::aion2_focus::set_dps_manual_hidden_for_app(&app, false);

    // If window already exists, just show it
    if let Some(window) = app.get_webview_window(DPS_OVERLAY_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        DPS_OVERLAY_LABEL,
        WebviewUrl::App("src/games/aion2/overlay/meter/index.html".into()),
    )
    .title("NoiA | DPS Overlay")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .inner_size(320.0, 240.0)
    .min_inner_size(200.0, 120.0)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    window.show().map_err(|e| e.to_string())?;
    set_dps_overlay_locked_for_app(&app, OVERLAY_LOCKED.load(Ordering::Relaxed))?;

    // Start the DPS meter when overlay opens
    let meter = app.state::<DpsMeter>();
    meter.start_dps_meter()?;

    Ok(())
}

/// Destroy the DPS overlay window and stop the DPS meter.
#[tauri::command]
pub fn destroy_dps_overlay<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    // Stop the DPS meter first
    let meter = app.state::<DpsMeter>();
    meter.stop_dps_meter();

    if let Some(window) = app.get_webview_window(DPS_OVERLAY_LABEL) {
        window.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// =============================================================================
// Overlay config relay (React → store → overlay pull on startup)
// =============================================================================

pub struct OverlayConfigStore(pub RwLock<Value>);

impl Default for OverlayConfigStore {
    fn default() -> Self {
        Self(RwLock::new(Value::Object(serde_json::Map::new())))
    }
}

#[tauri::command]
pub fn get_overlay_config(state: State<'_, OverlayConfigStore>) -> Value {
    state.0.read().unwrap().clone()
}

#[tauri::command]
pub fn set_overlay_config(
    app: AppHandle,
    state: State<'_, OverlayConfigStore>,
    value: Value,
) -> Result<(), String> {
    *state.0.write().unwrap() = value.clone();
    app.emit("overlay-config-changed", value)
        .map_err(|e| e.to_string())?;
    Ok(())
}

// =============================================================================
// Language relay (React → store → all windows pull on startup)
// =============================================================================

pub struct LanguageStore(pub RwLock<String>);

impl Default for LanguageStore {
    fn default() -> Self {
        Self(RwLock::new("zh-CN".into()))
    }
}

#[tauri::command]
pub fn get_language(state: State<'_, LanguageStore>) -> String {
    state.0.read().unwrap().clone()
}

#[tauri::command]
pub fn set_language(
    app: AppHandle,
    state: State<'_, LanguageStore>,
    language: String,
) -> Result<(), String> {
    *state.0.write().unwrap() = language.clone();
    let payload = serde_json::json!({ "language": language });
    app.emit("language-changed", payload)
        .map_err(|e| e.to_string())?;
    Ok(())
}

// =============================================================================
// Detail selection relay (overlay → store → detail pull on startup)
// =============================================================================

pub struct DetailSelectionStore(pub RwLock<Value>);

impl Default for DetailSelectionStore {
    fn default() -> Self {
        Self(RwLock::new(Value::Object(serde_json::Map::new())))
    }
}

#[tauri::command]
pub fn get_detail_selection(state: State<'_, DetailSelectionStore>) -> Value {
    state.0.read().unwrap().clone()
}

#[tauri::command]
pub fn set_detail_selection(
    app: AppHandle,
    state: State<'_, DetailSelectionStore>,
    value: Value,
) -> Result<(), String> {
    *state.0.write().unwrap() = value.clone();
    app.emit("select-player-detail", value)
        .map_err(|e| e.to_string())?;
    Ok(())
}

// =============================================================================
// Lock toggle (click-through)
// =============================================================================

use std::sync::atomic::{AtomicBool, Ordering};

static OVERLAY_LOCKED: AtomicBool = AtomicBool::new(false);

pub fn set_dps_overlay_locked_for_app<R: Runtime>(
    app: &AppHandle<R>,
    locked: bool,
) -> Result<(), String> {
    OVERLAY_LOCKED.store(locked, Ordering::Relaxed);
    if let Some(window) = app.get_webview_window(DPS_OVERLAY_LABEL) {
        window
            .set_ignore_cursor_events(locked)
            .map_err(|e| e.to_string())?;
    }
    let _ = app.emit(
        "overlay-lock-toggled",
        serde_json::json!({ "locked": locked }),
    );
    Ok(())
}

#[tauri::command]
pub fn set_dps_overlay_locked<R: Runtime>(app: AppHandle<R>, locked: bool) -> Result<(), String> {
    set_dps_overlay_locked_for_app(&app, locked)
}

#[tauri::command]
pub async fn toggle_dps_overlay_locked<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let was_locked = OVERLAY_LOCKED.load(Ordering::Relaxed);
    let next = !was_locked;
    set_dps_overlay_locked_for_app(&app, next)
}

// =============================================================================
// Log window
// =============================================================================

const LOG_LABEL: &str = "dps-log";

#[tauri::command]
pub async fn create_dps_log<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(LOG_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        window.unminimize().map_err(|e| e.to_string())?;
        return Ok(());
    }

    WebviewWindowBuilder::new(
        &app,
        LOG_LABEL,
        WebviewUrl::App("src/games/aion2/overlay/log/index.html".into()),
    )
    .title("DPS Log")
    .inner_size(320.0, 1000.0)
    .decorations(false)
    .transparent(true)
    .resizable(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .focusable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    Ok(())
}

// =============================================================================
// Settings window
// =============================================================================

const SETTINGS_LABEL: &str = "dps-settings";

#[tauri::command]
pub async fn create_dps_settings<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let opts = super::window_tracking::TrackedWindowOptions {
        parent_label: DPS_OVERLAY_LABEL.into(),
        child_label: SETTINGS_LABEL.into(),
        url: "/aion2/overlay_setting".into(),
        title: Some("Aion2 Settings".into()),
        width: Some(420.0),
        height: Some(960.0),
        gap: Some(8.0),
        position: Some(super::window_tracking::TrackedWindowPosition::Right),
        decorations: Some(false),
        transparent: Some(true),
        resizable: Some(true),
        shadow: Some(false),
        always_on_top: Some(true),
        skip_taskbar: Some(true),
        focus: Some(false),
        focusable: Some(true),
    };
    super::window_tracking::ensure_tracked_window(app, opts)
}

// =============================================================================
// Detail window
// =============================================================================

const DETAIL_LABEL: &str = "dps-detail";

#[tauri::command]
pub async fn create_dps_detail<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(DETAIL_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        position_detail_right_of_overlay(&app)?;
        // Reload so init() picks up latest selection from get_detail_selection()
        let _ = window.eval("location.reload()");
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        DETAIL_LABEL,
        WebviewUrl::App("src/games/aion2/overlay/detail/index.html".into()),
    )
    .title("NoiA | DPS Detail")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .inner_size(700.0, 360.0)
    .resizable(true)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    position_detail_right_of_overlay(&app)?;
    window.show().map_err(|e| e.to_string())?;

    // Track overlay movement only in follow mode
    if get_detail_window_mode(&app) == "follow" {
        let app_move = app.clone();
        if let Some(parent) = app.get_webview_window(DPS_OVERLAY_LABEL) {
            parent.on_window_event(move |event| {
                if matches!(
                    event,
                    tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
                ) {
                    let _ = position_detail_right_of_overlay(&app_move);
                }
            });
        }
    }

    Ok(())
}

fn get_detail_window_mode<R: Runtime>(app: &AppHandle<R>) -> String {
    app.try_state::<OverlayConfigStore>()
        .and_then(|store| {
            store.0.read().ok().and_then(|cfg| {
                cfg.get("detailWindowMode")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string())
            })
        })
        .unwrap_or_else(|| "follow".to_string())
}

fn position_detail_right_of_overlay<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    if get_detail_window_mode(app) == "center" {
        let child = app
            .get_webview_window(DETAIL_LABEL)
            .ok_or("detail not found")?;
        return child.center().map_err(|e| e.to_string());
    }

    let parent = app
        .get_webview_window(DPS_OVERLAY_LABEL)
        .ok_or("overlay not found")?;
    let child = app
        .get_webview_window(DETAIL_LABEL)
        .ok_or("detail not found")?;
    let pos = parent.outer_position().map_err(|e| e.to_string())?;
    let size = parent.outer_size().map_err(|e| e.to_string())?;
    child
        .set_position(tauri::PhysicalPosition::new(
            pos.x + size.width as i32 + 8,
            pos.y,
        ))
        .map_err(|e| e.to_string())
}

// =============================================================================
// History window (below dps-overlay)
// =============================================================================

const HISTORY_LABEL: &str = "dps-history";
const HISTORY_GAP: f64 = 8.0;

fn position_bottom_of_parent<R: Runtime>(
    app: &AppHandle<R>,
    parent_label: &str,
    child_label: &str,
    gap: f64,
) -> Result<(), String> {
    let parent = app
        .get_webview_window(parent_label)
        .ok_or("parent not found")?;
    let child = app
        .get_webview_window(child_label)
        .ok_or("child not found")?;
    let pos = parent.outer_position().map_err(|e| e.to_string())?;
    let size = parent.outer_size().map_err(|e| e.to_string())?;
    child
        .set_position(tauri::PhysicalPosition::new(
            pos.x,
            pos.y + size.height as i32 + gap as i32,
        ))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn create_dps_history<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(HISTORY_LABEL) {
        window.show().map_err(|e| e.to_string())?;
        position_bottom_of_parent(&app, DPS_OVERLAY_LABEL, HISTORY_LABEL, HISTORY_GAP)?;
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(
        &app,
        HISTORY_LABEL,
        WebviewUrl::App("src/games/aion2/overlay/history/index.html".into()),
    )
    .title("NoiA | DPS History")
    .decorations(false)
    .transparent(true)
    .always_on_top(true)
    .skip_taskbar(true)
    .inner_size(320.0, 600.0)
    .resizable(true)
    .visible(false)
    .build()
    .map_err(|e| e.to_string())?;

    position_bottom_of_parent(&app, DPS_OVERLAY_LABEL, HISTORY_LABEL, HISTORY_GAP)?;

    window.show().map_err(|e| e.to_string())?;

    // Track parent movement — follow it
    let app_move = app.clone();
    let parent = app
        .get_webview_window(DPS_OVERLAY_LABEL)
        .ok_or("parent not found")?;
    parent.on_window_event(move |event| {
        if matches!(
            event,
            tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
        ) {
            let _ =
                position_bottom_of_parent(&app_move, DPS_OVERLAY_LABEL, HISTORY_LABEL, HISTORY_GAP);
        }
        if matches!(event, tauri::WindowEvent::Destroyed) {
            if let Some(w) = app_move.get_webview_window(HISTORY_LABEL) {
                let _ = w.destroy();
            }
        }
    });

    Ok(())
}

// =============================================================================
// Plugin init
// =============================================================================

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("dps-overlay")
        .setup(|app, _| {
            app.manage(OverlayConfigStore::default());
            app.manage(LanguageStore::default());
            app.manage(DetailSelectionStore::default());
            Ok(())
        })
        .build()
}

pub fn hide_dps_v2_windows_for_app<R: Runtime>(app: AppHandle<R>) {
    if let Some(window) = app.get_webview_window(DPS_OVERLAY_LABEL) {
        let _ = window.hide();
    }
}
