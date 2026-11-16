# PAKTHAI TECH — MASTER PLAN (CURRENT CANONICAL VERSION)
Last updated: 2026-10-12 (Pakistan time)
This file replaces the older mixed-status master plan. Previous version preserved at `_MASTER_CONTROL\docs\master-plan-history\MASTER_PLAN_VOICE_REVIEW.pre-final-2026-10-11.md`.

## Read first / precedence
1. `FINAL_SOURCE_OF_TRUTH.md` — latest status and non-regression rules.
2. `NEXT_CHAT_HANDOVER.md` — resume instructions for a new chat.
3. `_MASTER_CONTROL\reports\FINAL_PROJECT_STATUS_2026-10-11.md` — full development report.
4. `RELEASE_LOG.md` — chronological changes/deployments.
Older dated audits are historical evidence only. Never use their old counts or TODOs to revert current state.

## Project
- Project root: `D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL`
- Store: https://pakthai-tech-store.pages.dev/
- Worker: https://pakthai-ai-sourcing.pakthaitech.workers.dev/
- Worker service: `pakthai-ai-sourcing`
- D1 binding/database: `pakthai-sourcing-db`
- Worker entry: `src\worker.js`
- Discovery modules: `src\seller-discovery.js`, `src\buyer-discovery.js`
- Latest confirmed Worker deployment: `975882c4-f2aa-4380-84b0-52a420a93876`

## Owner-confirmed current UI state — 2026-10-11
- Store products and visible Store functions: owner checked and reports working.
- AI Sourcing dashboard, sales/adaptive tools, calculator and sales-address-related functions: owner checked and reports working.
- Store WhatsApp link opens: owner checked. Cloud API delivery/webhook/automatic reply are NOT VERIFIED and remain deferred.
- Crisp Live Chat initially spun continuously. Duplicate Crisp script/name collision was removed from Store source, Store was redeployed, HTTP checks returned 200 for Crisp client/embed/relay endpoints, and owner then confirmed it works. Do not reopen unless the owner reports a new issue.
These checks verify visible UI behavior only; they do not establish full end-to-end business automation.

## Production fresh-start baseline
Post-cleanup live counts on 2026-10-11:
- Sellers 0; seller offers 0; supplier offers 0; seller history 0.
- Opportunities 0; negotiations 0; buyer matches 0.
- Active prepared seller-lead notifications 0.
- Unreviewed Thailand seller prospects 5; unreviewed Pakistan buyer/channel prospects 4.
Old test accounts and older Thailand seller/outreach rows are archive-only. Old seller SQL seed scripts are disabled/comment-only. Never restore archives or recreate old test opportunities. Preserve all backup tables/files.

## Development delivered
- Worker-backed public-safe catalog endpoint and shared catalog architecture between Store and AI Sourcing.
- Catalog pagination/retry/status improvements and a recorded sorted source/D1 parity check for the 366-handle checkpoint on 2026-10-10. Earlier counts (362/366) are historical; latest market-discovery release report recorded 385 products. Recheck after scheduled sync; never delete rows merely to match an old count.
- Session/role authorization hardening and protected owner operations, while preserving public customer-request intake.
- Seller prospect discovery module, owner-only `POST /api/seller-prospects/discover`, discovery dashboard panel, daily scheduled discovery integration, and buyer-discovery fallback through Photon/Nominatim.
- South Korea seller discovery around Pyeongtaek (250 km screening radius from city centre), free OSM/Photon sources, dashboard action, daily cron, country-control gate and owner-only route. First live Korea run is pending owner login; distance is approximate and results are unverified.
- Scheduled prospect email sending and follow-ups are paused in the active Worker pending owner approval. Prior D1 status records 3 Gmail API sends on 2026-10-12 04:00 UTC; 3 active / 5 queued. Delivery/read is unverified.
- Fresh-start D1 cleanup and disabled old seller-seed scripts.
- Store Crisp duplicate-script fix and redeployment; owner confirmed UI now works.
- At the latest market-discovery release: 27 tests passed, 0 failed; syntax checks passed; Wrangler dry-run passed. This test result applies to that release, not every future code edit.

## Business and safety policy
- Free-first. Do not add paid services, billing, or payment methods without explicit approval.
- Owner approval required for binding quotes/prices, purchases, payments, orders, stock commitments, delivery promises and sensitive business commitments.
- No auto-purchase or auto-payment.
- No external prospect outreach without explicit owner authorization.
- Never print secrets, access tokens, passwords, OAuth secrets, or private owner files.
- Do not label public prospects as confirmed suppliers/buyers. Do not fabricate replies, rates, availability, intent or sourcing opportunities.
- Before each code edit, make a timestamped backup. Make narrow edits; run focused tests, syntax checks, Wrangler dry-run and diff review. Deploy only with explicit owner authorization and verify live state afterward.
- Never rewrite `src\worker.js` wholesale.

## 2026-10-12 — Multi-country customer-lead routing initiative (owner requested)
- Goal: retain Crisp website chat on its Free plan for human live chat where available; do not add a card or paid plan. The Free plan does not include AI credits/AI workflows, so AI customer replies must not be represented as a Crisp Free feature.
- Extend the existing PakThai AI Sourcing Engine and D1 customer-request/notification pipeline rather than introduce a new paid chat platform or additional Cron triggers.
- Design for multiple country-assigned partners (initial intended partner: Nadeem in South Korea; future partners may cover Malaysia, Australia, Singapore and other countries). Partner contact details must be owner-managed, not guessed or hardcoded. Use country plus lead intent/product; preserve a safe Owner-review fallback if no active partner matches.
- Phase A: audit existing public customer intake, role authorization and notifications; create backup; add a secure owner-managed partner directory and country/lead routing; create internal notifications only, idempotently. No partner message is sent by this phase.
- Phase B: validate lead creation and routing in tests using synthetic/local test data, including unknown-country fallback, inactive partner, duplicate submission and malicious input. Keep prices, stock, delivery promises and orders behind Owner approval.
- Phase C: only after routing is verified, integrate an external alert channel for partners. First verify recipient and delivery setup; do not send WhatsApp/email test messages or enable outbound outreach without separate explicit authorization. WhatsApp production delivery is currently NOT VERIFIED.
- Crisp transition: do not remove the working widget before a replacement is tested. Free downgrade can be selected in Crisp Settings → Billing → Plans & Subscriptions → Change Plan → Free, then verify Free is active. Do not make billing changes through automation without explicit owner approval.
- Keep free-first constraints: no new paid services, no extra cron triggers, no automatic prospect outreach, no secrets in logs, no wholesale Worker rewrite. Deployment remains gated by tests, syntax checks, Wrangler dry-run, diff review and explicit owner approval.

## Remaining work — start here
1. Run and verify the newly deployed Korea discovery from an owner-authenticated session; check the failed Pakistan buyer run and retry only through the owner dashboard.
2. Review the 10 Thailand seller leads and 4 Pakistan buyer/channel leads; qualify public leads before converting them to active businesses.
3. Review the 3 previously sent emails and 5 queued contacts. Keep automatic prospect sending paused until the owner approves the queue and message policy; record replies and verify export ability, real rates and buyer requirements.
4. Convert only verified businesses to active seller/buyer records and sourced offers/requirements; then test buyer-product-seller matching and genuine opportunity creation.
5. Configure missing landed-cost rates before trusting margins. Last recorded: travel 75; pickup, packing, freight, duty, payment fee, Pakistan transport and contingency rates zero.
6. Controlled Gmail fresh inbound → exactly one reply → no duplicate round-trip remains unverified; auto-reply remains disabled by default unless its owner-controlled setting is enabled.
7. WhatsApp Cloud API delivery, owner alerts and Korea staff notifications remain unverified. Keep free plan limits; do not publish the app or add billing without an approved, account-specific review.
8. Check the owner’s Google Cloud/Crisp expiry notices in authenticated billing pages. Google Cloud account-specific trial/billing data was not visible in this audit. Do not enable paid billing.
9. Broad security/idempotency/CSRF/rate-limit review and live voice workflows still require evidence. Crisp chat widget is owner-confirmed working; its AI credits are not included in the official free plan.

## Standard of proof
Use status labels VERIFIED, PARTIAL, NOT CONFIGURED, FAILED, NOT TESTED. HTTP 200, a visible button, a code path, a secret name, or a dry-run alone does not prove an end-to-end workflow. Record actual evidence in `RELEASE_LOG.md` and update `FINAL_SOURCE_OF_TRUTH.md` after meaningful verified changes.

## 2026-10-12 — Catalog sync follow-up
- Worker `c9ea223e-7a4c-476c-95c5-1f4d7aa0b0ff` deployed a cached-handle fallback for transient upstream listing HTTP 429 errors. Scheduled sync should continue updating existing products and report PARTIAL while fresh source listings are unavailable.
- Pending proof: run an owner-triggered or scheduled catalog sync and verify the product update timestamp and final status. The current FAILED indicator is from the earlier 02:01 UTC attempt, not a post-fix run.

## 2026-10-12 — Final catalog and market setup verification
- Final Worker deployment: 975882c4-f2aa-4380-84b0-52a420a93876. Store and Worker returned HTTP 200; /api/health returned ok=true; public catalog returned 388 products.
- Owner-triggered catalog sync completed at 2026-10-12T05:58:10.475Z: 8 products updated, 0 failed; live D1 reports 388 products / 249 available. The FAILED banner was stale from the earlier 429 attempt; this run cleared it to COMPLETE.
- Added country-aware Thailand/South Korea buyer prospect search, seller/buyer market lists, search-status reporting, and a qualified-lead-only internal draft-deal board. Live D1 has 10 Thailand seller leads, 0 Korea seller leads, 0 Thailand/Korea buyer leads and 0 market deal drafts. Leads remain unverified.
- Discovery APIs and deal management are owner-only. The browser showed Owner signed out after the final deploy, so manual prospect runs were not performed. Current API checks returned 401 without login. Do not count the search buttons/code as a completed search.
- Free-only schedule retains three existing Cron triggers. One daily prospect search rotates across five lanes; manual owner searches remain available. Cloudflare Free currently documents a maximum of five Cron Triggers per account, so no paid plan or extra triggers were added.
- Market deal drafts use THB/KRW labels only. FX, export/import landed cost, shipping and customer-ready quotations remain NOT CONFIGURED; no quotes, outreach or orders were created.
- Validation: all changed JS modules passed node --check; Wrangler dry-run passed; generated Worker inline scripts were extracted from the live page and both passed node --check; no new browser console errors appeared after the final deploy. Full test suite was not run.