'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AppLogger, sanitizeLogText } = require('../../src/main/logger');

test('sanitizeLogText masks home dir, emails, OAuth tokens, and query strings', () => {
  const sample =
    'User alice@example.com visited https://gemini.google.com/u/12345/app?authuser=0&secret=abc from /home/vishrut/docs with Bearer ya29.secret_tok';
  const clean = sanitizeLogText(sample, '/home/vishrut');

  assert.equal(clean.includes('alice@example.com'), false);
  assert.equal(clean.includes('/home/vishrut'), false);
  assert.equal(clean.includes('secret=abc'), false);
  assert.equal(clean.includes('ya29.secret_tok'), false);
  assert.match(clean, /\[REDACTED:email\]/);
  assert.match(clean, /\[REDACTED:token\]/);
  assert.match(clean, /~\/docs/);
});

test('AppLogger bounds ring buffer size and formats diagnostics', () => {
  const log = new AppLogger({ maxBufferLines: 3, homeDir: '/home/tester' });
  log.info('a', 'msg 1');
  log.info('b', 'msg 2');
  log.info('c', 'msg 3');
  log.info('d', 'msg 4');

  const lines = log.getLines();
  assert.equal(lines.length, 3);
  assert.match(lines[0], /msg 2/);
  assert.match(log.exportDiagnostics({ appVersion: '1.0.0' }), /App Version: 1\.0\.0/);
});
