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
  oneTapClientId: "",  // Google One Tap: paste the Web client ID (Firebase console > Authentication > Sign-in method > Google > Web SDK configuration). Empty = One Tap off
  adminEmailHashes: ["ef6f25337bd32a4e3ffa6ca1b7a1d26bbde29db470b6652bf7200ef24e7987d4"],  // SHA-256 of the admin's Google email (lowercase). Signed in with that account = an "Admin" button appears. It only links to /admin, which still needs the GitHub token. Make a hash: in the browser console run  crypto.subtle.digest('SHA-256', new TextEncoder().encode('you@gmail.com')).then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,'0')).join('')))
  email: true,         // show email + password sign up and log in
  minPassword: 8,      // shortest password accepted on sign up (Firebase itself requires at least 6)
  maxProgress: 60,     // how many "continue reading" papers are remembered
  maxHistory: 200      // how many finished exams are kept
};
