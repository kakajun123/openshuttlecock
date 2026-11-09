// Checks that every language file has exactly the same shape as en.json.
// Usage: node tools/check-i18n.mjs            (all files)
//        node tools/check-i18n.mjs th hi      (only these)
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'src', 'i18n');
const base = JSON.parse(fs.readFileSync(path.join(dir, 'en.json'), 'utf8'));
// Values that must stay identical to English in every language.
const FIXED = [/^home\.sample\.rows\.\d+\.conf$/, /^dir$/];
// Names that must survive translation untouched wherever English has them.
const KEEP = ['Open Shuttlecock', 'SP x SPORT', 'CC BY 4.0', 'MIT', 'GitHub', 'Claude', 'Anthropic', 'hello@openshuttlecock.com', 'github.com/kakajun123/openshuttlecock', 'example.com'];

function compare(a, b, where, problems) {
  const kind = (v) => (Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v);
  if (kind(a) !== kind(b)) return problems.push(`${where}: expected ${kind(a)}, found ${kind(b)}`);
  if (kind(a) === 'array') {
    if (a.length !== b.length) problems.push(`${where}: expected ${a.length} items, found ${b.length}`);
    a.forEach((item, i) => i < b.length && compare(item, b[i], `${where}.${i}`, problems));
  } else if (kind(a) === 'object') {
    for (const key of Object.keys(a)) {
      if (!(key in b)) problems.push(`${where ? where + '.' : ''}${key}: missing`);
      else compare(a[key], b[key], `${where ? where + '.' : ''}${key}`, problems);
    }
    for (const key of Object.keys(b)) if (!(key in a)) problems.push(`${where ? where + '.' : ''}${key}: not in en.json`);
  } else if (kind(a) === 'string') {
    if (!b.trim()) problems.push(`${where}: empty`);
    if (FIXED.some((re) => re.test(where)) && a !== b) problems.push(`${where}: must stay "${a}"`);
    for (const name of KEEP) if (a.includes(name) && !b.includes(name)) problems.push(`${where}: lost "${name}"`);
  }
}

const wanted = process.argv.slice(2);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'en.json');
let failed = false;
for (const file of files) {
  const code = file.replace('.json', '');
  if (wanted.length && !wanted.includes(code)) continue;
  const problems = [];
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    compare(base, data, '', problems);
    if (data.lang !== code) problems.push(`lang: must be "${code}"`);
  } catch (error) {
    problems.push(`not valid JSON: ${error.message}`);
  }
  console.log(`${code}: ${problems.length ? problems.length + ' problem(s)' : 'ok'}`);
  problems.slice(0, 40).forEach((p) => console.log(`  ${p}`));
  if (problems.length) failed = true;
}
process.exit(failed ? 1 : 0);
