use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::{
    plugin::{Builder, TauriPlugin},
    AppHandle, Emitter, Manager, Runtime,
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    pub level: String,
    pub message: String,
    pub line: String,
    pub timestamp: f64,
}

pub struct AppLogger {
    emit: Box<dyn Fn(LogEvent) + Send + Sync>,
    file_path: PathBuf,
    debug_enabled: Mutex<bool>,
    write_lock: Mutex<()>,
}

impl AppLogger {
    fn new<R: Runtime>(app: &AppHandle<R>) -> Self {
        let file_path = resolve_log_path(app);
        if let Some(parent) = file_path.parent() {
            let _ = create_dir_all(parent);
        }
        let app = app.clone();

        Self {
            emit: Box::new(move |event| {
                let _ = app.emit("app-logger", event);
            }),
            file_path,
            debug_enabled: Mutex::new(false),
            write_lock: Mutex::new(()),
        }
    }

    pub fn set_debug_enabled(&self, enabled: bool) {
        *self.debug_enabled.lock().unwrap() = enabled;
    }

    pub fn debug(&self, message: impl AsRef<str>) {
        if *self.debug_enabled.lock().unwrap() {
            self.write_line("DEBUG", message.as_ref());
        }
    }

    pub fn info(&self, message: impl AsRef<str>) {
        self.write_line("INFO", message.as_ref());
    }

    #[allow(dead_code)]
    pub fn error(&self, message: impl AsRef<str>) {
        self.write_line("ERROR", message.as_ref());
    }

    fn write_line(&self, level: &str, message: &str) {
        let _guard = self.write_lock.lock().unwrap();
        let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)
        else {
            return;
        };

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs_f64())
            .unwrap_or_default();

        let line = format!("[{timestamp:.3}] [{level}] {message}");
        let _ = writeln!(file, "{line}");
        (self.emit)(LogEvent {
            level: level.to_string(),
            message: message.to_string(),
            line,
            timestamp,
        });
    }
}

fn resolve_log_path<R: Runtime>(app: &AppHandle<R>) -> PathBuf {
    if let Ok(dir) = app.path().app_log_dir() {
        return dir.join("noia.log");
    }
    if let Ok(dir) = app.path().app_data_dir() {
        return dir.join("logs").join("noia.log");
    }
    std::env::temp_dir().join("noia2").join("noia.log")
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("logger")
        .setup(|app, _| {
            app.manage(Arc::new(AppLogger::new(app.app_handle())));
            Ok(())
        })
        .build()
}
