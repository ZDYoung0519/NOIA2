<div align="center">

# Tauri App Template

English | [简体中文](./README.zh-CN.md)

[![Tauri](https://img.shields.io/badge/Tauri-2.0-24C8DB?logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

A modern desktop application template built with Tauri v2 + React 19 + TypeScript + shadcn/ui.

</div>

## Preview

![App Screenshot](./screenshots/app.png)

## Features

- ✨ **Modern Tech Stack** - Tauri v2 + React 19 + TypeScript + Vite
- 🎨 **Beautiful UI Components** - Integrated shadcn/ui component library and Tailwind CSS v4
- 🌓 **Dark Mode Support** - Built-in light/dark theme toggle
- 🌍 **Internationalization** - i18next integration with English and Chinese support
- 🖼️ **Custom Titlebar** - Frameless transparent window with drag, minimize, maximize, and close support
- 🗂️ **Multi-Window Management** - Support for child windows, window lifecycle management, and delayed destruction
- 🔔 **System Tray Integration** - Tray icon, menu, and window show/hide support
- ⌨️ **Global Shortcuts** - Register global shortcuts that work even when app is not focused
- 📦 **Ready to Use** - Pre-configured with Prettier and TypeScript strict mode
- 🚀 **Fast Development** - Vite HMR + Tauri hot reload

## Tech Stack

- **Desktop Framework**: [Tauri v2](https://tauri.app/)
- **Frontend Framework**: [React 19](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vite.dev/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Code Formatting**: [Prettier](https://prettier.io/)

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm >= 9
- Rust >= 1.70

### Install Dependencies

```bash
pnpm install
```

### Development Mode

```bash
pnpm tauri dev
```

### Build for Production

```bash
pnpm tauri build
```

### Version Management

`pnpm release:version` is the release entrypoint.

```bash
pnpm release:version
pnpm release:version --lang zh
pnpm release:version --lang en
```

It interactively handles the release preflight and version bump flow:
- Ensures the working tree is clean
- Requires the current branch to be `main`
- Verifies `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` are in sync
- Checks that the target tag does not already exist locally or on `origin`
- Updates all three version files together
- Creates the release commit and `vX.Y.Z` tag
- Optionally pushes the branch and tag

## Adding shadcn/ui Components

```bash
pnpm dlx shadcn@latest add <component-name>
```

Examples:

```bash
pnpm dlx shadcn@latest add button
pnpm dlx shadcn@latest add input
pnpm dlx shadcn@latest add dialog
```

## Code Formatting

```bash
pnpm format        # Format code
pnpm format:check  # Check code formatting
```

## Project Structure

```
.
├── src/                    # Frontend source code
│   ├── components/         # React components
│   │   └── ui/            # shadcn/ui components
│   ├── i18n/              # Internationalization
│   │   ├── index.ts       # i18n configuration
│   │   └── locales/       # Translation files
│   ├── lib/               # Utility functions
│   ├── App.tsx            # Main app component
│   └── main.tsx           # Entry point
├── src-tauri/             # Tauri/Rust backend
│   ├── src/               # Rust source code
│   └── tauri.conf.json    # Tauri configuration
├── docs/                  # Documentation
│   ├── AUTO_UPDATE.md     # Auto update guide
│   ├── I18N.md            # Internationalization guide
│   └── GLOBAL_SHORTCUT.md # Global shortcut guide
├── components.json        # shadcn/ui configuration
└── package.json
```

## CI/CD

This project uses GitHub Actions for automated builds and releases.

### Automated Release

The workflow is triggered by pushing tags matching `v*` (for example `v0.1.0`).
The recommended release path is to run `pnpm release:version`, which creates the matching `vX.Y.Z` tag for you.

**Manual tag push example:**
```bash
git tag v0.1.0
git push origin v0.1.0
```

### Build Outputs

The workflow generates:
- **NSIS Installer** - Windows installation package
- **Updater Files** - `latest.json` for auto-update support

### Auto Update Setup

To enable automatic updates, you need to:

1. Generate signing keys: `pnpm tauri signer generate -w ~/.tauri/myapp.key`
2. Add GitHub secrets: `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
3. Publish a non-draft GitHub Release so `releases/latest/download/latest.json` can resolve correctly

**Note:** The public key and update endpoint placeholders in `src-tauri/tauri.conf.json` are replaced by GitHub Actions during the release build. Auto update depends on the published GitHub Release exposing `latest.json` from the latest release assets.

See [Auto Update Configuration](./docs/AUTO_UPDATE.md) for detailed instructions.

### Code Signing (Optional)

To enable code signing, add these secrets in your GitHub repository settings:
- `TAURI_SIGNING_PRIVATE_KEY` - Private key content
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` - Private key password

The build will work without these secrets, but the installer won't be signed.

### Multi-Platform Support

To enable macOS and Linux builds, uncomment the corresponding platform configurations in `.github/workflows/release.yml`.

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/)
- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=kitlib/tauri-app-template&type=Date)](https://star-history.com/#kitlib/tauri-app-template&Date)

## License

MIT