// Pulls the live packages (public fields only) from Airtable into data.json.
// Run from the "Sync packages from Airtable" button in the Actions tab.
// Needs repo secret AIRTABLE_TOKEN (data.records:read on the Custom Orders base).
// Only package names, prices, tiers and flower counts are written here. No costs or formulas.
import {readFile, writeFile} from 'node:fs/promises';

const BASE = 'app93rZTtyXYVWYJr', PACKAGES = 'tblDlhafaXaGHWsmu';
const F = {live: 'fldDmax0tpPOgWcEb', name: 'fldfqTPF2rjvxyQfw', price: 'fldX8iYQU6OeZBohX', suitableFor: 'fldKW8qBqHmru1bzt',
  statement: 'fldTfHH1WsWRCIiIN', supporting: 'fldWYbNyoRVT0R0Vy', greenery: 'fldvFgKRSlRCPuSFX', tiers: 'fldIbdNHVSMBM6Mlk'};
const token = process.env.AIRTABLE_TOKEN;
if (!token) { console.error('Set AIRTABLE_TOKEN'); process.exit(1); }

async function all(byId) {
  const out = []; let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${PACKAGES}`);
    if (byId) u.searchParams.set('returnFieldsByFieldId', 'true');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, {headers: {Authorization: `Bearer ${token}`}});
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = await r.json(); out.push(...j.records); offset = j.offset;
  } while (offset);
  return out;
}

// Optional "Website Description" field, read by name (customer-facing blurb; falls back to Suitable For)
const desc = Object.fromEntries((await all(false)).map(r => [r.id, r.fields['Website Description'] || '']));
const packages = (await all(true)).filter(r => r.fields[F.live]).map(r => ({
  name: r.fields[F.name],
  price: r.fields[F.price] || 0,
  tiers: (r.fields[F.tiers] || []).map(o => parseInt(String(o.name || o).match(/\d+/)?.[0])).filter(Boolean).sort((a, b) => a - b),
  suitableFor: r.fields[F.suitableFor] || '',
  ...(String(desc[r.id]).trim() ? {description: String(desc[r.id]).trim()} : {}),
  statement: r.fields[F.statement] || '',
  supporting: r.fields[F.supporting] || '',
  greenery: r.fields[F.greenery] || '',
})).filter(p => p.name).sort((a, b) => a.price - b.price);

const data = JSON.parse(await readFile('data.json', 'utf8'));   // keeps every other setting
data.packages = packages;
await writeFile('data.json', JSON.stringify(data, null, 1) + '\n');
console.log(`Synced ${packages.length} live packages`);
