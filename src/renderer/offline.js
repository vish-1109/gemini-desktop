'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const retryBtn = document.getElementById('btn-retry');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      window.geminiOffline?.retryLoad();
    });
  }
  window.addEventListener('online', () => {
    window.geminiOffline?.retryLoad();
  });
});
