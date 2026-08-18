# Gemini Desktop

Unofficial desktop wrapper for Google Gemini, providing a desktop user experience on Debian and Linux desktops.

Maintained by **Vishrut** ([@vish-1109](https://github.com/vish-1109)). Based on original work by **Ken VanDine** ([@kenvandine](https://github.com/kenvandine)).

📦 **[Download Latest .deb Release](https://github.com/vish-1109/gemini-desktop/releases)**

## Disclaimer

This project and its contributors are not affiliated with Google. This is an Electron desktop application that loads the official Google Gemini web application with desktop integration.

## Installation

### Debian / Ubuntu (.deb)

Download the `.deb` from the [Releases](https://github.com/vish-1109/gemini-desktop/releases) page or build from source, then install with:

```bash
sudo apt install -y ./gemini-desktop_1.0.0_amd64.deb
```

## Requirements

You will need Node.js and [npm](https://www.npmjs.com/).

## Cloning the source code

```bash
git clone https://github.com/vish-1109/gemini-desktop.git
cd gemini-desktop
```

## Development & Building

Install dependencies:
```bash
npm install
```

Run locally:
```bash
npm start
```

Build Debian package:
```bash
npm run build
```

## Issues & Support

Please report issues at: [https://github.com/vish-1109/gemini-desktop/issues](https://github.com/vish-1109/gemini-desktop/issues)
