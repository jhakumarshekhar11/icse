// Download counter, stored in your own Firebase project (Cloud Firestore) instead of a free third-party service.
// All counts live in ONE document, stats/downloads, as a map: { counts: { "<paper id>": 12, ... } }.
//   - Reading every count is a single request (the old counter made one request per paper and treated any
//     failed request as 0, which is why numbers jumped around).
//   - Counting a download is one atomic "add 1" (Firestore increment), so two people clicking at once never lose a count.
// It talks to Firestore's REST API with the public web API key from firebase-config.js, so no SDK is loaded.
// Needs the rules in firestore.rules.counter (see README). With no Firebase keys set it quietly does nothing.
(function (root) {
  'use strict';
  var DB = '(default)';

  function setup() {
    var f = root.ICSE_FIREBASE || {}, c = (root.ICSE_CONFIG || {}).counter || {};
    if (c.enabled === false || !f.apiKey || !f.projectId) return null;
    var doc = String(c.doc || 'stats/downloads').replace(/^\/|\/$/g, '');
    var base = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(f.projectId) + '/databases/' + DB + '/documents';
    return { key: encodeURIComponent(f.apiKey), url: base + '/' + doc, name: 'projects/' + f.projectId + '/databases/' + DB + '/documents/' + doc };
  }

  // A map key that may hold dashes or dots has to be quoted in a Firestore field path
  function fieldPath(id) { return 'counts.`' + String(id).replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'; }

  root.ICSE_COUNTER = {
    ready: function () { return !!setup(); },

    // Resolves to { paperId: count } or null if it could not be read (the caller then keeps what it already had)
    fetchAll: function () {
      var s = setup(); if (!s) return Promise.resolve(null);
      return fetch(s.url + '?key=' + s.key).then(function (res) {
        if (res.status === 404) return {};                 // nothing counted yet
        if (!res.ok) throw new Error('counter ' + res.status);
        return res.json().then(function (j) {
          var f = (((j.fields || {}).counts || {}).mapValue || {}).fields || {}, out = {};
          Object.keys(f).forEach(function (k) { var v = f[k]; out[k] = Number(v.integerValue !== undefined ? v.integerValue : v.doubleValue) || 0; });
          return out;
        });
      }).catch(function () { return null; });
    },

    // Adds 1 to one paper. Fire and forget.
    hit: function (id) {
      var s = setup(); if (!s || !id) return;
      var body = { writes: [{ transform: { document: s.name, fieldTransforms: [{ fieldPath: fieldPath(id), increment: { integerValue: '1' } }] } }] };
      try {
        fetch(s.url.replace(/\/[^/]+\/[^/]+$/, '') + ':commit?key=' + s.key, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true
        }).catch(function () {});
      } catch (e) { /* ignore */ }
    }
  };
})(window);
