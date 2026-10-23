// Runs before the SEO build on Render. If the FIREBASE_* environment variables are set, it fills the
// values into assets/js/firebase-config.js in the deployed copy, so the keys never need to be committed.
// Without them it does nothing and the committed file is used as it is.
//   FIREBASE_API_KEY, FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID, FIREBASE_APP_ID
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'assets', 'js', 'firebase-config.js');
const map = { apiKey: 'FIREBASE_API_KEY', authDomain: 'FIREBASE_AUTH_DOMAIN', projectId: 'FIREBASE_PROJECT_ID', appId: 'FIREBASE_APP_ID' };
const set = Object.entries(map).filter(([, env]) => process.env[env]);
if (!set.length) { console.log('write-firebase-config: no FIREBASE_* variables set, keeping the committed file'); process.exit(0); }
let s = fs.readFileSync(file, 'utf8');
for (const [key, env] of set) {
  const re = new RegExp('(\\b' + key + ':\\s*)"[^"]*"');
  if (!re.test(s)) throw new Error('firebase-config.js: could not find ' + key);
  s = s.replace(re, (m, pre) => pre + JSON.stringify(process.env[env].trim()));
}
fs.writeFileSync(file, s);
console.log('write-firebase-config: filled ' + set.map(([k]) => k).join(', '));
