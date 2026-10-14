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

  // Quick-search suggestions under the search bar
  quickSearches: ["Board paper","Specimen Paper" , "Formula sheet", "Solutions", "2027","2026", "2025", "2024", "2023", "2022"],
};
