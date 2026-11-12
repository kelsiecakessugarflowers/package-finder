// Pulls Kelsie's wording from the "Price Estimator Copy" Google Sheet into data.json → copy.
// Run from the "Sync copy from Google Sheet" button in the Actions tab.
// Needs the sheet published as CSV (File > Share > Publish to web > Sheet1 > CSV); that link goes in data.json "copySheetCsvUrl".
// Only rows with something in "Your text" are used; a blank "Your text" keeps the current wording.
// Rows: copy keys (title, intro...), role.<key>.label, and budgets ("A | B | C").
import {readFile, writeFile} from 'node:fs/promises';

const data = JSON.parse(await readFile('data.json', 'utf8'));
const url = process.env.COPY_CSV_URL || data.copySheetCsvUrl;
if (!url) { console.error('Add the published CSV link to data.json "copySheetCsvUrl"'); process.exit(1); }
const res = await fetch(url);
if (!res.ok) throw new Error(`Sheet: ${res.status}`);

// Small CSV parser (handles quotes, commas and line breaks inside cells)
function parse(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const rows = parse(await res.text());
const head = rows[0].map(h => h.trim().toLowerCase());
const K = head.findIndex(h => h.startsWith('key')), Y = head.indexOf('your text');
let changed = 0;
for (const r of rows.slice(1)) {
  const key = (r[K] || '').trim(), text = (r[Y] || '').trim();
  if (!key || !text || key.startsWith('(')) continue;
  const role = key.match(/^role\.(\w+)\.label$/);
  if (role) { const x = data.roles.find(o => o.key === role[1]); if (x && x.label !== text) { x.label = text; changed++; } }
  else if (key === 'budgets') { const list = text.split('|').map(s => s.trim()).filter(Boolean); if (JSON.stringify(list) !== JSON.stringify(data.budgets)) { data.budgets = list; changed++; } }
  else if (data.copy[key] !== text) { data.copy[key] = text; changed++; }
}
await writeFile('data.json', JSON.stringify(data, null, 1) + '\n');
console.log(`Updated ${changed} line(s) of copy`);
