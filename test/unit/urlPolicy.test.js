'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AuthFlowTracker,
  buildAccountChooserUrl,
  cleanUserAgent,
  isAllowedExternalUrl,
  isAllowedGeminiUrl,
  isAllowedGoogleAuthUrl,
  isAllowedInAppUrl,
  isBundleUrl,
  sanitizeGoogleRequestHeaders,
} = require('../../src/main/urlPolicy');

test('isAllowedGeminiUrl allows only https gemini/bard Google hosts', () => {
  assert.equal(isAllowedGeminiUrl('https://gemini.google.com/app'), true);
  assert.equal(isAllowedGeminiUrl('https://gemini.google.com/u/1/app'), true);
  assert.equal(isAllowedGeminiUrl('https://bard.google.com/'), true);
  assert.equal(isAllowedGeminiUrl('http://gemini.google.com/app'), false);
  assert.equal(isAllowedGeminiUrl('https://gemini.google.com.evil.com/'), false);
  assert.equal(isAllowedGeminiUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedGeminiUrl('not a url'), false);
});

test('isAllowedGoogleAuthUrl & isAllowedInAppUrl enforce HTTPS allowlist', () => {
  assert.equal(isAllowedGoogleAuthUrl('https://accounts.google.com/ServiceLogin'), true);
  assert.equal(isAllowedGoogleAuthUrl('https://myaccount.google.com/'), true);
  assert.equal(isAllowedGoogleAuthUrl('https://evil.com'), false);
  assert.equal(isAllowedInAppUrl('https://accounts.google.com/'), true);
  assert.equal(isAllowedInAppUrl('https://github.com/'), false);
});

test('isAllowedExternalUrl accepts only http/https schemes', () => {
  assert.equal(isAllowedExternalUrl('https://github.com/vish-1109/gemini-desktop'), true);
  assert.equal(isAllowedExternalUrl('http://localhost:3000'), true);
  assert.equal(isAllowedExternalUrl('file:///etc/passwd'), false);
  assert.equal(isAllowedExternalUrl('ms-settings:privacy'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
});

test('isBundleUrl checks app://bundle/ prefix strictly', () => {
  assert.equal(isBundleUrl('app://bundle/top_bar/top_bar.html'), true);
  assert.equal(isBundleUrl('app://other/index.html'), false);
  assert.equal(isBundleUrl('file:///app/index.html'), false);
});

test('cleanUserAgent strips Electron and gemini-desktop tokens cleanly', () => {
  const dirty =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) gemini-desktop/1.0.0 Chrome/140.0.0.0 Electron/40.10.2 Safari/537.36';
  const cleaned = cleanUserAgent(dirty, '140.0.7339.207');
  assert.equal(cleaned.includes('Electron'), false);
  assert.equal(cleaned.includes('gemini-desktop'), false);
  assert.match(cleaned, /Chrome\/140\.0\.0\.0/);
  assert.match(cleaned, /Safari\/537\.36/);
});

test('sanitizeGoogleRequestHeaders removes sec-ch-ua headers case-insensitively', () => {
  const sanitized = sanitizeGoogleRequestHeaders({
    Accept: 'text/html',
    'Sec-CH-UA': '"Electron";v="40"',
    'sec-ch-ua-platform': '"Linux"',
    Referer: 'https://gemini.google.com',
  });
  assert.deepEqual(sanitized, {
    Accept: 'text/html',
    Referer: 'https://gemini.google.com',
  });
});

test('buildAccountChooserUrl keeps valid Gemini continue target or falls back', () => {
  assert.equal(
    buildAccountChooserUrl('https://gemini.google.com/u/1/app'),
    'https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fgemini.google.com%2Fu%2F1%2Fapp',
  );
  assert.equal(
    buildAccountChooserUrl('https://evil.example/phish'),
    'https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fgemini.google.com%2Fapp',
  );
});

test('AuthFlowTracker arms on OAuth URLs and disarms on return to Gemini', () => {
  const tracker = new AuthFlowTracker({ idleTimeoutMs: 5000, maxDurationMs: 10000 });
  assert.equal(tracker.isActive(), false);
  assert.equal(tracker.shouldAllowInAppNavigation('https://idp.corp.example/sso'), false);

  tracker.onNavigate('https://app.example/oauth?client_id=1&redirect_uri=https%3A%2F%2Fgemini.google.com&response_type=code');
  assert.equal(tracker.isActive(), true);
  assert.equal(tracker.shouldAllowInAppNavigation('https://idp.corp.example/sso'), true);

  tracker.onNavigate('https://gemini.google.com/app');
  assert.equal(tracker.isActive(), false);

  tracker.arm();
  assert.equal(tracker.isActive(), true);
  tracker.dispose();
  assert.equal(tracker.isActive(), false);
});

test('AuthFlowTracker rejects OAuth links whose redirect_uri leaves allowed Google hosts', () => {
  const tracker = new AuthFlowTracker({ idleTimeoutMs: 5000, maxDurationMs: 10000 });
  const phishUrl =
    'https://evil.example/oauth?client_id=1&redirect_uri=https%3A%2F%2Fevil.example%2Fcb&response_type=code';
  assert.equal(tracker.shouldAllowInAppNavigation(phishUrl), false);
  assert.equal(tracker.isActive(), false);
});
