'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isBundleIpcSender, isGeminiIpcSender } = require('../../src/main/ipcGuards');

function makeEvent({ url, parent = null, top = undefined, sender = null }) {
  const senderFrame = {
    url,
    parent,
    get top() {
      return top === undefined ? this : top;
    },
  };
  return { sender, senderFrame };
}

test('isGeminiIpcSender permits only top-level https://gemini.google.com frames', () => {
  assert.equal(
    isGeminiIpcSender(makeEvent({ url: 'https://gemini.google.com/app' })),
    true,
  );
  assert.equal(
    isGeminiIpcSender(
      makeEvent({ url: 'https://gemini.google.com/app', parent: {}, top: {} }),
    ),
    false,
  );
  assert.equal(
    isGeminiIpcSender(makeEvent({ url: 'https://evil.example/' })),
    false,
  );
  assert.equal(
    isGeminiIpcSender(makeEvent({ url: 'app://bundle/top_bar/top_bar.html' })),
    false,
  );
});

test('isBundleIpcSender strictly checks view identity and app://bundle URL', () => {
  const viewWc = { isDestroyed: () => false };
  const otherWc = { isDestroyed: () => false };
  const view = { webContents: viewWc };

  assert.equal(
    isBundleIpcSender(
      makeEvent({ url: 'app://bundle/find_bar/find_bar.html', sender: viewWc }),
      view,
    ),
    true,
  );
  assert.equal(
    isBundleIpcSender(
      makeEvent({ url: 'app://bundle/find_bar/find_bar.html', sender: otherWc }),
      view,
    ),
    false,
  );
  assert.equal(
    isBundleIpcSender(
      makeEvent({ url: 'https://gemini.google.com/app', sender: viewWc }),
      view,
    ),
    false,
  );
  assert.equal(
    isBundleIpcSender(
      makeEvent({ url: 'app://bundle/find_bar/find_bar.html', sender: viewWc }),
      { webContents: { isDestroyed: () => true } },
    ),
    false,
  );
});
