'use strict';

const path = require('path');
const { clipboard } = require('electron');
const { BUNDLE_ORIGIN, IPC } = require('../constants');
const { isBundleIpcSender } = require('../ipcGuards');
const {
  ViewLifecycle,
  attachViewOnTop,
  createOverlayView,
  destroyView,
  openSafeExternal,
  restoreContentFocus,
} = require('./viewHelper');

class SettingsModalController {
  constructor({
    win,
    contentView,
    preloadDir,
    settingsStore,
    actions,
    getMeta,
  }) {
    this.win = win;
    this.contentView = contentView;
    this.preloadDir = preloadDir;
    this.settingsStore = settingsStore;
    this.actions = actions;
    this.getMeta = getMeta;
    this.lifecycle = new ViewLifecycle();
    this.view = null;
    this.isOpen = false;
    this.ready = false;
    this.pendingTab = 'general';
    this.lastUpdateResult = null;
    this.setup();
  }

  setup() {
    const guard = (event) => isBundleIpcSender(event, this.view);

    this.lifecycle.handleIpc(IPC.SETTINGS_GET_ALL, (event) => {
      if (!guard(event)) return null;
      return {
        settings: this.settingsStore.getAll(),
        meta: this.getMeta(),
      };
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_UPDATE, (event, patch) => {
      if (!guard(event)) return null;
      const updated = this.settingsStore.update(patch);
      return updated;
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_RESET_PERMISSIONS, (event) => {
      if (!guard(event)) return null;
      return this.settingsStore.resetPermissions();
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_CHECK_UPDATES, async (event) => {
      if (!guard(event)) return null;
      const res = await this.actions.checkUpdates({ interactive: true });
      this.lastUpdateResult = res;
      return res;
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_GET_LOGS, (event) => {
      if (!guard(event)) return '';
      return this.actions.getLogs();
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_COPY_TEXT, (event, text) => {
      if (!guard(event)) return false;
      clipboard.writeText(String(text || '').slice(0, 128 * 1024));
      return true;
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_SWITCH_ACCOUNT, (event) => {
      if (!guard(event)) return false;
      this.close();
      this.actions.switchAccount();
      return true;
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_SIGN_OUT, async (event) => {
      if (!guard(event)) return false;
      this.close();
      await this.actions.signOut();
      return true;
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_RESTART_APP, (event) => {
      if (!guard(event)) return false;
      this.actions.restartApp();
      return true;
    });

    this.lifecycle.handleIpc(IPC.SETTINGS_OPEN_EXTERNAL, (event, rawUrl) => {
      if (!guard(event)) return false;
      return openSafeExternal(rawUrl);
    });

    this.lifecycle.onIpc(IPC.SETTINGS_CLOSE, (event) => {
      if (!guard(event)) return;
      this.close();
    });

    this.lifecycle.onIpc(IPC.SETTINGS_READY, (event) => {
      if (!guard(event)) return;
      this.ready = true;
      if (this.isOpen && this.view && !this.view.webContents.isDestroyed()) {
        this.view.setVisible(true);
        this.view.webContents.send(IPC.SETTINGS_OPENED, { tab: this.pendingTab });
        this.view.webContents.focus();
        if (this.lastUpdateResult) {
          this.view.webContents.send(IPC.SETTINGS_UPDATE_RESULT, this.lastUpdateResult);
        }
      }
    });

    this.lifecycle.onWindow(this.win, ['resize', 'enter-full-screen', 'leave-full-screen'], () => {
      this.updateBounds();
    });
  }

  open(tab = 'general') {
    if (this.win.isDestroyed()) return;
    this.pendingTab = tab;
    this.isOpen = true;
    this.ensureView();
    attachViewOnTop(this.win, this.view);
    this.updateBounds();

    if (this.ready && !this.view.webContents.isDestroyed()) {
      this.view.setVisible(true);
      this.view.webContents.send(IPC.SETTINGS_OPENED, { tab });
      this.view.webContents.focus();
      if (this.lastUpdateResult) {
        this.view.webContents.send(IPC.SETTINGS_UPDATE_RESULT, this.lastUpdateResult);
      }
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.ready = false;
    destroyView(this.win, this.view);
    this.view = null;
    restoreContentFocus(this.win, this.contentView);
  }

  notifyUpdateResult(result) {
    this.lastUpdateResult = result;
    if (this.isOpen && this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send(IPC.SETTINGS_UPDATE_RESULT, result);
    }
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return;
    this.ready = false;
    this.view = createOverlayView({
      preloadPath: path.join(this.preloadDir, 'settingsPreload.js'),
      htmlUrl: `${BUNDLE_ORIGIN}/settings/settings.html`,
    });
  }

  updateBounds() {
    if (!this.isOpen || !this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const { width, height } = this.win.getContentBounds();
    this.view.setBounds({
      x: 0,
      y: 0,
      width: Math.max(0, width),
      height: Math.max(0, height),
    });
  }

  getView() {
    return this.isOpen ? this.view : null;
  }

  dispose() {
    this.isOpen = false;
    this.lifecycle.dispose();
    destroyView(this.win, this.view);
    this.view = null;
  }
}

module.exports = { SettingsModalController };
