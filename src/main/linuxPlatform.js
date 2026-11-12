'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DANGEROUS_CLI_SWITCHES } = require('./constants');

function detectSessionType(env = process.env) {
  const xdg = String(env.XDG_SESSION_TYPE || '').trim().toLowerCase();
  if (xdg === 'wayland') return 'wayland';
  if (xdg === 'x11') return 'x11';
  if (env.WAYLAND_DISPLAY) return 'wayland';
  if (env.DISPLAY) return 'x11';
  return 'unknown';
}

function getSwitchValue(argv, flagName) {
  const prefix = `--${flagName}=`;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || '');
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
    if (arg === `--${flagName}` && i + 1 < argv.length) {
      return String(argv[i + 1] || '');
    }
  }
  return '';
}

function hasCliSwitch(argv, flagName) {
  const exact = `--${flagName}`;
  const prefix = `--${flagName}=`;
  return argv.some((arg) => arg === exact || String(arg).startsWith(prefix));
}

function buildFeatureFlags(existingValue, requiredFeatures) {
  const set = new Set(
    String(existingValue || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  for (const feat of requiredFeatures) {
    if (feat) set.add(feat);
  }
  return Array.from(set).join(',');
}

/**
 * Configures Wayland/X11 and PipeWire screen capture Chromium flags before app.whenReady().
 */
function applyLinuxChromiumSwitches(commandLine, argv = process.argv, env = process.env) {
  if (!commandLine || typeof commandLine.appendSwitch !== 'function') return;

  commandLine.appendSwitch('process-per-site');
  commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

  const existingFeatures = getSwitchValue(argv, 'enable-features');
  const mergedFeatures = buildFeatureFlags(existingFeatures, [
    'WebRTCPipeWireCapturer',
  ]);
  if (mergedFeatures) {
    commandLine.appendSwitch('enable-features', mergedFeatures);
  }

  const hasExplicitOzone =
    hasCliSwitch(argv, 'ozone-platform') ||
    hasCliSwitch(argv, 'ozone-platform-hint') ||
    Boolean(env.ELECTRON_OZONE_PLATFORM_HINT);
  if (!hasExplicitOzone) {
    commandLine.appendSwitch('ozone-platform-hint', 'auto');
  }
}

function findDangerousCliSwitch(argv = process.argv, isPackaged = false) {
  if (!isPackaged || !Array.isArray(argv)) return null;
  for (const raw of argv) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    const prefix = ['--', '-'].find(
      (p) => trimmed.startsWith(p) && trimmed.length > p.length,
    );
    if (!prefix) continue;
    const body = trimmed.slice(prefix.length);
    const eqIndex = body.indexOf('=');
    const name = (eqIndex === -1 ? body : body.slice(0, eqIndex)).toLowerCase();
    if (DANGEROUS_CLI_SWITCHES.includes(name)) {
      return name;
    }
  }
  return null;
}

function quoteDesktopExecToken(token) {
  const str = String(token);
  if (!/[\s"'\\$`><~|&;*?(){}[\]]/.test(str)) return str;
  const escaped = str.replace(/(["\\$`])/g, '\\$1');
  return `"${escaped}"`;
}

function resolveLaunchCommand({
  execPath = process.execPath,
  appPath = '',
  isPackaged = false,
  env = process.env,
} = {}) {
  if (env.APPIMAGE && typeof env.APPIMAGE === 'string') {
    return `${quoteDesktopExecToken(env.APPIMAGE)} --tray`;
  }
  if (isPackaged) {
    return `${quoteDesktopExecToken(execPath)} --tray`;
  }
  const appTarget = appPath ? ` ${quoteDesktopExecToken(appPath)}` : '';
  return `${quoteDesktopExecToken(execPath)}${appTarget} --tray`.trim();
}

function renderAutostartDesktopEntry({ execLine, icon = 'gemini-desktop' }) {
  return [
    '[Desktop Entry]',
    'Type=Application',
    'Version=1.0',
    'Name=Gemini',
    'Comment=Desktop client for Google Gemini',
    `Exec=${execLine}`,
    `Icon=${icon}`,
    'Terminal=false',
    'Categories=Utility;Network;',
    'StartupNotify=false',
    'X-GNOME-Autostart-enabled=true',
    '',
  ].join('\n');
}

function getAutostartFilePath(autostartDir) {
  const dir =
    autostartDir || path.join(os.homedir(), '.config', 'autostart');
  return path.join(dir, 'gemini-desktop.desktop');
}

function isAutostartEnabledOnDisk(autostartDir) {
  try {
    return fs.existsSync(getAutostartFilePath(autostartDir));
  } catch {
    return false;
  }
}

function syncAutostartDesktopFile(enabled, options = {}) {
  const targetFile = getAutostartFilePath(options.autostartDir);
  try {
    if (enabled) {
      fs.mkdirSync(path.dirname(targetFile), { recursive: true });
      const execLine =
        options.execLine || resolveLaunchCommand(options.launchInfo || {});
      const content = renderAutostartDesktopEntry({
        execLine,
        icon: options.icon || 'gemini-desktop',
      });
      fs.writeFileSync(targetFile, content, 'utf8');
      return { ok: true, enabled: true, filePath: targetFile };
    }
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
    }
    return { ok: true, enabled: false, filePath: targetFile };
  } catch (error) {
    return {
      ok: false,
      enabled: isAutostartEnabledOnDisk(options.autostartDir),
      filePath: targetFile,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = {
  applyLinuxChromiumSwitches,
  buildFeatureFlags,
  detectSessionType,
  findDangerousCliSwitch,
  getAutostartFilePath,
  isAutostartEnabledOnDisk,
  quoteDesktopExecToken,
  renderAutostartDesktopEntry,
  resolveLaunchCommand,
  syncAutostartDesktopFile,
};
