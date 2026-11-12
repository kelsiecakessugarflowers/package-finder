const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// style: null = not chosen yet, '' = "Not sure yet"
const st = {role: '', date: '', size: '', style: null, budget: '', pkg: ''};
let dateTouched = false;   // the date starts on a suggested Saturday; it has to be confirmed before sending an inquiry
let D, T, direct = false, tsToken = '', view = 'estimate';
const photos = [];
let resaleFile = null;   // {name, type, data}
const US_STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');   // {name, type, data (base64), url (preview)}
// Copy lives in data.json "copy"; {placeholders} are filled here
const t = (k, vars = {}) => String(T[k] ?? '').replace(/\{(\w+)\}/g, (_, v) => vars[v] ?? '');

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
function aim(txt, noun) {
  const s = String(txt || '');
  if (/dozens/i.test(s)) return 'Dozens of ' + noun;
  const m = s.match(/(\d+)\s*[-–]\s*(\d+)/), one = s.match(/(\d+)/);
  if (m) return +m[1] === 0 ? 'Up to ' + m[2] + ' ' + (+m[2] === 1 ? noun.replace(/s$/, '') : noun) : m[1] + '-' + m[2] + ' ' + noun;
  if (one) return (s.trim().startsWith('~') ? 'About ' : '') + one[1] + ' ' + noun;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderStatic() {
  document.querySelectorAll('[id^="t-"]').forEach(el => { el.textContent = t(el.id.slice(2)); });
  document.title = `${t('title')} | ${t('brand')}`;
  const opts = (list, val = x => x, lbl = x => x) => `<option value="">${esc(t('choose'))}</option>` + list.map(x => `<option value="${esc(val(x))}">${esc(lbl(x))}</option>`).join('');
  $('#role').innerHTML = opts(D.roles, r => r.key, r => r.label);
  $('#size').innerHTML = opts(D.tierOptions);
  $('#styleDlgTitle').textContent = t('labelStyle');
  $('#dateErr').textContent = t('confirmDate');
  $('#tiles').innerHTML = D.styles.map(x => `<button type="button" class="tile" data-style="${esc(x)}"><img src="photos/${slug(x)}.jpg" alt="" loading="lazy"><span>${esc(x)}</span></button>`).join('')
    + `<button type="button" class="tile" data-style=""><div class="none">?</div><span>${esc(t('styleNotSure'))}</span></button>`;
  $('#budget').innerHTML = opts(D.budgets);
  $('#referral').innerHTML = opts(D.inquiry.referralOptions);
  $('#bizState').innerHTML = opts([...US_STATES, t('outsideUS')]);
  $('#photosHint').textContent = t('photosHint', {max: D.inquiry.maxPhotos});
  // Footer: logo, copyright and legal links on the full page; none of it inside an embed (the header logo is enough there)
  if (!framed) $('#footer').innerHTML = `<img src="logo-alt.svg" alt="Sugar Flowers by Kelsie Cakes">© ${new Date().getFullYear()} ${esc(D.legal.owner)} · <a href="${esc(D.legal.termsUrl)}" target="_top">${esc(t('footerTerms'))}</a> · <a href="${esc(D.legal.privacyUrl)}" target="_top">${esc(t('footerPrivacy'))}</a>`;

}

function inquiryUrl(p) {
  const u = new URL(D.filloutUrl), here = new URLSearchParams(location.search);
  ['utm_source', 'ck_subscriber_id', 'first_name', 'last_name', 'email', 'phone'].forEach(k => { if (here.get(k)) u.searchParams.set(k, here.get(k)); });
  const set = {client_type: role()?.clientType, event_date: dateTouched ? st.date : '', tiers: st.size, style: st.style,
    budget: st.budget, package: p?.name, estimate: p ? priceFor(p) : '', source: 'estimator'};
  for (const [k, v] of Object.entries(set)) if (v !== '' && v != null) u.searchParams.set(k, v);
  return u.toString();
}

// Top of the chosen budget range: "Under $350" -> 350, "$500-$1,000" -> 1000, "$2,500+" -> none, "Not sure yet" -> none
function budgetMax() {
  const b = st.budget || '', n = x => +x.replace(/,/g, '');
  let m = b.match(/under \$([\d,]+)/i); if (m) return n(m[1]);
  m = b.match(/\$[\d,]+\s*-\s*\$([\d,]+)/); if (m) return n(m[1]);
  return null;
}

function render() {
  $('#styleBtn').innerHTML = st.style ? `<img src="photos/${slug(st.style)}.jpg" alt=""><span>${esc(st.style)}</span><span class="chev">▾</span>`
    : `<span${st.style === null ? ' style="color:var(--muted)"' : ''}>${esc(st.style === null ? t('choose') : t('styleNotSure'))}</span><span class="chev">▾</span>`;
  document.querySelectorAll('.tile').forEach(b => b.classList.toggle('on', st.style !== null && b.dataset.style === st.style));

  const el = $('#estimate'), cta = $('#barCta'), bar = $('#barPrice'), shop = shopReason(), n = daysUntil();
  const f = fits(), sug = st.size && st.style !== null ? suggested() : null, p = sug && (f.find(x => x.name === st.pkg) || sug);
  const notes = [];
  if (shop) notes.push(`<p class="note shop">${esc(t(shop === 'date' ? 'shopDate' : 'shopBudget'))}<br><a target="_top" href="${esc(D.shopUrl)}" data-cta="shop">${esc(t('barShop'))}</a></p>`);
  else if (n !== null && n >= 0 && n < D.leadTime.minimumWeeks * 7) notes.push(`<p class="note">${esc(t('noteShort', {minWeeks: D.leadTime.minimumWeeks}))}</p>`);
  else if (n !== null && n >= 0 && n < D.leadTime.rushWeeks * 7) notes.push(`<p class="note">${esc(t('noteRush', {rushWeeks: D.leadTime.rushWeeks}))}</p>`);

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
    el.innerHTML = `
      <span class="tag ${p === sug ? 'star' : 'sel'}">${esc(t(p === sug ? 'tagRecommended' : 'tagSelected'))}</span>${isPro() ? ` <span class="tag info">${esc(t('tagPro'))}</span>` : ''}
      <p class="pkgname">${esc(p.name)}</p>
      <p class="muted" style="margin:2px 0 0">${esc(t('forYour', {cake}))}</p>
      <p class="price">${esc(t('startingAt'))} ${money(priceFor(p))}</p>
      <ul class="inc">
        <li>${esc(aim(p.statement, t('unitStatement')))}</li>
        <li>${esc(aim(p.supporting, t('unitSupporting')))}</li>
        <li>${esc(aim(p.greenery, t('unitFiller')))}</li>
        <li>${esc(t('includeCustom'))}</li>
        <li>${esc(t('includeShipping'))}</li>
      </ul>
      ${others.length ? `<p class="sub">${esc(t(othersKey, {size: size1}))}</p>` + others.map(o => `<button type="button" class="pkg" data-pkg="${esc(o.name)}"><span>${esc(o.name)}</span><span>${esc(t('startingAt'))} ${money(priceFor(o))}</span></button>`).join('') : ''}
      ${notes.join('')}
      <p class="note">${esc(t('noteRetainer'))}</p>
      <p class="muted">${esc(t('noteFinal'))}</p>
      ${shop ? `<p class="muted"><a target="_top" href="${direct ? '#details' : esc(inquiryUrl(p))}" data-cta="inquiry_anyway">${esc(t('inquiryAnyway'))}</a></p>` : ''}`;
    bar.innerHTML = `<small>${esc(t('startingAt'))}</small>${money(priceFor(p))}<small>${esc(p.name)}${isPro() ? ' · ' + esc(t('tagPro')) : ''}</small>`;
  }
  if (!p && !shop) { cta.textContent = t('barCta'); cta.setAttribute('aria-disabled', 'true'); cta.href = '#'; delete cta.dataset.cta; return; }
  cta.removeAttribute('aria-disabled');
  if (shop) { cta.textContent = t('barShop'); cta.href = D.shopUrl; cta.dataset.cta = 'shop'; }
  else if (view === 'details') { cta.textContent = t('barSend'); cta.href = '#'; cta.dataset.cta = 'send'; }
  else { cta.textContent = t('barCta'); cta.href = direct ? '#' : inquiryUrl(p); cta.dataset.cta = 'inquiry'; }
}

let lastResult = '';
function trackResult() {
  const name = $('.pkgname')?.textContent || '', key = [name, shopReason(), isPro()].join('|');
  if (!name || key === lastResult) return; lastResult = key;
  const pkg = D.packages.find(x => x.name === name);
  track('estimator_result', {package: name, price: pkg ? priceFor(pkg) : '', route: shopReason() || 'inquiry', pricing: isPro() ? 'pro' : 'standard'});
}

document.addEventListener('change', e => {
  const id = e.target.id; if (!['role', 'date', 'size', 'budget'].includes(id)) return;
  st[id] = e.target.value;
  if (id === 'date') { dateTouched = true; $('#dateErr').hidden = true; }
  if (id === 'size' || id === 'style') st.pkg = '';
  if (id !== 'date') track('estimator_change', {field: id, value: st[id] || (id === 'style' && st.style === '' ? 'not sure' : '')});
  render(); trackResult();
});
document.addEventListener('click', e => {
  const tile = e.target.closest('.tile'), pkg = e.target.closest('.pkg'), link = e.target.closest('[data-cta]');
  if (e.target.closest('#styleBtn')) $('#styleDlg').showModal();
  if (e.target.id === 'styleClose' || e.target.id === 'styleDlg') $('#styleDlg').close();   // close button or tap outside
  if (tile) { st.style = tile.dataset.style; st.pkg = ''; $('#styleDlg').close(); $('#styleBtn').classList.remove('bad');
    track('estimator_change', {field: 'style', value: st.style || 'not sure'}); render(); trackResult(); }
  if (pkg) { st.pkg = pkg.dataset.pkg; track('estimator_change', {field: 'package', value: st.pkg}); render(); trackResult(); }
  if (link) track('estimator_cta', {action: link.dataset.cta});
  const action = link && link.dataset.cta;   // read once: going to the details page changes the button
  if (direct && ['inquiry', 'inquiry_anyway'].includes(action)) { e.preventDefault(); goDetails(); }
  else if (action === 'send') { e.preventDefault(); submitInquiry(); }
  if (e.target.id === 'editAnswers') history.back();
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
function loadTurnstile() {
  if (!D.inquiry.turnstileSiteKey) return;
  window.onTurnstileLoad = () => window.turnstile.render('#turnstile', {sitekey: D.inquiry.turnstileSiteKey, callback: tok => { tsToken = tok; }, 'expired-callback': () => { tsToken = ''; }});
  const sc = document.createElement('script'); sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad&render=explicit'; sc.async = true; document.head.appendChild(sc);
}
// ---- Second page: their answers at the top, then the details form ----
function showView(v) {
  view = v; $('#proFields').hidden = !isPro(); $('#viewEstimate').hidden = v !== 'estimate'; $('#viewDetails').hidden = v !== 'details';
  render(); window.scrollTo(0, 0);
}
function goDetails() {
  document.querySelectorAll('.bad').forEach(x => x.classList.remove('bad'));
  const need = [['role', !st.role], ['size', !st.size], ['date', !dateTouched]].filter(x => x[1]).map(x => x[0]);
  if (need.length) {
    need.forEach(k => $('#' + k).classList.add('bad'));
    $('#' + need[0]).scrollIntoView({behavior: 'smooth', block: 'center'});
    $('#dateErr').hidden = !need.includes('date');
    return;
  }
  renderSummary(); history.pushState({view: 'details'}, ''); showView('details');
  if (!window.__ts) { window.__ts = true; loadTurnstile(); }
  track('estimator_details_view');
}
// Opening or tapping the date field counts as confirming it, so a real date that matches the suggested Saturday still works
['focus', 'click'].forEach(ev => document.addEventListener(ev, e => { if (e.target.id === 'date' && !dateTouched) { dateTouched = true; $('#dateErr').hidden = true; e.target.classList.remove('bad'); } }, true));
addEventListener('popstate', () => { if (view === 'details') showView('estimate'); });
function renderSummary() {
  const name = $('.pkgname')?.textContent || '', pkg = D.packages.find(x => x.name === name);
  const dateLong = new Date(st.date + 'T12:00:00').toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric'});
  const rows = [
    ['sumRole', role()?.label], ['sumDate', dateLong], ['sumSize', st.size],
    ['sumStyle', st.style ? `<img src="photos/${slug(st.style)}.jpg" alt="">${esc(st.style)}` : esc(t('styleNotSure')), true],
    ['sumBudget', st.budget], ['sumPackage', pkg ? `${esc(pkg.name)} · ${esc(t('startingAt'))} ${money(priceFor(pkg))}${isPro() ? ' · ' + esc(t('tagPro')) : ''}` : '', true],
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
  if (D.inquiry.turnstileSiteKey && !tsToken) { err.textContent = t('missing'); err.hidden = false; $('#turnstile').scrollIntoView({behavior: 'smooth', block: 'center'}); return; }
  const name = $('.pkgname')?.textContent || '', pkg = D.packages.find(x => x.name === name), r = role();
  const cta = $('#barCta'); cta.textContent = t('sending'); cta.setAttribute('aria-disabled', 'true'); err.hidden = true;
  try {
    const res = await fetch('/api/inquiry', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({
      ...req, role: st.role, size: st.size, eventDate: st.date, pronouns: val('pronouns'), vision: val('vision'), style: st.style || '', budget: st.budget, palette: val('palette'),
      clientType: r.clientType, roleLabel: r.label, packageId: pkg?.id || '', packageName: name, estimate: pkg ? priceFor(pkg) : 0,
      utmSource: new URLSearchParams(location.search).get('utm_source') || '', allergen: true, smsConsent: $('#smsConsent').checked,
      ...(isPro() ? {bizLink: val('bizLink'), bizCity: val('bizCity'), bizState: val('bizState'),
        resale: val('bizState') === 'FL' ? (document.querySelector('[name=resale]:checked')?.value || '') : '',
        resaleFile: val('bizState') === 'FL' && document.querySelector('[name=resale]:checked')?.value === 'Yes' ? resaleFile : null} : {}), smsConsentText: t('smsConsent'), turnstile: tsToken,
      photos: photos.map(({name, type, data}) => ({name, type, data}))})});
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.ok) throw new Error(out.error || res.status);
    track('estimator_submit', {package: name, pricing: isPro() ? 'pro' : 'standard', photos: photos.length});
    $('main').innerHTML = `<section class="thanks"><h2>${esc(t('thanksHeading'))}</h2><p>${esc(t('thanksText'))}</p><p>${esc(t('thanksSignoff'))}</p></section>`;
    document.querySelector('.bar').remove(); document.body.style.paddingBottom = '0'; window.scrollTo(0, 0);
  } catch (e2) {
    err.textContent = t('sendError'); err.hidden = false; render();
    if (window.turnstile) { window.turnstile.reset(); tsToken = ''; }
  }
}

fetch('data.json').then(r => r.json()).then(d => {
  D = d; T = d.copy; loadGtm(d.gtmId);
  { const x = new Date(); x.setMonth(x.getMonth() + 3); x.setDate(x.getDate() + ((6 - x.getDay() + 7) % 7));
    st.date = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; }
  direct = d.inquiry.mode === 'direct' || new URLSearchParams(location.search).has('direct');
  renderStatic(); $('#date').value = st.date;

  // ?for=couple|family|baker|vendor preselects the role (links from emails, trade pages)
  const f = new URLSearchParams(location.search).get('for');
  if (D.roles.some(r => r.key === f)) { st.role = f; $('#role').value = f; }
  render(); track('estimator_view');
});
