# Price Estimator (package-finder)

Public price estimator and packages embed for Sugar Flowers by Kelsie Cakes.
One page, laid out like the quote builder: role, event date, cake size, cake style and budget, an optional palette,
and a live estimate with a sticky bar for "Request final quote" (opens the Fillout inquiry with answers filled in).
Budgets under $350 and dates under 3 weeks out are sent to the shop (shop.kelsiecakes.com) instead.

This repo is public. It only holds package names, starting prices, styles and palettes.
Flower costs and pricing formulas stay in the private quote builder (nevermore-build).

## Files

| File | What it is |
|---|---|
| `index.html` | Price Estimator |
| `packages.html` | Packages embed for the website (replaces the BlockBuilder block) |
| `data.json` → `copy` | Every customer-facing line on both pages. Edit text here (or in the copy Google Sheet, then paste). `{braces}` are filled in by the page. |
| `brand.css` | Shared brand colors and fonts. Other pages (quiz, quote builder) can load this too. |
| `data.json` | Packages, styles, palettes, pro discount, links |
| `scripts/sync-packages.mjs` | Pulls live packages from Airtable |
| `photos/` | One JPG per style (see below) |

## Style photos

Upload to `photos/` (GitHub: Add file > Upload files). JPG, portrait (2:3, like 800 x 1200), under 300 KB.
Names must match exactly:

| Style | File |
|---|---|
| Cascading | `cascading.jpg` |
| Scattered | `scattered.jpg` |
| Focal Point | `focal-point.jpg` |
| Bundles | `bundles.jpg` |
| Crown | `crown.jpg` |
| Minimal | `minimal.jpg` |
| Maximalist | `maximalist.jpg` |

A style with no photo shows a plain tile.

## Updating packages

Airtable's Packages table is the source of truth. After changing it, go to Actions > "Sync packages from Airtable" > Run workflow.
One-time setup: Settings > Secrets and variables > Actions > New secret `AIRTABLE_TOKEN` (the same token as the quote builder works).
Optional Airtable field "Website Description" (long text) replaces the "Suitable For" line on the packages embed.

## Packages embed in Showit

Add an Embed Code element with this, using your live site address:

```html
<iframe id="kc-packages" src="https://YOUR-SITE/packages.html" style="width:100%;border:0;height:1400px" loading="lazy" title="Sugar flower packages"></iframe>
<script>addEventListener('message',e=>{if(e.data&&e.data.kcEmbedHeight)document.getElementById('kc-packages').style.height=e.data.kcEmbedHeight+'px'})</script>
```

Add `?for=pro` to the iframe address on a trade page to show pro pricing. The finder accepts `?for=couple`, `?for=family`, `?for=baker` or `?for=vendor` to skip step 1.

## Settings (data.json)

| Setting | Meaning |
|---|---|
| `packages` | Filled by the sync. Don't edit by hand. |
| `packageImages` | Photo for each package on the embed, by package name |
| `proDiscount` | `0.30` = 30% off for professionals |
| `proRoundTo` | Pro price rounds to the nearest this (10 → $700 becomes $490) |
| `styleLean` | 0 = suggest the smallest package for the tier count, 1 = the largest |
| `roles` | Step 1 choices (from the quiz). `clientType` is sent to Fillout; `group` pro gets pro pricing |
| `filloutUrl` | Inquiry form link |
| `leadTime` | `shopUnderDays` (21: send to the shop), `minimumWeeks` (6), `rushWeeks` (8) |
| `budgets`, `shopBudget` | Budget dropdown; the `shopBudget` choice sends visitors to the shop |
| `shopUrl` | Retail shop link |
| `gtmId` | Google Tag Manager container |

## What gets sent to Fillout

| URL parameter | Example |
|---|---|
| `client_type` | Couple, Family/Friend, Baker/Cake Decorator or Wedding Vendor |
| `event_date` | 2027-05-22 |
| `tiers` | 3 tiers (matches Airtable Cake Size: 1 tier, 2 tiers ... 6+ tiers) |
| `style` | Cascading (matches Airtable Cake Style; blank if "Not sure yet") |
| `palette` | Vintage Glam (blank if skipped) |
| `budget` | $1,000-$1,500 |
| `package` | The Thaleia |
| `estimate` | 1000 (the starting price shown, pro price for pros) |
| `source` | estimator |

`utm_source`, `ck_subscriber_id`, `first_name`, `last_name`, `email`, `phone` and `event_date`
are passed along if the visitor arrived with them in the link (for example from a Kit email).

## Hosting

Cloudflare Pages: Create project > Connect to Git > `package-finder`, no build command, output folder `/`.
Do not put Cloudflare Access on this one. Every push to `main` goes live.

## Analytics (Google Tag Manager)

Anonymous events only: no names, emails or dates.

| Event | Sent when | Details |
|---|---|---|
| `estimator_view` | Estimator opens | |
| `estimator_change` | A choice changes | `field`, `value` (role, size, style, budget, palette, package) |
| `estimator_result` | A package shows | `package`, `price`, `route` (inquiry, budget, date), `pricing` (pro, standard) |
| `estimator_cta` | A button is clicked | `action` (inquiry, shop, inquiry_anyway) |
| `packages_cta` | Packages embed button | `action` (estimator, inquiry) |

Opened directly, the estimator loads GTM itself. Inside a Showit iframe it posts events to the parent page,
where the quiz's `gtm-iframe-bridge.js` passes them to the site's GTM. Add `https://package-finder.kelsie-a54.workers.dev`
to the bridge's trusted origins.
