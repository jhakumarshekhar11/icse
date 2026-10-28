// Download counter, stored in your own Firebase project (Cloud Firestore) instead of a free third-party service.
// All counts live in ONE document, stats/downloads, as a map: { counts: { "<paper id>": 12, ... } }.
//   - Reading every count is a single request (the old counter made one request per paper and treated any
//     failed request as 0, which is why numbers jumped around).
//   - Counting a download is one atomic "add 1" (Firestore increment), so two people clicking at once never lose a count.
// It talks to Firestore's REST API with the public web API key from firebase-config.js, so no SDK is loaded.
// Busy periods: a failed write (busy server, brief network drop) is retried up to 3 times with a growing delay.
// Optional: ICSE_CONFIG.counter.shards = N spreads the writes over N documents (stats/downloads, stats/downloads-1 ...)
// and adds them up when reading, so heavy traffic cannot overload one document. Default 1 = the single document
// above, which needs no rule change. For N > 1 the rules must also allow the extra documents (see README).
// Needs the rules in firestore.rules.counter (see README). With no Firebase keys set it quietly does nothing.
(function (root) {
  'use strict';
  var DB = '(default)';

  function setup() {
    var f = root.ICSE_FIREBASE || {}, c = (root.ICSE_CONFIG || {}).counter || {};
    if (c.enabled === false || !f.apiKey || !f.projectId) return null;
    var doc = String(c.doc || 'stats/downloads').replace(/^\/|\/$/g, '');
    var n = Math.max(1, Math.min(20, parseInt(c.shards, 10) || 1));
    var root_ = 'projects/' + f.projectId + '/databases/' + DB + '/documents';
    var base = 'https://firestore.googleapis.com/v1/' + root_;
    var names = [];
    for (var i = 0; i < n; i++) names.push(root_ + '/' + doc + (i ? '-' + i : ''));
    return { key: encodeURIComponent(f.apiKey), url: base + '/' + doc, base: base, name: names[0], names: names, shards: n };
  }

  function sumCounts(into, j) {
    var f = (((j.fields || {}).counts || {}).mapValue || {}).fields || {};
    Object.keys(f).forEach(function (k) { var v = f[k]; into[k] = (into[k] || 0) + (Number(v.integerValue !== undefined ? v.integerValue : v.doubleValue) || 0); });
  }

  // A map key that may hold dashes or dots has to be quoted in a Firestore field path
  function fieldPath(id) { return 'counts.`' + String(id).replace(/\\/g, '\\\\').replace(/`/g, '\\`') + '`'; }

  root.ICSE_COUNTER = {
    ready: function () { return !!setup(); },

    // Resolves to { paperId: count } or null if it could not be read (the caller then keeps what it already had)
    fetchAll: function () {
      var s = setup(); if (!s) return Promise.resolve(null);
      var out = {};
      if (s.shards === 1) {
        return fetch(s.url + '?key=' + s.key).then(function (res) {
          if (res.status === 404) return {};                 // nothing counted yet
          if (!res.ok) throw new Error('counter ' + res.status);
          return res.json().then(function (j) { sumCounts(out, j); return out; });
        }).catch(function () { return null; });
      }
      // Several shards: one request reads them all, and a shard that does not exist yet simply counts as 0
      return fetch(s.base + ':batchGet?key=' + s.key, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ documents: s.names })
      }).then(function (res) {
        if (!res.ok) throw new Error('counter ' + res.status);
        return res.json().then(function (list) { (list || []).forEach(function (x) { if (x.found) sumCounts(out, x.found); }); return out; });
      }).catch(function () { return null; });
    },

    // Adds 1 to one paper. Fire and forget, with a few retries if the server is busy or the network blips.
    hit: function (id) {
      var s = setup(); if (!s || !id) return;
      var target = s.names[Math.floor(Math.random() * s.names.length)];
      var body = JSON.stringify({ writes: [{ transform: { document: target, fieldTransforms: [{ fieldPath: fieldPath(id), increment: { integerValue: '1' } }] } }] });
      var tries = 0;
      function send() {
        tries++;
        var retry = function () { if (tries < 4) setTimeout(send, 600 * Math.pow(2, tries - 1) + Math.random() * 400); };
        try {
          fetch(s.base + ':commit?key=' + s.key, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: tries === 1 })
            .then(function (res) { if (!res.ok && (res.status === 409 || res.status === 429 || res.status >= 500)) retry(); })
            .catch(retry);
        } catch (e) { /* ignore */ }
      }
      send();
    }
  };
})(window);
