// Library page: search, filters, sorting, cards, bookmarks, sharing,
// download counter and deep links. The reader lives in viewer.js.
(() => {
  'use strict';
  const CFG = window.ICSE_CONFIG;
  const $ = (s, r = document) => r.querySelector(s);
  const el = {
    q: $('#q'), form: $('#searchForm'), clear: $('#qClear'), quick: $('#quick'),
    strip: $('#strip'), subjects: $('#subjectGrid'), grid: $('#grid'), count: $('#count'),
    chipsClass: $('#chipsClass'), rowClass: $('#rowClass'), chipsSubject: $('#chipsSubject'),
    chipsType: $('#chipsType'), chipsYear: $('#chipsYear'), sort: $('#sortSeg'),
    savedBtn: $('#savedBtn'), filterBtn: $('#filterBtn'), filterCount: $('#filterCount'), filters: $('#filters'), popBtn: $('#popBtn'), savedCount: $('#savedCount'), recentSub: $('#recentSub'),
    spot: $('#spot'), page: $('#page'),
    dlg: $('#shareDlg'), shName: $('#shName'), shLink: $('#shLink'), shQr: $('#shQr'),
    shCopy: $('#shCopy'), shNative: $('#shNative'), shWa: $('#shWa'), shReport: $('#shReport'), shClose: $('#shClose'),
    toasts: $('#toasts'), note: $('#autoNote')
  };

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };
  const session = {
    get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } }
  };

  const state = {
    res: [], byId: new Map(), subjects: new Map(), types: [],
    q: '', rest: '', auto: {}, cls: [], subject: [], type: [], year: [], sort: 'year', savedOnly: false, popOnly: false,
    saved: new Set(store.get('icse:saved', [])), live: {}, shareFor: null, pushed: false
  };

  /* ---------- helpers ---------- */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const icon = (n) => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const dlCount = (r) => (r.downloads || 0) + (state.live[r.id] || 0);
  const fmtCount = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : String(n));
  const fmtSize = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB');
  const daysAgo = (r) => Math.floor((Date.now() - r._date) / 864e5);
  const isNew = (r) => daysAgo(r) <= CFG.newDays;
  const isPopular = (r) => r.popular === true || dlCount(r) >= CFG.popularMin;
  const fileName = (r) => slug(r.title) + '.pdf';
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

  function when(r) {
    const d = daysAgo(r);
    if (d <= 0) return 'Added today';
    if (d === 1) return 'Added yesterday';
    if (d < 14) return `Added ${d} days ago`;
    if (d < 60) return `Added ${Math.floor(d / 7)} weeks ago`;
    return 'Added ' + new Date(r._date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  function toast(msg, ms) {
    const host = window.Viewer ? Viewer.fullscreenHost() : document.body;
    if (el.toasts.parentNode !== host) host.appendChild(el.toasts);
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    el.toasts.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 280); }, ms || 2600);
  }

  /* ---------- data ---------- */
  async function load() {
    try {
      const r = await fetch(CFG.dataUrl, { cache: 'no-cache' });
      if (!r.ok) throw new Error(r.status);
      const data = await r.json();
      data.subjects.forEach((s) => state.subjects.set(s.id, s));
      state.types = data.types || [];
      state.res = data.resources.filter((r) => !r.draft).map((r) => {
        const s = state.subjects.get(r.subject) || { name: r.subject, accent: '#fff' };
        return Object.assign({}, r, {
          subject_name: s.name, accent: s.accent, codes: [s.code, s.altCode].filter(Boolean),
          _date: new Date(r.added + 'T00:00:00').getTime() || 0,
          _hay: [r.title, s.name, [s.code, s.altCode].filter(Boolean).join(' '), r.type, r.year, 'class ' + r.class, (r.tags || []).join(' '), r.description || ''].join(' ').toLowerCase()
        });
      });
      state.res.forEach((r) => state.byId.set(r.id, r));
      if (window.Exam && Exam.setDefaults) Exam.setDefaults(data.examDefaults);   // per-subject exam times and marks set in the admin
    } catch (e) {
      console.error(e);
      el.grid.innerHTML = `<div class="empty glass"><h3>Resources could not load</h3><p>Refresh the page. If it keeps happening, the resource list is missing or has a typo.</p></div>`;
      return false;
    }
    return true;
  }

  /* ---------- filtering ---------- */
  /* Smart search: "Icse Computer paper 2025" selects Computer Applications + 2025
     and leaves only the words it could not place as plain text search. */
  const STOP = new Set(('icse isc class tenth board exam examination examinations free download downloads pdf pdfs ' +
    'paper papers question questions solved latest new for of the and with in on a an to me my please ' +
    'study material materials resource resources sheet sheets bank banks year years pyq pyqs last past ').split(/\s+/).filter(Boolean));
  const SUBJ_ALIAS = { cs: 'computer', comp: 'computer', java: 'computer', maths: 'mathematics', math: 'mathematics',
    geo: 'geography', bio: 'biology', chem: 'chemistry', phy: 'physics', hist: 'history', eco: 'economic',
    econ: 'economic', lit: 'literature', lang: 'language', comm: 'commercial', commerce: 'commercial' };
  const TYPE_ALIAS = { pyq: 'previous', pyqs: 'previous', past: 'previous', qb: 'bank', formulas: 'formula', formulae: 'formula' };
  const GENERIC_TYPE_WORD = new Set(['paper', 'year', 'sheet', 'question']);
  const sing = (w) => w.replace(/(ies)$/, 'y').replace(/s$/, '');
  const GENERIC_SUBJ_WORD = new Set(['application', 'applications', 'and', 'of', 'the', 'studies']);

  function parseQuery(raw) {
    const out = { cls: '', subject: '', type: '', year: '', rest: '', labels: [] };
    let text = ' ' + String(raw || '').toLowerCase().replace(/[^a-z0-9\s-]+/g, ' ').replace(/-/g, ' ') + ' ';
    // year (2024-25 style also lands on 2024)
    const ym = text.match(/\b(20\d{2})\b/);
    if (ym) { out.year = ym[1]; text = text.replace(/\b20\d{2}(\s+\d{2,4})?\b/, ' '); }
    // class
    if (/\bclass\s+(10|x)\b|\b10th\b|\btenth\b/.test(text)) {
      const c = [...new Set(state.res.map((r) => r.class))].find((v) => /^(10|x)$/i.test(v));
      if (c) out.cls = c;
      text = text.replace(/\bclass\s+(10|x)\b|\b10th\b|\btenth\b/g, ' ');
    }
    // "last year", "previous year" phrases first
    text = text.replace(/\b(last|previous|past)\s+years?\b/g, ' pyq ');
    let toks = text.split(/\s+/).filter(Boolean);

    // type: match distinctive words of exactly one type
    const hits = new Map();
    state.types.forEach((t) => {
      const words = t.toLowerCase().split(/\s+/).map(sing);
      const distinct = words.filter((w) => !GENERIC_TYPE_WORD.has(w));
      toks.forEach((tok) => {
        const w = sing(TYPE_ALIAS[tok] || tok);
        if (distinct.includes(w) || (words.includes(w) && !GENERIC_TYPE_WORD.has(w))) {
          if (!hits.has(t)) hits.set(t, new Set()); hits.get(t).add(tok);
        }
      });
    });
    if (hits.size === 1) {
      const [t, used] = [...hits.entries()][0];
      out.type = t; toks = toks.filter((x) => !used.has(x));
      // "question bank" leaves a stray "question"
      if (/bank/i.test(t)) toks = toks.filter((x) => x !== 'question' && x !== 'questions');
    }

    // subject: every placeable word must agree on one subject
    const subs = [...state.subjects.values()];
    const matchWord = (tok, sj) => {
      const keys = [sj.id, sj.code, sj.altCode].filter(Boolean).map((k) => String(k).toLowerCase());
      if (keys.includes(tok)) return true;
      const words = sj.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC_SUBJ_WORD.has(w));
      const a = SUBJ_ALIAS[tok];
      return words.some((w) => w === tok || (a && w.startsWith(a)) || (tok.length >= 4 && (w.startsWith(tok) || (tok.startsWith(w) && w.length >= 4))));
    };
    let cand = null; const used = [];
    toks.forEach((tok) => {
      if (STOP.has(tok) || GENERIC_SUBJ_WORD.has(tok)) return;
      const m = new Set(subs.filter((sj) => matchWord(tok, sj)).map((sj) => sj.id));
      if (!m.size) return;
      const next = cand ? new Set([...cand].filter((id) => m.has(id))) : m;
      if (!next.size) return;                  // conflicting word: treat as plain text
      cand = next; used.push(tok);
    });
    if (cand && cand.size === 1) {
      out.subject = [...cand][0];
      toks = toks.filter((x) => !used.includes(x) && !GENERIC_SUBJ_WORD.has(x));
    }
    out.rest = toks.filter((x) => !STOP.has(x)).join(' ');
    if (out.subject) out.labels.push(state.subjects.get(out.subject).name);
    if (out.type) out.labels.push(out.type);
    if (out.year) out.labels.push(out.year);
    if (out.cls) out.labels.push('Class ' + out.cls);
    return out;
  }

  function applyQuery(v) {
    const p = parseQuery(v);
    ['cls', 'subject', 'type', 'year'].forEach((k) => {
      if (p[k]) { state[k] = [p[k]]; state.auto[k] = true; }
      else if (state.auto[k]) { state[k] = []; state.auto[k] = false; }
    });
    state.rest = p.rest;
    return p;
  }

  function visible() {
    const tokens = state.rest.split(/\s+/).filter(Boolean);
    const list = state.res.filter((r) =>
      (!state.savedOnly || state.saved.has(r.id)) &&
      (!state.popOnly || isPopular(r)) &&
      (!state.cls.length || state.cls.includes(r.class)) &&
      (!state.subject.length || state.subject.includes(r.subject)) &&
      (!state.type.length || state.type.includes(r.type)) &&
      (!state.year.length || state.year.includes(String(r.year))) &&
      tokens.every((t) => r._hay.includes(t)));
    const by = {
      // Latest year: newest year first (2027, 2026, 2025 ...), newest upload first inside a year
      year: (a, b) => Number(b.year) - Number(a.year) || b._date - a._date || a.title.localeCompare(b.title),
      // Oldest added: earliest upload date first
      old: (a, b) => a._date - b._date || a.title.localeCompare(b.title),
      popular: (a, b) => dlCount(b) - dlCount(a) || a.title.localeCompare(b.title)
    }[state.sort] || ((a, b) => Number(b.year) - Number(a.year) || a.title.localeCompare(b.title));
    // With no filter or search active, "Latest year" groups by subject in the order set in config.js (subjectOrder),
    // and sorts by year inside each subject. "Oldest added" and "Most downloaded" sort the whole list exactly as
    // their label says, with no subject grouping.
    const order = CFG.subjectOrder || [];
    const rank = (r) => { const i = order.indexOf(r.subject); return i < 0 ? order.length : i; };
    const grouped = state.sort === 'year' && !(state.q || state.cls.length || state.subject.length || state.type.length || state.year.length || state.savedOnly);
    return list.sort((a, b) => (grouped ? rank(a) - rank(b) : 0) || by(a, b));
  }
  const filtering = () => !!(state.q || state.cls.length || state.subject.length || state.type.length || state.year.length || state.savedOnly || state.popOnly);

  /* ---------- rendering ---------- */
  function badges(r) {
    return (isNew(r) ? '<span class="badge new">New</span>' : '') + (isPopular(r) ? '<span class="badge pop">Popular</span>' : '');
  }
  function readHref(r) { return location.pathname + '?file=' + encodeURIComponent(r.id); }

  const examOk = (r) => !!(window.Exam && Exam.eligible(r));
  // While a timed exam with a hidden marking scheme runs on a paper, its Download button is switched off
  const dlLocked = (r) => !!(window.Exam && Exam.locksDownload && Exam.locksDownload(r));
  const LOCK_TIP = 'Available when your exam ends';
  const dlBtn = (r) => dlLocked(r)
    ? `<button class="btn" type="button" disabled title="${LOCK_TIP}">${icon('download')}Download</button>`
    : `<a class="btn btn-primary" href="${esc(r.file)}" download="${esc(fileName(r))}" data-act="download" aria-label="Download ${esc(r.title)}">${icon('download')}Download</a>`;
  const dlMini = (r) => dlLocked(r)
    ? `<button class="btn" style="height:36px;padding:0 12px" type="button" disabled title="${LOCK_TIP}">${icon('download')}PDF</button>`
    : `<a class="btn btn-primary" style="height:36px;padding:0 12px" href="${esc(r.file)}" download="${esc(fileName(r))}" data-act="download" aria-label="Download ${esc(r.title)}">${icon('download')}PDF</a>`;

  function cardHtml(r) {
    const saved = state.saved.has(r.id);
    return `
    <article class="card glass gh" style="--accent:${esc(r.accent)}" data-id="${esc(r.id)}">
      <button class="ib corner ${saved ? 'saved' : ''}" data-act="save" aria-pressed="${saved}" aria-label="${saved ? 'Remove bookmark' : 'Save to bookmarks'}" title="Bookmark">${icon('bookmark')}</button>
      <div class="tags">
        <span class="sj"><i class="dot"></i>${esc(r.subject_name)}</span><span class="ty">${esc(r.type)}</span>${badges(r)}
      </div>
      <h3><a href="${esc(readHref(r))}" data-act="read" tabindex="-1">${esc(r.title)}</a></h3>
      <p class="desc">${esc(r.description || '')}</p>
      <div class="facts">
        <span>Class ${esc(r.class)}, ${esc(r.year)}</span>
        ${r.codes && r.codes.length ? `<span>Code ${esc(r.codes.join(', '))}</span>` : ''}
        ${r.pages ? `<span>${plural(r.pages, 'page')}</span>` : ''}
        ${r.size_kb ? `<span>${fmtSize(r.size_kb)}</span>` : ''}
        <span><span data-count="${esc(r.id)}">${fmtCount(dlCount(r))}</span> downloads</span>
      </div>
      <div class="acts">
        <a class="btn" href="${esc(readHref(r))}" data-act="read" aria-label="Read ${esc(r.title)}">${icon('read')}Read</a>
        ${dlBtn(r)}
      </div>
      <div class="more">
        <span>${examOk(r) ? `<button class="x-start" type="button" data-act="exam" aria-label="Start a timed exam: ${esc(r.title)}">${icon('timer')}Timed exam</button>` : ''}</span>
        <span>
          <button class="ib" data-act="share" aria-label="Share ${esc(r.title)}" title="Share">${icon('share')}</button>
          <a class="ib" href="${esc(reportHref(r))}" target="_blank" rel="noopener" aria-label="Report an error in ${esc(r.title)}" title="Report an error">${icon('flag')}</a>
        </span>
      </div>
    </article>`;
  }

  function miniHtml(r) {
    return `
    <article class="mini glass gh" style="--accent:${esc(r.accent)}" data-id="${esc(r.id)}">
      <div class="tl"><i class="dot"></i>${esc(r.subject_name)}${badges(r)}</div>
      <h3><a href="${esc(readHref(r))}" data-act="read">${esc(r.title)}</a></h3>
      <div class="row">
        <span class="when">${esc(when(r))}</span>
        ${dlMini(r)}
      </div>
    </article>`;
  }

  function renderGrid() {
    const list = visible();
    document.body.classList.toggle('is-filtering', filtering());
    el.clear.hidden = !state.q;

    if (!list.length) {
      let msg = 'Try fewer words, or clear the filters.', title = 'Nothing matches that';
      if (state.savedOnly && !state.saved.size) { title = 'No saved resources yet'; msg = 'Use the bookmark on any resource to keep it here.'; }
      el.grid.innerHTML = `<div class="empty glass"><h3>${title}</h3><p>${msg}</p><button class="btn" data-act="reset" type="button">Clear search and filters</button></div>`;
    } else {
      el.grid.innerHTML = list.map(cardHtml).join('');
    }
    const autoLabels = [];
    if (state.auto.subject && state.subject.length) autoLabels.push(state.subjects.get(state.subject[0]).name);
    if (state.auto.type && state.type.length) autoLabels.push(state.type[0]);
    if (state.auto.year && state.year.length) autoLabels.push(state.year[0]);
    if (state.auto.cls && state.cls.length) autoLabels.push('Class ' + state.cls[0]);
    const shown = state.rest || (!autoLabels.length ? state.q : '');
    const q = (autoLabels.length ? ` in <b>${esc(autoLabels.join(', '))}</b>` : '') + (shown ? ` for <b>“${esc(shown)}”</b>` : '');
    el.note.hidden = !autoLabels.length;
    el.note.innerHTML = autoLabels.length ? 'Filters applied from your search: ' + autoLabels.map((l) => `<span>${esc(l)}</span>`).join('') : '';
    el.count.innerHTML = `<b>${list.length}</b> ${list.length === 1 ? 'resource' : 'resources'}${q}` +
      (filtering() ? '<button type="button" data-act="reset">Clear all</button>' : '');
  }

  function chip(label, value, active, accent) {
    return `<button class="chip" type="button" data-v="${esc(value)}" aria-pressed="${active}">${accent ? `<i class="dot" style="--accent:${esc(accent)}"></i>` : ''}${esc(label)}</button>`;
  }
  // Every value a filter row can offer, in display order
  function options(k) {
    if (k === 'cls') return [...new Set(state.res.map((r) => r.class))].sort();
    if (k === 'subject') return [...state.subjects.values()].filter((s) => state.res.some((r) => r.subject === s.id)).map((s) => s.id);
    if (k === 'type') return state.types.filter((t) => state.res.some((r) => r.type === t));
    return [...new Set(state.res.map((r) => String(r.year)))].sort().reverse();
  }
  // Click on a chip: "All" clears; others toggle. Picking every option is the same as All.
  function toggleFilter(k, v) {
    if (!v) { state[k] = []; return; }
    const set = new Set(state[k]);
    set.has(v) ? set.delete(v) : set.add(v);
    const all = options(k);
    state[k] = set.size >= all.length ? [] : all.filter((x) => set.has(x));
  }
  function renderChips() {
    const on = (k, v) => state[k].includes(v);
    const allOf = (k) => !state[k].length;
    const classes = options('cls');
    el.rowClass.hidden = classes.length < 2;
    el.chipsClass.innerHTML = chip('All', '', allOf('cls')) + classes.map((c) => chip('Class ' + c, c, on('cls', c))).join('');
    el.chipsSubject.innerHTML = chip('All', '', allOf('subject')) + options('subject').map((id) => { const s = state.subjects.get(id); return chip(s.name, id, on('subject', id), s.accent); }).join('');
    el.chipsType.innerHTML = chip('All', '', allOf('type')) + options('type').map((t) => chip(t, t, on('type', t))).join('');
    el.chipsYear.innerHTML = chip('All', '', allOf('year')) + options('year').map((y) => chip(y, y, on('year', y))).join('');
    el.sort.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sort === state.sort));
    el.savedBtn.setAttribute('aria-pressed', state.savedOnly);
    el.popBtn.setAttribute('aria-pressed', state.popOnly);
    const nf = ['cls', 'subject', 'type', 'year'].filter((k) => state[k].length).length;
    el.filterCount.textContent = nf; el.filterCount.hidden = !nf;
    el.savedCount.textContent = state.saved.size;
  }

  function renderSubjects() {
    el.subjects.innerHTML = [...state.subjects.values()].map((s) => {
      const items = state.res.filter((r) => r.subject === s.id);
      if (!items.length) return '';
      const types = new Set(items.map((r) => r.type)).size;
      return `<button class="subj glass gh" type="button" data-subject="${esc(s.id)}" style="--accent:${esc(s.accent)}" aria-label="${esc(s.name)}, ${plural(items.length, 'resource')}">
        <span class="top"><i class="dot"></i><span class="cnt">${items.length}</span></span>
        <span><h3>${esc(s.name)}</h3><span class="meta">${s.code || s.altCode ? 'Code ' + esc([s.code, s.altCode].filter(Boolean).join(', ')) : plural(types, 'type') + ' of material'}</span></span>
      </button>`;
    }).join('');
  }

  function renderStrip() {
    const recent = [...state.res].sort((a, b) => b._date - a._date).slice(0, 7);
    el.strip.innerHTML = recent.map(miniHtml).join('');
    el.recentSub.textContent = recent.length ? 'Latest ' + recent.length + ' uploads' : '';
  }

  function renderQuick() {
    const list = CFG.quickSearches || [];
    el.quick.innerHTML = list.length ? '<span>Try</span>' + list.map((t) => `<button type="button" data-q="${esc(t)}">${esc(t)}</button>`).join('') : '';
  }

  /* ---------- continue where you left off (signed-in students; progress is kept by account.js) ---------- */
  const cont = { box: $('#continue'), strip: $('#contStrip'), sub: $('#contSub') };
  function contHtml(x, r) {
    const total = x.n || r.pages || 0;
    const pct = total > 0 ? Math.min(100, Math.round((x.p / total) * 100)) : 0;
    const where = total > 0 ? `Page ${x.p} of ${total}` : `Page ${x.p}`;
    return `
    <article class="mini cont glass gh" style="--accent:${esc(r.accent)};--p:${pct / 100}" data-id="${esc(r.id)}">
      <button class="ib cont-x" type="button" data-act="forget" aria-label="Remove ${esc(r.title)} from this list" title="Remove from this list">${icon('close')}</button>
      <div class="tl"><i class="dot"></i>${esc(r.subject_name)}</div>
      <h3><a href="${esc(readHref(r))}" data-act="read">${esc(r.title)}</a></h3>
      <div class="cont-bar" role="img" aria-label="${pct}% read"><i></i></div>
      <div class="row">
        <span class="when">${esc(where)}${pct ? ' &middot; ' + pct + '%' : ''}</span>
        <a class="btn btn-primary" style="height:36px;padding:0 14px" href="${esc(readHref(r))}" data-act="read">${icon('read')}Resume</a>
      </div>
    </article>`;
  }
  function renderContinue() {
    if (!cont.box) return;
    const A = window.Account;
    const items = A && A.signedIn() && state.byId.size
      ? A.recent(12).map((x) => ({ x, r: state.byId.get(x.rid) })).filter((o) => o.r).slice(0, 8)
      : [];
    cont.box.hidden = !items.length;
    cont.strip.innerHTML = items.map((o) => contHtml(o.x, o.r)).join('');
    cont.sub.textContent = items.length ? 'Pick up your last ' + (items.length === 1 ? 'paper' : items.length + ' papers') : '';
  }
  addEventListener('account:state', renderContinue);
  addEventListener('account:data', renderContinue);
  addEventListener('viewer:close', () => setTimeout(renderContinue, 450));

  function renderAll() { renderChips(); renderSubjects(); renderStrip(); renderContinue(); renderGrid(); renderHistory(); }

  function refreshSavedUI() {
    el.savedCount.textContent = state.saved.size;
    document.querySelectorAll('[data-act="save"]').forEach((b) => {
      const on = state.saved.has(b.closest('[data-id]').dataset.id);
      b.classList.toggle('saved', on); b.setAttribute('aria-pressed', on);
      b.setAttribute('aria-label', on ? 'Remove bookmark' : 'Save to bookmarks');
    });
  }
  function refreshCounts() {
    document.querySelectorAll('[data-count]').forEach((n) => {
      const r = state.byId.get(n.dataset.count); if (r) n.textContent = fmtCount(dlCount(r));
    });
  }

  /* ---------- bookmarks ---------- */
  function isSaved(id) { return state.saved.has(id); }
  function toggleSave(id) {
    const on = !state.saved.has(id);
    on ? state.saved.add(id) : state.saved.delete(id);
    store.set('icse:saved', [...state.saved]);
    window.dispatchEvent(new Event('icse:saved'));   // account sync
    refreshSavedUI();
    toast(on ? 'Saved to bookmarks' : 'Removed from bookmarks');
    if (state.savedOnly && !on) renderGrid();
  }
  // Used by account.js after it merges or loads the bookmarks saved on the student's account
  function applySaved(ids) {
    state.saved = new Set(ids);
    refreshSavedUI();
    if (state.savedOnly && state.byId.size) renderGrid();
  }
  function applyPrefs(p) {
    if (p && ['year', 'old', 'popular'].includes(p.sort) && p.sort !== state.sort) {
      state.sort = p.sort;
      if (state.byId.size) { renderChips(); renderGrid(); }
    }
  }

  /* ---------- downloads + counter ---------- */
  async function loadCounts() {
    const c = CFG.counter, C = window.ICSE_COUNTER;
    if (!c || !c.enabled || !C || !C.ready()) return;
    const cache = store.get('icse:counts2', null);
    if (cache && Date.now() - cache.t < (c.cacheMinutes || 10) * 6e4) { state.live = cache.v; refreshCounts(); return; }
    const v = await C.fetchAll();            // one request for every paper; null if it failed
    if (v) { state.live = v; store.set('icse:counts2', { t: Date.now(), v }); }
    else if (cache) state.live = cache.v;    // keep the last good numbers instead of dropping to 0
    refreshCounts();
  }
  // Every click on a Download button counts: the number on screen goes up at once, and the saved copy of the counts follows.
  function download(r) {
    toast('Download started');
    const c = CFG.counter;
    if (c && c.enabled && window.ICSE_COUNTER && window.ICSE_COUNTER.ready()) {
      window.ICSE_COUNTER.hit(r.id);
      state.live[r.id] = (state.live[r.id] || 0) + 1;
      const cache = store.get('icse:counts2', null);
      if (cache && cache.v) { cache.v[r.id] = (cache.v[r.id] || 0) + 1; store.set('icse:counts2', cache); }
      refreshCounts();
    }
  }

  /* ---------- report + share ---------- */
  function reportHref(r) {
    const link = location.origin + CFG.basePath + '?file=' + encodeURIComponent(r.id);
    const subject = `Error report: ${r.title}`;
    const body = `Resource: ${r.title}\nLink: ${link}\n\nWhat is wrong (page number and details):\n`;
    return `mailto:${CFG.reportEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }
  function shareLink(r) { return location.origin + CFG.basePath + '?file=' + encodeURIComponent(r.id); }

  function qrSvg(text) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(); let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><path d="${d}" fill="#000"/></svg>`;
  }

  let shareReturn = null;
  function share(r) {
    state.shareFor = r;
    const link = shareLink(r);
    el.shName.textContent = r.title;
    el.shLink.value = link;
    el.shQr.innerHTML = qrSvg(link);
    el.shReport.href = reportHref(r);
    el.shWa.href = 'https://wa.me/?text=' + encodeURIComponent(r.title + ' (ICSE Class 10)\n' + link);
    el.shNative.hidden = !navigator.share;
    const host = Viewer.fullscreenHost();
    if (el.dlg.parentNode !== host) host.appendChild(el.dlg);
    shareReturn = document.activeElement;
    el.dlg.hidden = false;
    el.shCopy.focus();
  }
  function closeShare() {
    el.dlg.hidden = true; state.shareFor = null;
    if (shareReturn && shareReturn.focus) shareReturn.focus({ preventScroll: true });
  }
  el.shClose.addEventListener('click', closeShare);
  el.dlg.addEventListener('click', (e) => { if (e.target === el.dlg) closeShare(); });
  el.dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeShare(); }
    if (e.key === 'Tab') {
      const f = [...el.dlg.querySelectorAll('button:not([hidden]),a[href],input')];
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
  el.shCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(el.shLink.value); }
    catch { el.shLink.select(); document.execCommand && document.execCommand('copy'); }
    toast('Link copied');
  });
  el.shLink.addEventListener('focus', () => el.shLink.select());
  el.shNative.addEventListener('click', () => {
    const r = state.shareFor; if (!r) return;
    navigator.share({ title: r.title, text: r.title + ' (ICSE Class X)', url: shareLink(r) }).catch(() => {});
  });

  /* ---------- reader + deep links ---------- */
  function openReader(r, page, exam) {
    // One exam at a time: asking for a second one must not open that paper's reader first
    const running = exam && window.Exam && Exam.active ? Exam.active() : null;
    if (running && running.id !== r.id) { toast('Finish your current exam first'); return; }
    const u = new URL(location.href);
    u.searchParams.set('file', r.id);
    page ? u.searchParams.set('page', page) : u.searchParams.delete('page');
    if (!Viewer.isOpen()) { history.pushState({ reader: true }, '', u); state.pushed = true; }
    else history.replaceState(history.state, '', u);
    Viewer.open(r, page);
    if (exam && window.Exam) Exam.prompt(r);
  }
  // While a timed exam is running on this paper, closing asks for confirmation first
  function closeReader() {
    if (window.Exam && Exam.confirmLeave(closeReaderNow)) return;
    closeReaderNow();
  }
  function closeReaderNow() {
    if (state.shareFor) closeShare();
    Viewer.close();
    if (history.state && history.state.reader) { state.pushed = false; history.back(); }
    else cleanUrl();
  }
  function cleanUrl() {
    const u = new URL(location.href);
    u.searchParams.delete('file'); u.searchParams.delete('page');
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
  }
  function pageChanged(n) {
    if (!Viewer.isOpen()) return;
    const u = new URL(location.href);
    if (!u.searchParams.get('file')) return;
    n > 1 ? u.searchParams.set('page', n) : u.searchParams.delete('page');
    history.replaceState(history.state, '', u);
  }
  function syncFromUrl(initial) {
    const p = new URLSearchParams(location.search);
    const id = p.get('file');
    if (!id) { if (Viewer.isOpen()) Viewer.close(); return; }
    const r = state.byId.get(id);
    if (!r) { toast('That file could not be found'); cleanUrl(); return; }
    if (initial && !history.state) history.replaceState({ reader: false }, '', location.href);
    Viewer.open(r, parseInt(p.get('page'), 10) || 0);
    if (p.get('exam') === '1') {   // ?file=ID&exam=1 opens the paper with the timer dialog
      const u = new URL(location.href); u.searchParams.delete('exam');
      history.replaceState(history.state, '', u);
      if (window.Exam) Exam.prompt(r);
    }
  }
  addEventListener('popstate', () => syncFromUrl(false));
  addEventListener('exam:change', () => { if (state.byId.size) { renderGrid(); renderStrip(); } });

  /* ---------- search + filters ---------- */
  // ?q= is kept in the address bar so a search can be shared or bookmarked
  function syncQueryUrl() {
    if (Viewer.isOpen()) return;
    const u = new URL(location.href);
    state.q ? u.searchParams.set('q', state.q) : u.searchParams.delete('q');
    history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash);
  }
  // Starting filters from ?q= / ?subject= / ?type= / ?year= or from a generated landing page
  function readStartFilters() {
    const p = new URLSearchParams(location.search);
    // Landing pages carry their starting filters in a JSON data block (an inline script would break the CSP)
    let seo = {};
    try { const el = document.getElementById('seo-preset'); if (el) seo = JSON.parse(el.textContent) || {}; } catch (e) { /* ignore */ }
    const pre = Object.assign({}, seo);
    ['subject', 'type', 'year'].forEach((k) => { if (p.get(k)) pre[k] = p.get(k); });
    const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const list = (v) => String(v).split(',').map((x) => x.trim()).filter(Boolean);
    if (pre.subject) {
      state.subject = list(pre.subject).map((v) => [...state.subjects.values()].find((x) => x.id === v || norm(x.name) === norm(v) || norm(x.id) === norm(v))).filter(Boolean).map((x) => x.id);
    }
    if (pre.type) state.type = list(pre.type).map((v) => state.types.find((x) => x === v || norm(x) === norm(v))).filter(Boolean);
    if (pre.year) state.year = list(pre.year).map(String);
    ['subject', 'type', 'year'].forEach((k) => { if (state[k].length >= options(k).length) state[k] = []; });
    if (p.get('q')) { el.q.value = state.q = p.get('q'); applyQuery(state.q); }
  }
  function setQuery(v, focus) {
    state.q = v; el.q.value = v;
    applyQuery(v); renderChips(); renderGrid(); syncQueryUrl();
    if (focus) el.q.focus();
  }
  function focusSearch() {
    el.q.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.q.focus({ preventScroll: true }); el.q.select();
  }
  function resetAll() {
    Object.assign(state, { q: '', rest: '', auto: {}, cls: [], subject: [], type: [], year: [], savedOnly: false, popOnly: false });
    el.q.value = ''; renderChips(); renderGrid(); syncQueryUrl();
  }

  el.q.addEventListener('input', () => setQuery(el.q.value));
  el.form.addEventListener('submit', (e) => { e.preventDefault(); $('#library').scrollIntoView({ behavior: 'smooth' }); });
  el.clear.addEventListener('click', () => setQuery('', true));
  el.quick.addEventListener('click', (e) => { const b = e.target.closest('[data-q]'); if (b) setQuery(b.dataset.q, true); });

  function bindChips(node, key) {
    node.addEventListener('click', (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      // Re-rendering can show or hide sections above the filters (e.g. "Just added") and
      // replaces the clicked chip, so keep the filter row exactly where it was on screen.
      const before = node.getBoundingClientRect().top;
      toggleFilter(key, b.dataset.v); state.auto[key] = false; renderChips(); renderGrid();
      const shift = node.getBoundingClientRect().top - before;
      if (shift) window.scrollBy({ top: shift, left: 0, behavior: 'instant' });
    });
  }
  bindChips(el.chipsClass, 'cls'); bindChips(el.chipsSubject, 'subject');
  bindChips(el.chipsType, 'type'); bindChips(el.chipsYear, 'year');

  el.sort.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    state.sort = b.dataset.sort; store.set('icse:sort', state.sort);
    window.dispatchEvent(new CustomEvent('icse:pref', { detail: { key: 'sort', value: state.sort } }));   // account sync
    renderChips(); renderGrid();
  });
  el.filterBtn.addEventListener('click', () => {
    const open = el.filters.hidden;
    el.filters.hidden = !open; el.filterBtn.setAttribute('aria-expanded', open);
  });
  el.popBtn.addEventListener('click', () => { state.popOnly = !state.popOnly; renderChips(); renderGrid(); });
  el.savedBtn.addEventListener('click', () => {
    state.savedOnly = !state.savedOnly; renderChips(); renderGrid();
    if (state.savedOnly) $('#library').scrollIntoView({ behavior: 'smooth' });
  });
  el.subjects.addEventListener('click', (e) => {
    const b = e.target.closest('[data-subject]'); if (!b) return;
    state.subject = [b.dataset.subject]; state.auto.subject = false; renderChips(); renderGrid();
    requestAnimationFrame(() => $('#library').scrollIntoView({ behavior: 'smooth' }));
  });

  // Card / strip actions (event delegation)
  function onAction(e) {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const card = t.closest('[data-id]');
    const r = card && state.byId.get(card.dataset.id);
    switch (t.dataset.act) {
      case 'read':
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // let the browser open a new tab
        e.preventDefault(); openReader(r); break;
      case 'exam': e.preventDefault(); openReader(r, 0, true); break;
      case 'download': download(r); break;           // native download proceeds
      case 'save': toggleSave(r.id); break;
      case 'share': share(r); break;
      case 'reset': resetAll(); break;
    }
  }
  el.grid.addEventListener('click', onAction);
  el.strip.addEventListener('click', onAction);
  el.count.addEventListener('click', onAction);
  if (cont.strip) cont.strip.addEventListener('click', (e) => {
    const f = e.target.closest('[data-act="forget"]');
    if (f) { const card = f.closest('[data-id]'); if (card && window.Account) Account.forget(card.dataset.id); return; }
    onAction(e);
  });

  // Pointer glow
  let px = 0, py = 0, raf = 0;
  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    px = e.clientX; py = e.clientY;
    const c = e.target.closest && e.target.closest('.gh');
    if (c) { const r = c.getBoundingClientRect(); c.style.setProperty('--mx', e.clientX - r.left + 'px'); c.style.setProperty('--my', e.clientY - r.top + 'px'); }
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; el.spot.style.transform = `translate(${px}px, ${py}px)`; el.spot.classList.add('on'); });
  }, { passive: true });
  document.addEventListener('pointerleave', () => el.spot.classList.remove('on'));

  // Keyboard shortcuts (the reader handles its own keys while open)
  document.addEventListener('keydown', (e) => {
    if (Viewer.isOpen() || !el.dlg.hidden) return;
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); focusSearch(); }
    else if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey) { e.preventDefault(); focusSearch(); }
    else if (e.key === 'Escape' && e.target === el.q) { if (state.q) setQuery(''); else el.q.blur(); }
  });

  /* ---------- exam history (attempts are kept by exam.js, in this browser) ---------- */
  const hist = { box: $('#history'), list: $('#histList'), sub: $('#histSub'), btn: $('#histBtn'), count: $('#histCount'), clear: $('#histClear'), close: $('#histClose') };
  function histCard(a) {
    const sub = state.subjects.get(a.subject);
    const pct = a.score != null && a.max > 0 ? Math.round((a.score / a.max) * 1000) / 10 : null;
    const known = state.byId.has(a.rid);
    const title = known ? `<a href="/?file=${encodeURIComponent(a.rid)}" data-hopen="${esc(a.rid)}">${esc(a.title)}</a>` : esc(a.title);
    const label = [sub ? sub.name : '', a.year, a.type].filter(Boolean).map(esc).join(' &middot; ');
    return `<article class="hist glass" style="--accent:${esc(sub ? sub.accent : '#9aa0a6')};--p:${pct == null ? 0 : Math.min(1, pct / 100)}">
      <div class="h-main">
        <div class="tl"><i class="dot"></i><span>${label}</span><span class="h-when">${esc(Exam.fmtAt(a.at))}</span></div>
        <h3>${title}</h3>
        <p class="h-meta">Used ${esc(Exam.fmtMin(a.usedMs))} of ${esc(Exam.fmtMin(a.allowedMs))} &middot; ${a.reason === 'timeup' ? 'Time was up' : 'Finished early'}</p>
      </div>
      <div class="h-score">
        ${pct == null ? '' : `<span class="h-pct">${pct}%</span><span class="h-marks">${a.score} / ${a.max}</span>`}
        <button class="btn h-edit" type="button" data-hedit="${esc(a.id)}">${pct == null ? 'Add score' : 'Edit'}</button>
      </div>
      <i class="h-bar"></i>
    </article>`;
  }
  function renderHistory() {
    if (!hist.box || !window.Exam || !Exam.history) return;
    const items = Exam.history();
    hist.count.textContent = items.length;
    hist.sub.textContent = items.length ? plural(items.length, 'attempt') : '';
    hist.clear.hidden = !items.length;
    if (hist.box.hidden) return;
    hist.list.innerHTML = items.length ? items.map(histCard).join('')
      : '<div class="empty glass"><h3>No exams yet</h3><p>Start a timed exam from any paper. When it ends, it is saved here with your score.</p></div>';
  }
  function showHistory(on) {
    if (!hist.box) return;
    hist.box.hidden = !on;
    hist.btn.setAttribute('aria-pressed', on);
    if (on) { renderHistory(); hist.box.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }
  if (hist.btn) {
    hist.btn.addEventListener('click', () => showHistory(hist.box.hidden));
    hist.close.addEventListener('click', () => showHistory(false));
    hist.clear.addEventListener('click', () => { if (window.Exam) Exam.confirmClear(); });
    hist.list.addEventListener('click', (e) => {
      const ed = e.target.closest('[data-hedit]');
      if (ed) { if (window.Exam) Exam.editAttempt(ed.dataset.hedit); return; }
      const op = e.target.closest('[data-hopen]');
      if (op && !(e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1)) {
        e.preventDefault();
        const r = state.byId.get(op.dataset.hopen);
        if (r) openReader(r);
      }
    });
    addEventListener('exam:history', renderHistory);
  }

  // Public hooks used by viewer.js
  window.App = {
    fileName, reportHref, download, toggleSave, isSaved, share, closeReader, pageChanged, toast, openReader,
    applySaved, applyPrefs,
    byId: (id) => state.byId.get(id),
    shareOpen: () => !el.dlg.hidden || !!(window.Exam && Exam.dialogOpen())
  };

  /* ---------- exam countdown (edit data/exams.json) ----------
     The time comes from the web server's clock (the HTTP Date header), not from the
     visitor's device, so a wrong date or time on their phone or PC does not change it.
     After that first reading it ticks with a monotonic timer, which also ignores clock changes. */
  async function loadExams() {
    const box = $('#exams'); if (!box) return;
    try {
      const t0 = performance.now();
      const r = await fetch('/data/exams.json?t=' + Date.now(), { cache: 'no-store' });
      const t1 = performance.now();
      if (!r.ok) return;
      const d = await r.json();

      // Server time at the moment the response arrived (falls back to the device clock if the header is missing)
      let serverNow = Date.now();
      const hdr = Date.parse(r.headers.get('Date') || '');
      if (!isNaN(hdr)) serverNow = hdr + (Number(r.headers.get('Age')) || 0) * 1000 + (t1 - t0) / 2;
      const now = () => serverNow + (performance.now() - t1);

      const tz = d.timezone || '+05:30';
      const time = d.time || '00:00';
      const target = Date.parse(`${d.date}T${time}:00${tz}`);
      if (isNaN(target) || target <= now()) return;        // missing or already started: hide the strip

      const [hh, mm] = time.split(':').map(Number);
      const clock = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
      const [y, m, dd] = String(d.date).split('-').map(Number);
      const dateText = new Date(y, m - 1, dd).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      $('#hExams').textContent = d.title || 'Board exams';
      $('#examNext').innerHTML = `${esc(d.label || 'Starts')} <b>${esc(dateText)}</b>, ${esc(clock)}`;

      const units = $('#examDays');
      units.innerHTML = ['days', 'hours', 'mins', 'secs'].map((u) => `<div><b data-u="${u}">0</b><span>${u}</span></div>`).join('');
      const cell = {}; units.querySelectorAll('[data-u]').forEach((n) => { cell[n.dataset.u] = n; });
      box.hidden = false;

      const pad = (n) => String(n).padStart(2, '0');
      const tick = () => {
        const left = Math.max(0, Math.floor((target - now()) / 1000));
        if (left === 0) { box.hidden = true; clearInterval(timer); return; }
        cell.days.textContent = Math.floor(left / 86400);
        cell.hours.textContent = pad(Math.floor(left % 86400 / 3600));
        cell.mins.textContent = pad(Math.floor(left % 3600 / 60));
        cell.secs.textContent = pad(left % 60);
      };
      const timer = setInterval(tick, 1000);
      tick();
    } catch (e) { /* no countdown if the file is missing or invalid */ }
  }


  /* ---------- "filters on" reminder: shown while a search or filter is active and the result line is scrolled away ---------- */
  const flag = document.createElement('button');
  flag.type = 'button'; flag.className = 'pill glass filter-flag'; flag.hidden = true;
  flag.setAttribute('data-act', 'reset');
  document.body.appendChild(flag);
  flag.addEventListener('click', () => { resetAll(); $('#library').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); });
  let flagRaf = 0;
  function checkFlag() {
    flagRaf = 0;
    const on = filtering() && el.count.getBoundingClientRect().bottom < 0 && !Viewer.isOpen();
    if (on) flag.innerHTML = `<b>${el.grid.querySelectorAll('.card').length}</b> shown, filters on<span>Clear</span>`;
    flag.hidden = !on;
  }
  const queueFlag = () => { if (!flagRaf) flagRaf = requestAnimationFrame(checkFlag); };
  addEventListener('scroll', queueFlag, { passive: true });
  addEventListener('resize', queueFlag);
  new MutationObserver(queueFlag).observe(el.grid, { childList: true });
  addEventListener('viewer:close', queueFlag);

  /* ---------- back to top: appears once the end of all resources has scrolled into view ---------- */
  const topBtn = $('#toTop');
  if (topBtn) {
    let raf = 0, shown = false;
    const setShown = (on) => {
      if (on === shown) return;
      shown = on;
      topBtn.classList.toggle('on', on);
      topBtn.setAttribute('aria-hidden', on ? 'false' : 'true');
      topBtn.tabIndex = on ? 0 : -1;
      document.body.classList.toggle('to-top-on', on);
    };
    const checkTop = () => {
      raf = 0;
      const g = el.grid.getBoundingClientRect();
      const endReached = el.grid.children.length > 0 && g.bottom <= innerHeight + 40;   // last card is on screen, footer not needed
      setShown(endReached && scrollY > innerHeight * 0.5);
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(checkTop); };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    new MutationObserver(queue).observe(el.grid, { childList: true });   // filters, sort and search change the grid length
    topBtn.addEventListener('click', () => {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    queue();
  }

  /* ---------- init ---------- */
  (async function init() {
    $('#backLink').href = CFG.portfolioUrl;
    $('#notice').textContent = CFG.notice;
    state.sort = store.get('icse:sort', 'year');
    if (!['year', 'old', 'popular'].includes(state.sort)) state.sort = 'year'; // old saved choices (Newest, A to Z) no longer exist
    renderQuick();
    if (!(await load())) return;
    readStartFilters();
    renderAll();
    document.documentElement.classList.add('js-ready');
    syncFromUrl(true);
    loadCounts();
    loadExams();
  })();
})();
