'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, protocol, session } = require('electron');

const ROOT_DIR = path.resolve(__dirname, '../..');
const RENDERER_DIR = path.join(ROOT_DIR, 'src/renderer');
const PRELOAD_DIR = path.join(ROOT_DIR, 'src/preload');
const ICON_PATH = path.join(ROOT_DIR, 'icon.png');

const { BUNDLE_ORIGIN, IPC, LAYOUT } = require('../../src/main/constants');
const { installSessionPermissions } = require('../../src/main/permissions');
const {
  registerBundleProtocolHandler,
  registerPrivilegedBundleScheme,
} = require('../../src/main/protocol');
const { SettingsStore } = require('../../src/main/settingsStore');
const { WindowManager } = require('../../src/main/windowManager');

const tmpUserData = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-desktop-smoke-'));
app.setPath('userData', tmpUserData);
app.setName('Gemini');

registerPrivilegedBundleScheme(protocol);
app.enableSandbox();

const consoleErrors = [];
const uncaughtErrors = [];

app.on('window-all-closed', () => {
  // Keep runner alive until runSmokeChecks explicitly exits with app.exit(0)
});

process.on('uncaughtException', (err) => {
  const msg = `uncaughtException: ${err.stack || err.message}`;
  console.error(msg);
  uncaughtErrors.push(msg);
});
process.on('unhandledRejection', (reason) => {
  const msg = `unhandledRejection: ${String(reason)}`;
  console.error(msg);
  uncaughtErrors.push(msg);
});

function watchViewConsole(view, label) {
  if (!view?.webContents || view.webContents.isDestroyed()) return;
  view.webContents.on('console-message', (details) => {
    if (details.level >= 2) {
      consoleErrors.push(`[${label}] ${details.message}`);
    }
  });
  view.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason !== 'clean-exit') {
      uncaughtErrors.push(`[${label}] render-process-gone: ${details.reason}`);
    }
  });
}

async function waitForViewReady(view, timeoutMs = 8000) {
  assert.ok(view && view.webContents && !view.webContents.isDestroyed(), 'Expected live WebContentsView');
  const wc = view.webContents;
  if (!wc.isLoading() && wc.getURL()) {
    return;
  }
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for view load (${wc.getURL() || 'empty'})`));
    }, timeoutMs);
    const done = () => {
      clearTimeout(timer);
      resolve();
    };
    wc.once('did-finish-load', done);
    wc.once('did-fail-load', (_e, code, desc, url) => {
      clearTimeout(timer);
      reject(new Error(`View failed to load ${url}: ${code} ${desc}`));
    });
  });
}

async function runSmokeChecks() {
  await app.whenReady();

  registerBundleProtocolHandler(protocol, RENDERER_DIR, {
    'assets/icon.png': ICON_PATH,
  });

  const settingsStore = new SettingsStore(path.join(tmpUserData, 'settings.json'));
  settingsStore.load();

  let didQuit = false;
  const windowManager = new WindowManager({
    iconPath: ICON_PATH,
    preloadDir: PRELOAD_DIR,
    settingsStore,
    isDev: true,
    startVisible: false,
    onVisibilityChange: () => {},
    onCheckUpdates: async () => ({ status: 'up-to-date', currentVersion: app.getVersion() }),
    getMeta: () => ({
      appVersion: app.getVersion(),
      license: 'GPL-3.0',
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      sessionType: 'x11',
    }),
    onQuit: () => {
      didQuit = true;
    },
    onRestart: () => {},
  });

  // Override remote navigation in offline/sandboxed smoke runner to stay local on offline.html
  windowManager.loadInitialContent = function loadLocalSmokePage() {
    this.showOfflinePage();
  };

  const win = windowManager.create();
  installSessionPermissions(session.defaultSession, {
    settingsStore,
    permissionDialog: windowManager.permissionDialog,
  });
  settingsStore.subscribe((key) => {
    if (key === 'zoomLevel') windowManager.applySavedZoom();
  });
  assert.ok(win && !win.isDestroyed(), 'BaseWindow should be created');
  watchViewConsole(windowManager.contentView, 'contentView');
  await waitForViewReady(windowManager.contentView);
  assert.equal(windowManager.contentView.webContents.getURL(), `${BUNDLE_ORIGIN}/offline.html`);

  const offlineState = await windowManager.contentView.webContents.executeJavaScript(`({
    hasGeminiOffline: typeof window.geminiOffline === 'object',
    hasNodeRequire: typeof window.require !== 'undefined',
    hasProcess: typeof window.process !== 'undefined',
    imgWidth: document.querySelector('img')?.naturalWidth || 0
  })`);
  assert.equal(offlineState.hasGeminiOffline, true);
  assert.equal(offlineState.hasNodeRequire, false);
  assert.equal(offlineState.hasProcess, false);
  assert.ok(offlineState.imgWidth > 0, 'Aliased icon.png must render in app://bundle');

  // 1. TopBar overlay check
  watchViewConsole(windowManager.topBar.getView(), 'topBar');
  await waitForViewReady(windowManager.topBar.getView());
  const topBarState = await windowManager.topBar.getView().webContents.executeJavaScript(`({
    hasApi: typeof window.topBarApi === 'object',
    hasRequire: typeof window.require !== 'undefined',
    buttonCount: document.querySelectorAll('button').length
  })`);
  assert.equal(topBarState.hasApi, true);
  assert.equal(topBarState.hasRequire, false);
  assert.ok(topBarState.buttonCount >= 4, 'Top bar buttons should be present');

  // 2. BackBar check
  windowManager.backBar.evaluateUrl('https://accounts.google.com/v3/signin');
  assert.equal(windowManager.backBar.getHeight(), LAYOUT.BACK_BAR_HEIGHT);
  watchViewConsole(windowManager.backBar.getView(), 'backBar');
  await waitForViewReady(windowManager.backBar.getView());
  const backBarApi = await windowManager.backBar.getView().webContents.executeJavaScript(
    `typeof window.backBarApi === 'object'`,
  );
  assert.equal(backBarApi, true);
  windowManager.backBar.evaluateUrl('https://gemini.google.com/app');
  assert.equal(windowManager.backBar.getHeight(), 0);

  // 3. FindBar check
  windowManager.findBar.open();
  watchViewConsole(windowManager.findBar.getView(), 'findBar');
  await waitForViewReady(windowManager.findBar.getView());
  const findResult = await windowManager.findBar.getView().webContents.executeJavaScript(`(() => {
    const input = document.querySelector('input');
    return { hasApi: typeof window.findBarApi === 'object', hasInput: Boolean(input) };
  })()`);
  assert.equal(findResult.hasApi, true);
  assert.equal(findResult.hasInput, true);
  windowManager.findBar.close();
  assert.equal(windowManager.findBar.visible, false);

  // 4. SettingsModal + sandboxed IPC persistence & all options check
  windowManager.settingsModal.open('about');
  watchViewConsole(windowManager.settingsModal.getView(), 'settingsModal');
  await waitForViewReady(windowManager.settingsModal.getView());
  const settingsRoundTrip = await windowManager.settingsModal.getView().webContents.executeJavaScript(`(async () => {
    const initial = await window.settingsApi.getAll();
    const updated = await window.settingsApi.update({
      startInTray: true,
      closeToTray: false,
      notifyOnTurnComplete: false,
      autoCheckUpdates: false,
      zoomLevel: 1.5,
      permissions: { media: 'granted', notifications: 'denied' },
    });
    const logs = await window.settingsApi.getLogs();
    const updateRes = await window.settingsApi.checkForUpdates();
    const resetRes = await window.settingsApi.resetPermissions();
    const clipboardOk = Boolean(await window.settingsApi.copyText('gemini-desktop --toggle'));
    return {
      initialMeta: initial.meta,
      updated,
      logsLen: String(logs || '').length,
      updateStatus: updateRes?.status,
      resetMedia: resetRes?.media,
      clipboardOk,
    };
  })()`);
  assert.equal(settingsRoundTrip.initialMeta.license, 'GPL-3.0');
  assert.equal(settingsRoundTrip.updated.startInTray, true);
  assert.equal(settingsRoundTrip.updated.closeToTray, false);
  assert.equal(settingsRoundTrip.updated.notifyOnTurnComplete, false);
  assert.equal(settingsRoundTrip.updated.autoCheckUpdates, false);
  assert.equal(settingsRoundTrip.updated.zoomLevel, 1.5);
  assert.equal(settingsStore.get('zoomLevel'), 1.5);
  assert.equal(settingsStore.get('startInTray'), true);
  assert.equal(settingsRoundTrip.updateStatus, 'up-to-date');
  assert.equal(settingsRoundTrip.resetMedia, 'ask');
  assert.equal(settingsRoundTrip.clipboardOk, true);
  assert.equal(windowManager.contentView.webContents.getZoomLevel(), 1.5);
  windowManager.settingsModal.close();
  assert.equal(windowManager.settingsModal.isOpen, false);

  // 5. UpdateBanner check
  windowManager.updateBanner.show({
    status: 'available',
    latestVersion: '9.9.9',
    releaseUrl: 'https://github.com/vish-1109/gemini-desktop/releases/tag/v9.9.9',
    notes: 'Test banner',
  });
  watchViewConsole(windowManager.updateBanner.getView(), 'updateBanner');
  await waitForViewReady(windowManager.updateBanner.getView());
  const bannerOk = await windowManager.updateBanner.getView().webContents.executeJavaScript(
    `typeof window.updateBannerApi === 'object'`,
  );
  assert.equal(bannerOk, true);
  windowManager.updateBanner.hide();

  // 6. PermissionDialog check (verify UI DOM + button click + IPC callback)
  let permissionOutcome = null;
  windowManager.permissionDialog.enqueue({
    capability: 'Microphone access',
    title: 'Allow microphone for Gemini?',
    desc: 'Smoke test prompt',
    callback: (allowed) => {
      permissionOutcome = allowed;
    },
  });
  watchViewConsole(windowManager.permissionDialog.getView(), 'permissionDialog');
  await waitForViewReady(windowManager.permissionDialog.getView());
  const permOk = await windowManager.permissionDialog.getView().webContents.executeJavaScript(`(() => {
    const ok = typeof window.permissionDialogApi === 'object';
    const denyBtn = document.getElementById('btn-block');
    if (denyBtn) {
      // Defer click so executeJavaScript resolves before hideView() closes this WebContents
      setTimeout(() => denyBtn.click(), 20);
    }
    return { ok, hasDenyBtn: Boolean(denyBtn) };
  })()`);
  assert.equal(permOk.ok, true);
  assert.equal(permOk.hasDenyBtn, true);
  for (let i = 0; i < 40 && permissionOutcome === null; i += 1) {
    await new Promise((r) => setTimeout(r, 30));
  }
  assert.equal(permissionOutcome, false);

  // 7. DisplayCaptureDialog check (verify UI renders source card & Allow resolves selected sourceId)
  const capturePromise = windowManager.displayCaptureDialog.prompt({
    appName: 'Gemini',
    sources: [
      { id: 'screen:0:0', name: 'Entire Screen', kind: 'screen', thumbnailDataUrl: '' },
    ],
  });
  watchViewConsole(windowManager.displayCaptureDialog.getView(), 'displayCaptureDialog');
  await waitForViewReady(windowManager.displayCaptureDialog.getView());
  const capOk = await windowManager.displayCaptureDialog.getView().webContents.executeJavaScript(`(async () => {
    const deadline = Date.now() + 2000;
    while (document.querySelectorAll('.source-card').length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 30));
    }
    const cards = document.querySelectorAll('.source-card').length;
    const allowBtn = document.getElementById('dc-allow');
    if (allowBtn) {
      // Defer click so executeJavaScript resolves before hideView() closes this WebContents
      setTimeout(() => allowBtn.click(), 20);
    }
    return {
      ok: typeof window.displayCaptureApi === 'object',
      cards,
      hasAllowBtn: Boolean(allowBtn),
    };
  })()`);
  assert.equal(capOk.ok, true);
  assert.equal(capOk.cards, 1);
  assert.equal(capOk.hasAllowBtn, true);
  const captureDecision = await capturePromise;
  assert.deepEqual(captureDecision, { allowed: true, sourceId: 'screen:0:0' });

  // 8. Z-order + clean teardown via BaseWindow close -> WindowManager.cleanup()
  windowManager.syncZOrder();
  windowManager.setQuitting();
  await new Promise((resolve) => {
    win.once('closed', resolve);
    win.close();
  });
  assert.equal(windowManager.win, null);
  assert.equal(didQuit, false);

  assert.deepEqual(consoleErrors, [], `Unexpected renderer console errors: ${consoleErrors.join('; ')}`);
  assert.deepEqual(uncaughtErrors, [], `Unexpected uncaught errors: ${uncaughtErrors.join('; ')}`);

  console.log('ELECTRON_SMOKE_OK');
}

runSmokeChecks()
  .then(() => {
    fs.rmSync(tmpUserData, { recursive: true, force: true });
    app.exit(0);
  })
  .catch((err) => {
    console.error('ELECTRON_SMOKE_FAIL:', err.stack || err);
    fs.rmSync(tmpUserData, { recursive: true, force: true });
    app.exit(1);
  });
