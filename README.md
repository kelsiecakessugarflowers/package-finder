## Changing the wording

Every customer-facing sentence is in **`copy.json`**. Open it on GitHub, click the pencil, change the text between the quotes, and commit. The site updates in about a minute.

- Keep the quotes and the comma at the end of each line.
- Words in `{curly}` braces are filled in for you: `{event}` / `{Event}` become the occasion they pick (wedding, birthday, holiday party), `{price}`, `{size}`, `{cake}`, `{minPrice}` (your cheapest package), `{minWeeks}`, `{rushWeeks}`.
- A blank value (`""`) hides that line, e.g. the `hint...` notes under each question.
- Which "Your design will include" lines and add-ons show for whom (bakers only, over $2,000, ...) is in `data.json` > `includes` / `addons`.

## Two versions

- `main` is the live site: the last button sends people to the Fillout form.
- `replace-fillout` is the same site with the built-in inquiry form turned on (`data.json` > `inquiry.mode` = `"direct"`). Merge its pull request when you're ready to retire Fillout.

# Price Estimator (package-finder)

Public price estimator and packages embed for Sugar Flowers by Kelsie Cakes.
First page: occasion, role, date, cake size, style, budget and email. Second page: the recommended package and estimate,
what's included, and the inquiry (Fillout on `main`, the built-in form on the `replace-fillout` branch).
Budgets under $350 and dates under 3 weeks out are sent to the shop (shop.kelsiecakes.com) instead.

This repo is public. It only holds package names, starting prices, styles and palettes.
Flower costs and pricing formulas stay in the private quote builder (nevermore-build).

## Files

| File | What it is |
|---|---|
| `index.html` | Price Estimator (and the built-in inquiry form) |
| `worker.js`, `wrangler.jsonc` | The Cloudflare Worker: serves the site and handles `/api/inquiry` |
| `scripts/google-drive-bridge.gs` | Google Apps Script that creates lead folders in Drive |
| `logo-main.svg`, `logo-alt.svg` | Logos (alt in headers, main in the footer) |
| `packages.html` | Packages embed for the website (replaces the BlockBuilder block) |
| `copy.json` | Every customer-facing line on both pages. Edit it on GitHub. `{braces}` are filled in by the page. |
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
The "Best for:" and "Vibe:" lines of each package's guide text, and its **Estimator Tags** (Budget Friendly, Venue Preferred, ...), show on the estimate.

## Packages embed in Showit

Add an Embed Code element with this, using your live site address:

```html
<iframe id="kc-packages" src="https://estimator.kelsiecakes.com/packages.html" style="width:100%;border:0;height:1400px" loading="lazy" title="Sugar flower packages"></iframe>
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

## Built-in inquiry form (replaces Fillout)

"Request final quote" can either open Fillout (`inquiry.mode: "fillout"`, the current setting) or send the
inquiry straight to Airtable (`"direct"`). Add `?direct=1` to the estimator link to try the built-in form
before switching. Fillout stays untouched until you flip the setting.

What happens on submit (`worker.js`):

| Step | Detail |
|---|---|
| Spam check | Cloudflare Turnstile (free) |
| Google Drive | Creates `First Last \| Month D, YYYY \| Sugar Flowers` in 💐 Current Leads (Shared Drive), sets anyone-with-link view, saves the photos and an inquiry summary Google Doc |
| Airtable Projects | Creates the record: names, email, phone, pronouns, event date, referral source, budget, notes (vision plus the estimator summary), Cake Size, Cake Style, Requested Color Palette, Client Type, Preferred Package, Project Title, Data Origin "Price Estimator", Submission ID, Google Drive link, "Files sent to folder?" |
| Photos | Attached to Inspiration Photos |
| After that | Airtable's "New Project - Add/Link Client + Quote" automation runs as it does for Fillout leads |

One-time setup:

| # | Where | What |
|---|---|---|
| 1 | Cloudflare > Turnstile | Add widget for `package-finder.kelsie-a54.workers.dev` (and your own domain if you add one). Put the **site key** in `data.json` > `inquiry.turnstileSiteKey`; the **secret key** becomes Worker secret `TURNSTILE_SECRET` |
| 2 | airtable.com/create/tokens | New token, scope `data.records:write`, base Custom Orders. Worker secret `AIRTABLE_TOKEN` |
| 3 | script.google.com | Follow the steps at the top of `scripts/google-drive-bridge.gs`. Worker secrets `DRIVE_SCRIPT_URL`, `DRIVE_SCRIPT_KEY` |
| 4 | Zapier "New lead" zap | Remove the steps that create the Drive folder, set its sharing, write the Drive link back to Airtable, and find/move the inquiry PDF and photos. Use Airtable's Google Drive field instead. Add "Price Estimator" wherever a filter checks where the lead came from |
| 5 | Test | Submit with `?direct=1`, check Airtable, Drive and the zap, then set `inquiry.mode` to `"direct"` |

Worker secrets live in Cloudflare > Workers & Pages > package-finder > Settings > Variables and secrets.

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
