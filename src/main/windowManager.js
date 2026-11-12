'use strict';

const path = require('path');
const { BaseWindow, clipboard, Menu, screen, session, WebContentsView } = require('electron');
const {
  BUNDLE_ORIGIN,
  GEMINI_APP_URL,
  GEMINI_HOME_URL,
  LAYOUT,
  ZOOM,
} = require('./constants');
const { logger, sanitizeUrlForLogs } = require('./logger');
const {
  AuthFlowTracker,
  buildAccountChooserUrl,
  buildAddAccountUrl,
  isAllowedExternalUrl,
  isAllowedGeminiUrl,
  isAllowedGoogleAuthUrl,
  isBundleUrl,
} = require('./urlPolicy');
const { computeRelativeBounds, resolveInitialWindowBounds } = require('./windowBounds');
const { TopBarController } = require('./views/topBar');
const { BackBarController } = require('./views/backBar');
const { FindBarController } = require('./views/findBar');
const { PermissionDialogController } = require('./views/permissionDialog');
const { DisplayCaptureDialogController } = require('./views/displayCaptureDialog');
const { SettingsModalController } = require('./views/settingsModal');
const { UpdateBannerController } = require('./views/updateBanner');
const { attachViewOnTop, openSafeExternal } = require('./views/viewHelper');

class WindowManager {
  constructor({
    iconPath,
    preloadDir,
    settingsStore,
    isDev,
    startVisible,
    startNewChat = false,
    onVisibilityChange,
    onCheckUpdates,
    getMeta,
    onQuit,
    onRestart,
  }) {
    this.iconPath = iconPath;
    this.preloadDir = preloadDir;
    this.settingsStore = settingsStore;
    this.isDev = Boolean(isDev);
    this.startVisible = Boolean(startVisible);
    this.startNewChat = Boolean(startNewChat);
    this.onVisibilityChange = onVisibilityChange;
    this.onCheckUpdates = onCheckUpdates;
    this.getMeta = getMeta;
    this.onQuit = onQuit;
    this.onRestart = onRestart;

    this.win = null;
    this.contentView = null;
    this.topBar = null;
    this.backBar = null;
    this.findBar = null;
    this.permissionDialog = null;
    this.displayCaptureDialog = null;
    this.settingsModal = null;
    this.updateBanner = null;

    this.authTracker = new AuthFlowTracker();
    this.isQuitting = false;
    this.isOffline = false;
    this.lastAttemptedUrl = this.startNewChat
      ? GEMINI_APP_URL
      : this.getInitialGeminiUrl();
    this.boundsSaveTimer = null;
    this.recheckDisplayHandler = null;
  }

  getInitialGeminiUrl() {
    const saved = this.settingsStore.get('lastAccountUrl');
    return isAllowedGeminiUrl(saved) ? saved : GEMINI_APP_URL;
  }

  create() {
    if (this.win && !this.win.isDestroyed()) return this.win;

    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const initialBounds = resolveInitialWindowBounds(
      this.settingsStore.get('windowBounds'),
      displays,
      primaryDisplay,
    );

    const frameStyle = this.settingsStore.get('frameStyle') || 'custom';
    this.activeFrameStyle = frameStyle;

    this.win = new BaseWindow({
      x: initialBounds.x,
      y: initialBounds.y,
      width: initialBounds.width,
      height: initialBounds.height,
      minWidth: LAYOUT.MIN_WINDOW_WIDTH,
      minHeight: LAYOUT.MIN_WINDOW_HEIGHT,
      frame: frameStyle === 'native',
      autoHideMenuBar: true,
      title: 'Gemini',
      icon: this.iconPath,
      show: this.startVisible,
    });

    this.contentView = new WebContentsView({
      webPreferences: {
        preload: path.join(this.preloadDir, 'geminiPreload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    this.contentView.setBackgroundColor('#ffffff');
    this.win.contentView.addChildView(this.contentView);

    this.initOverlays();
    this.wireWindowEvents();
    this.wireContentWebContents();
    this.layoutViews();
    this.loadInitialContent();

    return this.win;
  }

  initOverlays() {
    const sharedActions = {
      newChat: () => this.openNewChat(),
      openFind: () => {
        this.findBar?.open();
        this.syncZOrder();
      },
      reload: (force) => this.reloadContent(force),
      zoomIn: () => this.adjustZoom(ZOOM.STEP),
      zoomOut: () => this.adjustZoom(-ZOOM.STEP),
      zoomReset: () => this.setZoomLevel(0),
      switchAccount: () => this.switchAccount(),
      addAccount: () => this.addAccount(),
      signOut: () => this.signOut(),
      openSettings: (tab) => {
        this.settingsModal?.open(tab);
        this.syncZOrder();
      },
      checkUpdates: () => this.onCheckUpdates({ interactive: true }),
      toggleDevTools: () => this.toggleDevTools(),
      hideToTray: () => this.hide(),
      quit: () => this.onQuit(),
      getLogs: () => logger.exportDiagnostics(this.getMeta()),
      restartApp: () => this.onRestart(),
    };

    const getTopInset = () => this.topBar?.getHeight() || 0;

    this.topBar = new TopBarController({
      win: this.win,
      preloadDir: this.preloadDir,
      actions: sharedActions,
      getState: () => ({
        isOffline: this.isOffline,
        frameStyle: this.activeFrameStyle || 'custom',
        isDev: this.isDev,
      }),
    });

    this.backBar = new BackBarController({
      win: this.win,
      contentView: this.contentView,
      preloadDir: this.preloadDir,
      getTopInset,
      onHeightChanged: () => {
        this.layoutViews();
        this.syncZOrder();
      },
    });

    this.findBar = new FindBarController({
      win: this.win,
      contentView: this.contentView,
      preloadDir: this.preloadDir,
      getTopInset: () => getTopInset() + (this.backBar?.getHeight() || 0),
    });

    this.permissionDialog = new PermissionDialogController({
      win: this.win,
      contentView: this.contentView,
      preloadDir: this.preloadDir,
      getTopInset: () => getTopInset() + (this.backBar?.getHeight() || 0),
      onOpenSettings: (tab) => {
        this.settingsModal?.open(tab);
        this.syncZOrder();
      },
    });

    this.displayCaptureDialog = new DisplayCaptureDialogController({
      win: this.win,
      contentView: this.contentView,
      preloadDir: this.preloadDir,
    });

    this.updateBanner = new UpdateBannerController({
      win: this.win,
      preloadDir: this.preloadDir,
      settingsStore: this.settingsStore,
    });

    this.settingsModal = new SettingsModalController({
      win: this.win,
      contentView: this.contentView,
      preloadDir: this.preloadDir,
      settingsStore: this.settingsStore,
      actions: sharedActions,
      getMeta: this.getMeta,
    });

    this.syncZOrder();
  }

  /**
   * Maintains deterministic stacking order so higher-priority dialogs never drop behind lower bars.
   */
  syncZOrder() {
    if (!this.win || this.win.isDestroyed()) return;
    const ordered = [
      this.contentView,
      this.backBar?.getView(),
      this.topBar?.getView(),
      this.findBar?.getView(),
      this.updateBanner?.getView(),
      this.permissionDialog?.getView(),
      this.displayCaptureDialog?.getView(),
      this.settingsModal?.getView(),
    ];
    for (const view of ordered) {
      if (view && !view.webContents?.isDestroyed()) {
        attachViewOnTop(this.win, view);
      }
    }
  }

  layoutViews() {
    if (!this.win || this.win.isDestroyed() || !this.contentView) return;
    const { width, height } = this.win.getContentBounds();
    const topHeight = this.topBar?.getHeight() || 0;
    const backHeight = this.backBar?.getHeight() || 0;
    const contentY = topHeight + backHeight;

    this.contentView.setBounds({
      x: 0,
      y: contentY,
      width: Math.max(0, width),
      height: Math.max(0, height - contentY),
    });

    this.topBar?.updateBounds();
    this.backBar?.updateBounds();
    this.findBar?.updateBounds();
    this.updateBanner?.updateBounds();
    this.permissionDialog?.updateBounds();
    this.displayCaptureDialog?.updateBounds();
    this.settingsModal?.updateBounds();
  }

  wireWindowEvents() {
    this.win.on('resize', () => {
      this.layoutViews();
      this.scheduleSaveBounds();
    });
    this.win.on('move', () => {
      this.scheduleSaveBounds();
    });
    this.win.on('show', () => this.onVisibilityChange?.(true));
    this.win.on('hide', () => this.onVisibilityChange?.(false));
    this.win.on('maximize', () => this.layoutViews());
    this.win.on('unmaximize', () => this.layoutViews());
    this.win.on('enter-full-screen', () => this.layoutViews());
    this.win.on('leave-full-screen', () => this.layoutViews());

    this.recheckDisplayHandler = () => {
      if (!this.win || this.win.isDestroyed()) return;
      if (this.win.isMaximized() || this.win.isFullScreen()) return;
      const bounds = this.win.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const rel = computeRelativeBounds(bounds, display.workArea, display.id);
      if (rel) {
        const clamped = resolveInitialWindowBounds(rel, screen.getAllDisplays(), display);
        this.win.setBounds(clamped);
      }
    };
    screen.on('display-metrics-changed', this.recheckDisplayHandler);
    screen.on('display-removed', this.recheckDisplayHandler);

    this.win.on('close', (event) => {
      this.saveBoundsNow();
      if (!this.isQuitting && this.settingsStore.get('closeToTray')) {
        event.preventDefault();
        this.hide();
      }
    });

    this.win.on('closed', () => {
      this.cleanup();
    });
  }

  wireContentWebContents() {
    const wc = this.contentView.webContents;
    wc.setVisualZoomLevelLimits(1, 3).catch(() => {});

    wc.on('did-finish-load', () => {
      const currentUrl = wc.getURL();
      if (isAllowedGeminiUrl(currentUrl)) {
        this.isOffline = false;
        this.topBar?.syncState();
        this.lastAttemptedUrl = currentUrl;
        this.settingsStore.set('lastAccountUrl', currentUrl, { silent: true });
      }
      this.applySavedZoom();
    });

    wc.on(
      'did-fail-load',
      (_event, errorCode, errorDesc, validatedUrl, isMainFrame) => {
        if (!isMainFrame || errorCode === -3) return;
        if (isBundleUrl(validatedUrl)) return;
        logger.warn('navigation', `Main load failed (${errorCode} ${errorDesc}): ${sanitizeUrlForLogs(validatedUrl)}`);
        if (validatedUrl && isAllowedGeminiUrl(validatedUrl)) {
          this.lastAttemptedUrl = validatedUrl;
        }
        this.showOfflinePage();
      },
    );

    wc.on('will-navigate', (event, targetUrl) => {
      if (isBundleUrl(targetUrl)) return;
      if (this.authTracker.shouldAllowInAppNavigation(targetUrl)) {
        this.authTracker.onNavigate(targetUrl);
        return;
      }
      event.preventDefault();
      logger.info('navigation', `Opening external URL in default browser: ${sanitizeUrlForLogs(targetUrl)}`);
      openSafeExternal(targetUrl);
    });

    wc.on('did-navigate', (_event, url) => {
      this.authTracker.onNavigate(url);
      if (isAllowedGeminiUrl(url)) {
        this.isOffline = false;
        this.topBar?.syncState();
      }
    });

    wc.on('did-redirect-navigation', (_event, url, _isInPlace, isMainFrame) => {
      if (isMainFrame) this.authTracker.onNavigate(url);
    });

    wc.setWindowOpenHandler(({ url }) => {
      if (url === 'about:blank' || this.authTracker.shouldAllowInAppNavigation(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 540,
            height: 700,
            autoHideMenuBar: true,
            title:
              isAllowedGoogleAuthUrl(url) || url === 'about:blank'
                ? 'Sign in - Google Accounts'
                : 'Sign in',
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      }
      if (isAllowedExternalUrl(url)) {
        openSafeExternal(url);
      }
      return { action: 'deny' };
    });

    wc.on('did-create-window', (childWin) => {
      this.wireAuthChildWindow(childWin);
    });

    wc.on('zoom-changed', (_event, zoomDirection) => {
      const step = zoomDirection === 'in' ? ZOOM.STEP : -ZOOM.STEP;
      this.adjustZoom(step);
    });

    wc.on('before-input-event', (event, input) => {
      this.handleShortcutInput(event, input);
    });

    wc.on('context-menu', (_event, params) => {
      this.showContextMenu(params);
    });
  }

  wireAuthChildWindow(childWin) {
    if (!childWin || childWin.isDestroyed()) return;
    const cwc = childWin.webContents;
    const childAuth = new AuthFlowTracker();
    childAuth.arm();

    cwc.setWindowOpenHandler(({ url }) => {
      if (
        childAuth.shouldAllowInAppNavigation(url) ||
        url === 'about:blank'
      ) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 540,
            height: 700,
            autoHideMenuBar: true,
            webPreferences: {
              nodeIntegration: false,
              contextIsolation: true,
              sandbox: true,
            },
          },
        };
      }
      openSafeExternal(url);
      return { action: 'deny' };
    });

    cwc.on('did-create-window', (grandChildWin) => {
      this.wireAuthChildWindow(grandChildWin);
    });

    cwc.on('will-navigate', (event, targetUrl) => {
      if (childAuth.shouldAllowInAppNavigation(targetUrl)) return;
      event.preventDefault();
      openSafeExternal(targetUrl);
    });

    const maybeCompleteToGemini = (navUrl) => {
      if (!isAllowedGeminiUrl(navUrl)) return;
      childAuth.disarm();
      if (!childWin.isDestroyed()) childWin.close();
      if (this.contentView && !this.contentView.webContents.isDestroyed()) {
        this.contentView.webContents.loadURL(navUrl).catch(() => {});
        this.show();
      }
    };

    cwc.on('will-redirect', (_e, url, _inPlace, isMainFrame) => {
      if (isMainFrame) maybeCompleteToGemini(url);
    });
    cwc.on('did-navigate', (_e, url) => maybeCompleteToGemini(url));

    childWin.on('closed', () => childAuth.dispose());
  }

  handleShortcutInput(event, input) {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    const ctrl = input.control && !input.alt && !input.meta;

    if (!input.control && !input.alt && !input.meta) {
      if (key === 'f5') {
        event.preventDefault();
        this.reloadContent(input.shift);
        return;
      }
      if (key === 'f11' && !input.shift) {
        event.preventDefault();
        if (this.win && !this.win.isDestroyed()) {
          this.win.setFullScreen(!this.win.isFullScreen());
        }
        return;
      }
      if (key === 'f3') {
        event.preventDefault();
        if (input.shift) this.findBar?.prev();
        else this.findBar?.next();
        return;
      }
      if (key === 'f12' && this.isDev) {
        event.preventDefault();
        this.toggleDevTools();
        return;
      }
    }

    if (!ctrl) return;

    if (key === 'r') {
      event.preventDefault();
      this.reloadContent(input.shift);
    } else if (key === 'f' && !input.shift) {
      event.preventDefault();
      this.findBar?.open();
      this.syncZOrder();
    } else if (key === 'g') {
      event.preventDefault();
      if (input.shift) this.findBar?.prev();
      else this.findBar?.next();
    } else if (key === 'n' && !input.shift) {
      event.preventDefault();
      this.openNewChat();
    } else if (key === ',' && !input.shift) {
      event.preventDefault();
      this.settingsModal?.open('general');
      this.syncZOrder();
    } else if (key === 'm' && !input.shift) {
      event.preventDefault();
      this.win?.minimize();
    } else if (key === 'w' && !input.shift) {
      event.preventDefault();
      this.win?.close();
    } else if (key === 'q' && !input.shift) {
      event.preventDefault();
      this.onQuit();
    } else if (key === 'p') {
      event.preventDefault();
      this.contentView?.webContents.print();
    } else if (key === '=' || key === '+' || key === 'add') {
      event.preventDefault();
      this.adjustZoom(ZOOM.STEP);
    } else if (key === '-' || key === '_' || key === 'subtract') {
      event.preventDefault();
      this.adjustZoom(-ZOOM.STEP);
    } else if ((key === '0' || key === 'num0') && !input.shift) {
      event.preventDefault();
      this.setZoomLevel(0);
    }
  }

  showContextMenu(params) {
    const wc = this.contentView?.webContents;
    if (!wc || wc.isDestroyed()) return;
    const template = [];

    const currentUrl = wc.getURL();
    if (!isAllowedGeminiUrl(currentUrl) && wc.navigationHistory?.canGoBack()) {
      template.push(
        { label: 'Back to Gemini', click: () => wc.loadURL(GEMINI_APP_URL) },
        { type: 'separator' },
      );
    }

    if (params.isEditable) {
      template.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle', label: 'Paste as plain text' },
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      );
    } else if (params.mediaType === 'image' && params.srcURL) {
      template.push(
        { label: 'Copy Image', click: () => wc.copyImageAt(params.x, params.y) },
        { label: 'Save Image As...', click: () => wc.downloadURL(params.srcURL) },
        { label: 'Copy Image Address', click: () => clipboard.writeText(params.srcURL) },
      );
    } else if (params.linkURL) {
      template.push(
        { label: 'Open Link in Browser', click: () => openSafeExternal(params.linkURL) },
        { label: 'Copy Link Address', click: () => clipboard.writeText(params.linkURL) },
      );
    } else if (params.selectionText && params.selectionText.trim()) {
      template.push({ role: 'copy' });
    } else {
      template.push(
        { label: 'New Chat', click: () => this.openNewChat() },
        { label: 'Reload Gemini', click: () => this.reloadContent(false) },
        { label: 'Print...', accelerator: 'CmdOrCtrl+P', click: () => wc.print() },
        { type: 'separator' },
        { role: 'selectAll' },
      );
    }

    template.push(
      { type: 'separator' },
      { label: 'Switch Account...', click: () => this.switchAccount() },
      { label: 'Settings...', accelerator: 'CmdOrCtrl+,', click: () => {
        this.settingsModal?.open('general');
        this.syncZOrder();
      } },
    );

    if (this.isDev) {
      template.push(
        { type: 'separator' },
        { label: 'Inspect Element', click: () => wc.inspectElement(params.x, params.y) },
      );
    }

    Menu.buildFromTemplate(template).popup({ window: this.win });
  }

  loadInitialContent() {
    const wc = this.contentView?.webContents;
    if (!wc || wc.isDestroyed()) return;
    wc.once('did-finish-load', () => {
      if (!wc.isDestroyed() && wc.getURL() === `${BUNDLE_ORIGIN}/loading.html`) {
        wc.loadURL(this.lastAttemptedUrl).catch(() => {});
      }
    });
    wc.loadURL(`${BUNDLE_ORIGIN}/loading.html`).catch(() => {});
  }

  showOfflinePage() {
    this.isOffline = true;
    this.topBar?.syncState();
    const wc = this.contentView?.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.loadURL(`${BUNDLE_ORIGIN}/offline.html`).catch(() => {});
    }
  }

  retryFromOffline() {
    this.isOffline = false;
    this.topBar?.syncState();
    const target = isAllowedGeminiUrl(this.lastAttemptedUrl)
      ? this.lastAttemptedUrl
      : GEMINI_APP_URL;
    const wc = this.contentView?.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.loadURL(target).catch(() => {});
    }
  }

  reloadContent(force = false) {
    const wc = this.contentView?.webContents;
    if (!wc || wc.isDestroyed()) return;
    if (this.isOffline || isBundleUrl(wc.getURL())) {
      this.retryFromOffline();
      return;
    }
    if (force) wc.reloadIgnoringCache();
    else wc.reload();
  }

  openNewChat() {
    this.show();
    const wc = this.contentView?.webContents;
    if (wc && !wc.isDestroyed()) {
      this.isOffline = false;
      this.topBar?.syncState();
      wc.loadURL(GEMINI_APP_URL).catch(() => {});
    }
  }

  switchAccount() {
    const wc = this.contentView?.webContents;
    if (!wc || wc.isDestroyed()) return;
    this.show();
    const target = buildAccountChooserUrl(wc.getURL());
    wc.loadURL(target).catch(() => {});
  }

  addAccount() {
    const wc = this.contentView?.webContents;
    if (!wc || wc.isDestroyed()) return;
    this.show();
    const target = buildAddAccountUrl(wc.getURL());
    wc.loadURL(target).catch(() => {});
  }

  async signOut() {
    try {
      await session.defaultSession.clearStorageData({ storages: ['cookies'] });
    } catch (err) {
      logger.warn('auth', 'Failed to clear cookies during sign-out', err);
    }
    this.settingsStore.set('lastAccountUrl', null, { silent: true });
    this.lastAttemptedUrl = GEMINI_HOME_URL;
    const wc = this.contentView?.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.loadURL(GEMINI_HOME_URL).catch(() => {});
    }
  }

  applySavedZoom() {
    const wc = this.contentView?.webContents;
    if (!wc || wc.isDestroyed()) return;
    const zoomLevel = this.settingsStore.get('zoomLevel') || 0;
    wc.setZoomLevel(zoomLevel);
  }

  adjustZoom(delta) {
    const current = this.settingsStore.get('zoomLevel') || 0;
    this.setZoomLevel(current + delta);
  }

  setZoomLevel(level) {
    const saved = this.settingsStore.set('zoomLevel', level);
    const wc = this.contentView?.webContents;
    if (wc && !wc.isDestroyed()) {
      wc.setZoomLevel(saved);
    }
  }

  toggleDevTools() {
    const wc = this.contentView?.webContents;
    if (!wc || wc.isDestroyed()) return;
    if (wc.isDevToolsOpened()) wc.closeDevTools();
    else wc.openDevTools({ mode: 'detach' });
  }

  show() {
    if (!this.win || this.win.isDestroyed()) {
      this.create();
    }
    if (this.win.isMinimized()) this.win.restore();
    if (this.isOffline) this.retryFromOffline();
    this.win.show();
    this.win.focus();
    this.contentView?.webContents?.focus();
    this.onVisibilityChange?.(true);
  }

  hide() {
    if (!this.win || this.win.isDestroyed()) return;
    this.saveBoundsNow();
    this.win.hide();
    this.onVisibilityChange?.(false);
  }

  toggle() {
    if (!this.win || this.win.isDestroyed()) {
      this.show();
      return;
    }
    if (this.win.isVisible() && !this.win.isMinimized()) {
      if (this.win.isFocused()) {
        this.hide();
      } else {
        this.show();
      }
    } else {
      this.show();
    }
  }

  isVisible() {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isVisible());
  }

  isFocused() {
    return Boolean(this.win && !this.win.isDestroyed() && this.win.isFocused());
  }

  openSettings(tab = 'general') {
    this.show();
    this.settingsModal?.open(tab);
    this.syncZOrder();
  }

  notifyUpdateResult(result, showBanner = false) {
    this.settingsModal?.notifyUpdateResult(result);
    if (showBanner && result?.status === 'available') {
      this.updateBanner?.show(result);
      this.syncZOrder();
    }
  }

  setQuitting() {
    this.isQuitting = true;
    this.saveBoundsNow();
  }

  scheduleSaveBounds() {
    clearTimeout(this.boundsSaveTimer);
    this.boundsSaveTimer = setTimeout(() => this.saveBoundsNow(), 350);
  }

  saveBoundsNow() {
    clearTimeout(this.boundsSaveTimer);
    this.boundsSaveTimer = null;
    if (!this.win || this.win.isDestroyed()) return;
    if (this.win.isMinimized() || this.win.isMaximized() || this.win.isFullScreen()) return;
    try {
      const bounds = this.win.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const rel = computeRelativeBounds(bounds, display.workArea, display.id);
      if (rel) {
        this.settingsStore.set('windowBounds', rel, { silent: true });
      }
    } catch {
      // Ignore during shutdown
    }
  }

  cleanup() {
    clearTimeout(this.boundsSaveTimer);
    this.boundsSaveTimer = null;
    if (this.recheckDisplayHandler) {
      screen.removeListener('display-metrics-changed', this.recheckDisplayHandler);
      screen.removeListener('display-removed', this.recheckDisplayHandler);
      this.recheckDisplayHandler = null;
    }
    this.authTracker.dispose();
    this.topBar?.dispose();
    this.backBar?.dispose();
    this.findBar?.dispose();
    this.permissionDialog?.dispose();
    this.displayCaptureDialog?.dispose();
    this.settingsModal?.dispose();
    this.updateBanner?.dispose();
    this.win = null;
    this.contentView = null;
  }
}

module.exports = { WindowManager };
