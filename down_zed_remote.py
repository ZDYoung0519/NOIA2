#!/usr/bin/env python3
"""
Zed 远程服务器安装脚本
在本地下载 zed-remote-server 后上传到服务器安装，解决服务器下载速度慢的问题。
支持 ~/.ssh/config 中预定义的 Host 别名。
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen, urlretrieve, Request
from urllib.parse import urlencode
from urllib.error import URLError

# ============================================================
# 配置（按需修改）
# ============================================================
CHANNEL = "stable"  # stable / preview / nightly
# ============================================================

ZED_API    = "https://cloud.zed.dev"
REMOTE_DIR = ".zed_server"
SCRIPT_DIR = Path(__file__).parent


def log(msg: str):
    print(msg, flush=True)


def prompt_ssh_destination() -> str:
    log("=" * 60)
    log("步骤 1/2：SSH 连接信息")
    log("=" * 60)
    log("支持以下格式：")
    log("  user@hostname        例: root@192.168.1.1")
    log("  user@hostname:port   例: root@192.168.1.1:2222")
    log("  alias                例: myserver  (来自 ~/.ssh/config)")
    log("")
    dest = input("请输入 SSH 目标: ").strip()
    if not dest:
        log("错误: SSH 目标不能为空")
        sys.exit(1)
    return dest


def prompt_zed_about() -> str:
    log("")
    log("=" * 60)
    log("步骤 2/2：Zed 版本信息")
    log("=" * 60)
    log("请在 Zed 中执行: Help → About Zed (或 Zed → About Zed)")
    log("然后将弹窗中的全部文字复制粘贴到此处。")
    log("")
    log("示例格式:")
    log("  Zed 1.1.8")
    log("  Commit: 7eb6bc7bad1afa0c026077d3a12e43f8e7c045f9")
    log("  Version: 1.1.8+stable.269.7eb6bc7bad1afa0c026077d3a12e43f8e7c045f9")
    log("")
    log("粘贴后按 Enter，再输入一个空行结束输入:")
    log("")

    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "" and lines:
            break
        lines.append(line)

    return "\n".join(lines)


def parse_zed_about(text: str) -> tuple[str, str, str]:
    """
    从 About Zed 文本中提取:
      - full_version: 1.1.8+stable.269.7eb6bc7bad1afa0c026077d3a12e43f8e7c045f9
      - short_version: 1.1.8
      - commit:        7eb6bc7bad1afa0c026077d3a12e43f8e7c045f9

    支持的格式:
      Version: 1.1.8+stable.269.7eb6bc7...   ← 优先，最完整
      Commit: 7eb6bc7...
      Zed 1.1.8
    """
    # 提取完整版本号（含 build metadata）
    m = re.search(r'Version:\s*(\d+\.\d+\.\d+\S+)', text)
    if not m:
        log("错误: 未能从输入中找到 'Version: x.x.x+...' 字段")
        log("请确认已复制完整的 About Zed 内容")
        sys.exit(1)
    full_version = m.group(1).strip()

    # 提取短版本号
    short_version = full_version.split("+")[0]

    # 提取 commit hash
    m2 = re.search(r'Commit:\s*([0-9a-f]{8,})', text, re.IGNORECASE)
    commit = m2.group(1).strip() if m2 else ""

    log(f"    短版本号:   {short_version}")
    log(f"    完整版本号: {full_version}")
    if commit:
        log(f"    Commit:     {commit}")

    return full_version, short_version, commit


def ssh_cmd(destination: str, remote_cmd: str, capture=True) -> str:
    cmd = ["ssh", "-o", "StrictHostKeyChecking=accept-new", destination, remote_cmd]
    r = subprocess.run(cmd, capture_output=capture, text=True, timeout=60)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip() if capture else "")
    return r.stdout.strip() if capture else ""


def detect_platform(destination: str) -> tuple[str, str]:
    log("[1] 探测服务器平台...")
    raw = ssh_cmd(destination, "uname -sm")
    parts = raw.lower().split()
    os_map   = {"linux": "linux", "darwin": "macos"}
    arch_map = {"x86_64": "x86_64", "amd64": "x86_64", "aarch64": "aarch64", "arm64": "aarch64"}
    os_str   = os_map.get(parts[0]) if len(parts) > 0 else None
    arch_str = arch_map.get(parts[1]) if len(parts) > 1 else None
    if not os_str or not arch_str:
        log(f"    不支持的平台: {raw}")
        sys.exit(1)
    log(f"    平台: {os_str} / {arch_str}")
    return os_str, arch_str


def api_get_release(os_str: str, arch_str: str) -> dict:
    params = urlencode({"asset": "zed-remote-server", "os": os_str, "arch": arch_str})
    url = f"{ZED_API}/releases/{CHANNEL}/latest/asset?{params}"
    log(f"[2] 查询最新版本: {url}")
    try:
        req = Request(url, headers={
            "User-Agent": "Zed/1.0.0 (linux; x86_64)",
            "Accept": "application/json",
        })
        with urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except URLError as e:
        log(f"    错误: {e}")
        sys.exit(1)
    log(f"    API 返回版本: {data['version']}")
    log(f"    下载地址: {data['url']}")
    return data


def is_installed(destination: str, binary_name: str) -> bool:
    log(f"[3] 检查服务器是否已安装 {binary_name} ...")
    try:
        out = ssh_cmd(destination,
            f"test -x ~/{REMOTE_DIR}/{binary_name} && echo __EXISTS__ || echo __MISSING__")
        if "__MISSING__" in out:
            log("    未安装，继续...")
            return False
        log("    已安装，无需重复安装。")
        return True
    except RuntimeError:
        return False


def download(url: str, dest: Path):
    log(f"[4] 下载到本地: {dest}")
    try:
        def progress(block, block_size, total):
            done = block * block_size
            if total > 0:
                print(f"\r    {min(done, total) / 1024 / 1024:.1f}/{total / 1024 / 1024:.1f} MB"
                      f" ({min(done / total * 100, 100):.0f}%)", end="", flush=True)
        urlretrieve(url, dest, reporthook=progress)
        print()
        log(f"    下载完成 ({dest.stat().st_size / 1024 / 1024:.2f} MB)")
    except Exception as e:
        dest.unlink(missing_ok=True)
        log(f"    下载失败: {e}")
        sys.exit(1)


def upload_and_install(destination: str, local_gz: Path, binary_name: str):
    pid     = os.getpid()
    tmp_gz  = f"~/{REMOTE_DIR}/{binary_name}-download-{pid}.gz"
    tmp_bin = f"~/{REMOTE_DIR}/{binary_name}-download-{pid}"
    dst_bin = f"~/{REMOTE_DIR}/{binary_name}"

    ssh_cmd(destination, f"mkdir -p ~/{REMOTE_DIR}")

    log(f"[5] 上传到服务器 -> {tmp_gz}")
    scp_cmd = ["scp", "-o", "StrictHostKeyChecking=accept-new",
               str(local_gz), f"{destination}:{tmp_gz}"]
    r = subprocess.run(scp_cmd, timeout=300)
    if r.returncode != 0:
        log("    上传失败")
        sys.exit(1)
    log("    上传完成")

    log("[6] 解压并安装...")
    try:
        ssh_cmd(destination,
                f"gunzip -f {tmp_gz} && chmod 755 {tmp_bin} && mv {tmp_bin} {dst_bin}",
                capture=False)
    except RuntimeError as e:
        log(f"    安装失败: {e}")
        ssh_cmd(destination, f"rm -f {tmp_gz} {tmp_bin}")
        sys.exit(1)

    log(f"    安装成功: ~/{REMOTE_DIR}/{binary_name}")


def main():
    # ── 交互式输入 ──
    destination = prompt_ssh_destination()
    about_text  = prompt_zed_about()

    log("")
    log("─" * 60)
    log("解析版本信息...")
    full_version, short_version, _ = parse_zed_about(about_text)

    binary_name = f"zed-remote-server-{CHANNEL}-{full_version}"
    log(f"    目标二进制: {binary_name}")

    # ── 探测服务器平台 ──
    os_str, arch_str = detect_platform(destination)

    # ── 校验 API 版本与用户输入一致 ──
    release     = api_get_release(os_str, arch_str)
    api_version = release["version"]
    dl_url      = release["url"]

    if api_version != short_version:
        log(f"")
        log(f"⚠ 注意: API 最新版本 ({api_version}) 与您输入的版本 ({short_version}) 不一致。")
        log(f"  可能您的 Zed 客户端不是最新版，将继续使用您输入的版本安装。")

    # ── 检查是否已安装 ──
    if is_installed(destination, binary_name):
        return

    # ── 下载 ──
    local_gz = SCRIPT_DIR / f"zed-remote-server-{CHANNEL}-{short_version}.gz"
    if local_gz.exists():
        log(f"[4] 本地文件已存在，跳过下载: {local_gz}")
    else:
        download(dl_url, local_gz)

    # ── 上传并安装 ──
    upload_and_install(destination, local_gz, binary_name)


if __name__ == "__main__":
    main()
