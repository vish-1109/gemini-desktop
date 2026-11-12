'use strict';

const { LAYOUT } = require('./constants');

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

function isFiniteRect(rect) {
  return Boolean(
    rect &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height) &&
      rect.width > 0 &&
      rect.height > 0,
  );
}

/**
 * Encodes window bounds relative to display workArea so resolution/DPI changes restore cleanly.
 */
function computeRelativeBounds(bounds, workArea, displayId = null) {
  if (!isFiniteRect(bounds) || !isFiniteRect(workArea)) return null;
  const maxOffsetX = Math.max(0, workArea.width - bounds.width);
  const maxOffsetY = Math.max(0, workArea.height - bounds.height);
  const offsetX = clamp(bounds.x - workArea.x, 0, maxOffsetX);
  const offsetY = clamp(bounds.y - workArea.y, 0, maxOffsetY);

  return {
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
    relativeX: maxOffsetX > 0 ? offsetX / maxOffsetX : 0.5,
    relativeY: maxOffsetY > 0 ? offsetY / maxOffsetY : 0.5,
    displayId: displayId ?? null,
  };
}

function clampRectToWorkArea(rect, workArea, minSize = {}) {
  const minW = Math.min(
    minSize.width ?? LAYOUT.MIN_WINDOW_WIDTH,
    Math.max(200, workArea.width),
  );
  const minH = Math.min(
    minSize.height ?? LAYOUT.MIN_WINDOW_HEIGHT,
    Math.max(200, workArea.height),
  );

  const width = Math.round(clamp(rect.width, minW, workArea.width));
  const height = Math.round(clamp(rect.height, minH, workArea.height));
  const x = Math.round(
    clamp(rect.x, workArea.x, workArea.x + Math.max(0, workArea.width - width)),
  );
  const y = Math.round(
    clamp(rect.y, workArea.y, workArea.y + Math.max(0, workArea.height - height)),
  );

  return { x, y, width, height };
}

function resolveInitialWindowBounds(
  savedBounds,
  allDisplays = [],
  primaryDisplay = null,
  defaults = {},
) {
  const fallbackWidth = defaults.width ?? LAYOUT.DEFAULT_WINDOW_WIDTH;
  const fallbackHeight = defaults.height ?? LAYOUT.DEFAULT_WINDOW_HEIGHT;
  const fallbackWorkArea = primaryDisplay?.workArea || {
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  };

  if (!savedBounds || !Number.isFinite(savedBounds.width) || !Number.isFinite(savedBounds.height)) {
    const width = Math.min(fallbackWidth, fallbackWorkArea.width);
    const height = Math.min(fallbackHeight, fallbackWorkArea.height);
    const x = fallbackWorkArea.x + Math.round((fallbackWorkArea.width - width) / 2);
    const y = fallbackWorkArea.y + Math.round((fallbackWorkArea.height - height) / 2);
    return clampRectToWorkArea({ x, y, width, height }, fallbackWorkArea);
  }

  const targetDisplay =
    allDisplays.find((d) => String(d.id) === String(savedBounds.displayId)) ||
    primaryDisplay ||
    allDisplays[0] || { workArea: fallbackWorkArea };

  const workArea = targetDisplay.workArea || fallbackWorkArea;
  const width = Math.min(Math.round(savedBounds.width), workArea.width);
  const height = Math.min(Math.round(savedBounds.height), workArea.height);

  const relX = Number.isFinite(savedBounds.relativeX)
    ? clamp(savedBounds.relativeX, 0, 1)
    : 0.5;
  const relY = Number.isFinite(savedBounds.relativeY)
    ? clamp(savedBounds.relativeY, 0, 1)
    : 0.5;

  const availX = Math.max(0, workArea.width - width);
  const availY = Math.max(0, workArea.height - height);
  const x = workArea.x + Math.round(relX * availX);
  const y = workArea.y + Math.round(relY * availY);

  return clampRectToWorkArea({ x, y, width, height }, workArea);
}

module.exports = {
  clampRectToWorkArea,
  computeRelativeBounds,
  resolveInitialWindowBounds,
};
