'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyLinuxChromiumSwitches,
  buildFeatureFlags,
  detectSessionType,
  findDangerousCliSwitch,
  isAutostartEnabledOnDisk,
  resolveLaunchCommand,
  syncAutostartDesktopFile,
} = require('../../src/main/linuxPlatform');

test('detectSessionType classifies Wayland vs X11 accurately', () => {
  assert.equal(detectSessionType({ XDG_SESSION_TYPE: 'wayland' }), 'wayland');
  assert.equal(detectSessionType({ WAYLAND_DISPLAY: 'wayland-0' }), 'wayland');
  assert.equal(detectSessionType({ DISPLAY: ':0' }), 'x11');
  assert.equal(detectSessionType({}), 'unknown');
});

test('buildFeatureFlags merges without duplicates', () => {
  assert.equal(
    buildFeatureFlags('VaapiVideoDecoder,WebRTCPipeWireCapturer', [
      'WebRTCPipeWireCapturer',
      'WaylandWindowDecorations',
    ]),
    'VaapiVideoDecoder,WebRTCPipeWireCapturer,WaylandWindowDecorations',
  );
});

test('applyLinuxChromiumSwitches respects explicit user ozone override', () => {
  const calls = [];
  const mockCmd = { appendSwitch: (k, v) => calls.push([k, v]) };
  applyLinuxChromiumSwitches(
    mockCmd,
    ['electron', '--ozone-platform=x11', '--enable-features=Foo'],
    {},
  );
  const map = Object.fromEntries(calls);
  assert.equal(map['ozone-platform-hint'], undefined);
  assert.equal(map['enable-features'], 'Foo,WebRTCPipeWireCapturer');
  assert.equal(map['process-per-site'], undefined);
  assert.ok(calls.some(([k]) => k === 'process-per-site'));
});

test('findDangerousCliSwitch blocks inspection/proxy flags only when packaged', () => {
  assert.equal(
    findDangerousCliSwitch(['gemini', '--remote-debugging-port=9222'], false),
    null,
  );
  assert.equal(
    findDangerousCliSwitch(['gemini', '--remote-debugging-port=9222'], true),
    'remote-debugging-port',
  );
  assert.equal(
    findDangerousCliSwitch(['gemini', '--toggle', '--tray'], true),
    null,
  );
});

test('resolveLaunchCommand prefers APPIMAGE when present and quotes spaces', () => {
  assert.equal(
    resolveLaunchCommand({
      execPath: '/tmp/mount/gemini-desktop',
      isPackaged: true,
      env: { APPIMAGE: '/home/user/My Apps/Gemini.AppImage' },
    }),
    '"/home/user/My Apps/Gemini.AppImage" --tray',
  );
});

test('syncAutostartDesktopFile creates and removes .desktop cleanly', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-autostart-'));
  try {
    const enabled = syncAutostartDesktopFile(true, {
      autostartDir: tmpDir,
      execLine: '/usr/bin/gemini-desktop --tray',
    });
    assert.equal(enabled.ok, true);
    assert.equal(isAutostartEnabledOnDisk(tmpDir), true);
    const body = fs.readFileSync(enabled.filePath, 'utf8');
    assert.match(body, /Exec=\/usr\/bin\/gemini-desktop --tray/);

    const disabled = syncAutostartDesktopFile(false, { autostartDir: tmpDir });
    assert.equal(disabled.ok, true);
    assert.equal(isAutostartEnabledOnDisk(tmpDir), false);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
