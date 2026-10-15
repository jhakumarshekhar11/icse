// Light / dark switch for the public pages. The first paint is handled by the small
// inline script in each page's <head>; this file only wires the button.
(() => {
  'use strict';
  const root = document.documentElement;
  const btn = document.getElementById('themeBtn');
  const meta = document.querySelector('meta[name="theme-color"]');
  function paint() {
    const light = root.dataset.theme === 'light';
    if (meta) meta.setAttribute('content', light ? '#ffffff' : '#000000');
    if (btn) {
      btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      btn.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    }
  }
  if (btn) btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    try { localStorage.setItem('icse:theme', next); } catch (e) { /* storage unavailable */ }
    paint();
  });
  paint();
})();