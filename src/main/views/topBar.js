'use strict';

const path = require('path');
const { Menu } = require('electron');
const { BUNDLE_ORIGIN, IPC, LAYOUT } = require('../constants');
const { isBundleIpcSender } = require('../ipcGuards');
const {
  ViewLifecycle,
  attachViewOnTop,
  createOverlayView,
  destroyView,
} = require('./viewHelper');

class TopBarController {
  constructor({ win, preloadDir, actions, getState }) {
    this.win = win;
    this.preloadDir = preloadDir;
    this.actions = actions;
    this.getState = getState;
    this.lifecycle = new ViewLifecycle();
    this.view = null;
    this.visible = true;
    this.setup();
  }

  setup() {
    this.view = createOverlayView({
      preloadPath: path.join(this.preloadDir, 'topBarPreload.js'),
      htmlUrl: `${BUNDLE_ORIGIN}/top_bar/top_bar.html`,
    });

    attachViewOnTop(this.win, this.view);
    this.view.setVisible(true);
    this.updateBounds();

    this.lifecycle.onWebContents(this.view.webContents, 'did-finish-load', () => {
      this.syncState();
    });

    this.lifecycle.onWindow(
      this.win,
      ['resize', 'maximize', 'unmaximize', 'restore', 'enter-full-screen', 'leave-full-screen'],
      () => {
        this.syncVisibilityAndBounds();
        this.syncState();
      },
    );

    const guard = (event) => isBundleIpcSender(event, this.view);

    this.lifecycle.onIpc(IPC.TOPBAR_OPEN_MENU, (event) => {
      if (!guard(event)) return;
      this.popupMainMenu();
    });

    this.lifecycle.onIpc(IPC.TOPBAR_OPEN_ACCOUNT_MENU, (event) => {
      if (!guard(event)) return;
      this.popupAccountMenu();
    });

    this.lifecycle.onIpc(IPC.TOPBAR_MINIMIZE, (event) => {
      if (!guard(event) || this.win.isDestroyed()) return;
      this.win.minimize();
    });

    this.lifecycle.onIpc(IPC.TOPBAR_MAXIMIZE_TOGGLE, (event) => {
      if (!guard(event) || this.win.isDestroyed()) return;
      if (this.win.isMaximized()) {
        this.win.unmaximize();
      } else {
        this.win.maximize();
      }
    });

    this.lifecycle.onIpc(IPC.TOPBAR_CLOSE, (event) => {
      if (!guard(event) || this.win.isDestroyed()) return;
      this.win.close();
    });
  }

  getHeight() {
    return this.visible ? LAYOUT.TOP_BAR_HEIGHT : 0;
  }

  syncVisibilityAndBounds() {
    if (!this.view || this.win.isDestroyed()) return;
    const isFull =
      typeof this.win.isFullScreen === 'function' && this.win.isFullScreen();
    this.visible = !isFull;
    this.view.setVisible(this.visible);
    this.updateBounds();
  }

  updateBounds() {
    if (!this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const { width } = this.win.getContentBounds();
    this.view.setBounds({
      x: 0,
      y: 0,
      width: Math.max(0, width),
      height: this.visible ? LAYOUT.TOP_BAR_HEIGHT : 0,
    });
  }

  syncState() {
    if (!this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const state = {
      title: 'Gemini',
      isMaximized: this.win.isMaximized(),
      ...this.getState(),
    };
    this.view.webContents.send(IPC.TOPBAR_STATE, state);
  }

  popupMainMenu() {
    if (this.win.isDestroyed()) return;
    const { width } = this.win.getContentBounds();
    const state = this.getState();
    const template = [
      { label: 'New Chat', accelerator: 'CmdOrCtrl+N', click: () => this.actions.newChat() },
      { label: 'Find in Page', accelerator: 'CmdOrCtrl+F', click: () => this.actions.openFind() },
      { type: 'separator' },
      { label: 'Reload Gemini', accelerator: 'CmdOrCtrl+R', click: () => this.actions.reload(false) },
      { label: 'Force Reload', accelerator: 'CmdOrCtrl+Shift+R', click: () => this.actions.reload(true) },
      { type: 'separator' },
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', click: () => this.actions.zoomIn() },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', click: () => this.actions.zoomOut() },
      { label: 'Actual Size', accelerator: 'CmdOrCtrl+0', click: () => this.actions.zoomReset() },
      {
        label: 'Toggle Full Screen',
        accelerator: 'F11',
        click: () => {
          if (!this.win.isDestroyed()) {
            this.win.setFullScreen(!this.win.isFullScreen());
          }
        },
      },
      { type: 'separator' },
      { label: 'Switch Account...', click: () => this.actions.switchAccount() },
      { label: 'Add Another Account...', click: () => this.actions.addAccount() },
      { label: 'Sign Out...', click: () => this.actions.signOut() },
      { type: 'separator' },
      { label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: () => this.actions.openSettings('general') },
      { label: 'Check for Updates', click: () => this.actions.checkUpdates() },
      { label: 'About Gemini', click: () => this.actions.openSettings('about') },
    ];

    if (state.isDev) {
      template.push(
        { type: 'separator' },
        { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => this.actions.toggleDevTools() },
      );
    }

    template.push(
      { type: 'separator' },
      { label: 'Hide to Tray', click: () => this.actions.hideToTray() },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => this.actions.quit() },
    );

    const xOffset = state.frameStyle === 'native' ? Math.max(0, width - 220) : Math.max(0, width - 310);
    Menu.buildFromTemplate(template).popup({
      window: this.win,
      x: xOffset,
      y: LAYOUT.TOP_BAR_HEIGHT,
    });
  }

  popupAccountMenu() {
    if (this.win.isDestroyed()) return;
    const { width } = this.win.getContentBounds();
    const state = this.getState();
    const template = [
      { label: 'Switch Google Account...', click: () => this.actions.switchAccount() },
      { label: 'Add Another Account...', click: () => this.actions.addAccount() },
      { type: 'separator' },
      { label: 'Sign Out & Clear Cookies', click: () => this.actions.signOut() },
    ];
    const xOffset = state.frameStyle === 'native' ? Math.max(0, width - 210) : Math.max(0, width - 290);
    Menu.buildFromTemplate(template).popup({
      window: this.win,
      x: xOffset,
      y: LAYOUT.TOP_BAR_HEIGHT,
    });
  }

  getView() {
    return this.view;
  }

  dispose() {
    this.lifecycle.dispose();
    destroyView(this.win, this.view);
    this.view = null;
  }
}

module.exports = { TopBarController };
