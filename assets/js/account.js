// Accounts: sign up, log in, log out, and a local-first sync of bookmarks, exam history,
// reading progress and settings through Firebase (Auth + Firestore).
//
// How it works
//  - The site keeps using this browser's storage exactly as before. A visitor without an account sees no change.
//  - When someone is signed in, every change is also queued and written to one Firestore document, users/{uid}.
//    The queue is saved in the browser, so changes made offline are sent the next time the site opens.
//  - On sign in, what this browser already holds is merged into the account (nothing is lost), then the
//    account's data is shown. A live listener brings in changes made on the student's other devices.
//  - On sign out, the synced data is removed from this browser (it stays in the account). Theme and sort
//    order stay, since they describe the device.
//
// The Firebase SDK (assets/vendor/firebase-lite.js, about 175 KB gzipped) is only downloaded when someone
// opens the Log in dialog, or when a signed-in student returns. Everything is off until firebase-config.js is filled in.
(() => {
  'use strict';
  const root = window;
  const FBCFG = root.ICSE_FIREBASE || {};
  const OPT = Object.assign({ google: true, email: true, minPassword: 8, maxProgress: 60, maxHistory: 200 }, root.ICSE_ACCOUNT || {});
  if (!FBCFG.apiKey || !FBCFG.projectId || root.Account) return;

  /* ---------- storage ---------- */
  const K = {
    saved: 'icse:saved', hist: 'icse:exam:history', prog: 'icse:progress', page: 'icse:page:',
    theme: 'icse:theme', sort: 'icse:sort', beep: 'icse:exam:beep',
    hint: 'icse:acct', uid: 'icse:acct:uid', queue: 'icse:acct:queue'
  };
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const jget = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const jset = (k, v) => LS.set(k, JSON.stringify(v));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const objOf = (v) => (isObj(v) ? v : {});
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const canon = (v) => JSON.stringify(v, (k, x) => (isObj(x) ? Object.keys(x).sort().reduce((o, key) => { o[key] = x[key]; return o; }, {}) : x));
  const eq = (a, b) => canon(a) === canon(b);
  const emit = (name, detail) => root.dispatchEvent(new CustomEvent(name, { detail }));
  const DOMAINS = ['saved', 'history', 'progress', 'prefs'];
  // Firestore rejects field names that start and end with "__" (the admin preview uses "__preview__"), and empty ones
  const okKey = (k) => typeof k === 'string' && k.length > 0 && k.length < 200 && !/^__.*__$/.test(k) && k.indexOf('/') < 0;

  /* ---------- local state <-> plain maps ---------- */
  function readLocal() {
    const saved = {};
    (jget(K.saved, []) || []).forEach((id) => { if (okKey(id)) saved[id] = 1; });
    const history = {};
    (jget(K.hist, []) || []).forEach((a) => { if (a && okKey(a.id) && a.rid) history[a.id] = a; });
    const progress = {};
    Object.entries(objOf(jget(K.prog, {}))).forEach(([rid, v]) => { if (okKey(rid) && v && v.p > 0) progress[rid] = { p: v.p | 0, n: v.n | 0, at: Number(v.at) || 0 }; });
    // pages remembered by the reader before accounts existed
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || key.indexOf(K.page) !== 0) continue;
        const rid = key.slice(K.page.length);
        const p = parseInt(JSON.parse(localStorage.getItem(key)), 10);
        if (okKey(rid) && !progress[rid] && p > 1) progress[rid] = { p, n: 0, at: 0 };
      }
    } catch (e) { /* ignore */ }
    const prefs = {};
    const t = LS.get(K.theme); if (t === 'light' || t === 'dark') prefs.theme = t;
    const s = jget(K.sort, null); if (typeof s === 'string') prefs.sort = s;
    const b = LS.get(K.beep); if (b === '0' || b === '1') prefs.beep = b === '1';
    return { saved, history, progress, prefs };
  }

  function writeLocal(target, cur) {
    const App = root.App, Exam = root.Exam;
    if (!eq(cur.saved, target.saved)) {
      const ids = Object.keys(target.saved);
      jset(K.saved, ids);
      if (App && App.applySaved) App.applySaved(ids);
    }
    if (!eq(cur.history, target.history)) {
      const list = Object.values(target.history).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, OPT.maxHistory);
      jset(K.hist, list);
      if (Exam && Exam.replaceHistory) Exam.replaceHistory(list);
    }
    if (!eq(cur.progress, target.progress)) {
      jset(K.prog, target.progress);
      Object.keys(cur.progress).forEach((rid) => { if (!target.progress[rid]) LS.del(K.page + rid); });
      Object.entries(target.progress).forEach(([rid, v]) => { if (!cur.progress[rid] || cur.progress[rid].p !== v.p) jset(K.page + rid, v.p); });
      emit('account:data', { progress: true });
    }
    const tp = target.prefs, cp = cur.prefs;
    if (tp.theme && tp.theme !== cp.theme && root.IcseTheme) root.IcseTheme.set(tp.theme);
    if (tp.sort && tp.sort !== cp.sort) { jset(K.sort, tp.sort); if (App && App.applyPrefs) App.applyPrefs({ sort: tp.sort }); }
    if (typeof tp.beep === 'boolean' && tp.beep !== cp.beep) LS.set(K.beep, tp.beep ? '1' : '0');
  }

  /* ---------- merge, diff, queue ---------- */
  function union(loc, rem) {
    const progress = Object.assign({}, loc.progress);
    Object.entries(rem.progress).forEach(([rid, v]) => { if (!progress[rid] || (v.at || 0) >= (progress[rid].at || 0)) progress[rid] = v; });
    return {
      saved: Object.assign({}, loc.saved, rem.saved),
      history: Object.assign({}, loc.history, rem.history),
      progress,
      prefs: Object.assign({}, loc.prefs, rem.prefs)
    };
  }
  function trim(state) {
    const prog = Object.entries(state.progress).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    state.progress = {}; prog.slice(0, OPT.maxProgress).forEach(([rid, v]) => { state.progress[rid] = v; });
    const hist = Object.values(state.history).sort((a, b) => (b.at || 0) - (a.at || 0));
    state.history = {}; hist.slice(0, OPT.maxHistory).forEach((a) => { state.history[a.id] = a; });
    return state;
  }
  function diff(from, to) {
    const ops = [];
    DOMAINS.forEach((d) => {
      const a = from[d] || {}, b = to[d] || {};
      Object.keys(b).forEach((k) => { if (!eq(a[k], b[k])) ops.push({ d, k, v: b[k] }); });
      Object.keys(a).forEach((k) => { if (!(k in b)) ops.push({ d, k, v: null }); });
    });
    return ops;
  }
  let queue = objOf(jget(K.queue, {}));
  Object.keys(queue).forEach((key) => { const o = queue[key]; if (!o || !okKey(o.k)) delete queue[key]; });   // drop anything Firestore would refuse
  const qkey = (o) => o.d + '|' + o.k;
  const saveQueue = () => (Object.keys(queue).length ? jset(K.queue, queue) : LS.del(K.queue));
  function enqueue(ops) { ops = ops.filter((o) => okKey(o.k)); ops.forEach((o) => { queue[qkey(o)] = o; }); if (ops.length) saveQueue(); }
  function overlay(state) {
    const out = clone(state);
    Object.values(queue).forEach((o) => {
      if (!out[o.d]) out[o.d] = {};
      if (o.v === null) delete out[o.d][o.k]; else out[o.d][o.k] = clone(o.v);
    });
    return out;
  }

  /* ---------- session ---------- */
  let app = null, auth = null, db = null, fb = null;
  let user = null, unsub = null, mirror = null, initialDone = false, docExists = false, dirtyBefore = false, justLoggedIn = false;
  let status = 'idle', lastSync = 0, flushTimer = 0, retryTimer = 0, retryMs = 5000, flushing = null, warnedRules = false;
  const hint = () => jget(K.hint, null);
  const signedIn = () => !!user || !!hint();

  function setStatus(s) { status = s; if (s === 'synced') lastSync = Date.now(); renderMenu(); }

  function remoteOf(snap) {
    const d = snap.exists() ? snap.data() : {};
    return { saved: objOf(d.saved), history: objOf(d.history), progress: objOf(d.progress), prefs: objOf(d.prefs) };
  }

  // Bring this browser to the account's state (plus anything still waiting in the queue), and queue
  // whatever the account is missing.
  function applyRemote(remote, merge) {
    const cur = readLocal();
    let target = merge ? union(cur, remote) : remote;
    target = trim(overlay(target));
    writeLocal(target, cur);
    mirror = readLocal();
    enqueue(diff(remote, mirror));
  }

  function onSnap(snap) {
    docExists = snap.exists();
    const remote = remoteOf(snap);
    if (!initialDone) {
      initialDone = true;
      const first = LS.get(K.uid) !== user.uid || dirtyBefore;
      dirtyBefore = false;
      applyRemote(remote, first);
      LS.set(K.uid, user.uid);
      setStatus('synced');
      if (justLoggedIn) {
        justLoggedIn = false;
        const n = Object.keys(mirror.saved).length, h = Object.keys(mirror.history).length;
        toast('Signed in' + (n || h ? ': ' + [n && n + ' saved', h && h + (h === 1 ? ' exam' : ' exams')].filter(Boolean).join(', ') + ' synced' : ''));
      }
      emit('account:data', { progress: true });
      scheduleFlush(300);
      return;
    }
    if (snap.metadata.hasPendingWrites) return;
    applyRemote(remote, false);
    if (status !== 'offline') setStatus('synced');
  }
  // Only a real network problem counts as offline. Anything else (no database yet, rules not published,
  // API not enabled or blocked by the key's restrictions) is a setup problem and is shown as such.
  const NETWORK = ['unavailable', 'deadline-exceeded', 'cancelled', 'aborted'];
  function onSnapError(err) {
    if (err) console.warn('Account sync:', err.code, err.message);
    if (err && !NETWORK.includes(err.code)) {
      setStatus('error');
      if (!warnedRules) { warnedRules = true; toast('Sync is paused right now. Your changes are saved on this device.', 4200); }
    } else setStatus('offline');
  }

  // Local change happened (bookmark, exam, setting, page): diff it into the queue
  function scan() {
    if (!user && !hint()) return;
    if (!mirror) { dirtyBefore = true; return; }
    const loc = readLocal();
    enqueue(diff(mirror, loc));
    mirror = loc;
    scheduleFlush();
  }
  const later = () => setTimeout(scan, 0);
  root.addEventListener('icse:saved', later);
  root.addEventListener('icse:pref', later);
  root.addEventListener('exam:history', later);

  function scheduleFlush(ms) {
    if (flushTimer || !user || !initialDone) return;
    flushTimer = setTimeout(() => { flushTimer = 0; flush(); }, ms == null ? 2000 : ms);
  }
  function flush() {
    if (flushing) return flushing;
    if (!user || !db || !initialDone) return Promise.resolve(false);
    if (!Object.keys(queue).length) return Promise.resolve(true);
    flushing = (async () => {
      setStatus('syncing');
      try {
        const ref = fb.doc(db, 'users', user.uid);
        if (!docExists) { await fb.setDoc(ref, { uid: user.uid, createdAt: fb.serverTimestamp() }, { merge: true }); docExists = true; }
        for (;;) {
          const batch = Object.values(queue).slice(0, 150);
          if (!batch.length) break;
          const args = [];
          batch.forEach((o) => {
            args.push(new fb.FieldPath(o.d, o.k));
            args.push(o.v === null ? fb.deleteField() : clean(o.v));
          });
          args.push('updatedAt', fb.serverTimestamp());
          await fb.updateDoc(ref, ...args);
          batch.forEach((o) => { if (queue[qkey(o)] === o) delete queue[qkey(o)]; });
          saveQueue();
        }
        retryMs = 5000;
        setStatus('synced');
        return true;
      } catch (e) {
        onSnapError(e);
        clearTimeout(retryTimer); retryTimer = setTimeout(flush, retryMs); retryMs = Math.min(retryMs * 2, 60000);
        return false;
      } finally { flushing = null; }
    })();
    return flushing;
  }
  const clean = (v) => JSON.parse(JSON.stringify(v));
  root.addEventListener('online', () => { if (user) flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && user) flush(); });

  // Reading progress. The reader reports each page it settles on.
  root.addEventListener('icse:progress', (e) => {
    const d = e.detail || {}; if (!okKey(d.rid) || !(d.p > 0)) return;
    const m = objOf(jget(K.prog, {}));
    const res = root.App && root.App.byId ? root.App.byId(d.rid) : null;
    m[d.rid] = { p: d.p | 0, n: (res && res.pages) || (m[d.rid] && m[d.rid].n) || 0, at: Date.now() };
    const keep = Object.entries(m).sort((a, b) => (b[1].at || 0) - (a[1].at || 0));
    keep.slice(OPT.maxProgress).forEach(([rid]) => { delete m[rid]; LS.del(K.page + rid); });
    jset(K.prog, m);
    emit('account:data', { progress: true });
    later();
  });

  function recent(n) {
    return Object.entries(objOf(jget(K.prog, {})))
      .map(([rid, v]) => ({ rid, p: v.p | 0, n: v.n | 0, at: Number(v.at) || 0 }))
      .filter((x) => x.p > 0)
      .sort((a, b) => b.at - a.at)
      .slice(0, n || 8);
  }
  function forget(rid) {
    const m = objOf(jget(K.prog, {}));
    delete m[rid]; jset(K.prog, m); LS.del(K.page + rid);
    emit('account:data', { progress: true });
    later();
  }

  function wipeLocal() {
    [K.saved, K.hist, K.prog, K.hint, K.uid, K.queue].forEach(LS.del);
    try {
      const gone = [];
      for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.indexOf(K.page) === 0) gone.push(key); }
      gone.forEach(LS.del);
    } catch (e) { /* ignore */ }
    queue = {};
    if (root.App && root.App.applySaved) root.App.applySaved([]);
    if (root.Exam && root.Exam.replaceHistory) root.Exam.replaceHistory([]);
    emit('account:data', { progress: true });
  }

  function endSession() {
    const synced = !!LS.get(K.uid);   // data has reached the account from this browser at least once
    if (unsub) { unsub(); unsub = null; }
    user = null; mirror = null; initialDone = false; docExists = false; dirtyBefore = false; verifyPending = false;
    clearTimeout(flushTimer); flushTimer = 0; clearTimeout(retryTimer);
    if (synced) wipeLocal();
    else { LS.del(K.hint); LS.del(K.queue); queue = {}; }   // never synced (for example an unverified email): keep what is on this device
    status = 'idle';
    if (root.icseTrack) root.icseTrack.user('guest');
    renderNav(); closeMenu();
    emit('account:state', { user: null });
  }

  // Email and password accounts must confirm their email before anything is saved to the account
  const isPasswordUser = (u) => (u.providerData || []).some((p) => p.providerId === 'password');
  const needsVerify = (u) => !!u && isPasswordUser(u) && !u.emailVerified;
  let verifyPending = false, resendAt = 0;

  // Visitor statistics (only if analytics is on): a signed in flag, plus a sign up or log in event with the method.
  // Never the email, name or account id.
  function track(u) {
    const T = root.icseTrack; if (!T) return;
    T.user('signed_in');
    if (!justLoggedIn) return;
    const m = u.metadata || {}, p = u.providerData && u.providerData[0];
    T.event(m.creationTime && m.creationTime === m.lastSignInTime ? 'sign_up' : 'login', { method: p && p.providerId === 'google.com' ? 'google' : 'email' });
  }
  function startSession(u) {
    user = u;
    saveHint(u);
    track(u);
    initialDone = false; docExists = false; mirror = null;
    if (unsub) { unsub(); unsub = null; }
    renderNav(); closeDialog();
    if (needsVerify(u)) {
      verifyPending = true; dirtyBefore = true;   // what is on this device is merged in once the email is confirmed
      setStatus('verify');
      emit('account:state', { user: publicUser() });
      return;
    }
    verifyPending = false;
    unsub = fb.onSnapshot(fb.doc(db, 'users', u.uid), onSnap, onSnapError);
    emit('account:state', { user: publicUser() });
  }
  async function checkVerified(manual) {
    if (!user || !verifyPending || !auth) return;
    try {
      await user.reload();
      const u = auth.currentUser;
      if (u && !needsVerify(u)) {
        await u.getIdToken(true);   // refresh the sign-in so the database sees the verified email
        toast('Email verified. Your data is now syncing.');
        startSession(u);
      } else if (manual) toast('Not verified yet. Open the link in the email we sent.', 3600);
    } catch (e) { if (manual) toast('Could not check just now. Try again.'); }
  }
  async function resend() {
    if (!user) return;
    if (Date.now() < resendAt) { toast('Please wait a moment before sending it again.'); return; }
    try {
      await fb.sendEmailVerification(user);
      resendAt = Date.now() + 30000;
      toast('Verification email sent to ' + user.email + '. Check your spam folder too.', 4600);
    } catch (e) { toast(MESSAGES[e && e.code] || 'Could not send the email. Try again later.'); }
  }
  root.addEventListener('focus', () => checkVerified(false));   // back from the email tab
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVerified(false); });
  function onAuth(u) { u ? startSession(u) : endSession(); }

  const publicUser = () => {
    const u = user || hint(); if (!u) return null;
    const x = user ? { name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' } : { name: u.n || '', email: u.e || '', photo: u.p || '' };
    return x;
  };
  function saveHint(u) { jset(K.hint, { n: u.displayName || '', e: u.email || '', p: u.photoURL || '' }); }

  /* ---------- Firebase loading ---------- */
  let loadP = null, initP = null;
  function loadSdk() {
    if (root.ICSE_FB) return Promise.resolve();
    if (!loadP) loadP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/assets/vendor/firebase-lite.js';
      s.onload = res;
      s.onerror = () => { loadP = null; initP = null; s.remove(); rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return loadP;
  }
  function init() {
    if (!initP) initP = loadSdk().then(() => {
      fb = root.ICSE_FB;
      app = fb.initializeApp(FBCFG);
      auth = fb.getAuth(app);
      db = fb.initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
      fb.getRedirectResult(auth).catch((e) => showError(e));
      fb.onAuthStateChanged(auth, onAuth);
      renderDialogState();
    });
    return initP;
  }

  /* ---------- tiny DOM helper ---------- */
  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    kids.flat().forEach((c) => { if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  const ICON = {
    user: '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    out: '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/></svg>',
    close: '<svg class="ic" aria-hidden="true" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    google: '<svg class="ic g-logo" aria-hidden="true" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.7 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z"/><path fill="#FBBC05" d="M10.5 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.9-6.2A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/></svg>'
  };

  function toastHost() {
    let host = document.getElementById('toasts');
    if (!host) { host = h('div', { id: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(host); }
    return host;
  }
  function toast(msg, ms) {
    if (root.App && root.App.toast) return root.App.toast(msg, ms);
    const t = h('div', { class: 'toast' }, msg);
    toastHost().appendChild(t); setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 280); }, ms || 2600);
  }
  // A message with buttons, in the same glass capsule (the site never uses the browser's own alert or confirm boxes).
  // o: { msg, actions: [{ label, primary, onClick }], modal, ms, onCancel }
  function capsule(o) {
    const prev = document.activeElement;
    let closed = false, timer = 0;
    const close = () => {
      if (closed) return; closed = true; clearTimeout(timer);
      document.removeEventListener('keydown', onKey, true);
      t.classList.add('out'); setTimeout(() => t.remove(), 280);
      if (o.modal && prev && prev.focus) prev.focus({ preventScroll: true });
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); if (o.onCancel) o.onCancel(); } };
    const btns = o.actions.map((a) => h('button', { class: 'btn' + (a.primary ? ' btn-primary' : ''), type: 'button', onclick: () => { close(); if (a.onClick) a.onClick(); } }, a.label));
    const t = h('div', { class: 'toast ask', role: o.modal ? 'alertdialog' : 'status', 'aria-label': o.msg },
      h('span', { class: 't-msg' }, o.msg), h('div', { class: 't-acts' }, btns));
    toastHost().appendChild(t);
    if (o.modal) { document.addEventListener('keydown', onKey, true); (btns[btns.length - 1]).focus({ preventScroll: true }); }
    if (o.ms) timer = setTimeout(close, o.ms);
    return close;
  }
  // Resolves true or false
  function ask(msg, yes, no) {
    return new Promise((resolve) => capsule({
      msg, modal: true, onCancel: () => resolve(false),
      actions: [{ label: no || 'Cancel', onClick: () => resolve(false) }, { label: yes || 'OK', primary: true, onClick: () => resolve(true) }]
    }));
  }

  // A quiet invitation, shown once per device after the first bookmark and after the first finished exam
  const NUDGE = 'icse:nudge';
  const NUDGES = {
    saved: 'Create a free account to keep your bookmarks on every device.',
    exam: 'Create a free account to keep your exam scores and history on every device.'
  };
  function nudge(kind) {
    if (signedIn()) return;
    const seen = objOf(jget(NUDGE, {}));
    if (seen[kind]) return;
    seen[kind] = Date.now(); jset(NUDGE, seen);
    setTimeout(() => {
      if (signedIn()) return;
      capsule({ msg: NUDGES[kind], ms: 16000, actions: [{ label: 'Not now' }, { label: 'Create account', primary: true, onClick: () => openDialog('signup') }] });
    }, 2000);
  }

  /* ---------- nav button + account menu ---------- */
  const navIn = document.querySelector('.nav-in');
  const nav = document.querySelector('.nav');
  let btn = null, menu = null, M = {};
  if (navIn) {
    btn = h('button', { class: 'pill acct-btn', id: 'acctBtn', type: 'button', 'aria-haspopup': 'dialog', 'aria-expanded': 'false' });
    btn.addEventListener('click', () => (signedIn() ? toggleMenu() : openDialog('login')));
    navIn.appendChild(btn);
  }
  const first = (s) => String(s || '').trim().split(/\s+/)[0] || '';
  function avatar(u, cls) {
    const letter = (u.name || u.email || '?').trim().charAt(0).toUpperCase();
    const a = h('span', { class: 'avatar ' + (cls || '') }, letter);
    if (u.photo) {
      const img = h('img', { src: u.photo, alt: '', referrerpolicy: 'no-referrer', decoding: 'async' });
      img.addEventListener('load', () => { a.textContent = ''; a.appendChild(img); });
    }
    return a;
  }
  function renderNav() {
    if (!btn) return;
    const u = publicUser();
    btn.textContent = '';
    if (u) {
      btn.classList.add('on');
      btn.setAttribute('aria-label', 'Account: ' + (u.name || u.email));
      btn.title = u.email || 'Your account';
      btn.append(avatar(u), h('span', { class: 'lbl' }, first(u.name) || first(u.email.split('@')[0])));
    } else {
      btn.classList.remove('on');
      btn.setAttribute('aria-label', 'Log in or sign up');
      btn.title = 'Log in to save your bookmarks, history and settings';
      btn.innerHTML = ICON.user + '<span class="lbl">Log in</span>';
      btn.setAttribute('aria-expanded', 'false');
    }
  }
  function buildMenu() {
    if (menu || !nav) return;
    M.who = h('div', { class: 'am-who' });
    M.state = h('p', { class: 'am-state' });
    M.out = h('button', { class: 'btn am-out', type: 'button', html: ICON.out + 'Sign out', onclick: logout });
    M.settings = h('button', { class: 'btn am-set', type: 'button', html: ICON.user + 'Account settings', onclick: openSettings });
    M.vText = h('p', {});
    M.verify = h('div', { class: 'am-verify', hidden: true }, M.vText,
      h('div', { class: 'am-vbtns' },
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => checkVerified(true) }, 'I have verified'),
        h('button', { class: 'btn', type: 'button', onclick: resend }, 'Resend email')));
    M.note = h('p', { class: 'am-note' }, 'Your bookmarks, exam history, reading progress and theme are saved to this account.');
    menu = h('div', { class: 'acct-menu glass', id: 'acctMenu', role: 'dialog', 'aria-label': 'Your account', hidden: true },
      M.who, M.state, M.verify, M.note, M.settings, M.out);
    nav.appendChild(menu);
    document.addEventListener('pointerdown', (e) => { if (menu && !menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) closeMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu && !menu.hidden) { closeMenu(); btn.focus(); } });
  }
  function renderMenu() {
    if (!menu) return;
    const u = publicUser(); if (!u) return;
    M.who.textContent = '';
    M.who.append(avatar(u, 'lg'), h('div', {}, h('strong', {}, u.name || first(u.email.split('@')[0])), h('span', {}, u.email)));
    const text = { syncing: 'Syncing…', synced: lastSync ? 'Synced ' + ago(lastSync) : 'Synced', offline: 'Offline. Changes will sync when you are back online.', error: 'Sync is paused. Your changes are saved on this device.', verify: 'Waiting for email verification', idle: 'Connecting…' }[status];
    const pending = status === 'verify';
    M.verify.hidden = !pending; M.note.hidden = pending;
    M.vText.textContent = 'We sent a link to ' + u.email + '. Open it (check spam too) and your data starts syncing.';
    M.state.className = 'am-state ' + status;
    M.state.textContent = text;
  }
  const ago = (t) => { const s = Math.round((Date.now() - t) / 1000); return s < 45 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : 'today'; };
  function toggleMenu() { buildMenu(); menu.hidden ? openMenu() : closeMenu(); }
  function openMenu() { buildMenu(); renderMenu(); menu.hidden = false; btn.setAttribute('aria-expanded', 'true'); init().catch(() => {}); }
  function closeMenu() { if (menu) menu.hidden = true; if (btn) btn.setAttribute('aria-expanded', 'false'); }

  async function logout() {
    closeMenu();
    if (Object.keys(queue).length) {
      const ok = await Promise.race([flush(), new Promise((r) => setTimeout(() => r(false), 4000))]);
      if (!ok && !(await ask('Some recent changes have not reached your account yet. You may be offline. Sign out anyway and lose them?', 'Sign out anyway', 'Stay signed in'))) return;
    }
    try { await fb.signOut(auth); } catch (e) { toast('Could not sign out. Try again.'); return; }
    toast('Signed out');
  }

  /* ---------- log in / sign up dialog ---------- */
  let dlg = null, D = {}, mode = 'login', busy = false, returnFocus = null;
  const SUB = 'Save your bookmarks, exam history and settings, and pick up where you left off on any device.';
  function buildDialog() {
    if (dlg) return;
    D.title = h('h3', { id: 'acTitle' });
    D.sub = h('p', { class: 'nm' }, SUB);
    D.google = h('button', { class: 'btn ac-google', type: 'button', html: ICON.google + 'Continue with Google', onclick: google, disabled: true });
    D.or = h('div', { class: 'ac-or' }, h('span', {}, 'or'));
    D.name = h('input', { id: 'acName', type: 'text', autocomplete: 'name', maxlength: '60', placeholder: 'Your name (optional)' });
    D.email = h('input', { id: 'acEmail', type: 'email', autocomplete: 'email', inputmode: 'email', required: true, placeholder: 'you@example.com', autocapitalize: 'none', spellcheck: 'false' });
    D.pw = h('input', { id: 'acPw', type: 'password', required: true, minlength: '6', placeholder: 'Password' });
    D.show = h('button', { class: 'ac-show', type: 'button', 'aria-pressed': 'false', onclick: () => { const on = D.pw.type === 'password'; D.pw.type = on ? 'text' : 'password'; D.show.textContent = on ? 'Hide' : 'Show'; D.show.setAttribute('aria-pressed', on); } }, 'Show');
    D.err = h('p', { class: 'ac-msg', role: 'alert' });
    D.submit = h('button', { class: 'btn btn-primary ac-submit', type: 'submit' });
    D.forgot = h('button', { class: 'ac-link', type: 'button', onclick: forgot }, 'Forgot password?');
    D.swap = h('button', { class: 'ac-link strong', type: 'button', onclick: () => setMode(mode === 'login' ? 'signup' : 'login') });
    D.swapText = h('span', {});
    D.form = h('form', { class: 'ac-form', novalidate: true, onsubmit: submit },
      h('label', { class: 'sr', for: 'acName' }, 'Name'), D.name,
      h('label', { class: 'sr', for: 'acEmail' }, 'Email'), D.email,
      h('div', { class: 'ac-pw' }, h('label', { class: 'sr', for: 'acPw' }, 'Password'), D.pw, D.show),
      D.err, D.submit,
      h('div', { class: 'ac-links' }, D.forgot, h('span', { class: 'ac-swap' }, D.swapText, ' ', D.swap)));
    const close = h('button', { class: 'ib dlg-x', type: 'button', 'aria-label': 'Close', html: ICON.close, onclick: closeDialog });
    dlg = h('div', { class: 'dlg ac-dlg', id: 'authDlg', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'acTitle' },
      h('div', { class: 'dlg-card glass' }, close, D.title, D.sub, D.google, D.or, D.form,
        h('p', { class: 'ac-foot' }, 'An account is optional. The whole library works without one.')));
    wireDialog(dlg, closeDialog);
    document.body.appendChild(dlg);
  }
  // Click outside or Esc closes; Tab stays inside
  function wireDialog(el, close) {
    // Esc also works when focus was lost (a button that was disabled while saving)
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.hidden) { e.preventDefault(); close(); } });
    el.addEventListener('click', (e) => { if (e.target === el) close(); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const f = [...el.querySelectorAll('button:not([hidden]):not([disabled]),input:not([hidden])')].filter((x) => x.offsetParent !== null);
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
  }
  function setMode(m) {
    mode = m;
    const up = m === 'signup';
    D.title.textContent = up ? 'Create your account' : 'Log in';
    D.submit.textContent = up ? 'Create account' : 'Log in';
    D.name.hidden = !up;
    D.forgot.hidden = up;
    D.pw.autocomplete = up ? 'new-password' : 'current-password';
    D.swapText.textContent = up ? 'Already have an account?' : 'New here?';
    D.swap.textContent = up ? 'Log in' : 'Create an account';
    D.google.hidden = !OPT.google;
    D.or.hidden = !(OPT.google && OPT.email);
    D.form.hidden = !OPT.email;
    setMsg('');
  }
  function setMsg(text, ok) { D.err.textContent = text || ''; D.err.className = 'ac-msg' + (ok ? ' ok' : ''); }
  function renderDialogState() { if (dlg) D.google.disabled = !auth || busy; }
  function setBusy(on) {
    busy = on;
    D.submit.disabled = on;
    D.submit.textContent = on ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in';
    D.google.disabled = on || !auth;
  }
  function openDialog(m, reason) {
    buildDialog(); setMode(m || 'login'); closeMenu();
    D.sub.textContent = reason || SUB;
    returnFocus = document.activeElement;
    dlg.hidden = false;
    renderDialogState();
    (OPT.email ? D.email : D.google).focus();
    init().catch(() => setMsg('Could not load sign-in. Check your connection and try again.'));
  }
  function closeDialog() {
    if (!dlg || dlg.hidden) return;
    dlg.hidden = true; D.pw.value = ''; D.pw.type = 'password'; D.show.textContent = 'Show'; setBusy(false);
    justLoggedIn = justLoggedIn && !!user;
    if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
  }

  const MESSAGES = {
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'Wrong email or password.',
    'auth/invalid-email': 'That email address does not look right.',
    'auth/email-already-in-use': 'That email already has an account. Log in instead.',
    'auth/weak-password': 'Choose a stronger password (at least 6 characters).',
    'auth/missing-password': 'Enter your password.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/network-request-failed': 'No internet connection. Try again.',
    'auth/requires-recent-login': 'For safety, sign out and sign in again, then try once more.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/operation-not-allowed': 'This sign-in method is not turned on yet in Firebase (Authentication > Sign-in method).',
    'auth/unauthorized-domain': 'This website address is not allowed yet. Add it under Firebase > Authentication > Settings > Authorized domains.',
    'auth/account-exists-with-different-credential': 'That email is already registered with a different sign-in method.',
    'auth/invalid-api-key': 'The Firebase settings in firebase-config.js are not correct.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'The Firebase settings in firebase-config.js are not correct.'
  };
  function showError(ex) {
    const code = ex && ex.code;
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return;
    if (!dlg || dlg.hidden) { if (code) toast(MESSAGES[code] || 'Could not sign in. Try again.'); return; }
    setMsg(MESSAGES[code] || 'Something went wrong. Please try again.');
  }
  function bad(msg, field) { setMsg(msg); if (field) field.focus(); }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    const email = D.email.value.trim(), pw = D.pw.value, name = D.name.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Enter a valid email address.', D.email);
    if (!pw) return bad('Enter your password.', D.pw);
    if (mode === 'signup' && pw.length < OPT.minPassword) return bad('Use at least ' + OPT.minPassword + ' characters for your password.', D.pw);
    if (!auth) return bad('Still loading. Try again in a moment.');
    setMsg(''); setBusy(true); justLoggedIn = true;
    try {
      if (mode === 'signup') {
        const c = await fb.createUserWithEmailAndPassword(auth, email, pw);
        if (name) { await fb.updateProfile(c.user, { displayName: name }); saveHint(auth.currentUser); renderNav(); emit('account:state', { user: publicUser() }); }
        justLoggedIn = false;
        try { await fb.sendEmailVerification(c.user); resendAt = Date.now() + 30000; } catch (e) { /* the menu offers Resend */ }
        toast('Account created. We sent a verification link to ' + email + '. Open it to start syncing.', 6000);
      } else {
        await fb.signInWithEmailAndPassword(auth, email, pw);
        if (needsVerify(auth.currentUser)) { justLoggedIn = false; toast('Your email is not verified yet. Open the account menu to resend the link.', 5200); }
      }
    } catch (ex) { justLoggedIn = false; showError(ex); }
    setBusy(false);
  }
  // No await before the popup: browsers only open it straight from a tap
  function google() {
    if (busy || !auth) return;
    const provider = new fb.GoogleAuthProvider();
    setMsg(''); setBusy(true); justLoggedIn = true;
    fb.signInWithPopup(auth, provider).catch((ex) => {
      if (ex && (ex.code === 'auth/popup-blocked' || ex.code === 'auth/operation-not-supported-in-this-environment')) {
        return fb.signInWithRedirect(auth, provider);
      }
      justLoggedIn = false; showError(ex);
    }).finally(() => setBusy(false));
  }
  async function forgot() {
    const email = D.email.value.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Type your email above first, then press Forgot password.', D.email);
    if (!auth) return bad('Still loading. Try again in a moment.');
    try {
      await fb.sendPasswordResetEmail(auth, email);
      setMsg('If an account exists for ' + email + ', a reset link is on its way. Check your spam folder too.', true);
    } catch (ex) { showError(ex); }
  }

  /* ---------- account settings: name and password ---------- */
  let sdlg = null, S = {}, sReturn = null;
  function buildSettings() {
    if (sdlg) return;
    S.email = h('p', { class: 'nm' });
    S.name = h('input', { id: 'asName', type: 'text', autocomplete: 'name', maxlength: '60', placeholder: 'Your name' });
    S.nameMsg = h('p', { class: 'ac-msg', role: 'alert' });
    S.nameBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save name');
    S.cur = h('input', { id: 'asCur', type: 'password', autocomplete: 'current-password', placeholder: 'Current password' });
    S.pw = h('input', { id: 'asNew', type: 'password', autocomplete: 'new-password', placeholder: 'New password (at least ' + OPT.minPassword + ' characters)' });
    S.pwMsg = h('p', { class: 'ac-msg', role: 'alert' });
    S.pwBtn = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Update password');
    S.pwForm = h('form', { class: 'ac-form as-sec', novalidate: true, onsubmit: changePassword },
      h('h4', {}, 'Change password'),
      h('label', { class: 'sr', for: 'asCur' }, 'Current password'), S.cur,
      h('label', { class: 'sr', for: 'asNew' }, 'New password'), S.pw, S.pwMsg, S.pwBtn);
    S.google = h('p', { class: 'as-note as-sec' }, 'You sign in with Google, so your password is managed in your Google account.');
    const close = h('button', { class: 'ib dlg-x', type: 'button', 'aria-label': 'Close', html: ICON.close, onclick: closeSettings });
    sdlg = h('div', { class: 'dlg ac-dlg', id: 'settingsDlg', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'asTitle' },
      h('div', { class: 'dlg-card glass' }, close, h('h3', { id: 'asTitle' }, 'Account settings'), S.email,
        h('form', { class: 'ac-form as-sec', novalidate: true, onsubmit: saveName },
          h('h4', {}, 'Name'), h('label', { class: 'sr', for: 'asName' }, 'Name'), S.name, S.nameMsg, S.nameBtn),
        S.pwForm, S.google));
    wireDialog(sdlg, closeSettings);
    document.body.appendChild(sdlg);
  }
  const setNote = (el, text, ok) => { el.textContent = text || ''; el.className = 'ac-msg' + (ok ? ' ok' : ''); };
  function openSettings() {
    if (!user) return;
    buildSettings(); closeMenu();
    S.email.textContent = user.email || '';
    S.name.value = user.displayName || '';
    S.cur.value = S.pw.value = '';
    setNote(S.nameMsg, ''); setNote(S.pwMsg, '');
    const pwUser = isPasswordUser(user);
    S.pwForm.hidden = !pwUser; S.google.hidden = pwUser;
    sReturn = document.activeElement;
    sdlg.hidden = false; S.name.focus();
  }
  function closeSettings() {
    if (!sdlg || sdlg.hidden) return;
    sdlg.hidden = true; S.cur.value = S.pw.value = '';
    if (sReturn && sReturn.focus) sReturn.focus({ preventScroll: true });
  }
  async function saveName(e) {
    e.preventDefault();
    const name = S.name.value.trim();
    if (!name) return setNote(S.nameMsg, 'Type the name you want to use.');
    S.nameBtn.disabled = true;
    try {
      await fb.updateProfile(user, { displayName: name });
      saveHint(user); renderNav(); renderMenu();
      emit('account:state', { user: publicUser() });
      setNote(S.nameMsg, 'Name updated.', true);
    } catch (ex) { setNote(S.nameMsg, MESSAGES[ex && ex.code] || 'Could not save the name. Try again.'); }
    S.nameBtn.disabled = false;
  }
  async function changePassword(e) {
    e.preventDefault();
    const cur = S.cur.value, pw = S.pw.value;
    if (!cur) return setNote(S.pwMsg, 'Enter your current password.');
    if (pw.length < OPT.minPassword) return setNote(S.pwMsg, 'Use at least ' + OPT.minPassword + ' characters for the new password.');
    if (pw === cur) return setNote(S.pwMsg, 'The new password is the same as the current one.');
    S.pwBtn.disabled = true; setNote(S.pwMsg, '');
    try {
      await fb.reauthenticateWithCredential(user, fb.EmailAuthProvider.credential(user.email, cur));
      await fb.updatePassword(user, pw);
      S.cur.value = S.pw.value = '';
      setNote(S.pwMsg, 'Password updated.', true);
      toast('Password updated');
    } catch (ex) {
      const c = ex && ex.code;
      setNote(S.pwMsg, c === 'auth/invalid-credential' || c === 'auth/wrong-password' ? 'Your current password is wrong.' : MESSAGES[c] || 'Could not update the password. Try again.');
    }
    S.pwBtn.disabled = false;
  }

  /* ---------- guests: invitations at the right moment ---------- */
  root.addEventListener('icse:saved', () => { if (!signedIn() && (jget(K.saved, []) || []).length) nudge('saved'); });
  root.addEventListener('exam:history', () => {
    const n = root.Exam && root.Exam.history ? root.Exam.history().length : (jget(K.hist, []) || []).length;
    if (!signedIn() && n) nudge('exam');
  });
  // A guest with nothing saved yet who taps Saved or History is offered an account instead of an empty list
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#savedBtn, #histBtn');
    if (!b || signedIn()) return;
    const saved = b.id === 'savedBtn';
    const n = saved ? (jget(K.saved, []) || []).length : (root.Exam && root.Exam.history ? root.Exam.history().length : 0);
    if (n) return;
    e.preventDefault(); e.stopPropagation();
    openDialog('signup', saved ? 'Create a free account to save papers and see them on every device.' : 'Create a free account to keep your timed-exam scores and see them on every device.');
  }, true);

  /* ---------- public API ---------- */
  root.Account = {
    open: openDialog,
    openSettings,
    logout,
    user: publicUser,
    signedIn,
    recent,
    forget,
    status: () => status
  };

  /* ---------- start ---------- */
  renderNav();
  if (hint()) {   // a student who is already signed in: connect in the background once the page has settled
    const go = () => setTimeout(() => init().catch(() => {}), 400);
    document.readyState === 'complete' ? go() : root.addEventListener('load', go, { once: true });
  }
})();
