// Site settings. Edit these values; no other file needs to change.
window.ICSE_CONFIG = {
  // Where the resource list lives
  dataUrl: "/data/resources.json",

  // Public path of this page, used when building share links and QR codes
  basePath: "/",

  // Link back to your portfolio
  portfolioUrl: "https://shekharjha.tech",

  // Shown in the footer
  notice: "Free for personal study. If you share these, please credit Shekhar Kumar Jha.",

  // "Report an error" opens an email to this address. CHANGE THIS to your own.
  // Google Analytics 4 measurement ID (public). Leave "" to switch visitor statistics off.
  analyticsId: "G-6XLM3D1V87",

  reportEmail: "jhakumarshekhar11@gmail.com",

  // Badges
  newDays: 30,          // "New" if added within this many days
  // Download tiers, lowest first. A paper shows ONE badge: the highest tier it has reached by downloads, or the
  // tier set on it in the admin page (whichever is higher). "id" is stored in resources.json, "min" is the download
  // count, "color" tints the badge and "note" is the tooltip. "code": true gives a code-style badge. Keep ids short and without spaces.
  tiers: [
    { id: "null", name: "The Null Pointer", min: 5, color: "#7A869A", note: "You have to start somewhere, even if it points to nothing yet." },
    { id: "litmus", name: "Litmus Amateur", min: 10, color: "#E15B64", note: "Just testing the waters to see if you turn red or blue." },
    { id: "vernier", name: "Vernier Caliper", min: 15, color: "#84BA5B", note: "Getting precise with your measurements." },
    { id: "latent", name: "Latent Heat", min: 20, color: "#F4A261", note: "The energy is building up inside, even if it's not showing as a temperature change yet." },
    { id: "nested", name: "Nested Loop", min: 25, color: "#4EA8DE", note: "You are officially stuck in a deep, repetitive study cycle." },
    { id: "aqua", name: "Aqua Regia", min: 30, color: "#E76F51", note: "Highly concentrated and strong enough to dissolve the toughest problems." },
    { id: "tir", name: "Total Internal Reflection", min: 35, color: "#00F5D4", note: "Brilliant, sharp, and keeping 100% of the knowledge trapped inside your brain." },
    { id: "overload", name: "Overloaded Method", min: 40, color: "#9B5DE5", note: "You have so much capacity, you can handle multiple parameters at once." },
    { id: "decay", name: "Radioactive Decay", min: 45, color: "#CCFF00", note: "You are breaking down massive syllabus chunks at an unstoppable half-life speed." },
    { id: "centum", name: "System.out.println(\"Centum\");", min: 50, color: "#39FF14", note: "The ultimate execution command that prints a perfect 100 on your report card.", code: true },
    { id: "catalyst", name: "The Catalyst", min: 75, color: "#FF007F", note: "Your study speed has just increased exponentially without you even burning out." },
    { id: "superclass", name: "Superclass Centum", min: 100, color: "#FFD700", note: "The ultimate parent class from which all top-tier ICSE marks are inherited." },
    { id: "escape", name: "Escape Velocity", min: 125, color: "#00B4D8", note: "You have officially broken free from the gravitational pull of the standard syllabus." },
    { id: "gc", name: "Garbage Collector", min: 150, color: "#4A4E69", note: "You move through the most complex, cluttered past-year papers and effortlessly clear them out." },
    { id: "steam", name: "Superheated Steam", min: 175, color: "#E0FAFF", note: "Carrying a massive amount of latent thermal energy, you are ready to power through any board exam." },
    { id: "loop", name: "while(true) { Centum(); }", min: 200, color: "#FF3131", note: "An infinite loop of absolute academic perfection that can never be stopped.", code: true }
  ],

  // Download counter. Counts are kept in your Firebase project (Cloud Firestore)
  // (collection "downloads", one document per paper), see assets/js/counter.js and the rules in README. Counts in resources.json are
  // used as the starting value, and live clicks are added on top. If Firebase is not set up or unreachable
  // the site still works and just shows the starting numbers. Set enabled to false to turn it off completely.
  counter: {
    enabled: true,
    collection: "downloads",   // one document per paper: downloads/<paper id> = { n: count }
    cacheMinutes: 10
  },

  // Order of subjects in the library when no filter is selected (use the subject ids from resources.json)
  subjectOrder: ["englishlang", "englishlit", "hindi", "history", "geography", "maths", "physics", "chemistry", "biology", "commercialstudies", "computer", "economics"],

  // Timed exam mode (the timer on papers)
  exam: {
    types: ["Previous Year Papers", "Specimen Papers", "Sample Papers"],   // resource types that get a timer
    minutes: { default: 120, maths: 180, hindi: 180 },   // writing time per subject id. Check the "Time allowed" printed on each paper
    readingMinutes: 15,                      // optional reading time before writing starts (0 to remove)
    schemeFromYear: 2025,                    // specimen papers from this year have the marking scheme at the end of the PDF
    noSchemeTypes: ["Previous Year Papers"],  // these types never have a marking scheme: nothing is scanned or hidden for them, on the site and in the admin
    schemeWords: ["marking scheme", "answer key", "marking guidelines"],  // a page whose opening text has one of these starts the scheme
    maxMarks: 80,                            // total marks to use when a paper does not state them: a number, or { default: 80, computer: 100 } by subject id. Students cannot change the total
    keepAwake: true,                         // keep the phone screen on while an exam runs
    beep: { src: "/assets/beep.mp3", default: true }   // played at the start, when writing begins and when time is up. Put the sound file at assets/beep.mp3
  },

  // Quick-search suggestions under the search bar
  quickSearches: ["Board paper","Specimen Paper", "Solutions", "2027","2026", "2025", "2024", "2023", "2022"],
};

// The tiers written above, kept untouched as a fallback. The admin page (Subjects and types tab) can save a
// custom tier list into resources.json ("tiers"); when present it replaces window.ICSE_CONFIG.tiers at load time
// (see applyTiers below), and this array is what "Reset to built-in tiers" in the admin restores.
window.ICSE_CONFIG.defaultTiers = window.ICSE_CONFIG.tiers;

// applyTiers(data): called once resources.json has loaded (by app.js and admin.js) to switch
// window.ICSE_CONFIG.tiers to the admin-edited list in data.tiers, or back to the built-in list if there isn't one.
window.ICSE_CONFIG.applyTiers = function (data) {
  var C = window.ICSE_CONFIG;
  C.tiers = (data && Array.isArray(data.tiers) && data.tiers.length) ? data.tiers : C.defaultTiers;
};

// tierOf(resource, downloadCount): the highest tier that applies, or null.
// resource.tier (set in the admin) is a minimum; the old "popular": true flag counts as the lowest tier.
window.ICSE_CONFIG.tierOf = function (r, n) {
  var C = window.ICSE_CONFIG, t = C.tiers || [], best = -1;
  var manual = r && (r.tier || (r.popular === true && t[0] ? t[0].id : ''));
  t.forEach(function (x, i) { if (x.id === manual || n >= x.min) best = Math.max(best, i); });
  return best < 0 ? null : t[best];
};

// tierBadge(tier): the badge HTML for a tier (name escaped, note as tooltip)
window.ICSE_CONFIG.tierBadge = function (t) {
  if (!t) return '';
  var e = function (x) { return String(x == null ? '' : x).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  return '<span class="badge pop tier' + (t.code ? ' code' : '') + ' t-' + e(t.id) + '" style="--tc:' + e(t.color || '#ffffff') + '" title="' + e(t.note || t.name) + '">' + e(t.name) + '</span>';
};