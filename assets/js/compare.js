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
    toggle: $('vCompare'), body: $('vBody'), resizer: $('vResizer'), pane: $('vCmp'), close: $('cmpClose'), layout: $('cmpLayout'), title: $('cmpTitle'),
    zoomGrp: $('cmpZoomGrp'), zin: $('cmpZin'), zout: $('cmpZout'), zoom: $('cmpZoom'),
    pick: $('cmpPick'), refs: $('cmpRefs'), search: $('cmpSearch'), results: $('cmpResults'),
    scroll: $('cmpScroll'), pages: $('cmpPages'), status: $('cmpStatus')
  };
  if (!el.toggle || !el.pane || !lib) return;

  const MIN_SCALE = 0.3, MAX_SCALE = 6;
  const App = () => window.App;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const S = { open: false, res: null, doc: null, task: null, pages: [], n: 0, scale: 1, base: 1, pw: 595, ratio: 1.414, io: null, token: 0, refs: [], refToken: 0 };

  /* ---------- layout: beside (default) or below, remembered across visits ---------- */
  function applyLayout(stacked) {
    el.body.classList.toggle('stacked', stacked);
    el.layout.setAttribute('aria-pressed', String(stacked));
    const label = stacked ? 'Open beside instead of below' : 'Open below instead of beside';
    el.layout.title = label;
    el.layout.setAttribute('aria-label', label);
  }
  let stackedPref = false;
  try { stackedPref = localStorage.getItem('icseCompareLayout') === 'stacked'; } catch { /* storage unavailable */ }
  applyLayout(stackedPref);
  el.layout.addEventListener('click', () => {
    const next = !el.body.classList.contains('stacked');
    applyLayout(next);
    try { localStorage.setItem('icseCompareLayout', next ? 'stacked' : 'side'); } catch { /* storage unavailable */ }
  });

  /* ---------- open / close the pane ---------- */
  function openPane() {
    if (S.open) return;
    S.open = true;
    el.pane.hidden = false;
    el.resizer.hidden = false;
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
    el.resizer.hidden = true;
    el.pane.style.flex = '';   // reset to 50/50 for next time
  }

  /* ---------- dragging the divider ---------- */
  let dragging = false, dragVertical = false;

  function isVertical() { return el.body.classList.contains('stacked') || innerWidth <= 900; }

  function pctFor(clientPos) {
    const rect = el.body.getBoundingClientRect();
    const total = dragVertical ? rect.height : rect.width;
    const pos = dragVertical ? (clientPos - rect.top) : (clientPos - rect.left);
    return clamp(100 - (pos / total) * 100, 20, 80);   // % of v-body given to the compare pane
  }

  function onDragMove(e) {
    if (!dragging) return;
    const pos = dragVertical ? e.clientY : e.clientX;
    el.pane.style.flex = '0 0 ' + pctFor(pos).toFixed(2) + '%';
    e.preventDefault();
  }

  function onDragEnd() {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = '';
    removeEventListener('pointermove', onDragMove);
    removeEventListener('pointerup', onDragEnd);
    refit();
  }

  el.resizer.addEventListener('pointerdown', (e) => {
    dragging = true;
    dragVertical = isVertical();
    document.body.style.cursor = dragVertical ? 'row-resize' : 'col-resize';
    try { el.resizer.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    addEventListener('pointermove', onDragMove);
    addEventListener('pointerup', onDragEnd);
    e.preventDefault();
  });
  el.resizer.addEventListener('dblclick', () => { el.pane.style.flex = ''; refit(); });
  el.resizer.addEventListener('keydown', (e) => {
    const v = isVertical();
    const grow = (v && e.key === 'ArrowUp') || (!v && e.key === 'ArrowLeft');
    const shrink = (v && e.key === 'ArrowDown') || (!v && e.key === 'ArrowRight');
    if (!grow && !shrink) return;
    e.preventDefault();
    const rect = el.pane.getBoundingClientRect(), bodyRect = el.body.getBoundingClientRect();
    const total = v ? bodyRect.height : bodyRect.width;
    const current = v ? rect.height : rect.width;
    const pct = clamp((current / total) * 100 + (grow ? 5 : -5), 20, 80);
    el.pane.style.flex = '0 0 ' + pct.toFixed(2) + '%';
    refit();
  });

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
          // The actual question wording usually sits right before "[FIGURE: ...]" in the Bank's
          // own text, copied near-verbatim from the source paper — a much stronger clue to the
          // right PAGE than the question number alone. Grab a chunk of it.
          const context = text.slice(Math.max(0, bm.index - 200), bm.index).trim();
          refRe.lastIndex = 0;
          let rm, found = false;
          while ((rm = refRe.exec(block))) {
            found = true;
            out.push({ desc, year: +rm[1], letter: rm[2] ? rm[2].toUpperCase() : '', q: 'Q' + rm[3], code, context });
          }
          if (!found) out.push({ desc, year: null, letter: '', q: '', code, context });   // no ref found at all — still show it, unresolved
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
      if (target) b.addEventListener('click', () => loadInto(target, f.q, f.context));
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
  // qRef (e.g. "Q1(v)") and context (the Bank's own text just before the figure placeholder)
  // are both optional: when given, the pane jumps to the page that looks like it holds that
  // question once the paper's loaded.
  async function loadInto(res, qRef, context) {
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
      if (qRef || context) {
        locateQuestionPage(doc, qRef, context).then((n) => {
          if (token === S.token && n) gotoPage(n);
        });
      }
    } catch (e) {
      if (token !== S.token) return;
      console.warn('Compare PDF load failed', e);
      setStatus('error');
    }
  }

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  // Best-effort page finder, strongest signal first:
  //  1. The Bank's own wording right before the figure placeholder, which is usually copied
  //     near-verbatim from the source paper — far more specific than a bare question number,
  //     and not fooled by some unrelated earlier question that happens to also be numbered "1."
  //  2. If that text doesn't line up closely enough with any page (paraphrased, reformatted,
  //     OCR noise...), fall back to a bare question-number marker: "Question <n>", "Q<n>", or a
  //     standalone "<n>." not glued to another digit and not a mark allocation like "(1)".
  // Either way this only finds the PAGE for the main question number, not the exact line for a
  // lettered/numbered sub-part inside it — that's a much less reliable thing to pattern-match.
  async function locateQuestionPage(doc, qRef, context) {
    const pages = [];
    try {
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const tc = await page.getTextContent();
        pages.push(tc.items.map((it) => it.str).join(' '));
      }
    } catch (e) { console.warn('Question-page lookup failed', e); return null; }

    const ctxWords = norm(context).split(' ').filter((w) => w.length >= 4);
    if (ctxWords.length >= 6) {
      const tail = norm(context).slice(-120);   // closest text to the figure, most likely shared wording
      let best = -1, bestScore = 0;
      for (let i = 0; i < pages.length; i++) {
        const hay = norm(pages[i]);
        if (tail.length > 20 && hay.includes(tail)) return i + 1;   // close to exact — good enough, stop
        const have = new Set(hay.split(' '));
        const score = ctxWords.reduce((n, w) => n + (have.has(w) ? 1 : 0), 0);
        if (score > bestScore) { bestScore = score; best = i; }
      }
      if (best >= 0 && bestScore >= Math.min(6, Math.ceil(ctxWords.length * 0.6))) return best + 1;
    }

    const m = /Q\.?\s*(\d+)/i.exec(String(qRef || ''));
    if (!m) return null;
    const num = m[1];
    const re = new RegExp('(?:\\bQuestion\\s+' + num + '\\b|\\bQ\\.?\\s*' + num + '\\b|(?<![\\d(])\\b' + num + '\\.(?!\\d))', 'i');
    for (let i = 0; i < pages.length; i++) if (re.test(pages[i])) return i + 1;
    return null;
  }

  function gotoPage(n) {
    const pg = S.pages[clamp(n, 1, S.n) - 1];
    if (pg) pg.scrollIntoView({ block: 'start' });
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

  // fx/fy (optional, in el.scroll's own coordinates) are the point to zoom AROUND — the
  // cursor position for ctrl+wheel, the pinch midpoint for touch — so that point stays put
  // instead of the view jumping. Omit them to just zoom on the centre, as the +/- buttons do.
  function setScale(newScale, fx, fy) {
    if (!S.doc) return;
    const next = clamp(newScale, MIN_SCALE * S.base, MAX_SCALE * S.base);
    if (Math.abs(next - S.scale) < 1e-4) return;
    const sc = el.scroll;
    if (fx == null) fx = sc.clientWidth / 2;
    if (fy == null) fy = sc.clientHeight / 2;
    const cx = sc.scrollLeft + fx, cy = sc.scrollTop + fy, k = next / S.scale;
    S.scale = next;
    for (const p of S.pages) {
      p.style.width = (S.pw * S.scale) + 'px';
      p.style.height = (S.pw * S.scale * S.ratio) + 'px';
      p._rs = 0;
    }
    el.zoom.textContent = Math.round((S.scale / S.base) * 100) + '%';
    sc.scrollLeft = cx * k - fx;
    sc.scrollTop = cy * k - fy;
    const sr = sc.getBoundingClientRect();
    for (const p of S.pages) {
      const r = p.getBoundingClientRect();
      if (r.bottom > sr.top && r.top < sr.bottom) renderPage(p);
    }
  }

  function rezoom(mult, fx, fy) { setScale(S.scale * mult, fx, fy); }

  /* ---------- zoom via ctrl/cmd+wheel, pinch, and keyboard (mirrors the main viewer) ---------- */
  el.scroll.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !S.doc) return;
    e.preventDefault();
    const r = el.scroll.getBoundingClientRect();
    rezoom(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  let pinch = null;
  const pinchDist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  el.scroll.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2 && S.doc) {
      const r = el.scroll.getBoundingClientRect();
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
      const my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - r.top;
      pinch = { d: pinchDist(e.touches), k: 1, mx, my };
      el.pages.style.transformOrigin = (el.scroll.scrollLeft + mx) + 'px ' + (el.scroll.scrollTop + my) + 'px';
    }
  }, { passive: true });
  el.scroll.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const lo = (MIN_SCALE * S.base) / S.scale, hi = (MAX_SCALE * S.base) / S.scale;
      pinch.k = clamp(pinchDist(e.touches) / pinch.d, lo, hi);
      el.pages.style.transform = 'scale(' + pinch.k + ')';
    }
  }, { passive: false });
  const endPinch = (e) => {
    if (pinch && e.touches.length < 2) {
      const { k, mx, my } = pinch;
      pinch = null;
      el.pages.style.transform = ''; el.pages.style.transformOrigin = '';
      rezoom(k, mx, my);
    }
  };
  el.scroll.addEventListener('touchend', endPinch, { passive: true });
  el.scroll.addEventListener('touchcancel', () => { if (pinch) { el.pages.style.transform = ''; pinch = null; } }, { passive: true });

  // +/- only zooms the compare pane while the pointer is actually over it — otherwise the main
  // viewer's own (document-level, capturing) +/- shortcut would also try to fire on the same
  // keypress. stopPropagation here, from a listener registered on window in the capture phase
  // (so it runs before that document-level one), is what keeps the two from fighting.
  let hoverCompare = false;
  el.scroll.addEventListener('pointerenter', () => { hoverCompare = true; });
  el.scroll.addEventListener('pointerleave', () => { hoverCompare = false; });
  window.addEventListener('keydown', (e) => {
    if (!S.open || !hoverCompare || !S.doc) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = document.activeElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); e.stopPropagation(); rezoom(1.2); }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); e.stopPropagation(); rezoom(1 / 1.2); }
  }, true);

  // Called after the divider is dragged: the pane's own width/height just changed, so its
  // "fit the pane" scale has too. If the reader was sitting at that auto-fit scale (i.e. the
  // user hadn't manually zoomed), follow the resize and refit; if they'd deliberately zoomed
  // in/out, leave their chosen scale alone and just move the min/max zoom range's baseline.
  function refit() {
    if (!S.doc) return;
    const wasAtFit = Math.abs(S.scale - S.base) < 0.01;
    S.base = fitScale();
    if (wasAtFit) setScale(S.base);
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