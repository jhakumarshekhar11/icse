// Fills the site notice and the report e-mail link from config.js on the static pages
// (about, terms, privacy, auth). Kept as a file so the Content Security Policy needs no inline scripts.
(function () {
  var c = window.ICSE_CONFIG || {};
  var n = document.getElementById('notice');
  if (c.notice && n) n.textContent = c.notice;
  var m = document.getElementById('mail');
  if (c.reportEmail && m) { m.href = 'mailto:' + c.reportEmail; m.textContent = c.reportEmail; }
})();
