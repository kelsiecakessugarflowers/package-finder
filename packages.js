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
// Anonymous click events, posted to the Showit page for the GTM bridge (same format as the quiz)
const track = (event, data = {}) => { if (parent !== window) try { parent.postMessage({type: 'quiz_analytics', event, tool: 'packages_embed', ...data}, '*'); } catch (e) {} };
// Tell a parent page (Showit embed) how tall this is, so the iframe can fit without scrollbars
const report = () => parent !== window && parent.postMessage({kcEmbedHeight: document.documentElement.scrollHeight}, '*');
new ResizeObserver(report).observe(document.body);

Promise.all(['data.json', 'copy.json'].map(f => fetch(f).then(r => r.json()))).then(([D, T]) => {
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
  const price = p => pro ? Math.round(p.price * (1 - D.proDiscount) / D.proRoundTo) * D.proRoundTo : p.price;
  const img = D.packageImages || {};
  document.getElementById('grid').innerHTML = D.packages.map(p => `<article class="card">
    ${img[p.name] ? `<img src="${esc(img[p.name])}" alt="${esc(p.name)} sugar flower package" loading="lazy">` : ''}
    <div class="body">
      <h3>${esc(p.name)}</h3>
      <p class="for">${esc(p.description || p.suitableFor)}</p>
      <ul>
        <li>${esc(aim(p.statement, T.unitStatement))}</li>
        <li>${esc(aim(p.supporting, T.unitSupporting))}</li>
        <li>${esc(aim(p.greenery, T.unitFiller))}</li>
      </ul>
      <div class="price"><small>${esc(pro ? T.embedProStartingAt : T.startingAt)}</small>${money(price(p))}</div>
    </div></article>`).join('');
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
