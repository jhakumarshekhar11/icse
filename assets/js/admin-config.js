// Admin settings. Only the admin page loads this file.
window.ADMIN_CONFIG = {
  owner: "jhakumarshekhar11",
  repo: "icse",
  branch: "website",

  // GitHub accounts allowed to use the admin page
  allowedUsers: ["jhakumarshekhar11"],

  // Where the site lives inside the repo. Leave "" if index.html is at the repo root.
  // If the site is in a sub-folder (for example "public"), put that folder name here.
  basePath: "",
  dataPath: "data/resources.json",
  pdfDir: "pdfs",

  maxPdfMB: 25,          // reject bigger files (GitHub's hard limit is 100 MB)
  idleMinutes: 30,       // automatic sign-out after this much inactivity
  commitPrefix: "[admin]", // marks commits made by this page (used by Undo)

  // Analytics tab (reads your Google Analytics 4 numbers). Both values are public identifiers, not secrets.
  // See "Analytics page" in README.md for the one-time Google setup.
  analytics: {
    propertyId: "560012443",   // GA4 property ID: numbers only, from Analytics > Admin > Property details
    clientId: "335003334337-tvbf6lqn5jgu6migq5ef7bafr4uf66j0.apps.googleusercontent.com"      // OAuth Web client ID from Google Cloud, ends in .apps.googleusercontent.com
  }
};
