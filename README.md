# NOIA2 - 永恒之塔2 次世代辅助工具

<p align="center">
  <img src="https://via.placeholder.com/200x200?text=NOIA2" alt="NOIA2 Logo" width="200" height="200">
</p>

<p align="center">
  <strong>为 AION2 玩家打造的数据分析与战斗辅助平台</strong>
  <br>
  实时战斗分析 · 角色评分 · BD模拟器 · 零延迟数据同步
</p>

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#技术栈">技术栈</a> •
  <a href="#项目架构">项目架构</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#贡献指南">贡献指南</a> •
  <a href="#许可证">许可证</a>
</p>

---

## 📖 项目简介

**NOIA2** 是一个开源、免费的《永恒之塔2》（AION2）辅助工具集。它通过实时抓取游戏数据，为玩家提供战斗分析（DPS Meter）、角色属性评分、BD模拟器等功能，帮助玩家优化输出、提升角色实力。

> ⚠️ 本项目为玩家社区作品，**不隶属于 NCSOFT**，不涉及任何游戏客户端修改，仅基于游戏公开数据进行解析与展示。

---

## ✨ 功能特性

### ⚔️ 战斗分析 (DPS Meter)

- 实时追踪团队成员的输出数据（DPS/HPS）
- 深度解析技能循环、爆发时机、增益覆盖率
- 支持战斗回放与数据导出（JSON/CSV）

### 📊 角色评分

- 一键查询角色攻击力、伤害增幅、暴击等核心属性
- 基于装备、Buff、宠物盘的动态综合评分
- 属性阈值对比，提供个性化养成建议

### 🛠️ BD 模拟器

- 自由搭配装备、宠物盘、技能符文
- 实时预览属性变化与套装效果
- 支持配置导入/导出，方便分享与对比

### 📈 数据可视化

- 将复杂的战斗日志转化为直观的动态图表
- 分析走位、技能释放时机与团队协同
- 内置 AION 维基数据库，装备属性即点即查

---

## 🛠️ 技术栈

- **前端框架**: React 18 + TypeScript
- **桌面应用框架**: [Tauri](https://tauri.app/) (Rust 核心)
- **后端服务**: Python (数据处理、游戏日志解析)
- **构建工具**: Vite
- **样式方案**: Tailwind CSS + 自定义动画
- **图标库**: Lucide React
- **路由**: React Router DOM
- **状态管理**: React Hooks (useState, useEffect)
- **进程通信**: Tauri IPC (在前端与 Rust 后端之间) + Python 子进程调用
- **部署**: 支持构建为 Windows/macOS/Linux 桌面应用

---

## 🏗️ 项目架构

NOIA2 采用混合架构，结合了现代前端技术与高性能后端：

- **前端界面**：React + TypeScript 构建用户界面，通过 Tauri 提供的 API 与底层通信。
- **Tauri 核心**：Rust 编写的轻量级应用容器，负责窗口管理、系统菜单、安全隔离以及调用 Python 后端。
- **Python 后端**：独立进程，负责游戏数据抓取、日志解析、复杂的计算逻辑（如 DPS 分析、角色评分算法）。前端通过 Tauri 的 IPC 与 Rust 层通信，Rust 再通过标准输入输出或 HTTP 与 Python 进程交互。

这种设计保证了前端的流畅体验，同时充分利用 Python 在数据分析领域的生态优势。

---

## 🚀 快速开始

### 环境要求

- Node.js 16+
- Rust 和 Cargo (安装 Tauri 所需)
- Python 3.9+
- npm 或 yarn

### 安装步骤

1. **克隆仓库**

   ```bash
   git clone https://github.com/zdyoung0519/noia2.git
   cd noia2
   ```

2. **安装前端依赖**

   ```bash
   npm install
   # 或
   yarn
   ```

3. **安装 Python 依赖**

   ```bash
   pip install -r requirements.txt
   ```

4. **启动开发服务器（前端 + Tauri）**

   ```bash
   npm run tauri dev
   ```

5. **构建生产版本**
   ```bash
   npm run tauri build
   ```

---

## 🤝 贡献指南

欢迎任何形式的贡献！无论是新功能、Bug 修复、文档改进还是问题反馈。

1. Fork 本仓库
2. 创建你的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交你的修改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个 Pull Request

请确保代码风格保持一致，并遵循项目的 ESLint 配置。对于 Python 部分，请遵循 PEP 8 规范。

---

## 📄 许可证

本项目基于 **GNU General Public License v3.0** 协议开源，详情请参阅 [LICENSE](LICENSE) 文件。

---

## 📬 联系我们

- 项目主页: [https://github.com/zdyoung0519/noia2](https://github.com/zdyoung0519/noia2)
- 问题反馈: [Issues](https://github.com/zdyoung0519/noia2/issues)
- 讨论区: [Discussions](https://github.com/zdyoung0519/noia2/discussions)

---

<p align="center">
  <sub>Made with ❤️ by NOIA2 Team</sub>
  <br>
  <sub>AION is a trademark of NCSOFT Corporation. This project is not affiliated with NCSOFT.</sub>
</p>
