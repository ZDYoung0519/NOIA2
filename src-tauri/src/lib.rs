use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

use std::time::Duration;
use tauri::Emitter; // 导入 Emitter trait

mod http;
mod tray;

pub struct ServerProcess(Arc<Mutex<Option<Child>>>);

// 获取 server.exe 路径（兼容开发和生产环境）
fn get_server_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // 1. 生产环境：从 resources 目录查找
    let resource_path = app
        .path()
        .resource_dir()
        .map_err(|e| format!("获取资源目录失败: {}", e))?
        .join("bin/server.exe");

    if resource_path.exists() {
        return Ok(resource_path);
    }

    // 2. 开发环境：从项目根目录的 src-tauri/bin 查找
    // 尝试多个可能的路径
    let possible_paths = [
        PathBuf::from("src-tauri/bin/server/server.exe"), // 从项目根目录运行
        PathBuf::from("bin/server/server.exe"),           // 从 src-tauri 目录运行
        PathBuf::from("../bin/server/server.exe"),        // 从 src-tauri/src 运行
    ];

    for path in &possible_paths {
        if path.exists() {
            return Ok(path.canonicalize().unwrap_or(path.clone()));
        }
    }

    Err(format!(
        "找不到 server.exe。已查找: {:?} 和 {:?}",
        resource_path, possible_paths
    ))
}

#[tauri::command]
async fn start_packet_server(
    state: State<'_, ServerProcess>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let mut child_lock = state.0.lock().unwrap();

    if let Some(ref mut child) = *child_lock {
        match child.try_wait() {
            Ok(None) => return Ok("服务已在运行中".to_string()),
            Ok(Some(_)) => {
                *child_lock = None;
            }
            Err(e) => return Err(format!("检查进程状态失败: {}", e)),
        }
    }

    let server_path = get_server_path(&app)?;
    println!("启动路径: {:?}", server_path);

    let child = Command::new(&server_path)
        .env("PYTHONUNBUFFERED", "1")
        // .stdout(Stdio::piped())
        // .stderr(Stdio::piped())
        // 关键：设置工作目录，Python exe 经常依赖相对路径
        .current_dir(server_path.parent().unwrap())
        .spawn()
        .map_err(|e| format!("启动失败: {}", e))?;

    let pid = child.id();
    *child_lock = Some(child);
    Ok(format!("服务已启动，PID: {}", pid))
}

#[tauri::command]
fn end_packet_server(state: State<ServerProcess>) -> Result<String, String> {
    let mut child_lock = state.0.lock().unwrap();

    match child_lock.take() {
        Some(mut child) => {
            child.kill().map_err(|e| format!("关闭失败: {}", e))?;
            let _ = child.wait();
            Ok("服务已停止".to_string())
        }
        None => Err("服务未运行".to_string()),
    }
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn exit_app(app: tauri::AppHandle) {
    let _ = app.emit("app-exit", "application is exiting");
    std::thread::sleep(Duration::from_millis(100));
    std::process::exit(0);
}

#[tauri::command]
fn show_window(app_handle: tauri::AppHandle, label: String) -> Result<String, String> {
    if let Some(window) = app_handle.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.set_focus();
        Ok(format!("Window '{}' shown", label))
    } else {
        Err(format!("Window with label '{}' not found", label))
    }
}

#[tauri::command]
fn toggle_window(
    app_handle: tauri::AppHandle,
    label: String,
    should_show: bool,
) -> Result<String, String> {
    if let Some(window) = app_handle.get_webview_window(&label) {
        if should_show {
            let _ = window.show();
            let _ = window.set_focus();
            Ok(format!("Window '{}' shown", label))
        } else {
            let _ = window.hide();
            Ok(format!("Window '{}' hidden", label))
        }
    } else {
        Err(format!("Window with label '{}' not found", label))
    }
}



use tauri::async_runtime::spawn;
use tauri::{AppHandle};
// use tokio::time::{sleep};

struct SetupState {
    frontend_task: bool,
    backend_task: bool,
}

async fn setup(app: AppHandle) -> Result<(), ()> {
    // Fake performing some heavy action for 3 seconds
    println!("Performing really heavy backend setup task...");
    // sleep(Duration::from_secs(3)).await;
    println!("Backend setup task completed!");
    // Set the backend task as being completed
    // Commands can be ran as regular functions as long as you take
    // care of the input arguments yourself
    set_complete(
        app.clone(),
        app.state::<Mutex<SetupState>>(),
        "backend".to_string(),
    )
    .await?;
    Ok(())
}

#[tauri::command]
async fn set_complete(
    app: AppHandle,
    state: State<'_, Mutex<SetupState>>,
    task: String,
) -> Result<(), ()> {
    // Lock the state without write access. A poisoned mutex shouldn't crash the
    // whole runtime; if it happens we just recover the inner data.
    let mut state_lock = match state.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    };

    match task.as_str() {
        "frontend" => state_lock.frontend_task = true,
        "backend" => state_lock.backend_task = true,
        _ => panic!("invalid task completed!"),
    }
    // Check if both tasks are completed
    if state_lock.backend_task && state_lock.frontend_task {
        // Setup is complete, we can close the splashscreen
        // and unhide the main window!
        if let Some(splash_window) = app.get_webview_window("splash") {
            let _ = splash_window.close();
        }
        if let Some(main_window) = app.get_webview_window("main") {
            let _ = main_window.show();
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(ServerProcess(Arc::new(Mutex::new(None))))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        // .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(Mutex::new(SetupState {
            frontend_task: false,
            backend_task: false,
        }))
        .invoke_handler(tauri::generate_handler![
            greet,
            exit_app,
            start_packet_server,
            end_packet_server,
            http::http_request,
            show_window,
            toggle_window,
            set_complete,
        ])
        .setup(|app| {
            #[cfg(all(desktop))]
            {
                // 系统托盘
                let handle = app.handle();
                tray::create_tray(handle)?;

                let window = app.get_webview_window("main").unwrap();
                window.set_decorations(false).unwrap();
                
                spawn(setup(app.handle().clone()));
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
