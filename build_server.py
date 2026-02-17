#!/usr/bin/env python3
"""
简化版 Python 构建脚本
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path


def build_python_for_tauri():
    """构建 Python 脚本并复制到 Tauri 项目"""
    
    # 项目路径
    project_root = Path.cwd()
    src_python = project_root / "src-python"
    tauri_bin = project_root / "src-tauri" / "bin" / "server"
    includes = ["data", 'config.yaml']

    # 创建目标目录
    tauri_bin.mkdir(parents=True, exist_ok=True)
    
    # 检查必要文件
    python_script = src_python / "server.py"
    if not python_script.exists():
        print(f"❌ 错误: {python_script} 不存在")
        return False
    
    print("🚀 开始构建 Python 脚本...")
    
    # 清理旧文件
    dist_dir = src_python / "dist"
    if dist_dir.exists():
        shutil.rmtree(dist_dir)
    

    
    # 安装依赖
    requirements = src_python / "requirements.txt"
    if requirements.exists():
        print("📦 安装依赖...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", str(requirements)], 
                      check=True)
    
    # 使用 PyInstaller 构建
    print("🔨 使用 PyInstaller 构建...")
    
    # 切换到 src-python 目录
    os.chdir(src_python)
    
    # 构建命令
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--onefile",
        "--clean",
        "--name", "server", 
        "--noconsole", 
        "server.py",
    ]
    print(" ".join(cmd))
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ 构建失败: {result.stderr}")
        return False
    
    # 返回项目根目录
    os.chdir(project_root)
    
    # 复制可执行文件
    print("📂 复制文件...")
    
    # 查找可执行文件
    exe_name = "server/server.exe" if sys.platform == "win32" else "server/server"
    exe_path = dist_dir / exe_name
    
    if exe_path.exists():
        print(f'Copying from: {exe_path}, to {tauri_bin / exe_name}')
        shutil.copy2(exe_path, tauri_bin / exe_name)
    else:
        # 尝试其他文件
        for file in dist_dir.glob("server*"):
            shutil.copy2(file, tauri_bin / file.name)
    
    # 复制资源文件
    print("📂 复制includes...")
    for inclu in includes:
        resources = src_python / inclu
        if resources.exists():
            if resources.is_dir():
                (tauri_bin / inclu).mkdir(exist_ok=True)
                for item in resources.iterdir():
                    dest = tauri_bin / inclu /item.name
                    if item.is_dir():
                        shutil.copytree(item, dest, dirs_exist_ok=True)
                    else:
                        shutil.copy2(item, dest)
            else:
                dest = tauri_bin / inclu
                shutil.copytree(resources, dest)
        
        print(f"✅ 构建完成！文件位于: {tauri_bin}")
    return True


if __name__ == "__main__":
    try:
        success = build_python_for_tauri()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n⚠️ 用户中断")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 发生错误: {e}")
        sys.exit(1)