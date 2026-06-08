use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime, State,
};

const AION2_PROCESS_NAME: &str = "Aion2.exe";
const FOLLOW_FOCUS_WINDOW_LABELS: [&str; 4] = ["dps", "dps_new", "dps_v2", "dps_ping"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Aion2FocusChangedPayload {
    focused: bool,
    process_name: Option<String>,
}

pub struct Aion2FocusState {
    dps_manual_hidden: AtomicBool,
    auto_hide_enabled: AtomicBool,
}

impl Default for Aion2FocusState {
    fn default() -> Self {
        Self {
            dps_manual_hidden: AtomicBool::new(true),
            auto_hide_enabled: AtomicBool::new(true),
        }
    }
}

#[tauri::command]
pub fn set_dps_manual_hidden(state: State<'_, Aion2FocusState>, hidden: bool) {
    state.dps_manual_hidden.store(hidden, Ordering::Relaxed);
}

#[tauri::command]
pub fn set_auto_hide_enabled(state: State<'_, Aion2FocusState>, enabled: bool) {
    state.auto_hide_enabled.store(enabled, Ordering::Relaxed);
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("aion2-focus")
        .setup(|app, _api| {
            app.manage(Aion2FocusState::default());

            #[cfg(windows)]
            windows_impl::start(app.app_handle().clone());

            Ok(())
        })
        .build()
}

#[cfg(windows)]
mod windows_impl {
    use std::{
        path::Path,
        sync::{
            atomic::Ordering,
            mpsc::{self, Sender},
            Mutex, OnceLock,
        },
    };

    use tauri::{AppHandle, Emitter, Manager, Runtime};
    use windows::{
        core::PWSTR,
        Win32::{
            Foundation::{CloseHandle, HWND},
            System::Threading::{
                OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
                PROCESS_QUERY_LIMITED_INFORMATION,
            },
            UI::{
                Accessibility::{SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK},
                WindowsAndMessaging::{
                    DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId,
                    TranslateMessage, EVENT_SYSTEM_FOREGROUND, MSG, WINEVENT_OUTOFCONTEXT,
                    WINEVENT_SKIPOWNPROCESS,
                },
            },
        },
    };

    use super::{
        Aion2FocusChangedPayload, Aion2FocusState, AION2_PROCESS_NAME, FOLLOW_FOCUS_WINDOW_LABELS,
    };

    static FOREGROUND_SENDER: OnceLock<Mutex<Option<Sender<isize>>>> = OnceLock::new();

    pub fn start<R: Runtime>(app: AppHandle<R>) {
        let (tx, rx) = mpsc::channel::<isize>();
        let sender_slot = FOREGROUND_SENDER.get_or_init(|| Mutex::new(None));
        if let Ok(mut sender) = sender_slot.lock() {
            if sender.is_some() {
                return;
            }
            *sender = Some(tx.clone());
        } else {
            return;
        }

        let app_for_processor = app.clone();
        std::thread::spawn(move || {
            let mut last_focused: Option<bool> = None;

            while let Ok(hwnd_raw) = rx.recv() {
                let process_name = process_name_for_hwnd(hwnd_raw);
                let aion2_focused = process_name
                    .as_deref()
                    .map(|name| name.eq_ignore_ascii_case(AION2_PROCESS_NAME))
                    .unwrap_or(false);
                let focused = aion2_focused
                    || is_overlay_related_window_focused(&app_for_processor)
                    || foreground_belongs_to_current_app(hwnd_raw);

                if last_focused == Some(focused) {
                    continue;
                }
                last_focused = Some(focused);

                let _ = app_for_processor.emit(
                    "aion2-focus-changed",
                    Aion2FocusChangedPayload {
                        focused,
                        process_name: process_name.clone(),
                    },
                );

                let (dps_manual_hidden, auto_hide_enabled) = app_for_processor
                    .try_state::<Aion2FocusState>()
                    .map(|state| {
                        (
                            state.dps_manual_hidden.load(Ordering::Relaxed),
                            state.auto_hide_enabled.load(Ordering::Relaxed),
                        )
                    })
                    .unwrap_or((false, true));

                if !auto_hide_enabled {
                    continue;
                }

                for label in FOLLOW_FOCUS_WINDOW_LABELS {
                    if let Some(window) = app_for_processor.get_webview_window(label) {
                        if focused {
                            if dps_manual_hidden {
                                continue;
                            }
                            let _ = window.set_focusable(false);
                            let _ = window.show();
                            let _ = window.unminimize();
                        } else {
                            let _ = window.hide();
                        }
                    }
                }
            }
        });

        std::thread::spawn(move || unsafe {
            let hook = SetWinEventHook(
                EVENT_SYSTEM_FOREGROUND,
                EVENT_SYSTEM_FOREGROUND,
                None,
                Some(handle_foreground_event),
                0,
                0,
                WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
            );

            if hook.0.is_null() {
                clear_sender();
                return;
            }

            let initial_hwnd = GetForegroundWindow();
            send_hwnd(initial_hwnd);

            let mut message = MSG::default();
            while GetMessageW(&mut message, None, 0, 0).into() {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }

            let _ = UnhookWinEvent(hook);
            clear_sender();
        });

        // Polling fallback: periodically verify window visibility matches actual foreground state
        let app_for_poller = app.clone();
        std::thread::spawn(move || loop {
            std::thread::sleep(std::time::Duration::from_secs(1));

            let hwnd = unsafe { GetForegroundWindow() };
            if hwnd.0.is_null() {
                continue;
            }
            let process_name = process_name_for_hwnd(hwnd.0 as isize);
            let aion2_focused = process_name
                .as_deref()
                .map(|name| name.eq_ignore_ascii_case(AION2_PROCESS_NAME))
                .unwrap_or(false);
            let focused = aion2_focused
                || is_overlay_related_window_focused(&app_for_poller)
                || foreground_belongs_to_current_app(hwnd.0 as isize);

            let (dps_manual_hidden, auto_hide_enabled) = app_for_poller
                .try_state::<Aion2FocusState>()
                .map(|state| {
                    (
                        state.dps_manual_hidden.load(Ordering::Relaxed),
                        state.auto_hide_enabled.load(Ordering::Relaxed),
                    )
                })
                .unwrap_or((false, true));

            if !auto_hide_enabled {
                continue;
            }

            let should_show = focused && !dps_manual_hidden;

            for label in FOLLOW_FOCUS_WINDOW_LABELS {
                if let Some(window) = app_for_poller.get_webview_window(label) {
                    let current_visible = window.is_visible().unwrap_or(false);
                    if should_show && !current_visible {
                        let _ = window.set_focusable(false);
                        let _ = window.show();
                        let _ = window.unminimize();
                    } else if !should_show && current_visible {
                        let _ = window.hide();
                    }
                }
            }
        });
    }

    unsafe extern "system" fn handle_foreground_event(
        _hook: HWINEVENTHOOK,
        _event: u32,
        hwnd: HWND,
        _object_id: i32,
        _child_id: i32,
        _event_thread: u32,
        _event_time: u32,
    ) {
        send_hwnd(hwnd);
    }

    fn send_hwnd(hwnd: HWND) {
        if hwnd.0.is_null() {
            return;
        }

        let Some(sender_slot) = FOREGROUND_SENDER.get() else {
            return;
        };
        let Ok(sender) = sender_slot.lock() else {
            return;
        };
        let Some(sender) = sender.as_ref() else {
            return;
        };

        let _ = sender.send(hwnd.0 as isize);
    }

    fn clear_sender() {
        if let Some(sender_slot) = FOREGROUND_SENDER.get() {
            if let Ok(mut sender) = sender_slot.lock() {
                *sender = None;
            }
        }
    }

    fn is_overlay_related_window_focused<R: Runtime>(app: &AppHandle<R>) -> bool {
        ["dps_settings", "dps_log", "dps_detail_v2"].iter().any(|label| {
            app.get_webview_window(label)
                .and_then(|window| window.is_focused().ok())
                .unwrap_or(false)
        })
    }

    fn foreground_belongs_to_current_app(hwnd_raw: isize) -> bool {
        unsafe {
            let hwnd = HWND(hwnd_raw as *mut _);
            let mut process_id = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));
            process_id != 0 && process_id == std::process::id()
        }
    }



    fn process_name_for_hwnd(hwnd_raw: isize) -> Option<String> {
        unsafe {
            let hwnd = HWND(hwnd_raw as *mut _);
            let mut process_id = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));
            if process_id == 0 {
                return None;
            }

            let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()?;
            let mut path_buffer = vec![0u16; 32_768];
            let mut path_len = path_buffer.len() as u32;

            let result = QueryFullProcessImageNameW(
                process,
                PROCESS_NAME_WIN32,
                PWSTR(path_buffer.as_mut_ptr()),
                &mut path_len,
            );
            let _ = CloseHandle(process);
            result.ok()?;

            let path = String::from_utf16_lossy(&path_buffer[..path_len as usize]);
            Path::new(&path)
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
        }
    }
}
