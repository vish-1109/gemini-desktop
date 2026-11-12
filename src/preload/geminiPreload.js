'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Avoid advertising Electron engine hints during Google authentication checks.
try {
  Object.defineProperty(navigator, 'userAgentData', {
    get: () => undefined,
    configurable: true,
  });
} catch {
  // Ignore if non-configurable in this environment
}

const isBundleOfflinePage =
  window.location.protocol === 'app:' &&
  window.location.hostname === 'bundle' &&
  window.location.pathname === '/offline.html';

if (isBundleOfflinePage) {
  contextBridge.exposeInMainWorld('geminiOffline', Object.freeze({
    retryLoad: () => ipcRenderer.send('gemini:retry-load'),
  }));
}

const isGeminiOrigin =
  window.location.protocol === 'https:' &&
  window.location.hostname === 'gemini.google.com';

if (isGeminiOrigin) {
  let appVersion = '';
  let localDeviceId = '';

  try {
    appVersion = String(ipcRenderer.sendSync('gemini:get-app-version') || '');
  } catch {
    appVersion = '';
  }

  try {
    localDeviceId = String(ipcRenderer.sendSync('gemini:get-local-device-id') || '');
  } catch {
    localDeviceId = '';
  }

  contextBridge.exposeInMainWorld(
    'geminiNative',
    Object.freeze({
      appVersion,
      localDeviceId,
      platform: 'linux',
      log: (level, message) =>
        ipcRenderer.send('gemini:log', {
          level: String(level || 'info'),
          message: String(message || ''),
        }),
      notifyTurnLifecycle: (payload) =>
        ipcRenderer.send('gemini:notify-turn-lifecycle', payload),
      updateAccountSwitcherSlot: (payload) =>
        ipcRenderer.send('gemini:update-account-switcher-slot', payload),
      getWindowSources: () => ipcRenderer.invoke('gemini:get-window-sources'),
      captureWindow: (sourceId) =>
        ipcRenderer.invoke('gemini:capture-window', String(sourceId || '')),
      getAppLogs: () => ipcRenderer.invoke('gemini:get-app-logs'),
      /* INTENTIONAL NO-OPS: Kept for Gemini web UI desktop-bridge parity so the frontend does not throw missing-method or IPC errors. Do not remove. */
      syncExperimentFlags: () => Promise.resolve({}),
      pollExperimentFlagsNow: () => Promise.resolve({}),
      getCachedFlags: () => ({}),
      listConnectedFolders: () => Promise.resolve([]),
      pickConnectedFolder: () => Promise.resolve(null),
      setConnectedFolderAttached: () => Promise.resolve(false),
      onConnectedFoldersChanged: () => () => {},
    }),
  );

  window.addEventListener('error', (event) => {
    try {
      ipcRenderer.send('gemini:renderer-error', {
        type: 'error',
        message: event.message || 'Unknown renderer error',
      });
    } catch {
      // Ignore reporting error
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    try {
      const reason =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason || 'Unhandled rejection');
      ipcRenderer.send('gemini:renderer-error', {
        type: 'unhandledrejection',
        message: reason,
      });
    } catch {
      // Ignore reporting error
    }
  });
}
