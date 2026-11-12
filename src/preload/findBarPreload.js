'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'findBarApi',
  Object.freeze({
    search: (query) => ipcRenderer.send('findbar:search', String(query || '')),
    next: () => ipcRenderer.send('findbar:next'),
    prev: () => ipcRenderer.send('findbar:prev'),
    close: () => ipcRenderer.send('findbar:close'),
    clear: () => ipcRenderer.send('findbar:clear'),
    onResult: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('findbar:result', listener);
      return () => ipcRenderer.removeListener('findbar:result', listener);
    },
    onFocus: (callback) => {
      const listener = () => callback();
      ipcRenderer.on('findbar:focus', listener);
      return () => ipcRenderer.removeListener('findbar:focus', listener);
    },
  }),
);
