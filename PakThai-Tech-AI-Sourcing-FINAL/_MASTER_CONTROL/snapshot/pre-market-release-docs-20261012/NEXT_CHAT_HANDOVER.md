# PAKTHAI TECH — NEW CHAT HANDOVER
Updated: 2026-10-11 (Pakistan time)
Resume keyword: PAKTHAI-RESUME-20261011-CLEAN

## First actions in a new chat
1. Read `FINAL_SOURCE_OF_TRUTH.md` first.
2. Read this file and `_MASTER_CONTROL\reports\FINAL_PROJECT_STATUS_2026-10-11.md`.
3. Check current files/live state before any instructions. Never restart completed setup or ask the owner to repeat confirmed checks.
4. Follow `NEW_CHAT_START_PROMPT.md` as the task brief.

## Project identity
- Root: `D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL`
- Worker source: `src\worker.js`; Worker service: `pakthai-ai-sourcing`
- Store: https://pakthai-tech-store.pages.dev/
- Worker: https://pakthai-ai-sourcing.pakthaitech.workers.dev/
- D1 binding: `pakthai-sourcing-db`
- Master plan: `MASTER_PLAN_VOICE_REVIEW.md`
- Release log: `RELEASE_LOG.md`

## Owner-confirmed UI checks
Store/product list and visible dashboard tools work; Store WhatsApp link opens +92 300 7982289; Crisp works after the duplicate-script fix. Do not reopen these unless there is new evidence of failure.

## Fresh-start production baseline
Active sellers/offers/opportunities/negotiations/matches and prepared seller-lead notifications are zero by design. Keep 5 Thailand seller prospects and 4 Pakistan buyer/channel prospects as unreviewed prospects. Do not restore old sellers or test data. Backups are preserved.

## WhatsApp — do not assume complete
- Real Pakistan number shown Connected/High in WhatsApp Manager; real WABA reported as 2330969974304488.
- Developer console still showed test number +1 555 648 6086, phone ID 1359558747244650, test WABA 1791989132046074.
- Active Worker route is `/webhooks/whatsapp`; `messages` was subscribed. App unpublished warning was present.
- Active Worker webhook only processes outbound status callbacks; inbound auto-reply is not implemented. The duplicate `src\whatsapp-webhook.js` is not routed and uses mismatched route/env names.
- Outbound sender has a test phone-ID fallback if `WHATSAPP_PHONE_NUMBER_ID` is missing. Production number ID/token scope must be checked securely.
- Real outbound delivery, delivery/read receipt, inbound receipt and auto-reply are NOT VERIFIED. Do not delete/re-register the Pakistan number, publish app, or enable paid billing without explicit approval.

## Work order
1. Audit current WhatsApp app/WABA/phone-ID/env configuration and current deployment, without revealing secrets.
2. Correct the production/test account mismatch with a narrow backed-up change, if evidence confirms it.
3. Add/test inbound webhook handling and idempotent message/status tracking; run tests and Wrangler dry-run.
4. Verify Meta's production webhook requirements and any app-publishing/billing gates; ask before consequential external actions.
5. Only after owner approval, send one controlled test to a specified recipient and confirm delivered/read status.
6. Then continue remaining tasks: scheduled seller-discovery status, Gmail round-trip, landed-cost rates, and prospect qualification.

## Safety and interaction
- No wholesale Worker rewrite. Backup before edits; run focused tests, syntax, dry-run and diff review.
- Deploy only with explicit owner approval. Never print secrets or tokens.
- No auto-purchase/auto-payment; no binding quotes or business commitments without owner approval.
- Do not send external prospect outreach unless explicitly approved.
- Be concise in Pakistani Urdu and continue from the first unfinished task. Do not make the owner revisit already completed UI checks.

## 2026-10-12 current handover
- Latest Worker deployment `c9ea223e-7a4c-476c-95c5-1f4d7aa0b0ff`; health VERIFIED, public catalog 385 products.
- Korea seller discovery is deployed, owner-only/manual and daily scheduled, free OSM/Photon, approximate 250 km from Pyeongtaek city centre. No live Korea search has run since deploy because the opened dashboard is logged out. Do not claim Korea prospect counts yet.
- Live prospect counts: 10 Thailand seller prospects, 4 Pakistan buyer/channel prospects; active sellers and confirmed buyers are 0. Thailand scheduled search succeeded (5 saved/refreshed); Pakistan scheduled search failed. Catalog sync's 02:01 UTC run failed after upstream HTTP 429; cached-handle fallback is deployed, but the old FAILED status remains until a new sync runs.
- Prospect cold email/follow-ups are paused by deployed code. D1 shows 3 earlier Gmail API sends (delivery unverified), 3 active campaigns and 5 queued. Do not send further outreach until owner reviews/approves.
- Cloudflare usage was low; no plan/billing modification made. Exact Cloudflare plan badge and Google Cloud trial/expiry alerts were not visible. Crisp chat widget works per owner; free plan excludes AI credits. Do not add billing.
- Resume: owner session was confirmed in Chrome on 2026-10-12. Run the visible Sync Source Catalog action once to verify post-fix refresh; then run Korea seller and Pakistan buyer discovery through the owner dashboard. Inspect prospect list; review previous email queue. Verify Korea radius against exact pickup location outside the public geocoder before making pickup promises. No WhatsApp delivery or Nadeem alert has been verified.
