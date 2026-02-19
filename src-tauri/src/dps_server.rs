
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tauri::{Manager, State};

pub struct ServerProcess(pub Arc<Mutex<Option<Child>>>);

pub fn get_server_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
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
pub async fn start_packet_server(
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
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        // 关键：设置工作目录，Python exe 经常依赖相对路径
        .current_dir(server_path.parent().unwrap())
        .spawn()
        .map_err(|e| format!("启动失败: {}", e))?;

    let pid = child.id();
    *child_lock = Some(child);
    Ok(format!("服务已启动，PID: {}", pid))
}

#[tauri::command]
pub fn end_packet_server(state: State<ServerProcess>) -> Result<String, String> {
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
