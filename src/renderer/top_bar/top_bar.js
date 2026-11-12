'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const topBar = document.getElementById('top-bar');
  const titleEl = document.getElementById('app-title');
  const maxBtn = document.getElementById('btn-max');
  const iconMax = document.getElementById('icon-max');

  document.getElementById('btn-menu')?.addEventListener('click', () => {
    window.topBarApi?.openMenu();
  });
  document.getElementById('btn-account')?.addEventListener('click', () => {
    window.topBarApi?.openAccountMenu();
  });
  document.getElementById('btn-min')?.addEventListener('click', () => {
    window.topBarApi?.minimize();
  });
  maxBtn?.addEventListener('click', () => {
    window.topBarApi?.toggleMaximize();
  });
  document.getElementById('btn-close')?.addEventListener('click', () => {
    window.topBarApi?.close();
  });

  topBar?.addEventListener('dblclick', (event) => {
    if (event.target.closest('button')) return;
    window.topBarApi?.toggleMaximize();
  });

  window.topBarApi?.onState((state) => {
    if (!state || typeof state !== 'object') return;
    if (typeof state.title === 'string' && titleEl) {
      titleEl.textContent = state.title;
    }
    document.body.classList.toggle('is-offline', Boolean(state.isOffline));
    document.body.classList.toggle('native-frame', state.frameStyle === 'native');

    const isMax = Boolean(state.isMaximized);
    if (maxBtn) {
      maxBtn.title = isMax ? 'Restore' : 'Maximize';
      maxBtn.setAttribute('aria-label', isMax ? 'Restore' : 'Maximize');
    }
    if (iconMax) {
      while (iconMax.firstChild) iconMax.removeChild(iconMax.firstChild);
      if (isMax) {
        const back = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        back.setAttribute('d', 'M8 7V5h11v11h-2');
        const front = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        front.setAttribute('x', '5');
        front.setAttribute('y', '8');
        front.setAttribute('width', '11');
        front.setAttribute('height', '11');
        front.setAttribute('rx', '1');
        iconMax.append(back, front);
      } else {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', '6');
        rect.setAttribute('y', '6');
        rect.setAttribute('width', '12');
        rect.setAttribute('height', '12');
        rect.setAttribute('rx', '1');
        iconMax.appendChild(rect);
      }
    }
  });
});
