// Visitor statistics with Google Analytics 4 (real time view: analytics.google.com > Reports > Realtime).
// Every visit is counted. A small notice tells visitors about it once. Off when ICSE_CONFIG.analyticsId is
// empty, and on the admin and auth pages.
(function () {
  'use strict';
  var id = (window.ICSE_CONFIG || {}).analyticsId;
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return;
  if (/^\/(admin|auth)(\/|$)/.test(location.pathname)) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag('js', new Date());
  // Whether this visitor has an account on this browser: a yes/no flag only (never the email or any id).
  // Set before the first page view, so the admin Analytics page can split visitors into signed in and guests.
  var acct = false;
  try { acct = !!localStorage.getItem('icse:acct'); } catch (e) {}
  gtag('set', 'user_properties', { account_status: acct ? 'signed_in' : 'guest' });
  // Used by account.js to report sign ups, log ins and the flag above when it changes
  window.icseTrack = {
    user: function (status) { gtag('set', 'user_properties', { account_status: status }); },
    event: function (name, params) { gtag('event', name, params || {}); }
  };
  gtag('config', id, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  var s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);

  // One-time notice
  var KEY = 'icse:notice:stats';
  try { if (localStorage.getItem(KEY)) return; } catch (e) {}
  function show() {
    var b = document.createElement('div');
    b.className = 'consent glass'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Visitor statistics notice');
    var p = document.createElement('p');
    p.appendChild(document.createTextNode('This site counts visits with Google Analytics to see which papers are useful. No ads, no personal details. '));
    var a = document.createElement('a'); a.href = '/privpol/'; a.textContent = 'Privacy'; p.appendChild(a);
    var row = document.createElement('div'); row.className = 'consent-btns';
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'btn btn-primary'; ok.textContent = 'Got it';
    ok.onclick = function () {
      try { localStorage.setItem(KEY, '1'); } catch (e) {}
      b.classList.add('out'); setTimeout(function () { b.remove(); }, 260);
    };
    row.appendChild(ok); b.appendChild(p); b.appendChild(row); document.body.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 800); });
  else setTimeout(show, 800);
})();
