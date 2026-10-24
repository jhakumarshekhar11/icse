// "Back to top" button for every page except the library (index.html), which has its own version in app.js
// that waits for the end of the resource list. Here the button shows once the visitor has scrolled down
// a fair way on a page that is longer than about a screen and a half.
(function () {
  'use strict';
  if (document.getElementById('toTop')) return;   // the library page already has one

  var btn = document.createElement('button');
  btn.type = 'button'; btn.id = 'toTop';
  btn.className = 'pill glass to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.setAttribute('aria-hidden', 'true');
  btn.tabIndex = -1;
  btn.innerHTML = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg><span>Back to top</span>';
  document.body.appendChild(btn);

  var shown = false, raf = 0;
  function set(on) {
    if (on === shown) return;
    shown = on;
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-hidden', on ? 'false' : 'true');
    btn.tabIndex = on ? 0 : -1;
    document.body.classList.toggle('to-top-on', on);
  }
  function check() {
    raf = 0;
    var vh = window.innerHeight, h = document.documentElement.scrollHeight;
    set(h > vh * 1.5 && window.scrollY > vh * 0.75);
  }
  function queue() { if (!raf) raf = requestAnimationFrame(check); }
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  // Pages that fill in later (the admin lists, for example) change the page height
  if (window.ResizeObserver) new ResizeObserver(queue).observe(document.body);
  btn.addEventListener('click', function () {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
  });
  queue();
})();
