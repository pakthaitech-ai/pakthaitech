# PAKTHAI TECH — FINAL SOURCE OF TRUTH
Last verified/updated: 2026-10-12 (Pakistan time)
Status: Current baseline. Read this before changing files.
Project root: `D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL`
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
