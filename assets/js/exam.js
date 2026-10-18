// Timed exam mode: a countdown for papers, kept in the browser (no backend).
// The timing logic is at the top, with no DOM, so it can be tested in Node.
// The interface (start dialog, timer chip, banner, end screen) follows below.
//
// An exam is stored as timestamps (start, reading end, writing end), never as a ticking
// counter, so reloads, sleeping phones and background tabs cannot make the timer drift.
(function (root) {
  'use strict';
  const MIN = 60000;

  /* ================= timing logic ================= */
  // scale > 1 shortens every duration (debug only, see README "Testing the timer")
  function makeSession(res, o, now) {
    const scale = o.scale > 0 ? o.scale : 1;
    const readingMs = Math.max(0, Math.round((o.readingMin || 0) * MIN / scale));
    const writingMs = Math.max(Math.round(MIN / scale), Math.round(o.writingMin * MIN / scale));
    return {
      v: 1, id: res.id, title: res.title, startedAt: now, scale,
      readingMs, writingMs, readingEnd: now + readingMs, writingEnd: now + readingMs + writingMs
    };
  }

  // phase: reading | writing | done. left = ms left in the current phase.
  function status(s, now) {
    if (now < s.readingEnd) return { phase: 'reading', left: s.readingEnd - now, used: 0 };
    if (now < s.writingEnd) return { phase: 'writing', left: s.writingEnd - now, used: now - s.readingEnd };
    return { phase: 'done', left: 0, used: s.writingMs };
  }

  // Milestones passed between two moments: 'writing-start', 'left-30', 'left-10', 'left-5', 'left-1'
  function crossings(s, prev, now) {
    const out = [], sc = s.scale || 1;
    const hit = (t, key) => { if (prev < t && now >= t) out.push(key); };
    if (s.readingMs > 0) hit(s.readingEnd, 'writing-start');
    [30, 10, 5, 1].forEach((m) => { const ms = m * MIN / sc; if (ms < s.writingMs) hit(s.writingEnd - ms, 'left-' + m); });
    return out;
  }

  function fmt(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    const p = (n) => String(n).padStart(2, '0');
    return h ? h + ':' + p(m) + ':' + p(s) : p(m) + ':' + p(s);
  }
  function fmtDur(min) {
    const h = Math.floor(min / 60), m = min % 60;
    return h && m ? h + 'h ' + m + 'm' : h ? h + 'h' : m + 'm';
  }
  function defaultMinutes(res, c) { return (c.minutes && (c.minutes[res.subject] || c.minutes.default)) || 120; }
  function eligible(res, c) { return !!res && Array.isArray(c.types) && c.types.includes(res.type); }
  // Specimen papers from this year on carry the marking scheme at the end of the same PDF
  function hasScheme(res, c) { return res.type === 'Specimen Papers' && Number(res.year) >= (c.schemeFromYear || 9999); }

  // ----- marking scheme detection -----
  const SCHEME_WORDS = ['marking scheme', 'answer key', 'answer keys', 'marking guidelines'];
  function schemeRegex(words) {
    const esc = (w) => w.trim().split(/\s+/).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    return new RegExp('\\b(?:' + (words && words.length ? words : SCHEME_WORDS).map(esc).join('|') + ')\\b', 'i');
  }
  // First page (from page 2) whose opening text names the marking scheme, or 0 when there is none.
  // Page 1 is skipped because instructions there can mention it. Returns -1 if stale() turns true mid-scan.
  async function detectScheme(doc, words, stale) {
    const re = schemeRegex(words);
    for (let i = 2; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      if (stale && stale()) return -1;
      const head = tc.items.map((t) => t.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 500);
      if (re.test(head)) return i;
    }
    return 0;
  }

  const api = { MIN, makeSession, status, crossings, fmt, fmtDur, defaultMinutes, eligible, hasScheme, detectScheme, schemeRegex, SCHEME_WORDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  /* ================= interface ================= */
  const $ = (id) => document.getElementById(id);
  const el = {
    chip: $('xChip'), phase: $('xPhase'), time: $('xTime'), fin: $('xFinish'), start: $('vExam'),
    dlg: $('examDlg'), card: $('xCard'), banner: $('xBanner'), bText: $('xBannerText'), bA: $('xBannerA'), bB: $('xBannerB')
  };
  if (!el.card || !el.chip) return;

  const KEY = 'icse:exam:active';
  const CFG = () => (root.ICSE_CONFIG && root.ICSE_CONFIG.exam) || {};
  const baseTitle = document.title;
  const toast = (m) => { if (root.App && root.App.toast) root.App.toast(m); };
  const viewerRes = () => (root.Viewer && root.Viewer.current ? root.Viewer.current() : null);

  let S = null;        // the running exam, or null
  let away = null;     // an exam that ended while the paper was closed
  let timer = 0, last = 0, cancelFn = null, lastFocus = null, bannerMode = '', dlgToken = 0, lockSig = '';

  // If storage is unavailable (private mode) the exam still runs, it just cannot be resumed after a reload.
  function load() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return v && v.v === 1 && v.id && v.writingEnd ? v : null;
    } catch (e) { return null; }
  }
  function save() {
    try { S ? localStorage.setItem(KEY, JSON.stringify(S)) : localStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ }
  }
  function debugScale() {
    try { return Number(localStorage.getItem('icse:exam:speed')) || 1; } catch (e) { return 1; }
  }

  // Small DOM builder. Text is always set as text, never as HTML.
  function h(tag, props) {
    const n = document.createElement(tag);
    for (const k in (props || {})) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (let i = 2; i < arguments.length; i++) {
      const c = arguments[i];
      if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return n;
  }

  /* ---------- dialog ---------- */
  function openDialog(build, cancel) {
    const host = root.Viewer && root.Viewer.fullscreenHost ? root.Viewer.fullscreenHost() : document.body;
    if (el.dlg.parentNode !== host) host.appendChild(el.dlg);
    lastFocus = document.activeElement;
    dlgToken++;
    el.card.textContent = '';
    build(el.card);
    cancelFn = cancel || closeDialog;
    el.dlg.hidden = false;
    const f = el.card.querySelector('[data-first]') || el.card.querySelector('button, input');
    if (f) f.focus({ preventScroll: true });
  }
  function closeDialog() {
    el.dlg.hidden = true; el.card.textContent = ''; cancelFn = null;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }
  document.addEventListener('keydown', (e) => {
    if (el.dlg.hidden) return;
    // stopImmediatePropagation: the reader has its own Escape handler on the same target, which must not also run
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (cancelFn) cancelFn(); return; }
    if (e.key !== 'Tab') return;
    const f = [...el.card.querySelectorAll('button:not([disabled]), input:not([disabled])')];
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
    else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    else if (!el.card.contains(document.activeElement)) { e.preventDefault(); a.focus(); }
  }, true);

  const btn = (label, onclick, extra) => h('button', Object.assign({ type: 'button', class: 'btn', onclick }, extra || {}), label);
  const primary = (label, onclick, extra) => btn(label, onclick, Object.assign({ class: 'btn btn-primary' }, extra || {}));

  /* ---------- start ---------- */
  function prompt(res) {
    const c = CFG();
    if (!res || !eligible(res, c)) return;
    if (S) { toast(S.id === res.id ? 'Your exam is already running' : 'Finish your current exam first'); return; }
    let writing = defaultMinutes(res, c);
    const rm = c.readingMinutes || 0;
    let reading = rm > 0;
    const det = findScheme(res);   // scans the PDF while the dialog is open
    let mine = 0;
    openDialog((card) => {
      const input = h('input', { id: 'xMin', type: 'number', min: 5, max: 360, step: 5, value: writing, inputmode: 'numeric', 'aria-label': 'Writing time in minutes' });
      const sum = h('p', { class: 'x-sum' });
      const upd = () => {
        sum.textContent = 'Total time: ' + fmtDur(writing + (reading ? rm : 0)) +
          (reading ? ' (' + fmtDur(rm) + ' reading + ' + fmtDur(writing) + ' writing)' : '');
      };
      const set = (v) => { writing = Math.min(360, Math.max(5, Math.round(v) || writing)); input.value = writing; upd(); };
      input.addEventListener('change', () => set(parseInt(input.value, 10)));
      input.addEventListener('input', () => { const v = parseInt(input.value, 10); if (v >= 5 && v <= 360) { writing = v; upd(); } });
      upd();

      card.append(
        h('h3', { id: 'xTitle' }, 'Timed exam'),
        h('p', { class: 'nm' }, res.title),
        h('div', { class: 'x-row' },
          h('label', { for: 'xMin' }, 'Writing time'),
          h('span', { class: 'x-step' },
            h('button', { type: 'button', class: 'ib', 'aria-label': 'Less time', onclick: () => set(writing - 5) }, '\u2212'),
            input,
            h('button', { type: 'button', class: 'ib', 'aria-label': 'More time', onclick: () => set(writing + 5) }, '+'),
            h('span', { class: 'x-unit' }, 'min'))));
      if (rm > 0) {
        const chk = h('input', { type: 'checkbox', id: 'xRead' });
        chk.checked = true;
        chk.addEventListener('change', () => { reading = chk.checked; upd(); });
        card.append(h('div', { class: 'x-row' }, h('label', { class: 'x-check', for: 'xRead' }, chk, 'Add ' + rm + ' min reading time')));
      }
      card.append(sum);
      const note = h('p', { class: 'x-note' });
      if (hasScheme(res, c) && !Number.isInteger(res.msFrom)) note.textContent = 'Checking the file for a marking scheme\u2026';
      card.append(note);
      det.then((d) => {
        if (mine !== dlgToken || el.dlg.hidden) return;
        if (d.from >= 2) { note.className = 'x-note'; note.textContent = 'The marking scheme (from page ' + d.from + ') stays hidden until your exam ends.'; }
        else if (d.expected) { note.className = 'x-note warn'; note.textContent = 'No marking scheme was found in this file. If it has one at the end, avoid those pages until you finish.'; }
        else note.textContent = '';
      });
      const startBtn = primary('Start exam', async () => {
        startBtn.disabled = true; startBtn.textContent = 'Preparing\u2026';
        const d = await det;
        if (mine !== dlgToken || el.dlg.hidden) return;
        begin(res, writing, reading ? rm : 0, d.from >= 2 ? d.from : 0);
      }, { 'data-first': true });
      card.append(
        h('p', { class: 'x-note' }, 'The timer keeps running if you close the paper or this page. You can come back and resume.'),
        h('div', { class: 'dlg-acts' }, btn('Cancel', closeDialog), startBtn));
    });
    mine = dlgToken;
  }

  /* ---------- marking scheme: where it starts, and what to hide ---------- */
  const cacheKey = (id) => 'icse:scheme:' + id;
  const CACHE_V = 1;
  function readCache(id, total) {
    try { const v = JSON.parse(localStorage.getItem(cacheKey(id))); return v && v.v === CACHE_V && v.n === total && v.p >= 2 ? v.p : 0; } catch (e) { return 0; }
  }
  function writeCache(id, p, total) { try { localStorage.setItem(cacheKey(id), JSON.stringify({ v: CACHE_V, p, n: total })); } catch (e) { /* ignore */ } }

  // {from, expected}: from = first page of the scheme (0 = none found); expected = this paper should have one
  async function findScheme(res) {
    const c = CFG(), V = root.Viewer;
    if (Number.isInteger(res.msFrom)) return { from: res.msFrom, expected: false };   // set by hand in resources.json (0 = no scheme)
    if (!hasScheme(res, c)) return { from: 0, expected: false };
    const run = (async () => {
      if (!(V && V.ready && await V.ready(res.id))) return 0;
      const doc = V.pdf();
      const cached = readCache(res.id, doc.numPages);
      if (cached) return cached;
      const p = await detectScheme(doc, c.schemeWords, () => { const cur = viewerRes(); return !cur || cur.id !== res.id; });
      if (p >= 2) writeCache(res.id, p, doc.numPages);
      return Math.max(0, p);
    })().catch(() => 0);
    const from = await Promise.race([run, new Promise((r) => setTimeout(() => r(0), 8000))]);
    return { from, expected: true };
  }
  // Pages an exam in progress allows on this paper (0 = all of them)
  const lockPages = (res) => (S && res && S.id === res.id && S.lockFrom >= 2 ? S.lockFrom - 1 : 0);
  const locksDownload = (res) => !!(S && res && S.id === res.id && S.lockFrom >= 2);

  // Keeps the reader, the Download buttons and the library in line with the running exam
  function syncLock() {
    const V = root.Viewer, cur = viewerRes();
    const active = !!(S && S.lockFrom >= 2);
    document.documentElement.toggleAttribute('data-exam-lock', active && !!cur && cur.id === S.id);
    if (V && V.setLimit && V.unlock && cur) {   // an older viewer.js without these is simply left alone
      const want = lockPages(cur);
      if (want) V.setLimit(want); else V.unlock();
    }
    const sig = active ? S.id : '';
    if (sig !== lockSig) { lockSig = sig; root.dispatchEvent(new Event('exam:change')); }
  }

  function begin(res, writingMin, readingMin, lockFrom) {
    S = makeSession(res, { writingMin, readingMin, scale: debugScale() }, Date.now());
    S.lockFrom = lockFrom >= 2 ? lockFrom : 0;   // first page of the marking scheme, hidden until the exam ends
    away = null; last = 0;
    save(); closeDialog(); refresh();
    toast(readingMin ? 'Reading time started' : 'Exam started. Good luck!');
  }

  /* ---------- running ---------- */
  function tick() {
    if (!S) return;
    const now = Date.now(), st = status(S, now);
    if (st.phase === 'done') { end('timeup'); return; }
    const hits = last ? crossings(S, last, now) : [];
    if (hits.length) announce(hits[hits.length - 1]);   // after a long absence, only the latest milestone
    last = now;
    paint(st);
  }
  function announce(key) {
    const m = {
      'writing-start': 'Reading time is over. You can start writing.',
      'left-30': '30 minutes left', 'left-10': '10 minutes left', 'left-5': '5 minutes left', 'left-1': '1 minute left'
    }[key];
    if (m) toast(m);
  }
  function paint(st) {
    const sc = S.scale || 1;
    const t = fmt(st.left);
    el.phase.textContent = st.phase === 'reading' ? 'Reading' : 'Writing';
    el.time.textContent = t;
    el.chip.dataset.phase = st.phase;
    el.chip.dataset.warn = st.phase === 'writing' ? (st.left <= 5 * MIN / sc ? '2' : st.left <= 10 * MIN / sc ? '1' : '0') : '0';
    document.title = t + ' \u00b7 ' + baseTitle;
    if (!el.banner.hidden && bannerMode === 'run') el.bText.textContent = 'Exam in progress: ' + S.title + '. ' + t + ' left.';
  }

  function end(reason) {
    if (!S) return;
    const s = S, sc = s.scale || 1;
    const used = Math.min(s.writingMs, Math.max(0, Date.now() - s.readingEnd)) * sc;
    S = null; save(); refresh();
    if (reason === 'cancelled') { toast('Exam cancelled'); return; }
    showEnd(s, reason, used);
  }

  function showEnd(s, reason, usedMs) {
    const cur = viewerRes();
    if (!cur || cur.id !== s.id) {
      away = { id: s.id, title: s.title };
      banner();
      toast(reason === 'timeup' ? 'Time is up on ' + s.title : 'Exam finished');
      return;
    }
    const sc = s.scale || 1;
    openDialog((card) => {
      card.append(
        h('h3', { id: 'xTitle' }, reason === 'timeup' ? "Time's up" : 'Exam finished'),
        h('p', { class: 'nm' }, s.title),
        h('p', { class: 'x-note' }, reason === 'timeup'
          ? 'Put your pen down. You had ' + fmt(s.writingMs * sc) + ' of writing time.'
          : 'You used ' + fmt(usedMs) + ' of ' + fmt(s.writingMs * sc) + '.'),
        h('div', { class: 'dlg-acts' },
          s.lockFrom >= 2 ? primary('View marking scheme', () => { closeDialog(); if (root.Viewer) root.Viewer.goTo(s.lockFrom); }, { 'data-first': true }) : null,
          btn('Keep reading', closeDialog, s.lockFrom >= 2 ? null : { 'data-first': true }),
          btn('Close paper', () => { closeDialog(); if (root.App) root.App.closeReader(); }, s.lockFrom >= 2 ? null : { class: 'btn btn-primary' })));
    });
  }

  function finishDialog() {
    if (!S) return;
    const st = status(S, Date.now()), sc = S.scale || 1, reading = st.phase === 'reading';
    openDialog((card) => {
      card.append(
        h('h3', { id: 'xTitle' }, reading ? 'Cancel the exam?' : 'Finish the exam now?'),
        h('p', { class: 'x-note' }, reading
          ? 'You are still in reading time. Ending now cancels this attempt.'
          : 'You have used ' + fmt(st.used * sc) + ' of ' + fmt(S.writingMs * sc) + '.'),
        h('div', { class: 'dlg-acts' },
          btn('Keep going', closeDialog, { 'data-first': true }),
          primary(reading ? 'Cancel exam' : 'Finish', () => { closeDialog(); end(reading ? 'cancelled' : 'finished'); })));
    });
  }

  // Called before the reader closes. Returns true when it took over (a confirmation is showing).
  function confirmLeave(proceed) {
    const cur = viewerRes();
    if (!S || !cur || cur.id !== S.id || status(S, Date.now()).phase === 'done') return false;
    openDialog((card) => {
      card.append(
        h('h3', { id: 'xTitle' }, 'Leave the paper?'),
        h('p', { class: 'x-note' }, 'Your timer keeps running. Reopen the paper from the banner on the library page to carry on.'),
        h('div', { class: 'dlg-acts' },
          btn('Stay', closeDialog, { 'data-first': true }),
          primary('Leave', () => { closeDialog(); proceed(); })));
    });
    return true;
  }

  /* ---------- chip, button and banner ---------- */
  function banner() {
    const cur = viewerRes();
    let mode = '';
    if (S && (!cur || cur.id !== S.id)) mode = 'run';
    else if (!S && away) mode = 'away';
    bannerMode = mode;
    el.banner.hidden = !mode;
    if (mode === 'run') {
      el.bText.textContent = 'Exam in progress: ' + S.title + '. ' + fmt(status(S, Date.now()).left) + ' left.';
      el.bA.textContent = 'Resume'; el.bB.textContent = 'End exam';
    } else if (mode === 'away') {
      el.bText.textContent = 'Time is up on ' + away.title + '.';
      el.bA.textContent = 'Open paper'; el.bB.textContent = 'Dismiss';
    }
  }
  function resume(id) {
    const r = root.App && root.App.byId ? root.App.byId(id) : null;
    if (!r) { toast('That paper could not be found'); return; }
    root.App.openReader(r);
  }
  el.bA.addEventListener('click', () => {
    if (bannerMode === 'run') resume(S.id);
    else if (bannerMode === 'away') { const id = away.id; away = null; banner(); resume(id); }
  });
  el.bB.addEventListener('click', () => {
    if (bannerMode === 'run') finishDialog();
    else if (bannerMode === 'away') { away = null; banner(); }
  });

  function refresh() {
    const cur = viewerRes();
    el.chip.hidden = !(S && cur && cur.id === S.id);
    el.start.hidden = !(cur && !S && eligible(cur, CFG()));
    banner();
    syncLock();
    if (S && !timer) timer = setInterval(tick, 250);
    if (!S && timer) { clearInterval(timer); timer = 0; document.title = baseTitle; }
    if (S) tick();
  }

  el.start.addEventListener('click', () => { const r = viewerRes(); if (r) prompt(r); });
  el.fin.addEventListener('click', finishDialog);
  root.addEventListener('viewer:open', refresh);
  root.addEventListener('viewer:close', refresh);
  document.addEventListener('visibilitychange', tick);
  root.addEventListener('storage', (e) => { if (e.key === KEY) { S = load(); last = 0; refresh(); } });

  /* ---------- start up ---------- */
  S = load();
  if (S && status(S, Date.now()).phase === 'done') {   // ended while the page was closed
    away = { id: S.id, title: S.title };
    S = null; save();
  }
  refresh();

  root.Exam = Object.assign({}, api, {
    eligible: (r) => eligible(r, CFG()),
    hasScheme: (r) => hasScheme(r, CFG()),
    prompt, confirmLeave, lockPages, locksDownload,
    detect: (doc) => detectScheme(doc, CFG().schemeWords),   // console check: Exam.detect(await pdfjsLib.getDocument(url).promise)
    dialogOpen: () => !el.dlg.hidden,
    active: () => S
  });
})(typeof window !== 'undefined' ? window : globalThis);
