# PAKTHAI TECH — LIVE SYSTEM AUDIT
Date: 2026-10-23 (Asia/Karachi)
Scope: read-only review of current source notes, Store/AI Sourcing public endpoints, WhatsApp/Gmail/Telegram routing code and tests.
Project root: D:\\pakthai\\PakThai-Tech-AI-Sourcing-FINAL

## Executive result
- Store and AI Sourcing public health/catalog surfaces are responding successfully.
- AI Sourcing Worker is not broadly down. The unresolved partner WhatsApp notification is an integration/readiness/workflow issue, not a general Store outage.
- No Meta settings, sender registration, secrets, billing, app toggles, production database rows, partner contacts, or external messages were changed or tested by sending.
- WhatsApp actual delivery remains NOT VERIFIED. The latest recorded authenticated Meta state is CONNECTED / CLOUD_API / GREEN, but code_verification_status=NOT_VERIFIED. This audit did not have an authenticated Owner browser result, so that status was not refreshed live.
- No source code was changed and no deployment was performed in this audit.

## Live HTTP checks (2026-10-23)
- https://pakthai-tech-store.pages.dev/ — HTTP 200.
- https://pakthai-tech-store.pages.dev/catalog — HTTP 200; returned product JSON.
- https://pakthai-ai-sourcing.pakthaitech.workers.dev/ — HTTP 200.
- https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/health — HTTP 200, ok=true.
- https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog — HTTP 200, 455 products.
- Unauthenticated WhatsApp diagnostics — HTTP 401, expected Owner-only boundary; not a Meta failure and not a live diagnostic result.
- Unauthenticated Telegram status — HTTP 401, expected Owner-only boundary; Telegram readiness is NOT VERIFIED.
- Wrangler deployment history shows 100% traffic on Worker version e2f12e86-60a0-47d5-a8c0-fa1c8f130241, created 2026-10-22 15:08:18 UTC. Public HTTP checks do not prove end-to-end delivery.

## Store, AI chat, and human live chat
- Live Store source has product catalog, AI chat, Order/Quote intake, WhatsApp contact link, and the existing Crisp human-live-chat modal.
- Store JS uses Cloudflare Worker endpoints /api/catalog and /api/support/chat.
- Crisp is still the human handoff/live-chat provider (Crisp website ID is present in local Store source). Keep Crisp; it is distinct from Cloudflare AI support. This review did not submit a customer request or send a chat message, so successful live conversation delivery is NOT TESTED.
- Worker supports bounded catalog-grounded AI support chat. Automated tests cover response construction, fallback, input validation, rate limiting, and avoiding persistence of transcripts. Production AI conversation was not exercised during this read-only audit.

## AI Sourcing engine purpose and partner workflow
- Worker/Workers AI/D1 owns product/catalog API, AI support, customer request intake, idempotency, sourcing partner routing, internal notification records, Owner review, and webhook endpoints.
- Korea seller discovery is a public-prospect discovery function; prospects are not verified sellers and do not constitute a purchase/pickup confirmation.
- Customer request routing currently queues a partner-lead notification and calls the free-window sender.
- Automatic free WhatsApp text delivery is only attempted if that partner has active opt-in and a still-open inbound 24-hour service window. The live sender independently checks the configured production sender is the +92 PakThai number, connected, CLOUD_API and VERIFIED. It also reserves from a 1,000-message monthly free-service allowance. Those checks must remain fail-closed.
- The currently prepared partner notification is a buyer-lead review message, not a complete goods-pickup instruction with verified Korean pickup address, item, contact, collection code and pickup deadline. A dedicated pickup/shipment workflow is not evidenced by this audit and must not be inferred from Korea discovery alone.
- The template sender performs read-only Meta lookups for the approved template pakthai_partner_lead_alert (en_US), but actual sending requires sender VERIFIED/CONNECTED, WABA linkage, approved template and other safeguards. The sender's database claim currently updates only status=approved, despite an earlier eligibility check allowing prepared or approved; prepared records therefore cannot pass that claim. This is a concrete local workflow inconsistency to fix and test before enabling that route.
- No proof was found that every prepared partner notification reaches a successful recipient delivery receipt. Meta's HTTP acceptance alone is not a delivery receipt.
- The Store WhatsApp icon/link is a human-opened WhatsApp contact link; it is not proof of Cloud API partner messaging.

## Meta/WhatsApp status
- Meta was intentionally left untouched, per Owner instruction.
- Latest recorded authenticated diagnostic in project records: production sender +92 300 7982289 CONNECTED / CLOUD_API / GREEN, code_verification_status=NOT_VERIFIED.
- Public diagnostic request is correctly Owner-protected. A fresh authenticated Owner dashboard diagnostic still needs to be read from the already-signed-in session.
- Dashboard diagnostic button is diagnostic-only and never sends. Do not mistake it for a message test.
- Do not request another verification code, call /register, disconnect/re-add/migrate the number, change Meta assets, or send while not VERIFIED.
- Real inbound webhook events and actual delivery/read receipts remain NOT VERIFIED. The source contains a webhook route/status persistence, but route existence does not prove Meta is delivering events to it.

## Gmail anti-spam limit
- Outbound Gmail route enforces a maximum of 10 emails total in any rolling 24-hour window and blocks repeat email to the same recipient within that window.
- Scheduled outreach prepares at most 3 drafts per run, Monday–Saturday around 09:00 Pakistan time; it explicitly does not send automatically. Sending through the notification route requires status=approved.
- Therefore “3 per run” is the draft-preparation limit; “10 per rolling 24 hours” is the outbound email-send limit. Current actual sent count in the last 24 hours was not queried because that requires the authenticated Owner path; it is NOT VERIFIED.
- Gmail OAuth scopes in source include send, readonly and modify. No Gmail connection, inbox, or sent-mail state was changed/read during this public/source audit.

## Telegram
- Telegram is intended for optional private Owner alerts for new requests only; not partner outreach.
- Token/chat configuration is checked only in Owner-authenticated status route. Unauthenticated 401 means status is not yet verified. No Telegram message was sent.

## Local verification
- Ran npm.cmd test from the canonical project root on 2026-10-23.
- PASS: 122 tests, 0 failures.
- Inline dashboard validation PASS: HTTP 200; 2 inline scripts checked; diagnostics UI present.
- Non-fatal Node MODULE_TYPELESS_PACKAGE_JSON warnings appeared; they did not fail tests.
- This establishes local regression checks only; it does not prove production Meta readiness or end-to-end message delivery.
- A separate Wrangler deployment-list command confirmed current 100% deployment version listed above. No new deployment was performed.

## Priority findings / next work (without touching Meta)
1. Read the live diagnostic result in the authenticated Owner dashboard only; record sanitized verification/status/template/WABA results. Do not send from that button.
2. Fix and regression-test the notification status claim inconsistency (prepared eligible but SQL claim only accepts approved) only after making a timestamped backup; preserve explicit gates and idempotency.
3. Specify and implement the actual partner pickup message model: verified partner phone and opt-in, item/quantity, confirmed pickup location/address, Korea contact, pickup reference and expiry/deadline; avoid invented location or purchase facts. Keep sensitive price/order commitments Owner-approved.
4. Confirm status callbacks are subscribed and persist delivered/read/failed receipts; distinguish queued, accepted, delivered and read.
5. Only after Meta says VERIFIED and all consent/template/window checks pass, do one explicitly approved controlled test to the Owner-authorized number and verify a real delivery receipt.
6. Keep Crisp, Telegram and Gmail settings as-is while investigating. Do not deploy until focused tests, full suite, syntax validation, Wrangler dry-run and diff review pass and the Owner explicitly approves deployment.

## Changes made in this audit
None. This file is the audit log; production settings, data, code and external services were not modified.
