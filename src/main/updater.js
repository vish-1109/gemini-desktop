'use strict';

const {
  GITHUB_RELEASES_API_URL,
  GITHUB_RELEASES_PAGE_URL,
} = require('./constants');

function normalizeVersion(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/^v/i, '');
  const match = trimmed.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return {
    raw: trimmed,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(aParts, bParts) {
  if (aParts.length === 0 && bParts.length === 0) return 0;
  if (aParts.length === 0) return 1;
  if (bParts.length === 0) return -1;

  const len = Math.max(aParts.length, bParts.length);
  for (let i = 0; i < len; i += 1) {
    if (i >= aParts.length) return -1;
    if (i >= bParts.length) return 1;
    const a = aParts[i];
    const b = bParts[i];
    const aNum = /^\d+$/.test(a);
    const bNum = /^\d+$/.test(b);
    if (aNum && bNum) {
      const diff = Number(a) - Number(b);
      if (diff !== 0) return diff > 0 ? 1 : -1;
    } else if (aNum !== bNum) {
      return aNum ? -1 : 1;
    } else if (a !== b) {
      return a > b ? 1 : -1;
    }
  }
  return 0;
}

/**
 * Compares two semver strings: returns 1 if a > b, -1 if a < b, 0 if equal.
 */
function compareSemver(aStr, bStr) {
  const a = normalizeVersion(aStr);
  const b = normalizeVersion(bStr);
  if (!a && !b) return 0;
  if (!a) return -1;
  if (!b) return 1;

  for (const field of ['major', 'minor', 'patch']) {
    if (a[field] !== b[field]) {
      return a[field] > b[field] ? 1 : -1;
    }
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

function isSafeHttpsReleaseUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === 'github.com'
    );
  } catch {
    return false;
  }
}

function evaluateRelease(releaseJson, currentVersion) {
  if (!releaseJson || typeof releaseJson !== 'object' || !releaseJson.tag_name) {
    return {
      status: 'error',
      currentVersion,
      error: 'Invalid release payload',
    };
  }

  const parsedLatest = normalizeVersion(releaseJson.tag_name);
  if (!parsedLatest) {
    return {
      status: 'error',
      currentVersion,
      error: 'Unrecognized release version tag',
    };
  }

  const latestVersion = parsedLatest.raw;
  const releaseUrl = isSafeHttpsReleaseUrl(releaseJson.html_url)
    ? releaseJson.html_url
    : GITHUB_RELEASES_PAGE_URL;

  const isNewer = compareSemver(latestVersion, currentVersion) > 0;
  return {
    status: isNewer ? 'available' : 'up_to_date',
    currentVersion,
    latestVersion,
    releaseUrl,
    publishedAt:
      typeof releaseJson.published_at === 'string'
        ? releaseJson.published_at
        : null,
  };
}

async function checkForUpdates({
  fetchFn,
  currentVersion,
  apiUrl = GITHUB_RELEASES_API_URL,
  timeoutMs = 8000,
} = {}) {
  if (typeof fetchFn !== 'function') {
    return { status: 'error', currentVersion, error: 'Fetch unavailable' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();

  try {
    const res = await fetchFn(apiUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `gemini-desktop-linux/${currentVersion}`,
      },
      signal: controller.signal,
    });
    if (!res || !res.ok) {
      return {
        status: 'error',
        currentVersion,
        error: `HTTP ${res ? res.status : 'error'}`,
      };
    }
    const json = await res.json();
    return evaluateRelease(json, currentVersion);
  } catch (error) {
    return {
      status: 'error',
      currentVersion,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  checkForUpdates,
  compareSemver,
  evaluateRelease,
  normalizeVersion,
};
