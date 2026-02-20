#!/usr/bin/env python3

import os
import sys
import shutil
import subprocess
from pathlib import Path

# 项目根目录（脚本所在目录）
ROOT_DIR = Path(__file__).parent.absolute()

# 源 Python 项目目录
SRC_PYTHON_DIR = ROOT_DIR / "src-python"

# PyInstaller 输出目录（在 src-python 内）
DIST_DIR = SRC_PYTHON_DIR / "dist"

# Tauri 后端目标目录
TAURI_BIN_DIR = ROOT_DIR / "src-tauri" / "bin"
TARGET_SERVER_DIR = TAURI_BIN_DIR / "server"

def step(message: str):
    """打印带分隔线的步骤信息"""
    print(f"\n=== {message} ===")

def run_command(cmd, cwd=None):
    """执行 shell 命令，失败时退出脚本"""
    try:
        subprocess.run(cmd, check=True, cwd=cwd, shell=True)
    except subprocess.CalledProcessError as e:
        print(f"命令执行失败: {e}", file=sys.stderr)
        sys.exit(1)

def copy_if_exists(src: Path, dst_dir: Path):
    """
    如果源路径存在，将其复制到目标目录。
    - 若 src 是文件，则复制到 dst_dir 下（保持原名）。
    - 若 src 是目录，则递归复制整个目录到 dst_dir 下。
    """
    if not src.exists():
        print(f"跳过（不存在）: {src}")
        return
    dst = dst_dir / src.name
    if src.is_file():
        shutil.copy2(src, dst)  # 保留元数据
        print(f"复制文件: {src} -> {dst}")
    elif src.is_dir():
        shutil.copytree(src, dst, dirs_exist_ok=True)
        print(f"复制目录: {src} -> {dst}")

def main():
    step("1. 进入 src-python 目录")
    os.chdir(SRC_PYTHON_DIR)
    print(f"当前工作目录: {os.getcwd()}")

    step("2. 执行 PyInstaller 打包")
    # pyinstaller_cmd = "pyinstaller -F --noconsole server.py"
    pyinstaller_cmd = "pyinstaller -F server.py"
    run_command(pyinstaller_cmd)

    step("3. 将额外文件/目录复制到 dist 中")
    # 需要复制的资源列表（相对于 src-python）
    items_to_copy = [
        SRC_PYTHON_DIR / "data",
        SRC_PYTHON_DIR / "resource",
        SRC_PYTHON_DIR / "config.json",
    ]
    for item in items_to_copy:
        copy_if_exists(item, DIST_DIR)

    step("4. 将 dist 文件夹整体复制到 src-tauri/bin/server")
    # 如果目标目录已存在，先删除再复制（确保完全覆盖）
    if TARGET_SERVER_DIR.exists():
        print(f"目标目录已存在，正在删除: {TARGET_SERVER_DIR}")
        shutil.rmtree(TARGET_SERVER_DIR)
    shutil.copytree(DIST_DIR, TARGET_SERVER_DIR)
    print(f"复制完成: {DIST_DIR} -> {TARGET_SERVER_DIR}")

    step("✅ 打包完成！")
    print(f"最终输出目录: {TARGET_SERVER_DIR}")

if __name__ == "__main__":
    main()
    