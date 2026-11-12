'use strict';

const path = require('path');
const { BUNDLE_ORIGIN, IPC, LAYOUT } = require('../constants');
const { isBundleIpcSender } = require('../ipcGuards');
const {
  ViewLifecycle,
  attachViewOnTop,
  createOverlayView,
  destroyView,
  restoreContentFocus,
} = require('./viewHelper');

class PermissionDialogController {
  constructor({ win, contentView, preloadDir, getTopInset, onOpenSettings }) {
    this.win = win;
    this.contentView = contentView;
    this.preloadDir = preloadDir;
    this.getTopInset = getTopInset;
    this.onOpenSettings = onOpenSettings;
    this.lifecycle = new ViewLifecycle();
    this.view = null;
    this.queue = [];
    this.activeRequest = null;
    this.setup();
  }

  setup() {
    this.lifecycle.handleIpc(IPC.PERMISSION_GET_CURRENT, (event) => {
      if (!isBundleIpcSender(event, this.view) || !this.activeRequest) return null;
      return {
        capability: this.activeRequest.capability,
        title: this.activeRequest.title,
        desc: this.activeRequest.desc,
      };
    });

    this.lifecycle.onIpc(IPC.PERMISSION_RESPOND, (event, payload) => {
      if (!isBundleIpcSender(event, this.view) || !this.activeRequest) return;
      const req = this.activeRequest;
      this.activeRequest = null;
      req.callback(Boolean(payload?.allowed));
      if (this.queue.length === 0) {
        this.hideView();
      } else {
        this.showNext();
      }
    });

    this.lifecycle.onIpc(IPC.PERMISSION_OPEN_SETTINGS, (event) => {
      if (!isBundleIpcSender(event, this.view)) return;
      this.clearQueue(false);
      this.hideView();
      this.onOpenSettings('privacy');
    });

    this.lifecycle.onWindow(this.win, ['resize', 'enter-full-screen', 'leave-full-screen'], () => {
      this.updateBounds();
    });
  }

  enqueue(request) {
    if (this.win.isDestroyed()) {
      request.callback(false);
      return;
    }
    this.queue.push(request);
    if (!this.activeRequest) {
      this.showNext();
    }
  }

  showNext() {
    if (this.activeRequest || this.queue.length === 0 || this.win.isDestroyed()) return;
    this.activeRequest = this.queue.shift();

    this.ensureView();
    attachViewOnTop(this.win, this.view);
    this.view.setVisible(true);
    this.updateBounds();
    this.view.webContents.focus();

    const payload = {
      capability: this.activeRequest.capability,
      title: this.activeRequest.title,
      desc: this.activeRequest.desc,
    };

    if (this.view.webContents.isLoading()) {
      this.view.webContents.once('did-finish-load', () => {
        if (this.view && !this.view.webContents.isDestroyed()) {
          this.view.webContents.send(IPC.PERMISSION_REQUEST_DATA, payload);
        }
      });
    } else {
      this.view.webContents.send(IPC.PERMISSION_REQUEST_DATA, payload);
    }
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return;
    this.view = createOverlayView({
      preloadPath: path.join(this.preloadDir, 'permissionDialogPreload.js'),
      htmlUrl: `${BUNDLE_ORIGIN}/permission_dialog/permission_dialog.html`,
    });
  }

  hideView() {
    destroyView(this.win, this.view);
    this.view = null;
    restoreContentFocus(this.win, this.contentView);
  }

  clearQueue(allowed = false) {
    if (this.activeRequest) {
      const req = this.activeRequest;
      this.activeRequest = null;
      req.callback(allowed);
    }
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      item.callback(allowed);
    }
  }

  updateBounds() {
    if (!this.activeRequest || !this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const { width } = this.win.getContentBounds();
    const w = Math.min(LAYOUT.PERMISSION_DIALOG_WIDTH, Math.max(300, width - 24));
    const x = Math.max(0, Math.floor((width - w) / 2));
    this.view.setBounds({
      x,
      y: this.getTopInset() + LAYOUT.PERMISSION_DIALOG_TOP_OFFSET,
      width: w,
      height: LAYOUT.PERMISSION_DIALOG_HEIGHT,
    });
  }

  getView() {
    return this.activeRequest ? this.view : null;
  }

  dispose() {
    this.clearQueue(false);
    this.lifecycle.dispose();
    destroyView(this.win, this.view);
    this.view = null;
  }
}

module.exports = { PermissionDialogController };
