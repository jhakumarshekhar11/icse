// Download counter, stored in your own Firebase project (Cloud Firestore).
// ONE small document holds every count:   stats/downloads  =  { "<paper id>": 12, "<paper id>": 40, ... }
//   - Loading all counts is ONE document read, however many papers there are.
//   - EVERY click on a Download button adds 1 to that paper's field (atomic Firestore increment).
//   - A failed write is retried up to 3 times, and the reason is printed in the browser console (F12).
// It talks to Firestore's REST API with the public web API key from firebase-config.js, so no SDK is loaded.
// Needs the rules in firestore.rules.counter. With no Firebase keys set it does nothing.
(function (root) {
  'use strict';
  var DB = '(default)';
  var ID_OK = /^[a-z0-9-]{1,80}$/;   // must match the rule in firestore.rules.counter

  function setup() {
    var f = root.ICSE_FIREBASE || {}, c = (root.ICSE_CONFIG || {}).counter || {};
    if (c.enabled === false || !f.apiKey || !f.projectId) return null;
    var doc = String(c.doc || 'stats/downloads').replace(/^\/|\/$/g, '');
    var path = 'projects/' + f.projectId + '/databases/' + DB + '/documents';
    return { key: encodeURIComponent(f.apiKey), base: 'https://firestore.googleapis.com/v1/' + path, path: path, doc: doc };
  }

  root.ICSE_COUNTER = {
    ready: function () { return !!setup(); },

    // Resolves to { paperId: count } or null if it could not be read (the caller then keeps what it already had)
    fetchAll: function () {
      var s = setup(); if (!s) return Promise.resolve(null);
      return fetch(s.base + '/' + s.doc + '?key=' + s.key).then(function (res) {
        if (res.status === 404) return {};                  // nothing counted yet
        if (!res.ok) {
          res.text().then(function (t) { console.warn('Download counter: reading counts failed, Firestore answered ' + res.status, t.slice(0, 300)); }).catch(function () {});
          return null;
        }
        return res.json().then(function (j) {
          var out = {}, fields = j.fields || {};
          Object.keys(fields).forEach(function (id) {
            var v = fields[id] || {};
            out[id] = Number(v.integerValue !== undefined ? v.integerValue : v.doubleValue) || 0;
          });
          return out;
        });
      }).catch(function () { return null; });
    },

    // Adds 1 to one paper. Fire and forget, with retries.
    hit: function (id) {
      var s = setup();
      if (!s) { console.warn('Download counter is off: Firebase keys are not set on this site'); return; }
      if (!id || !ID_OK.test(id)) return;
      // Backticks let Firestore accept ids with hyphens as field names
      var body = JSON.stringify({ writes: [{ transform: { document: s.path + '/' + s.doc, fieldTransforms: [{ fieldPath: '`' + id + '`', increment: { integerValue: '1' } }] } }] });
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
