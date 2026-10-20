// Sets the light or dark theme before the first paint (loaded in <head>, no inline script needed).
(function () {
  var t = null;
  try { t = localStorage.getItem('icse:theme'); } catch (e) { /* storage unavailable */ }
  if (t !== 'light' && t !== 'dark') t = (window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
})();