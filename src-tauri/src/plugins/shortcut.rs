use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
};

use serde::Deserialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Manager, Runtime, State,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent, ShortcutState};

use super::{aion2_focus, dps_overlay};
use crate::dps_meter::engine::meter::DpsMeter;

// =============================================================================
// Config from frontend
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShortcutConfig {
    pub show_dps_overlay: String,
    pub reset_dps_meter: String,
    pub toggle_lock: String,
}

// =============================================================================
// Internal action enum
// =============================================================================

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum Action {
    ShowDpsOverlay,
    ResetDpsMeter,
    ToggleLock,
}

// =============================================================================
// Registry stored in Tauri state
// =============================================================================

#[derive(Default)]
struct Registry {
    /// shortcut_id (u32 from parsed Shortcut) → action
    actions: HashMap<u32, Action>,
}

pub struct ShortcutStore(Mutex<Registry>);

// =============================================================================
// Helpers
// =============================================================================

fn parse_id(sc: &str) -> Result<u32, String> {
    let parsed: Shortcut = sc.parse::<Shortcut>().map_err(|e| e.to_string())?;
    Ok(parsed.id())
}

fn resolve_action<R: Runtime>(app: &AppHandle<R>, id: u32) -> Option<Action> {
    let store = app.try_state::<ShortcutStore>()?;
    let reg = store.0.lock().ok()?;
    reg.actions.get(&id).copied()
}

// =============================================================================
// Action implementations (stubs — to be filled)
// =============================================================================

fn toggle_dps_overlay<R: Runtime>(app: &AppHandle<R>) {
    let should_hide = app
        .get_webview_window("dps-overlay")
        .map(|w| w.is_visible().unwrap_or(false) && !w.is_minimized().unwrap_or(false))
        .unwrap_or(false);

    if should_hide {
        aion2_focus::set_dps_manual_hidden_for_app(app, true);
        dps_overlay::hide_dps_v2_windows_for_app(app.clone());
    } else {
        aion2_focus::set_dps_manual_hidden_for_app(app, false);
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            let _ = dps_overlay::create_dps_overlay(app).await;
        });
    }
}

fn exec_reset_dps_meter<R: Runtime>(app: &AppHandle<R>) {
    if let Some(meter) = app.try_state::<DpsMeter>() {
        meter.reset_dps_meter(true);
    }
}

fn toggle_lock<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = dps_overlay::toggle_dps_overlay_locked(app).await;
    });
}

fn dispatch<R: Runtime>(app: &AppHandle<R>, action: Action) {
    match action {
        Action::ShowDpsOverlay => toggle_dps_overlay(app),
        Action::ResetDpsMeter => exec_reset_dps_meter(app),
        Action::ToggleLock => toggle_lock(app),
    }
}

// =============================================================================
// Global handler
// =============================================================================

pub fn handle_shortcut<R: Runtime>(app: &AppHandle<R>, sc: &Shortcut, event: ShortcutEvent) {
    eprintln!(
        "[shortcut] event received: {:?} id={}",
        event.state,
        sc.id()
    );
    if event.state != ShortcutState::Pressed {
        return;
    }
    if let Some(action) = resolve_action(app, sc.id()) {
        eprintln!("[shortcut] dispatching action: {:?}", action);
        dispatch(app, action);
    } else {
        eprintln!(
            "[shortcut] no action found for id={} (registered: check sync_shortcuts)",
            sc.id()
        );
    }
}

// =============================================================================
// Command: sync shortcuts from frontend config
// =============================================================================

#[tauri::command]
pub fn sync_shortcuts<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, ShortcutStore>,
    cfg: ShortcutConfig,
) -> Result<(), String> {
    let desired: [(Action, String); 3] = [
        (
            Action::ShowDpsOverlay,
            cfg.show_dps_overlay.trim().to_string(),
        ),
        (
            Action::ResetDpsMeter,
            cfg.reset_dps_meter.trim().to_string(),
        ),
        (Action::ToggleLock, cfg.toggle_lock.trim().to_string()),
    ];

    eprintln!(
        "[shortcut] sync_shortcuts called: show={:?} reset={:?} lock={:?}",
        desired[0].1, desired[1].1, desired[2].1
    );

    // Duplicate check
    let mut seen = HashSet::new();
    for (_, sc) in &desired {
        if sc.is_empty() {
            continue;
        }
        if !seen.insert(sc.clone()) {
            return Err(format!("duplicate shortcut: {sc}"));
        }
    }

    // Wipe all and re-register
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())?;

    let mut actions = HashMap::new();

    for (action, sc) in &desired {
        if sc.is_empty() {
            continue;
        }
        eprintln!("[shortcut] registering: {} -> {:?}", sc, action);
        app.global_shortcut()
            .register(sc.as_str())
            .map_err(|e| format!("register '{sc}' failed: {e}"))?;
        let id = parse_id(sc)?;
        eprintln!("[shortcut] registered id={}", id);
        actions.insert(id, *action);
    }

    let mut reg = state.0.lock().map_err(|e| e.to_string())?;
    reg.actions = actions;
    eprintln!(
        "[shortcut] sync complete, {} shortcuts active",
        reg.actions.len()
    );
    Ok(())
}

// =============================================================================
// Plugin init
// =============================================================================

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::<R>::new("shortcuts")
        .setup(|app, _| {
            app.manage(ShortcutStore(Mutex::new(Registry::default())));
            Ok(())
        })
        .build()
}

/// Build the tauri-plugin-global-shortcut plugin with our handler.
pub fn global_shortcut_plugin() -> impl tauri::plugin::Plugin<tauri::Wry> {
    tauri_plugin_global_shortcut::Builder::new()
        .with_handler(handle_shortcut)
        .build()
}
