'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { LOG_REDACT_DOMAINS } = require('./constants');

const LEVEL_NAMES = Object.freeze({
  0: 'DEBUG',
  1: 'INFO',
  2: 'WARN',
  3: 'ERROR',
});

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>()[\]{}`]+/gi;
const BEARER_RE = /\b(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const YA29_RE = /\bya29\.[A-Za-z0-9._-]+/g;
const SAFE_PATH_SEGMENT_RE = /^[A-Za-z0-9._-]{0,32}$/;

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeUrlForLogs(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return '[REDACTED:url]';
  }
  if (parsed.protocol === 'app:') {
    return `app://${parsed.host}${parsed.pathname}`;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return `${parsed.protocol}//[REDACTED:url]`;
  }
  const host = parsed.hostname.toLowerCase();
  const isKnown = LOG_REDACT_DOMAINS.some(
    (domain) => host === domain || host.endsWith(`.${domain}`),
  );
  if (!isKnown) {
    return `${parsed.protocol}//[REDACTED:host]`;
  }
  const safePath = parsed.pathname
    .split('/')
    .map((seg) => (SAFE_PATH_SEGMENT_RE.test(seg) ? seg : '[id]'))
    .join('/');
  return `${parsed.protocol}//${parsed.host}${safePath}`;
}

/**
 * Redacts user home directories, emails, tokens, and query strings from log lines.
 */
function sanitizeLogText(text, homeDir = os.homedir()) {
  if (text == null) return '';
  let out = String(text);
  if (homeDir && homeDir.length > 2) {
    out = out.replace(new RegExp(escapeRegExp(homeDir), 'gi'), '~');
  }
  out = out
    .replace(URL_RE, (match) => sanitizeUrlForLogs(match))
    .replace(EMAIL_RE, '[REDACTED:email]')
    .replace(BEARER_RE, '$1[REDACTED:token]')
    .replace(YA29_RE, '[REDACTED:token]');
  return out;
}

class AppLogger {
  constructor(options = {}) {
    this.minLevel = options.minLevel ?? 1;
    this.maxBufferLines = options.maxBufferLines ?? 500;
    this.maxFileBytes = options.maxFileBytes ?? 5 * 1024 * 1024;
    this.homeDir = options.homeDir ?? os.homedir();
    this.logFilePath = options.logFilePath ?? null;
    this.ringBuffer = [];
  }

  setLogDirectory(logDir) {
    if (!logDir) return;
    try {
      fs.mkdirSync(logDir, { recursive: true });
      this.logFilePath = path.join(logDir, 'gemini.log');
    } catch {
      this.logFilePath = null;
    }
  }

  write(level, scope, message, detail) {
    if (level < this.minLevel) return null;
    const timestamp = new Date().toISOString();
    const levelName = LEVEL_NAMES[level] || 'INFO';
    const cleanScope = sanitizeLogText(scope, this.homeDir);
    const cleanMsg = sanitizeLogText(message, this.homeDir);
    let line = `[${timestamp}] [${levelName}] [${cleanScope}] ${cleanMsg}`;

    if (detail !== undefined) {
      const detailText =
        detail instanceof Error ? detail.stack || detail.message : String(detail);
      line += `\n  ${sanitizeLogText(detailText, this.homeDir)}`;
    }

    this.ringBuffer.push(line);
    if (this.ringBuffer.length > this.maxBufferLines) {
      this.ringBuffer.shift();
    }

    if (level >= 3) {
      console.error(line);
    } else if (level === 2) {
      console.warn(line);
    }

    this.#appendToFile(line);
    return line;
  }

  debug(scope, message, detail) {
    return this.write(0, scope, message, detail);
  }

  info(scope, message, detail) {
    return this.write(1, scope, message, detail);
  }

  warn(scope, message, detail) {
    return this.write(2, scope, message, detail);
  }

  error(scope, message, detail) {
    return this.write(3, scope, message, detail);
  }

  getLines() {
    return this.ringBuffer.slice();
  }

  exportDiagnostics(meta = {}) {
    const header = [
      '=== Gemini Desktop (Linux) Diagnostics ===',
      `App Version: ${meta.appVersion || 'unknown'}`,
      `Electron: ${meta.electronVersion || process.versions.electron || 'unknown'}`,
      `Platform: ${os.platform()} ${os.release()} ${os.arch()}`,
      `Session Type: ${meta.sessionType || 'unknown'}`,
      `Generated: ${new Date().toISOString()}`,
      `Lines: ${this.ringBuffer.length}`,
      '==========================================',
    ];
    return [...header, ...this.ringBuffer].join('\n');
  }

  #appendToFile(line) {
    if (!this.logFilePath) return;
    try {
      let size = 0;
      try {
        size = fs.statSync(this.logFilePath).size;
      } catch {
        size = 0;
      }
      if (size >= this.maxFileBytes) {
        const backup = `${this.logFilePath}.1`;
        try {
          fs.renameSync(this.logFilePath, backup);
        } catch {
          // Ignore rotation failure
        }
      }
      fs.appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
    } catch {
      // Never throw on diagnostic logging
    }
  }
}

const logger = new AppLogger();

module.exports = {
  AppLogger,
  logger,
  sanitizeLogText,
  sanitizeUrlForLogs,
};
