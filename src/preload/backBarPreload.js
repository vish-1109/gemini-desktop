'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'backBarApi',
  Object.freeze({
    goHome: () => ipcRenderer.send('backbar:home'),
  }),
);
