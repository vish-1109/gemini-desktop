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

class DisplayCaptureDialogController {
  constructor({ win, contentView, preloadDir }) {
    this.win = win;
    this.contentView = contentView;
    this.preloadDir = preloadDir;
    this.lifecycle = new ViewLifecycle();
    this.view = null;
    this.pending = null;
    this.setup();
  }

  setup() {
    this.lifecycle.handleIpc(IPC.CAPTURE_GET_CURRENT, (event) => {
      if (!isBundleIpcSender(event, this.view) || !this.pending) return null;
      return this.pending.payload;
    });

    this.lifecycle.onIpc(IPC.CAPTURE_RESPOND, (event, decision) => {
      if (!isBundleIpcSender(event, this.view) || !this.pending) return;
      const resolve = this.pending.resolve;
      this.pending = null;
      this.hideView();
      resolve({
        allowed: Boolean(decision?.allowed),
        sourceId: typeof decision?.sourceId === 'string' ? decision.sourceId : '',
      });
    });

    this.lifecycle.onWindow(this.win, ['resize', 'enter-full-screen', 'leave-full-screen'], () => {
      this.updateBounds();
    });
  }

  prompt(payload) {
    if (this.win.isDestroyed() || this.pending) {
      return Promise.resolve({ allowed: false, sourceId: '' });
    }

    return new Promise((resolve) => {
      this.pending = { payload, resolve };
      this.ensureView();
      attachViewOnTop(this.win, this.view);
      this.view.setVisible(true);
      this.updateBounds();
      this.view.webContents.focus();

      if (this.view.webContents.isLoading()) {
        this.view.webContents.once('did-finish-load', () => {
          if (this.view && !this.view.webContents.isDestroyed()) {
            this.view.webContents.send(IPC.CAPTURE_REQUEST_DATA, payload);
          }
        });
      } else {
        this.view.webContents.send(IPC.CAPTURE_REQUEST_DATA, payload);
      }
    });
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return;
    this.view = createOverlayView({
      preloadPath: path.join(this.preloadDir, 'displayCaptureDialogPreload.js'),
      htmlUrl: `${BUNDLE_ORIGIN}/display_capture_dialog/display_capture_dialog.html`,
    });
  }

  hideView() {
    destroyView(this.win, this.view);
    this.view = null;
    restoreContentFocus(this.win, this.contentView);
  }

  updateBounds() {
    if (!this.pending || !this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const { width, height } = this.win.getContentBounds();
    const w = Math.min(LAYOUT.CAPTURE_DIALOG_WIDTH, Math.max(320, width - 24));
    const h = Math.min(LAYOUT.CAPTURE_DIALOG_HEIGHT, Math.max(320, height - 24));
    this.view.setBounds({
      x: Math.max(0, Math.floor((width - w) / 2)),
      y: Math.max(0, Math.floor((height - h) / 2)),
      width: w,
      height: h,
    });
  }

  getView() {
    return this.pending ? this.view : null;
  }

  dispose() {
    if (this.pending) {
      const resolve = this.pending.resolve;
      this.pending = null;
      resolve({ allowed: false, sourceId: '' });
    }
    this.lifecycle.dispose();
    destroyView(this.win, this.view);
    this.view = null;
  }
}

module.exports = { DisplayCaptureDialogController };
