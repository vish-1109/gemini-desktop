'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  PERMISSION_STATES,
  VALID_PERMISSIONS,
  ZOOM,
} = require('./constants');

const DEFAULT_PERMISSIONS = Object.freeze({
  media: 'ask',
  camera: 'ask',
  geolocation: 'ask',
  notifications: 'ask',
  clipboard: 'ask',
});

const DEFAULT_SETTINGS = Object.freeze({
  openAtLogin: false,
  closeToTray: true,
  startInTray: false,
  notifyOnTurnComplete: true,
  autoCheckUpdates: true,
  dismissedUpdateVersion: '',
  frameStyle: 'custom',
  zoomLevel: 0,
  permissions: DEFAULT_PERMISSIONS,
  localDeviceId: '',
  windowBounds: null,
  lastAccountUrl: null,
});

function clampZoomLevel(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  const clamped = Math.min(ZOOM.MAX_LEVEL, Math.max(ZOOM.MIN_LEVEL, value));
  return Math.round(clamped * 100) / 100;
}

function isAllowedGeminiBookmarkUrl(raw) {
  if (typeof raw !== 'string' || !raw) return false;
  try {
    const parsed = new URL(raw);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'gemini.google.com'
    );
  } catch {
    return false;
  }
}

function sanitizeWindowBounds(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { width, height, relativeX, relativeY, displayId } = raw;
  if (
    typeof width !== 'number' ||
    !Number.isFinite(width) ||
    typeof height !== 'number' ||
    !Number.isFinite(height) ||
    typeof relativeX !== 'number' ||
    !Number.isFinite(relativeX) ||
    typeof relativeY !== 'number' ||
    !Number.isFinite(relativeY)
  ) {
    return null;
  }
  return {
    width: Math.round(width),
    height: Math.round(height),
    relativeX,
    relativeY,
    displayId: displayId ?? null,
  };
}

function sanitizePermissions(raw) {
  const result = { ...DEFAULT_PERMISSIONS };
  if (!raw || typeof raw !== 'object') return result;
  for (const key of VALID_PERMISSIONS) {
    if (PERMISSION_STATES.includes(raw[key])) {
      result[key] = raw[key];
    }
  }
  return result;
}

function normalizeSettings(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  return {
    openAtLogin:
      typeof input.openAtLogin === 'boolean'
        ? input.openAtLogin
        : DEFAULT_SETTINGS.openAtLogin,
    closeToTray:
      typeof input.closeToTray === 'boolean'
        ? input.closeToTray
        : DEFAULT_SETTINGS.closeToTray,
    startInTray:
      typeof input.startInTray === 'boolean'
        ? input.startInTray
        : DEFAULT_SETTINGS.startInTray,
    notifyOnTurnComplete:
      typeof input.notifyOnTurnComplete === 'boolean'
        ? input.notifyOnTurnComplete
        : DEFAULT_SETTINGS.notifyOnTurnComplete,
    autoCheckUpdates:
      typeof input.autoCheckUpdates === 'boolean'
        ? input.autoCheckUpdates
        : DEFAULT_SETTINGS.autoCheckUpdates,
    dismissedUpdateVersion:
      typeof input.dismissedUpdateVersion === 'string'
        ? input.dismissedUpdateVersion.slice(0, 32)
        : '',
    frameStyle:
      input.frameStyle === 'native' || input.frameStyle === 'custom'
        ? input.frameStyle
        : DEFAULT_SETTINGS.frameStyle,
    zoomLevel: clampZoomLevel(input.zoomLevel),
    permissions: sanitizePermissions(input.permissions),
    localDeviceId:
      typeof input.localDeviceId === 'string' && input.localDeviceId.length <= 64
        ? input.localDeviceId
        : '',
    windowBounds: sanitizeWindowBounds(input.windowBounds),
    lastAccountUrl: isAllowedGeminiBookmarkUrl(input.lastAccountUrl)
      ? input.lastAccountUrl
      : null,
  };
}

/**
 * Persisted settings store using atomic temp-file writes and strict schema normalization.
 */
class SettingsStore {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.logger = options.logger || null;
    this.listeners = new Set();
    this.state = null;
  }

  load() {
    if (this.state !== null) return this.state;
    try {
      const content = fs.readFileSync(this.filePath, 'utf8');
      this.state = normalizeSettings(JSON.parse(content));
    } catch {
      this.state = normalizeSettings({});
    }
    return this.state;
  }

  getAll() {
    const current = this.load();
    return {
      ...current,
      permissions: { ...current.permissions },
      windowBounds: current.windowBounds ? { ...current.windowBounds } : null,
    };
  }

  get(key) {
    const current = this.load();
    return current[key];
  }

  set(key, value, options = {}) {
    const current = this.load();
    const candidate = normalizeSettings({ ...current, [key]: value });
    this.state = candidate;
    this.#writeAtomic(candidate);
    if (!options.silent) {
      this.#notify(key, candidate[key], candidate);
    }
    return candidate[key];
  }

  update(patch) {
    if (!patch || typeof patch !== 'object') return this.getAll();
    const current = this.load();
    const merged = {
      ...current,
      ...patch,
      permissions: patch.permissions
        ? { ...current.permissions, ...patch.permissions }
        : current.permissions,
    };
    const next = normalizeSettings(merged);
    this.state = next;
    this.#writeAtomic(next);
    for (const key of Object.keys(patch)) {
      this.#notify(key, next[key], next);
    }
    return this.getAll();
  }

  setPermission(capability, decision) {
    if (
      !VALID_PERMISSIONS.includes(capability) ||
      !PERMISSION_STATES.includes(decision)
    ) {
      return this.get('permissions');
    }
    const current = this.load();
    const permissions = { ...current.permissions, [capability]: decision };
    return this.set('permissions', permissions);
  }

  resetPermissions() {
    return this.set('permissions', { ...DEFAULT_PERMISSIONS });
  }

  getOrCreateLocalDeviceId() {
    const existing = this.get('localDeviceId');
    if (existing) return existing;
    const id = crypto.randomUUID();
    this.set('localDeviceId', id, { silent: true });
    return id;
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  #notify(key, value, all) {
    for (const listener of this.listeners) {
      try {
        listener(key, value, all);
      } catch (err) {
        this.logger?.warn('settings', 'Settings subscriber failed', err);
      }
    }
  }

  #writeAtomic(data) {
    if (!this.filePath) return;
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.filePath}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      this.logger?.warn('settings', 'Failed to persist settings.json', err);
    }
  }
}

module.exports = {
  DEFAULT_PERMISSIONS,
  DEFAULT_SETTINGS,
  SettingsStore,
  clampZoomLevel,
  normalizeSettings,
};
