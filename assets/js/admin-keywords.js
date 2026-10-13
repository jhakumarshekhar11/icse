// Local keyword and description suggestions. Nothing leaves the browser:
// the admin page reads the PDF text with PDF.js and this file works out tags
// from it. Edit the VOCAB lists below to teach it more chapter and topic names.
(() => {
  'use strict';

  const STOP = new Set(('a about above after again against all also am an and any are as at be because been before being below between both but by can cannot could did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours').split(' '));

  // Exam boilerplate that shows up in every paper and says nothing about the topic.
  const BOILER = new Set(('icse cisce class marks mark question questions answer answers section sections paper papers candidates candidate time allowed attempt attempts following given write total page pages turn read carefully instructions instruction part parts maximum minutes minute hours hour specimen sample marking scheme examination exam board council certificate indian school secondary education compulsory choice either neither use used using shall must may per one two three four five six seven eight nine ten state name give explain describe define find calculate show mention list differentiate distinguish brackets bracket figure diagram table above below correct option options statement statements reason assertion true false tick fill blanks blank match column columns word words sentence sentences paragraph passage text unit units year years date example examples note notes ans qno wrong right based reading period').split(' '));

  // Chapter and topic names per subject. A phrase found in the PDF becomes a tag.
  const VOCAB = {
    computer: ['java', 'bluej', 'array', 'string handling', 'string', 'constructor', 'method overloading', 'encapsulation', 'library class', 'wrapper class', 'autoboxing', 'nested loop', 'switch case', 'bubble sort', 'selection sort', 'binary search', 'linear search', 'scanner', 'ternary operator', 'data type', 'looping', 'recursion', 'palindrome', 'armstrong number', 'fibonacci', 'boolean', 'operators', 'user defined method', 'pattern programs', 'tokens', 'input and output', 'class and object', 'inheritance', 'polymorphism'],
    maths: ['quadratic equation', 'linear inequation', 'ratio and proportion', 'shares and dividend', 'banking', 'gst', 'matrices', 'matrix', 'arithmetic progression', 'geometric progression', 'coordinate geometry', 'equation of a line', 'section formula', 'similarity', 'loci', 'circles', 'tangents', 'reflection', 'trigonometry', 'heights and distances', 'mensuration', 'cone', 'sphere', 'cylinder', 'statistics', 'mean and median', 'ogive', 'histogram', 'probability', 'remainder theorem', 'factor theorem', 'compound interest', 'factorisation', 'surds', 'rational numbers'],
    physics: ['force', 'work energy and power', 'machines', 'refraction of light', 'lens', 'spectrum', 'sound', 'current electricity', 'household circuits', 'magnetism', 'electromagnetism', 'calorimetry', 'radioactivity', 'specific heat capacity', 'latent heat', 'moment of force', 'pulley', 'echo', 'resonance', 'transformer', 'generator', 'nuclear fission', 'ohm s law', 'ohms law', 'refractive index', 'total internal reflection', 'electromagnetic induction'],
    chemistry: ['mole concept', 'periodic table', 'periodic properties', 'chemical bonding', 'acids bases and salts', 'analytical chemistry', 'electrolysis', 'metallurgy', 'hydrogen chloride', 'ammonia', 'nitric acid', 'sulphuric acid', 'organic chemistry', 'hydrocarbons', 'alkane', 'alkene', 'alkyne', 'ionic compounds', 'covalent compounds', 'gas laws', 'avogadro', 'study of compounds', 'alloys', 'electrode', 'ionisation', 'stoichiometry'],
    biology: ['photosynthesis', 'transpiration', 'nervous system', 'endocrine system', 'reproductive system', 'genetics', 'pollution', 'population', 'cell division', 'mitosis', 'meiosis', 'absorption by roots', 'plant hormones', 'sense organs', 'excretory system', 'circulatory system', 'respiratory system', 'human evolution', 'habitat', 'cell cycle', 'chromosomes', 'heredity', 'blood'],
    history: ['first world war', 'second world war', 'mughal empire', 'national movement', 'civil disobedience', 'quit india', 'non cooperation', 'united nations', 'non aligned movement', 'rise of nationalism', 'partition', 'muslim league', 'home rule', 'swadeshi', 'jallianwala bagh', 'revolt of 1857', 'cold war', 'union legislature', 'lok sabha', 'rajya sabha', 'president', 'prime minister', 'council of ministers', 'supreme court', 'high court', 'judiciary', 'election', 'fundamental rights', 'directive principles', 'local self government', 'constitution', 'parliament', 'cabinet'],
    geography: ['topographical map', 'survey of india', 'map of india', 'climate', 'soil resources', 'natural vegetation', 'water resources', 'mineral and energy resources', 'agriculture', 'manufacturing industries', 'transport', 'waste management', 'interpretation of topographical maps', 'monsoon', 'irrigation', 'minerals', 'coal', 'petroleum', 'forests', 'rice', 'wheat', 'tea', 'cotton', 'map work'],
    englishlang: ['composition', 'letter writing', 'formal letter', 'informal letter', 'email', 'notice', 'comprehension', 'grammar', 'tenses', 'prepositions', 'transformation of sentences', 'synthesis of sentences', 'reported speech', 'voice', 'phrasal verbs', 'idioms', 'summary', 'story writing', 'descriptive writing', 'argumentative', 'article'],
    englishlit: ['drama', 'poetry', 'prose', 'merchant of venice', 'julius caesar', 'twelfth night', 'treasure house of language', 'poem', 'short story', 'character sketch', 'central idea', 'theme', 'extract', 'appreciation'],
    hindi: ['vyakaran', 'patra lekhan', 'nibandh', 'apathit gadyansh', 'kahani', 'kavita', 'sandhi', 'samas', 'muhavare', 'vilom', 'paryayvachi', 'anuched', 'sarvnam'],
    commercial: ['banking', 'insurance', 'consumer protection', 'marketing', 'transport', 'communication', 'trade', 'advertising', 'warehousing', 'types of business', 'e commerce', 'salesmanship', 'sole proprietor', 'partnership', 'cooperative society', 'wholesale', 'retail'],
    economics: ['demand', 'supply', 'elasticity', 'price', 'market', 'consumer', 'producer', 'inflation', 'national income', 'gdp', 'budget', 'taxation', 'money', 'banking', 'foreign trade', 'poverty', 'unemployment', 'economic growth', 'factors of production', 'cost and revenue']
  };
  // Single words that appear everywhere in a subject need more repeats before they count.
  const COMMON = new Set(['force', 'price', 'supply', 'demand', 'market', 'trade', 'election', 'president', 'transport', 'population', 'pollution', 'drama', 'poetry', 'prose', 'climate', 'blood', 'string', 'money', 'theme', 'summary', 'article', 'notice', 'email', 'voice', 'sound', 'consumer', 'producer', 'minerals', 'forests', 'tea', 'rice', 'wheat', 'coal', 'cotton', 'reflection', 'constitution', 'parliament', 'cabinet']);

  function categoryFor(subject) {
    const k = ((subject && (subject.id || '')) + ' ' + ((subject && subject.name) || '')).toLowerCase();
    if (/comput/.test(k)) return 'computer';
    if (/math/.test(k)) return 'maths';
    if (/physic/.test(k)) return 'physics';
    if (/chem/.test(k)) return 'chemistry';
    if (/biolog/.test(k)) return 'biology';
    if (/histor|civic/.test(k)) return 'history';
    if (/geograph/.test(k)) return 'geography';
    if (/english\s*lang|englishlang/.test(k)) return 'englishlang';
    if (/english\s*lit|englishlit/.test(k)) return 'englishlit';
    if (/hindi/.test(k)) return 'hindi';
    if (/commerc/.test(k)) return 'commercial';
    if (/econom/.test(k)) return 'economics';
    return '';
  }

  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (norm, term) => {
    const m = norm.match(new RegExp('(?:^| )' + esc(term) + '(?:s|es)?(?= |$)', 'g'));
    return m ? m.length : 0;
  };
  const words = (s) => (String(s || '').toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []);

  /**
   * pages: array of page text strings
   * opts: { subject: {id, name}, type, year, title, exclude: [strings] }
   * returns { hasText, tags: [...], topics: [...], marking: bool, answerKey: bool }
   */
  function analyze(pages, opts = {}) {
    const full = (pages || []).join('\n');
    const compact = full.replace(/\s/g, '');
    if (compact.length < 120) return { hasText: false, tags: [], topics: [], marking: false, answerKey: false };

    const lower = full.toLowerCase();
    const norm = lower.replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ');
    const skip = new Set();
    [opts.title, opts.subject && opts.subject.name, opts.subject && opts.subject.id, opts.type, ...(opts.exclude || [])].forEach((s) => words(s).forEach((w) => skip.add(w)));
    if (opts.year) skip.add(String(opts.year));

    const scored = new Map(); // tag -> { score, domain }
    const put = (tag, score, domain) => {
      const t = tag.trim(); if (!t) return;
      const cur = scored.get(t);
      if (!cur || cur.score < score) scored.set(t, { score, domain: !!domain });
    };

    // 1. things worth tagging in any exam paper
    const marking = count(norm, 'marking scheme') + count(norm, 'marking guide') >= 2;
    const answerKey = count(norm, 'answer key') >= 1;
    if (marking) put('marking scheme', 100);
    if (answerKey) put('answer key', 99);
    if (/multiple choice|\bmcqs?\b/.test(lower)) put('mcq', 60);
    if (count(norm, 'internal choice') >= 1) put('internal choice', 58);

    // 2. chapter and topic names for this subject
    const cat = categoryFor(opts.subject);
    const lists = cat ? [VOCAB[cat]] : Object.values(VOCAB);
    const topics = [];
    lists.forEach((list) => list.forEach((term) => {
      const n = count(norm, term), multi = term.includes(' ');
      const need = cat ? (multi ? 1 : COMMON.has(term) ? 4 : 2) : (multi ? 2 : 5);
      if (n >= need) { put(term, 20 + Math.min(n, 12), true); topics.push(term); }
    }));

    // 3. repeated phrases from the paper itself
    const pageNorms = pages.map((p) => ' ' + p.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ') + ' ');
    const grams = new Map();
    full.toLowerCase().split(/[\n.;:?!()\[\],•|]+/).forEach((seg) => {
      const toks = seg.match(/[\p{L}\p{M}\p{N}]+/gu) || [];
      let run = [];
      const flush = () => {
        for (let n = 1; n <= 3; n++) for (let i = 0; i + n <= run.length; i++) {
          const g = run.slice(i, i + n).join(' '); grams.set(g, (grams.get(g) || 0) + 1);
        }
        run = [];
      };
      toks.forEach((t) => {
        const ok = t.length >= 3 && !STOP.has(t) && !BOILER.has(t) && !skip.has(t) && /\p{L}/u.test(t) && !/^\p{N}+$/u.test(t);
        ok ? run.push(t) : flush();
      });
      flush();
    });
    const nPages = Math.max(1, pages.length);
    grams.forEach((c, g) => {
      const n = g.split(' ').length;
      const need = n === 1 ? 4 : n === 2 ? 3 : 2;
      if (c < need || (n === 1 && g.length < 4)) return;
      if (nPages > 3) { const df = pageNorms.filter((p) => p.includes(' ' + g + ' ')).length; if (df > nPages * 0.7) return; }
      put(g, c * (n === 1 ? 1 : n === 2 ? 3 : 4), false);
    });

    // 4. rank, drop near-duplicates, keep the best
    const ranked = [...scored.entries()].sort((a, b) => b[1].score - a[1].score || a[0].length - b[0].length);
    const picked = [];
    for (const [tag, info] of ranked) {
      if (picked.length >= 12) break;
      const tw = tag.split(' ');
      const dup = picked.some(([p]) => {
        const pw = p.split(' ');
        const sing = (w) => w.replace(/(es|s)$/, '');
        return tw.every((w) => pw.some((x) => sing(x) === sing(w))) || pw.every((w) => tw.some((x) => sing(x) === sing(w)));
      });
      if (!dup) picked.push([tag, info]);
    }
    return {
      hasText: true, marking, answerKey,
      tags: picked.map(([t]) => t),
      topics: picked.filter(([, i]) => i.domain).map(([t]) => t)
    };
  }

  const join = (a) => (a.length <= 1 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);

  // One short line in the same style as your existing descriptions.
  function describe({ subjectName, type, year, topics = [], marking = false, answerKey = false }) {
    const subj = subjectName || 'the subject';
    const y = year ? ' ' + year : '';
    const t = String(type || '');
    let head;
    if (/previous year|pyq/i.test(t)) head = `PYQ of ${subj}${y}`;
    else if (/specimen/i.test(t)) head = `Specimen paper of ${subj}${y}`;
    else if (/sample/i.test(t)) head = `Sample paper of ${subj}${y}`;
    else if (/question bank/i.test(t)) head = `Question bank for ${subj}`;
    else if (/formula/i.test(t)) head = `Formula sheet for ${subj}`;
    else if (/solution/i.test(t)) head = `Solutions for ${subj}${y}`;
    else if (/note/i.test(t)) head = `Notes for ${subj}`;
    else head = `${t || 'Resource'} for ${subj}${y}`;
    const extras = [];
    if (marking) extras.push('marking scheme');
    if (answerKey && !marking) extras.push('answer key');
    let out = head + (extras.length ? ' with ' + join(extras) : '') + '.';
    const tp = topics.slice(0, 4);
    if (tp.length >= 2 || (tp.length === 1 && /bank|note|formula/i.test(t))) out += ' Covers ' + join(tp) + '.';
    return out.length > 230 ? out.slice(0, 227).replace(/\s+\S*$/, '') + '...' : out;
  }

  window.KW = { analyze, describe, categoryFor };
})();
