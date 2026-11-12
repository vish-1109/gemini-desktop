'use strict';

const GEMINI_HOME_URL = 'https://gemini.google.com';
const GEMINI_APP_URL = 'https://gemini.google.com/app';
const GITHUB_REPO_URL = 'https://github.com/vish-1109/gemini-desktop';
const GITHUB_RELEASES_API_URL =
  'https://api.github.com/repos/vish-1109/gemini-desktop/releases/latest';
const GITHUB_RELEASES_PAGE_URL = `${GITHUB_REPO_URL}/releases`;

const BUNDLE_SCHEME = 'app';
const BUNDLE_HOST = 'bundle';
const BUNDLE_ORIGIN = `${BUNDLE_SCHEME}://${BUNDLE_HOST}`;

const GEMINI_HOSTS = Object.freeze(['gemini.google.com', 'bard.google.com']);

const GOOGLE_AUTH_HOSTS = Object.freeze([
  'accounts.google.com',
  'accounts.youtube.com',
  'consent.google.com',
  'gds.google.com',
  'myaccount.google.com',
].map((h) => h.toLowerCase()));

const GOOGLE_OAUTH_FLOW_HOSTS = Object.freeze([
  'accounts.google.com',
  'accounts.youtube.com',
  'consent.google.com',
  'gds.google.com',
]);

const LOG_REDACT_DOMAINS = Object.freeze([
  'google.com',
  'googleapis.com',
  'googleusercontent.com',
  'gstatic.com',
  'youtube.com',
  'github.com',
]);

const LAYOUT = Object.freeze({
  TOP_BAR_HEIGHT: 36,
  BACK_BAR_HEIGHT: 44,
  FIND_BAR_WIDTH: 384,
  FIND_BAR_HEIGHT: 68,
  FIND_BAR_MARGIN_RIGHT: 24,
  UPDATE_BANNER_WIDTH: 460,
  UPDATE_BANNER_HEIGHT: 80,
  UPDATE_BANNER_MARGIN: 16,
  PERMISSION_DIALOG_WIDTH: 520,
  PERMISSION_DIALOG_HEIGHT: 330,
  PERMISSION_DIALOG_TOP_OFFSET: 16,
  CAPTURE_DIALOG_WIDTH: 640,
  CAPTURE_DIALOG_HEIGHT: 560,
  DEFAULT_WINDOW_WIDTH: 1200,
  DEFAULT_WINDOW_HEIGHT: 820,
  MIN_WINDOW_WIDTH: 460,
  MIN_WINDOW_HEIGHT: 480,
});

const ZOOM = Object.freeze({
  MIN_LEVEL: -3.0,
  MAX_LEVEL: 3.0,
  STEP: 0.5,
});

const DANGEROUS_CLI_SWITCHES = Object.freeze([
  'remote-debugging-port',
  'remote-debugging-pipe',
  'remote-allow-origins',
  'inspect',
  'inspect-brk',
  'inspect-port',
  'inspect-publish-uid',
  'proxy-server',
  'proxy-pac-url',
  'host-rules',
  'host-resolver-rules',
  'ignore-certificate-errors',
  'disable-web-security',
]);

const VALID_PERMISSIONS = Object.freeze([
  'media',
  'camera',
  'geolocation',
  'notifications',
  'clipboard',
]);

const PERMISSION_STATES = Object.freeze(['ask', 'granted', 'denied']);

const IPC = Object.freeze({
  // Gemini page -> main
  GEMINI_RETRY_LOAD: 'gemini:retry-load',
  GEMINI_LOG: 'gemini:log',
  GEMINI_RENDERER_ERROR: 'gemini:renderer-error',
  GEMINI_NOTIFY_TURN_LIFECYCLE: 'gemini:notify-turn-lifecycle',
  GEMINI_UPDATE_ACCOUNT_SLOT: 'gemini:update-account-switcher-slot',
  GEMINI_GET_APP_VERSION: 'gemini:get-app-version',
  GEMINI_GET_LOCAL_DEVICE_ID: 'gemini:get-local-device-id',
  GEMINI_GET_WINDOW_SOURCES: 'gemini:get-window-sources',
  GEMINI_CAPTURE_WINDOW: 'gemini:capture-window',
  GEMINI_GET_APP_LOGS: 'gemini:get-app-logs',

  // Top bar
  TOPBAR_OPEN_MENU: 'topbar:open-menu',
  TOPBAR_OPEN_ACCOUNT_MENU: 'topbar:open-account-menu',
  TOPBAR_MINIMIZE: 'topbar:minimize',
  TOPBAR_MAXIMIZE_TOGGLE: 'topbar:maximize-toggle',
  TOPBAR_CLOSE: 'topbar:close',
  TOPBAR_STATE: 'topbar:state',

  // Back bar
  BACKBAR_HOME: 'backbar:home',

  // Find bar
  FINDBAR_SEARCH: 'findbar:search',
  FINDBAR_NEXT: 'findbar:next',
  FINDBAR_PREV: 'findbar:prev',
  FINDBAR_CLOSE: 'findbar:close',
  FINDBAR_CLEAR: 'findbar:clear',
  FINDBAR_RESULT: 'findbar:result',
  FINDBAR_FOCUS: 'findbar:focus',

  // Permission dialog
  PERMISSION_REQUEST_DATA: 'permission:request-data',
  PERMISSION_GET_CURRENT: 'permission:get-current-request',
  PERMISSION_RESPOND: 'permission:respond',
  PERMISSION_OPEN_SETTINGS: 'permission:open-settings',

  // Display capture dialog
  CAPTURE_REQUEST_DATA: 'display-capture:request-data',
  CAPTURE_GET_CURRENT: 'display-capture:get-current-request',
  CAPTURE_RESPOND: 'display-capture:respond',

  // Settings modal
  SETTINGS_GET_ALL: 'settings:get-all',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_RESET_PERMISSIONS: 'settings:reset-permissions',
  SETTINGS_CHECK_UPDATES: 'settings:check-for-updates',
  SETTINGS_GET_LOGS: 'settings:get-logs',
  SETTINGS_COPY_TEXT: 'settings:copy-text',
  SETTINGS_SWITCH_ACCOUNT: 'settings:switch-account',
  SETTINGS_SIGN_OUT: 'settings:sign-out',
  SETTINGS_RESTART_APP: 'settings:restart-app',
  SETTINGS_OPEN_EXTERNAL: 'settings:open-external',
  SETTINGS_CLOSE: 'settings:close',
  SETTINGS_READY: 'settings:ready',
  SETTINGS_OPENED: 'settings:opened',
  SETTINGS_UPDATE_RESULT: 'settings:update-check-result',

  // Update banner
  UPDATE_BANNER_SHOW: 'update-banner:show',
  UPDATE_BANNER_OPEN_RELEASE: 'update-banner:open-release',
  UPDATE_BANNER_DISMISS: 'update-banner:dismiss',
});

module.exports = {
  GEMINI_HOME_URL,
  GEMINI_APP_URL,
  GITHUB_REPO_URL,
  GITHUB_RELEASES_API_URL,
  GITHUB_RELEASES_PAGE_URL,
  BUNDLE_SCHEME,
  BUNDLE_HOST,
  BUNDLE_ORIGIN,
  GEMINI_HOSTS,
  GOOGLE_AUTH_HOSTS,
  GOOGLE_OAUTH_FLOW_HOSTS,
  LOG_REDACT_DOMAINS,
  LAYOUT,
  ZOOM,
  DANGEROUS_CLI_SWITCHES,
  VALID_PERMISSIONS,
  PERMISSION_STATES,
  IPC,
};
