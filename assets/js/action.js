// Our own page for the links Firebase sends by email (/auth/action/):
// confirm email address, reset password, undo an email change.
// Set it once in Firebase console > Authentication > Templates > (pencil) > Customize action URL.
(function () {
  'use strict';
  var CFG = window.ICSE_FIREBASE || {};
  var MIN = (window.ICSE_ACCOUNT && window.ICSE_ACCOUNT.minPassword) || 8;
  var box = document.getElementById('act'), title = document.getElementById('actTitle');
  var q = new URLSearchParams(location.search);
  var mode = q.get('mode'), code = q.get('oobCode');

  // Only go back to this website, never to another address
  var back = '/';
  try {
    var c = q.get('continueUrl');
    if (c) { var u = new URL(c, location.origin); if (u.origin === location.origin) back = u.pathname + u.search + u.hash; }
  } catch (e) {}

  var ICONS = {
    ok: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    bad: '<path d="M7 7l10 10M17 7L7 17"/>',
    key: '<circle cx="8" cy="15" r="3.5"/><path d="M10.5 12.5L19 4M16 7l2.5 2.5"/>',
    wait: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  };
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function icon(kind) {
    var d = el('div', 'act-ic ' + kind);
    d.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[kind === 'ok' || kind === 'bad' ? kind : kind] || ICONS.wait) + '</svg>';
    return d;
  }
  function link(text, href, primary) { var a = el('a', 'btn ' + (primary ? 'btn-primary' : ''), text); a.href = href; return a; }
  function show(kind, heading, text, extra) {
    title.textContent = heading;
    box.textContent = '';
    box.appendChild(icon(kind));
    if (text) box.appendChild(el('p', 'act-p', text));
    if (extra) [].concat(extra).forEach(function (n) { box.appendChild(n); });
  }
  function actions() {
    var d = el('div', 'act-btns');
    for (var i = 0; i < arguments.length; i++) d.appendChild(arguments[i]);
    return d;
  }

  var FAIL = {
    'auth/expired-action-code': 'This link has expired. Links work for a limited time.',
    'auth/invalid-action-code': 'This link is not valid any more. It may already have been used.',
    'auth/user-disabled': 'This account has been disabled.',
    'auth/user-not-found': 'We could not find this account. It may have been deleted.',
    'auth/weak-password': 'That password is too weak. Use at least ' + MIN + ' characters.',
    'auth/network-request-failed': 'No internet connection. Check it and try again.'
  };
  function why(e) { return FAIL[e && e.code] || 'Something went wrong. Please try again in a moment.'; }

  function load() {
    return new Promise(function (ok, no) {
      if (window.ICSE_FB) return ok(window.ICSE_FB);
      var s = document.createElement('script');
      s.src = '/assets/vendor/firebase-lite.js';
      s.onload = function () { window.ICSE_FB ? ok(window.ICSE_FB) : no(new Error('sdk')); };
      s.onerror = function () { no({ code: 'auth/network-request-failed' }); };
      document.head.appendChild(s);
    });
  }

  function verifyEmail(fb, auth) {
    return fb.applyActionCode(auth, code).then(function () {
      show('ok', 'Email confirmed', 'Your email address is confirmed. If you signed up on another tab or device, it will notice by itself, and you can close this page.',
        actions(link('Open ICSE Resources', back, true)));
    }, function (e) {
      var expired = e && (e.code === 'auth/expired-action-code' || e.code === 'auth/invalid-action-code');
      show('bad', 'Could not confirm', why(e) + (expired ? ' If you already confirmed your email, just log in. If not, log in and choose "Resend email" from the account menu.' : ''),
        actions(link('Go to the library', '/', true)));
    });
  }

  function recoverEmail(fb, auth) {
    var restored = '';
    return fb.checkActionCode(auth, code).then(function (info) {
      restored = (info && info.data && info.data.email) || '';
      return fb.applyActionCode(auth, code);
    }).then(function () {
      show('ok', 'Email restored', 'Your account email is back to ' + (restored || 'the old address') + '. If you did not change it yourself, reset your password now so only you can get in.',
        actions(link('Go to the library', '/', true)));
    }, function (e) {
      show('bad', 'Could not restore', why(e), actions(link('Go to the library', '/', true)));
    });
  }

  function resetPassword(fb, auth) {
    return fb.verifyPasswordResetCode(auth, code).then(function (email) {
      title.textContent = 'Choose a new password';
      box.textContent = '';
      box.appendChild(icon('key'));
      box.appendChild(el('p', 'act-p', 'For ' + email));
      var form = el('form', 'ac-form'); form.noValidate = true;
      var wrap = el('div', 'ac-pw'), pw = el('input'); pw.type = 'password'; pw.placeholder = 'New password (' + MIN + '+ characters)'; pw.autocomplete = 'new-password'; pw.required = true; pw.setAttribute('aria-label', 'New password');
      var sh = el('button', 'ac-show', 'Show'); sh.type = 'button';
      sh.onclick = function () { var t = pw.type === 'password'; pw.type = t ? 'text' : 'password'; sh.textContent = t ? 'Hide' : 'Show'; };
      wrap.appendChild(pw); wrap.appendChild(sh);
      var msg = el('p', 'ac-msg'); msg.setAttribute('role', 'alert');
      var go = el('button', 'btn btn-primary', 'Save new password'); go.type = 'submit';
      form.appendChild(wrap); form.appendChild(msg); form.appendChild(go);
      box.appendChild(form);
      pw.focus();
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        if (pw.value.length < MIN) { msg.textContent = 'Use at least ' + MIN + ' characters.'; pw.focus(); return; }
        msg.textContent = ''; go.disabled = true; go.textContent = 'Saving...';
        fb.confirmPasswordReset(auth, code, pw.value).then(function () {
          show('ok', 'Password changed', 'Your password is updated. Log in with the new one.', actions(link('Open ICSE Resources', back, true)));
        }, function (e) {
          go.disabled = false; go.textContent = 'Save new password';
          if (e && (e.code === 'auth/expired-action-code' || e.code === 'auth/invalid-action-code')) show('bad', 'Link no longer works', why(e) + ' Ask for a new reset link from the Log in window.', actions(link('Go to the library', '/', true)));
          else msg.textContent = why(e);
        });
      });
    }, function (e) {
      show('bad', 'Link no longer works', why(e) + ' Ask for a new reset link from the Log in window.', actions(link('Go to the library', '/', true)));
    });
  }

  if (!code || !mode) {
    show('bad', 'Nothing to do here', 'This page opens from the links we email you, such as confirming your email or resetting your password.', actions(link('Go to the library', '/', true)));
    return;
  }
  if (!CFG.apiKey || !CFG.projectId) {
    show('bad', 'Accounts are not available', 'Accounts are switched off on this site right now.', actions(link('Go to the library', '/', true)));
    return;
  }
  show('wait', 'One moment', 'Checking your link...');
  load().then(function (fb) {
    var auth = fb.getAuth(fb.initializeApp(CFG));
    if (mode === 'verifyEmail') return verifyEmail(fb, auth);
    if (mode === 'resetPassword') return resetPassword(fb, auth);
    if (mode === 'recoverEmail') return recoverEmail(fb, auth);
    show('bad', 'Link not supported', 'This kind of link is not handled here. Go back to the site and try again.', actions(link('Go to the library', '/', true)));
  }).catch(function (e) {
    show('bad', 'Could not load', why(e), actions(link('Try again', location.href, true)));
  });
})();
