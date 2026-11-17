// Compare (split-screen) mode: a second, lightweight PDF pane next to the main
// viewer, so two different papers can be open side by side. Unlike viewer.js
// this pane has no zoom persistence, bookmarks, fullscreen or exam-lock — just
// a search picker, continuous-scroll pages and basic zoom in/out.
(() => {
  'use strict';
  const lib = window.pdfjsLib;
  const CFG = window.ICSE_CONFIG;
  const $ = (id) => document.getElementById(id);
  const el = {
    toggle: $('vCompare'), pane: $('vCmp'), close: $('cmpClose'), title: $('cmpTitle'),
    zoomGrp: $('cmpZoomGrp'), zin: $('cmpZin'), zout: $('cmpZout'), zoom: $('cmpZoom'),
    pick: $('cmpPick'), refs: $('cmpRefs'), search: $('cmpSearch'), results: $('cmpResults'),
    scroll: $('cmpScroll'), pages: $('cmpPages'), status: $('cmpStatus')
  };
  if (!el.toggle || !el.pane || !lib) return;

  const MIN_SCALE = 0.3, MAX_SCALE = 6;
  const App = () => window.App;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const S = { open: false, res: null, doc: null, task: null, pages: [], n: 0, scale: 1, base: 1, pw: 595, ratio: 1.414, io: null, token: 0, refs: [], refToken: 0 };

  /* ---------- open / close the pane ---------- */
  function openPane() {
    if (S.open) return;
    S.open = true;
    el.pane.hidden = false;
    el.toggle.setAttribute('aria-pressed', 'true');
    showPicker();
    el.search.value = '';
    renderResults('');
    renderRefs();
    requestAnimationFrame(() => el.search.focus({ preventScroll: true }));
  }

  function closePane() {
    if (!S.open) return;
    S.open = false;
    el.toggle.setAttribute('aria-pressed', 'false');
    teardown();
    el.pane.hidden = true;
  }

  function showPicker() {
    el.pick.hidden = false;
    el.scroll.hidden = true;
    el.zoomGrp.hidden = true;
    el.title.textContent = 'Compare';
  }

  /* ---------- gating: Compare only opens from an allowed source paper ---------- */
  // Which resource types may use Compare at all. Edit window.ICSE_CONFIG.compare.types in
  // config.js to allow more categories — nothing else here needs to change. The picker itself,
  // once open, is NOT restricted by this list — it can compare against any paper on the site.
  function allowedTypes() {
    const t = CFG && CFG.compare && CFG.compare.types;
    return Array.isArray(t) ? t : [];
  }

  function syncAvailability(res) {
    const ok = !!(res && allowedTypes().includes(res.type));
    el.toggle.hidden = !ok;
    S.refs = []; renderRefs();
    if (!ok) { closePane(); return; }
    // Scan the Question Bank's own text for figure placeholders, so Compare can offer a direct
    // jump to the source paper instead of making the user search for it by hand.
    const token = ++S.refToken;
    window.Viewer.ready(res.id).then((ready) => {
      if (!ready || token !== S.refToken || !window.Viewer.pdf()) return;
      scanFigureRefs(window.Viewer.pdf(), res).then((refs) => {
        if (token !== S.refToken) return;
        S.refs = refs;
        renderRefs();
      });
    });
  }

  // Finds every "[FIGURE: ...]" placeholder in a PDF's text and, from each, pulls out one or
  // more { desc, year, letter, q, code } references. A placeholder can name two source papers
  // at once ("2025S Q3(x) and 2026S Q3(x): ...") — each becomes its own entry. The curators
  // aren't fully consistent about where the reference sits (before or after the "paste from..."
  // clause, which itself isn't worded the same way every time) or whether a 3-digit subject code
  // is even included, so this doesn't anchor to a fixed phrase: it just looks for a year
  // (optionally followed directly by "S" for specimen) followed, somewhere after it, by a
  // "Q<number>" reference, anywhere inside the bracket. A missing subject code falls back to the
  // Question Bank's own subject, since these placeholders are almost always about that subject.
  async function scanFigureRefs(doc, bankRes) {
    const blockRe = /\[FIGURE:\s*([^\]]+)\]/gi;
    const refRe = /(\d{4})([A-Za-z])?\b[\s\S]*?\bQ(\d+(?:\([a-zA-Z]+\))?)/g;
    const fallbackCode = (bankRes && bankRes.codes && bankRes.codes[0]) || null;
    const out = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        const text = tc.items.map((it) => it.str).join(' ');
        let bm;
        blockRe.lastIndex = 0;
        while ((bm = blockRe.exec(text))) {
          const block = bm[1];
          const codeM = /\b(\d{3})\b/.exec(block);
          const code = codeM ? codeM[1] : fallbackCode;
          const desc = block.replace(/[—-]?\s*paste from[\s\S]*$/i, '').trim();
          refRe.lastIndex = 0;
          let rm, found = false;
          while ((rm = refRe.exec(block))) {
            found = true;
            out.push({ desc, year: +rm[1], letter: rm[2] ? rm[2].toUpperCase() : '', q: 'Q' + rm[3], code });
          }
          if (!found) out.push({ desc, year: null, letter: '', q: '', code });   // no ref found at all — still show it, unresolved
        }
      }
    } catch (e) { console.warn('Figure-reference scan failed', e); }
    return out;
  }

  function resolveRef(f) {
    if (!f.year || !f.code) return null;
    const typeMap = (CFG && CFG.compare && CFG.compare.refTypes) || {};
    const type = typeMap[f.letter];
    if (!type) return null;
    const list = (App() && App().all ? App().all() : []) || [];
    return list.find((r) => r.year === f.year && r.type === type && (r.codes || []).includes(f.code)) || null;
  }

  function renderRefs() {
    el.refs.textContent = '';
    if (!S.refs.length) { el.refs.hidden = true; return; }
    el.refs.hidden = false;
    const h = document.createElement('div'); h.className = 'v-cmp-refs-h'; h.textContent = 'Figures referenced in this paper';
    el.refs.appendChild(h);
    for (const f of S.refs) {
      const target = resolveRef(f);
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'v-cmp-result' + (target ? '' : ' v-cmp-ref-missing');
      const strong = document.createElement('b');
      strong.textContent = (f.q ? f.q + ' — ' : '') + f.desc;
      const span = document.createElement('span');
      span.textContent = target
        ? ('Jump to ' + target.title)
        : ('Source paper not in the library yet' + (f.year ? ' (' + f.year + f.letter + ' ' + (f.code || '?') + ' ' + f.q + ')' : ''));
      b.append(strong, span);
      if (target) b.addEventListener('click', () => loadInto(target));
      else b.disabled = true;
      el.refs.appendChild(b);
    }
  }

  /* ---------- picker ---------- */
  function renderResults(q) {
    const list = (App() && App().all ? App().all() : []) || [];
    const cur = window.Viewer ? (window.Viewer.current() || {}).id : null;
    const ql = q.trim().toLowerCase();
    const matches = list
      .filter((r) => r.id !== cur && (!ql || r._hay.includes(ql)))
      .slice(0, 25);
    el.results.textContent = '';
    if (!matches.length) {
      const p = document.createElement('p');
      p.className = 'v-cmp-empty';
      p.textContent = ql ? 'No matching papers.' : 'Type to search for a paper to compare.';
      el.results.appendChild(p);
      return;
    }
    for (const r of matches) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'v-cmp-result';
      const strong = document.createElement('b'); strong.textContent = r.title;
      const span = document.createElement('span'); span.textContent = [r.subject_name, r.type, r.year].filter(Boolean).join(' · ');
      b.append(strong, span);
      b.addEventListener('click', () => loadInto(r));
      el.results.appendChild(b);
    }
  }

  /* ---------- loading a paper into the pane ---------- */
  async function loadInto(res) {
    teardown();
    S.res = res;
    el.pick.hidden = true;
    el.scroll.hidden = false;
    el.zoomGrp.hidden = false;
    el.title.textContent = res.title;
    setStatus('loading', 'Loading');
    const token = ++S.token;
    try {
      const task = lib.getDocument({ url: res.file });
      S.task = task;
      const doc = await task.promise;
      if (token !== S.token) { doc.destroy(); return; }
      S.doc = doc; S.n = doc.numPages;
      const p1 = await doc.getPage(1);
      const v = p1.getViewport({ scale: 1 });
      S.pw = v.width; S.ratio = v.height / v.width;
      S.scale = fitScale(); S.base = S.scale;
      build();
      setStatus('');
    } catch (e) {
      if (token !== S.token) return;
      console.warn('Compare PDF load failed', e);
      setStatus('error');
    }
  }

  function fitScale() {
    const pad = innerWidth < 760 ? 12 : 24;
    const avail = Math.max(120, el.scroll.clientWidth - pad * 2);
    return Math.min(avail, 880) / S.pw;
  }

  /* ---------- layout + lazy rendering (mirrors viewer.js, without text layer) ---------- */
  function build() {
    el.pages.textContent = ''; S.pages = [];
    for (let i = 1; i <= S.n; i++) {
      const d = document.createElement('div');
      d.className = 'pg'; d.dataset.n = i;
      d.style.width = (S.pw * S.scale) + 'px';
      d.style.height = (S.pw * S.scale * S.ratio) + 'px';
      el.pages.appendChild(d); S.pages.push(d);
    }
    el.zoom.textContent = '100%';
    if (S.io) S.io.disconnect();
    S.io = new IntersectionObserver(onIntersect, { root: el.scroll, rootMargin: '120% 0px 120% 0px' });
    S.pages.forEach((p) => S.io.observe(p));
  }

  function onIntersect(entries) {
    for (const e of entries) { if (e.isIntersecting) renderPage(e.target); else release(e.target); }
  }

  function release(pg) {
    try { pg._task && pg._task.cancel(); } catch { /* already done */ }
    pg._rs = 0;
    const c = pg.querySelector('canvas');
    if (c) { c.width = c.height = 0; c.remove(); }
    pg.classList.remove('ready');
  }

  async function renderPage(pg) {
    const scale = S.scale, token = S.token;
    if (pg._rs === scale) return;
    try { pg._task && pg._task.cancel(); } catch { /* already done */ }
    try {
      const page = await S.doc.getPage(+pg.dataset.n);
      if (token !== S.token) return;
      const vp = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width * dpr); c.height = Math.floor(vp.height * dpr);
      const task = page.render({ canvasContext: c.getContext('2d', { alpha: false }), viewport: vp, transform: [dpr, 0, 0, dpr, 0, 0] });
      pg._task = task;
      await task.promise;
      if (token !== S.token || scale !== S.scale) return;
      pg.querySelectorAll('canvas').forEach((o) => o.remove());
      pg.appendChild(c);
      pg._rs = scale; pg.classList.add('ready');
    } catch (e) {
      if (!e || e.name !== 'RenderingCancelledException') console.warn('Compare render failed', e);
    }
  }

  function rezoom(mult) {
    if (!S.doc) return;
    S.scale = clamp(S.scale * mult, MIN_SCALE * S.base, MAX_SCALE * S.base);
    for (const p of S.pages) {
      p.style.width = (S.pw * S.scale) + 'px';
      p.style.height = (S.pw * S.scale * S.ratio) + 'px';
      p._rs = 0;
    }
    el.zoom.textContent = Math.round((S.scale / S.base) * 100) + '%';
    const sr = el.scroll.getBoundingClientRect();
    for (const p of S.pages) {
      const r = p.getBoundingClientRect();
      if (r.bottom > sr.top && r.top < sr.bottom) renderPage(p);
    }
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
      p.textContent = 'This PDF could not be loaded.';
      el.status.appendChild(p);
    }
  }

  function teardown() {
    S.token++;
    if (S.io) { S.io.disconnect(); S.io = null; }
    S.pages.forEach((p) => { try { p._task && p._task.cancel(); } catch { /* already done */ } });
    if (S.task) { try { S.task.destroy(); } catch { /* ignore */ } S.task = null; }
    S.doc = null; S.pages = []; S.n = 0; S.res = null;
    el.pages.textContent = '';
    el.status.textContent = '';
  }

  el.toggle.addEventListener('click', () => (S.open ? closePane() : openPane()));
  el.close.addEventListener('click', closePane);
  el.zin.addEventListener('click', () => rezoom(1.2));
  el.zout.addEventListener('click', () => rezoom(1 / 1.2));
  el.search.addEventListener('input', () => renderResults(el.search.value));
  addEventListener('viewer:close', closePane);   // main viewer closing takes the compare pane with it
  // Main viewer opened a (new) paper: show/hide the Compare button based on ITS type, and
  // drop any compare pane that was open for the previous paper.
  addEventListener('viewer:open', (e) => syncAvailability(e.detail));
})();