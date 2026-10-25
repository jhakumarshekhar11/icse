// Behaviour for the generated paper pages (built by scripts/build-seo.js).
// Kept as a file so the Content Security Policy needs no inline scripts.
(function () {
  var b = document.getElementById('dl');
  if (!b) return;

  // While a timed exam with a hidden marking scheme runs on this paper, the Download button is switched off
  try {
    var s = JSON.parse(localStorage.getItem('icse:exam:active'));
    if (s && s.lockFrom > 1 && Date.now() < s.writingEnd && s.id === b.getAttribute('data-id')) {
      b.removeAttribute('href'); b.removeAttribute('download');
      b.setAttribute('aria-disabled', 'true');
      b.textContent = 'Download opens when your exam ends';
      b.style.opacity = '.5'; b.style.pointerEvents = 'none';
    }
  } catch (e) { /* storage unavailable or no exam running */ }

  // Count one download per paper per tab session
  b.addEventListener('click', function () {
    var c = (window.ICSE_CONFIG || {}).counter, id = b.getAttribute('data-id');
    if (!c || !c.enabled || !id) return;
    try { if (sessionStorage.getItem('icse:hit:' + id)) return; sessionStorage.setItem('icse:hit:' + id, '1'); } catch (e) {}
    fetch(c.baseUrl + '/hit/' + c.namespace + '/' + encodeURIComponent(id), { keepalive: true }).catch(function () {});
  });
})();
