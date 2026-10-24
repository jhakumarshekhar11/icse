#!/usr/bin/env node
// Runs on every deploy (Render "buildCommand" / Netlify "command").
// Reads data/resources.json and writes, next to index.html:
//   sitemap.xml                       every page and PDF, for Google
//   index.html                        the library page with crawlable links and structured data
//   <subject>/...                     landing pages such as /computer-applications/specimen-papers/2025/
//   <subject>/<type>/<year>/<id>/     one page per resource, built from the About page shell
// Nothing here is committed to GitHub; it is regenerated at deploy time, so the admin
// needs no extra steps. If anything fails the site still deploys with the plain page.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = process.env.ROOT || path.join(__dirname, '..');
const SITE = (process.env.SITE_URL || 'https://icse.shekharjha.tech').replace(/\/$/, '');
const OWNER = 'Shekhar Jha';
const RESERVED = new Set(['assets', 'data', 'pdfs', 'admin', 'scripts', 'public', 'tools', 'about', 'privpol', 'tos', 'auth']);

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const abs = (p) => (/^https?:/.test(p) ? p : SITE + (p.startsWith('/') ? p : '/' + p));
const jsonLd = (o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`;
const trim = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');

function main() {
  const dataFile = path.join(ROOT, 'data', 'resources.json');
  const tplFile = path.join(ROOT, 'index.html');
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const template = fs.readFileSync(tplFile, 'utf8');
  if (!/<!--seo:head-->/.test(template)) throw new Error('index.html has no seo markers');

  // Optional extra wording (data/seo.json): other names for a subject, and extra search phrases for single papers
  let SEO = {};
  try { SEO = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'seo.json'), 'utf8')); } catch (e) { /* optional */ }
  const aliasesOf = (id) => (SEO.subjectAliases || {})[id] || [];
  const extraKeywords = (id) => (SEO.resourceKeywords || {})[id] || [];

  const subjects = new Map((data.subjects || []).map((s) => [s.id, s]));
  const live = (data.resources || []).filter((r) => !r.draft && subjects.has(r.subject));
  const classLabel = '10';

  // ----- group resources into landing pages: any non-empty mix of subject / type / year -----
  const pages = new Map();
  live.forEach((r) => {
    const s = subjects.get(r.subject);
    const seg = { subject: slug(s.name), type: slug(r.type), year: String(r.year) };
    for (let mask = 1; mask < 8; mask++) {
      const keys = ['subject', 'type', 'year'].filter((k, i) => mask & (1 << i));
      const url = '/' + keys.map((k) => seg[k]).join('/') + '/';
      if (RESERVED.has(seg[keys[0]])) continue;
      if (!pages.has(url)) pages.set(url, { url, subject: '', type: '', year: '', subjectId: '', items: [] });
      const g = pages.get(url);
      if (keys.includes('subject')) { g.subject = s.name; g.subjectId = s.id; }
      if (keys.includes('type')) g.type = r.type;
      if (keys.includes('year')) g.year = String(r.year);
      g.items.push(r);
    }
  });
  const byDate = (a, b) => String(b.added).localeCompare(String(a.added)) || a.title.localeCompare(b.title);

  // ----- one page per resource: /<subject>/<type>/<year>/<id>/ -----
  // Everything on these pages comes from resources.json, nothing is invented. They reuse the nav and
  // footer of about/index.html. If that page changes shape, the paper pages are skipped (never the rest).
  const PAPER_TYPES = new Set(['Previous Year Papers', 'Specimen Papers', 'Sample Papers']);
  const SINGULAR = { 'Previous Year Papers': 'Previous Year Paper', 'Specimen Papers': 'Specimen Paper', 'Sample Papers': 'Sample Paper', 'Question Banks': 'Question Bank', Notes: 'Notes', Maps: 'Map' };
  const TYPE_BLURB = {
    'Previous Year Papers': 'Previous year papers are question papers from past ICSE board examinations. Solving them under timed conditions is a common way to practise for the exam.',
    'Specimen Papers': 'Specimen papers show the format of the question paper for the exam year. Use them to get familiar with the paper structure and the kinds of questions asked.',
    'Sample Papers': 'Sample papers are practice papers modelled on the exam format. Attempt one under timed conditions to check your preparation.',
    'Question Banks': 'A question bank collects questions for practice, so you can work through the subject topic by topic.',
    Notes: 'Study notes for quick revision of the topic.',
    Maps: 'A reference map to practise for the Geography paper.'
  };
  const singular = (t) => SINGULAR[t] || t;
  const subjName = (r) => subjects.get(r.subject).name;
  const fmtSize = (kb) => (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' KB');
  const fmtDate = (d) => { const t = new Date(String(d) + 'T00:00:00Z'); return isNaN(t) ? '' : t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); };
  // ALL-CAPS titles become Title Case
  const tidy = (x) => { const t = String(x).trim().replace(/\s+/g, ' '); return /[a-z]/.test(t) ? t : t.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(icse|isc|qp|cisce)\b/gi, (m) => m.toUpperCase()); };
  // true when a title adds nothing beyond subject, type and year (for example "ICSE Physics X")
  const plainTitle = (r) => {
    const words = subjName(r).toLowerCase().split(/[^a-z]+/).filter(Boolean);
    const re = new RegExp('\\b(' + [...words, 'icse', 'class', 'x', 'question', 'questions', 'bank', 'paper', 'papers', 'specimen', 'sample', 'notes', 'complete', 'semester', 'qp', 'and', 'of', 'the'].join('|') + ')\\b', 'g');
    return r.title.toLowerCase().replace(re, ' ').replace(/[^a-z]+/g, ' ').trim().length < 3;
  };
  function headingOf(r) {
    const subj = subjName(r), one = singular(r.type);
    if (PAPER_TYPES.has(r.type) || plainTitle(r)) return `ICSE Class ${classLabel} ${subj} ${one} ${r.year}`;
    const t = tidy(r.title);
    if (/\bicse\b/i.test(t)) return t;
    if (t.toLowerCase().includes(subj.toLowerCase())) return `ICSE Class ${classLabel} ${t}`;
    return `ICSE Class ${classLabel} ${subj}${r.type === 'Notes' && !/note/i.test(t) ? ' Notes' : ''}: ${t}`;
  }
  const headings = new Map(), paperUrls = new Map();
  (() => {
    const seen = new Map(), used = new Set();
    live.forEach((r) => { const h = headingOf(r); (seen.get(h) || seen.set(h, []).get(h)).push(r); });
    live.forEach((r) => {
      const h = headingOf(r);
      headings.set(r, seen.get(h).length > 1 ? `${h} (${tidy(r.title)})` : h);
      let u = `/${slug(subjName(r))}/${slug(r.type)}/${r.year}/${slug(r.id)}/`, n = 2;
      while (used.has(u)) u = `/${slug(subjName(r))}/${slug(r.type)}/${r.year}/${slug(r.id)}-${n++}/`;
      used.add(u); paperUrls.set(r, u);
    });
  })();
  let paperPagesOk = false;
  const linkFor = (r) => (paperPagesOk ? paperUrls.get(r) : r.file);

  function buildPaperPages() {
    const shellFile = path.join(ROOT, 'about', 'index.html');
    const shell = fs.readFileSync(shellFile, 'utf8');
    const headRe = /<title>[\s\S]*?(?=<meta name="theme-color")/, mainRe = /<main class="wrap about">[\s\S]*?<\/main>/;
    if (!headRe.test(shell) || !mainRe.test(shell)) throw new Error('about/index.html shape not recognised');
    const hit = "<script>(function(){var b=document.getElementById('dl');if(!b)return;b.addEventListener('click',function(){var c=(window.ICSE_CONFIG||{}).counter,id=b.getAttribute('data-id');if(!c||!c.enabled||!id)return;try{if(sessionStorage.getItem('icse:hit:'+id))return;sessionStorage.setItem('icse:hit:'+id,'1');}catch(e){}fetch(c.baseUrl+'/hit/'+c.namespace+'/'+encodeURIComponent(id),{keepalive:true}).catch(function(){});});})();</script>";
    // While a timed exam with a hidden marking scheme runs on this paper, the Download button is switched off
    const lock = "<script>(function(){try{var s=JSON.parse(localStorage.getItem('icse:exam:active')),b=document.getElementById('dl');if(s&&b&&s.lockFrom>1&&Date.now()<s.writingEnd&&s.id===b.getAttribute('data-id')){b.removeAttribute('href');b.removeAttribute('download');b.setAttribute('aria-disabled','true');b.textContent='Download opens when your exam ends';b.style.opacity='.5';b.style.pointerEvents='none';}}catch(e){}})();</script>";
    let made = 0;
    live.forEach((r) => {
      const url = paperUrls.get(r), heading = headings.get(r), subj = subjName(r), one = singular(r.type), canon = SITE + url;
      const sSlug = '/' + slug(subj) + '/', tSlug = sSlug + slug(r.type) + '/', ySlug = tSlug + r.year + '/';
      const crumbs = [['/', 'ICSE Resources'], [sSlug, subj], [tSlug, r.type], [ySlug, String(r.year)]].filter(([u]) => u === '/' || pages.has(u));
      const size = r.size_kb ? fmtSize(r.size_kb) : '', pg = r.pages ? `${r.pages} page${r.pages === 1 ? '' : 's'}` : '';
      const facts = [pg, size].filter(Boolean).join(', ');
      const lead = `${one} for ICSE Class ${classLabel} ${subj}, ${r.year}.${facts ? ' ' + facts + ',' : ''} free to read online or download.`.replace(/\.\s+(\d)/, '. $1').replace(',,', ',');
      const dsc = r.description ? String(r.description).trim().replace(/[.\s]*$/, '.') : '';
      const desc = trim(`Free ICSE Class ${classLabel} ${subj} ${one.toLowerCase()} ${r.year} PDF${facts ? ' (' + facts + ')' : ''}. ${dsc} Read online or download.`.replace(/\s+/g, ' '), 158);
      const t1 = `${heading} PDF – Free Download | ${OWNER}`, t2 = `${heading} PDF | ${OWNER}`;
      const title = t1.length <= 66 ? t1 : t2.length <= 66 ? t2 : `${heading} PDF`;
      const skip = new Set([subj.toLowerCase(), r.subject, r.type.toLowerCase(), one.toLowerCase(), String(r.year)]);
      const tags = [...new Set([...extraKeywords(r.id), ...(r.tags || [])])].filter((x) => !skip.has(String(x).toLowerCase())).slice(0, 14);
      const others = live.filter((x) => x !== r);
      const sameSubject = others.filter((x) => x.subject === r.subject)
        .sort((a, b) => (b.type === r.type) - (a.type === r.type) || b.year - a.year || a.title.localeCompare(b.title)).slice(0, 8);
      const sameYear = others.filter((x) => x.subject !== r.subject && x.type === r.type && String(x.year) === String(r.year)).slice(0, 8);
      const li = (x) => `<li><a href="${esc(paperUrls.get(x))}">${esc(headings.get(x))}</a></li>`;
      const row = (k, v) => (v ? `<dt>${k}</dt><dd>${esc(v)}</dd>` : '');
      const downloadName = slug(r.title) + '.pdf';
      const main = `<main class="wrap about paper">
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs.map(([u, n], i) => (i ? '<span aria-hidden="true">/</span>' : '') + `<a href="${esc(u)}">${esc(n)}</a>`).join('')}</nav>
    <h1>${esc(heading)}</h1>
    <p class="lead">${esc(lead)}</p>
    <div class="paper-cta">
      <a class="btn btn-primary" href="/?file=${encodeURIComponent(r.id)}">Read online</a>
      ${PAPER_TYPES.has(r.type) ? `<a class="btn" href="/?file=${encodeURIComponent(r.id)}&amp;exam=1">Timed exam</a>` : ''}
      <a class="btn" id="dl" data-id="${esc(r.id)}" href="${esc(r.file)}" download="${esc(downloadName)}">Download PDF</a>
    </div>
    <section>
      <h2>About this file</h2>
      ${dsc ? `<p>${esc(dsc)}</p>` : ''}${TYPE_BLURB[r.type] ? `<p>${esc(TYPE_BLURB[r.type])}</p>` : ''}
    </section>
    <section>
      <h2>Details</h2>
      <dl class="paper-facts">${row('Class', classLabel)}${row('Subject', subj)}${row('Type', one)}${row('Year', String(r.year))}${row('Pages', r.pages ? String(r.pages) : '')}${row('File size', size)}${row('Format', 'PDF')}${row('Added', fmtDate(r.added))}</dl>
    </section>${tags.length ? `
    <section>
      <h2>Keywords</h2>
      <div class="paper-tags">${tags.map((x) => `<span>${esc(x)}</span>`).join('')}</div>
    </section>` : ''}${sameSubject.length ? `
    <section>
      <h2>More ICSE Class ${classLabel} ${esc(subj)}</h2>
      <ul class="paper-related">${sameSubject.map(li).join('')}</ul>
    </section>` : ''}${sameYear.length ? `
    <section>
      <h2>${esc(one)} ${esc(r.year)} for other subjects</h2>
      <ul class="paper-related">${sameYear.map(li).join('')}</ul>
    </section>` : ''}
    ${(() => { const g = { subject: subj, subjectId: r.subject, type: r.type, year: String(r.year), items: [r] }; return copyOf(g, words(g)).html; })()}
    <section>
      <h2>Found a mistake?</h2>
      <p>Files are uploaded by hand and errors can slip in. Email <a id="mail" href="#">me</a> and I will fix it.</p>
      <p class="paper-note">ICSE Resources is an independent project and is not affiliated with CISCE. Exam names and papers belong to their respective owners.</p>
    </section>
    <a class="btn btn-primary back-cta" href="/">Browse all resources</a>
    ${hit}
    ${lock}
  </main>`;
      const ld = [
        { '@context': 'https://schema.org', '@type': 'LearningResource', name: heading, description: r.description || undefined, url: canon,
          educationalLevel: 'Class ' + classLabel, learningResourceType: r.type, about: subj, inLanguage: r.subject === 'hindi' ? 'hi' : 'en',
          keywords: tags.length ? tags.join(', ') : undefined,
          datePublished: r.added, dateModified: r.updated || r.added, isAccessibleForFree: true, publisher: { '@type': 'Person', name: OWNER },
          isPartOf: { '@type': 'WebSite', name: 'ICSE Class 10 Resources', url: SITE + '/' },
          encoding: { '@type': 'MediaObject', contentUrl: abs(r.file), encodingFormat: 'application/pdf', contentSize: r.size_kb ? r.size_kb + ' KB' : undefined } },
        { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [...crumbs.map(([u, n], i) => ({ '@type': 'ListItem', position: i + 1, name: n, item: SITE + u })), { '@type': 'ListItem', position: crumbs.length + 1, name: heading, item: canon }] }
      ];
      const head = [
        `<title>${esc(title)}</title>`, `<meta name="description" content="${esc(desc)}">`, `<link rel="canonical" href="${esc(canon)}">`,
        `<meta property="og:title" content="${esc(title)}">`, `<meta property="og:description" content="${esc(desc)}">`, '<meta property="og:type" content="website">',
        `<meta property="og:url" content="${esc(canon)}">`, '<meta property="og:site_name" content="ICSE Class 10 Resources">',
        `<meta property="og:image" content="${SITE}/assets/og.jpg">`, '<meta property="og:image:type" content="image/jpeg">',
        '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
        '<meta name="twitter:card" content="summary_large_image">', ...ld.map(jsonLd)
      ].join('\n  ');
      const html = shell.replace(headRe, () => head + '\n  ').replace(mainRe, () => main);
      const dir = path.join(ROOT, url.replace(/^\//, ''));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      made++;
    });
    return made;
  }
  // ----- text for a page -----
  const SHORT = { 'Specimen Papers': 'Specimen', 'Sample Papers': 'Sample', 'Previous Year Papers': 'Previous Year' };
  const lc = (x) => String(x).toLowerCase();
  const joinWords = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

  function words(g) {
    const n = g.items.length, subj = g.subject || '', year = g.year || '';
    const T = g.type ? (n === 1 ? singular(g.type) : g.type) : '';
    const present = [...new Set(g.items.map((r) => r.type).filter((t) => SHORT[t]))].map((t) => SHORT[t]);
    // the heading a student would type: "ICSE Class 10 Biology Specimen Paper 2023"
    const heading = g.type
      ? ['ICSE Class ' + classLabel, subj, T, year].filter(Boolean).join(' ')
      : subj
        ? ['ICSE Class ' + classLabel, subj, year, year ? 'Papers and Notes' : 'Papers, Notes and Solutions'].filter(Boolean).join(' ')
        : `ICSE Class ${classLabel} ${year} ${present.length ? 'Question Papers: ' + joinWords(present) + ' PDF' : 'Papers and Notes'}`.replace(/\s+/g, ' ');
    const cisce = g.type === 'Specimen Papers' && !subj;   // aggregate specimen pages: people search "CISCE specimen papers"
    let title = `${heading}${/PDF$/.test(heading) ? '' : ' PDF'}${cisce ? ' (CISCE)' : ''}`;
    if ((title + ' | ICSE Resources').length <= 70) title += ' | ICSE Resources';
    const names = [...g.items].sort(byDate).slice(0, 3).map((r) => tidy(r.title)).join('; ');
    const what = g.type ? (g.type === 'Previous Year Papers' ? (n === 1 ? 'previous year paper (board question paper)' : 'previous year papers (board question papers)') : lc(T)) : 'papers, notes and solutions';
    const desc = trim(`Free ICSE Class ${classLabel} ${[subj, what, year].filter(Boolean).join(' ')} PDF${cisce ? ' as released by CISCE' : ''}. ${n} file${n === 1 ? '' : 's'}: ${names}. Read online or download, no sign up needed.`, 158);
    const intro = `${n} free ICSE Class ${classLabel} ${[subj, g.type ? lc(T) : '', year].filter(Boolean).join(' ') || 'resource'}${g.type ? '' : n === 1 ? ' file' : ' files'} ` +
      `for the ICSE board exam. Read each PDF in your browser or download it.`;
    return { heading, title, desc, intro, T, n };
  }

  // Helpful text under every page: what the files are, what to expect inside them, and a few common questions.
  // Everything here is true for every page it appears on (marking scheme facts come from the site's own exam settings).
  function copyOf(g, w) {
    const subj = g.subject, year = g.year, type = g.type;
    const has = (u) => pages.has(u);
    const para = [];
    para.push(`${w.intro} Every file on this page is free to use for personal study.`);
    if (type && TYPE_BLURB[type]) para.push(TYPE_BLURB[type]);
    const al = g.subjectId ? aliasesOf(g.subjectId).filter((a) => lc(a) !== lc(subj)) : [];
    if (al.length) para.push(`${subj} is also searched as ${joinWords(al)}.`);
    const faq = [];
    const where = ['ICSE Class ' + classLabel, subj, type ? lc(w.T || type) : 'papers', year].filter(Boolean).join(' ');
    faq.push([`Where can I download ${where} PDF?`, `Open any file on this page to read it online, or press Download to save the PDF. It is free and needs no account.`]);
    if (type === 'Specimen Papers' || type === 'Sample Papers') {
      const y = Number(year);
      faq.push([`Does the ${lc(singular(type))}${year ? ' ' + year : ''} include the marking scheme?`,
        year ? (y >= 2025 ? `Specimen papers from 2025 onwards carry the marking scheme at the end of the same PDF. In the timed exam it stays hidden until your time is up.`
                           : `Specimen papers from 2025 onwards carry the marking scheme at the end of the same PDF. For ${year}, open the file to see exactly what it contains.`)
             : `Specimen papers from 2025 onwards carry the marking scheme at the end of the same PDF. For earlier years, open the file to see what it contains.`]);
    } else if (type === 'Previous Year Papers') {
      faq.push([`Are these previous year papers solved?`, `They are the board question papers. Answers and explanations are available separately where listed under Solutions and Question Banks.`]);
    } else if (!type) {
      faq.push([`What kinds of files are here?`, `${present(g)} Use the filters above to narrow by type.`]);
    }
    if (has('/solutions/') || has('/question-banks/')) {
      const links = [has('/solutions/') ? '<a href="/solutions/">Solutions</a>' : '', has('/question-banks/') ? '<a href="/question-banks/">Question Banks</a>' : ''].filter(Boolean);
      faq.push([`Where can I find solved answers?`, { html: `Look under ${links.join(' and ')}. Some question banks include an answer key.` }]);
    }
    if (g.items.some((r) => PAPER_TYPES.has(r.type))) {
      faq.push([`Can I practise with a timer?`, `Yes. Press Timed exam on any paper for a countdown with an optional reading time, a beep, and a score history. Create an account (optional) to keep your scores on all your devices.`]);
    }
    faq.push([`Are these official CISCE files?`, `Specimen and board papers are issued by CISCE. This site is an independent library and is not affiliated with CISCE. Check the official CISCE website for the latest versions.`]);
    function present(grp) {
      const t = [...new Set(grp.items.map((r) => r.type))];
      return `This page has ${joinWords(t.map((x) => lc(x)))}.`;
    }
    const plainA = (a) => (typeof a === 'string' ? a : a.html.replace(/<[^>]+>/g, ''));
    const html = `<div class="seo-copy"><h2>About these ${esc(w.heading.replace(/ PDF$/, ''))} files</h2>` +
      para.map((x) => `<p>${esc(x)}</p>`).join('') +
      `<h3>Common questions</h3>` +
      faq.map(([q, a]) => `<details open><summary>${esc(q)}</summary><p>${typeof a === 'string' ? esc(a) : a.html}</p></details>`).join('') + '</div>';
    const ld = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: plainA(a) } })) };
    return { html, ld };
  }

  // (paper pages are built here because they reuse the helper text above)
  let paperCount = 0;
  try { paperCount = buildPaperPages(); paperPagesOk = true; } catch (e) { console.warn('Paper pages skipped:', e.message); }

  function listHtml(items) {
    return '<ul>' + [...items].sort(byDate).map((r) =>
      `<li><a href="${esc(linkFor(r))}">${esc(r.title)}</a>${r.description ? ' – ' + esc(r.description) : ''}</li>`).join('') + '</ul>';
  }

  function itemListLd(items, name, url) {
    return {
      '@context': 'https://schema.org', '@type': 'CollectionPage', name, url: SITE + url,
      isPartOf: { '@type': 'WebSite', name: 'ICSE Class 10 Resources', url: SITE + '/' },
      mainEntity: {
        '@type': 'ItemList', numberOfItems: items.length,
        itemListElement: [...items].sort(byDate).slice(0, 100).map((r, i) => ({
          '@type': 'ListItem', position: i + 1,
          item: {
            '@type': 'LearningResource', name: r.title, description: r.description || undefined,
            url: abs(linkFor(r)), educationalLevel: 'Class ' + classLabel, learningResourceType: r.type,
            inLanguage: 'en', datePublished: r.added, encodingFormat: 'application/pdf',
            about: (subjects.get(r.subject) || {}).name, author: { '@type': 'Person', name: OWNER }, isAccessibleForFree: true
          }
        }))
      }
    };
  }

  // ----- the visible "browse" footer: crawlable internal links to every landing page -----
  const subjectLinks = [...subjects.values()].filter((s) => pages.has('/' + slug(s.name) + '/'));
  const typeLinks = (data.types || []).filter((t) => pages.has('/' + slug(t) + '/'));
  const yearLinks = [...new Set(live.map((r) => String(r.year)))].sort().reverse().filter((y) => pages.has('/' + y + '/'));
  const browse = (current) => {
    const a = (u, t) => `<a href="${u}"${u === current ? ' aria-current="page"' : ''}>${esc(t)}</a>`;
    const combos = [];
    pages.forEach((g, u) => { if (g.subject && g.type && !g.year) combos.push(a(u, g.subject + ' ' + g.type)); });
    return `<nav class="seo-browse" aria-label="Browse ICSE Class ${classLabel} resources">` +
      `<div><b>By subject</b>${subjectLinks.map((s) => a('/' + slug(s.name) + '/', s.name)).join('')}</div>` +
      `<div><b>By type</b>${typeLinks.map((t) => a('/' + slug(t) + '/', t)).join('')}</div>` +
      `<div><b>By year</b>${yearLinks.map((y) => a('/' + y + '/', y)).join('')}</div>` +
      (combos.length ? `<div><b>Subject and type</b>${combos.join('')}</div>` : '') + '</nav>';
  };

  // ----- stamp the template -----
  function stamp(url, meta) {
    const canon = SITE + (meta.canonical || url);
    const head = [
      `<title>${esc(meta.title)}</title>`,
      `<meta name="description" content="${esc(meta.desc)}">`,
      `<link rel="canonical" href="${esc(canon)}">`,
      `<meta property="og:title" content="${esc(meta.title)}">`,
      `<meta property="og:description" content="${esc(meta.desc)}">`,
      '<meta property="og:type" content="website">',
      `<meta property="og:url" content="${esc(canon)}">`,
      '<meta property="og:site_name" content="ICSE Class 10 Resources">',
      `<meta property="og:image" content="${SITE}/assets/og.jpg">`,
      `<meta property="og:image:secure_url" content="${SITE}/assets/og.jpg">`,
      '<meta property="og:image:type" content="image/jpeg">',
      '<meta property="og:image:alt" content="ICSE Class 10 Resources: papers, specimen papers, question banks and notes">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:image" content="${SITE}/assets/og.jpg">`,
      meta.preset ? `<script>window.__PRESET=${JSON.stringify(meta.preset).replace(/</g, '\\u003c')};</script>` : '',
      ...meta.ld.map(jsonLd)
    ].filter(Boolean).join('\n  ');
    const body = `<section class="seo-static">${meta.copy || `<div class="seo-copy"><h2>${esc(meta.heading)}</h2><p>${esc(meta.intro)}</p></div>`}<div class="seo-list">${meta.list}</div></section>`;
    let page = template;
    // landing pages: the page's own heading becomes the visible H1 and lead line (the home page keeps its design copy)
    if (meta.h1) {
      page = page
        .replace('<h1 id="h1">ICSE Class X, ready to study.</h1>', () => `<h1 id="h1" class="h1-landing">${esc(meta.h1)}</h1>`)
        .replace('<p>Notes, past papers and solutions by Shekhar Jha. Read them right here, or download the PDF.</p>', () => `<p>${esc(meta.lead)}</p>`);
    }
    return page
      .replace(/<!--seo:head-->[\s\S]*?<!--\/seo:head-->/, '<!--seo:head-->\n  ' + head + '\n  <!--/seo:head-->')
      .replace(/<!--seo:body-->[\s\S]*?<!--\/seo:body-->/, '<!--seo:body-->' + body + '<!--/seo:body-->')
      .replace(/<!--seo:browse-->[\s\S]*?<!--\/seo:browse-->/, '<!--seo:browse-->' + browse(url) + '<!--/seo:browse-->');
  }

  // landing pages
  let count = 0;
  const soloUrls = new Set();
  pages.forEach((g, url) => {
    const w = words(g);
    const cp = copyOf(g, w);
    // subject + type + year with a single file is the same thing as that file's own page: point Google at the richer one
    const solo = paperPagesOk && g.subject && g.type && g.year && g.items.length === 1;
    if (solo) soloUrls.add(url);
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ICSE Resources', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: w.heading, item: SITE + url }] };
    const html = stamp(url, {
      canonical: solo ? paperUrls.get(g.items[0]) : undefined,
      title: w.title, desc: w.desc, heading: w.heading, intro: w.intro, list: listHtml(g.items), copy: cp.html,
      h1: w.heading, lead: w.intro,
      preset: { subject: g.subjectId || undefined, type: g.type || undefined, year: g.year || undefined },
      ld: [itemListLd(g.items, w.heading, url), crumbs, cp.ld]
    });
    const dir = path.join(ROOT, url.replace(/^\//, ''));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), html);
    count++;
  });

  // main library page keeps its hand-written title/description, plus the list and the search action
  const homeMeta = {
    title: 'ICSE Class 10 Papers, Specimen Papers, Notes and Solutions | ' + OWNER,
    desc: 'Free ICSE Class 10 previous year papers, specimen papers, sample papers, notes and solutions. Read them online or download the PDF.',
    heading: 'ICSE Class 10 resources', intro: `Free ICSE Class ${classLabel} papers, specimen papers, notes and solutions by ${OWNER}.`,
    list: listHtml(live),
    copy: `<div class="seo-copy"><h2>Free ICSE Class 10 papers, specimen papers, sample papers and notes</h2>` +
      `<p>One place for ICSE Class 10 (Class X) study material for the 2027 board exams: previous year board papers, CISCE specimen papers, sample papers, question banks, notes and solutions for English Language, English Literature, Hindi, History and Civics, Geography, Mathematics, Physics, Chemistry, Biology, Commercial Studies (Commerce), Computer Applications and Economic Applications.</p>` +
      `<p>Read every PDF in your browser, download it free, or run a timed exam with a countdown, a beep and a score history. An account is optional and keeps your bookmarks, exam history and place in each paper on all your devices.</p>` +
      `<p>This is an independent library and is not affiliated with CISCE. Check the official CISCE website for the latest specimen papers and notifications.</p></div>`,
    ld: [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'ICSE Class 10 Resources', url: SITE + '/',
        potentialAction: { '@type': 'SearchAction', target: SITE + '/?q={search_term_string}', 'query-input': 'required name=search_term_string' } },
      itemListLd(live, 'ICSE Class 10 resources', '/')
    ]
  };
  fs.writeFileSync(tplFile, stamp('/', homeMeta));

  // sitemap
  const latest = (items) => items.map((r) => String(r.added)).sort().pop() || '';
  const urls = [{ loc: SITE + '/', lm: latest(live) }];
  urls.push({ loc: SITE + '/about/', lm: '' });
  urls.push({ loc: SITE + '/privpol/', lm: '' });
  urls.push({ loc: SITE + '/tos/', lm: '' });
  pages.forEach((g, url) => { if (!soloUrls.has(url)) urls.push({ loc: SITE + url, lm: latest(g.items) }); });
  if (paperPagesOk) live.forEach((r) => urls.push({ loc: SITE + paperUrls.get(r), lm: String(r.updated || r.added) }));
  live.forEach((r) => urls.push({ loc: abs(r.file), lm: String(r.added) }));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lm ? `<lastmod>${esc(u.lm)}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

  console.log(`SEO build: ${count} landing pages, ${paperCount} paper pages, ${urls.length} sitemap URLs`);
}

try { main(); } catch (e) {
  // Never fail the deploy over SEO files
  console.warn('SEO build skipped:', e.message);
}
