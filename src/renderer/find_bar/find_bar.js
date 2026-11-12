'use strict';

window.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('input');
  const count = document.getElementById('count');
  const prevBtn = document.getElementById('prev');
  const nextBtn = document.getElementById('next');
  const closeBtn = document.getElementById('close');
  if (!input || !count || !prevBtn || !nextBtn || !closeBtn) return;

  let debounceTimer = null;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const query = input.value;
    if (!query) {
      count.textContent = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      window.findBarApi?.clear();
      return;
    }
    debounceTimer = setTimeout(() => {
      window.findBarApi?.search(query);
    }, 90);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      if (event.shiftKey) {
        window.findBarApi?.prev();
      } else {
        window.findBarApi?.next();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      window.findBarApi?.close();
    }
  });

  prevBtn.addEventListener('click', () => window.findBarApi?.prev());
  nextBtn.addEventListener('click', () => window.findBarApi?.next());
  closeBtn.addEventListener('click', () => window.findBarApi?.close());

  window.findBarApi?.onResult((res) => {
    const hasMatches = Boolean(res && res.matches > 0);
    prevBtn.disabled = !hasMatches;
    nextBtn.disabled = !hasMatches;
    if (!input.value) {
      count.textContent = '';
      return;
    }
    const ordinal = res?.activeMatchOrdinal ?? 0;
    const total = res?.matches ?? 0;
    count.textContent = `${ordinal}/${total}`;
  });

  window.findBarApi?.onFocus(() => {
    input.focus();
    input.select();
    if (input.value) {
      window.findBarApi?.search(input.value);
    }
  });
});
