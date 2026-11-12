'use strict';

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-back')?.addEventListener('click', () => {
    window.backBarApi?.goHome();
  });
});
