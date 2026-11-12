'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const pillText = document.getElementById('pill-text');
  const openBtn = document.getElementById('btn-open-release');
  const dismissBtn = document.getElementById('btn-dismiss');

  openBtn?.addEventListener('click', () => {
    window.updateBannerApi?.openRelease();
  });
  dismissBtn?.addEventListener('click', () => {
    window.updateBannerApi?.dismiss();
  });

  window.updateBannerApi?.onShow((payload) => {
    if (!payload || typeof payload !== 'object') return;
    if (pillText && payload.latestVersion) {
      pillText.textContent = `Gemini v${payload.latestVersion} available`;
    }
  });
});
