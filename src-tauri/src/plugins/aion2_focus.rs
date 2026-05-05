use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

const AION2_PROCESS_NAME: &str = "Aion2.exe";
const FOLLOW_FOCUS_WINDOW_LABELS: [&str; 2] = ["dps", "dps_ping"];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Aion2FocusChangedPayload {
    focused: bool,
    process_name: Option<String>,
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("aion2-focus")
        .setup(|app, _api| {
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
                Accessibility::{
                    SetWinEventHook, UnhookWinEvent, HWINEVENTHOOK,
                },
                WindowsAndMessaging::{
                    DispatchMessageW, GetForegroundWindow, GetMessageW, GetWindowThreadProcessId,
                    TranslateMessage, MSG, EVENT_SYSTEM_FOREGROUND, WINEVENT_OUTOFCONTEXT,
                    WINEVENT_SKIPOWNPROCESS,
                },
            },
        },
    };

    use super::{Aion2FocusChangedPayload, AION2_PROCESS_NAME, FOLLOW_FOCUS_WINDOW_LABELS};

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
                let focused = process_name
                    .as_deref()
                    .map(|name| name.eq_ignore_ascii_case(AION2_PROCESS_NAME))
                    .unwrap_or(false);

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

                for label in FOLLOW_FOCUS_WINDOW_LABELS {
                    if let Some(window) = app_for_processor.get_webview_window(label) {
                        if focused {
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

        std::thread::spawn(move || {
            unsafe {
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
