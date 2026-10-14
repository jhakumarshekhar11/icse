#!/usr/bin/env node
// Runs on every deploy (Render "buildCommand" / Netlify "command").
// Reads data/resources.json and writes, next to index.html:
//   sitemap.xml                       every page and PDF, for Google
//   index.html                        the library page with crawlable links and structured data
//   <subject>/...                     landing pages such as /computer-applications/specimen-papers/2025/
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
      `<li><a href="${esc(r.file)}">${esc(r.title)}</a>${r.description ? ' – ' + esc(r.description) : ''}</li>`).join('') + '</ul>';
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
            url: abs(r.file), educationalLevel: 'Class ' + classLabel, learningResourceType: r.type,
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
      `<meta property="og:image" content="${SITE}/assets/og.png">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:image" content="${SITE}/assets/og.png">`,
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
    desc: 'Free ICSE Class 10 previous year papers, specimen papers, sample papers, notes, solutions and formula sheets. Read them online or download the PDF.',
    heading: 'ICSE Class 10 resources', intro: `Free ICSE Class ${classLabel} papers, specimen papers, notes and formula sheets by ${OWNER}.`,
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
  live.forEach((r) => urls.push({ loc: abs(r.file), lm: String(r.added) }));
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lm ? `<lastmod>${esc(u.lm)}</lastmod>` : ''}</url>`).join('\n') + '\n</urlset>\n';
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

  console.log(`SEO build: ${count} landing pages, ${urls.length} sitemap URLs`);
}

try { main(); } catch (e) {
  // Never fail the deploy over SEO files
  console.warn('SEO build skipped:', e.message);
}
