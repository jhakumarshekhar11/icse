const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const { resources } = JSON.parse(fs.readFileSync(path.join(root, 'data/resources.json'), 'utf8'));
const seen = new Set(); let bad = 0;
for (const r of resources) {
  if (!fs.existsSync(path.join(root, r.file))) { console.log('MISSING FILE:', r.id, r.file); bad++; }
  if (seen.has(r.id)) { console.log('DUPLICATE ID:', r.id); bad++; }
  seen.add(r.id);
}
console.log(bad ? bad + ' problem(s)' : 'All ' + resources.length + ' files exist, no duplicate ids');
process.exit(bad ? 1 : 0);