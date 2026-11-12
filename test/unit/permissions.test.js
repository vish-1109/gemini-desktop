'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  installSessionPermissions,
  mapElectronPermission,
  resolveRequestedCapabilities,
} = require('../../src/main/permissions');

function createMockEnv(initialPermissions = {}) {
  const perms = {
    media: 'ask',
    camera: 'ask',
    geolocation: 'ask',
    notifications: 'ask',
    clipboard: 'ask',
    ...initialPermissions,
  };
  let checkHandler = null;
  let requestHandler = null;
  const prompted = [];

  const targetSession = {
    setPermissionCheckHandler(fn) {
      checkHandler = fn;
    },
    setPermissionRequestHandler(fn) {
      requestHandler = fn;
    },
  };

  const settingsStore = {
    get: (key) => (key === 'permissions' ? { ...perms } : undefined),
    setPermission: (cap, decision) => {
      perms[cap] = decision;
    },
  };

  const permissionDialog = {
    enqueue(req) {
      prompted.push(req);
    },
  };

  installSessionPermissions(targetSession, { settingsStore, permissionDialog });
  return {
    perms,
    prompted,
    check: (permission, origin, details) => checkHandler(null, permission, origin, details),
    request: (permission, details) =>
      new Promise((resolve) => {
        requestHandler(null, permission, resolve, details);
      }),
  };
}

test('mapElectronPermission and resolveRequestedCapabilities handle single and combined media', () => {
  assert.equal(mapElectronPermission('media', { mediaTypes: ['video'] }), 'camera');
  assert.equal(mapElectronPermission('media', { mediaType: 'video' }), 'camera');
  assert.deepEqual(
    resolveRequestedCapabilities('media', { mediaTypes: ['audio', 'video'] }),
    ['media', 'camera'],
  );
});

test('combined audio+video requests honor blocked camera setting and deny untrusted origins', async () => {
  const env = createMockEnv({ media: 'granted', camera: 'denied' });
  assert.equal(
    env.check('media', 'https://gemini.google.com/app', { mediaType: 'video' }),
    false,
  );
  assert.equal(
    env.check('media', 'https://gemini.google.com/app', { mediaType: 'audio' }),
    true,
  );

  const allowed = await env.request('media', {
    requestingUrl: 'https://gemini.google.com/app',
    mediaTypes: ['audio', 'video'],
  });
  assert.equal(allowed, false);
  assert.equal(env.prompted.length, 0);

  const evilAllowed = await env.request('media', {
    requestingUrl: 'https://evil.example/',
    mediaTypes: ['audio'],
  });
  assert.equal(evilAllowed, false);
});

test('combined audio+video prompt saves both media and camera decisions', async () => {
  const env = createMockEnv({ media: 'ask', camera: 'ask' });
  const pending = env.request('media', {
    requestingUrl: 'https://gemini.google.com/app',
    mediaTypes: ['audio', 'video'],
  });

  assert.equal(env.prompted.length, 1);
  assert.equal(env.prompted[0].capability, 'camera');
  env.prompted[0].callback(true);

  assert.equal(await pending, true);
  assert.equal(env.perms.media, 'granted');
  assert.equal(env.perms.camera, 'granted');
});
