// Firebase settings for accounts (sign up, log in, synced bookmarks, history and settings).
// Paste the values from Firebase console > Project settings > Your apps > Web app > "SDK setup and configuration".
// These keys are meant to be public (they only identify your project). What protects each student's data
// is firestore.rules, so publish that file too. See "Accounts and sync" in README.md.
//
// While apiKey is empty the site behaves exactly as before: no Log in button, everything stays in the browser.
window.ICSE_FIREBASE = {
  apiKey: "",
  authDomain: "",      // e.g. "your-project.firebaseapp.com"
  projectId: "",       // e.g. "your-project"
  appId: ""            // e.g. "1:1234567890:web:abcdef"
};

// Account options
window.ICSE_ACCOUNT = {
  google: true,        // show "Continue with Google"
  email: true,         // show email + password sign up and log in
  minPassword: 8,      // shortest password accepted on sign up (Firebase itself requires at least 6)
  maxProgress: 60,     // how many "continue reading" papers are remembered
  maxHistory: 200      // how many finished exams are kept
};
