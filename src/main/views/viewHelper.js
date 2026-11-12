'use strict';

const { ipcMain, shell, WebContentsView } = require('electron');
const { isAllowedExternalUrl } = require('../urlPolicy');
const { logger } = require('../logger');

function openSafeExternal(rawUrl) {
  if (!isAllowedExternalUrl(rawUrl)) {
    logger.warn('navigation', `Blocked unsafe external URL scheme: ${rawUrl}`);
    return false;
  }
  shell.openExternal(rawUrl).catch((err) => {
    logger.warn('navigation', 'Failed to open external URL', err);
  });
  return true;
}

function createOverlayView({ preloadPath, htmlUrl }) {
  const view = new WebContentsView({
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  view.setBackgroundColor('#00000000');
  view.setVisible(false);

  view.webContents.on('will-navigate', (event, targetUrl) => {
    event.preventDefault();
    openSafeExternal(targetUrl);
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    openSafeExternal(url);
    return { action: 'deny' };
  });

  if (htmlUrl) {
    view.webContents.loadURL(htmlUrl).catch((err) => {
      logger.warn('view', `Failed to load overlay URL ${htmlUrl}`, err);
    });
  }
  return view;
}

function attachViewOnTop(win, view) {
  if (!win || win.isDestroyed() || !view || !win.contentView) return;
  try {
    win.contentView.removeChildView(view);
  } catch {
    // View may not be attached yet
  }
  try {
    win.contentView.addChildView(view);
  } catch {
    // Ignore if window tearing down
  }
}

function detachView(win, view) {
  if (!win || win.isDestroyed() || !view || !win.contentView) return;
  try {
    win.contentView.removeChildView(view);
  } catch {
    // Already detached
  }
}

function destroyView(win, view) {
  if (!view) return;
  detachView(win, view);
  try {
    if (view.webContents && !view.webContents.isDestroyed()) {
      view.webContents.close();
    }
  } catch {
    // Ignore cleanup errors
  }
}

function restoreContentFocus(win, contentView) {
  if (!win || win.isDestroyed()) return;
  const focus = () => {
    if (win.isDestroyed()) return;
    win.focus();
    const wc = contentView?.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.focus();
    }
  };
  focus();
  setImmediate(focus);
}

/**
 * Tracks IPC handlers, WebContents listeners, and BaseWindow listeners for deterministic disposal.
 */
class ViewLifecycle {
  constructor() {
    this.ipcOn = [];
    this.ipcHandled = [];
    this.winListeners = [];
    this.wcListeners = [];
  }

  onIpc(channel, handler) {
    ipcMain.on(channel, handler);
    this.ipcOn.push({ channel, handler });
  }

  handleIpc(channel, handler) {
    ipcMain.handle(channel, handler);
    this.ipcHandled.push(channel);
  }

  onWindow(win, eventNames, handler) {
    const events = Array.isArray(eventNames) ? eventNames : [eventNames];
    for (const eventName of events) {
      win.on(eventName, handler);
      this.winListeners.push({ win, eventName, handler });
    }
  }

  onWebContents(wc, eventName, handler) {
    wc.on(eventName, handler);
    this.wcListeners.push({ wc, eventName, handler });
  }

  dispose() {
    for (const { channel, handler } of this.ipcOn) {
      ipcMain.removeListener(channel, handler);
    }
    this.ipcOn.length = 0;

    for (const channel of this.ipcHandled) {
      ipcMain.removeHandler(channel);
    }
    this.ipcHandled.length = 0;

    for (const { win, eventName, handler } of this.winListeners) {
      try {
        if (!win.isDestroyed()) win.removeListener(eventName, handler);
      } catch {
        // Ignore
      }
    }
    this.winListeners.length = 0;

    for (const { wc, eventName, handler } of this.wcListeners) {
      try {
        if (!wc.isDestroyed()) wc.removeListener(eventName, handler);
      } catch {
        // Ignore
      }
    }
    this.wcListeners.length = 0;
  }
}

module.exports = {
  ViewLifecycle,
  attachViewOnTop,
  createOverlayView,
  destroyView,
  detachView,
  openSafeExternal,
  restoreContentFocus,
};
