// Price Estimator inquiry endpoint (Cloudflare Worker).
// Everything else on the site is static files (index.html, data.json, photos...), served by Cloudflare as before.
//
// POST /api/lead
//   Someone typed their email to see their estimate. Checks Turnstile, then saves (or updates, one row per email)
//   a row in the "Price Estimator Leads" table. Kept out of Projects on purpose: a new Projects record starts
//   the client/quote automations, which should only run for a full inquiry. Returns a signed token so the
//   full inquiry doesn't need a second spam check.
//
// POST /api/quiz-lead
//   The Sugar Flower Match quiz (quiz.kelsiecakes.com) asking to email someone their result. Checks Turnstile and
//   saves a row in "Quiz Leads". CORS-enabled for the quiz's origin only. data.json is also readable from the quiz,
//   so both tools use the same lead times, budgets and starting price.
//
// POST /api/inquiry
//   1. Checks the lead token from /api/lead (or a Cloudflare Turnstile token)
//   2. Creates the lead's Google Drive folder (photos + an inquiry summary doc) through the Apps Script bridge
//   3. Creates the Projects record in Airtable (same fields Fillout filled), then attaches the photos
// Airtable's own automations take it from there (link/create client, create quote, Quote Pending).
//
// Secrets (Cloudflare dashboard > Workers > package-finder > Settings > Variables and secrets):
//   AIRTABLE_TOKEN    personal access token with data.records:write on the Custom Orders base
//   TURNSTILE_SECRET  Turnstile widget secret key
//   DRIVE_SCRIPT_URL  Apps Script web app URL (scripts/google-drive-bridge.gs)
//   DRIVE_SCRIPT_KEY  the shared key you set in the Apps Script's Script Properties
// Plain settings (vars) are in wrangler.jsonc.

const F = {   // Airtable Projects field IDs
  first: 'fldJUGVYE11d1Irr0', last: 'fldgfIfQWQzBbfvzL', email: 'fldKejArh12CknFlw', phone: 'fldkRZ3rjJtXwYhGK',
  pronouns: 'fldso5jf6z2lTX04G', eventDate: 'fldhHljxpD1hVCO0z', referral: 'fldvZ0a44glT9T5Ci', budget: 'fld950WYgXjVahByp',
  notes: 'fldrKSCWH57vW68ZC', photos: 'fldYFZXTaK0kQuLtD', drive: 'fldzP5TqfsaZYQsMi', filesSent: 'fldFJvktoCnF6ji1C',
  origin: 'fldd25tQR8PnWLIHm', submissionId: 'fldb7sCElUmRoyIvw', title: 'fldTLaAloI3N2QOpy', cakeSize: 'fld9lBxcF1GfwMlrg',
  cakeStyle: 'fldKLT4HiURtXIf6y', eventType: 'fldCb5HirXCWc4cAC', bizLink: 'fld0qczDmIyoiqWvS', bizLocation: 'fldE4RodCh2aFeKIA', resale: 'fld4OANnR01g8YLJ7', pdfDocs: 'fldUgCOYZzzZ23eke', package: 'fld8g50wK9o6bp7Xd', palette: 'fldyyrCKobDGdk567', clientType: 'flduerhLqjxEad89Y',
};
const L = {   // Airtable "Price Estimator Leads" field IDs
  email: 'fldQrwunBwI1uJpZy', clientType: 'fld9e7kz45dgD63op', eventType: 'fldcXVVjMBwFYTAq7', eventDate: 'fldrwEPfJuO81VowU',
  size: 'fldIKhFHXsekDWqpk', style: 'fldyXSKAc0MKaSwEC', budget: 'fldpceXldthwtL05K', pkg: 'fldlfTGwa5ZjAmVy3', estimate: 'fldj34iPXEjPAVhu3',
  sent: 'flduV2t6Hze057aLS', project: 'fldfYBWj66RH9xbQ4', utm: 'fld6KDRIy0OIslpPf', submitted: 'fldZ59O4j8PtJZbim',
};
const Q = {   // Airtable "Quiz Leads" field IDs
  email: 'fldaDSIaCWJlwngJ0', first: 'fld8qC5aGabP6kU89', result: 'fldYDwOJd4ZBVooxP', role: 'fldohQ9loStlmDzHQ', timeline: 'fldN3xaMB8mD86y7t',
  experience: 'fldiCElViwaQMihVR', vision: 'fldDJcKHVianzXM67', budget: 'fldA8alymBkaHcdXb', tags: 'fldBMgbzo9XgQRLlE', utm: 'fldyqwyh2ftHNwLhc', submitted: 'fldGuNQPM8wLPnZbE',
};
const QUIZ_RESULTS = {readyToShip: 'Ready to Ship', madeToOrder: 'Made to Order', curated: 'Curated', fullyCustom: 'Fully Custom'};
const QUIZ_ORIGINS = ['https://quiz.kelsiecakes.com'];
const cors = request => { const o = request.headers.get('Origin') || '';
  return QUIZ_ORIGINS.includes(o) ? {'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin'} : {}; };
const EVENT_TYPES = ['Wedding', 'Birthday', 'Holiday Party', 'Other'];
const s = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PHOTOS = 5, MAX_PHOTO_BYTES = 5 * 1024 * 1024;   // Airtable's direct upload limit is 5 MB per file

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/lead') {
      if (request.method !== 'POST') return json({ok: false, error: 'POST only'}, 405);
      try { return await lead(request, env); }
      catch (e) { console.error('lead failed', e && e.stack || e); return json({ok: false, error: 'server'}, 500); }
    }
    if (url.pathname === '/api/quiz-lead') {
      if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: cors(request)});
      if (request.method !== 'POST') return json({ok: false, error: 'POST only'}, 405);
      let res;
      try { res = await quizLead(request, env); }
      catch (e) { console.error('quiz lead failed', e && e.stack || e); res = json({ok: false, error: 'server'}, 500); }
      for (const [k, v] of Object.entries(cors(request))) res.headers.set(k, v);
      return res;
    }
    if (url.pathname === '/data.json' || url.pathname === '/copy.json') {   // public settings, readable by the quiz
      const r = await env.ASSETS.fetch(request), out = new Response(r.body, r);
      out.headers.set('Access-Control-Allow-Origin', '*');
      return out;
    }
    if (url.pathname === '/api/inquiry') {
      if (request.method !== 'POST') return json({ok: false, error: 'POST only'}, 405);
      try { return await inquiry(request, env, ctx); }
      catch (e) { console.error('inquiry failed', e && e.stack || e); return json({ok: false, error: 'server'}, 500); }
    }
    return env.ASSETS.fetch(request);
  },
};

async function turnstileOk(token, request, env) {
  const ts = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({secret: env.TURNSTILE_SECRET || '', response: String(token || ''), remoteip: request.headers.get('CF-Connecting-IP') || ''}),
  }).then(r => r.json()).catch(() => ({success: false}));
  return ts.success === true;
}
// Lead token: "<record id>.<expires>.<signature>", signed with the Turnstile secret, good for 2 days
async function hmac(text, env) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('lead:' + (env.TURNSTILE_SECRET || '')), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}
async function makeLeadToken(id, env) { const body = `${id}.${Date.now() + 2 * 86400000}`; return `${body}.${await hmac(body, env)}`; }
async function readLeadToken(tok, env) {
  const m = String(tok || '').match(/^(rec\w{14})\.(\d+)\.([0-9a-f]{64})$/);
  if (!m || +m[2] < Date.now() || !env.TURNSTILE_SECRET) return null;
  return (await hmac(`${m[1]}.${m[2]}`, env)) === m[3] ? m[1] : null;
}

async function lead(request, env) {
  if (Number(request.headers.get('content-length') || 0) > 20 * 1024) return json({ok: false, error: 'too large'}, 413);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== 'object') return json({ok: false, error: 'bad request'}, 400);
  if (!(await turnstileOk(b.turnstile, request, env))) return json({ok: false, error: 'spam check failed'}, 403);
  const email = s(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ok: false, error: 'missing', fields: ['email']}, 400);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.eventDate) ? b.eventDate : undefined;
  const fields = {
    [L.email]: email, [L.clientType]: s(b.clientType, 40), [L.eventType]: EVENT_TYPES.includes(b.eventType) ? (b.eventType === 'Other' && s(b.eventOther, 120) ? 'Other: ' + s(b.eventOther, 120) : b.eventType) : '',
    [L.eventDate]: date, [L.size]: s(b.size, 20), [L.style]: s(b.style, 40) || 'Not sure yet', [L.budget]: s(b.budget, 40),
    [L.pkg]: s(b.packageName, 60), [L.estimate]: Number(b.estimate) || undefined, [L.utm]: s(b.utmSource, 80), [L.submitted]: new Date().toISOString(),
  };
  // One row per email: a second visit updates the same row
  const r = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE}/${env.LEADS_TABLE}`, {
    method: 'PATCH', headers: {Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({performUpsert: {fieldsToMergeOn: [L.email]}, records: [{fields}]}),
  });
  if (!r.ok) { console.error('airtable lead', r.status, await r.text()); return json({ok: true, lead: ''}); }   // never block the visitor on our side
  const id = (await r.json()).records[0].id;
  return json({ok: true, lead: await makeLeadToken(id, env)});
}

async function quizLead(request, env) {
  if (Number(request.headers.get('content-length') || 0) > 20 * 1024) return json({ok: false, error: 'too large'}, 413);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== 'object') return json({ok: false, error: 'bad request'}, 400);
  if (!(await turnstileOk(b.turnstile, request, env))) return json({ok: false, error: 'spam check failed'}, 403);
  const email = s(b.email, 200).toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ok: false, error: 'missing', fields: ['email']}, 400);
  if (!QUIZ_RESULTS[b.result]) return json({ok: false, error: 'bad result'}, 400);
  const fields = {
    [Q.email]: email, [Q.first]: s(b.name, 80), [Q.result]: QUIZ_RESULTS[b.result], [Q.role]: s(b.role, 40), [Q.timeline]: s(b.timeline, 40),
    [Q.experience]: s(b.experience, 40), [Q.vision]: s(b.customization, 40), [Q.budget]: s(b.budget, 40),
    [Q.tags]: (Array.isArray(b.tags) ? b.tags : []).map(x => s(x, 60)).slice(0, 20).join(', '), [Q.utm]: s(b.utmSource, 80), [Q.submitted]: new Date().toISOString(),
  };
  const r = await fetch(`https://api.airtable.com/v0/${env.AIRTABLE_BASE}/${env.QUIZ_TABLE}`, {
    method: 'POST', headers: {Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({records: [{fields}], typecast: true}),
  });
  if (!r.ok) { console.error('airtable quiz lead', r.status, await r.text()); return json({ok: false, error: 'save failed'}, 502); }
  return json({ok: true});
}

async function inquiry(request, env, ctx) {
  if (Number(request.headers.get('content-length') || 0) > 40 * 1024 * 1024) return json({ok: false, error: 'too large'}, 413);
  const b = await request.json().catch(() => null);
  if (!b || typeof b !== 'object') return json({ok: false, error: 'bad request'}, 400);

  // 1. Spam check: the signed token from /api/lead, or a fresh Turnstile token
  const leadId = await readLeadToken(b.lead, env);
  if (!leadId && !(await turnstileOk(b.turnstile, request, env))) return json({ok: false, error: 'spam check failed'}, 403);

  // Validate
  const d = {
    first: s(b.first, 80), last: s(b.last, 80), pronouns: s(b.pronouns, 40), email: s(b.email, 200), phone: s(b.phone, 40),
    referral: s(b.referral, 80), vision: s(b.vision, 5000), eventDate: s(b.eventDate, 10), size: s(b.size, 20), style: s(b.style, 40),
    budget: s(b.budget, 40), palette: s(b.palette, 60), clientType: s(b.clientType, 40), role: s(b.roleLabel, 80),
    packageId: s(b.packageId, 20), packageName: s(b.packageName, 60), estimate: Number(b.estimate) || 0, utm: s(b.utmSource, 80),
    eventType: EVENT_TYPES.includes(b.eventType) ? b.eventType : '', eventOther: s(b.eventOther, 120),
    bizLink: s(b.bizLink, 200), bizCity: s(b.bizCity, 80), bizState: s(b.bizState, 40), resale: ['Yes', 'No'].includes(b.resale) ? b.resale : '',
    allergen: b.allergen === true,
  };
  const missing = ['first', 'last', 'email', 'phone', 'referral', 'eventDate', 'size', 'clientType'].filter(k => !d[k]);
  if (!d.allergen) missing.push('allergen');
  if (!EMAIL_RE.test(d.email)) missing.push('email');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.eventDate)) missing.push('eventDate');
  if (missing.length) return json({ok: false, error: 'missing', fields: [...new Set(missing)]}, 400);
  const photos = (Array.isArray(b.photos) ? b.photos : []).slice(0, MAX_PHOTOS)
    .map(p => ({name: s(p.name, 120).replace(/[^\w.\- ]/g, '_') || 'photo.jpg', type: /^image\/[\w.+-]+$/.test(p.type) ? p.type : 'image/jpeg', data: String(p.data || '')}))
    .filter(p => p.data && p.data.length * 0.75 <= MAX_PHOTO_BYTES);

  // Florida resale certificate (PDF or image), pros only
  const rf = b.resaleFile && typeof b.resaleFile === 'object' && String(b.resaleFile.data || '').length * 0.75 <= MAX_PHOTO_BYTES && /^(image\/[\w.+-]+|application\/pdf)$/.test(b.resaleFile.type)
    ? {name: 'Resale certificate - ' + (s(b.resaleFile.name, 100).replace(/[^\w.\- ]/g, '_') || 'certificate.pdf'), type: b.resaleFile.type, data: String(b.resaleFile.data)} : null;
  const bizLocation = [d.bizCity, d.bizState].filter(Boolean).join(', ');

  const submissionId = crypto.randomUUID();
  const dateLong = new Date(d.eventDate + 'T12:00:00Z').toLocaleDateString('en-US', {month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'});
  const title = [d.style, 'Sugar Flowers'].filter(Boolean).join(' ');
  const summary = [
    ['Name', `${d.first} ${d.last}`], ['Pronouns', d.pronouns], ['Email', d.email], ['Phone', d.phone], ['Event date', dateLong],
    ['I am', d.role], ['Event', d.eventType === 'Other' ? `Other: ${d.eventOther}` : d.eventType], ['Cake size', d.size], ['Cake style', d.style || 'Not sure yet'], ['Budget', d.budget], ['Color palette', d.palette],
    ['Package shown', d.packageName ? `${d.packageName} (starting at $${d.estimate.toLocaleString('en-US')})` : ''],
    ['Business website / Instagram', d.bizLink], ['Business location', bizLocation], ['FL resale certificate', d.resale ? d.resale + (rf ? ' (uploaded)' : '') : ''], ['Found me through', d.referral], ['Vision', d.vision], ['Allergen statement', 'I Understand.'], ['UTM source', d.utm],
    ['Submitted', new Date().toISOString()], ['Submission ID', submissionId],
  ].filter(([, v]) => v);

  // 2. Airtable Projects record (saved first, so the visitor isn't kept waiting on Drive)
  const notes = [d.vision ? d.vision + '\n' : '', '— From the Price Estimator —', ...summary.filter(([k]) => !['Vision', 'Name', 'Email', 'Phone', 'Pronouns', 'Submission ID'].includes(k)).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join('\n');
  const fields = {
    [F.first]: d.first, [F.last]: d.last, [F.email]: d.email, [F.phone]: d.phone, [F.pronouns]: d.pronouns || undefined,
    [F.eventDate]: d.eventDate, [F.referral]: d.referral, [F.budget]: d.budget || undefined, [F.notes]: notes,
    [F.cakeSize]: d.size, [F.cakeStyle]: d.style || undefined, [F.palette]: d.palette || undefined, [F.clientType]: d.clientType,
    [F.package]: /^rec\w{14}$/.test(d.packageId) ? [d.packageId] : undefined, [F.title]: title,
    [F.eventType]: d.eventType || undefined, [F.bizLink]: d.bizLink || undefined, [F.bizLocation]: bizLocation || undefined, [F.resale]: d.resale || undefined, [F.origin]: 'Price Estimator', [F.submissionId]: submissionId,
  };
  const base = env.AIRTABLE_BASE, table = env.PROJECTS_TABLE;
  const created = await fetch(`https://api.airtable.com/v0/${base}/${table}`, {
    method: 'POST', headers: {Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({records: [{fields}], typecast: true}),   // typecast adds new select options (e.g. "Price Estimator") if missing
  });
  if (!created.ok) { console.error('airtable create', created.status, await created.text()); return json({ok: false, error: 'save failed'}, 502); }
  const recordId = (await created.json()).records[0].id;

  // 3. Everything slow happens after the visitor sees the thank-you page:
  //    Drive folder (photos + summary doc), then the Drive link and photos on the Airtable record.
  ctx.waitUntil((async () => {
    const auth = {Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json'};
    // Mark their estimator lead as done and link it to the new project
    if (leadId && env.LEADS_TABLE) {
      const u = await fetch(`https://api.airtable.com/v0/${base}/${env.LEADS_TABLE}/${leadId}`, {
        method: 'PATCH', headers: auth, body: JSON.stringify({fields: {[L.sent]: true, [L.project]: [recordId]}}),
      });
      if (!u.ok) console.error('airtable lead link', u.status, await u.text());
    }
    // Google Drive folder (a failure here never loses the lead; it's already in Airtable)
    let drive = null;
    if (env.DRIVE_SCRIPT_URL) {
      drive = await fetch(env.DRIVE_SCRIPT_URL, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, redirect: 'follow',
        body: JSON.stringify({key: env.DRIVE_SCRIPT_KEY, parentId: env.LEADS_FOLDER_ID,
          folderName: `${d.first} ${d.last} | ${dateLong} | Sugar Flowers`,
          docTitle: `Inquiry - ${d.first} ${d.last} - ${dateLong}`, summary, photos: rf ? [...photos, rf] : photos}),
      }).then(r => r.json()).catch(e => ({ok: false, error: String(e)}));
      if (!drive.ok) { console.error('drive failed', drive.error); drive = null; }
    }

    if (drive) {
      const u = await fetch(`https://api.airtable.com/v0/${base}/${table}/${recordId}`, {
        method: 'PATCH', headers: auth, body: JSON.stringify({fields: {[F.drive]: drive.folderUrl, ...(photos.length ? {[F.filesSent]: true} : {})}}),
      });
      if (!u.ok) console.error('airtable drive link', u.status, await u.text());
    }
    // Photos onto the record (one call per photo)
    for (const p of photos) {
      const r = await fetch(`https://content.airtable.com/v0/${base}/${recordId}/${F.photos}/uploadAttachment`, {
        method: 'POST', headers: {Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({contentType: p.type, file: p.data, filename: p.name}),
      });
      if (!r.ok) console.error('airtable photo', r.status, await r.text());
    }
    if (rf) {
      const r = await fetch(`https://content.airtable.com/v0/${base}/${recordId}/${F.pdfDocs}/uploadAttachment`, {
        method: 'POST', headers: {Authorization: `Bearer ${env.AIRTABLE_TOKEN}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({contentType: rf.type, file: rf.data, filename: rf.name}),
      });
      if (!r.ok) console.error('airtable certificate', r.status, await r.text());
    }
  })().catch(e => console.error('background', e && e.stack || e)));
  return json({ok: true});
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
