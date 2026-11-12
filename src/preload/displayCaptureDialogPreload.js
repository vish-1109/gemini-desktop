'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'displayCaptureApi',
  Object.freeze({
    getCurrentRequest: () =>
      ipcRenderer.invoke('display-capture:get-current-request'),
    respond: (allowed, sourceId = '') =>
      ipcRenderer.send('display-capture:respond', {
        allowed: Boolean(allowed),
        sourceId: String(sourceId || ''),
      }),
    onRequestData: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on('display-capture:request-data', listener);
      return () =>
        ipcRenderer.removeListener('display-capture:request-data', listener);
    },
  }),
);
