# PAKTHAI TECH — FINAL SOURCE OF TRUTH
Last verified/updated: 2026-10-18 (UTC)
Status: Current baseline; see the latest live-review entry below before changing files.
Project root: `D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL` (historical `D:\Horse 2\...` references refer to the former checkout)
Store: https://pakthai-tech-store.pages.dev/
Worker: https://pakthai-ai-sourcing.pakthaitech.workers.dev/
Worker service: `pakthai-ai-sourcing`; D1 binding: `pakthai-sourcing-db`
Canonical Worker source: `src\worker.js`
Canonical plan: `MASTER_PLAN_VOICE_REVIEW.md`
Release history: `RELEASE_LOG.md`
Detailed report: `_MASTER_CONTROL\reports\FINAL_PROJECT_STATUS_2026-10-11.md`
New-chat handover: `NEXT_CHAT_HANDOVER.md`
New-chat prompt: `NEW_CHAT_START_PROMPT.md`

## Authority and anti-confusion rules
1. In every new chat, read this file, `NEXT_CHAT_HANDOVER.md`, and the current release log before giving instructions. Then inspect the live source files; do not rely on chat memory alone.
2. This file and the handover supersede conflicting older reports. Older reports and backups are historical evidence only, not instructions to restore old code/data.
3. Never restore archived test sellers, opportunities, old outreach notifications, historical SQL seeds, or obsolete settings to production.
4. Preserve backups. Never rewrite `src\worker.js` wholesale. Before any source edit, create a dated backup; run focused tests, syntax checks, Wrangler dry-run, and inspect the diff. Deploy only with explicit owner approval.
5. Never reveal secrets, tokens, passwords, OAuth secrets, or their values in chat/reports.
6. Owner approval remains required for final quotes/prices, purchases, payments, orders, stock commitments, delivery promises and sensitive external commitments. No auto-purchase or auto-payment.
7. Be concise and practical in Pakistani Urdu. Do not ask the owner to repeat checks already confirmed here. Do not reopen completed work without evidence of regression.

## Confirmed customer-facing status (owner checked 2026-10-11)
- Store/product listing and visible functions: owner reports working.
- AI Sourcing dashboard, sale/adaptive tools, calculator and sales-address-related functions: owner reports working.
- Store WhatsApp button opens the correct WhatsApp link for +92 300 7982289. This verifies the link only, not Cloud API delivery.
- Crisp initially kept loading; duplicate script/name collision was removed from the separate Store source and Store redeployed. Owner then confirmed Crisp works. Do not troubleshoot Crisp again unless owner reports a new failure.
- Latest recorded catalog count was 385 products, but counts may change after sync; verify current live state rather than forcing a historical count.

## Production fresh-start data baseline (2026-10-11)
- Live sellers 0; seller offers 0; supplier offers 0; seller history 0; opportunities 0; negotiations 0; buyer matches 0; active prepared seller-lead notifications 0.
- Latest live count before Korea discovery deployment: 10 Thailand seller prospects and 4 Pakistan buyer/channel prospects. They are unreviewed public leads, not confirmed sellers/buyers; Korea discovery was deployed but its first live search has not yet run.
- Five old Thailand live seller rows and seven old outreach notification rows were archived and removed from active tables. Two older test seller accounts were previously removed from active tables. Historical backup tables/files remain preserved.
- Old seller SQL seed files are disabled/comment-only. Do not import old archives or create dummy opportunities.
- Latest outreach scheduler deployment version in release notes: `13e76a44-b7fb-428d-a7c1-e3b661b2f4f7`; first scheduled run is expected Monday 2026-10-12 at 09:00 Pakistan time. No campaign email had been sent at deployment time. It is scheduled, not yet proven by a completed run.

## WhatsApp — latest forensic status (NOT COMPLETE)
Intended business number: +92 300 7982289.
- Meta WhatsApp Manager showed the real +92 number as Connected / quality High under a WABA reported as `2330969974304488`.
- Developer console still showed a test number +1 555 648 6086, test phone ID `1359558747244650`, and test WABA `1791989132046074`. The real WABA and test WABA are distinct; never confuse them or delete/re-register the real number.
- Meta webhook screen: callback configured as `https://pakthai-ai-sourcing.pakthaitech.workers.dev/webhooks/whatsapp`; `messages` field was subscribed. App was unpublished, so Meta warned that production webhook data would not be delivered until the app is published.
- The deployed Worker contains a webhook handler on `/webhooks/whatsapp` that validates `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET`, and stores message status callbacks in `whatsapp_message_status`. A previous local probe got HTTP 200 with a challenge, which verifies GET challenge handling only.
- The current `sendWhatsAppCloudMessage` function falls back to the test phone ID `1359558747244650` when `WHATSAPP_PHONE_NUMBER_ID` is absent. Before any real send, verify the configured phone-number ID without revealing tokens. Do not assume the secret/variable points to the production number.
- The separate file `src\whatsapp-webhook.js` is an unused duplicate: it expects route `/api/whatsapp/webhook`, uses different env names, and includes an inbound auto-reply path. It is NOT the active routed handler. Keep it archived/quarantined; do not treat its presence as working production automation.
- WhatsApp production send, delivery receipt, inbound message handling and automatic reply are NOT VERIFIED. The active handler currently processes status callbacks; it does not implement inbound auto-reply. A message-link opening or a token generation is not delivery proof.
- Meta phone-number registration earlier showed a generic registration error/phone limit, and Pakistan OTP was not confirmed. No number deletion, re-registration, app publication or paid billing action is authorized implicitly.
- Next WhatsApp work: (1) verify app asset/WABA selection and the real production phone ID; (2) confirm required secrets are configured by name/status only, never print values; (3) implement/test inbound handler and delivery-status persistence with idempotency; (4) verify Meta production webhook eligibility/publish requirements; (5) perform a single controlled send only after the owner approves and a safe recipient is specified; (6) confirm a real delivered/read callback. Do not claim success before that evidence.

## 2026-10-12 live checks and release
- Current Worker deployment: `c9ea223e-7a4c-476c-95c5-1f4d7aa0b0ff`. Public `/api/health` returned `ok:true`; `/api/catalog` returned 385 products. Live Cloudflare dashboard usage showed 6.06k requests for Oct 1–12 and 156 observability events today (156 / 200,000).
- Read-only D1 check: Thailand seller prospects 10; Pakistan buyer/channel prospects 4; active sellers 0; confirmed buyers 0. No Korea seller discovery status exists yet. The owner-only dashboard currently shows a login form in the opened browser, so no manual Korea run was executed after deployment. Daily cron is wired for Korea, Thailand and Pakistan buyer discovery.
- Latest saved scheduled Thailand run: 2026-10-12 04:16 UTC, 5 seen / 5 saved or refreshed, success. Latest scheduled Pakistan buyer run: 2026-10-12 02:00 UTC, failed. Catalog sync also failed with upstream HTTP 429 after retries.
- Outreach audit found an earlier scheduled run at 2026-10-12 04:00 UTC accepted 3 emails through Gmail API; delivery/read receipts are not proven. Three campaigns are active and five queued. No email or other message was sent during this task. New Worker code pauses all scheduled prospect emails and follow-ups pending owner approval.
- Free-only change: South Korea seller prospect discovery added using public OpenStreetMap/Photon, with a 250 km screening radius measured from the Pyeongtaek city centre (approximate, not the employee's exact pickup point). Country toggle gates scheduled/manual discovery. Results are unverified only; no outreach, seller record, offer, purchase, or order is created.
- Validation: Korea discovery, Korea toggle-off, outreach pause and route authorization focused tests passed 23/23; all `src/*.js` syntax checks passed. Full suite 30/31: one known independent Store inline-script smoke test remains failing at `tools/audit/public-catalog-smoke.mjs:104`. Wrangler dry-run reported bundle upload metadata; deployment completed from the authorized Windows device. No billing change was made.
- Free-plan evidence: Cloudflare usage is currently low, but the Cloudflare account plan/expiry banner was not visible on the Workers page. The Google Cloud billing console did not expose account details and `gcloud` CLI is not installed, so the specific expiry alerts and current trial remaining time are NOT VERIFIED. Crisp UI was previously owner-confirmed working; the official Crisp Free plan has the widget/shared inbox for up to two seats but includes no AI credits. Do not upgrade or add a payment method.

## Other incomplete work
1. Verify/qualify the 5 Thailand supplier prospects and 4 Pakistan buyer/channel prospects.
2. Set missing landed-cost rates. Last recorded travel rate 75; pickup, packing, freight, duty, payment fee, Pakistan transport and contingency were zero. Do not trust margin calculations until updated.
3. Confirm first successful scheduled seller-discovery run and saved status marker.
4. Controlled Gmail inbound email → exactly one reply → no duplicate reply remains unverified.
5. Outreach scheduler is configured to send at most 3 business emails per run on Mon–Sat, but its first run was pending at the last report. Check actual run logs/status before saying any emails were sent.
6. Broader security/idempotency/CSRF/rate-limit review and live voice workflows need evidence.

## Required proof labels
Use VERIFIED, PARTIAL, NOT CONFIGURED, FAILED, NOT TESTED. HTTP 200, visible UI, code presence, secret-name presence, a token being generated, or Wrangler dry-run alone does not prove an end-to-end workflow.

## 2026-10-12 — Catalog sync 429 resilience follow-up
- Root cause of the saved failure: the upstream Sakoonsay Shopify listing endpoint returned HTTP 429 on page 1 after the scheduled sync's retries. A direct read-only request later returned HTTP 200, consistent with a transient throttle.
- Deployed Worker `c9ea223e-7a4c-476c-95c5-1f4d7aa0b0ff` now caches successful source-handle snapshots and lets scheduled sync continue from the last good snapshot when the listing endpoint is rate-limited. Such a run is recorded as PARTIAL with a warning until fresh listing data is available. This also fixes a scheduled-run reference to an undefined `discoveryWarning` variable.
- Validation: `node --check src/worker.js` and Wrangler deploy dry-run passed. No catalog-specific test file exists. Live `/api/health` is healthy and public `/api/catalog` returns 385 items; read-only D1 reports 385 products / 245 available with no rows written by verification.
- The displayed FAILED status and last-run timestamp still belong to the previous 2026-10-12 02:01 UTC run. Deployment does not execute a sync; the first post-fix owner-triggered or scheduled sync remains NOT TESTED. Do not report the catalog refreshed until that run succeeds.

## 2026-10-12 — Final live verification and market setup
- Latest Worker deployment: 975882c4-f2aa-4380-84b0-52a420a93876.
- Store and Worker pages both returned HTTP 200; Worker /api/health returned ok=true; /api/catalog returned 388 products.
- Owner-triggered catalog sync completed at 2026-10-12T05:58:10.475Z: 8 updated, 0 failed. D1: 388 products, 249 available, latest product update 2026-10-12 05:58:10. Current sync status is complete and the error is empty. The earlier FAILED banner was stale from the 02:01 UTC HTTP 429 attempt.
- Added separate Thailand and South Korea buyer-discovery controls and country-filtered seller/buyer lead lists, plus owner-only search status and a qualified-prospect-only internal deal-draft board. Market-deal rows: 0.
- Current unverified prospects: Thailand sellers 10; Korea sellers 0; Thailand buyers 0; South Korea buyers 0; Pakistan buyer/channel prospects 4. Only Thailand seller discovery has a recorded successful run. Owner-only discovery API requests currently return 401 because the browser is logged out after deployment; no new searches were run.
- Free scheduling keeps the existing three Cron triggers and rotates one prospect search per day among five lanes; public Overpass requests are sequential. No billing plan, outreach, quote, purchase, or order was made.
- THB/KRW rates and cross-border tax, shipping and landed-cost rules are not configured. The internal deal board cannot prepare customer-ready prices until those inputs are verified and owner-approved.
- Validation: JS syntax and Wrangler dry-run passed; both generated inline scripts parsed from the live page passed node --check; no new browser console errors after final deploy. The full suite was not run.
## 2026-10-12 — Latest deployed discovery fix
The current Worker is `7b3f2994-50b6-4731-b33d-a0e3dfd6858b` (100% traffic). Korea prospect search now begins with a 30 km radius and has Korean-language matching; the buyer search uses local-language fallback queries and falls back to Photon when Overpass returns an empty set. Webhook verify token is now held as a Cloudflare secret instead of a plain Wrangler variable. The production health endpoint is `ok:true`; the Worker and Store catalog APIs both return 388 products / 249 available.

The latest browser reload signed the owner out. Therefore, the fixed Korea/Thailand buyer searches still need to be run from an authenticated owner session. Latest saved prospect totals: TH sellers 10; KR sellers 0; TH buyers 0; KR buyers 0; Pakistan buyer/channel leads 4. These totals are public unverified leads. WhatsApp webhook readiness is unresolved; the dashboard reports the app secret missing. Crisp will downgrade to Free in two days if no card is added; no card or paid plan was set up. Store initially showed an old 385 count, then after page reload displayed “Live catalog connected”, 388 products and 249 in stock, matching both live catalog APIs.

Validation after changes: all 31 tests pass, Wrangler dry-run passes, and the deployed health/catalog endpoints return success. No outbound messages or transactions were made.


## Latest production state - 2026-10-12 22:56 Pakistan time
- The PakThai AI support-chat Worker route and country-selector storefront patch have now been deployed. Production Worker root and `/api/catalog` return HTTP 200. `GET /api/support/chat` returns 405, and an empty-message JSON POST returns 400 before rate-limit/catalog handling.
- Production Store `https://pakthai-tech-store.pages.dev/` returns HTTP 200 and includes the AI Support tab, `orderCountry` selector and versioned app.js URL. The versioned app.js returns HTTP 200 and contains the support-chat API endpoint and country_code payload. Cache busting and no-cache headers were added; release was staged without backup files.
- Validation: `npm.cmd test` 65/65 pass; relevant Node syntax checks pass; Worker Wrangler dry-run pass. Pages preview deployment: `https://e7d1f90b.pakthai-tech-store.pages.dev`.
- VERIFIED: Worker/Store deploy and static wiring. NOT TESTED: successful production AI chat response, because a successful POST writes the public IP rate-limit counter in production D1; no production test write was made. NOT VERIFIED: WhatsApp Pakistan sender identity, webhook and delivery; no test message was sent. Keep Crisp as the human-support fallback. Do not claim live lead-to-partner notifications until authenticated diagnostics and authorized recipient delivery are confirmed.
- Final Pages cache-policy release preview: `https://85fa9a16.pakthai-tech-store.pages.dev`. Final production smoke checks confirm Store HTTP 200, AI tab/country selector/versioned script present, versioned JS includes support API/country_code, and homepage/app.js both send no-cache/no-store headers. Worker root and catalog remain HTTP 200.


## 2026-10-12 23:15 Pakistan time — support/routing validation follow-up
- Re-read the current source of truth, handover, Master Plan, and recent release entries before resuming. Continued the deployed custom AI support + country-routing work; no webhook-first redesign was introduced.
- Current local full test suite initially exposed two stale storefront smoke-test expectations: they required the exact unversioned `/app.js` tag even though the live storefront intentionally uses a cache-busted `app.js?v=...` URL. Created timestamped backups under `_MASTER_CONTROL/snapshot/pre-test-cache-bust-fix-20261012-2312/` and updated only those two test assertions to accept optional query strings; application/runtime code was not changed.
- Re-run result: `npm.cmd test` PASS, 65/65; all `src/*.js` and storefront `app.js` syntax checks PASS; `npx.cmd wrangler deploy --dry-run` PASS (383.41 KiB / 82.90 KiB gzip; D1 and AI bindings present).
- No production deploy, production D1 write, external message, WhatsApp test, email outreach, billing change, or partner notification was performed. Live AI response and end-to-end partner notification remain NOT TESTED/NOT VERIFIED. Next implementation priority remains safe local synthetic end-to-end routing/idempotency validation and Owner partner-management UI review, then request explicit release approval before deployment.


## 2026-10-12 23:30 Pakistan time — customer routing edge validation
- Inspected the current dashboard source: an Owner-only Sourcing Partner Management panel is already present with add/list/activate/deactivate actions; no duplicate panel or new production route was needed.
- Backed up `tools/audit/lead-routing.test.mjs` to `_MASTER_CONTROL/snapshot/pre-routing-edge-tests-20261012-2325/` before changes.
- Added local synthetic tests for customer-intake honeypot rejection, invalid email, malformed ISO country code, and confirmed no customer-request insert on rejected input. Clarified the no-active/no-matching-partner test name to reflect Owner-review fallback. No live customer data was used.
- Focused routing tests PASS 4/4; complete suite PASS 67/67; routing test syntax PASS; Wrangler deployment dry-run PASS (383.41 KiB / 82.90 KiB gzip; D1 and AI bindings present).
- No production deploy, production D1 write, external message, email outreach, WhatsApp test, billing change, or Cron change was performed.
- Remaining blockers are explicit: true duplicate-submission idempotency is not yet proven/implemented by these tests; real authenticated Owner dashboard data and partner directory contents are not inspected in this turn; external partner notification and live AI end-to-end remain NOT VERIFIED. Continue local idempotency design/tests before any production release.


## 2026-10-12 23:40 Pakistan time — retry-safe customer intake (LOCAL, NOT DEPLOYED)
- Added optional idempotency_key support to POST /api/customer-requests: validated key format, a D1 column plus unique index, and lookup-before-write so a completed request retry returns the original request instead of creating another buyer requirement, request, or internal notifications. Legacy callers without a key remain compatible.
- Store order/quote form now creates a stable key for the same unchanged payload, reuses it after a failed/uncertain response, rotates it when form content changes, and ignores a second submit while one is in flight. Store HTML points to app.js?v=20261012-idempotency.
- Added synthetic tests for retry deduplication, saved key persistence, inactive partner fallback, unmatched partner fallback, invalid key, honeypot, invalid email, malformed country and unsupported request type. Public storefront smoke test now asserts idempotency wiring and cache-bust version.
- Final local checks: syntax checks PASS; full suite PASS 71/71; Wrangler deploy dry-run PASS (384.39 KiB / 83.14 KiB gzip, D1 + AI bindings).
- Read-only live checks: Worker health HTTP 200, catalog 388 products, Store HTTP 200. Live Store HTML still does NOT reference the new cache version and live JS does NOT contain the idempotency code, confirming this local change is not deployed.
- No production deployment, production D1 write, external email/WhatsApp message, billing change, or Cron change occurred. Per release gate, production rollout remains pending explicit Owner deployment approval. Even after rollout, real partner delivery and live customer end-to-end must be separately verified; no external partner message was sent.


## 2026-10-12 23:45 Pakistan time — idempotent retry/rate-limit edge case
- Tightened the retry path so a valid, already-completed idempotency key is checked before consuming another public-request rate-limit attempt. The first attempt still goes through rate limiting; a completed retry returns the existing request early.
- Expanded the synthetic test to prove the retry does not create another buyer, requirement, customer request, or notification and does not consume a second rate-limit attempt. Inactive-partner fallback is also covered.
- Final rerun after this refinement: syntax checks PASS; full suite PASS 71/71; Wrangler dry-run PASS (384.96 KiB / 83.17 KiB gzip; D1 and AI bindings present).
- Live read-only checks still show the old production version. This is a LOCAL release candidate only; no deploy, D1 write, or external message was performed. Deployment remains gated by explicit Owner release approval.

## 2026-10-13 — free-first customer-intake release (DEPLOYED; external delivery still unverified)
- Owner directed execution according to the canonical Master Plan and existing free-of-cost design. No paid provider, billing/payment method, or Cron trigger was added.
- Before deployment: timestamped source/docs backups preserved; `npm.cmd test` PASS 71/71; focused lead-routing tests PASS 8/8; `npx.cmd wrangler deploy --dry-run` PASS with D1 + Workers AI bindings.
- Worker deployed to `https://pakthai-ai-sourcing.pakthaitech.workers.dev/`; Wrangler reported active version `2da2f5bf-b527-45de-9bba-41d07a35ef0c`. Existing three Cron schedules remain unchanged: `0 2 * * *`, `0 4 * * *`, `0 * * * *`.
- Storefront deployed to production alias `https://pakthai-tech-store.pages.dev/`; preview deployment `https://33c3d824.pakthai-tech-store.pages.dev`. Clean staging excluded backup artifacts.
- Post-deploy read-only checks PASS: Store homepage HTTP 200; versioned `app.js?v=20261012-idempotency` HTTP 200 and contains `idempotency_key` + duplicate-submit guard; Worker root HTTP 200; `/api/health` returns `ok:true`; `/api/catalog` returns 388 products; `GET /api/support/chat` returns 405 and empty-message POST returns 400 before AI/rate-limit processing. Cache-control remains `no-cache, no-store, must-revalidate` on Store HTML/JS.
- No successful customer request was submitted to production, so the new idempotency path and live AI answer were NOT end-to-end exercised on production; no production customer/test D1 row was created for verification. Local HTTP E2E previously remained blocked by isolated Wrangler D1 setup, while mock/synthetic automated tests passed.
- Owner-only sourcing-partner directory and internal country routing are deployed; external partner email/WhatsApp notifications remain disabled/not verified. Korea/Nadeem assignment depends on the Owner adding/confirming the real partner entry; no contact details were guessed. Crisp remains available as fallback.
- WhatsApp production sender/webhook/delivery, real partner alert delivery, and live customer AI response remain NOT VERIFIED. No external message, email outreach, order, quote, purchase, payment, billing change, or extra Cron trigger was created by this release.
- Documentation backup: `_MASTER_CONTROL\snapshot\pre-release-docs-'@+$stamp+'\`.


## 2026-10-13 — free-first customer-intake release (DEPLOYED; external delivery still unverified)
- Owner directed execution according to the canonical Master Plan and existing free-of-cost design. No paid provider, billing/payment method, or Cron trigger was added.
- Pre-deploy validation: timestamped backups preserved; `npm.cmd test` PASS 71/71; focused lead-routing tests PASS 8/8; Wrangler deploy dry-run PASS with D1 + Workers AI bindings.
- Worker deployed: https://pakthai-ai-sourcing.pakthaitech.workers.dev/ ; version ID `2da2f5bf-b527-45de-9bba-41d07a35ef0c`. Existing three Cron schedules unchanged: `0 2 * * *`, `0 4 * * *`, `0 * * * *`.
- Storefront deployed to production alias https://pakthai-tech-store.pages.dev/ ; preview https://33c3d824.pakthai-tech-store.pages.dev. Clean staging excluded backup artifacts.
- Post-deploy read-only checks PASS: Store homepage HTTP 200; versioned `app.js?v=20261012-idempotency` HTTP 200 and contains `idempotency_key` plus duplicate-submit guard; Worker root HTTP 200; `/api/health` returns `ok:true`; `/api/catalog` returns 388 products; `GET /api/support/chat` returns 405 and empty-message POST returns 400 before AI/rate-limit processing. Store HTML/JS cache-control remains `no-cache, no-store, must-revalidate`.
- No successful customer request was submitted to production, so the idempotency path and successful live AI response were NOT end-to-end exercised on production. No production customer/test D1 row was created for verification. Local HTTP E2E previously remained blocked by isolated Wrangler D1 setup; mock/synthetic automated tests passed.
- Owner-only partner directory and internal country routing are deployed. External partner email/WhatsApp notifications remain disabled/not verified. Korea/Nadeem assignment depends on the Owner adding/confirming the real partner entry; no contact details were guessed. Crisp remains available as fallback.
- WhatsApp production sender/webhook/delivery, real partner alert delivery, and live customer AI response remain NOT VERIFIED. No external message, email outreach, order, quote, purchase, payment, billing change, or extra Cron trigger was created by this release.


## 2026-10-13 — post-check deployment confirmation
- Rechecked immediately before redeploy: `npm.cmd test` PASS 71/71; `npx.cmd wrangler deploy --dry-run` exit 0 with D1 + Workers AI bindings; storefront `node --check app.js` exit 0.
- Worker then deployed successfully after checks. Latest confirmed active Worker Version ID: `0ecbbb70-1022-417e-9532-3b0a2d58cbea`. Existing Cron schedules unchanged: `0 2 * * *`, `0 4 * * *`, `0 * * * *`.
- Post-deploy read-only checks: Worker health HTTP 200, catalog HTTP 200 with 388 products, production Store HTTP 200, versioned JS HTTP 200 and includes both `idempotency_key` and `orderSubmissionInFlight` duplicate-submit guard.
- Storefront was already deployed and was not unnecessarily redeployed. No production customer request, real AI conversation, external partner notification, WhatsApp send, billing change, or additional Cron was triggered for verification. End-to-end customer request + partner delivery remain unverified; Crisp remains fallback.


## 2026-10-13 — customer-request privacy hotfix
- Security review found the customer-request list route could reach its data query without an explicit Owner-role check. Added an Owner-only guard before reading any customer-request records; unauthenticated and read-only staff requests are denied with HTTP 401.
- Backup of the pre-hotfix Worker: `_MASTER_CONTROL/snapshot/pre-customer-requests-auth-20261013-083134/worker.js`.
- Validation before deployment: `node --check src/worker.js` PASS; `npm.cmd test` PASS 71/71, including unauthenticated `GET /api/customer-requests` authorization test; `npx.cmd wrangler deploy --dry-run` PASS with D1 + Workers AI bindings.
- Deployed Worker version: `4ba09a39-3151-4bc4-bb61-25804619f4f3`. Existing three Cron schedules unchanged.
- Post-deploy read-only checks PASS: `/api/health` HTTP 200; `/api/catalog` HTTP 200 with 388 products; unauthenticated `GET /api/customer-requests` HTTP 401; Storefront HTTP 200.
- No production customer records were read, created, or modified during verification. Customer-request successful POST/idempotency, live AI answer, partner delivery, and WhatsApp delivery remain NOT VERIFIED; Crisp remains fallback. No paid service or outbound message was enabled.


## 2026-10-13 — Owner-only customer approval hardening
- Security review confirmed that general API authentication permits approved staff read-only access; customer request records and approval decisions are Owner-only. Added an explicit Owner-role guard before both GET and POST `/api/customer-approvals`, so staff cannot read private request data or make approval decisions. The `/api/customer-requests` GET route also retains its explicit Owner-only guard.
- Backup: `_MASTER_CONTROL/snapshot/pre-approval-auth-20261013-084103/` (Worker and authorization test).
- Validation: Worker syntax PASS; focused route authorization + lead-routing tests PASS 41/41; full `npm.cmd test` PASS 73/73; Wrangler dry-run PASS with D1 and Workers AI bindings.
- Deployed Worker version: `d45e10e7-1a91-4190-827c-a2c6d529bc3a`. Existing Cron schedules unchanged.
- Live read-only checks PASS: health HTTP 200; catalog HTTP 200 / 388 products; unauthenticated GET customer requests HTTP 401; unauthenticated GET and POST customer approvals HTTP 401; empty support-chat POST returns HTTP 400 before AI processing; Storefront and versioned app.js HTTP 200, with custom AI chat and idempotency client code present.
- No customer data was retrieved, no production customer row was created, and no external message was sent. Successful customer POST/idempotency, live AI reply, partner notification delivery, and WhatsApp delivery remain NOT VERIFIED. Crisp remains available as fallback; no paid service or extra Cron trigger added.


## 2026-10-13 — production idempotency schema + Owner dashboard routing clarity
- Read-only production D1 schema inspection found `customer_requests.idempotency_key` and its unique index were absent until a customer submitted the first request. Applied the additive schema-only migration `ALTER TABLE customer_requests ADD COLUMN idempotency_key TEXT` and `CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_requests_idempotency_key ON customer_requests(idempotency_key)`. No customer rows were read or changed by this migration; only schema/index metadata changed.
- Verified production schema: idempotency column present (1), unique index present (1). The production partner directory currently contains zero active partners, including zero active South Korea partners; country-matched requests therefore correctly remain in Owner review until the Owner adds/activates verified partner details. No partner/contact record was invented or inserted.
- Owner dashboard customer-request approval table now shows customer contact, country, request type/note, budget, assigned partner, and a clear Owner-review fallback when no active country partner exists. Contact details are fetched only through the Owner-only approval API.
- Validation: full test suite PASS 74/74; Worker syntax PASS; Wrangler dry-run PASS. Worker deployed successfully: `db044e5d-5fae-4f3b-af16-fcb9d7a3b180`; existing three Cron schedules unchanged.
- Post-deploy live checks PASS: dashboard HTTP 200 and new routing columns present; health HTTP 200; catalog HTTP 200 / 388 products; unauthenticated customer-request GET and customer-approval GET/POST all HTTP 401; empty support-chat POST HTTP 400 before AI; Storefront and versioned JS HTTP 200, custom AI chat and idempotency client code present.
- Successful live customer POST/idempotency, non-empty AI response, partner delivery, and WhatsApp delivery remain NOT VERIFIED. No customer test row or outbound message was created; no paid service or extra Cron trigger added. Crisp remains fallback.


## 2026-10-13 — latest verified production state
- Active Worker version: `589d8a12-ad82-4b59-812b-9b59422990ef` at https://pakthai-ai-sourcing.pakthaitech.workers.dev/.
- Validation: Worker syntax PASS; full test suite 74/74 PASS; Wrangler dry-run PASS; live health 200; catalog 200 / 388 products; storefront 200; unauthenticated customer-request and customer-approval reads return 401.
- Existing Cron schedules remain `0 2 * * *`, `0 4 * * *`, `0 * * * *`. Free-first constraint preserved: no paid provider/billing or additional Cron.
- NOT VERIFIED: successful non-empty production AI response, production customer POST/idempotency, active verified Korea partner, partner notification delivery, and WhatsApp sender/webhook/receipt. No customer test row or outbound message was created. Crisp remains fallback.


## 2026-10-13 — latest AI repair and production verification
- Latest active Worker version: `03600fb8-4799-4bd9-aff0-1ba9e3bf34ca`.
- Root cause for chat fallback was a deprecated Workers AI model (`@cf/meta/llama-3.1-8b-instruct`, deprecated May 30, 2026). Replaced with active `@cf/meta/llama-3.1-8b-instruct-fast`; bounded safe diagnostic logging added. Backups are `src/support-chat.js.pre-ai-diagnostic-20261013.bak` and `src/support-chat.js.pre-model-fix-20261013.bak`.
- Validation: syntax PASS, full test suite 74/74, Wrangler dry-run PASS; live chat smoke tests now return HTTP 200 with `mode=ai` for general and catalog-related prompts. Health 200, catalog 388 products, storefront 200, unauthenticated customer-request/approval reads 401.
- Cron schedules unchanged: `0 2 * * *`, `0 4 * * *`, `0 * * * *`. Free Workers AI has a 10,000-neuron/day allocation; fallback remains for quota/provider errors.
- Remaining NOT VERIFIED: successful customer-request POST/idempotency, verified active Korea partner, partner alert delivery, WhatsApp sender/webhook/receipt. No customer test record or external message created; Crisp remains fallback.


## 2026-10-13 — Verified local customer intake E2E and live read-only smoke checks
- Latest Worker version: `03600fb8-4799-4bd9-aff0-1ba9e3bf34ca`.
- `npm.cmd test`: 74/74 PASS. Live AI support: HTTP 200 `mode=ai` for greeting and RTX 4060 question. Worker root 200, public catalog 200 / 388 products, Storefront 200; private customer-request and approval GETs return 401 without Owner session. Invalid public intake inputs (honeypot, malformed idempotency key, empty body) return 400.
- Safe local E2E using Wrangler local D1 only: synthetic first request HTTP 201; duplicate retry HTTP 200 `duplicate:true`, same request ID; local database count remains one customer request and one buyer; internal Owner dashboard notification created; absent KR partner results in unassigned Owner-review fallback. Local server stopped. The local database was initialized from the preserved local schema snapshot; no remote D1 flag was used.
- Production successful POST/idempotency and Owner browser approval remain intentionally NOT VERIFIED. No production customer/test row, order, quote, payment or outbound message was created. Active verified South Korea partner remains absent until Owner confirms real partner details. External partner email/WhatsApp and WhatsApp webhook/delivery remain NOT VERIFIED. Crisp remains fallback; no paid billing and no additional Cron triggers.


## 2026-10-13 — comprehensive post-deploy regression results
- Production active Worker verified at 100% traffic: `03600fb8-4799-4bd9-aff0-1ba9e3bf34ca`.
- Worker syntax PASS; `npm.cmd test` PASS 74/74 (0 failures/skips); Wrangler deploy dry-run PASS (386.09 KiB / 83.43 KiB gzip, D1 + AI bindings).
- Live: Worker root/health/store/app.js/catalog all HTTP 200; catalog 388 products; app.js includes idempotency and duplicate-submit guard. Private customer request/approval GETs return 401 without Owner session. Invalid intake honeypot, malformed idempotency key, and empty payload each return 400. Live chat greeting and RTX 4060 query each return HTTP 200 `mode=ai`; model does not claim a verified catalog match.
- Local real-handler/local-D1 E2E: first synthetic request 201, same-key retry 200 duplicate true with same ID; exactly one request and buyer, internal Owner notification; no verified KR partner leads to Owner review. Production customer tables were not written.
- Cron schedules unchanged: `0 2 * * *`, `0 4 * * *`, `0 * * * *`. No paid billing or outbound messages triggered.
- Still NOT VERIFIED: Owner browser login/approval E2E, verified active South Korea partner, partner email/WhatsApp delivery, and WhatsApp inbound/outbound receipts. Thus technical regression is PASS, but end-to-end business integration is PARTIAL pending real Owner/partner setup and authorized delivery tests.


## 2026-10-13 — step-by-step regression verification (second pass)
- Active Worker confirmed: `03600fb8-4799-4bd9-aff0-1ba9e3bf34ca`, 100% traffic. `node --check src/worker.js`, `node --check` storefront app.js, 74/74 automated tests, and Wrangler deploy dry-run all PASS.
- Live public site and API: Worker health 200; catalog 200 / 388 products; storefront and versioned app.js 200; order form fields exist; app.js contains duplicate guard/idempotency key. Live AI greeting and RTX 4060 query both HTTP 200 `mode=ai`; no unverified catalog match claimed. Invalid intake honeypot, malformed key and empty body each HTTP 400.
- Session check: `/api/auth/me` unauthenticated indicates no session; incorrect Owner login 401; private customer request/approval, sourcing partner and WhatsApp inbox GET endpoints each 401 without session. Other unauthenticated mutation gates covered by automated authorization tests.
- Local D1 E2E: synthetic request 201, same-key retry 200 same ID; one local request/buyer and Owner notification; no KR partner means Owner-review fallback. No production customer data created.
- NOT VERIFIED: Owner browser login/approve-reject click-through, real active verified Korea partner, external email/WhatsApp delivery and WhatsApp receipts. No external messages, billing changes or Cron changes. Status: technical regression PASS, full business workflow PARTIAL.


## Current state — 2026-10-13 provider audit (supersedes older provider TODOs above)
- Latest active Worker version: 7a28cad7-1647-4e73-97b0-5ecbfab6a077 (100% production traffic per successful deploy output).
- Current verified live checks: /api/health HTTP 200; /api/catalog HTTP 200 / 388 products; public support chat returns HTTP 200 mode=ai for a greeting and an RTX 4060 query. The assistant correctly says there is no verified RTX 4060 match rather than inventing one.
- The support model is now Z.ai GLM-4.7-Flash through the existing Cloudflare Workers AI binding, not Meta Llama. The model's reasoning mode is disabled for short support replies, and output parsing handles the model's choices[].message.content response. Full test suite 75/75 PASS; Worker syntax PASS; Wrangler dry-run PASS.
- Backups for this migration are under _MASTER_CONTROL/snapshot/pre-provider-audit-20261013-073200/, pre-glm-response-shape-20261013-074300/, pre-glm-diagnostic-20261013-080000/, and pre-provider-migration-docs-20261013-081500/.
- Owner's new priority supersedes older WhatsApp setup instructions: do not repeat Meta/Google configuration loops as the primary plan. Do not send external messages until a new provider is configured and a controlled test is explicitly authorized.
- WhatsApp automation is still Meta Graph API-based; its dashboard showed NO APP SUBSCRIBED, NONE FOUND for approved templates, and historical messages have no confirmed delivery receipt. Do not claim WhatsApp delivery or treat API accepted as Delivered.
- Email automation/inbox is still Gmail API/OAuth-based. The displayed DSN excerpts are truncated before the full remote SMTP response; the precise causes for each bounce are NOT VERIFIED. Do not assume a different sender fixes invalid recipient addresses.
- No verified active South Korea partner exists in the production partner directory (latest source-of-truth says zero active partners). Customer request production POST/idempotency and Owner browser approval remain NOT VERIFIED. Crisp remains fallback until a full handoff replacement is verified.
- Hosting decision: keep Cloudflare for now; live Worker/AI/catalog are working and no evidence yet ties Cloudflare hosting to the email/WhatsApp delivery failures. Do not migrate hosting just to change providers. No paid plan, billing method, extra Cron, or external message was added.
- Candidate free-first messaging architecture: Telegram Bot API for internal/partner alerts after each recipient starts the bot; Resend free tier for outbound email after domain/sender verification; use a non-Google mailbox/forwarding target only after a custom domain and destination inbox are confirmed. Telegram is not a WhatsApp replacement for recipients who require WhatsApp. If the goal is to stop using Meta entirely, automated partner alerts must move to another channel rather than sending WhatsApp.
- Required next actions: (1) add a provider-neutral adapter with safe, explicit provider selection; (2) configure the chosen email domain/sender and Telegram bot/chat IDs without exposing tokens; (3) capture complete bounce diagnostics from Gmail's existing messages before closing those incidents; (4) test with one owner-approved recipient and record provider acceptance separately from recipient delivery; (5) only then retire Gmail/Meta paths and update dashboard labels. Remove-record cleanup remains lower priority.


## Latest state — 2026-10-13 09:15 Pakistan time (supersedes earlier provider-migration status)
- Latest active Worker version: bf8613fe-0594-4beb-a172-79f3b9f145a6.
- Automated Meta WhatsApp outbound is now deliberately PAUSED. Dashboard test button and hardcoded Nadeem recipient were removed. WhatsApp diagnostics, webhook-subscribe, template-test and send endpoints return paused/fail-closed responses before a Meta Graph API call. The Owner queue only approves/sends email; historical WhatsBox records remain readable. Store manual WhatsApp contact link is unchanged.
- Support chat runs Z.ai GLM-4.7-Flash through Workers AI (not Meta Llama). Live support greeting returns HTTP 200 mode=ai. Health 200; catalog 200 / 388 products. Live dashboard HTTP 200; inline JS syntax PASS; paused banner present; old test button and hardcoded Nadeem test text absent.
- Resend adapter is implemented for approved outbound email notifications and account-security emails. It is only activated by OUTBOUND_EMAIL_PROVIDER=resend and requires RESEND_API_KEY plus a verified RESEND_FROM_EMAIL. The adapter is tested with mocked fetch only; no real email was sent. Default provider remains Gmail until the sender domain/API key are configured.
- Gmail inbox and auto-reply polling still depend on Google. Full bounce diagnostics have not been extracted from the existing messages; the user-provided snippets cut off before the SMTP response. Do not guess why each recipient bounced.
- Automated WhatsApp sending is not a working alternative now; it is paused intentionally while the provider migration is prepared. No new external messages were sent. No paid service/billing was enabled.
- Full tests 77/77 PASS; syntax checks PASS; Wrangler dry-run PASS. Existing Cron schedules unchanged.
- Required next steps: verify a custom domain and Resend sender, add the API key as a Worker secret (never in chat/source), set OUTBOUND_EMAIL_PROVIDER=resend, test against one Owner-approved recipient only after explicit authorization, then migrate the inbox to a non-Google mailbox/forwarding destination. For partner alerts, prepare Telegram Bot API support and capture partner chat IDs only after recipients start the bot. Telegram is not WhatsApp; Meta is not needed if partner automation uses Telegram/email instead.
- Current hosting decision: keep Cloudflare for now. Live app, catalog and AI are healthy; no evidence indicates Cloudflare caused the delivery failures. No paid billing, extra Cron, production customer test row, order, quote, payment or external message was added.


## Latest verification — 2026-10-13 09:40 PKT
- Latest active Worker: 06ba88a4-5e9e-4a25-858e-b4146034aa80.
- Full tests 78/78 PASS, syntax PASS, Wrangler dry-run PASS, live health 200, catalog 388 products, support chat mode=ai, dashboard inline JavaScript syntax PASS.
- Meta WhatsApp API outbound routes are paused per Owner decision; no template test, webhook subscription, or API send is executed. Historical records remain readable; Store manual WhatsApp link unchanged.
- Resend outbound adapter is present and mock-tested, but not active. Gmail remains default until verified sender domain and API key are configured.
- Gmail multipart parsing now collects delivery-status diagnostic parts as well as the plain-text summary. This should expose the actual SMTP reason in the existing bounce messages; inspect those existing messages after refresh before declaring any particular recipient failure fixed.
- No external messages, customer test rows, paid billing, new Cron triggers, orders, quotes or payments were created.
- Current next steps: verify custom domain and Resend sender; securely set Resend key; switch outbound provider; test one approved recipient only after explicit authorization; migrate inbox to a non-Google mailbox/forwarding destination; then configure Telegram alerts after recipients start the bot. Remove-record cleanup remains lower priority.


## Latest state — 2026-10-13 10:00 PKT (supersedes earlier version IDs)
- Active Worker version: 916e9781-9310-44cd-b47b-58cabfa90ffb.
- Full test suite 79/79 PASS; syntax and Wrangler dry-run PASS; live health 200; catalog 388 products; support chat mode=ai; dashboard inline JS syntax PASS.
- Automated Meta WhatsApp outbound/setup/template-test endpoints are paused. No new Meta API send or setup request occurs. Historical WhatsBox records remain readable; manual Store WhatsApp link remains.
- Resend adapter supports Owner-approved notification email and account-security email, but no Resend key or verified sender domain is configured.
- Outbound notification queue now fails closed with 503 when no provider is explicitly configured; it no longer silently falls back to Gmail. Account-security email and Gmail inbox/auto-reply remain legacy Google dependencies temporarily. Do not claim Google is fully removed.
- Gmail multipart parser now returns text/plain plus message/delivery-status/RFC822 diagnostic parts. Refresh Inbox Center and open existing failure notices to see the full SMTP diagnostic. The actual recipient-specific reasons are still NOT VERIFIED until those full details are read.
- No external message, paid service, billing change, extra Cron, order, quote, payment or production test row was created.
- Next: verify a custom email domain/sender; securely add RESEND_API_KEY and RESEND_FROM_EMAIL; set OUTBOUND_EMAIL_PROVIDER=resend; approve one controlled test only after explicit authorization; migrate Gmail inbox to a non-Google mailbox/forwarding target; then implement Telegram alerts after recipients start the bot. Remove-record cleanup remains lower priority.


## 2026-10-13 — Telegram adapter status (latest)
- Worker version a31f3374-581b-4ebd-b0fa-f11f783e884f is deployed. Telegram Owner-alert adapter is implemented and live at /api/notifications/telegram-status and /api/notifications/telegram-send.
- Both routes require a valid Owner session. The recipient is fixed by TELEGRAM_OWNER_CHAT_ID; request JSON cannot choose another chat. Send accepts only a bounded message body. The status endpoint reports configuration booleans only and never exposes credentials.
- Tests: 83/83 pass; syntax and Wrangler dry-run pass. Live health 200; catalog 388; unauthenticated Telegram status correctly returns 401.
- Not activated: TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_CHAT_ID are not configured. No real message was sent. After creating a bot with Telegram BotFather, Owner must start the bot and obtain the chat ID, then add both as Worker secrets/bindings in Cloudflare. Never paste the bot token into this chat.
- Scope is currently manual Owner alerts only, not automated customer/partner forwarding. Google Inbox/auto-reply/account-security email remain. Meta outbound remains paused. Cloudflare hosting remains because live service works; no paid billing or domain purchase required for Telegram.


## 2026-10-13 — latest Telegram diagnostic release
- Active Worker version: 23ff45fa-496c-4af5-ba31-9ee72aed6cd2.
- Verified post-deploy: health 200; catalog 388 products; storefront 200; full test suite 84/84; syntax checks and Wrangler dry-run PASS.
- Telegram secrets previously reported configured, but actual delivery is NOT VERIFIED. Prior send failed with Telegram HTTP 400; the deployed code now provides a bounded redacted error description. Owner-session-only status returns 401 without an authenticated browser session, as designed.
- No customer/partner message, email, Meta send, production customer row, billing change or Cron change was made.


## 2026-10-13 — subrequest-budget repair and live D1 audit
- Active Worker version: c798d782-3ea3-4c77-8c71-a9c13ca3dc4b. Full test suite 85/85 PASS; syntax and Wrangler dry-run PASS; live health/catalog/store HTTP checks PASS (388 products).
- Fixed subrequest exhaustion: public buyer prospect inserts now use one D1 batch (tested with 60 leads); catalog product writes are batched; catalog fetch retries reduced to three and runtime budget errors are not retried. Production's old catalog status is still PARTIAL (48 saved, 2 failed) from before deployment; a new sync is required to verify recovery.
- Read-only live prospect counts: Thailand seller 10, South Korea seller 1, Thailand buyer 78, South Korea buyer 78; all are unreviewed public prospects, not confirmed business leads. One active KR partner row exists; verify identity/contact details before relying on it. No market deal drafts, sellers, or opportunities are active.
- Cost inputs remain incomplete: pickup, packing, freight, duty, payment fee, Pakistan transport and contingency rates are 0; no customs rates or freight quotes are present. THB/KRW reference settings exist, but FX table rows are dated 2026-09-27. Quotes must remain blocked until costs are verified.
- Telegram send remains NOT VERIFIED; previous HTTP 400 diagnostic requires one Owner-session test. Meta automated WhatsApp stays paused, Resend is not active, Gmail inbox/account-security remain legacy. No external messages or paid services were used.


## Latest release — 2026-10-13 (discovery batching)
- Current deployed Worker version: `f5e6b51e-d1a4-4af5-9b55-8c33c59a92c6`.
- Additional safe fix: Pakistan buyer discovery now batches D1 writes in groups of at most 80; external prospect imports do likewise (up to 100 validated rows, in 80+20 batches). Regression tests added and included in `npm test`.
- Verified: 87/87 automated tests pass; both edited modules pass `node --check`; Wrangler dry-run passes; live health/catalog/storefront return HTTP 200 and catalog returns 388 products. Unauthenticated sync/discovery/Telegram endpoints return 401.
- Not yet verified live: fresh authenticated catalog sync (old PARTIAL status is stale), South Korea buyer discovery, Telegram delivery to the configured Owner chat. These require a valid Owner browser session; no auth bypass or external outreach.
- Safety constraints unchanged: WhatsApp/Meta automation paused; no customer/prospect outreach or outbound email; no billing or new Cron; no quote/order/purchase/payment until landed costs/FX and partner identity are verified.


## Latest verified deployment — 2026-10-13
- Current Worker version: `34843f8e-5a27-4d5d-aecc-0dc03b0a4f52` at 100% traffic.
- Additional D1 hardening: Pakistan buyer discovery batches rows; it executes one search phrase per request across at most three cities to bound fallback fetches; external prospect import batches up to 100 rows in chunks of 80.
- Automated suite: 87/87 passing in sequential mode; Wrangler dry-run passes. Live Worker health 200, catalog 200 / 388 products, storefront 200. Unauthenticated Owner-only sync/discovery/Telegram routes return 401.
- Not finished operationally until Owner-authenticated runs: catalog sync (stored status still old PARTIAL until a fresh run), South Korea buyer discovery, and the one approved Telegram test to the Owner chat. WhatsApp/Meta remains paused. Do not invent partner details, freight/customs/FX rates, or claim quotes are ready.


## 2026-10-13 — Partner lead notification routing (free-first; Telegram deferred)
- Active Worker version: `ced3c2f8-b307-4be0-a6b4-31220cb22889` (100% traffic per successful Wrangler deployment).
- New provider-neutral partner notification helper: `src/partner-notifications.js`. A new country-matched customer request prepares an external partner lead message using the active matching partner's email first; if email is missing/invalid but a usable phone exists, it prepares a manual WhatsApp draft instead. If neither contact is usable, an Owner dashboard warning is created. Customer requests remain idempotent; retries do not create duplicate leads/drafts.
- Partner email messages include a lead reference, customer-provided contact, product/quantity, city/country, budget/target price when present, and a reminder not to promise unverified stock/prices/delivery. External messages remain `prepared` and require Owner review.
- Free-first email exception is deliberately narrow: when general `OUTBOUND_EMAIL_PROVIDER` is not configured, only `related_type='partner_lead'` approved email notifications may use the already-authorized Gmail OAuth account (existing Worker Google secrets + D1 OAuth token). Other notification email remains fail-closed. No paid domain or service added.
- Outbound queue now offers “Open manual email draft” / “Open manual WhatsApp draft” so the Owner can convey a prepared message without relying on Meta API. Opening a draft does not mark it sent; sending/delivery must be verified separately.
- Production partner directory read-only check: one active South Korea partner row, with both email and phone populated. Production currently has no customer request to notify, so no partner message/draft was manufactured and no external message was sent. Existing unverified prospect records are not treated as partners.
- Regression: full suite 91/91 PASS; rendered dashboard inline JavaScript syntax check PASS; Wrangler dry-run PASS (395.66 KiB / 85.02 KiB gzip); live health 200, catalog 200 / 388 products, storefront 200; unauthenticated notification/email-send routes return 401.
- Telegram remains deferred until last. Automated Meta WhatsApp sending remains paused. No customer/prospect outreach, order, quote, purchase, payment, billing or Cron change was performed.


## 2026-10-13 — Partner routing correction and production deployment
- Superseding active Worker version: `a3018f31-29ce-41f7-ba32-e6b4318fca51`.
- Corrected an important routing distinction: the customer's `country_code` is not assumed to be the sourcing market. Partner routing now uses explicit `sourcing_country_code` / `source_country_code` or clear source-market mentions (Korea, Thailand, Malaysia, Singapore, Australia). If no sourcing market is given and exactly one active buyer-capable partner exists, that sole partner is the default. If multiple partners are active and no sourcing market is clear, the lead stays in Owner review instead of guessing.
- Tests added for a Pakistan buyer routing to the sole active sourcing partner, and for an ambiguous lead not being sent to an arbitrary partner.
- Final validation before deployment: `npm.cmd test` 93/93 PASS; rendered dashboard inline scripts PASS; Wrangler dry-run PASS (396.82 KiB / 85.23 KiB gzip).
- Live after deployment: health 200; catalog 200 / 388 products; storefront 200; unauthenticated notifications and Gmail-send endpoints return 401.
- Production D1 was only read for partner configuration. No production customer request, test lead, partner notification, or external message was created/sent. Current production has one active South Korea partner with email and phone, and zero existing customer requests to forward.
- Partner lead email can use the existing authorized Gmail OAuth account only after the Owner approves the prepared `partner_lead` notification; general outbound email remains fail-closed when no provider is selected. If only phone is available, the dashboard opens a manual WhatsApp draft; Meta automated sending remains paused.
- Telegram intentionally deferred until last.

## 2026-10-18 — live AI Sourcing review
- Production Worker health is VERIFIED (`/api/health` HTTP 200); public catalog is VERIFIED at 448 products. A refresh already in progress completed at 2026-10-18 07:16:56 UTC with status `complete`, cursor 0, 0 failures, and 311 available products.
- The already-open Owner dashboard showed an older snapshot (397 products and an earlier HTTP 429 partial warning). Its display is stale until that same signed-in tab is refreshed. A newly opened tab displayed the login form; no authentication was repeated.
- Read-only authorization checks behaved as expected: `/api/sellers`, `/api/external-prospects`, and `/api/browser-push/config` returned 401 without a session; `GET /api/support/chat` returned 405; `/sw.js` returned 200. D1 has zero sellers, seller offers, opportunities, negotiations, buyer matches, quotations, orders, and purchases. Owner approval remains required. No outreach, customer request, purchase, or other business action was created.
- Fixed `tools/audit/store-routes.test.mjs` to resolve the Store and Worker files relative to the checked-out project instead of an obsolete absolute path. Backup: `_MASTER_CONTROL/snapshot/pre-portable-store-route-tests-20261018-0718/store-routes.test.mjs`.
- Validation: full suite PASS 112/112; test-file `node --check` PASS; Wrangler Worker dry-run PASS. No Worker runtime source changed, so no Worker redeployment was needed.
- Still PARTIAL/NOT VERIFIED: public prospect qualification, external partner/email/WhatsApp delivery, customer chat handoff, browser-push display, and landed-cost inputs. Keep Owner approval and outreach safeguards in place.
