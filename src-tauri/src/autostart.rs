// src-tauri/src/autostart.rs

use std::sync::mpsc;
use std::thread;
use anyhow::anyhow;
use planif::enums::TaskCreationFlags;
use planif::schedule::TaskScheduler;
use planif::schedule_builder::{Action, ScheduleBuilder};
use planif::settings::{Duration, LogonType, PrincipalSettings, RunLevel, Settings};
use planif::task::Task;
use tauri::{AppHandle};
use std::path::Path;

const FOLDER: &'static str = "shion";
const TASK_NAME: &'static str = "auto start";

/// 在单独的线程中执行操作，避免 COM 初始化冲突
fn spawn_task<T, F>(cb: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, Box<dyn std::error::Error>> + Send + 'static,
{
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let result = cb().map_err(|e| anyhow!(e.to_string()));
        let _ = tx.send(result);
    });

    match rx.recv() {
        Ok(Ok(data)) => Ok(data),
        Ok(Err(e)) => Err(format!("Operation failed: {}", e)),
        Err(e) => Err(format!("Thread communication error: {}", e)),
    }
}

/// 创建或更新计划任务
fn create_or_update_task(exe_path: &str) -> Result<(), Box<dyn std::error::Error>> {
    // 验证可执行文件路径
    if !Path::new(exe_path).exists() {
        return Err(format!("Executable not found: {}", exe_path).into());
    }

    let ts = TaskScheduler::new()?;
    let com = ts.get_com();
    let sb = ScheduleBuilder::new(&com)?;

    // 任务设置
    let mut settings = Settings::new();
    settings.stop_if_going_on_batteries = Some(false);
    settings.disallow_start_if_on_batteries = Some(false);
    settings.enabled = Some(true);
    
    // 如果希望在用户未登录时也运行，可以设置
    // settings.run_only_if_logged_on = Some(false);
    // settings.run_only_if_idle = Some(false);

    let user_id = format!("{}\\{}", whoami::devicename(), whoami::username());

    let principal_settings = PrincipalSettings {
        display_name: "".to_string(),
        group_id: None,
        id: "".to_string(),
        logon_type: LogonType::InteractiveToken,
        run_level: RunLevel::Highest,  // 最高权限运行
        user_id: Some(user_id.clone()),
    };

    sb.create_logon()
        .author("hanaTsuk1")?
        .trigger("trigger", true)?
        .action(Action::new("auto start", exe_path, "", ""))?
        .in_folder(FOLDER)?
        .principal(principal_settings)?
        .settings(settings)?
        .delay(Duration {
            seconds: Some(10),
            ..Default::default()
        })?
        .build()?
        .register(TASK_NAME, TaskCreationFlags::CreateOrUpdate as i32)?;
    
    Ok(())
}

/// 启用开机自启（Tauri 命令）
#[tauri::command]
pub fn enable_autostart(app_handle: AppHandle) -> Result<String, String> {
    // 获取当前应用的执行路径
    let exe_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get executable path: {}", e))?;
    
    let exe_path_str = exe_path.to_str()
        .ok_or_else(|| "Invalid executable path".to_string())?
        .to_string();  // 转换为 String，拥有所有权
    
    // 在新线程中执行创建任务的操作
    spawn_task(move || {
        create_or_update_task(&exe_path_str)?;  // 传递引用，添加 & 符号
        
        // 启用任务
        let _ts = TaskScheduler::new()?;
        let task = Task::new()?;
        task.enable(FOLDER, TASK_NAME)?;
        
        Ok(())
    })?;
    
    Ok("Autostart enabled successfully".to_string())
}

/// 禁用开机自启（Tauri 命令）
#[tauri::command]
pub fn disable_autostart() -> Result<String, String> {
    spawn_task(|| {
        let _ts = TaskScheduler::new()?;
        let task = Task::new()?;
        task.disable(FOLDER, TASK_NAME)?;
        Ok(())
    })?;
    
    Ok("Autostart disabled successfully".to_string())
}

/// 检查开机自启是否已启用（Tauri 命令）
#[tauri::command]
pub fn is_autostart_enabled() -> Result<bool, String> {
    spawn_task(|| {
        let _ts = TaskScheduler::new()?;
        let task = Task::new()?;
        
        // 检查任务是否存在且已启用
        match task.is_enabled(FOLDER, TASK_NAME) {
            Ok(enabled) => Ok(enabled),
            Err(e) => {
                // 如果任务不存在，返回 false 而不是错误
                if e.to_string().contains("not exist") || e.to_string().contains("找不到文件") {
                    Ok(false)
                } else {
                    Err(e)
                }
            }
        }
    })
}



// 单元测试
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whoami_info() {
        println!("Device name: {}", whoami::devicename());
        println!("Real name: {}", whoami::realname());
        println!("Username: {}", whoami::username());
        println!("Full user ID: {}\\{}", whoami::devicename(), whoami::username());
    }
    
    #[test]
    fn test_task_name_constants() {
        assert_eq!(FOLDER, "shion");
        assert_eq!(TASK_NAME, "auto start");
    }
}