'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'settingsApi',
  Object.freeze({
    getAll: () => ipcRenderer.invoke('settings:get-all'),
    update: (patch) => ipcRenderer.invoke('settings:update', patch),
    resetPermissions: () => ipcRenderer.invoke('settings:reset-permissions'),
    checkForUpdates: () => ipcRenderer.invoke('settings:check-for-updates'),
    getLogs: () => ipcRenderer.invoke('settings:get-logs'),
    copyText: (text) => ipcRenderer.invoke('settings:copy-text', String(text || '')),
    switchAccount: () => ipcRenderer.invoke('settings:switch-account'),
    signOut: () => ipcRenderer.invoke('settings:sign-out'),
    restartApp: () => ipcRenderer.invoke('settings:restart-app'),
    openExternal: (url) => ipcRenderer.invoke('settings:open-external', String(url || '')),
    close: () => ipcRenderer.send('settings:close'),
    notifyReady: () => ipcRenderer.send('settings:ready'),
    onOpened: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('settings:opened', listener);
      return () => ipcRenderer.removeListener('settings:opened', listener);
    },
    onUpdateResult: (callback) => {
      const listener = (_event, result) => callback(result);
      ipcRenderer.on('settings:update-check-result', listener);
      return () =>
        ipcRenderer.removeListener('settings:update-check-result', listener);
    },
  }),
);
