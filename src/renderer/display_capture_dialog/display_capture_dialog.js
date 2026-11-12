'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('sources-grid');
  const fallbackBox = document.getElementById('preview-fallback');
  const fallbackImg = document.getElementById('fallback-preview-img');
  const allowBtn = document.getElementById('dc-allow');
  const cancelBtn = document.getElementById('dc-cancel');

  let selectedSourceId = '';

  function selectCard(sourceId) {
    selectedSourceId = sourceId;
    if (!grid) return;
    for (const btn of grid.querySelectorAll('.source-card')) {
      btn.classList.toggle('selected', btn.dataset.sourceId === sourceId);
    }
    if (allowBtn) allowBtn.disabled = false;
  }

  function renderRequest(data) {
    if (!data || !grid || !fallbackBox) return;
    while (grid.firstChild) grid.removeChild(grid.firstChild);

    const sources = Array.isArray(data.sources) ? data.sources : [];
    if (sources.length === 0) {
      grid.style.display = 'none';
      fallbackBox.style.display = 'flex';
      if (fallbackImg && data.previewDataUrl) {
        fallbackImg.src = data.previewDataUrl;
        fallbackImg.style.display = 'block';
      } else if (fallbackImg) {
        fallbackImg.style.display = 'none';
      }
      selectedSourceId = '';
      if (allowBtn) allowBtn.disabled = false;
      return;
    }

    grid.style.display = 'grid';
    fallbackBox.style.display = 'none';

    for (const source of sources) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'source-card';
      card.dataset.sourceId = source.id;

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'thumb-wrap';
      if (source.thumbnailDataUrl) {
        const img = document.createElement('img');
        img.src = source.thumbnailDataUrl;
        img.alt = '';
        thumbWrap.appendChild(img);
      }

      const meta = document.createElement('div');
      meta.className = 'source-meta';
      const label = document.createElement('span');
      label.className = 'source-name';
      label.textContent = source.name || 'Screen';
      meta.appendChild(label);

      card.append(thumbWrap, meta);
      card.addEventListener('click', () => selectCard(source.id));
      card.addEventListener('dblclick', () => {
        window.displayCaptureApi?.respond(true, source.id);
      });
      grid.appendChild(card);
    }

    selectCard(sources[0].id);
  }

  window.displayCaptureApi?.onRequestData(renderRequest);
  window.displayCaptureApi
    ?.getCurrentRequest()
    .then(renderRequest)
    .catch(() => {});

  allowBtn?.addEventListener('click', () => {
    window.displayCaptureApi?.respond(true, selectedSourceId);
  });
  cancelBtn?.addEventListener('click', () => {
    window.displayCaptureApi?.respond(false, '');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      window.displayCaptureApi?.respond(false, '');
    }
  });
});
