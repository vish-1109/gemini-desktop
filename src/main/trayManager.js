'use strict';

const { Menu, nativeImage, Tray } = require('electron');
const { logger } = require('./logger');

class TrayManager {
  constructor({ iconPath, settingsStore, actions, isWindowVisible }) {
    this.iconPath = iconPath;
    this.settingsStore = settingsStore;
    this.actions = actions;
    this.isWindowVisible = isWindowVisible;
    this.tray = null;
  }

  init() {
    if (this.tray) return;
    try {
      let image = nativeImage.createFromPath(this.iconPath);
      if (image.isEmpty()) {
        logger.warn('tray', `Tray icon could not be loaded from ${this.iconPath}`);
        return;
      }
      image = image.resize({ width: 22, height: 22 });
      this.tray = new Tray(image);
      this.tray.setToolTip('Gemini');
      this.tray.on('click', () => {
        this.actions.toggleWindow();
      });
      this.updateMenu();
    } catch (error) {
      logger.warn('tray', 'Failed to initialize Linux system tray', error);
    }
  }

  updateMenu() {
    if (!this.tray) return;
    const visible = Boolean(this.isWindowVisible());
    const openAtLogin = Boolean(this.settingsStore.get('openAtLogin'));

    const menu = Menu.buildFromTemplate([
      {
        label: visible ? 'Hide Gemini' : 'Show Gemini',
        click: () => this.actions.toggleWindow(),
      },
      {
        label: 'New Chat',
        click: () => this.actions.newChat(),
      },
      { type: 'separator' },
      {
        label: 'Launch at Login',
        type: 'checkbox',
        checked: openAtLogin,
        click: (item) => this.settingsStore.set('openAtLogin', item.checked),
      },
      {
        label: 'Settings...',
        click: () => this.actions.openSettings('general'),
      },
      {
        label: 'Check for Updates...',
        click: () => this.actions.checkUpdates(),
      },
      {
        label: 'About Gemini',
        click: () => this.actions.openSettings('about'),
      },
      { type: 'separator' },
      {
        label: 'Quit Gemini',
        click: () => this.actions.quit(),
      },
    ]);
    this.tray.setContextMenu(menu);
  }

  dispose() {
    if (this.tray) {
      try {
        this.tray.destroy();
      } catch {
        // Ignore
      }
      this.tray = null;
    }
  }
}

module.exports = { TrayManager };
