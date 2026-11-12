'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'updateBannerApi',
  Object.freeze({
    openRelease: () => ipcRenderer.send('update-banner:open-release'),
    dismiss: () => ipcRenderer.send('update-banner:dismiss'),
    onShow: (callback) => {
      const listener = (_event, payload) => callback(payload);
      ipcRenderer.on('update-banner:show', listener);
      return () => ipcRenderer.removeListener('update-banner:show', listener);
    },
  }),
);
