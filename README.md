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

### History, scores, beep and screen

- **History:** every exam that ends (finished or time up) is saved on the device and listed under the **History** pill in the top bar, as one chip per attempt. The coloured line at the bottom of a chip fills to the score. Tap **Add score** or **Edit** to enter marks scored out of a total (the total is fixed, see below). The box says "Saved to History" as soon as a score is saved, and the dialog will not close on marks that are higher than the total, so a score is never lost silently. An exam that ends while the page is closed is saved too. Cancelled exams and speed-flag test runs are not saved. History stays in this browser, it does not sync between devices.
- **Beep:** put your sound at `assets/beep.mp3` (or change `exam.beep.src` in `config.js`). It plays when the exam starts, when writing time begins and when time is up. Students can switch it off in the start dialog. Test the sound from the console with `Exam.beep()`.
- **Screen:** `exam.keepAwake` keeps a phone screen on while an exam runs, on browsers that support it.

### Time allowed and total marks

When an exam starts, the reader reads the first two pages of the PDF for the **time allowed** (for example "Time allowed: Two hours", the bracketed "(Two hours)" printed under the subject name, "Two and a half hours", "2½ hours" or "150 minutes") and the **maximum marks** (for example "Maximum Marks: 80"). What it finds becomes the writing time and the total marks. Anything it cannot find falls back to the defaults in `config.js`: `exam.minutes` per subject for the time, and `exam.maxMarks` for the marks (a number, or `{ default: 80, computer: 100 }` per subject id).

The **total marks cannot be changed by the student**. The score box has only a "marks scored" field next to a fixed total, and marks above the total are refused. The writing time can still be adjusted in the start dialog.

To set a paper by hand (this wins over the scan), add to its entry in `data/resources.json`:

```json
"minutes": 150,    // writing time in minutes
"marks": 100       // total marks
```

To see what the scan finds for every 2025+ specimen paper, paste this in the browser console on the live site:

```js
const list = (await (await fetch('/data/resources.json')).json()).resources.filter(r => r.type === 'Specimen Papers' && r.year >= 2025);
for (const r of list) { const doc = await pdfjsLib.getDocument(r.file).promise; const i = await Exam.info(doc); console.log(r.id, '| time', i.minutes || 'not found', '| marks', i.marks || 'not found'); }
```

### Timed exam settings in the admin

- **Edit sheet, "Timed exam" box** (shown for paper types only): writing time, total marks and where the marking scheme starts ("Auto", "Starts on page N" or "This paper has none"). These are stored on the paper as `minutes`, `marks` and `msFrom`. Empty boxes are worked out by the site when a student starts the exam. **Read from the PDF** fills the boxes again from the file.
- **Autoread on upload:** choosing a PDF reads its first two pages for the time allowed and maximum marks, and looks for the marking scheme page. The values land in the boxes (editable) and are saved with the paper. The scheme page is filled in only for papers the site hides it on (specimen papers from `exam.schemeFromYear`).
- **Library:** a **Timer** badge marks every paper that gets the Timed exam button. Green means time and marks are both fixed on the paper, blue "auto" means the site works them out. Hover for the details. The status filter has a "Has a timer" choice.
- **Subjects and types tab, "Timed exam defaults":** writing time and total marks per subject (and "All other subjects"). They are saved in `data/resources.json` as `examDefaults` and win over the numbers in `config.js`. A paper's own value still wins over both.
