# Package Finder

Public "find your sugar flower package" page for Sugar Flowers by Kelsie Cakes.
Visitors pick who the flowers are for, tier count, style and (optionally) a palette,
see a recommended package with a starting price, then go to the Fillout inquiry form
with their answers filled in.

This repo is public. It only holds package names, starting prices, styles and palettes.
Flower costs and pricing formulas stay in the private quote builder (nevermore-build).

## Files

| File | What it is |
|---|---|
| `index.html` | Package finder |
| `packages.html` | Packages embed for the website (replaces the BlockBuilder block) |
| `brand.css` | Shared brand colors and fonts. Other pages (quiz, quote builder) can load this too. |
| `data.json` | Packages, styles, palettes, pro discount, links |
| `scripts/sync-packages.mjs` | Pulls live packages from Airtable |
| `photos/` | One JPG per style (see below) |

## Style photos

Upload to `photos/` (GitHub: Add file > Upload files). JPG, portrait (4:5), about 1200px tall, under 300 KB.
Names must match exactly:

| Style | File |
|---|---|
| Cascade | `cascade.jpg` |
| Scattered | `scattered.jpg` |
| Focal arrangement | `focal-arrangement.jpg` |
| Bundles | `bundles.jpg` |
| Crown | `crown.jpg` |
| Minimal | `minimal.jpg` |
| Maximalism | `maximalism.jpg` |

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

Add `?for=pro` to the iframe address on a trade page to show pro pricing. The finder also accepts `?for=pro` or `?for=consumer` to skip step 1.

## Settings (data.json)

| Setting | Meaning |
|---|---|
| `packages` | Filled by the sync. Don't edit by hand. |
| `packageImages` | Photo for each package on the embed, by package name |
| `proDiscount` | `0.30` = 30% off for professionals |
| `proRoundTo` | Pro price rounds to the nearest this (10 → $700 becomes $490) |
| `styleLean` | 0 = suggest the smallest package for the tier count, 1 = the largest |
| `clientTypes` | Text sent to Fillout as `client_type` |
| `filloutUrl` | Inquiry form link |

## What gets sent to Fillout

| URL parameter | Example |
|---|---|
| `client_type` | Bride/Couple or Pro |
| `tiers` | 3 (6 means 6+) |
| `style` | Cascade (blank if "Not sure yet") |
| `palette` | Vintage Glam (blank if skipped) |
| `package` | The Thaleia |
| `estimate` | 1000 (the starting price shown, pro price for pros) |
| `source` | estimator |

`utm_source`, `ck_subscriber_id`, `first_name`, `last_name`, `email`, `phone` and `event_date`
are passed along if the visitor arrived with them in the link (for example from a Kit email).

## Hosting

Cloudflare Pages: Create project > Connect to Git > `package-finder`, no build command, output folder `/`.
Do not put Cloudflare Access on this one. Every push to `main` goes live.
