# ICSE Class X Resources

Black glass UI for browsing, reading (PDF.js) and downloading ICSE resources.
Plain HTML, CSS and JS. No build step.

## Folder layout

```
index.html              the library page (served at icse.shekharjha.tech)
admin/index.html        the admin console (served at /admin)
assets/css/style.css    all styles
assets/js/config.js     site settings: email, badges, counter
assets/js/app.js        search, filters, cards, bookmarks, share, deep links
assets/js/viewer.js     PDF reader
assets/js/admin*.js     admin console + GitHub client + admin-config.js
assets/vendor/          PDF.js and QR library (self-hosted)
data/resources.json     the list of resources
pdfs/                   your PDF files
```

## Add a resource

1. Drop the PDF in `pdfs/`.
2. Add one entry to `resources` in `data/resources.json`:

```json
{
  "id": "maths-2025",
  "title": "Mathematics Board Paper 2025",
  "subject": "maths",
  "class": "X",
  "type": "Question Papers",
  "year": 2025,
  "file": "/pdfs/maths-2025.pdf",
  "pages": 4,
  "size_kb": 220,
  "added": "2026-10-11",
  "downloads": 0,
  "description": "One line about what is inside.",
  "tags": ["board", "paper"]
}
```

- `id` becomes the share link: `icse.shekharjha.tech/resource?file=maths-2025`. Keep it short, lowercase, no spaces.
- `subject` must match an `id` in the `subjects` list at the top of the file. Add new subjects there with an accent colour.
- `type` must be one of the entries in `types`.
- `added` (YYYY-MM-DD) drives "Newest", "Just added" and the New badge (30 days).
- `downloads` is the starting count. Add `"popular": true` to force the Popular badge.
- `pages` and `size_kb` are optional, they only show on the card.
- When more than one `class` exists, a Class filter appears automatically.

## Admin page (`/admin`)

Upload and manage resources from `icse.shekharjha.tech/admin`. It is hidden from search engines
(`noindex` meta tag, `X-Robots-Tag` header and `robots.txt`) and not linked from the public site.

**Sign in:** paste a GitHub fine-grained token. Create one at GitHub, Settings, Developer settings,
Fine-grained personal access tokens: repository access limited to `jhakumarshekhar11/icse`,
permission **Contents: Read and write**. The page only accepts tokens that belong to the user listed in
`assets/js/admin-config.js`. The token lives in that browser tab only and is cleared on sign out,
tab close, or 30 minutes idle. Prefer a short expiry (30 days) and revoke it if a device is lost.

**How changes are saved:** each action is one commit on the `website` branch (PDF and `resources.json`
together), so Render redeploys automatically in 1 to 2 minutes. Commits start with `[admin]`, which is
how Undo finds them. If you set `basePath` in `admin-config.js` the site files are assumed to live in
that folder of the repo.

**Drafts:** a draft is saved in the repo with `"draft": true` and hidden on the public page, but its PDF
is still reachable by direct URL. Do not put anything private in a draft.

**Why no email and password:** anything checked inside a web page can be read by anyone viewing the
page source, so it would not protect the repository. The GitHub token is the real lock.

## Deploy on Render

1. Push this folder to a GitHub repo.
2. Render dashboard: New, then Static Site (or Blueprint, which reads `render.yaml`). Pick the repo.
   If you set it up by hand: Build command empty, Publish directory `.`
3. Under Redirects/Rewrites add: Rewrite `/resource` to `/index.html` (and optionally Redirect `/` to `/resource`).
4. Settings, Custom Domains: add `icse.shekharjha.tech`, then create the CNAME record Render shows at your DNS provider.

## Settings to change before launch

`assets/js/config.js`:
- `reportEmail`: where "Report an error" emails go. It is a placeholder right now.
- `portfolioUrl`, `notice`.
- `counter`: see below.

## Download counter

A static site has no database, so counts use a free hit-counter service (Abacus, `abacus.jasoncameron.dev`).
The number on each card is `downloads` from the JSON plus live clicks. If the service is down the site still works.
Set `counter.enabled` to `false` to turn it off. Change `namespace` to something unique to you.
Counts are public and can be inflated by anyone, so treat them as a rough indicator.

## Shortcuts

Library: `/` or `Ctrl+K` focus search, `Esc` clears it.
Reader: `←` `→` change page, `+` `-` zoom, `0` fit width, `G` jump to page, `F` fullscreen, `Esc` close.
Touch: pinch to zoom, swipe left or right to change page.
Bookmarks and last-read page are stored in the visitor's browser.

## Run locally

PDF.js needs a web server (not file://). The page expects `/resource`, so for local testing open
`http://localhost:8000/?file=maths-2024` after `python3 -m http.server 8000` in this folder.

### Hiding the marking scheme

Specimen papers from `exam.schemeFromYear` have the marking scheme at the end of the same PDF. When an exam
starts, the reader scans each page from page 2 for one whose opening text contains a word from `exam.schemeWords`,
and hides that page and everything after it until the exam ends. The Download and Share buttons are hidden too
(reader, library cards and the paper page). This stops the obvious ways to peek. It is self-discipline, not
proctoring: the PDF address itself is still public.

If a paper is detected wrongly, set it by hand in `data/resources.json`:

```json
"msFrom": 13      // the marking scheme starts on page 13
"msFrom": 0       // this file has no marking scheme, so nothing is hidden
```

To check every 2025+ specimen paper at once, open the live site and paste this in the browser console:

```js
const list = (await (await fetch('/data/resources.json')).json()).resources.filter(r => r.type === 'Specimen Papers' && r.year >= 2025);
for (const r of list) { const doc = await pdfjsLib.getDocument(r.file).promise; console.log(r.id, '| pages', doc.numPages, '| scheme from', (await Exam.detect(doc)) || 'NOT FOUND'); }
```