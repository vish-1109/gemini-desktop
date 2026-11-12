'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'topBarApi',
  Object.freeze({
    openMenu: () => ipcRenderer.send('topbar:open-menu'),
    openAccountMenu: () => ipcRenderer.send('topbar:open-account-menu'),
    minimize: () => ipcRenderer.send('topbar:minimize'),
    toggleMaximize: () => ipcRenderer.send('topbar:maximize-toggle'),
    close: () => ipcRenderer.send('topbar:close'),
    onState: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('topbar:state', listener);
      return () => ipcRenderer.removeListener('topbar:state', listener);
    },
  }),
);
