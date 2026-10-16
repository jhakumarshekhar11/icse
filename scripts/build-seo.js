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
const RESERVED = new Set(['assets', 'data', 'pdfs', 'admin', 'scripts', 'public', 'tools', 'about']);

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
      const tags = (r.tags || []).filter((x) => !skip.has(String(x).toLowerCase())).slice(0, 12);
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
    <section>
      <h2>Found a mistake?</h2>
      <p>Files are uploaded by hand and errors can slip in. Email <a id="mail" href="#">me</a> and I will fix it.</p>
      <p class="paper-note">ICSE Resources is an independent project and is not affiliated with CISCE. Exam names and papers belong to their respective owners.</p>
    </section>
    <a class="btn btn-primary back-cta" href="/">Browse all resources</a>
    ${hit}
  </main>`;
      const ld = [
        { '@context': 'https://schema.org', '@type': 'LearningResource', name: heading, description: r.description || undefined, url: canon,
          educationalLevel: 'Class ' + classLabel, learningResourceType: r.type, about: subj, inLanguage: r.subject === 'hindi' ? 'hi' : 'en',
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
  let paperCount = 0;
  try { paperCount = buildPaperPages(); paperPagesOk = true; } catch (e) { console.warn('Paper pages skipped:', e.message); }

  // ----- text for a page -----
  function words(g) {
    const subj = g.subject || '';
    const kind = g.type || (g.subject ? 'Papers, Notes and Solutions' : 'Papers, Notes and Solutions');
    const heading = ['ICSE Class ' + classLabel, subj, g.type || '', g.year, g.type ? '' : 'Papers and Notes'].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const title = heading + ' – Free PDF Download | ' + OWNER;
    const n = g.items.length;
    const names = [...g.items].sort(byDate).slice(0, 3).map((r) => r.title).join('; ');
    const desc = trim(`Free ICSE Class ${classLabel} ${[subj, g.type || kind, g.year].filter(Boolean).join(' ')} PDFs. ${n} resource${n === 1 ? '' : 's'} including ${names}. Read online or download.`, 158);
    const intro = `${n} free ICSE Class ${classLabel} ${[subj, g.type, g.year].filter(Boolean).join(' ') || 'resource'}${n === 1 ? '' : 's'} ` +
      `for the ICSE board exam, by ${OWNER}. Read each PDF in your browser or download it.`;
    return { heading, title, desc, intro, kind };
  }

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
    const canon = SITE + url;
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
    const body = `<section class="seo-static"><h2>${esc(meta.heading)}</h2><p>${esc(meta.intro)}</p>${meta.list}</section>`;
    return template
      .replace(/<!--seo:head-->[\s\S]*?<!--\/seo:head-->/, '<!--seo:head-->\n  ' + head + '\n  <!--/seo:head-->')
      .replace(/<!--seo:body-->[\s\S]*?<!--\/seo:body-->/, '<!--seo:body-->' + body + '<!--/seo:body-->')
      .replace(/<!--seo:browse-->[\s\S]*?<!--\/seo:browse-->/, '<!--seo:browse-->' + browse(url) + '<!--/seo:browse-->');
  }

  // landing pages
  let count = 0;
  pages.forEach((g, url) => {
    const w = words(g);
    const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'ICSE Resources', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: w.heading, item: SITE + url }] };
    const html = stamp(url, {
      title: w.title, desc: w.desc, heading: w.heading, intro: w.intro, list: listHtml(g.items),
      preset: { subject: g.subjectId || undefined, type: g.type || undefined, year: g.year || undefined },
      ld: [itemListLd(g.items, w.heading, url), crumbs]
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
  pages.forEach((g, url) => urls.push({ loc: SITE + url, lm: latest(g.items) }));
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
