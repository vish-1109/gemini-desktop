# Gemini Desktop for Linux

A clean-room Linux desktop client for **Google Gemini** (`https://gemini.google.com/app`) built on Electron `BaseWindow`, layered `WebContentsView` overlays, strict Chromium sandboxing, and native Wayland/X11 desktop integration.

> **Disclaimer:** Independent open-source project maintained by Vishrut and licensed under **GPL-3.0** (`LICENSE`). Not affiliated with, endorsed by, or distributed by Google LLC.

---

## Key Features

- **Layered Desktop Architecture (`BaseWindow` + `WebContentsView`)**
  - Dedicated content view for Gemini alongside isolated local `app://bundle` overlay views for the custom Material 3 top bar, Google OAuth back bar, floating Find-in-Page bar, permission prompt card, screen-share source picker, Settings modal, and update pill.
- **Security & Isolation**
  - **Zero third-party runtime dependencies** (`dependencies` is empty; runs purely on Electron and Node.js built-ins).
  - `app.enableSandbox()`, `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false` on every `WebContentsView` and auth popup window.
  - Rigid Content Security Policy (`default-src 'none'; script-src 'self'; ...`) on all internal `app://bundle` views with canonical path containment and dot-segment rejection (`src/main/protocol.js`).
  - Top-level frame origin and exact `webContents` identity verification on every IPC handler (`src/main/ipcGuards.js`), HTTPS-only OAuth flow enforcement (`src/main/urlPolicy.js`), and CLI switch hardening (`src/main/main.js`).
- **Linux Desktop Integration (Wayland & X11)**
  - Automatic Ozone Wayland/X11 selection (`ozone-platform-hint=auto`) and **PipeWire** WebRTC screen/window capture (`WebRTCPipeWireCapturer`) paired with a desktop capture source picker.
  - **Single-instance Quick Toggle (`--toggle`)** for desktop keyboard shortcut bindings (GNOME, KDE Plasma, Hyprland, Sway).
  - System tray integration (`--tray`, `closeToTray`, `startInTray`), XDG autostart `.desktop` management (`openAtLogin`), desktop notifications when a response finishes while unfocused (`notifyOnTurnComplete`), custom/native window frame toggle, zoom controls (`Ctrl+=` / `Ctrl+-` / `Ctrl+0`), and redacted diagnostics logs.
  - Optional GitHub Releases update check (`autoCheckUpdates`, manual check in Settings -> About) with **zero** third-party telemetry or proprietary update agents.

---

## Minimum Requirements

- **`glibc >= 2.28`** (packaged Electron binaries require at most `GLIBC_2.25` with zero native C/C++ addons)
- **Supported Linux distributions (`x86_64`):** Ubuntu `20.04+`, Debian `10+`, Linux Mint `20+`, Fedora `36+`, RHEL `8+` (and derivatives)
- **Package formats:** Use `.deb` for Debian/Ubuntu-family distributions, or `.AppImage` on any other Linux distribution

---

## Installation

Download the latest Linux release from the [GitHub Releases](https://github.com/vish-1109/gemini-desktop/releases) page:

### Debian / Ubuntu (`.deb`)

```bash
sudo apt install ./gemini-desktop_1.0.0_amd64.deb
```

### Universal Linux (`AppImage`)

```bash
chmod +x gemini-desktop-*.AppImage
./gemini-desktop-*.AppImage
```

---

## Uninstall

- **Debian / Ubuntu (`.deb`):**
  ```bash
  sudo apt remove gemini-desktop
  ```
- **AppImage:** Delete the downloaded `gemini-desktop-*.AppImage` file.

---

## CLI Options

| Flag | Purpose |
| --- | --- |
| `--toggle` | Show/hide or focus the running instance (bind in Wayland DE keyboard shortcuts) |
| `--new-chat` | Focus the window and open a fresh Gemini conversation |
| `--settings` | Launch or focus directly to the Settings modal |
| `--tray` | Start minimized in the system tray |
| `--reset-bounds` | Clear saved multi-monitor window coordinates |
| `--dev` | Enable DevTools menu item and developer logging |

---

## Wayland Quick Toggle Setup

Global shortcuts from background apps (`globalShortcut`) are restricted by Wayland security protocols. Bind a native compositor/DE shortcut to invoke single-instance toggle instead:

```bash
gemini-desktop --toggle
```

- **GNOME:** Settings -> Keyboard -> View and Customize Shortcuts -> Custom Shortcuts
- **KDE Plasma:** System Settings -> Keyboard -> Shortcuts -> Add Command
- **Hyprland:** `bind = ALT, SPACE, exec, gemini-desktop --toggle`
- **Sway:** `bindsym Mod1+space exec gemini-desktop --toggle`

---

## Architecture Overview

```text
src/
├── main/
│   ├── main.js              # CLI policy, single-instance lock, lifecycle, session wiring
│   ├── windowManager.js     # BaseWindow, bounds persistence, deterministic z-order stack
│   ├── protocol.js          # Privileged app://bundle scheme + CSP + traversal-safe asset loader
│   ├── ipcGuards.js         # Origin & WebContents sender guards
│   ├── urlPolicy.js         # Gemini/Auth allowlists, OAuth Flow tracking, header scrubbing
│   ├── settingsStore.js     # Debounced atomic JSON settings persistence
│   ├── permissions.js       # Per-capability permission gate & prompt queue
│   ├── capture.js           # DesktopCapturer / PipeWire source enumeration & picker bridge
│   ├── trayManager.js       # StatusNotifier/AppIndicator tray menu
│   ├── linuxPlatform.js     # Wayland/X11 detection, Chromium switches, XDG autostart
│   ├── updater.js           # GitHub Releases version check
│   ├── logger.js            # Ring-buffer logger with email/query/token redaction
│   └── views/               # View controllers (TopBar, BackBar, FindBar, Settings, Dialogs, UpdateBanner)
├── preload/                 # Standalone sandbox-compatible contextBridge preloads
└── renderer/                # Zero-inline-script Material 3 overlays, loading, & offline pages
```

---

## Development / Building from Source

```bash
# Clone the repository
git clone https://github.com/vish-1109/gemini-desktop.git
cd gemini-desktop

# Install exact locked dependencies
npm ci

# Run the app locally
npm start

# Static checks (JS syntax, sandboxed preloads, HTML CSP, AppStream metainfo)
npm run check

# Run unit tests & Electron integration smoke tests
npm run test:all

# Build .deb and AppImage packages into dist/
npm run build
# Or individually:
npm run build:deb
npm run build:appimage
```

Packaging is configured in `package.json` via `electron-builder` alongside AppStream metadata (`build/metainfo/io.github.vish1109.gemini.metainfo.xml`) and Debian post-remove cleanup (`scripts/after-remove.tpl`).

---

## License

Licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See [LICENSE](LICENSE).
