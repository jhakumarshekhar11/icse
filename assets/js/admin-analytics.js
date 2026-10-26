// Admin "Analytics" tab: reads your Google Analytics 4 numbers (live and past) with the Google Analytics Data API.
//
// How it signs in: Google Identity Services opens Google's own sign-in popup in your browser. You get a short-lived
// access token (about an hour). It is kept for this browser tab only (sessionStorage) so a refresh does not lose it, and it is
// renewed with one tap using the Google account you are signed in with on the site. It is never sent anywhere but Google.
// There is no secret key anywhere on the site. The two settings in admin-config.js (property ID and OAuth client ID)
// are public identifiers. Only a Google account with access to the GA4 property can read anything.
(() => {
  'use strict';
  const host = document.getElementById('anHost');
  if (!host) return;

  const AN = (window.ADMIN_CONFIG && window.ADMIN_CONFIG.analytics) || {};
  const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
  const API = 'https://analyticsdata.googleapis.com/v1beta/properties/';
  const GIS = 'https://accounts.google.com/gsi/client';
  const configured = /^\d{5,}$/.test(String(AN.propertyId || '').trim()) && /\.apps\.googleusercontent\.com$/.test(String(AN.clientId || '').trim());

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-IN');
  const num = (n) => nf.format(Math.round(n || 0));
  const dur = (sec) => { sec = Math.round(sec || 0); const m = Math.floor(sec / 60), s = sec % 60; return m + 'm ' + String(s).padStart(2, '0') + 's'; };
  const pct = (x) => (isFinite(x) ? (x * 100).toFixed(x >= 0.995 ? 0 : 1).replace(/\.0$/, '') + '%' : '–');
  const toast = (m) => { const h = document.getElementById('toasts'); if (!h) return; const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; h.appendChild(t); setTimeout(() => t.remove(), 3200); };
  const RANGE_DAYS = { today: 1, 7: 7, 28: 28, 90: 90, 365: 365 };
  const dayLabel = (d, long) => d.toLocaleDateString('en-IN', long ? { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });

  const RANGES = [
    { id: 'today', label: 'Today', cur: ['today', 'today'], prev: ['yesterday', 'yesterday'], vs: 'yesterday' },
    { id: '7', label: 'Last 7 days', cur: ['6daysAgo', 'today'], prev: ['13daysAgo', '7daysAgo'], vs: 'the 7 days before' },
    { id: '28', label: 'Last 28 days', cur: ['27daysAgo', 'today'], prev: ['55daysAgo', '28daysAgo'], vs: 'the 28 days before' },
    { id: '90', label: 'Last 90 days', cur: ['89daysAgo', 'today'], prev: ['179daysAgo', '90daysAgo'], vs: 'the 90 days before' },
    { id: '365', label: 'Last 12 months', cur: ['364daysAgo', 'today'], prev: ['729daysAgo', '365daysAgo'], vs: 'the 12 months before' }
  ];

  const S = { token: null, expiresAt: 0, client: null, gisReady: null, range: '28', titles: null, live: 0, liveTimer: 0, active: false, loading: false, error: '', resizeT: 0, last: null, silent: false, autoTried: false };

  /* ---------- remembered sign-in ---------- */
  // sessionStorage: the access token, for this tab only, so a refresh keeps the numbers on screen.
  // localStorage: only a flag (and the email as a hint) that this browser has allowed Analytics before, so the
  // next connect needs no account chooser. No token is ever kept in localStorage.
  const TOK = 'icse:an:tok', OK = 'icse:an:ok';
  const store = (area) => ({
    get(k) { try { return area.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { area.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { area.removeItem(k); } catch (e) { /* ignore */ } }
  });
  const ss = store(window.sessionStorage), ls = store(window.localStorage);
  function siteEmail() {   // the Google account signed in on the main site (see account.js)
    try { const h = JSON.parse(ls.get('icse:acct') || 'null'); return (h && h.e) || ''; } catch (e) { return ''; }
  }
  const remembered = () => { const v = ls.get(OK); return v && v !== '1' ? v : ''; };
  const hintEmail = () => siteEmail() || remembered();
  function restoreToken() {
    try {
      const v = JSON.parse(ss.get(TOK) || 'null');
      if (v && v.t && v.x > Date.now()) { S.token = v.t; S.expiresAt = v.x; } else ss.del(TOK);
    } catch (e) { ss.del(TOK); }
  }
  restoreToken();

  /* ---------- Google sign-in (access token, in memory only) ---------- */
  function loadGis() {
    if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
    if (!S.gisReady) S.gisReady = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = GIS; s.async = true;
      s.onload = res;
      s.onerror = () => { S.gisReady = null; s.remove(); rej(new Error('Could not load Google sign-in. Check your connection or an ad blocker.')); };
      document.head.appendChild(s);
    });
    return S.gisReady;
  }
  function connect(silent) {
    // A normal connect must be called straight from the tap: the browser blocks the Google popup otherwise.
    // A silent connect is tried without a tap and just falls back to the button if the browser blocks it.
    if (!(window.google && google.accounts && google.accounts.oauth2)) { if (silent) return; loadGis().then(() => toast('Google sign-in is ready. Press Connect again.'), (e) => { S.error = e.message; render(); }); return; }
    if (!S.client) {
      S.client = google.accounts.oauth2.initTokenClient({
        client_id: AN.clientId.trim(), scope: SCOPE,
        callback: (r) => {
          if (!r || r.error || !r.access_token) {
            if (S.silent) { S.silent = false; S.error = ''; render(); return; }
            S.error = r && r.error === 'access_denied' ? 'Access was not allowed. Press Connect and allow read access to Google Analytics.' : 'Google sign-in did not finish' + (r && r.error ? ' (' + r.error + ')' : '') + '.';
            render(); return;
          }
          S.token = r.access_token; S.expiresAt = Date.now() + (Number(r.expires_in) || 3600) * 1000 - 60000; S.error = ''; S.silent = false;
          saveToken(); ls.set(OK, hintEmail() || '1');
          load();
        },
        error_callback: (e) => { if (S.silent) { S.silent = false; S.error = ''; render(); return; } S.error = e && e.type === 'popup_closed' ? '' : 'Google sign-in could not open (' + ((e && e.type) || 'unknown') + '). Allow pop-ups for this page and try again.'; render(); }
      });
    }
    S.silent = !!silent;
    const hint = hintEmail();
    S.client.requestAccessToken(hint ? { hint } : {});
  }
  function saveToken() { ss.set(TOK, JSON.stringify({ t: S.token, x: S.expiresAt })); }
  // Tried once per page load when this browser has allowed Analytics before
  function autoConnect() {
    if (S.autoTried || !configured || !ls.get(OK)) return;
    S.autoTried = true;
    loadGis().then(() => connect(true)).catch(() => {});
  }
  // keep = true (admin sign-out, expired access): drop the token but remember that Analytics was allowed, so the next
  // connect is one tap. keep = false (the Disconnect button): forget it and revoke Google's access as well.
  function disconnect(msg, keep) {
    const t = S.token; S.token = null; S.last = null; S.error = msg || '';
    ss.del(TOK);
    if (!keep) ls.del(OK);
    stopLive();
    try { if (!keep && t && window.google && google.accounts && google.accounts.oauth2) google.accounts.oauth2.revoke(t, () => {}); } catch (e) { /* ignore */ }
    render();
  }
  window.addEventListener('adm:signout', () => disconnect('', true));

  /* ---------- Data API ---------- */
  async function api(method, body) {
    if (!S.token || Date.now() > S.expiresAt) { const e = new Error('Your Google access has ended. Press Connect again.'); e.expired = true; throw e; }
    const r = await fetch(API + String(AN.propertyId).trim() + ':' + method, {
      method: 'POST', headers: { Authorization: 'Bearer ' + S.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).error.message; } catch (e) { /* not JSON */ }
      const e = new Error(m || 'Google Analytics answered with an error (' + r.status + ').'); e.status = r.status;
      if (r.status === 401) e.expired = true;
      throw e;
    }
    return r.json();
  }
  // Turns a report into [{ dimensionName: value, metricName: number }]
  function table(res) {
    const dh = (res.dimensionHeaders || []).map((h) => h.name), mh = (res.metricHeaders || []).map((h) => h.name);
    return (res.rows || []).map((r) => {
      const o = {};
      (r.dimensionValues || []).forEach((v, i) => { o[dh[i]] = v.value; });
      (r.metricValues || []).forEach((v, i) => { o[mh[i]] = Number(v.value) || 0; });
      return o;
    });
  }
  const dims = (...n) => n.map((name) => ({ name }));
  const mets = (...n) => n.map((name) => ({ name }));
  const byDesc = (name) => [{ metric: { metricName: name }, desc: true }];

  function reports(rg) {
    const cur = { startDate: rg.cur[0], endDate: rg.cur[1] }, prev = { startDate: rg.prev[0], endDate: rg.prev[1] }, both = [cur, prev];
    const sign = { filter: { fieldName: 'eventName', inListFilter: { values: ['sign_up', 'login'] } } };
    return {
      totals: () => api('runReport', { dateRanges: both, metrics: mets('activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'userEngagementDuration', 'engagementRate') }),
      daily: () => api('runReport', { dateRanges: [cur], dimensions: dims('date'), metrics: mets('activeUsers', 'sessions', 'screenPageViews'), orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 }),
      accounts: () => api('runReport', { dateRanges: [cur], dimensions: dims('customUser:account_status'), metrics: mets('activeUsers') }),
      events: () => api('runReport', { dateRanges: both, dimensions: dims('eventName'), metrics: mets('eventCount'), dimensionFilter: sign }),
      signupsDaily: () => api('runReport', { dateRanges: [cur], dimensions: dims('date'), metrics: mets('eventCount'), dimensionFilter: { filter: { fieldName: 'eventName', stringFilter: { value: 'sign_up' } } }, orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 400 }),
      pages: () => api('runReport', { dateRanges: [cur], dimensions: dims('pagePathPlusQueryString'), metrics: mets('screenPageViews', 'activeUsers'), orderBys: byDesc('screenPageViews'), limit: 250 }),
      countries: () => api('runReport', { dateRanges: [cur], dimensions: dims('country'), metrics: mets('activeUsers'), orderBys: byDesc('activeUsers'), limit: 8 }),
      devices: () => api('runReport', { dateRanges: [cur], dimensions: dims('deviceCategory'), metrics: mets('activeUsers'), orderBys: byDesc('activeUsers') }),
      sources: () => api('runReport', { dateRanges: [cur], dimensions: dims('sessionDefaultChannelGroup'), metrics: mets('sessions'), orderBys: byDesc('sessions'), limit: 8 })
    };
  }
  // Runs every report on its own, so one that fails (a missing custom dimension, for example) does not blank the page
  async function settle(fns) {
    const out = {}, errs = {};
    await Promise.all(Object.keys(fns).map(async (k) => {
      try { out[k] = await fns[k](); } catch (e) { errs[k] = e; }
    }));
    return { out, errs };
  }

  /* ---------- paper titles for the top pages list ---------- */
  async function loadTitles() {
    if (S.titles) return S.titles;
    S.titles = {};
    try {
      const r = await fetch('/data/resources.json', { cache: 'no-store' });
      const d = await r.json();
      (d.resources || []).forEach((x) => { S.titles[x.id] = x.title; });
    } catch (e) { /* the list then shows the page address */ }
    return S.titles;
  }
  function pageName(path) {
    let u; try { u = new URL(path, 'https://x.invalid'); } catch (e) { return { key: path, name: path }; }
    const id = u.searchParams.get('file');
    if (id) return { key: 'file:' + id, name: S.titles && S.titles[id] ? S.titles[id] : id, paper: true };
    const q = u.searchParams.get('q');
    const p = u.pathname === '/' ? 'Library home' : u.pathname.replace(/\/$/, '');
    return { key: u.pathname + (q ? '?q=' + q : ''), name: q ? 'Search: ' + q : p };
  }

  /* ---------- charts (plain SVG) ---------- */
  // The top of the y axis: four equal steps that are round numbers (1, 2, 2.5, 5 or 10 times a power of ten)
  function niceMax(v) {
    if (v <= 4) return 4;
    const raw = v / 4, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p * 4;
  }
  // points: [{ label, v }]; kind: 'line' | 'bars'. Returns nothing, draws into el.
  function chart(el, points, o) {
    const W = Math.max(280, el.clientWidth || 640), H = o.h || 220, L = 40, R = 10, T = 12, B = 26;
    const iw = W - L - R, ih = H - T - B;
    const max = niceMax(Math.max(1, ...points.map((p) => p.v)));
    const n = points.length;
    const xAt = (i) => (o.kind === 'bars' ? L + (iw / n) * (i + 0.5) : L + (n === 1 ? iw / 2 : (iw * i) / (n - 1)));
    const yAt = (v) => T + ih - (v / max) * ih;
    let g = '';
    for (let i = 0; i <= 4; i++) {
      const v = (max / 4) * i, y = yAt(v);
      g += `<line class="an-grid" x1="${L}" x2="${W - R}" y1="${y}" y2="${y}"/><text class="an-tick" x="${L - 8}" y="${y + 4}" text-anchor="end">${esc(v >= 1000 ? (v / 1000).toFixed(v % 1000 ? 1 : 0) + 'k' : Math.round(v * 10) / 10)}</text>`;
    }
    const xs = Math.min(n, W < 420 ? 3 : 6);
    for (let k = 0; k < xs; k++) {
      const i = xs === 1 ? 0 : Math.round(((n - 1) * k) / (xs - 1));
      g += `<text class="an-tick" x="${xAt(i)}" y="${H - 6}" text-anchor="${k === 0 ? 'start' : k === xs - 1 ? 'end' : 'middle'}">${esc(points[i].short)}</text>`;
    }
    let marks = '';
    if (o.kind === 'bars') {
      const bw = Math.max(2, Math.min(28, iw / n - 2));
      marks = points.map((p, i) => {
        const h = Math.max(p.v > 0 ? 2 : 0, ih - (yAt(p.v) - T));
        return `<rect class="an-col" data-i="${i}" x="${xAt(i) - bw / 2}" y="${T + ih - h}" width="${bw}" height="${h}" rx="${Math.min(3, bw / 2)}" fill="${o.color}"/>`;
      }).join('');
    } else {
      const d = points.map((p, i) => (i ? 'L' : 'M') + xAt(i).toFixed(1) + ' ' + yAt(p.v).toFixed(1)).join('');
      marks = `<path d="${d} L${xAt(n - 1).toFixed(1)} ${T + ih} L${xAt(0).toFixed(1)} ${T + ih} Z" fill="${o.color}" opacity="0.12"/><path d="${d}" fill="none" stroke="${o.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (n === 1) marks += `<circle cx="${xAt(0)}" cy="${yAt(points[0].v)}" r="4" fill="${o.color}"/>`;
    }
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" tabindex="0" aria-label="${esc(o.aria)}">${g}${marks}<line class="an-cross" y1="${T}" y2="${T + ih}" hidden/><circle class="an-dot" r="4.5" fill="${o.color}" hidden/></svg><div class="an-tip" hidden></div>`;
    const svg = el.querySelector('svg'), cross = svg.querySelector('.an-cross'), dot = svg.querySelector('.an-dot'), tip = el.querySelector('.an-tip');
    let cur = -1;
    const show = (i) => {
      i = Math.max(0, Math.min(n - 1, i)); if (i === cur) return; cur = i;
      const p = points[i], x = xAt(i);
      cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.hidden = o.kind === 'bars';
      dot.setAttribute('cx', x); dot.setAttribute('cy', yAt(p.v)); dot.hidden = o.kind === 'bars';
      svg.querySelectorAll('.an-col').forEach((b) => b.classList.toggle('hot', +b.dataset.i === i));
      tip.hidden = false; tip.textContent = '';
      const v = document.createElement('b'); v.textContent = num(p.v) + ' ' + o.unit; const l = document.createElement('span'); l.textContent = p.label;
      const key = document.createElement('i'); key.style.background = o.color;
      tip.append(l, key, v);
      const tw = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(W - tw - 4, x - tw / 2)) + 'px'; tip.style.top = Math.max(0, yAt(p.v) - 48) + 'px';
    };
    const hide = () => { cur = -1; tip.hidden = true; cross.hidden = true; dot.hidden = true; svg.querySelectorAll('.an-col.hot').forEach((b) => b.classList.remove('hot')); };
    svg.addEventListener('pointermove', (e) => {
      const r = svg.getBoundingClientRect(), px = ((e.clientX - r.left) / r.width) * W;
      show(o.kind === 'bars' ? Math.floor(((px - L) / iw) * n) : Math.round(((px - L) / iw) * (n - 1)));
    });
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('blur', hide);
    svg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); show((cur < 0 ? (e.key === 'ArrowRight' ? -1 : n) : cur) + (e.key === 'ArrowRight' ? 1 : -1)); }
      if (e.key === 'Escape') hide();
    });
  }

  /* ---------- pieces of the page ---------- */
  const delta = (cur, prev) => {
    if (!isFinite(prev) || prev <= 0) return cur > 0 ? '<span class="an-d up">New</span>' : '';
    const c = (cur - prev) / prev;
    if (Math.abs(c) < 0.005) return '<span class="an-d">No change</span>';
    return `<span class="an-d ${c > 0 ? 'up' : 'down'}">${c > 0 ? '▲ +' : '▼ −'}${Math.abs(c * 100).toFixed(Math.abs(c) >= 1 ? 0 : 1).replace(/\.0$/, '')}%</span>`;
  };
  const tile = (label, value, d, hint) => `<div class="an-tile glass"><span class="an-l">${esc(label)}</span><b>${esc(value)}</b>${d || ''}${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
  function errNote(e) {
    if (!e) return '';
    if (e.status === 403) return 'This Google account cannot read that property. Sign in with the account that has access to it in Google Analytics, and check the property ID.';
    if (e.status === 400 && /customUser:account_status|account_status/.test(e.message)) return 'Not set up yet: create the "Account status" custom dimension in Google Analytics (steps are in the setup section below).';
    return e.message;
  }
  function list(rows, valueKey, color, empty) {
    if (!rows.length) return `<p class="hint">${esc(empty || 'No data for this period.')}</p>`;
    const max = Math.max(1, ...rows.map((r) => r.v));
    return '<ol class="an-list">' + rows.map((r) => `<li><span class="an-n" title="${esc(r.name)}">${esc(r.name)}</span><span class="an-v">${num(r.v)}</span><i style="width:${Math.max(2, (r.v / max) * 100)}%;background:${color}"></i></li>`).join('') + '</ol>';
  }

  function setupGuide(collapsed) {
    const inner = `
      <h2>One-time setup</h2>
      <p class="hint">Takes about 10 minutes. Nothing secret is stored on your site. The access token stays in this browser tab for about an hour, and a flag remembers that you allowed it, so reconnecting is one tap.</p>
      <ol>
        <li><b>Property ID.</b> In <a href="https://analytics.google.com/" target="_blank" rel="noopener">Google Analytics</a>, open Admin, then Property details, and copy the numeric <b>Property ID</b>. Paste it into <code>assets/js/admin-config.js</code> as <code>analytics.propertyId</code>.</li>
        <li><b>Google Cloud project.</b> Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console</a>. You can use the project your Firebase already created. Under APIs and services, Library, enable <b>Google Analytics Data API</b>.</li>
        <li><b>Consent screen.</b> APIs and services, OAuth consent screen: choose External, fill in the app name and your email, and under Test users add the Google account you use for Analytics. It can stay in Testing mode.</li>
        <li><b>OAuth client.</b> Credentials, Create credentials, <b>OAuth client ID</b>, type <b>Web application</b>. Under Authorised JavaScript origins add <code>${esc(location.origin)}</code>. Copy the Client ID into <code>admin-config.js</code> as <code>analytics.clientId</code>.</li>
        <li><b>Signed in or guest split (optional, for the account numbers).</b> In Analytics, Admin, Custom definitions, Create custom dimension: name <b>Account status</b>, scope <b>User</b>, user property <code>account_status</code>. It fills in from the day you create it.</li>
      </ol>`;
    return collapsed ? `<div class="glass tax-card an-setup"><details><summary>Setup steps</summary>${inner}</details></div>` : `<div class="glass tax-card an-setup">${inner}</div>`;
  }

  /* ---------- main render ---------- */
  function shell(inner) { host.innerHTML = inner; }

  function render() {
    if (!configured) {
      shell(`<div class="glass tax-card an-note"><h2>Analytics</h2><p>This page shows your Google Analytics numbers: visitors right now, visits over time, and signed in against guest visitors. It needs two values in <code>assets/js/admin-config.js</code> before it can connect.</p></div>${setupGuide()}`);
      return;
    }
    if (!S.token || Date.now() > S.expiresAt) {
      if (S.token) { S.token = null; stopLive(); }
      shell(`<div class="glass tax-card an-note">
        <h2>Analytics</h2>
        <p>Connect with the Google account that has access to your Analytics property. Access lasts about an hour and is remembered in this tab. Next time it is one tap.</p>
        ${S.error ? `<p class="err" role="alert">${esc(S.error)}</p>` : ''}
        <div class="an-acts"><button class="btn btn-primary" id="anConnect" type="button">${hintEmail() && ls.get(OK) ? 'Continue as ' + esc(hintEmail()) : 'Connect Google Analytics'}</button></div>
      </div>`);
      // Load Google's sign-in script now, so the button press can open its popup straight away
      loadGis().catch((e) => { S.error = e.message; const p = host.querySelector('.an-note'); if (p && !p.querySelector('.err')) p.insertAdjacentHTML('beforeend', `<p class="err" role="alert">${esc(e.message)}</p>`); });
      return;
    }
    const rg = RANGES.find((r) => r.id === S.range) || RANGES[2];
    shell(`
      <div class="an-bar">
        <label class="sr" for="anRange">Time range</label>
        <select id="anRange">${RANGES.map((r) => `<option value="${r.id}"${r.id === rg.id ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select>
        <button class="btn" id="anRefresh" type="button">Refresh</button>
        <button class="btn" id="anOut" type="button">Disconnect</button>
        <span class="hint" id="anStamp" role="status"></span>
      </div>
      <div id="anBody"><div class="glass tax-card"><p class="hint">Loading your numbers</p></div></div>
      ${setupGuide(true)}`);
    if (S.last) paint();
  }

  async function load() {
    if (!S.token) return render();
    if (S.loading) return;
    S.loading = true; S.error = '';
    render();
    const rg = RANGES.find((r) => r.id === S.range) || RANGES[2];
    try {
      await loadTitles();
      const { out, errs } = await settle(reports(rg));
      const exp = Object.values(errs).find((e) => e.expired);
      if (exp) { S.loading = false; disconnect(exp.message, true); return; }
      S.last = { rg, out, errs, at: new Date() };
    } catch (e) { S.error = e.message; }
    S.loading = false;
    paint();
    startLive();
  }

  function paint() {
    const body = document.getElementById('anBody'); if (!body || !S.last) return;
    const { rg, out, errs, at } = S.last;
    const stamp = document.getElementById('anStamp'); if (stamp) stamp.textContent = 'Updated ' + at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) + '. Google can take a few hours to finish counting recent days.';
    const parts = [];

    // Live
    parts.push(`<div class="glass tax-card an-live" id="anLive"><div class="tax-head"><h2>Right now</h2><span class="an-pulse" aria-hidden="true"></span></div><div id="anLiveBody"><p class="hint">Loading</p></div></div>`);

    // Tiles
    if (errs.totals) parts.push(`<p class="err">${esc(errNote(errs.totals))}</p>`);
    else {
      const rows = table(out.totals), c = rows.find((r) => r.dateRange === 'date_range_0') || rows[0] || {}, p = rows.find((r) => r.dateRange === 'date_range_1') || {};
      const eng = (r) => (r.activeUsers ? r.userEngagementDuration / r.activeUsers : 0);
      parts.push(`<div class="an-tiles">
        ${tile('Visitors', num(c.activeUsers), delta(c.activeUsers, p.activeUsers))}
        ${tile('New visitors', num(c.newUsers), delta(c.newUsers, p.newUsers))}
        ${tile('Visits', num(c.sessions), delta(c.sessions, p.sessions), 'Sessions')}
        ${tile('Page views', num(c.screenPageViews), delta(c.screenPageViews, p.screenPageViews))}
        ${tile('Time on site', dur(eng(c)), delta(eng(c), eng(p)), 'Per visitor')}
        ${tile('Engaged', pct(c.engagementRate), delta(c.engagementRate, p.engagementRate), 'Visits that lasted or did something')}
      </div><p class="hint an-vs">Compared with ${esc(rg.vs)}.</p>`);
    }

    // Daily visitors
    if (errs.daily) parts.push(`<p class="err">${esc(errNote(errs.daily))}</p>`);
    else parts.push(`<div class="glass tax-card"><div class="tax-head"><h2>Visitors per day</h2></div><div class="an-chart" id="anDaily"></div><details class="an-table"><summary>Show as a table</summary><div id="anDailyTable"></div></details></div>`);

    // Accounts
    parts.push(accountsCard(out, errs, rg));

    // Lists
    parts.push(`<div class="an-grid3">
      <div class="glass tax-card"><h2>Countries</h2>${errs.countries ? `<p class="err">${esc(errNote(errs.countries))}</p>` : list(table(out.countries).map((r) => ({ name: r.country || 'Unknown', v: r.activeUsers })), 'v', 'var(--an-blue)')}</div>
      <div class="glass tax-card"><h2>Devices</h2>${errs.devices ? `<p class="err">${esc(errNote(errs.devices))}</p>` : list(table(out.devices).map((r) => ({ name: (r.deviceCategory || 'unknown').replace(/^./, (c) => c.toUpperCase()), v: r.activeUsers })), 'v', 'var(--an-blue)')}</div>
      <div class="glass tax-card"><h2>Where visits come from</h2>${errs.sources ? `<p class="err">${esc(errNote(errs.sources))}</p>` : list(table(out.sources).map((r) => ({ name: r.sessionDefaultChannelGroup || 'Unknown', v: r.sessions })), 'v', 'var(--an-blue)')}</div>
    </div>`);

    // Top pages
    parts.push(`<div class="glass tax-card"><h2>Most viewed</h2>${errs.pages ? `<p class="err">${esc(errNote(errs.pages))}</p>` : topPages(out.pages)}</div>`);

    body.innerHTML = parts.join('');
    drawCharts();
    liveTick();
  }

  function accountsCard(out, errs, rg) {
    let split = '', hint = '';
    if (errs.accounts) split = `<p class="an-warn">${esc(errNote(errs.accounts))}</p>`;
    else {
      const rows = table(out.accounts), get = (k) => rows.filter((r) => r['customUser:account_status'] === k).reduce((a, r) => a + r.activeUsers, 0);
      const si = get('signed_in'), gu = get('guest'), unk = rows.filter((r) => !['signed_in', 'guest'].includes(r['customUser:account_status'])).reduce((a, r) => a + r.activeUsers, 0);
      const tot = si + gu + unk;
      if (!tot) split = '<p class="hint">No account data yet. It starts filling in once the custom dimension exists and visitors have come since.</p>';
      else {
        const seg = (v, c, k) => (v > 0 ? `<i class="an-seg" style="flex:${v};background:${c}" data-tip="${esc(k + ': ' + num(v))}" tabindex="0" aria-label="${esc(k + ': ' + num(v) + ' visitors, ' + pct(v / tot))}"></i>` : '');
        split = `<div class="an-stack" role="img" aria-label="Visitors split by account">${seg(si, 'var(--an-aqua)', 'Signed in')}${seg(gu, 'var(--an-orange)', 'Guests')}${seg(unk, 'var(--an-grey)', 'Before tracking began')}</div>
          <ul class="an-legend">
            <li><i style="background:var(--an-aqua)"></i><span>Signed in</span><b>${num(si)}</b><em>${pct(si / tot)}</em></li>
            <li><i style="background:var(--an-orange)"></i><span>Guests, not signed up</span><b>${num(gu)}</b><em>${pct(gu / tot)}</em></li>
            ${unk ? `<li><i style="background:var(--an-grey)"></i><span>Not labelled yet</span><b>${num(unk)}</b><em>${pct(unk / tot)}</em></li>` : ''}
          </ul>`;
        hint = 'A visitor who signs in during the period can be counted in both groups.';
      }
    }
    let ev = '';
    if (errs.events) ev = `<p class="err">${esc(errNote(errs.events))}</p>`;
    else {
      const rows = table(out.events), g = (name, r) => rows.filter((x) => x.eventName === name && x.dateRange === r).reduce((a, x) => a + x.eventCount, 0);
      const su = g('sign_up', 'date_range_0'), suP = g('sign_up', 'date_range_1'), li = g('login', 'date_range_0'), liP = g('login', 'date_range_1');
      const nu = (table(out.totals || {}).find((r) => r.dateRange === 'date_range_0') || {}).newUsers || 0;
      ev = `<div class="an-tiles an-tiles-s">
        ${tile('New sign ups', num(su), delta(su, suP))}
        ${tile('Log ins', num(li), delta(li, liP), 'Returning students')}
        ${tile('Sign up rate', nu ? pct(su / nu) : '–', '', 'New sign ups per new visitor')}
      </div>`;
    }
    return `<div class="glass tax-card an-acc"><div class="tax-head"><h2>Signed up and guests</h2></div>
      <div class="an-acc-grid"><div>${split}${hint ? `<p class="hint">${esc(hint)}</p>` : ''}</div><div>${ev}</div></div>
      ${errs.signupsDaily ? '' : '<h3 class="an-h3">New sign ups per day</h3><div class="an-chart" id="anSignups"></div>'}
    </div>`;
  }

  function topPages(res) {
    const agg = new Map();
    table(res).forEach((r) => {
      const p = pageName(r.pagePathPlusQueryString || '/');
      const x = agg.get(p.key) || { name: p.name, v: 0, paper: p.paper }; x.v += r.screenPageViews; agg.set(p.key, x);
    });
    const rows = [...agg.values()].sort((a, b) => b.v - a.v);
    const papers = rows.filter((r) => r.paper).slice(0, 12), other = rows.filter((r) => !r.paper).slice(0, 8);
    return `<div class="an-grid2"><div><h3 class="an-h3">Papers opened</h3>${list(papers, 'v', 'var(--an-blue)', 'No paper was opened in this period.')}</div><div><h3 class="an-h3">Other pages</h3>${list(other, 'v', 'var(--an-blue)')}</div></div>`;
  }

  // One point per calendar day of the range, with 0 for days Google sent nothing for
  function filled(res, rg, key) {
    const have = new Map(table(res).map((r) => [r.date, r]));
    const n = RANGE_DAYS[rg.id] || 28, out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
      const r = have.get(k) || {};
      out.push({ short: dayLabel(d), label: dayLabel(d, true), v: r[key] || 0, s: r.sessions || 0, pv: r.screenPageViews || 0 });
    }
    return out;
  }

  function drawCharts() {
    if (!S.last) return;
    const { out, rg } = S.last;
    const color = (n) => getComputedStyle(host).getPropertyValue(n).trim() || '#3987e5';
    const d = document.getElementById('anDaily');
    if (d && out.daily) {
      const pts = filled(out.daily, rg, 'activeUsers');
      if (!pts.some((p) => p.v)) d.innerHTML = '<p class="hint">No visits in this period.</p>';
      else {
        chart(d, pts, { kind: 'line', color: color('--an-blue'), unit: 'visitors', aria: 'Visitors per day, ' + pts.length + ' days. Use the left and right arrow keys to read each day.' });
        const t = document.getElementById('anDailyTable');
        t.innerHTML = '<table class="an-tbl"><thead><tr><th>Day</th><th>Visitors</th><th>Visits</th><th>Page views</th></tr></thead><tbody>' + pts.slice().reverse().map((p) => `<tr><td>${esc(p.label)}</td><td>${num(p.v)}</td><td>${num(p.s)}</td><td>${num(p.pv)}</td></tr>`).join('') + '</tbody></table>';
      }
    }
    const s = document.getElementById('anSignups');
    if (s && out.signupsDaily) {
      const pts = filled(out.signupsDaily, rg, 'eventCount');
      if (!pts.some((p) => p.v)) s.innerHTML = '<p class="hint">No sign ups in this period.</p>';
      else chart(s, pts, { kind: 'bars', h: 150, color: color('--an-aqua'), unit: 'sign ups', aria: 'New sign ups per day, ' + pts.length + ' days. Use the left and right arrow keys to read each day.' });
    }
  }

  /* ---------- live (last 30 minutes) ---------- */
  async function liveTick() {
    const box = document.getElementById('anLiveBody'); if (!box || !S.token) return;
    const f = (body) => api('runRealtimeReport', body);
    const { out, errs } = await settle({
      total: () => f({ metrics: mets('activeUsers') }),
      mins: () => f({ dimensions: dims('minutesAgo'), metrics: mets('activeUsers') }),
      pages: () => f({ dimensions: dims('unifiedScreenName'), metrics: mets('activeUsers'), orderBys: byDesc('activeUsers'), limit: 5 }),
      acct: () => f({ dimensions: dims('customUser:account_status'), metrics: mets('activeUsers') })
    });
    const exp = Object.values(errs).find((e) => e.expired); if (exp) { disconnect(exp.message, true); return; }
    const el = document.getElementById('anLiveBody'); if (!el) return;
    if (errs.total) { el.innerHTML = `<p class="err">${esc(errNote(errs.total))}</p>`; return; }
    const now = (table(out.total)[0] || {}).activeUsers || 0;
    const mins = new Array(30).fill(0); table(out.mins || {}).forEach((r) => { const i = +r.minutesAgo; if (i >= 0 && i < 30) mins[29 - i] = r.activeUsers; });
    const acct = table(out.acct || {}), g = (k) => acct.filter((r) => r['customUser:account_status'] === k).reduce((a, r) => a + r.activeUsers, 0);
    const bars = mins.map((v, i) => `<i style="height:${Math.max(v ? 8 : 2, (v / Math.max(1, ...mins)) * 100)}%" data-tip="${esc(v + (v === 1 ? ' visitor, ' : ' visitors, ') + (29 - i === 0 ? 'this minute' : 29 - i + ' min ago'))}"></i>`).join('');
    el.innerHTML = `<div class="an-live-grid">
      <div><b class="an-big">${num(now)}</b><span class="an-l">${now === 1 ? 'visitor' : 'visitors'} in the last 30 minutes</span>
        ${errs.acct ? '' : `<p class="an-split"><span><i style="background:var(--an-aqua)"></i>${num(g('signed_in'))} signed in</span><span><i style="background:var(--an-orange)"></i>${num(g('guest'))} guests</span></p>`}</div>
      <div><div class="an-spark" role="img" aria-label="Visitors for each of the last 30 minutes">${bars}</div><div class="an-spark-l"><span>30 min ago</span><span>now</span></div></div>
      <div><span class="an-l">Looking at</span>${errs.pages ? '<p class="hint">Unavailable</p>' : list(table(out.pages).map((r) => ({ name: r.unifiedScreenName || '(untitled)', v: r.activeUsers })), 'v', 'var(--an-blue)', 'Nobody right now.')}</div>
    </div>`;
  }
  function startLive() { stopLive(); if (!S.active || !S.token) return; S.liveTimer = setInterval(() => { if (document.visibilityState === 'visible') liveTick(); }, 30000); }
  function stopLive() { clearInterval(S.liveTimer); S.liveTimer = 0; }

  /* ---------- events ---------- */
  host.addEventListener('click', (e) => {
    if (e.target.closest('#anConnect')) connect(false);
    else if (e.target.closest('#anRefresh')) load();
    else if (e.target.closest('#anOut')) { disconnect(''); toast('Disconnected from Google Analytics'); }
  });
  host.addEventListener('change', (e) => { if (e.target.id === 'anRange') { S.range = e.target.value; load(); } });
  // Hover and focus labels for the stacked bar and the live bars
  const tipEl = document.createElement('div'); tipEl.className = 'an-tip an-tip-fixed'; tipEl.hidden = true; document.body.appendChild(tipEl);
  const tipShow = (t) => { const text = t.dataset && t.dataset.tip; if (!text) return; tipEl.textContent = text; tipEl.hidden = false; const r = t.getBoundingClientRect(); tipEl.style.left = Math.max(6, Math.min(innerWidth - tipEl.offsetWidth - 6, r.left + r.width / 2 - tipEl.offsetWidth / 2)) + 'px'; tipEl.style.top = Math.max(6, r.top - 38) + 'px'; };
  host.addEventListener('pointerover', (e) => { const t = e.target.closest('[data-tip]'); if (t) tipShow(t); });
  host.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) tipEl.hidden = true; });
  host.addEventListener('focusin', (e) => { const t = e.target.closest('[data-tip]'); if (t) tipShow(t); });
  host.addEventListener('focusout', () => { tipEl.hidden = true; });

  window.addEventListener('adm:tab', (e) => {
    S.active = e.detail === 'analytics';
    if (S.active) { if (!host.innerHTML) render(); if (S.token && Date.now() < S.expiresAt) { if (!S.last && !S.loading) load(); else { liveTick(); startLive(); } } else autoConnect(); } else stopLive();
  });
  window.addEventListener('resize', () => { clearTimeout(S.resizeT); S.resizeT = setTimeout(() => { if (S.active && S.last) drawCharts(); }, 150); });
  // Redraw when the light or dark theme changes (the chart colours come from CSS variables)
  new MutationObserver(() => { if (S.active && S.last) drawCharts(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  render();
})();
