'use strict';

const { desktopCapturer } = require('electron');
const { isAllowedGeminiUrl } = require('./urlPolicy');
const { logger } = require('./logger');

async function listCaptureSources(options = {}) {
  try {
    const sources = await desktopCapturer.getSources({
      types: options.types || ['screen', 'window'],
      thumbnailSize: options.thumbnailSize || { width: 320, height: 180 },
      fetchWindowIcons: false,
    });
    return sources;
  } catch (error) {
    logger.warn('capture', 'desktopCapturer.getSources failed', error);
    return [];
  }
}

function serializeSourcesForUi(sources) {
  return sources.map((source) => ({
    id: source.id,
    name: source.name || 'Display',
    kind: String(source.id || '').startsWith('screen:') ? 'screen' : 'window',
    thumbnailDataUrl: source.thumbnail ? source.thumbnail.toDataURL() : '',
  }));
}

async function captureWindowSnapshot(sourceId) {
  if (typeof sourceId !== 'string' || !sourceId) {
    return { ok: false, error: 'Invalid sourceId' };
  }
  const sources = await listCaptureSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 1920, height: 1080 },
  });
  const match = sources.find((s) => s.id === sourceId);
  if (!match || !match.thumbnail) {
    return { ok: false, error: 'Source not found' };
  }
  const size = match.thumbnail.getSize();
  return {
    ok: true,
    id: match.id,
    name: match.name,
    width: size.width,
    height: size.height,
    dataUrl: match.thumbnail.toDataURL(),
  };
}

function installDisplayMediaHandler(targetSession, { displayCaptureDialog, contentView }) {
  targetSession.setDisplayMediaRequestHandler(async (request, callback) => {
    const requestingUrl =
      request?.frame?.url ||
      (contentView && !contentView.webContents.isDestroyed()
        ? contentView.webContents.getURL()
        : '');

    if (!isAllowedGeminiUrl(requestingUrl)) {
      logger.warn('capture', 'Blocked display media capture for untrusted origin');
      callback(null);
      return;
    }

    try {
      const rawSources = await listCaptureSources();
      let fallbackPreview = '';
      if (rawSources.length === 0 && contentView && !contentView.webContents.isDestroyed()) {
        try {
          fallbackPreview = (await contentView.webContents.capturePage()).toDataURL();
        } catch {
          fallbackPreview = '';
        }
      }

      const decision = await displayCaptureDialog.prompt({
        sources: serializeSourcesForUi(rawSources),
        previewDataUrl: fallbackPreview,
      });

      if (!decision?.allowed) {
        callback(null);
        return;
      }

      if (decision.sourceId) {
        const chosen = rawSources.find((s) => s.id === decision.sourceId);
        if (chosen) {
          callback({ video: chosen });
          return;
        }
      }

      const fallbackFrame =
        request.frame?.top ||
        request.frame ||
        (!contentView?.webContents.isDestroyed() ? contentView.webContents.mainFrame : null);

      if (fallbackFrame) {
        callback({ video: fallbackFrame });
      } else {
        callback(null);
      }
    } catch (error) {
      logger.warn('capture', 'Display capture request failed', error);
      callback(null);
    }
  });
}

module.exports = {
  captureWindowSnapshot,
  installDisplayMediaHandler,
  listCaptureSources,
  serializeSourcesForUi,
};
