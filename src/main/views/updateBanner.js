'use strict';

const path = require('path');
const { BUNDLE_ORIGIN, IPC, LAYOUT } = require('../constants');
const { isBundleIpcSender } = require('../ipcGuards');
const {
  ViewLifecycle,
  attachViewOnTop,
  createOverlayView,
  destroyView,
  openSafeExternal,
} = require('./viewHelper');

class UpdateBannerController {
  constructor({ win, preloadDir, settingsStore }) {
    this.win = win;
    this.preloadDir = preloadDir;
    this.settingsStore = settingsStore;
    this.lifecycle = new ViewLifecycle();
    this.view = null;
    this.visible = false;
    this.currentUpdate = null;
    this.setup();
  }

  setup() {
    const guard = (event) => isBundleIpcSender(event, this.view);

    this.lifecycle.onIpc(IPC.UPDATE_BANNER_OPEN_RELEASE, (event) => {
      if (!guard(event) || !this.currentUpdate) return;
      openSafeExternal(this.currentUpdate.releaseUrl);
      this.hide();
    });

    this.lifecycle.onIpc(IPC.UPDATE_BANNER_DISMISS, (event) => {
      if (!guard(event)) return;
      if (this.currentUpdate?.latestVersion) {
        this.settingsStore.set(
          'dismissedUpdateVersion',
          this.currentUpdate.latestVersion,
        );
      }
      this.hide();
    });

    this.lifecycle.onWindow(this.win, ['resize', 'enter-full-screen', 'leave-full-screen'], () => {
      this.updateBounds();
    });
  }

  show(updateInfo) {
    if (
      !updateInfo ||
      updateInfo.status !== 'available' ||
      this.win.isDestroyed()
    ) {
      return;
    }
    const dismissed = this.settingsStore.get('dismissedUpdateVersion');
    if (dismissed && dismissed === updateInfo.latestVersion) {
      return;
    }

    this.currentUpdate = updateInfo;
    this.visible = true;
    this.ensureView();
    attachViewOnTop(this.win, this.view);
    this.view.setVisible(true);
    this.updateBounds();

    if (this.view.webContents.isLoading()) {
      this.view.webContents.once('did-finish-load', () => {
        if (this.view && !this.view.webContents.isDestroyed()) {
          this.view.webContents.send(IPC.UPDATE_BANNER_SHOW, updateInfo);
        }
      });
    } else {
      this.view.webContents.send(IPC.UPDATE_BANNER_SHOW, updateInfo);
    }
  }

  hide() {
    this.visible = false;
    destroyView(this.win, this.view);
    this.view = null;
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return;
    this.view = createOverlayView({
      preloadPath: path.join(this.preloadDir, 'updateBannerPreload.js'),
      htmlUrl: `${BUNDLE_ORIGIN}/update_banner/update_banner.html`,
    });
  }

  updateBounds() {
    if (!this.visible || !this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const { width, height } = this.win.getContentBounds();
    const w = Math.min(LAYOUT.UPDATE_BANNER_WIDTH, Math.max(260, width - 24));
    const h = LAYOUT.UPDATE_BANNER_HEIGHT;
    this.view.setBounds({
      x: Math.max(0, width - w - LAYOUT.UPDATE_BANNER_MARGIN),
      y: Math.max(0, height - h - LAYOUT.UPDATE_BANNER_MARGIN),
      width: w,
      height: h,
    });
  }

  getView() {
    return this.visible ? this.view : null;
  }

  dispose() {
    this.lifecycle.dispose();
    this.hide();
  }
}

module.exports = { UpdateBannerController };
