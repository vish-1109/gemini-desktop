'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clampRectToWorkArea,
  computeRelativeBounds,
  resolveInitialWindowBounds,
} = require('../../src/main/windowBounds');

test('computeRelativeBounds encodes normalized coordinates inside workArea', () => {
  const workArea = { x: 100, y: 50, width: 1000, height: 800 };
  const rel = computeRelativeBounds(
    { x: 300, y: 150, width: 600, height: 400 },
    workArea,
    42,
  );
  assert.deepEqual(rel, {
    width: 600,
    height: 400,
    relativeX: 0.5,
    relativeY: 0.25,
    displayId: 42,
  });
});

test('clampRectToWorkArea enforces minimum bounds and constrains off-screen positions', () => {
  const workArea = { x: 0, y: 32, width: 1280, height: 700 };
  const clamped = clampRectToWorkArea(
    { x: 1200, y: -50, width: 1500, height: 200 },
    workArea,
  );
  assert.deepEqual(clamped, { x: 0, y: 32, width: 1280, height: 480 });
});

test('resolveInitialWindowBounds restores onto matching display or falls back safely', () => {
  const display1 = { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const display2 = { id: 2, workArea: { x: 1920, y: 0, width: 1280, height: 1000 } };

  const restored = resolveInitialWindowBounds(
    { width: 800, height: 600, relativeX: 0.5, relativeY: 0.5, displayId: 2 },
    [display1, display2],
    display1,
  );
  assert.deepEqual(restored, { x: 1920 + 240, y: 200, width: 800, height: 600 });

  const fallback = resolveInitialWindowBounds(
    { width: 800, height: 600, relativeX: 0.5, relativeY: 0.5, displayId: 999 },
    [display1],
    display1,
  );
  assert.deepEqual(fallback, { x: 560, y: 220, width: 800, height: 600 });
});
