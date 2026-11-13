// Pulls the live packages (public fields only) from Airtable into data.json.
// Run from the "Sync packages from Airtable" button in the Actions tab.
// Needs repo secret AIRTABLE_TOKEN (data.records:read on the Custom Orders base).
// Only package names, prices, tiers, flower counts, guide lines (Best for, Vibe, Fits) and tags are written here. No costs or formulas.
import {readFile, writeFile} from 'node:fs/promises';

const BASE = 'app93rZTtyXYVWYJr', PACKAGES = 'tblDlhafaXaGHWsmu';
const F = {live: 'fldDmax0tpPOgWcEb', name: 'fldfqTPF2rjvxyQfw', price: 'fldX8iYQU6OeZBohX', suitableFor: 'fldKW8qBqHmru1bzt',
  statement: 'fldTfHH1WsWRCIiIN', supporting: 'fldWYbNyoRVT0R0Vy', greenery: 'fldvFgKRSlRCPuSFX', tiers: 'fldIbdNHVSMBM6Mlk',
  guide: 'fldgq5IO10gegAWF7',   // packages guide text: "Best for: ..." and "Vibe: ..." lines are shown in the estimator
  tags: 'fld1KvvTsirU2mIRM'};   // Estimator Tags (Budget Friendly, Venue Preferred, ...)
const guideLine = (txt, label) => (String(txt || '').split('\n').find(l => l.toLowerCase().startsWith(label.toLowerCase() + ':')) || '').split(':').slice(1).join(':').trim();
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
  id: r.id,
  name: r.fields[F.name],
  price: r.fields[F.price] || 0,
  tiers: (r.fields[F.tiers] || []).map(o => parseInt(String(o.name || o).match(/\d+/)?.[0])).filter(Boolean).sort((a, b) => a - b),
  suitableFor: r.fields[F.suitableFor] || '',
  ...(String(desc[r.id]).trim() ? {description: String(desc[r.id]).trim()} : {}),
  statement: r.fields[F.statement] || '',
  supporting: r.fields[F.supporting] || '',
  greenery: r.fields[F.greenery] || '',
  ...(guideLine(r.fields[F.guide], 'Best for') ? {bestFor: guideLine(r.fields[F.guide], 'Best for')} : {}),
  ...(guideLine(r.fields[F.guide], 'Vibe') ? {vibe: guideLine(r.fields[F.guide], 'Vibe')} : {}),
  ...(guideLine(r.fields[F.guide], 'Fits') ? {fits: guideLine(r.fields[F.guide], 'Fits').split(';').map(x => x.trim()).filter(Boolean)} : {}),
  tags: (r.fields[F.tags] || []).map(o => o.name || o),
})).filter(p => p.name).sort((a, b) => a.price - b.price);

// Premier / Luxe flower names (Product Pricing > "Premium Tier"), shown so visitors know what those add-ons mean.
// Names only: "Peony - large / closed" -> "peony (closed)", sizes dropped, duplicates merged.
const PRODUCTS = 'tblHUWmGBawkMuNwF';
async function productsByName() {
  const out = []; let offset;
  do {
    const u = new URL(`https://api.airtable.com/v0/${BASE}/${PRODUCTS}`);
    ['fldSPe33SoxtawPsm', 'fldDFjVlJw9WvdBMi'].forEach(f => u.searchParams.append('fields[]', f));   // name, Premium Tier
    u.searchParams.set('returnFieldsByFieldId', 'true');
    if (offset) u.searchParams.set('offset', offset);
    const r = await fetch(u, {headers: {Authorization: `Bearer ${token}`}});
    if (!r.ok) { console.log('Flower tiers not synced:', r.status); return null; }
    const j = await r.json(); out.push(...j.records); offset = j.offset;
  } while (offset);
  return out;
}
const cleanFlower = n => { const [base, ...rest] = String(n).split(' - '); const q = rest.join(' ').split('/').map(x => x.trim().toLowerCase()).filter(x => x && !/^(x?small|medium|large|mini)$/.test(x));
  return base.trim().toLowerCase() + (q.length ? ` (${q.join(', ')})` : ''); };
const prods = await productsByName();
const flowerTiers = prods && {Premium: [], Luxe: []};
for (const r of prods || []) { const tier = r.fields.fldDFjVlJw9WvdBMi?.name || r.fields.fldDFjVlJw9WvdBMi, name = r.fields.fldSPe33SoxtawPsm; if (flowerTiers[tier] && name) { const n = cleanFlower(name); if (!flowerTiers[tier].includes(n)) flowerTiers[tier].push(n); } }

const data = JSON.parse(await readFile('data.json', 'utf8'));   // keeps every other setting
data.packages = packages;
if (flowerTiers && (flowerTiers.Premium.length || flowerTiers.Luxe.length)) data.flowerTiers = flowerTiers;
await writeFile('data.json', JSON.stringify(data, null, 1) + '\n');
console.log(`Synced ${packages.length} live packages`);
