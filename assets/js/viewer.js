// PDF reader built on PDF.js: continuous scroll, lazy page rendering,
// zoom (buttons, keys, ctrl+wheel, pinch), fit-to-width, page jump,
// swipe between pages, fullscreen, and last-page memory.
(() => {
  'use strict';
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdf.worker.min.js';

  const $ = (id) => document.getElementById(id);
  const el = {
    root: $('viewer'), scroll: $('vScroll'), pages: $('vPages'), status: $('vStatus'),
    title: $('vTitle'), sub: $('vSub'), page: $('vPage'), total: $('vTotal'), zoom: $('vZoom'),
    prev: $('vPrev'), next: $('vNext'), zin: $('vZin'), zout: $('vZout'), fit: $('vFit'),
    full: $('vFull'), close: $('vClose'), save: $('vSave'), share: $('vShare'),
    report: $('vReport'), dl: $('vDl'), prog: $('vProg')
  };

  const MIN_SCALE = 0.3, MAX_SCALE = 6;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };

  const S = {
    res: null, doc: null, task: null, pages: [], n: 0, cur: 1, scale: 1, base: 1,
    pw: 595, ratio: 1.414, io: null, open: false, token: 0, fitMode: true,
    lastFocus: null, raf: 0, rerender: 0, saveTimer: 0, hideTimer: 0
  };
  const App = () => window.App;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- open / close ---------- */
  async function open(res, page) {
    if (S.open && S.res && S.res.id === res.id) { if (page) goTo(page, false); return; }
    clearTimeout(S.hideTimer);
    teardown();
    S.res = res; S.open = true; S.lastFocus = document.activeElement;
    window.dispatchEvent(new CustomEvent('viewer:open', { detail: res }));
    el.root.hidden = false;
    document.documentElement.classList.add('no-scroll');
    requestAnimationFrame(() => el.root.classList.add('on'));

    el.title.textContent = res.title;
    el.sub.textContent = [res.subject_name, res.type, res.year].filter(Boolean).join(', ');
    el.dl.href = res.file;
    el.dl.setAttribute('download', App().fileName(res));
    el.report.href = App().reportHref(res);
    el.page.value = '1'; el.total.textContent = '–'; el.prog.style.width = '0';
    syncSave();
    setStatus('loading', 'Loading');
    el.close.focus({ preventScroll: true });
    document.addEventListener('keydown', onKey, true);

    const token = ++S.token;
    try {
      const task = lib.getDocument({ url: res.file });
      S.task = task;
      task.onProgress = (p) => { if (token === S.token && p.total) setStatus('loading', 'Loading ' + Math.round((p.loaded / p.total) * 100) + '%'); };
      const doc = await task.promise;
      if (token !== S.token) { doc.destroy(); return; }
      S.doc = doc; S.n = doc.numPages;
      const p1 = await doc.getPage(1);
      const v = p1.getViewport({ scale: 1 });
      S.pw = v.width; S.ratio = v.height / v.width;
      el.total.textContent = S.n; el.page.max = S.n;
      S.fitMode = true;
      S.scale = fitScale(false); S.base = S.scale;
      build();
      setStatus('');
      const saved = store.get('icse:page:' + res.id, 1);
      const start = clamp(parseInt(page || saved, 10) || 1, 1, S.n);
      el.scroll.scrollTop = S.pages[start - 1].offsetTop - 8;
      S.cur = 0; setCur(start, true);
    } catch (err) {
      if (token !== S.token) return;
      console.warn('PDF load failed', err);
      setStatus('error');
    }
  }

  function close() {
    if (!S.open) return;
    S.open = false;
    flushPage();
    document.removeEventListener('keydown', onKey, true);
    if (document.fullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); }
    el.root.classList.remove('on');
    document.documentElement.classList.remove('no-scroll');
    teardown();
    S.hideTimer = setTimeout(() => { el.root.hidden = true; }, reduced ? 0 : 200);
    if (S.lastFocus && S.lastFocus.focus) S.lastFocus.focus({ preventScroll: true });
    S.res = null;
    window.dispatchEvent(new CustomEvent('viewer:close'));
  }

  function teardown() {
    S.token++;
    clearTimeout(S.rerender);
    S.pages.forEach((p) => { try { p._task && p._task.cancel(); } catch { /* already done */ } });
    if (S.io) { S.io.disconnect(); S.io = null; }
    if (S.task) { try { S.task.destroy(); } catch { /* ignore */ } S.task = null; }
    S.doc = null; S.pages = []; S.n = 0;
    el.pages.textContent = '';
    el.pages.style.transform = '';
  }

  function setStatus(kind, text) {
    el.status.textContent = '';
    if (!kind) return;
    if (kind === 'loading') {
      const s = document.createElement('div'); s.className = 'spin';
      const p = document.createElement('p'); p.textContent = text || 'Loading';
      el.status.append(s, p);
    } else {
      const p = document.createElement('p');
      p.textContent = 'This PDF could not be loaded. Check your connection, or download it instead.';
      const a = document.createElement('a');
      a.className = 'btn btn-primary'; a.href = S.res.file; a.setAttribute('download', App().fileName(S.res));
      a.textContent = 'Download PDF';
      a.addEventListener('click', () => App().download(S.res));
      el.status.append(p, a);
    }
  }

  /* ---------- layout + rendering ---------- */
  function fitScale(full) {
    const pad = innerWidth < 760 ? 12 : 32;
    const avail = Math.max(120, el.scroll.clientWidth - pad * 2);
    return (full ? avail : Math.min(avail, 880)) / S.pw;
  }

  function build() {
    el.pages.textContent = '';
    S.pages = [];
    for (let i = 1; i <= S.n; i++) {
      const d = document.createElement('div');
      d.className = 'pg'; d.dataset.n = i;
      el.pages.appendChild(d); S.pages.push(d);
    }
    layout();
    S.io = new IntersectionObserver(onIntersect, { root: el.scroll, rootMargin: '120% 0px 120% 0px' });
    S.pages.forEach((p) => S.io.observe(p));
  }

  function layout() {
    const w = S.pw * S.scale;
    for (const p of S.pages) {
      p.style.width = w + 'px';
      p.style.height = w * (p._ratio || S.ratio) + 'px';
    }
    el.zoom.textContent = Math.round((S.scale / S.base) * 100) + '%';
  }

  function onIntersect(entries) {
    for (const e of entries) {
      if (e.isIntersecting) renderPage(e.target);
      else release(e.target);
    }
  }

  function release(pg) {
    try { pg._task && pg._task.cancel(); } catch { /* ignore */ }
    pg._busy = 0; pg._rs = 0;
    const c = pg.querySelector('canvas');
    if (c) { c.width = c.height = 0; c.remove(); }
    pg.classList.remove('ready');
  }

  async function renderPage(pg) {
    const scale = S.scale, token = S.token;
    if (pg._rs === scale || pg._busy === scale) return;
    pg._busy = scale;
    try { pg._task && pg._task.cancel(); } catch { /* ignore */ }
    try {
      const page = await S.doc.getPage(+pg.dataset.n);
      if (token !== S.token) return;
      const v1 = page.getViewport({ scale: 1 });
      const vp = page.getViewport({ scale });
      let dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const px = vp.width * vp.height * dpr * dpr;
      if (px > 16e6) dpr *= Math.sqrt(16e6 / px);
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
      const task = page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] });
      pg._task = task;
      await task.promise;
      if (token !== S.token || scale !== S.scale) return;
      pg.querySelectorAll('canvas').forEach((o) => o.remove());
      pg.appendChild(c);
      pg._rs = scale; pg.classList.add('ready');
      const r = v1.height / v1.width;
      if (Math.abs(r - (pg._ratio || S.ratio)) > 0.002) { pg._ratio = r; pg.style.height = vp.width * r + 'px'; }
    } catch (e) {
      if (!e || e.name !== 'RenderingCancelledException') console.warn('Render failed', e);
    } finally {
      if (pg._busy === scale) pg._busy = 0;
    }
  }

  function rerenderSoon() {
    clearTimeout(S.rerender);
    S.rerender = setTimeout(() => {
      if (!S.io) return;
      S.pages.forEach((p) => { try { p._task && p._task.cancel(); } catch { /* ignore */ } p._busy = 0; });
      S.io.disconnect();
      S.pages.forEach((p) => S.io.observe(p));
    }, 150);
  }

  /* ---------- zoom / navigation ---------- */
  function setScale(next, fx, fy) {
    next = clamp(next, MIN_SCALE, MAX_SCALE);
    if (!S.doc || Math.abs(next - S.scale) < 1e-4) return;
    const sc = el.scroll;
    if (fx == null) fx = sc.clientWidth / 2;
    if (fy == null) fy = sc.clientHeight / 2;
    const cx = sc.scrollLeft + fx, cy = sc.scrollTop + fy, k = next / S.scale;
    S.scale = next; layout();
    sc.scrollLeft = cx * k - fx; sc.scrollTop = cy * k - fy;
    rerenderSoon();
  }
  const zoomBy = (f, fx, fy) => { S.fitMode = false; setScale(S.scale * f, fx, fy); };
  function fitWidth() { S.fitMode = true; setScale(fitScale(true)); el.scroll.scrollLeft = 0; }

  function goTo(n, smooth = true) {
    if (!S.pages.length) return;
    n = clamp(Math.round(n) || 1, 1, S.n);
    el.scroll.scrollTo({ top: S.pages[n - 1].offsetTop - 8, behavior: smooth && !reduced ? 'smooth' : 'auto' });
    setCur(n);
  }

  function setCur(n, force) {
    if (n === S.cur && !force) return;
    S.cur = n;
    if (document.activeElement !== el.page) el.page.value = n;
    el.prev.disabled = n <= 1; el.next.disabled = n >= S.n;
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(flushPage, 350);
  }
  function flushPage() {
    if (!S.res || !S.n) return;
    store.set('icse:page:' + S.res.id, S.cur);
    App().pageChanged && App().pageChanged(S.cur);
  }

  function updateCur() {
    const sc = el.scroll;
    const y = sc.scrollTop + sc.clientHeight * 0.3;
    let c = 1;
    for (let i = 0; i < S.pages.length; i++) { if (S.pages[i].offsetTop <= y) c = i + 1; else break; }
    if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 4) c = S.n;
    setCur(c);
    const max = sc.scrollHeight - sc.clientHeight;
    el.prog.style.width = (max > 0 ? (sc.scrollTop / max) * 100 : 0) + '%';
  }
  el.scroll.addEventListener('scroll', () => {
    if (S.raf || !S.pages.length) return;
    S.raf = requestAnimationFrame(() => { S.raf = 0; updateCur(); });
  }, { passive: true });

  /* ---------- fullscreen ---------- */
  const canFS = !!(el.root.requestFullscreen || el.root.webkitRequestFullscreen);
  if (!canFS) el.full.hidden = true;
  function toggleFS() {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.root.requestFullscreen || el.root.webkitRequestFullscreen).call(el.root);
  }
  function onFS() {
    const on = !!(document.fullscreenElement || document.webkitFullscreenElement);
    el.full.querySelector('use').setAttribute('href', on ? '#i-exit' : '#i-full');
    el.full.setAttribute('aria-label', on ? 'Exit fullscreen' : 'Fullscreen');
    if (S.open && S.fitMode) setTimeout(() => setScale(fitScale(false)), 60);
  }
  document.addEventListener('fullscreenchange', onFS);
  document.addEventListener('webkitfullscreenchange', onFS);

  /* ---------- keyboard ---------- */
  function onKey(e) {
    if (!S.open || App().shareOpen()) return;
    const typing = e.target === el.page;
    if (e.key === 'Escape') { if (document.fullscreenElement) return; e.preventDefault(); App().closeReader(); return; }
    if (e.key === 'Tab') { trap(e); return; }
    if (typing) { if (e.key === 'Enter') { goTo(parseInt(el.page.value, 10)); el.page.blur(); } return; }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'n': e.preventDefault(); goTo(S.cur + 1); break;
      case 'ArrowLeft': case 'p': e.preventDefault(); goTo(S.cur - 1); break;
      case 'Home': e.preventDefault(); goTo(1); break;
      case 'End': e.preventDefault(); goTo(S.n); break;
      case '+': case '=': e.preventDefault(); zoomBy(1.2); break;
      case '-': case '_': e.preventDefault(); zoomBy(1 / 1.2); break;
      case '0': e.preventDefault(); fitWidth(); break;
      case 'f': e.preventDefault(); toggleFS(); break;
      case 'g': e.preventDefault(); el.page.focus(); el.page.select(); break;
    }
  }
  function trap(e) {
    const f = [...el.root.querySelectorAll('button:not([disabled]),a[href],input')].filter((n) => n.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!el.root.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }

  /* ---------- pointer gestures: ctrl+wheel, pinch, swipe ---------- */
  el.scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = el.scroll.getBoundingClientRect();
    zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  let pinch = null, swipe = null;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.scroll.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      const r = el.scroll.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      pinch = { d: dist(e.touches), k: 1, mx, my };
      el.pages.style.transformOrigin = (el.scroll.scrollLeft + mx) + 'px ' + (el.scroll.scrollTop + my) + 'px';
      swipe = null;
    } else if (e.touches.length === 1 && !pinch) {
      swipe = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    } else swipe = null;
  }, { passive: true });

  el.scroll.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const lo = MIN_SCALE / S.scale, hi = MAX_SCALE / S.scale;
      pinch.k = clamp(dist(e.touches) / pinch.d, lo, hi);
      el.pages.style.transform = 'scale(' + pinch.k + ')';
    }
  }, { passive: false });

  const endTouch = (e) => {
    if (pinch && e.touches.length < 2) {
      const { k, mx, my } = pinch;
      pinch = null;
      el.pages.style.transform = ''; el.pages.style.transformOrigin = '';
      zoomBy(k, mx, my);
      swipe = null;
      return;
    }
    if (swipe && e.touches.length === 0 && e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y, dt = Date.now() - swipe.t;
      const wide = el.scroll.scrollWidth > el.scroll.clientWidth + 2;
      if (!wide && dt < 450 && Math.abs(dx) > 70 && Math.abs(dy) < 45) goTo(S.cur + (dx < 0 ? 1 : -1));
    }
    swipe = null;
  };
  el.scroll.addEventListener('touchend', endTouch, { passive: true });
  el.scroll.addEventListener('touchcancel', () => { if (pinch) { el.pages.style.transform = ''; pinch = null; } swipe = null; }, { passive: true });

  /* ---------- toolbar wiring ---------- */
  el.close.addEventListener('click', () => App().closeReader());
  el.prev.addEventListener('click', () => goTo(S.cur - 1));
  el.next.addEventListener('click', () => goTo(S.cur + 1));
  el.zin.addEventListener('click', () => zoomBy(1.2));
  el.zout.addEventListener('click', () => zoomBy(1 / 1.2));
  el.fit.addEventListener('click', fitWidth);
  el.full.addEventListener('click', toggleFS);
  el.page.addEventListener('focus', () => el.page.select());
  el.page.addEventListener('change', () => goTo(parseInt(el.page.value, 10)));
  el.save.addEventListener('click', () => { if (S.res) { App().toggleSave(S.res.id); syncSave(); } });
  el.share.addEventListener('click', () => S.res && App().share(S.res));
  el.dl.addEventListener('click', () => S.res && App().download(S.res));
  el.report.addEventListener('click', () => { /* mailto opens in a new tab */ });

  let rz = 0;
  addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => { if (S.open && S.doc && S.fitMode) setScale(fitScale(false)); }, 120);
  });

  function syncSave() {
    if (!S.res) return;
    const on = App().isSaved(S.res.id);
    el.save.classList.toggle('saved', on);
    el.save.setAttribute('aria-pressed', on);
    el.save.setAttribute('aria-label', on ? 'Remove bookmark' : 'Save to bookmarks');
  }

  window.Viewer = { open, close, goTo, syncSave, isOpen: () => S.open, current: () => S.res, fullscreenHost: () => document.fullscreenElement || document.body };
})();
