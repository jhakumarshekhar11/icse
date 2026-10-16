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
  reportEmail: "jhakumarshekhar11@gmail.com",

  // Badges
  newDays: 30,          // "New" if added within this many days
  popularMin: 1000,     // "Popular" if downloads reach this number (or set "popular": true in the JSON)

  // Download counter. A static site has no database, so counts are kept by a
  // free hit-counter service (Abacus). Counts in resources.json are used as the
  // starting value, and live clicks are added on top. If the service is
  // unreachable the site still works and just shows the starting numbers.
  // Set enabled to false to turn it off completely.
  counter: {
    enabled: true,
    baseUrl: "https://abacus.jasoncameron.dev",
    namespace: "icse-shekharjha-tech",   // keep this unique to your site
    cacheMinutes: 10
  },

  // Order of subjects in the library when no filter is selected (use the subject ids from resources.json)
  subjectOrder: ["englishlang", "englishlit", "hindi", "history", "geography", "maths", "physics", "chemistry", "biology", "commercialstudies", "computer", "economics"],

  // Timed exam mode (the timer on papers)
  exam: {
    types: ["Previous Year Papers", "Specimen Papers", "Sample Papers"],   // resource types that get a timer
    minutes: { default: 120, maths: 150 },   // writing time per subject id. Check the "Time allowed" printed on each paper
    readingMinutes: 15,                      // optional reading time before writing starts (0 to remove)
    schemeFromYear: 2025                     // specimen papers from this year have the marking scheme at the end of the PDF
  },

  // Quick-search suggestions under the search bar
  quickSearches: ["Board paper","Specimen Paper", "Solutions", "2027","2026", "2025", "2024", "2023", "2022"],
};
