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
  function apply(next) {
    root.dataset.theme = next;
    try { localStorage.setItem('icse:theme', next); } catch (e) { /* storage unavailable */ }
    paint();
  }
  // The new theme is painted over the old one: light to dark sweeps from the top of the screen to the
  // bottom, dark to light sweeps from the bottom to the top.
  // Browsers without the View Transitions API (and people who prefer reduced motion) just switch.
  if (btn) btn.addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !still) {
      root.classList.add('theme-wiping');
      root.classList.toggle('theme-wipe-up', next === 'light');
      const t = document.startViewTransition(() => apply(next));
      t.finished.finally(() => root.classList.remove('theme-wiping', 'theme-wipe-up'));
    } else {
      apply(next);
    }
  });

  // Until the visitor picks a theme themselves, follow the device setting live
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: light)') : null;
  if (mq && mq.addEventListener) mq.addEventListener('change', (e) => {
    let saved = null;
    try { saved = localStorage.getItem('icse:theme'); } catch (err) { /* ignore */ }
    if (saved === 'light' || saved === 'dark') return;
    root.dataset.theme = e.matches ? 'light' : 'dark';
    paint();
  });
  paint();
})();
