'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'permissionDialogApi',
  Object.freeze({
    getCurrentRequest: () => ipcRenderer.invoke('permission:get-current-request'),
    respond: (allowed) =>
      ipcRenderer.send('permission:respond', { allowed: Boolean(allowed) }),
    openSettings: () => ipcRenderer.send('permission:open-settings'),
    onRequestData: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('permission:request-data', listener);
      return () =>
        ipcRenderer.removeListener('permission:request-data', listener);
    },
  }),
);
