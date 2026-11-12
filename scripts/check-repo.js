'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const errors = [];

function fail(msg) {
  errors.push(msg);
}

function collectFiles(dirPath, extFilter, out = []) {
  if (!fs.existsSync(dirPath)) return out;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, extFilter, out);
    } else if (!extFilter || entry.name.endsWith(extFilter)) {
      out.push(full);
    }
  }
  return out;
}

function rel(filePath) {
  return path.relative(ROOT_DIR, filePath);
}

// 1. Package metadata and preserved Debian resources
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
const requiredPaths = [
  pkg.main,
  pkg.build?.icon || 'icon.png',
  pkg.build?.deb?.afterRemove,
  'LICENSE',
  'build/deb/copyright',
  'build/metainfo/io.github.vish1109.gemini.metainfo.xml',
].filter(Boolean);

for (const item of requiredPaths) {
  const full = path.join(ROOT_DIR, item);
  if (!fs.existsSync(full)) {
    fail(`Missing required package/build asset: ${item}`);
  }
}

const legacyFiles = [
  'index.js',
  'preload.js',
  'index.html',
  'renderer.js',
  'about.html',
  'offline.html',
];
for (const legacy of legacyFiles) {
  if (fs.existsSync(path.join(ROOT_DIR, legacy))) {
    fail(`Legacy v1 root file still exists and should be removed: ${legacy}`);
  }
}

// 2. Syntax check all JS files in src/, scripts/, test/
const jsFiles = [
  ...collectFiles(path.join(ROOT_DIR, 'src'), '.js'),
  ...collectFiles(path.join(ROOT_DIR, 'scripts'), '.js'),
  ...collectFiles(path.join(ROOT_DIR, 'test'), '.js'),
];

for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (err) {
    fail(`Syntax check failed in ${rel(file)}: ${err.stderr?.toString() || err.message}`);
  }
}

// 3. Sandboxed preload check: only require('electron') is permitted under sandbox: true
const preloadFiles = collectFiles(path.join(ROOT_DIR, 'src', 'preload'), '.js');
for (const file of preloadFiles) {
  const source = fs.readFileSync(file, 'utf8');
  const matches = source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g);
  for (const match of matches) {
    if (match[1] !== 'electron') {
      fail(`Sandboxed preload ${rel(file)} must not require('${match[1]}')`);
    }
  }
}

// 4. HTML CSP & local asset checks
const rendererRoot = path.join(ROOT_DIR, 'src', 'renderer');
const htmlFiles = collectFiles(rendererRoot, '.html');
const aliasMap = new Map([['assets/icon.png', path.join(ROOT_DIR, 'icon.png')]]);

function checkLocalAssetRef(htmlFile, refValue) {
  if (!refValue || /^(https?:|data:|mailto:|#)/i.test(refValue)) return;
  if (/^javascript:/i.test(refValue)) {
    fail(`Unsafe javascript: URL in ${rel(htmlFile)}: ${refValue}`);
    return;
  }
  const cleanRef = refValue.split(/[?#]/)[0];
  const resolved = path.resolve(path.dirname(htmlFile), cleanRef);
  const relFromRenderer = path.relative(rendererRoot, resolved).split(path.sep).join('/');
  if (relFromRenderer.startsWith('..')) {
    fail(`HTML asset ref escapes renderer root in ${rel(htmlFile)}: ${refValue}`);
    return;
  }
  if (aliasMap.has(relFromRenderer)) {
    if (!fs.existsSync(aliasMap.get(relFromRenderer))) {
      fail(`Missing aliased asset ${relFromRenderer} referenced in ${rel(htmlFile)}`);
    }
    return;
  }
  if (!fs.existsSync(resolved)) {
    fail(`Missing local asset ${refValue} referenced in ${rel(htmlFile)}`);
  }
}

for (const htmlFile of htmlFiles) {
  const rawHtml = fs.readFileSync(htmlFile, 'utf8');
  const htmlNoComments = rawHtml.replace(/<!--[\s\S]*?-->/g, '');

  // Inline <script> check
  const scriptTags = htmlNoComments.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const match of scriptTags) {
    const attrs = match[1] || '';
    const body = (match[2] || '').trim();
    const srcMatch = attrs.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    if (!srcMatch) {
      fail(`Inline <script> forbidden by CSP in ${rel(htmlFile)}`);
    } else {
      checkLocalAssetRef(htmlFile, srcMatch[1]);
      if (body.length > 0) {
        fail(`External <script src> tag must not contain body in ${rel(htmlFile)}`);
      }
    }
  }

  // Inline event attributes check (e.g. onclick=, onload=)
  const tagMatches = htmlNoComments.matchAll(/<[a-z][^>]*>/gi);
  for (const tagMatch of tagMatches) {
    const tag = tagMatch[0];
    if (/\son[a-z]+\s*=/i.test(tag)) {
      fail(`Inline event handler attribute forbidden by CSP in ${rel(htmlFile)}: ${tag}`);
    }
    const hrefMatch = tag.match(/\b(?:href|src)\s*=\s*["']([^"']+)["']/i);
    if (hrefMatch && !/^<script\b/i.test(tag)) {
      checkLocalAssetRef(htmlFile, hrefMatch[1]);
    }
  }
}

// 5. Verify preload and BUNDLE_ORIGIN HTML references in src/main/
const mainJsFiles = collectFiles(path.join(ROOT_DIR, 'src', 'main'), '.js');
for (const file of mainJsFiles) {
  const source = fs.readFileSync(file, 'utf8');
  for (const m of source.matchAll(/['"]([a-zA-Z0-9_-]+Preload\.js)['"]/g)) {
    const target = path.join(ROOT_DIR, 'src', 'preload', m[1]);
    if (!fs.existsSync(target)) {
      fail(`Missing preload ${m[1]} referenced in ${rel(file)}`);
    }
  }
  for (const m of source.matchAll(/\$\{BUNDLE_ORIGIN\}\/([a-zA-Z0-9_./-]+\.html)/g)) {
    const target = path.join(rendererRoot, m[1]);
    if (!fs.existsSync(target)) {
      fail(`Missing renderer HTML ${m[1]} referenced in ${rel(file)}`);
    }
  }
}

// 6. Validate AppStream metainfo if appstreamcli is installed
const metainfoPath = path.join(ROOT_DIR, 'build/metainfo/io.github.vish1109.gemini.metainfo.xml');
const appstreamCheck = spawnSync('appstreamcli', ['validate', '--pedantic', '--no-net', metainfoPath], {
  encoding: 'utf8',
});
let appstreamStatus = 'skipped (appstreamcli not installed)';
if (!appstreamCheck.error) {
  if (appstreamCheck.status !== 0) {
    fail(
      `appstreamcli validation failed:\n${appstreamCheck.stdout || ''}${appstreamCheck.stderr || ''}`.trim(),
    );
  } else {
    appstreamStatus = 'passed';
  }
}

if (errors.length > 0) {
  console.error(`Repository check FAILED (${errors.length} issue(s)):\n`);
  for (const err of errors) {
    console.error(` - ${err}`);
  }
  process.exit(1);
}

console.log(
  `Repository check passed: ${jsFiles.length} JS files syntax-checked, ${preloadFiles.length} sandboxed preloads verified, ${htmlFiles.length} renderer HTML files CSP-checked, appstreamcli: ${appstreamStatus}.`,
);
