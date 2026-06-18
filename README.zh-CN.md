<div align="center">

<img src="./public/icon.png" alt="NOIA2" width="96" height="96" />

# NOIA2

面向 AION2 玩家的高性能桌面辅助工具：轻量 DPS 悬浮窗、战斗历史、角色评分、伤害排行、职业统计、多窗口详情分析，一站式完成。

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-Backend-000000?logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![License](https://img.shields.io/badge/License-MIT-22C55E)](./LICENSE)

简体中文 · [English](./README.md)

</div>

---

## 项目简介

NOIA2 是一个为 AION2 设计的 Windows 桌面工具。它使用 Rust 后端完成网络数据捕获、解析、聚合和诊断，再通过 Tauri + React 提供轻量、清晰、可配置的桌面界面。

它的目标很简单：打开水表，切回游戏，让悬浮窗自然跟随你的战斗节奏，同时提供战后复盘、排行对比和角色成长参考。

## 核心亮点

- **轻量 DPS 悬浮窗**：支持 Hunter Compact 与 Classic Bars 两种视觉风格。
- **实时延迟底栏**：显示 ping、CPU、内存，并支持点击穿透锁定和延迟曲线。
- **战斗详情窗口**：查看玩家伤害、技能明细、目标信息和历史快照。
- **本地战斗历史**：自动记录有效战斗，支持后续复盘与上传状态标记。
- **角色评分工具**：集中查看角色装备、属性、成长方向和综合强度。
- **伤害排行页面**：用于对比个人 DPS、队伍表现和历史战斗数据。
- **职业统计分析**：展示不同职业的 DPS 分布和整体战斗趋势。
- **首页数据看板**：展示最近角色、最近队友、目标 DPS 历史趋势。
- **多窗口协作**：DPS、详情、设置、日志、指南窗口独立协同。
- **高度可配置**：颜色、透明度、缩放、昵称打码、首领血条、职业图标样式等均可调整。
- **桌面能力完整**：全局快捷键、系统托盘、自动更新、自定义标题栏和多语言支持。

## 界面预览

### 首页看板

![NOIA2 首页看板](./public/home.png)

### 轻量 DPS 悬浮窗

![NOIA2 DPS 悬浮窗](./public/dps.png)

### DPS 详情窗口

![NOIA2 DPS 详情](./public/dps_detail.png)

### 角色评分

![NOIA2 角色评分](./public/character_score.png)

### 伤害排行

![NOIA2 伤害排行](./public/dps_rank.png)

### 职业统计

![NOIA2 职业统计](./public/class_stats.png)

## 快速开始

### 环境要求

- Windows
- Node.js 18+
- pnpm 9+
- Rust toolchain
- Npcap，用于网络数据捕获

### 安装依赖

```bash
pnpm install
```

### 开发运行

```bash
pnpm tauri:dev
```

### 构建安装包

```bash
pnpm tauri:build
```

## 使用指引

打开新版轻量水表时，应用内会显示完整使用指南。基本流程如下：

1. 安装 Npcap，并保持 WinPcap 兼容选项勾选。
2. 进入游戏后传送一次奇斯克，让 NOIA2 识别你的角色。
3. 进行打桩或副本战斗，DPS 数据会自动显示。

<p align="center">
  <img src="./public/guide1.png" alt="Npcap 安装说明" width="30%" />
  <img src="./public/guide2.png" alt="角色识别说明" width="30%" />
  <img src="./public/guide3.png" alt="战斗数据显示说明" width="30%" />
</p>

## 功能一览

| 模块 | 说明 |
| --- | --- |
| DPS 悬浮窗 | 展示实时伤害、秒伤、占比、职业图标、服务器信息和目标计时。 |
| 延迟底栏 | 展示 ping、CPU、内存，并提供点击穿透锁定。 |
| 详情窗口 | 查看玩家技能明细与战斗详情，不打断主水表显示。 |
| 历史记录 | 保存本地战斗快照，支持后续查看和上传状态追踪。 |
| 角色评分 | 查看角色装备、属性、养成方向和综合评分表现。 |
| 伤害排行 | 对比个人 DPS、队伍输出和历史战斗表现。 |
| 职业统计 | 汇总不同职业的 DPS 分布、平均表现和战斗趋势。 |
| 设置页面 | 调整悬浮窗外观、快捷键、捕获参数和数据过滤规则。 |

## 常见问题

**wifi 图标没有延迟？**  
请确保已经安装 Npcap，并勾选第三个选项。如果仍然没有延迟数据，通常是当前加速器不支持。

**为什么打桩没数据？**  
请确保已经安装 Npcap，并且传送识别到了自己的角色。

**为什么副本中显示未知，或者出现多个角色？**  
因为你离队友太远时，召唤物可能统计不到具体归属。这对你自己的数据没有影响，自己是召唤职业也不影响。收费水表通常默认隐藏这些数据，本软件为了保持严谨会公开显示。

**其它异常如何处理？**  
下载最新安装包。重新安装前建议先卸载旧版本，并清空所有数据。

## 技术架构

```text
NOIA2
├─ src/                     React + TypeScript 前端
│  ├─ components/           UI、首页组件、DPS 面板、指南弹窗
│  ├─ hooks/                设置、翻译、更新、用户状态
│  ├─ lib/                  窗口工具、存储、上传、AION2 工具函数
│  ├─ pages/                多窗口页面路由
│  └─ types/                前端共享类型
├─ src-tauri/               Tauri v2 桌面壳与 Rust 后端
│  ├─ src/dps_meter/        捕获、解析、计算、模型、存储
│  ├─ src/plugins/          托盘、焦点跟随、窗口跟随、HTTP 工具
│  └─ tauri.conf.json       桌面端配置
├─ public/                  应用图片、指南图片、职业/技能资源
├─ docs/                    自动更新、快捷键、国际化文档
└─ screenshots/             历史截图
```

## 常用脚本

```bash
pnpm dev              # 仅启动 Vite
pnpm tauri:dev        # 启动桌面开发环境
pnpm build            # 类型检查并构建前端
pnpm tauri:build      # 构建 Windows 安装包
pnpm lint             # 运行 ESLint
pnpm format           # 格式化源码
pnpm check            # 格式检查、lint 与完整构建
```

## 发布流程

```bash
pnpm release:version
```

发布脚本会检查工作区状态、校验版本一致性、创建发布提交，并生成对应的 `vX.Y.Z` 标签。之后可由 GitHub Actions 构建安装包和自动更新产物。

## 补充说明

- 当前捕获流程主要面向 Windows 桌面环境。
- Npcap 是抓包必需依赖。
- 本项目会尽量透明地显示解析结果，包括未知角色或远距离召唤物相关条目。
- UI 设置、最近角色历史和 DPS 历史会保存在本地存储中。

## 相关文档

- [自动更新](./docs/AUTO_UPDATE.zh-CN.md)
- [全局快捷键](./docs/GLOBAL_SHORTCUT.zh-CN.md)
- [国际化](./docs/I18N.zh-CN.md)

## License

MIT. See [LICENSE](./LICENSE).
