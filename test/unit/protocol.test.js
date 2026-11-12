'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getMimeType,
  readBundleAssetResponse,
  resolveBundleAssetPath,
} = require('../../src/main/protocol');

test('resolveBundleAssetPath blocks path traversal, wrong hosts, and backslashes', () => {
  const root = '/app/src/renderer';
  assert.equal(
    resolveBundleAssetPath(root, 'app://bundle/top_bar/top_bar.html'),
    path.resolve(root, 'top_bar/top_bar.html'),
  );
  assert.equal(resolveBundleAssetPath(root, 'app://bundle/../main/main.js'), null);
  assert.equal(resolveBundleAssetPath(root, 'app://bundle/%2e%2e/package.json'), null);
  assert.equal(resolveBundleAssetPath(root, 'app://bundle/top_bar%5Ctop_bar.html'), null);
  assert.equal(resolveBundleAssetPath(root, 'app://evil/top_bar.html'), null);
  assert.equal(resolveBundleAssetPath(root, 'https://bundle/top_bar.html'), null);
  assert.equal(resolveBundleAssetPath(root, 'app://bundle/'), null);
});

test('readBundleAssetResponse serves files with CSP headers and rejects symlink escapes', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-proto-'));
  try {
    const bundleRoot = path.join(tmpDir, 'renderer');
    const outsideFile = path.join(tmpDir, 'secret.txt');
    const insideHtml = path.join(bundleRoot, 'loading.html');
    const aliasIcon = path.join(tmpDir, 'icon.png');

    fs.mkdirSync(bundleRoot, { recursive: true });
    fs.writeFileSync(insideHtml, '<h1>Loading</h1>', 'utf8');
    fs.writeFileSync(outsideFile, 'TOP_SECRET', 'utf8');
    fs.writeFileSync(aliasIcon, 'PNG_BYTES', 'utf8');
    fs.symlinkSync(outsideFile, path.join(bundleRoot, 'escape.txt'));

    const htmlRes = readBundleAssetResponse(
      bundleRoot,
      'app://bundle/loading.html?v=1',
      { 'assets/icon.png': aliasIcon },
    );
    assert.equal(htmlRes.status, 200);
    assert.equal(await htmlRes.text(), '<h1>Loading</h1>');
    assert.ok(htmlRes.headers.get('Content-Security-Policy').includes("default-src 'none'"));

    const iconRes = readBundleAssetResponse(
      bundleRoot,
      'app://bundle/assets/icon.png',
      { 'assets/icon.png': aliasIcon },
    );
    assert.equal(iconRes.status, 200);
    assert.equal(iconRes.headers.get('Content-Type'), 'image/png');

    const symlinkRes = readBundleAssetResponse(bundleRoot, 'app://bundle/escape.txt');
    assert.equal(symlinkRes.status, 403);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('getMimeType maps web asset extensions accurately', () => {
  assert.match(getMimeType('foo.html'), /^text\/html/);
  assert.match(getMimeType('foo.js'), /^text\/javascript/);
  assert.match(getMimeType('foo.css'), /^text\/css/);
  assert.equal(getMimeType('foo.svg'), 'image/svg+xml');
});
