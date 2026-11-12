'use strict';

const path = require('path');
const { BUNDLE_ORIGIN, GEMINI_APP_URL, IPC, LAYOUT } = require('../constants');
const { isBundleIpcSender } = require('../ipcGuards');
const { isAllowedGeminiUrl, isBundleUrl } = require('../urlPolicy');
const {
  ViewLifecycle,
  attachViewOnTop,
  createOverlayView,
  destroyView,
  restoreContentFocus,
} = require('./viewHelper');

class BackBarController {
  constructor({ win, contentView, preloadDir, getTopInset, onHeightChanged }) {
    this.win = win;
    this.contentView = contentView;
    this.preloadDir = preloadDir;
    this.getTopInset = getTopInset;
    this.onHeightChanged = onHeightChanged;
    this.lifecycle = new ViewLifecycle();
    this.view = null;
    this.visible = false;
    this.setup();
  }

  setup() {
    const wc = this.contentView.webContents;

    this.lifecycle.onWebContents(wc, 'did-navigate', (_e, url) => {
      this.evaluateUrl(String(url || ''));
    });
    this.lifecycle.onWebContents(wc, 'did-navigate-in-page', (_e, url, isMainFrame) => {
      if (isMainFrame) this.evaluateUrl(String(url || ''));
    });
    this.lifecycle.onWebContents(
      wc,
      'did-redirect-navigation',
      (_e, url, _isInPlace, isMainFrame) => {
        if (isMainFrame) this.evaluateUrl(String(url || ''));
      },
    );

    this.lifecycle.onIpc(IPC.BACKBAR_HOME, (event) => {
      if (!isBundleIpcSender(event, this.view) || this.win.isDestroyed()) return;
      if (!this.contentView.webContents.isDestroyed()) {
        this.contentView.webContents.loadURL(GEMINI_APP_URL).catch(() => {});
        restoreContentFocus(this.win, this.contentView);
      }
    });

    this.lifecycle.onWindow(this.win, ['resize', 'enter-full-screen', 'leave-full-screen'], () => {
      this.updateBounds();
    });
  }

  evaluateUrl(url) {
    const shouldShow = Boolean(url) && !isAllowedGeminiUrl(url) && !isBundleUrl(url);
    if (shouldShow === this.visible) return;
    if (shouldShow) {
      this.ensureView();
      this.visible = true;
      this.view.setVisible(true);
      this.updateBounds();
      this.onHeightChanged(LAYOUT.BACK_BAR_HEIGHT);
    } else {
      this.visible = false;
      if (this.view && !this.view.webContents.isDestroyed()) {
        this.view.setVisible(false);
      }
      this.onHeightChanged(0);
    }
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return;
    this.view = createOverlayView({
      preloadPath: path.join(this.preloadDir, 'backBarPreload.js'),
      htmlUrl: `${BUNDLE_ORIGIN}/back_bar/back_bar.html`,
    });
    attachViewOnTop(this.win, this.view);
  }

  getHeight() {
    return this.visible ? LAYOUT.BACK_BAR_HEIGHT : 0;
  }

  updateBounds() {
    if (!this.visible || !this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const { width } = this.win.getContentBounds();
    this.view.setBounds({
      x: 0,
      y: this.getTopInset(),
      width: Math.max(0, width),
      height: LAYOUT.BACK_BAR_HEIGHT,
    });
  }

  getView() {
    return this.visible ? this.view : null;
  }

  dispose() {
    this.lifecycle.dispose();
    destroyView(this.win, this.view);
    this.view = null;
    this.visible = false;
  }
}

module.exports = { BackBarController };
