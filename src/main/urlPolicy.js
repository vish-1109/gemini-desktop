'use strict';

const {
  BUNDLE_ORIGIN,
  GEMINI_APP_URL,
  GEMINI_HOSTS,
  GOOGLE_AUTH_HOSTS,
  GOOGLE_OAUTH_FLOW_HOSTS,
} = require('./constants');

function parseHttpsUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return null;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function hostMatches(hostname, list) {
  const lower = hostname.toLowerCase();
  return list.some((entry) => lower === entry || lower.endsWith(`.${entry}`));
}

function isAllowedGeminiUrl(rawUrl) {
  const parsed = parseHttpsUrl(rawUrl);
  return parsed ? hostMatches(parsed.hostname, GEMINI_HOSTS) : false;
}

function isAllowedGoogleAuthUrl(rawUrl) {
  const parsed = parseHttpsUrl(rawUrl);
  if (!parsed) return false;
  return hostMatches(parsed.hostname, GOOGLE_AUTH_HOSTS);
}

function isAllowedInAppUrl(rawUrl) {
  return isAllowedGeminiUrl(rawUrl) || isAllowedGoogleAuthUrl(rawUrl);
}

function isAllowedExternalUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function isBundleUrl(rawUrl) {
  return typeof rawUrl === 'string' && rawUrl.startsWith(`${BUNDLE_ORIGIN}/`);
}

function isWorkspaceConnectorAuthUrl(rawUrl) {
  const parsed = parseHttpsUrl(rawUrl);
  if (!parsed) return false;
  if (hostMatches(parsed.hostname, GOOGLE_OAUTH_FLOW_HOSTS)) return true;
  const params = parsed.searchParams;
  const clientId = params.get('client_id');
  const redirectUri = params.get('redirect_uri');
  const responseType = params.get('response_type');
  if (!clientId || !redirectUri || !responseType) return false;
  return isAllowedInAppUrl(redirectUri);
}

function cleanUserAgent(rawUa, chromeVersion = process.versions.chrome) {
  const base =
    typeof rawUa === 'string' && rawUa.trim()
      ? rawUa
      : `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion || '140.0.0.0'} Safari/537.36`;

  const cleaned = base
    .replace(/\s+Electron\/\S+/gi, '')
    .replace(/\s+gemini-desktop\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (chromeVersion && !/\bChrome\/\d+/.test(cleaned)) {
    const major = String(chromeVersion).split('.')[0] || '140';
    return `${cleaned} Chrome/${major}.0.0.0 Safari/537.36`.trim();
  }
  return cleaned;
}

function sanitizeGoogleRequestHeaders(requestHeaders) {
  const next = { ...requestHeaders };
  for (const key of Object.keys(next)) {
    if (key.toLowerCase().startsWith('sec-ch-ua')) {
      delete next[key];
    }
  }
  return next;
}

function buildAccountChooserUrl(continueUrl) {
  const target = isAllowedGeminiUrl(continueUrl) ? continueUrl : GEMINI_APP_URL;
  return `https://accounts.google.com/AccountChooser?continue=${encodeURIComponent(target)}`;
}

function buildAddAccountUrl(continueUrl) {
  const target = isAllowedGeminiUrl(continueUrl) ? continueUrl : GEMINI_APP_URL;
  return `https://accounts.google.com/AddSession?continue=${encodeURIComponent(target)}`;
}

/**
 * Guards temporary multi-step Google OAuth / Workspace connector navigation flows.
 */
class AuthFlowTracker {
  constructor(options = {}) {
    this.idleTimeoutMs = options.idleTimeoutMs ?? 3 * 60 * 1000;
    this.maxDurationMs = options.maxDurationMs ?? 10 * 60 * 1000;
    this.active = false;
    this.deadline = 0;
    this.timer = null;
  }

  arm() {
    this.active = true;
    this.deadline = Date.now() + this.maxDurationMs;
    this.#resetIdleTimer();
  }

  disarm() {
    this.active = false;
    this.deadline = 0;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  dispose() {
    this.disarm();
  }

  isActive() {
    if (!this.active) return false;
    if (this.deadline > 0 && Date.now() > this.deadline) {
      this.disarm();
      return false;
    }
    return true;
  }

  onNavigate(rawUrl) {
    if (isAllowedGeminiUrl(rawUrl)) {
      this.disarm();
      return;
    }
    if (isWorkspaceConnectorAuthUrl(rawUrl)) {
      this.arm();
      return;
    }
    if (this.isActive() && parseHttpsUrl(rawUrl)) {
      this.#resetIdleTimer();
    }
  }

  shouldAllowInAppNavigation(rawUrl) {
    if (isAllowedInAppUrl(rawUrl)) return true;
    if (isWorkspaceConnectorAuthUrl(rawUrl)) {
      this.arm();
      return true;
    }
    return this.isActive() && Boolean(parseHttpsUrl(rawUrl));
  }

  #resetIdleTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    const remaining = Math.max(0, this.deadline - Date.now());
    const delay = Math.min(this.idleTimeoutMs, remaining);
    if (delay <= 0) {
      this.disarm();
      return;
    }
    this.timer = setTimeout(() => this.disarm(), delay);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }
}

module.exports = {
  AuthFlowTracker,
  buildAccountChooserUrl,
  buildAddAccountUrl,
  cleanUserAgent,
  isAllowedExternalUrl,
  isAllowedGeminiUrl,
  isAllowedGoogleAuthUrl,
  isAllowedInAppUrl,
  isBundleUrl,
  isWorkspaceConnectorAuthUrl,
  sanitizeGoogleRequestHeaders,
};
