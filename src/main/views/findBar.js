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

class FindBarController {
  constructor({ win, contentView, preloadDir, getTopInset }) {
    this.win = win;
    this.contentView = contentView;
    this.preloadDir = preloadDir;
    this.getTopInset = getTopInset;
    this.lifecycle = new ViewLifecycle();
    this.view = null;
    this.loaded = false;
    this.visible = false;
    this.lastQuery = '';
    this.lastOrdinal = 0;
    this.isStepping = false;
    this.retried = false;
    this.stepForward = true;
    this.stepQueue = [];
    this.setup();
  }

  setup() {
    const wc = this.contentView.webContents;

    this.lifecycle.onWebContents(wc, 'found-in-page', (_event, res) => {
      if (!res.finalUpdate) {
        this.sendResult(res.activeMatchOrdinal, res.matches);
        return;
      }
      if (this.isStepping && !this.retried && res.activeMatchOrdinal === this.lastOrdinal) {
        this.retried = true;
        if (this.lastQuery && !wc.isDestroyed()) {
          wc.findInPage(this.lastQuery, { forward: this.stepForward });
        }
        return;
      }
      this.retried = false;
      this.lastOrdinal = res.activeMatchOrdinal;
      this.sendResult(res.activeMatchOrdinal, res.matches);

      if (this.isStepping) {
        const nextDir = this.stepQueue.shift();
        if (nextDir !== undefined) {
          this.executeStep(nextDir);
        } else {
          this.isStepping = false;
        }
      }
    });

    const guard = (event) => isBundleIpcSender(event, this.view);

    this.lifecycle.onIpc(IPC.FINDBAR_SEARCH, (event, query) => {
      if (!guard(event) || wc.isDestroyed()) return;
      this.lastQuery = typeof query === 'string' ? query : '';
      this.lastOrdinal = 0;
      this.isStepping = false;
      this.retried = false;
      this.stepQueue.length = 0;
      if (this.lastQuery) {
        wc.findInPage(this.lastQuery, { findNext: true });
      } else {
        wc.stopFindInPage('clearSelection');
      }
    });

    this.lifecycle.onIpc(IPC.FINDBAR_NEXT, (event) => {
      if (!guard(event) || !this.lastQuery) return;
      this.queueStep(true);
    });

    this.lifecycle.onIpc(IPC.FINDBAR_PREV, (event) => {
      if (!guard(event) || !this.lastQuery) return;
      this.queueStep(false);
    });

    this.lifecycle.onIpc(IPC.FINDBAR_CLEAR, (event) => {
      if (!guard(event)) return;
      this.lastQuery = '';
      if (!wc.isDestroyed()) wc.stopFindInPage('clearSelection');
    });

    this.lifecycle.onIpc(IPC.FINDBAR_CLOSE, (event) => {
      if (!guard(event)) return;
      this.close();
    });

    this.lifecycle.onWindow(this.win, ['resize', 'enter-full-screen', 'leave-full-screen'], () => {
      this.updateBounds();
    });
  }

  ensureView() {
    if (this.view && !this.view.webContents.isDestroyed()) return;
    this.loaded = false;
    this.view = createOverlayView({
      preloadPath: path.join(this.preloadDir, 'findBarPreload.js'),
      htmlUrl: `${BUNDLE_ORIGIN}/find_bar/find_bar.html`,
    });
    attachViewOnTop(this.win, this.view);

    this.view.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      const key = String(input.key || '').toLowerCase();
      if (!input.control && !input.alt && !input.meta && input.key === 'F3') {
        event.preventDefault();
        if (this.lastQuery) this.queueStep(!input.shift);
        return;
      }
      if (input.control && !input.alt && !input.meta) {
        if (key === 'g') {
          event.preventDefault();
          if (this.lastQuery) this.queueStep(!input.shift);
        } else if (!input.shift && key === 'f') {
          event.preventDefault();
          this.open();
        }
      }
    });

    this.view.webContents.once('did-finish-load', () => {
      this.loaded = true;
      if (this.visible && this.view && !this.view.webContents.isDestroyed()) {
        this.view.webContents.focus();
        this.view.webContents.send(IPC.FINDBAR_FOCUS);
      }
    });
  }

  open() {
    if (this.win.isDestroyed()) return;
    this.ensureView();
    attachViewOnTop(this.win, this.view);
    this.visible = true;
    this.view.setVisible(true);
    this.updateBounds();
    if (this.loaded) {
      this.view.webContents.focus();
      this.view.webContents.send(IPC.FINDBAR_FOCUS);
    }
  }

  close() {
    if (!this.visible) return;
    this.visible = false;
    this.lastQuery = '';
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.setVisible(false);
    }
    if (!this.contentView.webContents.isDestroyed()) {
      this.contentView.webContents.stopFindInPage('clearSelection');
    }
    restoreContentFocus(this.win, this.contentView);
  }

  next() {
    if (this.visible && this.lastQuery) this.queueStep(true);
  }

  prev() {
    if (this.visible && this.lastQuery) this.queueStep(false);
  }

  queueStep(forward) {
    if (this.isStepping) {
      this.stepQueue.push(forward);
    } else {
      this.executeStep(forward);
    }
  }

  executeStep(forward) {
    const wc = this.contentView.webContents;
    if (wc.isDestroyed() || !this.lastQuery) return;
    this.isStepping = true;
    this.stepForward = forward;
    wc.findInPage(this.lastQuery, { forward });
  }

  sendResult(activeMatchOrdinal, matches) {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.send(IPC.FINDBAR_RESULT, {
        activeMatchOrdinal,
        matches,
      });
    }
  }

  updateBounds() {
    if (!this.visible || !this.view || this.view.webContents.isDestroyed() || this.win.isDestroyed()) {
      return;
    }
    const { width } = this.win.getContentBounds();
    const x = Math.max(0, width - LAYOUT.FIND_BAR_WIDTH - LAYOUT.FIND_BAR_MARGIN_RIGHT);
    this.view.setBounds({
      x,
      y: this.getTopInset(),
      width: Math.min(LAYOUT.FIND_BAR_WIDTH, width),
      height: LAYOUT.FIND_BAR_HEIGHT,
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

module.exports = { FindBarController };
