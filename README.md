<div align="center">

# ICSE Class X Resources

**A fast, glassy library of ICSE Class 10 papers, specimen papers, notes and solutions.**
Read every PDF in the browser, run a timed exam on any paper, and manage it all from a hidden admin page.

[**icse.shekharjha.tech**](https://icse.shekharjha.tech) &nbsp;·&nbsp; Plain HTML, CSS and JavaScript &nbsp;·&nbsp; Hosted on Render &nbsp;·&nbsp; No framework, no database

</div>

---

## Contents

1. [Features](#features)
2. [Project layout](#project-layout)
3. [How it fits together](#how-it-fits-together)
4. [Deploying on Render](#deploying-on-render)
5. [Adding resources](#adding-resources)
6. [The admin page](#the-admin-page)
7. [Timed exam mode](#timed-exam-mode)
8. [Settings reference](#settings-reference)
9. [Data reference](#data-reference)
10. [Search and Google](#search-and-google)
11. [Accounts and sync](#accounts-and-sync)
12. [Running locally](#running-locally)
13. [Troubleshooting](#troubleshooting)

---

## Features

| For students | For Me |
| --- | --- |
| **Smart search.** Type "ICSE Computer paper 2025" and the right filters switch on by themselves. | **Hidden admin** at `/admin`: upload, edit, drafts, bulk edit, undo, JSON backup. |
| **Multi-select filters** for class, subject, type and year. Pick everything and it resets to All. | **Autoread on upload.** Subject, type and year from the file name, keywords, a description, time allowed, total marks and marking scheme page from the PDF. |
| **Sorting:** By year (default), Oldest first, Most downloaded. | **Every change is one Git commit**, so Render redeploys on its own and Undo is one click. |
| **In-page PDF reader** with zoom, page jump, fullscreen, pinch and swipe. | **SEO built at deploy time:** a page for every subject, type, year and paper, plus a sitemap. |
| **Timed exams** with reading time, a countdown, a beep, History and scores. The marking scheme stays hidden until time is up. | **Per-subject exam defaults** for writing time and total marks, editable in the admin. |
| **Bookmarks, share links, QR codes, WhatsApp share** and a "Report an error" button. **Optional accounts** (email or Google) sync bookmarks, history, progress and theme, with a "Continue where you left off" row. | **Download counter** with no database (a free hit-counter service). |
| **Countdown to ICSE 2027**, read from the server clock, so a wrong phone clock cannot change it. | **Light and dark mode** on the site and the admin. They follow the device until you pick one. |

---

## Project layout

```text
.
├── index.html                 The library page (served at the site root)
├── about/index.html           About page, also the shell for generated paper pages
├── admin/index.html           The admin console (served at /admin)
├── data/
│   ├── resources.json         Subjects, types, every resource, exam defaults
│   └── exams.json             The exam countdown (date, time, label)
├── pdfs/                      The PDF files (kept in the repo, not in zip copies)
├── assets/
│   ├── css/style.css          All public styles, light and dark
│   ├── css/admin.css          Admin-only styles
│   ├── js/config.js           Site settings. Edit this one most often
│   ├── js/app.js              Search, filters, sorting, cards, bookmarks, share, History
│   ├── js/viewer.js           The PDF reader
│   ├── js/exam.js             Timed exam mode, and the PDF reading shared with the admin
│   ├── js/theme.js            Light / dark switch
│   ├── js/account.js          Sign up, log in, log out and the sync of bookmarks, history, progress, settings
│   ├── js/firebase-config.js  Your Firebase keys (paste them here to turn accounts on)
│   ├── js/theme-boot.js       Sets the theme before first paint (admin)
│   ├── js/admin.js            The admin console
│   ├── js/admin-gh.js         GitHub client (reads and commits through the API)
│   ├── js/admin-keywords.js   Keyword and description suggestions
│   ├── js/admin-config.js     Admin settings: repo, branch, allowed users
│   ├── vendor/                PDF.js, the QR library and a small Firebase build, self-hosted
│   ├── og.jpg                 Share image for WhatsApp and social previews
│   └── beep.mp3               Exam start, writing start and time-up sound
├── scripts/
│   ├── build-seo.js           Runs on every deploy: landing pages and sitemap
│   └── check-links.js         Checks every PDF path in resources.json exists
├── firestore.rules            Security rules for the accounts database (publish in Firebase)
├── render.yaml                Render settings: build, redirects, headers
├── robots.txt                 Keeps /admin out of search, points to the sitemap
└── favicon.svg
```

---

## How it fits together

```text
 I (admin page) ──token──▶ GitHub repo, branch "website" ──auto deploy──▶ Render
                                   │                                          │
                         data/resources.json + pdfs/                 node scripts/build-seo.js
                                                                               │
 Student's browser ◀── static files, landing pages, sitemap.xml ◀─────────────┘
```

- **No backend.** The site is static files. The admin talks to GitHub directly from the browser.
- **One commit per action.** Uploading, editing or deleting commits the PDF and `resources.json` together. Commits start with `[admin]`, which is how Undo finds them.
- **The build adds SEO, nothing else.** `build-seo.js` regenerates landing pages, paper pages, `sitemap.xml` and the crawlable links on `index.html` at deploy time. None of it is committed, and if it fails the plain site still deploys.
- **Without an account, exam history and bookmarks live in the visitor's browser** and do not sync between devices. With an account (optional), they follow the student everywhere. See [Accounts and sync](#accounts-and-sync).

---

## Deploying on Render

The service is a **Static Site**.

| Setting | Value |
| --- | --- |
| Branch | `website` |
| Build command | `node scripts/write-firebase-config.js && node scripts/build-seo.js` |
| Publish directory | `.` |
| Custom domain | `icse.shekharjha.tech` (CNAME to the address Render shows) |

**Redirects and rewrites**

| Type | From | To |
| --- | --- | --- |
| Redirect | `/resource` | `/` |
| Redirect | `/resource/*` | `/*` |
| Rewrite | `/about` | `/about/index.html` |
| Rewrite | `/admin` and `/admin/` | `/admin/index.html` |

**Headers**

| Path | Header |
| --- | --- |
| `/admin`, `/admin/*` | `X-Robots-Tag: noindex, nofollow, noarchive` and `Cache-Control: no-store` |
| `/assets/*` | `Cache-Control: public, max-age=300, must-revalidate` |
| `/data/*` | `Cache-Control: public, max-age=60` |
| `/pdfs/*` | `Cache-Control: public, max-age=3600` |
| `/sitemap.xml` | `Cache-Control: public, max-age=3600` |

Because assets are cached for five minutes, a change can take a few minutes to show on a device that already loaded the site. A hard refresh skips the wait.

---

## Adding resources

**Easiest: the admin page.** Open `/admin`, choose a PDF, check the filled-in fields, press **Publish**. See [The admin page](#the-admin-page).

**By hand:**

1. Put the PDF in `pdfs/`.
2. Add one entry to `resources` in `data/resources.json`:

```json
{
  "id": "maths-2025-specimen-paper",
  "title": "ICSE SPECIMEN 2025 Mathematics",
  "subject": "maths",
  "class": "X",
  "type": "Specimen Papers",
  "year": 2025,
  "file": "/pdfs/maths-2025-specimen-paper.pdf",
  "pages": 20,
  "size_kb": 1180,
  "added": "2026-10-11",
  "downloads": 0,
  "description": "Specimen paper and marking scheme of Mathematics.",
  "tags": ["specimen paper", "maths", "2025"]
}
```

Rules of thumb: `id` becomes the share link (`/?file=maths-2025-specimen-paper`), so keep it short, lowercase and hyphenated. `subject` must match a subject `id`, and `type` must be one of the `types`. When more than one `class` exists, a Class filter appears by itself.

---

## The admin page

Open `icse.shekharjha.tech/admin`. It is not linked from the site and is hidden from search (a `noindex` tag, an `X-Robots-Tag` header and `robots.txt`).

### Signing in

1. GitHub, Settings, Developer settings, **Fine-grained personal access tokens**, Generate new token.
2. Repository access: **Only select repositories**, pick `jhakumarshekhar11/icse`.
3. Permissions, Repository: **Contents: Read and write**. Leave the rest.
4. Choose a short expiry (30 days), generate, paste it into the sign-in box.

Only accounts listed in `allowedUsers` (in `admin-config.js`) are accepted. The token stays in that browser tab and is cleared on sign out, tab close or 30 idle minutes. Revoke it on GitHub if a device is lost.

> **Why not a password?** Anything checked inside a web page can be read from the page source, so it would not protect the repository. The GitHub token is the real lock.

### What it does

| Tab | What I can do |
| --- | --- |
| **Upload** | Drop a PDF. Subject, type, year and title are guessed from the file name. Keywords, a one-line description, time allowed, total marks and the marking scheme page are read from the PDF. A live preview shows the card. **Publish** or **Save as draft**. |
| **Library** | Search, filter by subject, type, year or status, sort by update, upload order or site order. Preview in the reader, edit, delete, or select several for bulk edit and delete. A **Timer** badge marks papers that get a timed exam. |
| **Subjects and types** | Add, rename and recolour subjects (with numeric and alpha codes), manage types, and set **Timed exam defaults** per subject. |
| **Activity** | Recent uploads and the Git history, with links to each commit. |

The top bar has **Undo last change** (reverts the latest `[admin]` commit as a new commit, nothing is erased), **Export JSON** (a backup of `resources.json`), the **Theme** button and Sign out.

### Good to know

- **Drafts** are hidden from the public list, but the PDF is still reachable by its direct address. Never put anything private in a draft.
- **Replacing a PDF** saves it under a new name (`-v2`, `-v3`) so old caches never serve the wrong file, and deletes the old one.
- **Branch:** the admin commits to the branch in `admin-config.js` (`website`). If it ever commits to `main`, that file has the wrong `branch`.
- **Large files:** the limit is `maxPdfMB` (25 MB). GitHub itself stops at 100 MB.

---

## Analytics page

The admin **Analytics** tab shows your Google Analytics 4 numbers: visitors right now (last 30 minutes), visits over a chosen period compared with the period before, visitors per day, signed in against guest visitors, new sign ups and log ins, countries, devices, where visits come from, and the most opened papers.

It reads Google directly from your browser. There is no server and no secret key on the site: you press **Connect Google Analytics**, sign in with Google, and get an access token that lasts about an hour and is kept in memory only. It is dropped when you disconnect or sign out of admin.

**One-time setup** (the tab shows the same steps):

1. Copy the numeric **Property ID** (Analytics, Admin, Property details) into `assets/js/admin-config.js` as `analytics.propertyId`.
2. In Google Cloud Console (the Firebase project works), enable **Google Analytics Data API**.
3. OAuth consent screen: External, add yourself under Test users. Testing mode is fine.
4. Credentials, OAuth client ID, **Web application**, Authorised JavaScript origin `https://icse.shekharjha.tech`. Copy the Client ID into `admin-config.js` as `analytics.clientId`.
5. For the signed in / guest split: Analytics, Admin, Custom definitions, **Create custom dimension**, name `Account status`, scope **User**, user property `account_status`. It fills in from the day you create it.

**What the site sends to Analytics:** `analytics.js` sets a user property `account_status` (`signed_in` or `guest`), and `account.js` sends the standard `sign_up` and `login` events with a `method` (`google` or `email`). Never an email, name or account id. Sign ups before you deployed this are not counted, and the page cannot show the total number of accounts ever created (that lives in Firebase, which the browser cannot list).

The admin page's security policy (`<meta http-equiv="Content-Security-Policy">` in `admin/index.html`) allows Google's sign-in script and `analyticsdata.googleapis.com` for this tab only.

## Timed exam mode

Every paper type listed in `exam.types` gets a **Timed exam** button on its card, in the reader and on its own page.

### What a student sees

1. Press **Timed exam**. The dialog shows the **writing time** (adjustable), the fixed **total marks**, an optional **reading time** and a beep switch.
2. A timer chip counts down. It turns amber at 10 minutes and red at 5, with a message at 30, 10, 5 and 1 minutes.
3. The timer keeps running if the paper or page is closed. A banner on the library page brings the student back.
4. When time is up, or the student presses **Finish**, the marking scheme unlocks and the attempt is saved to **History** with a score box.

### Where the time and marks come from

For each setting, the first of these that exists wins:

| Priority | Time | Total marks |
| --- | --- | --- |
| 1. Set on the paper (admin Edit sheet or `resources.json`) | `minutes` | `marks` |
| 2. Read from the PDF's first two pages | "Time allowed: Two hours", "(Two hours)", "Two and a half hours", "2½ hours", "150 minutes" | "Maximum Marks: 80", "Max. Marks – 80", "Full Marks: 80" |
| 3. Subject defaults saved in the admin (`examDefaults`) | per subject | per subject |
| 4. `config.js` | `exam.minutes` | `exam.maxMarks` |

The **total marks cannot be changed by the student**. The score box has only a "marks scored" field, and marks above the total are refused.

### The marking scheme

- **Specimen papers from `exam.schemeFromYear`** (2025) carry the marking scheme at the end of the same PDF. When an exam starts, the reader finds the first page (from page 2) whose opening text contains a word from `exam.schemeWords`, then hides that page and everything after it. The Download and Share buttons are switched off for that paper until the exam ends.
- **Previous year papers have no marking scheme.** The types in `exam.noSchemeTypes` are never scanned or locked, and a stray `msFrom` on them is ignored. In the admin their marking scheme setting is switched off.
- This is self-discipline, not proctoring. The PDF address itself is public.

### Overrides on a paper

```json
"minutes": 150,    // writing time in minutes
"marks": 100,      // total marks
"msFrom": 13       // marking scheme starts on page 13  (0 = this paper has none)
```

### In the admin

- **Edit sheet, "Timed exam" box** (paper types only): writing time, total marks and the marking scheme page. Empty boxes are worked out by the site when an exam starts. **Read from the PDF** refills them.
- **Autoread on upload** fills the same boxes from the file. Check them against the paper.
- **Library:** a **Timer** badge. Green means time and marks are both fixed on the paper, blue "auto" means the site works them out. Hover for details. The status filter has **Has a timer**.
- **Subjects and types, "Timed exam defaults":** writing time and total marks per subject.

### History, sound and screen

- **History** (top bar pill) lists every finished attempt with its score bar. Cancelled exams are not saved. An exam that ends while the page is closed is saved when the page next opens.
- **Beep:** put your sound at `assets/beep.mp3` (or change `exam.beep.src`). Students can switch it off in the start dialog.
- **Screen:** `exam.keepAwake` keeps a phone screen on while an exam runs.

### Checking every paper at once

Paste into the browser console on the live site to see what the scan finds for each 2025+ specimen paper:

```js
const list = (await (await fetch('/data/resources.json')).json()).resources
  .filter(r => r.type === 'Specimen Papers' && r.year >= 2025);
for (const r of list) {
  const doc = await pdfjsLib.getDocument(r.file).promise;
  const i = await Exam.info(doc);
  console.log(r.id, '| time', i.minutes || 'not found', '| marks', i.marks || 'not found',
    '| scheme from', (await Exam.detect(doc)) || 'NOT FOUND');
}
```

---

## Settings reference

### `assets/js/config.js` (site)

| Setting | What it does |
| --- | --- |
| `dataUrl`, `basePath` | Where the resource list lives, and the site's public path (`/`). |
| `portfolioUrl`, `notice` | The back link and the footer line. |
| `reportEmail` | Where "Report an error" emails go. |
| `newDays`, `popularMin` | A resource is **New** for this many days. **Popular** from this many downloads. |
| `counter` | Download counter: `enabled`, `baseUrl`, `namespace`, `cacheMinutes`. |
| `subjectOrder` | Order of subjects (by id) when no filter or search is active. |
| `quickSearches` | The suggestion chips under the search bar. |
| `exam.types` | Types that get a timed exam. |
| `exam.minutes` | Writing time per subject id, plus `default`. |
| `exam.readingMinutes` | Optional reading time before writing starts (`0` removes it). |
| `exam.schemeFromYear` | Specimen papers from this year have a marking scheme at the end. |
| `exam.noSchemeTypes` | Types that never have a marking scheme. Default: Previous Year Papers. |
| `exam.schemeWords` | Words that mark the first page of a marking scheme. |
| `exam.maxMarks` | Total marks when a paper does not state them: a number, or `{ default: 80, computer: 100 }`. |
| `exam.keepAwake`, `exam.beep` | Screen wake lock, and the sound file and its default. |

### `assets/js/admin-config.js` (admin)

| Setting | What it does |
| --- | --- |
| `owner`, `repo`, `branch` | The repository and branch the admin commits to. |
| `allowedUsers` | GitHub accounts allowed to sign in. |
| `basePath`, `dataPath`, `pdfDir` | Where the site, the data file and the PDFs sit in the repo. |
| `maxPdfMB`, `idleMinutes` | Upload size limit, and auto sign-out time. |
| `commitPrefix` | Marks commits made by the admin (Undo relies on it). |

### `data/exams.json` (countdown)

```json
{ "title": "ICSE Class X Board Exams 2027", "label": "Exams begin on",
  "date": "2027-02-16", "time": "11:00", "timezone": "+05:30" }
```

The countdown reads the **server's** clock from the response headers, then ticks with a monotonic timer, so a wrong date or time on the visitor's device does not change it. It hides itself once the exam has started.

---

## Data reference

`data/resources.json` has four top-level keys.

| Key | Contents |
| --- | --- |
| `subjects` | `id`, `name`, `accent` (a hex colour), optional `code` and `altCode` (CISCE codes). |
| `types` | The list of type names, in display order. |
| `resources` | One object per resource (below). |
| `examDefaults` | Optional. `{ "minutes": { "maths": 150 }, "marks": { "computer": 100 } }`, written by the admin. |

**A resource**

| Field | Notes |
| --- | --- |
| `id`, `title` | The id is the share link. Keep it short, lowercase, hyphenated. |
| `subject`, `type`, `class`, `year` | `subject` and `type` must exist in the lists above. |
| `file`, `pages`, `size_kb` | The PDF path, and facts shown on the card. |
| `added`, `updated` | `YYYY-MM-DD`. `added` drives the New badge and the Just added row. |
| `downloads`, `popular` | Starting count. `"popular": true` forces the badge. |
| `draft` | `true` hides it from the public site. |
| `rev` | Bumped when the PDF is replaced. |
| `description`, `tags` | A line for the card, and words that make search find it. |
| `minutes`, `marks`, `msFrom` | Optional exam overrides, see [Timed exam mode](#timed-exam-mode). |

---

## Search and Google

**On the site.** The search box understands plain phrases: "Icse Computer paper 2025" turns on Computer Applications and 2025. Links work too:

```text
/?q=physics specimen 2025
/?subject=maths,physics&type=specimen-papers&year=2025,2026
/?file=maths-2025-specimen-paper&page=3          opens the reader on page 3
/?file=maths-2025-specimen-paper&exam=1          opens the reader with the timer dialog
```

**For Google.** On every deploy the build creates:

- landing pages for every subject, type and year combination, such as `/computer-applications/specimen-papers/2025/`, which open the library with those filters already on;
- a page for every paper;
- `sitemap.xml`, title and description tags, structured data and crawlable "Browse" links.

After the first deploy, submit `https://icse.shekharjha.tech/sitemap.xml` in Google Search Console. Pages are indexed over days to weeks.

**Share previews.** WhatsApp and social apps use `assets/og.jpg` (1200 × 630, under 100 KB). They cache a preview per address, so to refresh it use the Facebook Sharing Debugger ("Scrape Again") or share a new address such as `/?v=2`.

---

## Accounts and sync

Accounts are **optional**. Without one the site works exactly as before. A student who signs up or logs in (email and password, or Google) gets these saved to their account and shared across their devices:

| Saved | Details |
| --- | --- |
| **Bookmarks** | The Saved list. |
| **Exam history and scores** | Every finished timed exam, with the score a student entered. |
| **Reading progress** | The last page opened in each paper. Drives the **Continue where you left off** row (shown only when logged in, up to 8 papers, each with Resume and a remove button). |
| **Preferences** | Light or dark theme, sort order and the exam beep switch. |

It uses **Firebase Authentication** and **Cloud Firestore** (free Spark plan is plenty). There is still no server of your own.

### How it behaves

- **Email check.** Accounts made with an email and password must confirm the email (a link is sent on sign up). Until then nothing is saved to the account and the menu shows **I have verified** and **Resend email**. The site notices when the student comes back from the email tab. Google accounts are already verified. `firestore.rules` enforces this, so republish it after upgrading.
- **Invitations for guests.** A quiet "Create a free account" message appears once per device after the first bookmark and after the first finished exam. A guest who taps **Saved** or **History** with nothing there yet is offered the sign up dialog.
- **Account settings.** The menu has **Account settings** to change the name and (for email accounts) the password.

- **Local first.** Everything is still written to the browser first, so the site is fast and works offline. When logged in, each change is also queued and sent to Firestore. The queue is saved in the browser, so a change made offline is sent next time the site opens.
- **Signing in merges, never replaces.** Bookmarks, history and progress already on that device are added to the account. If both have a theme or sort order, the account's wins.
- **Live sync.** A bookmark or theme changed on a phone appears on the laptop within a second or two.
- **Logging out clears the synced data from that browser** (bookmarks, history, progress), so the next person on a shared computer does not see it. It stays safe in the account. Theme and sort order stay, since they describe the device. If there are unsynced changes (offline), the student is asked before signing out.
- **Light on the first visit.** The Firebase code (about 175 KB compressed) is downloaded only when someone opens the Log in dialog, or when a signed-in student returns.
- **Account data** is one Firestore document per student, `users/{uid}`, holding the maps `saved`, `history`, `progress` and `prefs`. Only that student can read or write it (see `firestore.rules`).

### One-time setup (about 10 minutes)

1. **Firebase console** (console.firebase.google.com): open your project, or **Add project**.
2. **Add a web app:** Project settings (gear), Your apps, **</>** (Web). Copy the `firebaseConfig` values into `assets/js/firebase-config.js` (`apiKey`, `authDomain`, `projectId`, `appId`). These keys are public by design.
3. **Authentication:** Build, Authentication, **Get started**. Under **Sign-in method** turn on **Email/Password** and **Google** (pick a support email for Google).
4. **Authorized domains:** Authentication, Settings, **Authorized domains**. Add `icse.shekharjha.tech` (and your `*.onrender.com` address if you test there). `localhost` is already allowed.
5. **Firestore:** Build, **Firestore Database**, Create database (production mode, region near India such as `asia-south1`). Open the **Rules** tab, paste the contents of `firestore.rules`, **Publish**.
6. Commit and deploy. A **Log in** button appears in the top bar.

While `apiKey` is empty, no account button appears and nothing changes.

### Keeping the keys out of Git (optional)

On Render, add environment variables `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID` and `FIREBASE_APP_ID`. The build command (`node scripts/write-firebase-config.js && node scripts/build-seo.js`) writes them into `firebase-config.js` on the server. Leave the committed file empty. This only keeps them out of the repository: a Firebase web key is always visible in the browser, so protect it with the key restrictions and Firestore rules described above.

### Settings (`assets/js/firebase-config.js`)

| Setting | What it does |
| --- | --- |
| `ICSE_FIREBASE` | Your Firebase web app values. Empty `apiKey` switches accounts off. |
| `ICSE_ACCOUNT.google`, `.email` | Show or hide "Continue with Google" and the email form. |
| `ICSE_ACCOUNT.minPassword` | Shortest password accepted when signing up (default 8). |
| `ICSE_ACCOUNT.maxProgress`, `.maxHistory` | How many papers to remember for Continue (60), and how many finished exams to keep (200). |

### Good to know

- **Forgot password** sends Firebase's reset email from the Log in dialog (customise the wording under Authentication, Templates).
- **The admin page is unrelated.** It still signs in with a GitHub token. Student accounts have no access to it.
- **Firebase bundle.** `assets/vendor/firebase-lite.js` is a build of just the parts used. To rebuild after a Firebase upgrade, see the first lines of `scripts/firebase-entry.js`.
- **Costs and limits.** A student's whole account is one small document (limits are enforced in `firestore.rules`). Reads and writes are well inside the free quota for a study site of this size. Writes are batched, a page turn is sent at most every couple of seconds.
- **Privacy.** The site stores each student's email (and name or Google profile photo if given) in Firebase Authentication, and their saved data in Firestore. Consider a line about this in your About page.

---

### Your own page for email links

Confirm-email, reset-password and undo-email-change links open `/auth/action/` on this site instead of the plain Firebase page. One-time setup: Firebase console > Authentication > Templates > click the pencil on "Email address verification" > "Customize action URL" > enter `https://icse.shekharjha.tech/auth/action/` > Save. It applies to all the email templates. The page is `auth/action/index.html` with `assets/js/action.js`; it is hidden from search engines.

## Running locally

PDF.js needs a web server, not `file://`.

```bash
python3 -m http.server 8000      # in this folder, then open http://localhost:8000
node scripts/check-links.js      # every PDF path in resources.json exists, no duplicate ids
```

> `node scripts/build-seo.js` **rewrites `index.html`** and creates folders. Run it on a copy of the project, never on your working folder.

**Keyboard shortcuts.** Library: `/` or `Ctrl+K` focuses search, `Esc` clears it. Reader: `←` `→` change page, `+` `-` zoom, `0` fit width, `G` jump to page, `F` fullscreen, `Esc` close. Touch: pinch to zoom, swipe to change page.

---

## Troubleshooting

| Problem | Fix |
| --- | --- |
| The admin commits to `main` | Set `branch: "website"` in `assets/js/admin-config.js`. |
| A change is not showing | Assets are cached for 5 minutes. Hard refresh, or wait. |
| WhatsApp shows no share image | Check `/assets/og.jpg` opens in a browser, then refresh the preview with the Facebook Sharing Debugger. |
| "Timed exam" start dialog says it could not check for a marking scheme | The PDF loaded slowly or failed. Set `msFrom` on the paper by hand. |
| Wrong time or marks in an exam | Set `minutes` and `marks` on the paper (admin Edit sheet), or fix the subject defaults. |
| Download counts stay at the starting number | The counter service may be blocked or down. The site still works. Counts are public and can be inflated, so treat them as a rough guide. |
| "This website address is not allowed yet" when signing in | Add the domain under Firebase, Authentication, Settings, Authorized domains. |
| "This sign-in method is not turned on yet" | Enable Email/Password and Google under Authentication, Sign-in method. |
| Menu says "Sync is paused" | Create the Firestore database and publish `firestore.rules` (the newest version). Press F12, Console, for the exact reason. Data stays on the device meanwhile. |
| Email account says "Waiting for email verification" | The student opens the link in the email (check spam), then returns to the site. **Resend email** sends it again. |
| Google sign-in popup does not appear | Allow popups for the site. The site falls back to a redirect on browsers that block them. |
| A PDF will not load | Check the `file` path in `resources.json` and that the file is in `pdfs/` on the `website` branch. |

---

<div align="center">

**ICSE Resources is an independent educational reference project.** It is not affiliated with, endorsed by or sponsored by the Council for the Indian School Certificate Examinations (CISCE). All exam names and specimen materials belong to their respective governing bodies.

Made by [Shekhar Kumar Jha](https://shekharjha.tech)

</div>