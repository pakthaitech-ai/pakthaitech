# PakThai Tech Store - Cloudflare Pages Project

Deployment root: D:\Horse 2\PakThai-Store-DEPLOY
Live site: https://pakthai-tech-store.pages.dev/
Primary files: index.html, assets\, functions\catalog.js

This is a separate Cloudflare Pages project. Keep its root separate from the AI Sourcing Worker project unless the Pages build/deployment settings are intentionally changed.

## Catalog repair and store UX patch (2026-10-10)
Confirmed production issue: `/catalog` returns HTTP 502 because the Pages Function called the session-protected Worker endpoint `/api/products` without a session. Do not make `/api/products` public.

Local patch is prepared in both projects:
- Worker: new public, read-only `GET /api/catalog` returns only `id`, `title`, `category`, `price_pkr`, `available`, and `image_url`.
- Pages Function: `functions/catalog.js` now calls `/api/catalog` and returns a retryable 503 if the upstream service is unavailable.
- Added `icon.svg`, `manifest.webmanifest`, `icons/icon-192.png`, and `icons/icon-512.png`; the header uses the new PakThai Tech logo.
- Added floating WhatsApp (+92 300 7982289) and Crisp Live Chat icons. The existing public Crisp site ID was reused from the live storefront.
- Worker Wrangler config now prepares Logs (100% invocation sampling), Traces (10% sampling), and Issues monitoring.

Validation: six tests pass, all six Worker source files pass `node --check`, the Pages Function passes `node --check`, and Wrangler deploy dry-run passes. Backup: `D:\\Horse 2\\PakThai-STORE-WORKER-PATCH-BACKUP-20261010`.

**Not deployed.** Live `/catalog` and icon paths will remain unchanged until the Owner explicitly approves deploying both the Worker and Pages project. The Pages root must remain `D:\\Horse 2\\PakThai-Store-DEPLOY`.


## Production release status — 2026-10-10
The Store + Worker patch is deployed and live-verified.
- Production Store: https://pakthai-tech-store.pages.dev/
- Pages deployment: `8e22d926` (preview https://8e22d926.pakthai-tech-store.pages.dev)
- Worker version: `dbbb6b58-2a3a-4039-9010-4c4f419c653c`.
- `/catalog` now returns 200 and 362 product records. The Pages adapter calls the public, read-only Worker `/api/catalog`. The authenticated `/api/products` endpoint remains protected (401 without a session).
- Logo/favicon/PWA assets are live and return 200. Floating WhatsApp and Crisp controls are present in the live storefront. WhatsApp number is +92 300 7982289.
- Tests: 6/6 passed; Pages Functions build succeeded; Worker Logs (100% invocation sampling), Traces (10%), and Issues enabled in deployed config.
- No production D1 write, manual catalog sync, purchase/payment, or outbound message was performed.

Note: users should tap the WhatsApp and Crisp icons on a phone and verify test messages reach the correct destination. The catalog count differs from the current upstream public count; investigate pagination/count reconciliation before any manual sync.

## Store visual fix release — 2026-10-10
- Pages production deployment: `d7016675` — https://d7016675.pakthai-tech-store.pages.dev
- Added real catalog-derived product thumbnails to category tiles (All Products and each category), with a branded fallback if an image fails.
- Added delegated image-error fallback for product cards, category thumbnails, and product detail image; adjusted the hero-to-intro spacing to reduce the blank gap below the PakThai Tech cover.
- Preserved the existing product data, category selection behavior, prices, WhatsApp number, contact links, and owner approval flow.
- Validation after deployment: production `/` HTTP 200; `/catalog` HTTP 200 with 362 products and 362 image URLs; brand cover HTTP 200; sampled Shopify CDN product image HTTP 200; all three inline JavaScript blocks passed `node --check` before deployment.
- Worker was not redeployed for this visual-only change. No production D1 write, catalog sync, purchase/payment, or outbound message was performed.


## Store visual correction — 2026-10-10 (deployment 85cf74cb)
- Hero brand cover now fills a responsive banner frame with controlled crop/object position to reduce the small-image/empty-area appearance.
- Removed multiply blending from product and category thumbnails; images render with normal blending, no forced filter, and full opacity.
- Replaced the Connect-section telephone glyph with an inline WhatsApp logo SVG. WhatsApp link and number remain +92 300 7982289 / wa.me/923007982289.
- Backup: index.html.pre-hero-image-whatsapp-fix-20261010.bak
- Validation: 3 inline JavaScript blocks pass node --check; production homepage HTTP 200; /catalog HTTP 200; brand cover asset HTTP 200; live HTML confirms hero frame and WhatsApp SVG, number preserved, no mix-blend-mode:multiply remaining.
- Worker, D1, prices, catalog sync, purchasing/payment and owner approval settings were not changed.


Store catalog recovery — 2026-10-10
- Production homepage was rendering “Live catalog temporarily unavailable” because `/catalog` was being served as HTML during the outage, while the frontend expected JSON.
- Updated `index.html` to fetch the public Worker endpoint `https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog` directly and normalize Worker fields (`price_pkr`, `category`, `image_url`, `available`) into the store's existing product shape.
- Backup: `index.html.pre-catalog-outage-20261010.bak`.
- Deployed Pages preview: `https://f85d634f.pakthai-tech-store.pages.dev`; production alias: `https://pakthai-tech-store.pages.dev/`.
- Live checks after deployment: homepage HTTP 200; `/catalog` HTTP 200 and JSON; Worker API HTTP 200, 362 products, 222 in stock. Inline scripts passed syntax checks. No Worker redeploy, D1 writes, catalog sync, purchases, payments, or outbound messages performed.
