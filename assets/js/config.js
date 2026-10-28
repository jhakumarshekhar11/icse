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
  popularMin: 1000,     // "Popular" if downloads reach this number (or set "popular": true in the JSON)

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
