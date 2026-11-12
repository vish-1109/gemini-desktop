'use strict';

const ICON_PATHS = {
  media:
    'M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z',
  camera:
    'M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z',
  geolocation:
    'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
  notifications:
    'M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z',
  clipboard:
    'M19 2h-4.18C14.4.84 13.3 0 12 0c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 18H5V4h2v3h10V4h2v16z',
};

window.addEventListener('DOMContentLoaded', () => {
  const titleEl = document.getElementById('perm-title');
  const descEl = document.getElementById('perm-desc');
  const iconSvg = document.getElementById('icon-svg');

  function applyRequest(req) {
    if (!req) return;
    if (titleEl && req.title) titleEl.textContent = req.title;
    if (descEl && req.desc) descEl.textContent = req.desc;
    if (iconSvg) {
      const pathData = ICON_PATHS[req.capability] || ICON_PATHS.media;
      while (iconSvg.firstChild) iconSvg.removeChild(iconSvg.firstChild);
      const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      pathEl.setAttribute('d', pathData);
      iconSvg.appendChild(pathEl);
    }
  }

  window.permissionDialogApi?.onRequestData(applyRequest);
  window.permissionDialogApi
    ?.getCurrentRequest()
    .then(applyRequest)
    .catch(() => {});

  document.getElementById('btn-allow')?.addEventListener('click', () => {
    window.permissionDialogApi?.respond(true);
  });
  document.getElementById('btn-block')?.addEventListener('click', () => {
    window.permissionDialogApi?.respond(false);
  });
  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    window.permissionDialogApi?.openSettings();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      window.permissionDialogApi?.respond(false);
    }
  });
});
