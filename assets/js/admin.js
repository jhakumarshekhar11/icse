// Admin console: sign in with a GitHub token, upload and manage resources.
// Every change is one commit to the repository, made through admin-gh.js.
(() => {
  'use strict';
  const AC = window.ADMIN_CONFIG, GH = window.GH, CFG = window.ICSE_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const icon = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const today = () => new Date().toLocaleDateString('en-CA');
  const fmtDate = (d) => { const x = new Date(String(d).length === 10 ? d + 'T00:00:00' : d); return isNaN(x) ? '–' : x.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const fmtSize = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : Math.round(kb) + ' KB');
  const fmtCount = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
  function ago(iso) {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
    return fmtDate(iso);
  }
  const PALETTE = ['#7aa2ff', '#5eead4', '#f0abfc', '#86efac', '#fcd34d', '#fdba74', '#67e8f9', '#fda4af', '#c4b5fd', '#f9a8d4'];

  const state = {
    user: null, data: { subjects: [], types: [], resources: [] }, live: {}, headMsg: '',
    sort: { key: 'updated', dir: -1 }, filters: { q: '', subject: '', type: '', year: '', status: '' },
    selected: new Set(), tab: 'upload', last: Date.now(), tax: null, editor: null, urls: []
  };
  const subj = (id) => state.data.subjects.find((s) => s.id === id);
  // Timed exam helpers. The reading logic is shared with the public site (exam.js exposes it as ExamCore).
  const X = () => window.ExamCore || null;
  const examCfg = () => (X() ? X().mergeConfig(CFG.exam || {}, state.data.examDefaults) : (CFG.exam || {}));
  const isPaperType = (t) => !!t && Array.isArray((CFG.exam || {}).types) && CFG.exam.types.includes(t);
  const MIN_OK = (n) => Number.isInteger(n) && n >= 20 && n <= 300;
  const MARKS_OK = (n) => Number.isInteger(n) && n >= 10 && n <= 200;
  const fmtMins = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '') : m + 'm');
  const codeText = (s) => [s.code, s.altCode].filter(Boolean).join(', ');
  const dlTotal = (r) => (r.downloads || 0) + (state.live[r.id] || 0);

  /* ---------- toasts, dialogs ---------- */
  function toast(msg) {
    const host = $('#toasts');
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
    host.appendChild(t); setTimeout(() => t.remove(), 3200);
  }

  const modals = [];
  function modal(html, { cls = '', closable = true, scroll = false } = {}) {
    const dlg = document.createElement('div');
    dlg.className = 'dlg' + (scroll ? ' scroll' : ''); dlg.setAttribute('role', 'dialog'); dlg.setAttribute('aria-modal', 'true');
    dlg.innerHTML = `<div class="dlg-card glass ${cls}">${html}</div>`;
    document.body.appendChild(dlg);
    const m = { el: dlg, card: dlg.firstElementChild, closable, onClose: null };
    m.close = () => {
      const i = modals.indexOf(m); if (i < 0) return;
      modals.splice(i, 1); dlg.remove();
      if (m.onClose) m.onClose();
      if (m.prev && m.prev.focus && document.contains(m.prev)) m.prev.focus({ preventScroll: true });
    };
    m.prev = document.activeElement;
    if (closable) dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) m.close(); });
    modals.push(m);
    const f = dlg.querySelector('[autofocus],input,select,textarea,button,a[href]');
    if (f) f.focus({ preventScroll: true });
    return m;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !modals.length || (window.Viewer && Viewer.isOpen())) return;
    const top = modals[modals.length - 1];
    if (top.closable) { e.preventDefault(); top.close(); }
  });

  function confirmDialog({ title, body, ok = 'Confirm', danger = false, cancel = 'Cancel' }) {
    return new Promise((resolve) => {
      let answer = false;
      const m = modal(`<h3>${esc(title)}</h3><div class="body">${body || ''}</div>
        <div class="row-acts"><button class="btn" data-no type="button">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'btn-primary'}" data-yes type="button" autofocus>${esc(ok)}</button></div>`, { cls: 'mid' });
      m.onClose = () => resolve(answer);
      m.card.querySelector('[data-no]').onclick = () => m.close();
      m.card.querySelector('[data-yes]').onclick = () => { answer = true; m.close(); };
    });
  }
  function showError(err) {
    console.error(err);
    const msg = err && err.message ? err.message : String(err);
    const m = modal(`<h3>That did not work</h3><p>${esc(msg)}</p><div class="row-acts"><button class="btn btn-primary" type="button" autofocus>OK</button></div>`, { cls: 'mid' });
    m.card.querySelector('button').onclick = () => m.close();
  }
  async function withBusy(title, fn) {
    const m = modal(`<div class="busy"><div class="spin"></div><div><b>${esc(title)}</b><span data-step>Starting</span></div></div>`, { cls: 'mid', closable: false });
    const step = (t) => { const s = m.card.querySelector('[data-step]'); if (s) s.textContent = t; };
    try { return await fn(step); } finally { m.close(); }
  }
  function doneDialog({ title, body, url, again }) {
    const m = modal(`<div class="done">${icon('check')}</div><h3 style="margin-top:8px">${esc(title)}</h3><p>${body}</p>
      <div class="row-acts">${url ? `<a class="btn" href="${esc(url)}" target="_blank" rel="noopener">View commit</a>` : ''}${again ? `<button class="btn btn-primary" data-again type="button">${esc(again)}</button>` : '<button class="btn btn-primary" data-ok type="button">Done</button>'}</div>`, { cls: 'mid' });
    const b = m.card.querySelector('[data-again],[data-ok]'); b.onclick = () => m.close(); b.focus();
    return m;
  }

  /* ---------- session ---------- */
  const SS = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch { /* ignore */ } }
  };
  let lastSaved = 0;
  const touch = () => { state.last = Date.now(); if (state.last - lastSaved > 5000) { lastSaved = state.last; SS.set('icse:adm:last', String(state.last)); } };
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, touch, { passive: true, capture: true }));
  setInterval(() => {
    if (!state.user) return;
    if (Date.now() - state.last > AC.idleMinutes * 60000) signOut('You were signed out after ' + AC.idleMinutes + ' minutes of inactivity.');
  }, 10000);

  function showLogin(msg) {
    $('#console').hidden = true; $('#login').hidden = false;
    const e = $('#loginErr'); e.hidden = !msg; e.textContent = msg || '';
    $('#tokenIn').value = ''; $('#tokenIn').focus();
  }
  function signOut(msg) {
    GH.signOut(); SS.del('icse:adm:t'); SS.del('icse:adm:last');
    state.user = null; state.selected.clear();
    while (modals.length) modals[modals.length - 1].close();
    if (window.Viewer && Viewer.isOpen()) Viewer.close();
    if (state.editor) { state.editor.destroy(); state.editor = null; }
    state.urls.forEach((u) => URL.revokeObjectURL(u)); state.urls = [];
    showLogin(msg);
  }

  async function signIn(token) {
    const { user } = await GH.verify(token);
    state.user = user; SS.set('icse:adm:t', token); touch();
    $('#who').textContent = 'Signed in as ' + user.login;
    $('#login').hidden = true; $('#console').hidden = false;
    await reload();
    mountUpload();
    show('upload');
    loadCounts(); refreshHead();
  }

  /* ---------- data ---------- */
  async function reload() {
    const { data } = await GH.readJson();
    state.data = data; renderAll();
  }
  async function loadCounts() {
    const c = CFG.counter; if (!c || !c.enabled) return;
    let cache = null; try { cache = JSON.parse(localStorage.getItem('icse:counts')); } catch { /* none */ }
    if (cache && Date.now() - cache.t < 6e5) { state.live = cache.v; renderLibrary(); return; }
    const v = {};
    await Promise.allSettled(state.data.resources.map(async (r) => {
      const res = await fetch(`${c.baseUrl}/get/${c.namespace}/${encodeURIComponent(r.id)}`);
      if (res.ok) { const j = await res.json(); v[r.id] = Number(j.value) || 0; }
    }));
    if (Object.keys(v).length) { state.live = v; try { localStorage.setItem('icse:counts', JSON.stringify({ t: Date.now(), v })); } catch { /* ignore */ } }
    renderLibrary();
  }
  async function refreshHead() {
    try {
      const h = await GH.history(1);
      state.headMsg = h[0] ? h[0].message.split('\n')[0] : '';
    } catch { state.headMsg = ''; }
    const b = $('#undoBtn'), ok = state.headMsg.startsWith(AC.commitPrefix);
    b.disabled = !ok;
    b.title = ok ? 'Undo: ' + state.headMsg.replace(AC.commitPrefix, '').trim() : 'The latest commit was not made by this page';
  }

  const ORDER = ['id', 'title', 'subject', 'class', 'type', 'year', 'file', 'pages', 'size_kb', 'added', 'updated', 'downloads', 'popular', 'draft', 'rev', 'description', 'tags', 'minutes', 'marks', 'msFrom'];
  function tidy(r) {
    const o = {};
    ORDER.forEach((k) => {
      let v = r[k];
      if ((k === 'popular' || k === 'draft') && !v) return;
      if ((k === 'pages' || k === 'size_kb' || k === 'updated') && !v) return;
      if (k === 'rev' && !(v > 1)) return;
      if (k === 'downloads') v = v || 0;
      if (k === 'description') v = v || '';
      if (k === 'tags') v = v || [];
      if (k === 'class') v = v || 'X';
      if (v === undefined) return;
      o[k] = v;
    });
    Object.keys(r).forEach((k) => { if (!(k in o) && !ORDER.includes(k) && !k.startsWith('_') && k !== 'subject_name' && k !== 'accent') o[k] = r[k]; });
    return o;
  }

  // Re-reads the newest list from GitHub, applies the change to it, and commits.
  async function commitMutation(message, mutate, { upserts = [], deletes = [] } = {}, step = () => {}) {
    step('Reading the latest list');
    const { data } = await GH.readJson();
    const next = mutate(structuredClone(data));
    next.resources = next.resources.map(tidy);
    const text = JSON.stringify(next, null, 2) + '\n';
    const c = await GH.commit({
      message: `${AC.commitPrefix} ${message}`,
      upserts: upserts.concat([{ path: GH.repoPath(AC.dataPath), text }]),
      deletes, onStep: step
    });
    state.data = next; state.headMsg = `${AC.commitPrefix} ${message}`;
    renderAll(); refreshHead();
    return c;
  }
  const filePath = (r) => GH.repoPath(String(r.file).replace(/^\//, ''));

  /* ---------- guess from file name ---------- */
  // Words that point to a subject. Subject ids and name words are always tried as well.
  const ALIAS = {
    maths: ['math', 'maths', 'mathematics'], physics: ['phy', 'physics'], chemistry: ['chem', 'chemistry'], biology: ['bio', 'biology'],
    englishlang: ['eng', 'english', 'lang', 'language'], englishlit: ['eng', 'english', 'lit', 'literature'],
    history: ['hist', 'history', 'civics'], geography: ['geo', 'geography'], computer: ['comp', 'computer', 'java', 'cs'],
    hindi: ['hindi'], commercialstudies: ['commercial', 'commerce'], economics: ['eco', 'economic', 'economics']
  };
  // Most specific rules first, so "specimen" is never mistaken for "sample".
  // Each rule lists the type names it can map to; the first one that exists in your list is used.
  const TYPE_RULES = [
    [/specimen/, ['Specimen Papers']],
    [/question[ -]?bank|\bqb\b/, ['Question Banks']],
    [/sample|mock|practice/, ['Sample Papers']],
    [/solution|answers?\b|answer key/, ['Solutions']],
    [/previous[ -]?year|pyqs?\b|\bboard\b|past paper/, ['Previous Year Papers', 'Question Papers']],
    [/notes?\b|summary|revision|chapter/, ['Notes']],
    [/\bqp\b|question|papers?\b/, ['Previous Year Papers', 'Question Papers']]
  ];
  function guess(filename) {
    const base = filename.replace(/\.pdf$/i, '');
    const text = base.toLowerCase().replace(/[_\-.]+/g, ' ');
    const tokens = text.split(/[^a-z0-9]+/).filter(Boolean);

    // Subject: the one that matches the most words wins (so "English Literature" beats "English Language").
    let subject = '', best = 0;
    for (const s of state.data.subjects) {
      const keys = new Set([s.id, ...s.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3), ...(ALIAS[s.id] || [])]);
      const codes = [s.code, s.altCode].filter(Boolean).map((c) => String(c).toLowerCase());
      // an exact subject code (011, ENG1, 861, CTA ...) in the file name is the strongest signal
      const hits = new Set(tokens.filter((t) => keys.has(t))).size + (tokens.some((t) => codes.includes(t)) ? 5 : 0);
      if (hits > best) { best = hits; subject = s.id; }
    }

    // Type: a type the file name spells out in full (including types you added) wins, then the rules above.
    const types = state.data.types;
    let type = types.filter((t) => text.includes(t.toLowerCase().replace(/s$/, ''))).sort((x, y) => y.length - x.length)[0] || '';
    if (!type) {
      for (const [rx, names] of TYPE_RULES) {
        if (!rx.test(text)) continue;
        const hit = names.find((n) => types.includes(n));
        if (hit) { type = hit; break; }
      }
    }

    const years = text.match(/\b(19|20)\d{2}\b/g);
    const year = years ? Number(years[years.length - 1]) : '';
    const title = base.replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b([a-z])([a-z]*)/g, (m, a, b) => a.toUpperCase() + b);
    return { title, subject, type, year };
  }

  async function inspectPdf(file) {
    if (file.size > AC.maxPdfMB * 1048576) throw new Error(`This file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${AC.maxPdfMB} MB. Compress it, or raise maxPdfMB in admin-config.js (GitHub allows up to 100 MB).`);
    if (file.size < 100) throw new Error('This file is empty.');
    const magic = String.fromCharCode(...new Uint8Array(await file.slice(0, 5).arrayBuffer()));
    if (magic !== '%PDF-') throw new Error('This is not a real PDF. A file can end in .pdf without being one.');
    const buf = new Uint8Array(await file.arrayBuffer());
    let doc;
    try { doc = await pdfjsLib.getDocument({ data: buf }).promise; }
    catch (e) { throw new Error(e && e.name === 'PasswordException' ? 'This PDF is password protected. Remove the password first.' : 'This PDF could not be opened. It may be damaged.'); }
    const pages = doc.numPages;
    const text = await pagesText(doc);
    doc.destroy();
    let exam = null;
    try { if (X()) exam = X().infoFromPages(text, (CFG.exam || {}).schemeWords); } catch { exam = null; }
    return { pages, text, exam, size_kb: Math.max(1, Math.round(file.size / 1024)) };
  }
  // Reads the text of up to 60 pages. Scanned PDFs come back (almost) empty.
  async function pagesText(doc, max = 60) {
    const out = [];
    for (let i = 1; i <= Math.min(doc.numPages, max); i++) {
      try { const tc = await (await doc.getPage(i)).getTextContent(); out.push(tc.items.map((it) => it.str).join(' ')); }
      catch { out.push(''); }
    }
    return out;
  }
  async function loadPdfText(blob) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
    const t = await pagesText(doc); doc.destroy(); return t;
  }

  /* ---------- editor (used for new uploads and for editing) ---------- */
  function createEditor(host, { mode, res, onSaved }) {
    const edit = mode === 'edit';
    const st = { file: null, pdf: null, url: null, autoId: !edit, guessed: false };
    host.innerHTML = `
    <div class="ed">
      <div class="ed-main">
        <div class="drop${edit ? ' compact' : ''}" tabindex="0" role="button" data-el="drop" aria-label="${edit ? 'Replace the PDF' : 'Choose a PDF'}">
          ${icon('upload')}<b>${edit ? 'Replace the PDF' : 'Drop a PDF here, or click to choose'}</b>
          <span>${edit ? 'Optional. ' : ''}One PDF at a time, up to ${AC.maxPdfMB} MB</span>
          <input type="file" accept="application/pdf,.pdf" hidden data-el="file">
        </div>
        <div class="fileinfo glass" data-el="info" ${edit ? '' : 'hidden'}>
          ${icon('file')}<div class="nm"><b data-el="fname"></b><span data-el="fmeta"></span></div>
          <button class="btn sm" type="button" data-el="suggest" ${edit ? '' : 'hidden'}>Suggest from PDF</button>
          <button class="btn sm" type="button" data-el="clear" hidden>Remove</button>
        </div>
        <p class="note" data-el="guessNote" hidden>Some fields were filled in from the file name. Check each one.</p>
        <form class="fields glass" data-el="form" novalidate>
          <div class="field full"><label for="${'t' + uid}">Title</label><input type="text" id="${'t' + uid}" data-f="title" maxlength="120"></div>
          <div class="field"><label>Subject</label><select data-f="subject"></select></div>
          <div class="field"><label>Type</label><select data-f="type"></select></div>
          <div class="field"><label>Year</label><input type="number" data-f="year" min="1990" max="2100" inputmode="numeric"></div>
          <div class="field"><label>Class</label><input type="text" data-f="cls" maxlength="6" value="X"></div>
          <div class="field"><label>Added on</label><input type="date" data-f="added"></div>
          <div class="field"><label>Popular badge</label><label class="switch"><input type="checkbox" data-f="popular"> Show the Popular badge</label></div>
          <div class="field full"><label>Link name (share link)</label><input type="text" data-f="id" maxlength="80" spellcheck="false" ${edit ? 'disabled' : ''}><div class="sub" data-el="idSub"></div></div>
          <div class="field full"><label>Description</label><textarea data-f="desc" maxlength="240" placeholder="One line about what is inside."></textarea><div class="sub" data-el="descSub"></div></div>
          <div class="field full xbox" data-el="xbox" hidden>
            <label>Timed exam</label>
            <div class="xgrid">
              <label class="xf"><span>Writing time (minutes)</span><input type="number" data-f="xmin" min="20" max="300" inputmode="numeric" placeholder="Auto"></label>
              <label class="xf"><span>Total marks</span><input type="number" data-f="xmarks" min="10" max="200" inputmode="numeric" placeholder="Auto"></label>
              <label class="xf"><span>Marking scheme</span><select data-f="xms"><option value="auto">Auto, the site finds it</option><option value="page">Starts on page</option><option value="none">This paper has none</option></select></label>
              <label class="xf" data-el="xpg" hidden><span>Scheme starts on page</span><input type="number" data-f="xpage" min="2" inputmode="numeric" placeholder="e.g. 13"></label>
            </div>
            <div class="xrow"><button class="btn sm" type="button" data-el="xscan">${icon('timer')}Read from the PDF</button><span class="sub" data-el="xnote"></span></div>
            <div class="sub">Filled boxes are fixed for students. Empty boxes are worked out when they start the exam: the site reads the PDF, then uses the subject defaults.</div>
          </div>
          <div class="field full"><label>Tags</label><input type="text" data-f="tags" placeholder="board, paper, algebra"><div class="kw" data-el="kw"></div><div class="sub">Separate with commas. Tags make search find this resource.</div></div>
        </form>
        <ul class="issues" data-el="issues" aria-live="polite"></ul>
        <div class="ed-actions" data-el="actions"></div>
      </div>
      <aside class="ed-side prev">
        <h3>How it looks on the site</h3>
        <div data-el="preview"></div>
        <p class="hint">${edit ? 'Saving creates one commit on GitHub. The site updates after Render redeploys.' : 'Publishing creates one commit on GitHub. The site updates after Render redeploys, usually in 1 to 2 minutes.'}</p>
      </aside>
    </div>`;
    const el = (n) => host.querySelector(`[data-el="${n}"]`);
    const f = {}; $$('[data-f]', host).forEach((n) => { f[n.dataset.f] = n; });
    const draftNow = () => !!(res && res.draft);

    // selects
    f.subject.innerHTML = '<option value="">Choose a subject</option>' + state.data.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    f.type.innerHTML = '<option value="">Choose a type</option>' + state.data.types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    if (edit) {
      if (res.subject && !subj(res.subject)) f.subject.insertAdjacentHTML('beforeend', `<option value="${esc(res.subject)}">${esc(res.subject)} (missing)</option>`);
      if (res.type && !state.data.types.includes(res.type)) f.type.insertAdjacentHTML('beforeend', `<option value="${esc(res.type)}">${esc(res.type)} (missing)</option>`);
      f.title.value = res.title || ''; f.subject.value = res.subject || ''; f.type.value = res.type || '';
      f.year.value = res.year || ''; f.cls.value = res['class'] || 'X'; f.added.value = res.added || today();
      f.xmin.value = res.minutes > 0 ? res.minutes : ''; f.xmarks.value = res.marks > 0 ? res.marks : '';
      if (Number.isInteger(res.msFrom)) { f.xms.value = res.msFrom === 0 ? 'none' : 'page'; f.xpage.value = res.msFrom > 0 ? res.msFrom : ''; }
      f.popular.checked = !!res.popular; f.id.value = res.id; f.desc.value = res.description || ''; f.tags.value = (res.tags || []).join(', ');
      el('fname').textContent = res.file.split('/').pop();
      el('fmeta').textContent = [res.pages && plural(res.pages, 'page'), res.size_kb && fmtSize(res.size_kb)].filter(Boolean).join(', ');
    } else { f.added.value = today(); }

    const val = () => ({
      title: f.title.value.trim(), subject: f.subject.value, type: f.type.value, year: parseInt(f.year.value, 10),
      cls: f.cls.value.trim() || 'X', added: f.added.value, popular: f.popular.checked, id: f.id.value.trim(),
      description: f.desc.value.trim(), tags: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
      xmin: parseInt(f.xmin.value, 10), xmarks: parseInt(f.xmarks.value, 10), xms: f.xms.value, xpage: parseInt(f.xpage.value, 10)
    });
    // What gets stored on the resource. Anything left empty is simply not stored, so the site works it out itself.
    const examFields = (v) => {
      if (!isPaperType(v.type)) return { minutes: undefined, marks: undefined, msFrom: undefined };
      return {
        minutes: MIN_OK(v.xmin) ? v.xmin : undefined,
        marks: MARKS_OK(v.xmarks) ? v.xmarks : undefined,
        msFrom: v.xms === 'none' ? 0 : v.xms === 'page' && v.xpage >= 2 ? v.xpage : undefined
      };
    };

    function baseId(v) {
      const parts = [v.subject, isNaN(v.year) ? '' : v.year].filter(Boolean);
      if (parts.length === 2) { const t = v.type && v.type !== 'Question Papers' ? slug(v.type.replace(/s$/, '')) : ''; return slug(parts.join('-') + (t ? '-' + t : '')); }
      return slug(v.title).slice(0, 48) || 'resource';
    }
    const taken = (id) => state.data.resources.some((r) => r.id === id && (!edit || r.id !== res.id));
    function uniqueId(base) { let id = base, n = 2; while (taken(id)) id = base + '-' + n++; return id; }

    function check(forLive) {
      const v = val(), errors = [], warnings = [];
      const miss = (msg) => (forLive ? errors : warnings).push(forLive ? msg : msg + ' (needed to publish)');
      if (!edit && !st.file) errors.push('Choose a PDF file.');
      if (!v.title) errors.push('Add a title.');
      if (!v.subject) miss('Pick a subject.');
      else if (!subj(v.subject)) errors.push(`The subject “${v.subject}” does not exist. Add it under Subjects and types, or pick another.`);
      if (!v.type) miss('Pick a type.');
      else if (!state.data.types.includes(v.type)) errors.push(`The type “${v.type}” does not exist. Add it under Subjects and types, or pick another.`);
      if (isNaN(v.year)) miss('Enter the year.');
      else if (v.year < 1990 || v.year > 2100) errors.push('Enter a year between 1990 and 2100.');
      else if (v.year > new Date().getFullYear() + 1) warnings.push(`The year ${v.year} is in the future.`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v.added)) errors.push('Pick the date this was added.');
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(v.id)) errors.push('The link name can use lowercase letters, numbers and single hyphens.');
      else if (taken(v.id)) errors.push(`The link name “${v.id}” is already used by another resource.`);
      if (v.title && state.data.resources.some((r) => r.title.trim().toLowerCase() === v.title.toLowerCase() && (!edit || r.id !== res.id))) warnings.push('Another resource already has this title.');
      if (isPaperType(v.type)) {
        if (!isNaN(v.xmin) && !MIN_OK(v.xmin)) errors.push('Writing time must be a whole number of minutes from 20 to 300.');
        if (!isNaN(v.xmarks) && !MARKS_OK(v.xmarks)) errors.push('Total marks must be a whole number from 10 to 200.');
        if (v.xms === 'page') {
          const last = st.pdf ? st.pdf.pages : res && res.pages;
          if (!(v.xpage >= 2)) errors.push('Enter the page where the marking scheme starts (page 2 or later), or pick another option.');
          else if (last && v.xpage > last) errors.push(`The marking scheme cannot start on page ${v.xpage}. The PDF has ${last} pages.`);
        }
      }
      if (!v.description) warnings.push('There is no description. Cards look better with one line.');
      if (!v.tags.length) warnings.push('There are no tags, so search will rely on the title only.');
      return { v, errors, warnings };
    }

    function previewHtml(v) {
      const s = subj(v.subject), accent = s ? s.accent : '#ffffff';
      const isNewB = v.added && (Date.now() - new Date(v.added + 'T00:00:00')) / 864e5 <= CFG.newDays;
      const pages = st.pdf ? st.pdf.pages : res && res.pages, size = st.pdf ? st.pdf.size_kb : res && res.size_kb;
      return `<article class="card glass gh" style="--accent:${esc(accent)}">
        <div class="tags"><span class="sj"><i class="dot"></i>${esc(s ? s.name : 'Subject')}</span><span class="ty">${esc(v.type || 'Type')}</span>${isNewB ? '<span class="badge new">New</span>' : ''}${v.popular ? '<span class="badge pop">Popular</span>' : ''}</div>
        <h3><a>${esc(v.title || 'Untitled resource')}</a></h3>
        <p class="desc">${esc(v.description || 'Your description appears here.')}</p>
        <div class="facts"><span>Class ${esc(v.cls)}, ${isNaN(v.year) ? 'year' : v.year}</span>${s && codeText(s) ? `<span>Code ${esc(codeText(s))}</span>` : ''}${pages ? `<span>${plural(pages, 'page')}</span>` : ''}${size ? `<span>${fmtSize(size)}</span>` : ''}<span>${fmtCount(res ? dlTotal(res) : 0)} downloads</span></div>
        <div class="acts"><span class="btn">${icon('read')}Read</span><span class="btn btn-primary">${icon('download')}Download</span></div>
      </article>`;
    }

    let touched = false;
    function render() {
      const v = val();
      if (st.autoId && !edit) { f.id.value = uniqueId(baseId(v)); }
      const { errors, warnings } = check(edit && !draftNow());
      const idv = f.id.value.trim();
      const sub = el('idSub');
      if (!idv) { sub.className = 'sub'; sub.textContent = ''; }
      else if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(idv)) { sub.className = 'sub bad'; sub.textContent = 'Use lowercase letters, numbers and single hyphens.'; }
      else if (taken(idv)) { sub.className = 'sub bad'; sub.textContent = 'Already used. Pick another.'; }
      else { sub.className = 'sub ok'; sub.textContent = edit ? 'The link name cannot change, so shared links keep working.' : 'Available: ' + location.origin + CFG.basePath + '?file=' + idv; }
      const paper = isPaperType(v.type), cfg = examCfg();
      el('xbox').hidden = !paper;
      el('xpg').hidden = f.xms.value !== 'page';
      if (paper && X()) {
        f.xmin.placeholder = 'Auto, default ' + X().defaultMinutes({ subject: v.subject }, cfg);
        f.xmarks.placeholder = 'Auto, default ' + X().defaultTotal(v.subject, cfg);
      }
      el('preview').innerHTML = previewHtml(val());
      // only show messages after the user has started typing or chose a file
      const list = touched ? errors.map((m) => `<li class="e">${icon('alert')}<span>${esc(m)}</span></li>`).concat(warnings.map((m) => `<li class="w">${icon('alert')}<span>${esc(m)}</span></li>`)) : [];
      el('issues').innerHTML = list.join('');
    }
    const onInput = (e) => {
      touched = true;
      if (e.target === f.id) st.autoId = false;
      render();
    };
    host.addEventListener('input', onInput); host.addEventListener('change', onInput);

    // ----- keyword and description suggestions, worked out locally from the PDF text -----
    st.result = null; st.lastDesc = ''; st.suggest = [];
    const kwBox = el('kw'), descSub = el('descSub');
    const curTags = () => f.tags.value.split(',').map((x) => x.trim()).filter(Boolean);
    const kwOpts = () => { const v = val(); return { subject: subj(v.subject) || null, type: v.type, year: isNaN(v.year) ? '' : v.year, title: v.title }; };
    function drawChips() {
      const have = new Set(curTags().map((x) => x.toLowerCase()));
      const left = st.suggest.filter((x) => !have.has(x.toLowerCase()));
      kwBox.innerHTML = left.length
        ? '<span class="kw-l">Suggested from the PDF</span>' + left.map((x) => `<button type="button" class="chip" data-kw="${esc(x)}">${icon('plus')}${esc(x)}</button>`).join('') + (left.length > 1 ? '<button type="button" class="chip" data-kwall>Add all</button>' : '')
        : '';
    }
    function writeDesc(force) {
      if (!st.result || !st.result.hasText) return;
      const o = kwOpts();
      const d = KW.describe({ subjectName: o.subject ? o.subject.name : '', type: o.type, year: o.year, topics: st.result.topics, marking: st.result.marking, answerKey: st.result.answerKey });
      if (force || !f.desc.value.trim() || f.desc.value === st.lastDesc) { f.desc.value = d; st.lastDesc = d; descSub.textContent = 'Written from the PDF. Edit it if you like.'; }
    }
    function analyze(pages, force) {
      const r = st.result = KW.analyze(pages, kwOpts());
      if (!r.hasText) {
        st.suggest = []; kwBox.innerHTML = '<span class="sub bad">This PDF has no readable text, so it looks scanned. Keywords and a description cannot be suggested. Add tags by hand.</span>';
        descSub.textContent = ''; return;
      }
      st.suggest = r.tags;
      if (force) { const have = new Set(curTags().map((x) => x.toLowerCase())); f.tags.value = curTags().concat(r.tags.slice(0, 6).filter((x) => !have.has(x))).join(', '); }
      else if (!curTags().length) f.tags.value = r.tags.slice(0, 6).join(', ');
      writeDesc(force); drawChips(); touched = true; render();
    }
    kwBox.addEventListener('click', (e) => {
      const one = e.target.closest('[data-kw]'), all = e.target.closest('[data-kwall]');
      if (!one && !all) return;
      const have = new Set(curTags().map((x) => x.toLowerCase()));
      const add = one ? [one.dataset.kw] : st.suggest.filter((x) => !have.has(x.toLowerCase()));
      f.tags.value = curTags().concat(add).join(', '); drawChips(); touched = true; render();
    });
    f.tags.addEventListener('input', drawChips);
    ['subject', 'type', 'year', 'title'].forEach((k) => f[k].addEventListener('input', () => { if (f.desc.value === st.lastDesc) writeDesc(false); }));
    f.subject.addEventListener('change', () => { if (f.desc.value === st.lastDesc) writeDesc(false); });
    f.type.addEventListener('change', () => { if (f.desc.value === st.lastDesc) writeDesc(false); });
    el('suggest').addEventListener('click', async () => {
      try {
        let pages = st.pdf && st.pdf.text;
        if (!pages) {
          pages = await withBusy('Reading the PDF', async (step) => { step('Fetching it from GitHub'); return loadPdfText(await GH.fetchBlob(res.file)); });
        }
        analyze(pages, true);
        toast(st.result.hasText ? 'Suggestions added' : 'No readable text in this PDF');
      } catch (e) { showError(e); }
    });

    // ----- time allowed, total marks and marking scheme page, read from the PDF text -----
    // Same reading as the public site, so what you see here is what a student's exam will use.
    const xnote = el('xnote');
    function applyExam(info, force) {
      st.examInfo = info;
      if (!info) { xnote.className = 'sub'; xnote.textContent = ''; return; }
      const v = val(), cfg = examCfg();
      const lockable = X() && X().hasScheme({ type: v.type, year: v.year }, cfg);
      if (info.minutes && (force || !f.xmin.value)) f.xmin.value = info.minutes;
      if (info.marks && (force || !f.xmarks.value)) f.xmarks.value = info.marks;
      if (info.scheme && lockable && (force || f.xms.value === 'auto')) { f.xms.value = 'page'; f.xpage.value = info.scheme; }
      const found = [], missing = [];
      (info.minutes ? found : missing).push(info.minutes ? 'time ' + fmtMins(info.minutes) : 'time');
      (info.marks ? found : missing).push(info.marks ? info.marks + ' marks' : 'marks');
      if (info.scheme) found.push('marking scheme from page ' + info.scheme + (lockable ? '' : ' (not hidden: only specimen papers from ' + (cfg.schemeFromYear || 2025) + ' are)'));
      else if (lockable) missing.push('marking scheme');
      xnote.className = 'sub ' + (missing.length ? 'bad' : 'ok');
      xnote.textContent = (found.length ? 'Read from the PDF: ' + found.join(', ') + '. ' : '') + (missing.length ? 'Not found: ' + missing.join(', ') + '. Fill in by hand, or leave empty for the site to try.' : 'Check them against the paper.');
      touched = true; render();
    }
    el('xscan').addEventListener('click', async () => {
      try {
        let pages = st.pdf && st.pdf.text;
        if (!pages && !edit) { toast('Choose a PDF first.'); return; }
        if (!pages) pages = await withBusy('Reading the PDF', async (step) => { step('Fetching it from GitHub'); return loadPdfText(await GH.fetchBlob(res.file)); });
        applyExam(X() ? X().infoFromPages(pages, (CFG.exam || {}).schemeWords) : null, true);
      } catch (e) { showError(e); }
    });
    f.xms.addEventListener('change', render);
    ['type', 'year'].forEach((k) => f[k].addEventListener('change', () => { if (st.examInfo) applyExam(st.examInfo, false); }));

    el('form').addEventListener('submit', (e) => e.preventDefault());

    // file handling
    const drop = el('drop'), input = el('file');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (e) => {
      const files = [...e.dataTransfer.files];
      if (files.length > 1) toast('One PDF at a time. Using the first file.');
      if (files[0]) takeFile(files[0]);
    });
    input.addEventListener('change', () => { if (input.files[0]) takeFile(input.files[0]); input.value = ''; });

    async function takeFile(file) {
      try {
        const info = await inspectPdf(file);
        if (st.url) URL.revokeObjectURL(st.url);
        st.file = file; st.pdf = info; st.url = URL.createObjectURL(file);
        el('info').hidden = false; el('clear').hidden = false;
        el('fname').textContent = file.name;
        el('fmeta').textContent = `${plural(info.pages, 'page')}, ${fmtSize(info.size_kb)}${edit ? ', replaces the current file' : ''}`;
        if (!edit) {
          const g = guess(file.name);
          // Titles follow your existing pattern, e.g. "ICSE SPECIMEN 2025 Computer Applications"
          const sj = subj(g.subject);
          const patterned = sj && g.year && /^(Specimen Papers|Previous Year Papers)$/.test(g.type)
            ? `ICSE ${g.type === 'Specimen Papers' ? 'SPECIMEN ' : ''}${g.year} ${sj.name}` : '';
          if (!f.title.value.trim()) f.title.value = patterned || g.title;
          if (!f.subject.value && g.subject) f.subject.value = g.subject;
          if (!f.type.value && g.type) f.type.value = g.type;
          if (!f.year.value && g.year) f.year.value = g.year;
          st.guessed = true; el('guessNote').hidden = false;
        }
        el('suggest').hidden = false;
        touched = true; render();
        analyze(info.text, false);
        applyExam(info.exam, false);   // autoread: time, total marks and marking scheme page
      } catch (e) { showError(e); }
    }
    el('clear').addEventListener('click', () => {
      if (st.url) URL.revokeObjectURL(st.url);
      st.file = st.pdf = st.url = null;
      if (edit) { el('fname').textContent = res.file.split('/').pop(); el('fmeta').textContent = [res.pages && plural(res.pages, 'page'), res.size_kb && fmtSize(res.size_kb)].filter(Boolean).join(', '); el('clear').hidden = true; }
      else { el('info').hidden = true; el('suggest').hidden = true; }
      st.result = null; st.suggest = []; kwBox.innerHTML = '';
      if (!edit) { st.examInfo = null; xnote.textContent = ''; }
      render();
    });

    // actions
    const acts = el('actions');
    acts.innerHTML = edit
      ? `<button class="btn btn-primary" type="button" data-a="save">Save changes</button>
         <button class="btn" type="button" data-a="${draftNow() ? 'publish' : 'unpublish'}">${draftNow() ? 'Publish' : 'Move to drafts'}</button>
         <button class="btn" type="button" data-a="preview">${icon('read')}Preview in reader</button>`
      : `<button class="btn" type="button" data-a="draft">Save as draft</button>
         <button class="btn btn-primary" type="button" data-a="publish">Publish</button>
         <button class="btn" type="button" data-a="preview">${icon('read')}Preview in reader</button>`;
    acts.addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b) run(b.dataset.a); });

    async function run(action) {
      touched = true;
      if (action === 'preview') return preview();
      const toLive = action === 'publish' || (action === 'save' && !draftNow());
      const toDraft = action === 'draft' || action === 'unpublish' || (action === 'save' && draftNow());
      const { v, errors, warnings } = check(toLive);
      render();
      if (errors.length) { host.querySelector('[data-el="issues"]').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      if (toLive && warnings.length) {
        const ok = await confirmDialog({ title: 'Publish with warnings?', body: '<ul style="margin:10px 0 0;padding-left:18px;color:var(--muted)">' + warnings.map((w) => `<li>${esc(w)}</li>`).join('') + '</ul>', ok: 'Publish anyway' });
        if (!ok) return;
      }
      try {
        if (!edit) await saveNew(v, toDraft);
        else await saveEdit(v, toDraft ? true : false);
      } catch (e) { showError(e); }
    }

    function preview() {
      const v = val();
      const r = Object.assign({}, res || {}, { id: '__preview__', title: v.title || 'Preview', subject_name: (subj(v.subject) || {}).name, type: v.type, year: v.year });
      if (st.url) { r.file = st.url; return Viewer.open(r); }
      if (edit) return previewRes(res);
      toast('Choose a PDF first.');
    }

    async function saveNew(v, asDraft) {
      const r = tidy(Object.assign({ id: v.id, title: v.title, subject: v.subject, class: v.cls, type: v.type, year: v.year, file: `/${AC.pdfDir}/${v.id}.pdf`, pages: st.pdf.pages, size_kb: st.pdf.size_kb, added: v.added, updated: today(), downloads: 0, popular: v.popular, draft: asDraft, description: v.description, tags: v.tags }, examFields(v)));
      const c = await withBusy(asDraft ? 'Saving draft' : 'Publishing', async (step) => {
        step('Reading the PDF');
        const b64 = await GH.fileToBase64(st.file);
        return commitMutation(`Add: ${v.title}${asDraft ? ' (draft)' : ''}`, (data) => {
          if (data.resources.some((x) => x.id === v.id)) throw new Error('This link name was just taken by another change. Pick a different one.');
          data.resources.push(r); return data;
        }, { upserts: [{ path: filePath(r), base64: b64 }] }, step);
      });
      doneDialog({
        title: asDraft ? 'Draft saved' : 'Published',
        body: `${esc(v.title)} is saved to GitHub. ${asDraft ? 'It stays hidden from the site until you publish it.' : 'It appears on the site after Render redeploys, usually in 1 to 2 minutes.'}`,
        url: c.url, again: 'Upload another'
      });
      onSaved && onSaved('new');
    }

    async function saveEdit(v, makeDraft) {
      const rev = st.file ? (res.rev || 1) + 1 : res.rev;
      const newFile = st.file ? `/${AC.pdfDir}/${res.id}-v${rev}.pdf` : res.file;
      const c = await withBusy('Saving changes', async (step) => {
        const upserts = [], deletes = [];
        if (st.file) { step('Reading the PDF'); upserts.push({ path: filePath({ file: newFile }), base64: await GH.fileToBase64(st.file) }); deletes.push(filePath(res)); }
        const verb = makeDraft !== !!res.draft ? (makeDraft ? 'Unpublish' : 'Publish') : 'Update';
        return commitMutation(`${verb}: ${v.title}`, (data) => {
          const i = data.resources.findIndex((x) => x.id === res.id);
          if (i < 0) throw new Error('This resource no longer exists. Reload the page.');
          const cur = data.resources[i];
          data.resources[i] = Object.assign({}, cur, { title: v.title, subject: v.subject, type: v.type, year: isNaN(v.year) ? '' : v.year, class: v.cls, added: v.added, popular: v.popular, description: v.description, tags: v.tags, updated: today(), draft: makeDraft }, examFields(v),
            st.file ? { file: newFile, pages: st.pdf.pages, size_kb: st.pdf.size_kb, rev } : {});
          return data;
        }, { upserts, deletes }, step);
      });
      toast('Saved. Render will redeploy shortly.');
      onSaved && onSaved('edit', c);
    }

    render();
    return { destroy() { if (st.url) URL.revokeObjectURL(st.url); host.removeEventListener('input', onInput); host.removeEventListener('change', onInput); host.innerHTML = ''; }, reset() { /* fresh editor is mounted instead */ } };
  }
  let uid = 0;

  function mountUpload() {
    if (state.editor) state.editor.destroy();
    uid++;
    state.editor = createEditor($('#uploadHost'), { mode: 'new', onSaved: () => { mountUpload(); } });
  }

  /* ---------- library ---------- */
  function filtered() {
    const f = state.filters, tokens = f.q.toLowerCase().split(/\s+/).filter(Boolean);
    const sub = (r) => (subj(r.subject) || {}).name || '';
    let list = state.data.resources.filter((r) => {
      if (f.subject && r.subject !== f.subject) return false;
      if (f.type && r.type !== f.type) return false;
      if (f.year && String(r.year) !== f.year) return false;
      if (f.status === 'draft' && !r.draft) return false;
      if (f.status === 'live' && r.draft) return false;
      if (f.status === 'timer' && !isPaperType(r.type)) return false;
      const hay = [r.title, r.id, sub(r), r.type, r.year, (r.tags || []).join(' ')].join(' ').toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    const { key, dir } = state.sort;
    if (key === 'upload' || key === 'site') {
      // Upload order = position in resources.json (new uploads are appended, so this is the true sequence).
      // Site order = subjects in the order set in config.js, then newest upload first, as on the public page.
      const pos = new Map(state.data.resources.map((r, i) => [r.id, i]));
      const order = CFG.subjectOrder || [];
      const rank = (r) => { const i = order.indexOf(r.subject); return i < 0 ? order.length : i; };
      list.sort(key === 'upload'
        ? (a, b) => pos.get(a.id) - pos.get(b.id)
        : (a, b) => rank(a) - rank(b) || pos.get(b.id) - pos.get(a.id));
      return list;
    }
    const get = { title: (r) => r.title.toLowerCase(), subject: (r) => sub(r).toLowerCase(), type: (r) => String(r.type), year: (r) => Number(r.year) || 0, downloads: dlTotal, updated: (r) => r.updated || r.added || '' }[key];
    list.sort((a, b) => { const x = get(a), y = get(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
    return list;
  }

  function renderFilters() {
    const R = state.data.resources, f = state.filters;
    const opt = (v, l, cur) => `<option value="${esc(v)}" ${cur === v ? 'selected' : ''}>${esc(l)}</option>`;
    $('#fSubject').innerHTML = opt('', 'All subjects', f.subject) + state.data.subjects.map((s) => opt(s.id, s.name, f.subject)).join('');
    $('#fType').innerHTML = opt('', 'All types', f.type) + state.data.types.map((t) => opt(t, t, f.type)).join('');
    const years = [...new Set(R.map((r) => String(r.year)).filter((y) => y && y !== 'NaN'))].sort().reverse();
    $('#fYear').innerHTML = opt('', 'All years', f.year) + years.map((y) => opt(y, y, f.year)).join('');
    $('#fStatus').value = f.status;
  }

  // Shows which resources get the "Timed exam" button, and what a student's exam will use for each setting
  function timerBadge(r) {
    if (!isPaperType(r.type)) return '';
    const cfg = examCfg(), core = X();
    const time = r.minutes > 0 ? `${r.minutes} min (set here)` : `read from the PDF, else ${core ? core.defaultMinutes(r, cfg) : 120} min`;
    const marks = r.marks > 0 ? `${r.marks} (set here)` : `read from the PDF, else ${core ? core.defaultTotal(r.subject, cfg) : 80}`;
    const lock = core && core.hasScheme(r, cfg);
    const scheme = Number.isInteger(r.msFrom) ? (r.msFrom === 0 ? 'none, nothing hidden' : `from page ${r.msFrom} (set here)`) : lock ? 'found in the PDF when the exam starts' : 'not hidden (only specimen papers from ' + (cfg.schemeFromYear || 2025) + ' are)';
    const fixed = r.minutes > 0 && r.marks > 0;
    return `<span class="badge xt${fixed ? ' fixed' : ''}" title="${esc(`Timed exam. Time: ${time}. Total marks: ${marks}. Marking scheme: ${scheme}.`)}">${icon('timer')}Timer${fixed ? '' : ' · auto'}</span>`;
  }

  function renderLibrary() {
    const list = filtered();
    $('#libCount').textContent = state.data.resources.length;
    $$('.th').forEach((b) => b.classList.toggle('on', b.dataset.sort === state.sort.key));
    const rows = list.map((r) => {
      const s = subj(r.subject), sel = state.selected.has(r.id);
      const isNew = r.added && (Date.now() - new Date(r.added + 'T00:00:00')) / 864e5 <= CFG.newDays;
      const pop = r.popular || dlTotal(r) >= CFG.popularMin;
      return `<tr data-id="${esc(r.id)}" class="${sel ? 'sel' : ''}">
        <td class="c-sel"><input type="checkbox" data-sel ${sel ? 'checked' : ''} aria-label="Select ${esc(r.title)}"></td>
        <td class="c-title"><button class="ttl" data-act="edit" type="button">${esc(r.title)}</button><span class="id">${esc(r.id)}</span></td>
        <td class="c-sub">${s ? `<span class="sj" style="--accent:${esc(s.accent)}"><i class="dot"></i>${esc(s.name)}</span>${codeText(s) ? `<span class="id">${esc(codeText(s))}</span>` : ''}` : '<span class="dim">Not set</span>'}</td>
        <td class="c-type dim">${esc(r.type || 'Not set')}</td>
        <td class="c-year dim">${esc(r.year || '–')}</td>
        <td class="c-st"><div class="st"><span class="badge ${r.draft ? 'draft' : 'live'}">${r.draft ? 'Draft' : 'Live'}</span>${isNew && !r.draft ? '<span class="badge new">New</span>' : ''}${pop && !r.draft ? '<span class="badge pop">Popular</span>' : ''}${timerBadge(r)}</div></td>
        <td class="c-dl dim" data-l="Downloads" title="${esc((r.downloads || 0) + ' starting + ' + (state.live[r.id] || 0) + ' counted')}">${fmtCount(dlTotal(r))}</td>
        <td class="c-up dim" data-l="Updated">${esc(fmtDate(r.updated || r.added))}</td>
        <td class="c-act">
          <button class="ib" data-act="preview" type="button" aria-label="Preview ${esc(r.title)}" title="Preview">${icon('read')}</button>
          <button class="ib" data-act="edit" type="button" aria-label="Edit ${esc(r.title)}" title="Edit">${icon('edit')}</button>
          <button class="ib del" data-act="delete" type="button" aria-label="Delete ${esc(r.title)}" title="Delete">${icon('trash')}</button>
        </td></tr>`;
    });
    $('#rows').innerHTML = rows.join('') || `<tr class="empty-row"><td colspan="9">${state.data.resources.length ? 'No resources match these filters.' : 'No resources yet. Upload your first PDF.'}</td></tr>`;
    $('#libHint').textContent = list.length ? `${plural(list.length, 'resource')} shown. Downloads are the starting count plus live clicks.` : '';
    const n = state.selected.size;
    $('#bulkBar').hidden = !n; $('#bulkN').textContent = n + ' selected';
    const all = $('#selAll'); all.checked = list.length > 0 && list.every((r) => state.selected.has(r.id));
    all.indeterminate = !all.checked && list.some((r) => state.selected.has(r.id));
  }

  let previewing = null;
  async function previewRes(r) {
    try {
      let url = r.file;
      try {
        const blob = await withBusy('Opening preview', async (step) => { step('Fetching the PDF from GitHub'); return GH.fetchBlob(r.file); });
        if (previewing) URL.revokeObjectURL(previewing);
        previewing = url = URL.createObjectURL(blob);
      } catch (e) { /* fall back to the public URL */ }
      Viewer.open(Object.assign({}, r, { id: '__preview__', file: url, subject_name: (subj(r.subject) || {}).name }));
    } catch (e) { showError(e); }
  }

  function openEdit(r) {
    uid++;
    const m = modal('<div class="sheet-head"><h3>Edit resource</h3><button class="ib" type="button" aria-label="Close" data-x><svg class="ic"><use href="#i-close"/></svg></button></div><div data-host></div>', { cls: 'wide', scroll: true });
    m.card.querySelector('[data-x]').onclick = () => m.close();
    const ed = createEditor(m.card.querySelector('[data-host]'), { mode: 'edit', res: r, onSaved: () => m.close() });
    m.onClose = () => ed.destroy();
  }

  async function deleteResources(ids) {
    const items = ids.map((id) => state.data.resources.find((r) => r.id === id)).filter(Boolean);
    if (!items.length) return;
    const ok = await confirmDialog({
      title: items.length === 1 ? 'Delete this resource?' : `Delete ${items.length} resources?`,
      body: `<p>${items.slice(0, 5).map((r) => esc(r.title)).join('<br>')}${items.length > 5 ? `<br>and ${items.length - 5} more` : ''}</p><p>The PDFs are removed from the site. You can use Undo last change right after, or restore from GitHub history.</p>`,
      ok: 'Delete', danger: true
    });
    if (!ok) return;
    try {
      const c = await withBusy('Deleting', (step) => commitMutation(items.length === 1 ? `Delete: ${items[0].title}` : `Delete ${items.length} resources`, (data) => {
        data.resources = data.resources.filter((r) => !ids.includes(r.id)); return data;
      }, { deletes: [...new Set(items.map(filePath))] }, step));
      ids.forEach((id) => state.selected.delete(id));
      renderLibrary();
      toast(items.length === 1 ? 'Deleted' : `Deleted ${items.length} resources`);
    } catch (e) { showError(e); }
  }

  function bulkEdit() {
    const ids = [...state.selected]; if (!ids.length) return;
    const sOpts = '<option value="">No change</option>' + state.data.subjects.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join('');
    const tOpts = '<option value="">No change</option>' + state.data.types.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
    const m = modal(`<h3>Edit ${plural(ids.length, 'resource')}</h3><p>Leave a field on “No change” to keep it as it is.</p>
      <div class="bulk-form">
        <div class="field"><label>Subject</label><select data-b="subject">${sOpts}</select></div>
        <div class="field"><label>Type</label><select data-b="type">${tOpts}</select></div>
        <div class="field"><label>Year</label><input type="number" data-b="year" min="1990" max="2100" placeholder="No change"></div>
        <div class="field"><label>Popular badge</label><select data-b="popular"><option value="">No change</option><option value="on">Mark as popular</option><option value="off">Remove the badge</option></select></div>
        <div class="field"><label>Status</label><select data-b="status"><option value="">No change</option><option value="live">Publish</option><option value="draft">Move to drafts</option></select></div>
      </div>
      <div class="row-acts"><button class="btn" data-no type="button">Cancel</button><button class="btn btn-primary" data-yes type="button">Apply to ${ids.length}</button></div>`, { cls: 'mid' });
    m.card.querySelector('[data-no]').onclick = () => m.close();
    m.card.querySelector('[data-yes]').onclick = async () => {
      const g = (k) => m.card.querySelector(`[data-b="${k}"]`).value;
      const p = { subject: g('subject'), type: g('type'), year: g('year') ? parseInt(g('year'), 10) : '', popular: g('popular'), status: g('status') };
      if (p.year && (p.year < 1990 || p.year > 2100)) { toast('Enter a year between 1990 and 2100.'); return; }
      if (!p.subject && !p.type && !p.year && !p.popular && !p.status) { toast('Nothing to change.'); return; }
      m.close();
      try {
        await withBusy('Applying changes', (step) => commitMutation(`Bulk edit: ${plural(ids.length, 'resource')}`, (data) => {
          data.resources.forEach((r) => {
            if (!ids.includes(r.id)) return;
            if (p.subject) r.subject = p.subject; if (p.type) r.type = p.type; if (p.year) r.year = p.year;
            if (p.popular) r.popular = p.popular === 'on';
            if (p.status) r.draft = p.status === 'draft';
            r.updated = today();
          });
          return data;
        }, {}, step));
        toast(`Updated ${plural(ids.length, 'resource')}`);
      } catch (e) { showError(e); }
    };
  }

  // library events
  $('#lq').addEventListener('input', (e) => { state.filters.q = e.target.value; renderLibrary(); });
  [['#fSubject', 'subject'], ['#fType', 'type'], ['#fYear', 'year'], ['#fStatus', 'status']].forEach(([s, k]) => $(s).addEventListener('change', (e) => { state.filters[k] = e.target.value; renderLibrary(); }));
  $('.tbl thead').addEventListener('click', (e) => {
    const b = e.target.closest('.th'); if (!b) return;
    const k = b.dataset.sort; state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'title' || k === 'subject' || k === 'type' ? 1 : -1) };
    renderLibrary();
  });
  const SORTS = { upload: { key: 'upload', dir: 1 }, site: { key: 'site', dir: 1 }, updated: { key: 'updated', dir: -1 }, title: { key: 'title', dir: 1 }, year: { key: 'year', dir: -1 }, downloads: { key: 'downloads', dir: -1 } };
  $('#fSort').addEventListener('change', (e) => { state.sort = Object.assign({}, SORTS[e.target.value]); renderLibrary(); });
  $('#selAll').addEventListener('change', (e) => { filtered().forEach((r) => (e.target.checked ? state.selected.add(r.id) : state.selected.delete(r.id))); renderLibrary(); });
  $('#rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]'); if (!tr) return;
    const r = state.data.resources.find((x) => x.id === tr.dataset.id); if (!r) return;
    if (e.target.matches('[data-sel]')) { e.target.checked ? state.selected.add(r.id) : state.selected.delete(r.id); renderLibrary(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'edit') openEdit(r);
    else if (a.dataset.act === 'preview') previewRes(r);
    else if (a.dataset.act === 'delete') deleteResources([r.id]);
  });
  $('#bulkEdit').addEventListener('click', bulkEdit);
  $('#bulkDel').addEventListener('click', () => deleteResources([...state.selected]));
  $('#bulkClear').addEventListener('click', () => { state.selected.clear(); renderLibrary(); });

  /* ---------- subjects and types ---------- */
  function resetTax() {
    state.tax = {
      subjects: state.data.subjects.map((s) => ({ id: s.id, name: s.name, accent: s.accent, code: s.code || '', altCode: s.altCode || '', isNew: false })),
      types: state.data.types.map((t) => ({ orig: t, name: t })), dirty: false
    };
    renderTax();
  }
  function renderTax() {
    const t = state.tax; if (!t) return;
    const count = (id) => state.data.resources.filter((r) => r.subject === id).length;
    const tcount = (name) => state.data.resources.filter((r) => r.type === name).length;
    $('#subjList').innerHTML = (t.subjects.length ? '<div class="trow head" aria-hidden="true"><span></span><span>Subject</span><span>Numeric code</span><span>Alpha code</span><span></span><span></span></div>' : '') + t.subjects.map((s, i) => {
      const n = s.isNew ? 0 : count(s.id);
      return `<div class="trow" data-i="${i}">
        <input type="color" value="${esc(s.accent)}" data-k="accent" aria-label="Accent colour for ${esc(s.name)}">
        <label class="fld f-name"><span>Subject</span><input type="text" value="${esc(s.name)}" data-k="name" maxlength="40" aria-label="Subject name"></label>
        <label class="fld f-code"><span>Numeric code</span><input type="text" value="${esc(s.code)}" data-k="code" maxlength="3" placeholder="Code" spellcheck="false" aria-label="Numeric subject code for ${esc(s.name)}"></label>
        <label class="fld f-alt"><span>Alpha code</span><input type="text" value="${esc(s.altCode)}" data-k="altCode" maxlength="4" placeholder="Alt code" spellcheck="false" aria-label="Alphanumeric subject code for ${esc(s.name)}"></label>
        <span class="cnt">${n ? plural(n, 'resource') : 'unused'}</span>
        <button class="ib del" type="button" data-k="del" ${n ? 'disabled title="Move or delete its resources first"' : 'title="Remove subject"'} aria-label="Remove ${esc(s.name)}">${icon('trash')}</button>
      </div>`;
    }).join('') || '<p class="hint">No subjects yet.</p>';
    $('#typeList').innerHTML = t.types.map((x, i) => {
      const n = x.orig ? tcount(x.orig) : 0;
      return `<div class="trow type" data-i="${i}">
        <input type="text" value="${esc(x.name)}" data-k="name" maxlength="40" aria-label="Type name">
        <span class="cnt">${n ? plural(n, 'resource') : 'unused'}</span>
        <button class="ib del" type="button" data-k="del" ${n ? 'disabled title="Move or delete its resources first"' : 'title="Remove type"'} aria-label="Remove ${esc(x.name)}">${icon('trash')}</button>
      </div>`;
    }).join('') || '<p class="hint">No types yet.</p>';
    $('#taxSave').disabled = !t.dirty; $('#taxReset').disabled = !t.dirty;
    $('#taxHint').textContent = t.dirty ? 'Unsaved changes. Renaming a type updates every resource that uses it.' : 'Subject colours appear on cards, chips and the subject grid.';
  }
  const dirty = () => { state.tax.dirty = true; $('#taxSave').disabled = false; $('#taxReset').disabled = false; $('#taxHint').textContent = 'Unsaved changes. Renaming a type updates every resource that uses it.'; };
  $('#subjList').addEventListener('input', (e) => {
    const row = e.target.closest('.trow'); if (!row) return; const s = state.tax.subjects[row.dataset.i];
    const k = e.target.dataset.k; if (k === 'name' || k === 'accent' || k === 'code' || k === 'altCode') s[k] = e.target.value;
    dirty();
  });
  $('#subjList').addEventListener('click', (e) => { const b = e.target.closest('[data-k="del"]'); if (!b || b.disabled) return; state.tax.subjects.splice(b.closest('.trow').dataset.i, 1); dirty(); renderTax(); });
  $('#typeList').addEventListener('input', (e) => { const row = e.target.closest('.trow'); if (!row) return; state.tax.types[row.dataset.i].name = e.target.value; dirty(); });
  $('#typeList').addEventListener('click', (e) => { const b = e.target.closest('[data-k="del"]'); if (!b || b.disabled) return; state.tax.types.splice(b.closest('.trow').dataset.i, 1); dirty(); renderTax(); });
  $('#addSubject').addEventListener('click', () => {
    const used = state.tax.subjects.length;
    state.tax.subjects.push({ id: '', name: '', accent: PALETTE[used % PALETTE.length], code: '', altCode: '', isNew: true }); dirty(); renderTax();
    const rows = $$('#subjList .trow'); rows[rows.length - 1].querySelector('[data-k="name"]').focus();
  });
  $('#addType').addEventListener('click', () => { state.tax.types.push({ orig: '', name: '' }); dirty(); renderTax(); const rows = $$('#typeList .trow'); rows[rows.length - 1].querySelector('input').focus(); });
  $('#taxReset').addEventListener('click', resetTax);
  $('#taxSave').addEventListener('click', async () => {
    const t = state.tax, names = t.subjects.map((s) => s.name.trim()), tn = t.types.map((x) => x.name.trim());
    if (names.some((n) => !n) || tn.some((n) => !n)) return toast('Every subject and type needs a name.');
    if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) return toast('Two subjects have the same name.');
    if (new Set(tn.map((n) => n.toLowerCase())).size !== tn.length) return toast('Two types have the same name.');
    const codeOk = (c) => !c || /^[A-Za-z0-9]{1,8}$/.test(c.trim());
    if (t.subjects.some((s) => !codeOk(s.code) || !codeOk(s.altCode))) return toast('Subject codes can use letters and numbers only, up to 8 characters.');
    for (const key of ['code', 'altCode']) {
      const vals = t.subjects.map((s) => s[key].trim().toLowerCase()).filter(Boolean);
      if (new Set(vals).size !== vals.length) return toast('Two subjects share the same ' + (key === 'code' ? 'code' : 'alt code') + '.');
    }
    const taken = new Set(t.subjects.filter((s) => !s.isNew).map((s) => s.id));
    t.subjects.forEach((s) => { if (s.isNew) { let b = slug(s.name) || 'subject', id = b, n = 2; while (taken.has(id)) id = b + '-' + n++; s.id = id; taken.add(id); } });
    try {
      await withBusy('Saving subjects and types', (step) => commitMutation('Update subjects and types', (data) => {
        data.subjects = t.subjects.map((s) => {
          const o = { id: s.id, name: s.name.trim(), accent: s.accent };
          if (s.code.trim()) o.code = s.code.trim();
          if (s.altCode.trim()) o.altCode = s.altCode.trim().toUpperCase();
          return o;
        });
        const map = new Map(t.types.filter((x) => x.orig).map((x) => [x.orig, x.name.trim()]));
        data.types = t.types.map((x) => x.name.trim());
        data.resources.forEach((r) => { if (map.has(r.type)) r.type = map.get(r.type); });
        return data;
      }, {}, step));
      state.tax.dirty = false; resetTax();
      toast('Saved. Render will redeploy shortly.');
    } catch (e) { showError(e); }
  });

  /* ---------- timed exam defaults per subject ---------- */
  // Saved in resources.json as "examDefaults": { minutes: { default, <subjectId> }, marks: { default, <subjectId> } }
  function resetXd() {
    const d = state.data.examDefaults || {};
    state.xd = { minutes: Object.assign({}, d.minutes), marks: Object.assign({}, d.marks), dirty: false };
    renderXd();
  }
  function renderXd() {
    const box = $('#xdList'), t = state.xd; if (!box || !t) return;
    const base = CFG.exam || {}, core = X();
    const baseMin = (id) => (core ? core.defaultMinutes({ subject: id }, base) : 120);
    const baseMarks = (id) => (core ? core.defaultTotal(id, base) : 80);
    const rows = [{ id: 'default', name: 'All other subjects' }].concat(state.data.subjects.map((s) => ({ id: s.id, name: s.name, accent: s.accent })));
    box.innerHTML = '<div class="xdrow head" aria-hidden="true"><span>Subject</span><span>Minutes</span><span>Total marks</span></div>' + rows.map((r) =>
      `<div class="xdrow" data-id="${esc(r.id)}"${r.accent ? ` style="--accent:${esc(r.accent)}"` : ''}>
        <span class="xdn">${r.accent ? '<i class="dot"></i>' : ''}${esc(r.name)}</span>
        <label class="fld"><span>Minutes</span><input type="number" data-x="minutes" min="20" max="300" inputmode="numeric" value="${esc(t.minutes[r.id] || '')}" placeholder="${r.id === 'default' ? baseMin('') : baseMin(r.id)}" aria-label="Writing time in minutes for ${esc(r.name)}"></label>
        <label class="fld"><span>Total marks</span><input type="number" data-x="marks" min="10" max="200" inputmode="numeric" value="${esc(t.marks[r.id] || '')}" placeholder="${r.id === 'default' ? baseMarks('') : baseMarks(r.id)}" aria-label="Total marks for ${esc(r.name)}"></label>
      </div>`).join('');
    $('#xdSave').disabled = !t.dirty; $('#xdReset').disabled = !t.dirty;
    $('#xdHint').textContent = t.dirty ? 'Unsaved changes.' : 'Grey numbers are the built-in values from config.js.';
  }
  $('#xdList').addEventListener('input', (e) => {
    const inp = e.target.closest('[data-x]'), row = e.target.closest('.xdrow'); if (!inp || !row) return;
    const v = parseInt(inp.value, 10), k = inp.dataset.x, id = row.dataset.id;
    if (inp.value.trim() === '' || isNaN(v)) delete state.xd[k][id]; else state.xd[k][id] = v;
    inp.removeAttribute('aria-invalid');
    state.xd.dirty = true; $('#xdSave').disabled = false; $('#xdReset').disabled = false; $('#xdHint').textContent = 'Unsaved changes.';
  });
  $('#xdReset').addEventListener('click', resetXd);
  $('#xdSave').addEventListener('click', async () => {
    const t = state.xd; let bad = null;
    $$('#xdList [data-x]').forEach((inp) => {
      const v = parseInt(inp.value, 10), empty = inp.value.trim() === '';
      const ok = empty || (inp.dataset.x === 'minutes' ? MIN_OK(v) : MARKS_OK(v));
      inp.setAttribute('aria-invalid', ok ? 'false' : 'true');
      if (!ok && !bad) bad = inp;
    });
    if (bad) { bad.focus(); return toast('Minutes must be 20 to 300, and total marks 10 to 200.'); }
    const ids = new Set(['default'].concat(state.data.subjects.map((s) => s.id)));
    const clean = (o) => Object.fromEntries(Object.entries(o).filter(([id, v]) => ids.has(id) && v > 0));
    const minutes = clean(t.minutes), marks = clean(t.marks);
    try {
      await withBusy('Saving exam defaults', (step) => commitMutation('Update exam defaults', (data) => {
        if (!Object.keys(minutes).length && !Object.keys(marks).length) delete data.examDefaults;
        else { data.examDefaults = {}; if (Object.keys(minutes).length) data.examDefaults.minutes = minutes; if (Object.keys(marks).length) data.examDefaults.marks = marks; }
        return data;
      }, {}, step));
      resetXd();
      toast('Saved. Render will redeploy shortly.');
    } catch (e) { showError(e); }
  });

  /* ---------- activity ---------- */
  async function renderActivity() {
    const recent = [...state.data.resources].sort((a, b) => String(b.updated || b.added).localeCompare(String(a.updated || a.added))).slice(0, 8);
    $('#recentList').innerHTML = recent.map((r) => {
      const s = subj(r.subject);
      return `<div class="act" style="--accent:${esc(s ? s.accent : '#fff')}"><i class="dot"></i><div class="tx"><b>${esc(r.title)}</b><span>${esc(r.draft ? 'Draft' : 'Live')}, ${esc(s ? s.name : 'No subject')}, updated ${esc(fmtDate(r.updated || r.added))}</span></div></div>`;
    }).join('') || '<p class="hint">Nothing uploaded yet.</p>';
    const h = $('#histList'); h.innerHTML = '<p class="hint">Loading history</p>';
    try {
      const list = await GH.history(30);
      h.innerHTML = list.map((c) => {
        const first = c.message.split('\n')[0], mine = first.startsWith(AC.commitPrefix);
        return `<div class="act"><i class="dot" style="--accent:${mine ? '#fff' : '#777'}"></i><div class="tx"><b>${esc(first.replace(AC.commitPrefix, '').trim())}</b><span>${esc(c.author)}, ${esc(ago(c.date))}${mine ? '' : ', outside admin'}</span></div><a href="${esc(c.url)}" target="_blank" rel="noopener">View</a></div>`;
      }).join('') || '<p class="hint">No commits found.</p>';
    } catch (e) { h.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }

  /* ---------- header, tabs ---------- */
  function show(tab) {
    state.tab = tab;
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    $$('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    if (tab === 'library') { renderFilters(); renderLibrary(); }
    if (tab === 'taxonomy' && (!state.tax || !state.tax.dirty)) resetTax();
    if (tab === 'taxonomy' && (!state.xd || !state.xd.dirty)) resetXd();
    if (tab === 'activity') renderActivity();
  }
  $('.tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });

  function renderAll() {
    renderFilters(); renderLibrary();
    if (state.tax && !state.tax.dirty) resetTax();
    if (state.xd && !state.xd.dirty) resetXd();
    $('#libCount').textContent = state.data.resources.length;
  }

  $('#outBtn').addEventListener('click', () => signOut('Signed out.'));
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2) + '\n'], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'resources-backup-' + today() + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('Backup downloaded');
  });
  $('#undoBtn').addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Undo the last change?', body: `<p>${esc(state.headMsg.replace(AC.commitPrefix, '').trim())}</p><p>This adds a new commit that restores everything to how it was before. Nothing is erased from history.</p>`, ok: 'Undo it' });
    if (!ok) return;
    try {
      const c = await withBusy('Undoing', (step) => GH.undoLast(step));
      await reload(); refreshHead();
      doneDialog({ title: 'Change undone', body: 'The site updates after Render redeploys.', url: c.url });
    } catch (e) { showError(e); }
  });

  // Hooks the shared reader expects
  window.App = {
    fileName: (r) => slug(r.title || 'resource') + '.pdf', reportHref: () => '#', download: () => {}, toggleSave: () => {},
    isSaved: () => false, share: () => {}, closeReader: () => Viewer.close(), pageChanged: () => {}, shareOpen: () => false
  };

  /* ---------- init ---------- */
  $('#repoName').textContent = $('#repoName2').textContent = `${AC.owner}/${AC.repo}`;
  $('#idleMin').textContent = AC.idleMinutes;
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('#loginBtn'), t = $('#tokenIn').value.trim(); if (!t) return;
    btn.disabled = true; btn.textContent = 'Checking';
    try { await signIn(t); }
    catch (err) { GH.signOut(); const el = $('#loginErr'); el.hidden = false; el.textContent = err.message || 'Sign in failed.'; }
    finally { btn.disabled = false; btn.textContent = 'Sign in'; }
  });

  (async function boot() {
    const t = SS.get('icse:adm:t'), last = Number(SS.get('icse:adm:last')) || 0;
    if (t && Date.now() - last < AC.idleMinutes * 60000) {
      try { await signIn(t); return; } catch (e) { SS.del('icse:adm:t'); showLogin(e.message); return; }
    }
    if (t) { SS.del('icse:adm:t'); showLogin('You were signed out after ' + AC.idleMinutes + ' minutes of inactivity.'); return; }
    showLogin();
  })();
})();
