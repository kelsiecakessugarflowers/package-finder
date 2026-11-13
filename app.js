const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// style: null = not chosen yet, '' = "Not sure yet"
const st = {role: '', eventType: '', date: '', size: '', style: null, budget: '', pkg: ''};
let dateTouched = false;   // true once they've picked a date (the field starts blank)
let D, T, direct = false, tsToken = '', view = 'cake';
// Pages: 'cake' (questions + email, which unlocks the estimate) -> 'details' (estimate, what's included, rest of the inquiry)
let leadEmail = '', leadToken = '', tsLeadToken = '';
const photos = [];
let resaleFile = null;   // {name, type, data}
const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');   // {name, type, data (base64), url (preview)}
// Copy lives in data.json "copy"; {placeholders} are filled here
// Copy lives in copy.json (edit it right in GitHub); {placeholders} are filled here.
// {event} / {Event} follow the occasion they pick: "wedding", "birthday", "holiday party" (or "event" until they choose).
const occasion = () => ({'': 'event', Other: 'event'})[st.eventType] ?? st.eventType.toLowerCase();
const t = (k, vars = {}) => { const ev = occasion(), all = {event: ev, Event: ev.charAt(0).toUpperCase() + ev.slice(1), ...vars};
  return String(T[k] ?? '').replace(/\{(\w+)\}/g, (_, v) => all[v] ?? ''); };
const priceText = n => t('priceFormat', {price: money(n)}) || money(n);
// "2-3" -> 2-3, "0-1" -> up to 1, "~15-20" -> about 15-20, "Dozens of..." -> dozens of, "4" -> 4; null when there's no number
function count(txt) {
  const x = String(txt || '');
  if (/dozens/i.test(x)) return {n: 'dozens of', s: 's'};
  const m = x.match(/(\d+)\s*[-–]\s*(\d+)/), one = x.match(/(\d+)/), about = x.trim().startsWith('~') ? 'about ' : '';
  if (m) return +m[1] === 0 ? {n: 'up to ' + m[2], s: +m[2] === 1 ? '' : 's'} : {n: about + m[1] + '-' + m[2], s: 's'};
  if (one) return {n: about + one[1], s: +one[1] === 1 ? '' : 's'};
  return null;
}
// "Premium sugar flower varieties such as ...": a few names, alternating Luxe and Premium, sizes/open-closed dropped.
// To hand-pick the names instead, list them in data.json "premiumExamples".
function premiumExamples(D, max = 6) {
  if (D.premiumExamples?.length) return D.premiumExamples.slice(0, max);
  const base = n => String(n).replace(/\s*\(.*\)\s*$/, ''), a = (D.flowerTiers?.Luxe || []).map(base), b = (D.flowerTiers?.Premium || []).map(base), out = [];
  for (let i = 0; out.length < max && i < Math.max(a.length, b.length); i++) [a[i], b[i]].forEach(n => { if (n && !out.includes(n) && out.length < max) out.push(n); });
  return out;
}
const countLine = (key, txt) => { const c = count(txt); return c ? t(key, c) : t(key + 'Text', {text: String(txt || '').trim()}); };

// ---- Analytics: anonymous events only (no names, emails or dates) ----
// Opened directly: pushed to this page's GTM. Inside a Showit iframe: posted to the parent page,
// where the quiz's gtm-iframe-bridge.js forwards them to the site's GTM.
const framed = window !== window.parent;
function track(event, data = {}) {
  const payload = {event, tool: 'price_estimator', ...data};
  if (framed) { try { parent.postMessage({type: 'quiz_analytics', ...payload}, '*'); } catch (e) {} }
  else { (window.dataLayer = window.dataLayer || []).push(payload); }
}
function loadGtm(id) {
  if (framed || !id) return;
  window.dataLayer = window.dataLayer || []; window.dataLayer.push({'gtm.start': Date.now(), event: 'gtm.js'});
  const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtm.js?id=' + id; document.head.appendChild(s);
}

const role = () => D.roles.find(r => r.key === st.role);
const isPro = () => role()?.group === 'pro';
const tiersNum = () => st.size ? parseInt(st.size) : 0;   // "6+ tiers" -> 6
const priceFor = p => isPro() ? Math.round(p.price * (1 - D.proDiscount) / D.proRoundTo) * D.proRoundTo : p.price;
const fits = () => D.packages.filter(p => (p.tiers || []).includes(tiersNum())).sort((a, b) => a.price - b.price);
function suggested() {
  const f = fits(); if (!f.length) return null;
  const lean = st.style ? (D.styleLean[st.style] ?? 0.5) : 0;   // "Not sure yet" starts at the smallest fit
  return f[Math.round(lean * (f.length - 1))];
}
function daysUntil() {
  if (!st.date) return null;
  const [y, m, d] = st.date.split('-').map(Number), today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}
// Why this visitor goes to the shop instead ('date' or 'budget'), or '' for a custom inquiry
function shopReason() {
  const n = daysUntil();
  if (n !== null && n >= 0 && n < D.leadTime.shopUnderDays) return 'date';
  if (st.budget === D.shopBudget) return 'budget';
  return '';
}

const applyCopy = () => document.querySelectorAll('[id^="t-"]').forEach(el => { el.textContent = t(el.id.slice(2)); });
function renderStatic() {
  applyCopy();
  document.title = `${t('title')} | ${t('brand')}`;
  const opts = (list, val = x => x, lbl = x => x) => `<option value="">${esc(t('choose'))}</option>` + list.map(x => `<option value="${esc(val(x))}">${esc(lbl(x))}</option>`).join('');
  $('#role').innerHTML = opts(D.roles, r => r.key, r => r.label);
  $('#size').innerHTML = opts(D.tierOptions);
  $('#styleDlgTitle').textContent = t('labelStyle');
  $('#dateErr').textContent = t('confirmDate');
  $('#tiles').innerHTML = D.styles.map(x => `<button type="button" class="tile" data-style="${esc(x)}"><img src="photos/${slug(x)}.jpg" alt="" loading="lazy"><span>${esc(x)}</span></button>`).join('')
    + `<button type="button" class="tile" data-style=""><img src="photos/not-sure-yet.jpg" alt="" loading="lazy"><span>${esc(t('styleNotSure'))}</span></button>`;
  $('#budget').innerHTML = opts(D.budgets);
  $('#referral').innerHTML = opts(D.inquiry.referralOptions);
  $('#eventType').innerHTML = opts(D.eventTypes);
  $('#eventOther').placeholder = t('eventOtherPlaceholder');
  $('#bizState').innerHTML = opts([...US_STATES, t('outsideUS')]);
  $('#photosHint').textContent = t('photosHint', {max: D.inquiry.maxPhotos});
  // What's included: the proposal's photo cards (data.json "included")
  const inc = D.included || {}, altOf = u => decodeURIComponent(u.split('/').pop()).replace(/^[0-9a-f]{20,}_/, '').replace(/\.\w+$/, '').replace(/[_-]+/g, ' ');
  const groups = [['includedExpect', inc.expect], ['includedAlways', inc.always]].filter(g => g[1]?.length);
  $('#includedBody').innerHTML = groups.map(([k, list]) => `${t(k) ? `<p class="sub">${esc(t(k))}</p>` : ''}<div class="gallery">${list.map(u => `<img src="${esc(u)}" alt="${esc(altOf(u))}" loading="lazy">`).join('')}</div>`).join('');
  $('#included').hidden = !groups.length;
  // Footer: logo, copyright and legal links on the full page; none of it inside an embed (the header logo is enough there)
  if (!framed) $('#footer').innerHTML = `<img src="logo-alt.svg" alt="Sugar Flowers by Kelsie Cakes">© ${new Date().getFullYear()} ${esc(D.legal.owner)} · <a href="${esc(D.legal.termsUrl)}" target="_top">${esc(t('footerTerms'))}</a> · <a href="${esc(D.legal.privacyUrl)}" target="_top">${esc(t('footerPrivacy'))}</a>`;

}

function inquiryUrl(p) {
  const u = new URL(D.filloutUrl), here = new URLSearchParams(location.search);
  ['utm_source', 'ck_subscriber_id', 'first_name', 'last_name', 'email', 'phone'].forEach(k => { if (here.get(k)) u.searchParams.set(k, here.get(k)); });
  if (leadEmail) u.searchParams.set('email', leadEmail);
  const set = {client_type: role()?.clientType, event_date: dateTouched ? st.date : '', tiers: st.size, style: st.style,
    budget: st.budget, package: p?.name, estimate: p ? priceFor(p) : '', source: 'estimator'};
  for (const [k, v] of Object.entries(set)) if (v !== '' && v != null) u.searchParams.set(k, v);
  return u.toString();
}

// Bottom of the chosen budget range: "$1,500-$2,500" -> 1500, "$2,500+" -> 2500, "Under $350" / "Not sure yet" -> none
function budgetMin() {
  const m = String(st.budget || '').match(/^\$([\d,]+)/); return m ? +m[1].replace(/,/g, '') : null;
}
// Top of the chosen budget range: "Under $350" -> 350, "$500-$1,000" -> 1000, "$2,500+" -> none, "Not sure yet" -> none
function budgetMax() {
  const b = st.budget || '', n = x => +x.replace(/,/g, '');
  let m = b.match(/under \$([\d,]+)/i); if (m) return n(m[1]);
  m = b.match(/\$[\d,]+\s*-\s*\$([\d,]+)/); if (m) return n(m[1]);
  return null;
}

function render() {
  applyCopy(); $('#dateErr').textContent = t('confirmDate');   // wording follows the occasion as they pick it
  $('#styleBtn').innerHTML = st.style !== null ? `<img src="photos/${st.style ? slug(st.style) : 'not-sure-yet'}.jpg" alt=""><span>${esc(st.style || t('styleNotSure'))}</span><span class="chev">▾</span>`
    : `<span style="color:var(--muted)">${esc(t('choose'))}</span><span class="chev">▾</span>`;
  document.querySelectorAll('.tile').forEach(b => b.classList.toggle('on', st.style !== null && b.dataset.style === st.style));

  const el = $('#estimate'), cta = $('#barCta'), bar = $('#barPrice'), shop = shopReason(), n = daysUntil();
  const f = fits(), sug = st.size && st.style !== null ? suggested() : null, p = sug && (f.find(x => x.name === st.pkg) || sug);
  const notes = [];
  if (shop) notes.push(`<p class="note shop">${esc(t(shop === 'date' ? 'shopDate' : 'shopBudget'))}<br><a target="_blank" rel="noopener" href="${esc(D.shopUrl)}" data-cta="shop">${esc(t('barShop'))}</a></p>`);
  else if (n !== null && n >= 0 && n < D.leadTime.minimumWeeks * 7) notes.push(`<p class="note">${esc(t('noteShort', {minWeeks: D.leadTime.minimumWeeks}))}</p>`);
  else if (n !== null && n >= 0 && n < D.leadTime.rushWeeks * 7) notes.push(`<p class="note">${esc(t('noteRush', {rushWeeks: D.leadTime.rushWeeks}))}</p>`);

  // Right under the date (phones would otherwise only see it after scrolling): a short version of the date note.
  // The full note stays at the bottom of the card and on the estimate.
  const shortWin = n !== null && n >= 0 && n < D.leadTime.minimumWeeks * 7, rushWin = n !== null && n >= 0 && n < D.leadTime.rushWeeks * 7;
  const dn = shop === 'date' && D.leadTime && n !== null && n < D.leadTime.shopUnderDays
    ? `<p class="note shop small">${esc(t('dateNoteShop'))} <a target="_blank" rel="noopener" href="${esc(D.shopUrl)}" data-cta="shop">${esc(t('barShop'))}</a></p>`
    : !shop && shortWin ? `<p class="note small">${esc(t('noteShort', {minWeeks: D.leadTime.minimumWeeks}))}</p>`
    : !shop && rushWin ? `<p class="note small">${esc(t('noteRush', {rushWeeks: D.leadTime.rushWeeks}))}</p>` : '';
  $('#dateNote').innerHTML = dn;
  // Bottom of the card: the full shop note (date or budget); short/rush notes already sit under the date
  $('#cakeNotes').innerHTML = shop ? notes.join('') : '';
  // Little notes under the questions; numbers come from the packages so they stay in step with Airtable
  const all = [...D.packages].sort((a, b) => a.price - b.price), cheapestFit = f[0];
  const hv = {minPrice: all.length ? money(priceFor(all[0])) : '', sizeMinPrice: cheapestFit ? money(priceFor(cheapestFit)) : '',
    minWeeks: D.leadTime.minimumWeeks, rushWeeks: D.leadTime.rushWeeks};
  ['Role', 'EventType', 'Date', 'Size', 'Style', 'Budget'].forEach(k => { $('#hint' + k).textContent = t('hint' + k, hv); });
  $('#retainerNote').textContent = t('noteRetainer');
  if (!$('#submitBtn').disabled) $('#submitBtn').textContent = t('barSend');   // a submit button at the end of the form too
  if (!$('#allPk1') && t('seeAllPackages')) $('#hintBudget').insertAdjacentHTML('afterend', `<a href="#" class="allpk" id="allPk1" data-act="packages">${esc(t('seeAllPackages'))}</a>`);

  if (!p) {
    el.innerHTML = `<p class="muted" style="margin:0">${esc(t('estimateEmpty'))}</p>` + notes.join('');
    bar.innerHTML = `<small style="white-space:normal">${esc(t('barEmpty'))}</small>`;
  } else {
    const size1 = st.size.replace(/s$/, '').replace(/^(\d) /, '$1-');   // "3 tiers" -> "3-tier", "6+ tiers" -> "6+ tier"
    const cake = `${size1} cake${st.style ? ' with a ' + ({Bundles: 'bundled'}[st.style] || st.style.toLowerCase()) + ' design' : ''}`;
    // If their budget is below this package, list the packages that fit the budget first and say so
    const cap = budgetMax(), overBudget = cap !== null && priceFor(p) > cap;
    const others = f.filter(x => x !== p).sort((a, b) => (overBudget ? (priceFor(a) > cap) - (priceFor(b) > cap) : 0) || a.price - b.price);
    const othersKey = overBudget && others.some(o => priceFor(o) <= cap) ? 'othersHeadingBudget' : 'othersHeading';
    const img = (D.packageImages || {})[p.name], price = priceFor(p);
    const tags = q => (q.tags || []).map(x => `<span class="tag soft">${esc(x)}</span>`).join(' ');
    // "Your design will include..." and add-ons: lines in data.json, some only for certain roles or prices
    const shows = x => (!x.onlyFor || x.onlyFor.includes(st.role)) && !(x.hideFor || []).includes(st.role) && !(x.over && price <= x.over);
    const line = x => ({includeStatement: () => countLine('includeStatement', p.statement), includeSupporting: () => countLine('includeSupporting', p.supporting),
      includeFiller: () => countLine('includeFiller', p.greenery)}[x.key] || (() => t(x.key)))();
    const incl = (D.includes || []).filter(shows).map(line).filter(Boolean), adds = (D.addons || []).filter(shows).map(line).filter(Boolean);
    const guide = [['guideBestFor', p.bestFor], ['guideVibe', p.vibe]].filter(g => g[1]);
    // Premier / Luxe flowers (Airtable "Premium Tier"), named so people know what they are
    const ex = premiumExamples(D), tierDetail = ex.length && t('premiumFlowers') ? [t('premiumFlowers', {flowers: ex.join(', ')})] : [];
    // A simple style with budget to spare: suggest premier/luxe blooms
    const bmin = budgetMin(), premiumNote = (D.premiumStyles || []).includes(st.style) && bmin !== null && bmin > price && tierDetail.length
      ? `<div class="note premium"><p>${esc(t('notePremiumFlowers', {style: st.style.toLowerCase()}))}</p>${tierDetail.map(x => `<p class="tierline">${esc(x)}</p>`).join('')}</div>` : '';
    el.innerHTML = `<div class="est">${img ? `<img class="pkgimg" src="${esc(img)}" alt="${esc(p.name)}">` : ''}<div>
      <span class="tag ${p === sug ? 'star' : 'sel'}">${esc(t(p === sug ? 'tagRecommended' : 'tagSelected'))}</span>${isPro() ? ` <span class="tag info">${esc(t('tagPro'))}</span>` : ''} ${tags(p)}
      <p class="pkgname">${esc(p.name)}</p>
      <p class="muted" style="margin:2px 0 0">${esc(t('forYour', {cake}))}</p>
      <p class="price">${esc(priceText(price))}</p></div></div>
      ${guide.length ? `<dl class="guide">${guide.map(([k, v]) => `<dt>${esc(t(k))}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      ${incl.length ? `<p class="sub">${esc(t('includes'))}</p><ul class="inc">${incl.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${adds.length ? `<p class="sub">${esc(t('addonsHeading'))}</p><ul class="inc addons">${(D.addons || []).filter(shows).map(x => `<li>${esc(line(x))}${x.key === 'addonLuxe' && tierDetail.length ? tierDetail.map(d => `<small class="tierline">${esc(d)}</small>`).join('') : ''}</li>`).join('')}</ul>` : ''}
      ${others.length ? `<p class="sub">${esc(t(othersKey, {size: size1}))}</p>` + others.map(o => { const oi = (D.packageImages || {})[o.name];
        return `<button type="button" class="pkg" data-pkg="${esc(o.name)}">${oi ? `<img src="${esc(oi)}" alt="">` : ''}<span class="pkgtxt"><b>${esc(o.name)}</b>${o === sug ? ` <span class="tag star">${esc(t('tagRecommended'))}</span>` : ''}${o.tags?.length ? ' ' + tags(o) : ''}${o.bestFor ? `<small>${esc(o.bestFor)}</small>` : ''}</span><span class="pkgprice">${esc(priceText(priceFor(o)))}</span></button>`; }).join('') : ''}
      ${t('seeAllPackages') ? `<a href="#" class="allpk" data-act="packages">${esc(t('seeAllPackages'))}</a>` : ''}
      ${notes.join('')}
      ${premiumNote}
      ${direct ? '' : `<p class="note">${esc(t('noteRetainer'))}</p>`}
      <p class="muted">${esc(t('noteFinal'))}</p>
      `;
    bar.innerHTML = `${esc(priceText(price))}<small>${esc(p.name)}</small>`;
  }
  // Shop route: a link to inquire anyway (it goes through the email page like everyone else)
  if (shop) $('#cakeNotes').insertAdjacentHTML('beforeend', `<p class="muted"><a href="#" data-cta="inquiry_anyway">${esc(t('inquiryAnyway'))}</a></p>`);
  cta.removeAttribute('aria-disabled'); cta.target = '_top'; cta.removeAttribute('rel');
  if (view === 'cake') {
    bar.innerHTML = !p && !shop ? `<small style="white-space:normal">${esc(t('barEmpty'))}</small>` : '';
    if (shop) { cta.textContent = t('barShop'); cta.href = D.shopUrl; cta.dataset.cta = 'shop'; cta.target = '_blank'; cta.rel = 'noopener'; }
    else { cta.textContent = t('barNext'); cta.href = '#'; cta.dataset.cta = 'next'; }
  } else if (!p) { cta.textContent = t('barCta'); cta.setAttribute('aria-disabled', 'true'); cta.href = '#'; delete cta.dataset.cta; }
  else if (direct) { cta.textContent = t('barSend'); cta.href = '#'; cta.dataset.cta = 'send'; }
  else { cta.textContent = t('barCta'); cta.href = inquiryUrl(p); cta.dataset.cta = 'inquiry'; }
  if (view === 'details') renderSummary();
}

let lastResult = '';
function trackResult() {
  const name = $('.pkgname')?.textContent || '', key = [name, shopReason(), isPro()].join('|');
  if (!name || key === lastResult) return; lastResult = key;
  const pkg = D.packages.find(x => x.name === name);
  track('estimator_result', {package: name, price: pkg ? priceFor(pkg) : '', route: shopReason() || 'inquiry', pricing: isPro() ? 'pro' : 'standard'});
}

document.addEventListener('change', e => {
  if (e.target.id === 'eventType') $('#eventOther').hidden = e.target.value !== 'Other';
  const id = e.target.id; if (!['role', 'eventType', 'date', 'size', 'budget'].includes(id)) return;
  st[id] = e.target.value;
  if (id === 'date') { dateTouched = !!st.date; $('#dateErr').hidden = true; }
  if (id === 'size' || id === 'style') st.pkg = '';
  if (id !== 'date') track('estimator_change', {field: id, value: st[id] || (id === 'style' && st.style === '' ? 'not sure' : '')});
  render(); trackResult();
});
document.addEventListener('click', e => {
  const tile = e.target.closest('.tile'), pkg = e.target.closest('.pkg'), link = e.target.closest('[data-cta]');
  if (e.target.closest('#styleBtn')) $('#styleDlg').showModal();
  if (e.target.closest('[data-act=packages]')) {   // the packages embed, without its own buttons (they'd leave this page)
    e.preventDefault(); const f = $('#pkgFrame'), src = 'packages.html?in=estimator' + (isPro() ? '&for=pro' : '');
    if (f.getAttribute('src') !== src) f.src = src;
    $('#pkgDlgTitle').textContent = t('embedHeading'); $('#pkgDlg').showModal(); track('estimator_packages_view');
  }
  if (e.target.id === 'pkgClose' || e.target.id === 'pkgDlg') $('#pkgDlg').close();
  if (e.target.id === 'styleClose' || e.target.id === 'styleDlg') $('#styleDlg').close();   // close button or tap outside
  if (tile) { st.style = tile.dataset.style; st.pkg = ''; $('#styleDlg').close(); $('#styleBtn').classList.remove('bad');
    track('estimator_change', {field: 'style', value: st.style || 'not sure'}); render(); trackResult(); }
  if (pkg) { st.pkg = pkg.dataset.pkg; track('estimator_change', {field: 'package', value: st.pkg}); render(); trackResult(); }
  if (link) track('estimator_cta', {action: link.dataset.cta});
  const action = link && link.dataset.cta;   // read once: going to the details page changes the button
  if (['next', 'inquiry_anyway'].includes(action)) { e.preventDefault(); goNext(); }
  else if (action === 'send') { e.preventDefault(); submitInquiry(); }
  if (e.target.id === 'editAnswers') go('cake');
  const rm = e.target.closest('[data-rm]'); if (rm) { photos.splice(+rm.dataset.rm, 1); renderThumbs(); }
});

// Clear a highlight as soon as the field is filled in
document.addEventListener('change', async e => {
  if (e.target.id === 'bizState') { $('#resaleBox').hidden = e.target.value !== 'FL'; }
  if (e.target.name === 'resale') { $('#resaleFileBox').hidden = e.target.value !== 'Yes'; document.querySelectorAll('[name=resale]').forEach(x => x.closest('.radios').classList.remove('bad')); }
  if (e.target.id === 'resaleFile' && e.target.files[0]) {
    const f = e.target.files[0];
    if (f.size > 5 * 1024 * 1024) { e.target.value = ''; resaleFile = null; return; }
    const r = new FileReader(); r.onload = () => { resaleFile = {name: f.name, type: f.type || 'application/pdf', data: String(r.result).split(',')[1]}; }; r.readAsDataURL(f);
  }
});
['input', 'change'].forEach(ev => document.addEventListener(ev, e => { e.target.classList?.remove('bad'); if (e.target.id === 'allergen') $('[data-f=allergen]').classList.remove('bad'); }));

// ---- Built-in inquiry form (inquiry.mode "direct", or ?direct=1 to preview) ----
const val = id => $('#' + id).value.trim();
function renderThumbs() {
  $('#thumbs').innerHTML = photos.map((p, i) => `<span><img src="${p.url}" alt=""><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></span>`).join('');
}
// Shrink photos in the browser (longest side 2000px, JPEG) so uploads stay small and fast
function readPhoto(file) {
  return new Promise(resolve => {
    const done = (blob, type, name) => { const r = new FileReader(); r.onload = () => resolve({name, type, data: String(r.result).split(',')[1], url: URL.createObjectURL(blob)}); r.readAsDataURL(blob); };
    const img = new Image(), src = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(b => done(b, 'image/jpeg', file.name.replace(/\.\w+$/, '') + '.jpg'), 'image/jpeg', 0.85);
    };
    img.onerror = () => done(file, file.type || 'image/jpeg', file.name);   // e.g. HEIC on browsers that can't preview it: send as is
    img.src = src;
  });
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'photos') return;
  for (const f of [...e.target.files]) { if (photos.length >= D.inquiry.maxPhotos) break; const p = await readPhoto(f); if (p.data.length * 0.75 <= 5 * 1024 * 1024) photos.push(p); }
  e.target.value = ''; renderThumbs();
});
// Turnstile spam check: on the first page (for the email), and on the last page only if saving the email failed
const tsWidgets = {}, tsQueue = []; let tsScriptAdded = false;
function loadTurnstile(sel, set) {
  if (!D.inquiry.turnstileSiteKey || tsWidgets[sel] !== undefined) return;
  tsWidgets[sel] = null;
  const draw = () => { tsWidgets[sel] = window.turnstile.render(sel, {sitekey: D.inquiry.turnstileSiteKey, callback: set, 'expired-callback': () => set('')}); };
  // (check .render: an element with id="turnstile" would also show up as window.turnstile)
  if (window.turnstile?.render) return draw();
  tsQueue.push(draw);
  if (tsScriptAdded) return; tsScriptAdded = true;
  window.onTurnstileLoad = () => tsQueue.splice(0).forEach(f => f());
  const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit'; sc.async = true; document.head.appendChild(sc);
}
const resetTurnstile = sel => { if (window.turnstile?.reset && tsWidgets[sel]) window.turnstile.reset(tsWidgets[sel]); };
// ---- Pages ----
function showView(v) {
  view = v; $('#proFields').hidden = !isPro();
  $('#viewEstimate').hidden = v !== 'cake'; $('#viewDetails').hidden = v !== 'details';
  $('#details').hidden = !direct;   // Fillout mode: the bar button opens the Fillout form instead
  render(); window.scrollTo(0, 0);
}
function go(v) { history.pushState({view: v}, ''); showView(v); }
// "See my estimate": check the questions and email, save the email, then show the estimate
function goNext() {
  document.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
  const email = $('#leadEmail').value.trim(), err = $('#leadErr'); err.hidden = true;
  const need = [['role', !st.role], ['eventType', !st.eventType], ['date', !dateTouched], ['size', !st.size], ['styleBtn', st.style === null],
    ['leadEmail', !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)]].filter(x => x[1]).map(x => x[0]);
  if (need.length) {
    need.forEach(k => $('#' + k).classList.add('bad'));
    $('#' + need[0]).scrollIntoView({behavior: 'smooth', block: 'center'});
    $('#dateErr').hidden = !need.includes('date');
    return;
  }
  if (email === leadEmail) return goDetails();   // came back to edit answers; email already saved
  if (D.inquiry.turnstileSiteKey && !tsLeadToken) { err.textContent = t('verifyHuman') || t('missing'); err.hidden = false; $('#tsLead').scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
  submitLead(email);
}
async function submitLead(email) {
  const err = $('#leadErr');
  const name = $('.pkgname')?.textContent || '', pkg = D.packages.find(x => x.name === name), cta = $('#barCta');
  cta.textContent = t('sending'); cta.setAttribute('aria-disabled', 'true');
  try {
    const res = await fetch('/api/lead', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      email, turnstile: tsLeadToken, clientType: role()?.clientType, eventType: st.eventType, eventOther: st.eventType === 'Other' ? val('eventOther') : '',
      eventDate: st.date, size: st.size, style: st.style || '', budget: st.budget, packageName: name, estimate: pkg ? priceFor(pkg) : 0,
      utmSource: new URLSearchParams(location.search).get('utm_source') || ''})});
    const out = await res.json().catch(() => ({}));
    if (res.status === 403) throw new Error('spam');
    leadToken = out.lead || '';   // if saving failed on our side, they still see the estimate; the last page asks for the spam check instead
  } catch (e) {
    if (String(e.message) === 'spam') { err.textContent = t('sendError'); err.hidden = false; resetTurnstile('#tsLead'); tsLeadToken = ''; render(); return; }
  }
  leadEmail = email; if (!val('email') || val('email') === leadEmail) $('#email').value = email;
  track('estimator_lead');
  goDetails();
}
function goDetails() {
  go('details');
  if (direct && !leadToken) loadTurnstile('#tsInquiry', tok => { tsToken = tok; });
  track('estimator_details_view');
}
// Opening or tapping the date field counts as confirming it, so a real date that matches the suggested Saturday still works
addEventListener('popstate', e => { const v = e.state?.view || 'cake'; showView(v === 'details' && !leadEmail ? 'cake' : v); });
function renderSummary() {
  const name = $('.pkgname')?.textContent || '', pkg = D.packages.find(x => x.name === name);
  const dateLong = new Date(st.date + 'T12:00:00').toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});
  const rows = [
    ['sumRole', role()?.label], ['sumEvent', st.eventType === 'Other' ? val('eventOther') || 'Other' : st.eventType], ['sumDate', dateLong], ['sumSize', st.size],
    ['sumStyle', `<img src="photos/${st.style ? slug(st.style) : 'not-sure-yet'}.jpg" alt="">${esc(st.style || t('styleNotSure'))}`, true],
    ['sumBudget', st.budget], ['sumPackage', pkg ? `${esc(pkg.name)} · ${esc(priceText(priceFor(pkg)))}${isPro() ? ' · ' + esc(t('tagPro')) : ''}` : '', true],
  ].filter(r => r[1]);
  $('#summary').innerHTML = rows.map(([k, v, html]) => `<dt>${esc(t(k))}</dt><dd>${html ? v : esc(v)}</dd>`).join('');
  $('#editAnswers').textContent = t('editAnswers');
}

async function submitInquiry() {
  const req = {first: val('first'), last: val('last'), email: val('email'), phone: val('phone'), referral: val('referral')};
  const bad = Object.keys(req).filter(k => !req[k]);
  if (req.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.email)) bad.push('email');
  document.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
  bad.forEach(k => $('#' + k).classList.add('bad'));
  if (!$('#allergen').checked) { bad.push('allergen'); $('[data-f=allergen]').classList.add('bad'); }
  if (isPro()) {
    ['bizCity', 'bizState'].forEach(k => { if (!val(k)) { bad.push(k); $('#' + k).classList.add('bad'); } });
    if (val('bizState') === 'FL' && !document.querySelector('[name=resale]:checked')) { bad.push('resale'); $('.radios').classList.add('bad'); }
  }
  const err = $('#formErr');
  if (bad.length) { err.textContent = t('missing'); err.hidden = false; (document.querySelector('.bad') || $('#details')).scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
  if (D.inquiry.turnstileSiteKey && !leadToken && !tsToken) { err.textContent = t('verifyHuman') || t('missing'); err.hidden = false; $('#tsInquiry').scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
  const name = $('.pkgname')?.textContent || '', pkg = D.packages.find(x => x.name === name), r = role();
  const cta = $('#barCta'); cta.textContent = t('sending'); cta.setAttribute('aria-disabled', 'true'); err.hidden = true;
  const sb = $('#submitBtn'); sb.textContent = t('sending'); sb.disabled = true;
  try {
    const res = await fetch('/api/inquiry', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      ...req, role: st.role, eventType: st.eventType, eventOther: st.eventType === 'Other' ? val('eventOther') : '', size: st.size, eventDate: st.date, pronouns: val('pronouns'), vision: val('vision'), style: st.style || '', budget: st.budget, palette: val('palette'),
      clientType: r.clientType, roleLabel: r.label, packageId: pkg?.id || '', packageName: name, estimate: pkg ? priceFor(pkg) : 0,
      utmSource: new URLSearchParams(location.search).get('utm_source') || '', allergen: true, lead: leadToken,
      ...(isPro() ? {bizLink: val('bizLink'), bizCity: val('bizCity'), bizState: val('bizState'),
        resale: val('bizState') === 'FL' ? (document.querySelector('[name=resale]:checked')?.value || '') : '',
        resaleFile: val('bizState') === 'FL' && document.querySelector('[name=resale]:checked')?.value === 'Yes' ? resaleFile : null} : {}), turnstile: tsToken,
      photos: photos.map(({name, type, data}) => ({name, type, data}))})});
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || res.status);
    track('estimator_submit', {package: name, pricing: isPro() ? 'pro' : 'standard', photos: photos.length});
    // Your thank-you page on kelsiecakes.com (data.json "thanksUrl"); the built-in message shows if it can't open
    if (D.thanksUrl) { try { (framed ? window.top : window).location.href = D.thanksUrl; } catch (e2) { try { window.open(D.thanksUrl, '_top'); } catch (e3) {} } }
    $('main').innerHTML = `<section class="thanks"><h2>${esc(t('thanksHeading'))}</h2><p>${esc(t('thanksText'))}</p><p>${esc(t('thanksSignoff'))}</p></section>`;
    document.querySelector('.bar').remove(); document.body.style.paddingBottom = '0'; window.scrollTo(0, 0);
  } catch (e2) {
    err.textContent = t('sendError'); err.hidden = false; render(); sb.textContent = t('barSend'); sb.disabled = false;
    resetTurnstile('#tsInquiry'); tsToken = '';
  }
}

Promise.all(['data.json', 'copy.json'].map(f => fetch(f).then(r => r.json()))).then(([d, copy]) => {
  D = d; T = copy; loadGtm(d.gtmId);
  { const x = new Date(); $('#date').min = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  direct = d.inquiry.mode === 'direct' || new URLSearchParams(location.search).has('direct');
  renderStatic();

  // ?for=couple|family|baker|vendor preselects the role (links from emails, trade pages)
  const f = new URLSearchParams(location.search).get('for');
  if (D.roles.some(r => r.key === f)) { st.role = f; $('#role').value = f; }
  // The quiz (and any link) can also fill in the occasion and budget: ?occasion=Wedding&budget=$500-$1,000
  const q = new URLSearchParams(location.search), occ = q.get('occasion'), bud = q.get('budget');
  if (D.eventTypes.includes(occ)) { st.eventType = occ; $('#eventType').value = occ; }
  if (D.budgets.includes(bud)) { st.budget = bud; $('#budget').value = bud; }
  history.replaceState({view: 'cake'}, ''); showView('cake'); track('estimator_view');
  loadTurnstile('#tsLead', tok => { tsLeadToken = tok; });
});
