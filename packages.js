const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => '$' + Math.round(n).toLocaleString('en-US');
// Same wording rules as the finder, so both pages describe packages identically
function aim(t, noun) {
  const s = String(t || '');
  if (/dozens/i.test(s)) return 'Dozens of ' + noun;
  const m = s.match(/(\d+)\s*[-–]\s*(\d+)/), one = s.match(/(\d+)/);
  if (m) return +m[1] === 0 ? 'Up to ' + m[2] + ' ' + (+m[2] === 1 ? noun.replace(/s$/, '') : noun) : m[1] + '-' + m[2] + ' ' + noun;
  if (one) return (s.trim().startsWith('~') ? 'About ' : '') + one[1] + ' ' + noun;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
const pro = new URLSearchParams(location.search).get('for') === 'pro';
const framed = window !== window.parent;
const inEstimator = new URLSearchParams(location.search).get('in') === 'estimator';   // shown in the estimator's pop-up
// Same "Your design will include..." wording as the estimator: "2-3" -> 2-3, "0-1" -> up to 1, "Dozens of..." -> dozens of
function count(txt) {
  const x = String(txt || '');
  if (/dozens/i.test(x)) return {n: 'dozens of', s: 's'};
  const m = x.match(/(\d+)\s*[-–]\s*(\d+)/), one = x.match(/(\d+)/), about = x.trim().startsWith('~') ? 'about ' : '';
  if (m) return +m[1] === 0 ? {n: 'up to ' + m[2], s: +m[2] === 1 ? '' : 's'} : {n: about + m[1] + '-' + m[2], s: 's'};
  if (one) return {n: about + one[1], s: +one[1] === 1 ? '' : 's'};
  return null;
}
// Anonymous click events, posted to the Showit page for the GTM bridge (same format as the quiz)
const track = (event, data = {}) => { if (parent !== window) try { parent.postMessage({type: 'quiz_analytics', event, tool: 'packages_embed', ...data}, '*'); } catch (e) {} };
// Tell a parent page (Showit embed) how tall this is, so the iframe can fit without scrollbars
const report = () => parent !== window && parent.postMessage({kcEmbedHeight: document.documentElement.scrollHeight}, '*');
new ResizeObserver(report).observe(document.body);

Promise.all(['data.json', 'copy.json'].map(f => fetch(f).then(r => r.json()))).then(([D, T]) => {
  const fill = (s, v) => String(s ?? '').replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
  const t = (k, v = {}) => fill(T[k], v);
  const price = p => pro ? Math.round(p.price * (1 - D.proDiscount) / D.proRoundTo) * D.proRoundTo : p.price;
  const img = D.packageImages || {};
  const countLine = (key, txt) => { const c = count(txt); return c ? t(key, c) : t(key + 'Text', {text: String(txt || '').trim()}); };
  // Detail lines: the estimator's include list (pro view = baker lines) and add-ons
  const role = pro ? 'baker' : 'couple';
  const shows = (x, p) => (!x.onlyFor || x.onlyFor.includes(role)) && !(x.hideFor || []).includes(role) && !(x.over && price(p) <= x.over);
  const line = (x, p) => ({includeStatement: () => countLine('includeStatement', p.statement), includeSupporting: () => countLine('includeSupporting', p.supporting),
    includeFiller: () => countLine('includeFiller', p.greenery)}[x.key] || (() => t(x.key)))();
  const ft = D.flowerTiers || {}, tierLines = ['Premium', 'Luxe'].filter(k => ft[k]?.length).map(k => t('tierFlowers', {tier: t('tier' + k), flowers: ft[k].join(', ')}));
  const list = (items, cls = 'check') => `<ul class="${cls}">${items.map(x => `<li>${x}</li>`).join('')}</ul>`;

  // Standalone page: logo on top and the footer; inside the Showit embed: neither
  if (!framed) {
    document.body.classList.add('page'); document.getElementById('logo').hidden = false;
    const f = document.getElementById('footer'); f.hidden = false;
    f.innerHTML = `© ${new Date().getFullYear()} ${esc(D.legal.owner)} · <a href="${esc(D.legal.termsUrl)}" target="_top">${esc(t('footerTerms'))}</a> · <a href="${esc(D.legal.privacyUrl)}" target="_top">${esc(t('footerPrivacy'))}</a>`;
  }
  document.getElementById('heading').textContent = t('embedHeading');
  document.getElementById('heading').hidden = !t('embedHeading') || inEstimator;   // the pop-up has its own title
  if (inEstimator) { document.querySelector('.ctas').hidden = true; document.body.classList.add('inest'); }

  document.getElementById('grid').innerHTML = D.packages.map((p, i) => {
    const desc = p.bestFor ? `<b>${esc(t('guideBestFor'))}:</b> ${esc(p.bestFor)}` : esc(p.description || p.suitableFor);
    const incl = (D.includes || []).filter(x => shows(x, p)).map(x => line(x, p)).filter(Boolean).map(esc);
    const adds = (D.addons || []).filter(x => shows(x, p)).map(x => esc(line(x, p)) + (x.key === 'addonLuxe' && tierLines.length ? tierLines.map(l => `<br><small>${esc(l)}</small>`).join('') : ''));
    return `<article class="card">
    ${img[p.name] ? `<img src="${esc(img[p.name])}" alt="${esc(p.name)} sugar flower package" loading="lazy">` : ''}
    <div class="body">
      <h2>${esc(p.name)}</h2>
      <p class="for">${desc}</p>
      ${list([aim(p.statement, T.unitStatement), aim(p.supporting, T.unitSupporting), aim(p.greenery, T.unitFiller)].map(esc))}
      <div class="price"><small>${esc(pro ? T.embedProStartingAt : T.startingAt)}</small>${money(price(p))}</div>
      <button type="button" class="toggle" aria-expanded="false" aria-controls="more${i}" data-i="${i}">${esc(t('embedMore'))}</button>
      <div class="more" id="more${i}" hidden>
        ${p.vibe ? `<p class="sub">${esc(t('guideVibe'))}</p><p>${esc(p.vibe)}</p>` : ''}
        ${incl.length ? `<p class="sub">${esc(t('includes'))}</p>${list(incl)}` : ''}
        ${adds.length ? `<p class="sub">${esc(t('addonsHeading'))}</p>${list(adds, 'check plus')}` : ''}
        ${p.fits?.length ? `<p class="sub">${esc(t('guideFits'))}</p>${list(p.fits.map(esc))}` : ''}
        <a class="go" target="_top" ${inEstimator ? 'hidden' : ''} href="${esc(D.finderUrl + '?source=packages')}" data-pkg="${esc(p.name)}">${esc(t('embedPackageCta'))}</a>
      </div>
    </div></article>`;
  }).join('');

  // "More details" opens the package's extra info right in its card
  document.getElementById('grid').addEventListener('click', e => {
    const b = e.target.closest('.toggle'), go = e.target.closest('.go');
    if (go) track('packages_cta', {action: 'estimator', package: go.dataset.pkg});
    if (!b) return;
    const card = b.closest('.card'), more = card.querySelector('.more'), open = more.hidden;
    more.hidden = !open; card.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
    b.textContent = t(open ? 'embedLess' : 'embedMore');
    if (open) track('packages_details', {package: card.querySelector('h2').textContent});
    report();
  });

  // Dots for the phone carousel: show which card is in view, tap to jump
  const grid = document.getElementById('grid'), dots = document.getElementById('dots'), cards = [...grid.children];
  dots.innerHTML = cards.map((_, i) => `<button type="button" data-i="${i}"></button>`).join('');
  const mark = () => { const mid = grid.scrollLeft + grid.clientWidth / 2;
    const i = cards.reduce((best, c, j) => Math.abs(c.offsetLeft + c.offsetWidth / 2 - mid) < Math.abs(cards[best].offsetLeft + cards[best].offsetWidth / 2 - mid) ? j : best, 0);
    [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i)); };
  grid.addEventListener('scroll', () => requestAnimationFrame(mark), {passive: true}); mark();
  dots.onclick = e => { const i = e.target.dataset.i; if (i != null) cards[i].scrollIntoView({behavior: 'smooth', inline: 'center', block: 'nearest'}); };

  document.getElementById('finder').href = D.finderUrl;
  document.getElementById('finder').textContent = T.embedEstimatorButton;
  document.getElementById('inquire').textContent = T.embedInquiryButton;
  // Inquiries go through the estimator too (it saves the lead, then sends them on to the inquiry form)
  document.getElementById('inquire').href = D.finderUrl + '?source=packages';
  document.getElementById('inquire').onclick = () => track('packages_cta', {action: 'inquiry'});
  document.getElementById('finder').onclick = () => track('packages_cta', {action: 'estimator'});
  document.getElementById('note').textContent = fill(T.embedNote, {minWeeks: D.leadTime.minimumWeeks, rushWeeks: D.leadTime.rushWeeks});
  report();
});
