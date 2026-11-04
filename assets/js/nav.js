// Hamburger menu for small screens. On wide screens the top bar is unchanged and this does nothing.
// The links (About, Saved, History, Theme, and Admin for the admin) live in #navLinks; below 1000px they
// fold into a panel that the menu button opens.
(() => {
  'use strict';
  const nav = document.querySelector('.nav');
  const btn = document.getElementById('navToggle');
  const panel = document.getElementById('navLinks');
  if (!nav || !btn || !panel) return;

  const open = () => nav.classList.contains('nav-open');
  function set(on) {
    nav.classList.toggle('nav-open', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Close menu' : 'Open menu');
  }
  btn.addEventListener('click', () => set(!open()));

  // Close on: a tap outside, Escape, choosing a link/filter inside the panel, or growing the window past the breakpoint
  document.addEventListener('pointerdown', (e) => { if (open() && !panel.contains(e.target) && !btn.contains(e.target)) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open()) { set(false); btn.focus(); } });
  // On document in the capture phase: account.js stops some of these clicks (a guest tapping an empty Saved), and the panel should still close
  document.addEventListener('click', (e) => { if (open() && panel.contains(e.target) && e.target.closest('a, #savedBtn, #histBtn')) set(false); }, true);
  const mq = window.matchMedia('(min-width: 1001px)');
  const wide = () => { if (mq.matches) set(false); };
  if (mq.addEventListener) mq.addEventListener('change', wide); else if (mq.addListener) mq.addListener(wide);
})();
