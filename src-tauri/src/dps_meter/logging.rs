use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

#[derive(Debug)]
pub struct DpsLogger {
    file_path: PathBuf,
    output_debug_log: Mutex<bool>,
    write_lock: Mutex<()>,
}

impl DpsLogger {
    pub fn new(app: &AppHandle, output_debug_log: bool) -> Self {
        let file_path = resolve_log_path(app);
        if let Some(parent) = file_path.parent() {
            let _ = create_dir_all(parent);
        }

        Self {
            file_path,
            output_debug_log: Mutex::new(output_debug_log),
            write_lock: Mutex::new(()),
        }
    }

    pub fn set_output_debug_log(&self, enabled: bool) {
        *self.output_debug_log.lock().unwrap() = enabled;
    }

    pub fn debug(&self, message: impl AsRef<str>) {
        if *self.output_debug_log.lock().unwrap() {
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

        let _ = writeln!(file, "[{timestamp:.3}] [{level}] {message}");
    }
}

fn resolve_log_path(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().app_log_dir() {
        return dir.join("dps-meter.log");
    }
    if let Ok(dir) = app.path().app_data_dir() {
        return dir.join("logs").join("dps-meter.log");
    }
    std::env::temp_dir().join("noia2").join("dps-meter.log")
}
