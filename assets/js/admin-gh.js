// Minimal GitHub client for the admin page. Writes are atomic: the PDF and the
// updated resources.json go into ONE commit, so the site never sees half a change.
(() => {
  'use strict';
  const C = window.ADMIN_CONFIG;
  const API = 'https://api.github.com';
  const enc = encodeURIComponent;
  const R = `/repos/${enc(C.owner)}/${enc(C.repo)}`;
  let token = null;

  class GhError extends Error {
    constructor(status, message, data) { super(message); this.status = status; this.data = data; }
  }

  function friendly(status, d) {
    const m = (d && d.message) || '';
    if (status === 401) return 'GitHub rejected this token. It may be wrong, expired or revoked.';
    if (status === 403) return /rate limit/i.test(m) ? 'GitHub rate limit reached. Wait a few minutes and try again.' : 'This token does not have permission for that. It needs Contents: Read and write on the ' + C.repo + ' repository.';
    if (status === 404) return 'GitHub could not find ' + C.owner + '/' + C.repo + ' (branch ' + C.branch + '). Check the names in admin-config.js and that the token can access this repository.';
    if (status === 409 || status === 422) return 'GitHub refused the change: ' + (m || 'conflict') + '. Reload the page and try again.';
    return 'GitHub error ' + status + (m ? ': ' + m : '');
  }

  async function api(path, { method = 'GET', body, accept } = {}) {
    let res;
    try {
      res = await fetch(API + path, {
        method, cache: 'no-store',
        headers: Object.assign({
          Authorization: 'Bearer ' + token,
          Accept: accept || 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28'
        }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) {
      throw new GhError(0, 'Could not reach GitHub. Check your internet connection.');
    }
    if (!res.ok) { let d = null; try { d = await res.json(); } catch { /* no body */ } throw new GhError(res.status, friendly(res.status, d), d); }
    if (res.status === 204) return null;
    return accept && accept.includes('raw') ? res.text() : res.json();
  }

  const repoPath = (p) => (C.basePath ? C.basePath.replace(/\/+$/, '') + '/' : '') + String(p).replace(/^\/+/, '');
  const encPath = (p) => p.split('/').map(enc).join('/');
  const b64ToText = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
  const fileToBase64 = (file) => new Promise((ok, no) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1]);
    fr.onerror = () => no(fr.error);
    fr.readAsDataURL(file);
  });

  async function verify(t) {
    token = t;
    const user = await api('/user');
    if (!C.allowedUsers.map((u) => u.toLowerCase()).includes(String(user.login).toLowerCase())) {
      token = null;
      throw new GhError(403, 'This token belongs to ' + user.login + ', which is not allowed to use this page.');
    }
    const repo = await api(R);
    if (repo.permissions && repo.permissions.push === false) { token = null; throw new GhError(403, 'This token can read ' + C.repo + ' but cannot write to it. Give it Contents: Read and write.'); }
    await api(`${R}/git/ref/heads/${encPath(C.branch)}`);
    return { user, repo };
  }
  function signOut() { token = null; }

  async function readJson() {
    const p = `${R}/contents/${encPath(repoPath(C.dataPath))}?ref=${enc(C.branch)}`;
    const j = await api(p);
    const text = j.content ? b64ToText(j.content) : await api(p, { accept: 'application/vnd.github.raw+json' });
    let data;
    try { data = JSON.parse(text); } catch { throw new GhError(0, 'resources.json in the repository is not valid JSON. Fix it on GitHub first.'); }
    data.subjects = data.subjects || []; data.types = data.types || []; data.resources = data.resources || [];
    return { data, sha: j.sha };
  }

  // Downloads a file straight from the repository (works before Render has redeployed).
  async function fetchBlob(path) {
    let res;
    try {
      res = await fetch(`${API}${R}/contents/${encPath(repoPath(path))}?ref=${enc(C.branch)}`, {
        cache: 'no-store',
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.raw+json', 'X-GitHub-Api-Version': '2022-11-28' }
      });
    } catch (e) { throw new GhError(0, 'Could not reach GitHub. Check your internet connection.'); }
    if (!res.ok) throw new GhError(res.status, friendly(res.status, null));
    return res.blob();
  }

  async function headSha() { return (await api(`${R}/git/ref/heads/${encPath(C.branch)}`)).object.sha; }

  // upserts: [{ path, base64 | text }], deletes: [path]
  async function commit({ message, upserts = [], deletes = [], onStep = () => {} }) {
    const head = await headSha();
    const headCommit = await api(`${R}/git/commits/${head}`);
    const entries = [];
    for (const f of upserts) {
      onStep(f.base64 ? 'Uploading ' + f.path.split('/').pop() : 'Saving the list');
      const blob = await api(`${R}/git/blobs`, { method: 'POST', body: { content: f.base64 || f.text, encoding: f.base64 ? 'base64' : 'utf-8' } });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    onStep('Preparing the commit');
    const del = deletes.map((p) => ({ path: p, mode: '100644', type: 'blob', sha: null }));
    let tree;
    try { tree = await api(`${R}/git/trees`, { method: 'POST', body: { base_tree: headCommit.tree.sha, tree: entries.concat(del) } }); }
    catch (e) {
      if (!del.length) throw e;   // a file we meant to delete may already be gone
      tree = await api(`${R}/git/trees`, { method: 'POST', body: { base_tree: headCommit.tree.sha, tree: entries } });
    }
    onStep('Committing to GitHub');
    const c = await api(`${R}/git/commits`, { method: 'POST', body: { message, tree: tree.sha, parents: [head] } });
    await api(`${R}/git/refs/heads/${encPath(C.branch)}`, { method: 'PATCH', body: { sha: c.sha, force: false } });
    return { sha: c.sha, url: `https://github.com/${C.owner}/${C.repo}/commit/${c.sha}` };
  }

  async function history(n = 30) {
    const list = await api(`${R}/commits?sha=${enc(C.branch)}&per_page=${n}`);
    return list.map((c) => ({
      sha: c.sha, message: c.commit.message, date: c.commit.author.date,
      author: (c.author && c.author.login) || c.commit.author.name, url: c.html_url
    }));
  }

  // Restores the tree from before the latest commit, as a NEW commit (history is kept).
  async function undoLast(onStep = () => {}) {
    onStep('Reading the latest change');
    const head = await headSha();
    const hc = await api(`${R}/git/commits/${head}`);
    if (!hc.message.startsWith(C.commitPrefix)) throw new GhError(0, 'The latest commit was not made by this admin page, so it cannot be undone here.');
    if (!hc.parents.length) throw new GhError(0, 'There is nothing earlier to go back to.');
    const parent = await api(`${R}/git/commits/${hc.parents[0].sha}`);
    onStep('Committing the undo');
    const msg = `${C.commitPrefix} Undo: ${hc.message.split('\n')[0].replace(C.commitPrefix, '').trim()}`;
    const c = await api(`${R}/git/commits`, { method: 'POST', body: { message: msg, tree: parent.tree.sha, parents: [head] } });
    await api(`${R}/git/refs/heads/${encPath(C.branch)}`, { method: 'PATCH', body: { sha: c.sha, force: false } });
    return { sha: c.sha, url: `https://github.com/${C.owner}/${C.repo}/commit/${c.sha}` };
  }

  window.GH = { verify, signOut, readJson, fetchBlob, commit, history, undoLast, repoPath, fileToBase64, GhError };
})();
