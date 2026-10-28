// Download counter, stored in your own Firebase project (Cloud Firestore).
// One small document per paper in the collection "downloads":   downloads/<paper id>  =  { n: 12 }
//   - EVERY click on a Download button adds 1 to that paper's document (atomic Firestore increment), no limits.
//   - Reading every count is a short list request (300 papers per request).
//   - A failed write is retried up to 3 times, and the reason is printed in the browser console (F12).
// It talks to Firestore's REST API with the public web API key from firebase-config.js, so no SDK is loaded.
// Needs the rules in README ("Download counter rules"). With no Firebase keys set it does nothing.
(function (root) {
  'use strict';
  var DB = '(default)';

  function setup() {
    var f = root.ICSE_FIREBASE || {}, c = (root.ICSE_CONFIG || {}).counter || {};
    if (c.enabled === false || !f.apiKey || !f.projectId) return null;
    var col = String(c.collection || 'downloads').replace(/^\/|\/$/g, '');
    var path = 'projects/' + f.projectId + '/databases/' + DB + '/documents';
    return { key: encodeURIComponent(f.apiKey), base: 'https://firestore.googleapis.com/v1/' + path, path: path, col: col };
  }

  root.ICSE_COUNTER = {
    ready: function () { return !!setup(); },

    // Resolves to { paperId: count } or null if it could not be read (the caller then keeps what it already had)
    fetchAll: function () {
      var s = setup(); if (!s) return Promise.resolve(null);
      var out = {};
      function page(token) {
        var url = s.base + '/' + s.col + '?pageSize=300&mask.fieldPaths=n&key=' + s.key + (token ? '&pageToken=' + encodeURIComponent(token) : '');
        return fetch(url).then(function (res) {
          if (res.status === 404) return out;                 // nothing counted yet
          if (!res.ok) {
            res.text().then(function (t) { console.warn('Download counter: reading counts failed, Firestore answered ' + res.status, t.slice(0, 300)); }).catch(function () {});
            throw new Error('counter ' + res.status);
          }
          return res.json().then(function (j) {
            (j.documents || []).forEach(function (d) {
              var id = String(d.name || '').split('/').pop(), v = ((d.fields || {}).n) || {};
              out[id] = Number(v.integerValue !== undefined ? v.integerValue : v.doubleValue) || 0;
            });
            return j.nextPageToken ? page(j.nextPageToken) : out;
          });
        });
      }
      return page('').catch(function () { return null; });
    },

    // Adds 1 to one paper. Fire and forget, with retries.
    hit: function (id) {
      var s = setup();
      if (!s) { console.warn('Download counter is off: Firebase keys are not set on this site'); return; }
      if (!id) return;
      var body = JSON.stringify({ writes: [{ transform: { document: s.path + '/' + s.col + '/' + id, fieldTransforms: [{ fieldPath: 'n', increment: { integerValue: '1' } }] } }] });
      var tries = 0;
      function send() {
        tries++;
        var retry = function () { if (tries < 4) setTimeout(send, 600 * Math.pow(2, tries - 1) + Math.random() * 400); };
        try {
          fetch(s.base + ':commit?key=' + s.key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: tries === 1 })
            .then(function (res) {
              if (res.ok) return;
              // 403 = Firestore rules or API key restrictions, 400 = bad request
              res.text().then(function (t) { console.warn('Download counter: Firestore answered ' + res.status, t.slice(0, 300)); }).catch(function () {});
              if (res.status === 409 || res.status === 429 || res.status >= 500) retry();
            })
            .catch(retry);
        } catch (e) { /* ignore */ }
      }
      send();
    }
  };
})(window);
