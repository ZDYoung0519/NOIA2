<div align="center">

# NOIA2

[简体中文](./README.zh-CN.md) | English

[![Tauri](https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

A desktop companion for AION2 with a floating DPS meter, battle history, and multi-window tools.

</div>

## Overview

NOIA2 is a Tauri desktop app focused on AION2 tooling.

It combines:

- A floating DPS overlay
- Battle detail and history views
- A home dashboard for recent characters, teammates, and target history
- Multi-window utilities such as settings, logs, and detail popups
- A Rust backend for capture, parsing, aggregation, and diagnostics

## Preview

Home Page:

![App Screenshot](./screenshots/app.jpg)

DPS overlay:

![App Screenshot](./screenshots/dps.jpg)

DPS Detail:

![App Screenshot](./screenshots/dps_detail.jpg)

## Features

- Floating DPS meter with configurable colors, opacity, scale, and nickname masking
- Multi-window workflow for `main`, `dps`, `dps_detail`, `dps_log`, and settings
- Real-time battle snapshot pipeline implemented in Rust
- History storage in localStorage with in-app management and cleanup
- Support for global shortcuts, tray behavior, updater flow, and custom title bars
- Home dashboard with recent teammates and battle target DPS history
- UI localization with English, Simplified Chinese, Traditional Chinese, and Korean

## Tech Stack

- Desktop framework: [Tauri v2](https://tauri.app/)
- Frontend: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- Build tool: [Vite](https://vite.dev/)
- UI: [shadcn/ui](https://ui.shadcn.com/) + [Tailwind CSS v4](https://tailwindcss.com/)
- i18n: [i18next](https://www.i18next.com/)
- Charts: [Recharts](https://recharts.org/)
- Backend: Rust

## Requirements

- Node.js 18+
- pnpm 9+
- Rust toolchain
- Windows environment for the current desktop capture workflow
- Npcap installed for packet capture

## Getting Started

### Install dependencies

```bash
pnpm install
```

### Start in development mode

```bash
pnpm tauri dev
```

### Build a production package

```bash
pnpm tauri build
```

## Common Scripts

```bash
pnpm dev
pnpm build
pnpm tauri:dev
pnpm tauri:build
pnpm lint
pnpm lint:fix
pnpm format
pnpm format:check
pnpm check
```

## Release Flow

Version release is handled by:

```bash
pnpm release:version
```

This script:

- checks that the working tree is clean
- requires the current branch to be `main`
- verifies version consistency across frontend and Tauri config
- creates the release commit and matching `vX.Y.Z` tag
- optionally pushes the branch and tag

GitHub Actions then builds the installer and updater artifacts from release tags.

## Project Structure

```text
.
├─ src/
│  ├─ components/
│  │  ├─ dps/
│  │  └─ ui/
│  ├─ hooks/
│  ├─ i18n/
│  ├─ lib/
│  ├─ pages/
│  │  ├─ home.tsx
│  │  ├─ dps.tsx
│  │  ├─ dps_detail.tsx
│  │  ├─ dps_log.tsx
│  │  ├─ settings.tsx
│  │  └─ settings_view.tsx
│  └─ types/
├─ src-tauri/
│  ├─ src/
│  │  ├─ dps_meter/
│  │  │  ├─ api/
│  │  │  ├─ capture/
│  │  │  ├─ engine/
│  │  │  ├─ models/
│  │  │  └─ storage/
│  │  └─ plugins/
│  └─ tauri.conf.json
├─ src-python/
├─ docs/
├─ public/
└─ screenshots/
```

## Docs

- [Auto Update](./docs/AUTO_UPDATE.md)
- [Global Shortcut](./docs/GLOBAL_SHORTCUT.md)
- [I18N](./docs/I18N.md)

## Notes

- The current capture and detection flow is tuned for Windows desktop usage.
- Some older Python parsing code remains in `src-python/` as reference material.
- localStorage is used for UI settings, recent character history, and DPS history.

## License

MIT
