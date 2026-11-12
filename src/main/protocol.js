'use strict';

const fs = require('fs');
const path = require('path');
const { BUNDLE_HOST, BUNDLE_SCHEME } = require('./constants');

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
});

const BUNDLE_CSP =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none';";

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Resolves an app://bundle/... URL strictly inside bundleRootDir (or explicit aliasFiles).
 */
function resolveBundleAssetPath(bundleRootDir, requestUrl, aliasFiles = {}) {
  let parsed;
  try {
    parsed = new URL(requestUrl);
  } catch {
    return null;
  }

  if (
    parsed.protocol !== `${BUNDLE_SCHEME}:` ||
    parsed.hostname.toLowerCase() !== BUNDLE_HOST
  ) {
    return null;
  }

  // Reject raw or percent-encoded dot-segments before WHATWG URL normalization clamps them.
  const rawSuffix = requestUrl.slice(`${BUNDLE_SCHEME}://${BUNDLE_HOST}`.length);
  const rawPathOnly = rawSuffix.split(/[?#]/)[0];
  try {
    if (
      decodeURIComponent(rawPathOnly)
        .split(/[\\/]/)
        .some((seg) => seg === '..')
    ) {
      return null;
    }
  } catch {
    return null;
  }

  let rawPath;
  try {
    rawPath = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }

  if (!rawPath || rawPath.includes('\0') || rawPath.includes('\\')) {
    return null;
  }

  const trimmed = rawPath.replace(/^\/+/, '');
  if (!trimmed || trimmed.endsWith('/')) {
    return null;
  }
  if (trimmed.split('/').some((seg) => seg === '..' || seg === '.')) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(aliasFiles, trimmed)) {
    return path.resolve(aliasFiles[trimmed]);
  }

  const normalizedRoot = path.resolve(bundleRootDir);
  const candidate = path.resolve(normalizedRoot, trimmed);
  const rootPrefix = normalizedRoot.endsWith(path.sep)
    ? normalizedRoot
    : `${normalizedRoot}${path.sep}`;

  if (!candidate.startsWith(rootPrefix)) {
    return null;
  }

  return candidate;
}

function readBundleAssetResponse(bundleRootDir, requestUrl, aliasFiles = {}) {
  const resolved = resolveBundleAssetPath(bundleRootDir, requestUrl, aliasFiles);
  if (!resolved) {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      return new Response('Not Found', { status: 404 });
    }

    const isAliased = Object.values(aliasFiles).some(
      (p) => path.resolve(p) === resolved,
    );
    if (!isAliased) {
      const realRoot = fs.realpathSync(bundleRootDir);
      const realFile = fs.realpathSync(resolved);
      const realPrefix = realRoot.endsWith(path.sep)
        ? realRoot
        : `${realRoot}${path.sep}`;
      if (!realFile.startsWith(realPrefix)) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const body = fs.readFileSync(resolved);
    const mimeType = getMimeType(resolved);
    const headers = {
      'Content-Type': mimeType,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    };
    if (mimeType.startsWith('text/html')) {
      headers['Content-Security-Policy'] = BUNDLE_CSP;
    }

    return new Response(body, { status: 200, headers });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

function registerPrivilegedBundleScheme(protocolApi) {
  protocolApi.registerSchemesAsPrivileged([
    {
      scheme: BUNDLE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
  ]);
}

function registerBundleProtocolHandler(protocolApi, bundleRootDir, aliasFiles = {}) {
  protocolApi.handle(BUNDLE_SCHEME, (request) =>
    readBundleAssetResponse(bundleRootDir, request.url, aliasFiles),
  );
}

module.exports = {
  BUNDLE_CSP,
  getMimeType,
  readBundleAssetResponse,
  registerBundleProtocolHandler,
  registerPrivilegedBundleScheme,
  resolveBundleAssetPath,
};
