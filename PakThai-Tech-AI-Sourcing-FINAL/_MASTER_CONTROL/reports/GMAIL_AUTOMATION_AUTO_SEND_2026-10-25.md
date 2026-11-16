# Gmail automatic routine sending — 2026-10-25

## Change and deployment
- Owner requested routine Gmail replies and low-volume scheduled outreach to send without waiting for Owner approval, while retaining Owner authority for binding final quotes, purchases, payments, orders, stock commitments, delivery promises, and sensitive commercial commitments.
- Set `EMAIL_AUTO_REPLY_ENABLED=true` in `wrangler.jsonc`; left `WHATSAPP_AUTOMATION_ENABLED=false` and all three existing Cron schedules unchanged.
- `src/gmail-autoreply.js`: eligible inbound routine messages now send a Gmail reply directly, preserve reply headers/thread association, record sent/failed state in `notifications`, avoid duplicate replies by inbound message ID, suppress opt-outs, skip automated/security/bulk messages, and stop at the rolling 10-email/24-hour limit while retaining the cursor for retry.
- `src/outreach-scheduler.js`: eligible queued campaign emails send automatically, max 3 per run and max 10 emails per rolling 24 hours; same-recipient 24-hour duplicate guard added; STOP/opt-out and any reply stop follow-ups; follow-ups remain scheduled at 3 and 7 business days; no binding price/order commitments.
- Legacy hard-coded unverified seed recipients remain paused. No test email was sent. No production D1 rows were deliberately modified during this change.

## Validation
- Full `npm test`: 129/129 passed.
- Dashboard inline validation passed (HTTP 200; 2 inline scripts checked).
- Wrangler deploy dry-run passed.
- Live Worker `/api/health`: HTTP 200; `/api/catalog`: HTTP 200.
- Gmail OAuth refresh-token record exists in production D1 (presence only; token value not read or exposed). Gmail token refresh and real outbound delivery were NOT directly exercised in this change, so delivery remains to be verified from actual scheduled runs and notification records.

## Deployment
- Cloudflare Worker: `https://pakthai-ai-sourcing.pakthaitech.workers.dev/`
- Version ID: `d61dbae1-0d2d-44ca-b3f0-c9678bf61d21`
- Existing Cron schedules unchanged: `0 2 * * *`, `0 4 * * *`, `0 * * * *`.
- WhatsApp remains disabled. No WhatsApp or Meta settings changed.

## Remaining limitation
- The current reply classifier uses safe template replies. It does not yet implement a full AI-driven, catalog-price-aware negotiation loop or a structured final-negotiation report to Owner. Routine replies and low-volume outreach are enabled; complete multi-turn negotiation is still outstanding and must not be represented as complete.


## 2026-10-25 — AI-driven catalog-grounded email negotiation follow-up
- Implemented `src/gmail-negotiation.js` and wired it into `src/gmail-autoreply.js` when the Cloudflare AI binding is available.
- Each inbound email thread is stored in `gmail_negotiation_threads` with a bounded recent transcript, turn count, and status. The assistant retrieves relevant product matches from the live D1 `products` catalog and uses the existing Gemma model with Llama fallback.
- Replies now continue the actual customer topic, ask targeted missing-information questions, and may reference a matching public Store listing price as indicative only. The assistant is instructed not to invent price/stock/discount/shipping/payment terms and never to bind final quotes, orders, purchases, delivery or payment commitments.
- Pricing/negotiation threads create an internal pending dashboard notification with the customer message, AI summary, relevant catalog matches, missing details and owner-only commercial boundary. A ready-for-owner state generates an additional report. This is a dashboard notification, not a verified external alert delivery.
- Added `tools/audit/gmail-negotiation.test.mjs`: 2 focused tests PASS (catalog context + Owner report; safe fallback when AI is unavailable). Full `npm test` PASS, including inline validation; Wrangler dry-run PASS (551.96 KiB / 122.42 KiB gzip).
- Deployed Worker version `0f96e909-27d0-493f-8063-fdb1ee9811f5`; schedules unchanged. Post-deploy health returned `ok:true`; catalog endpoint returned the current product feed successfully (the endpoint payload is large; count was not independently parsed in this check).
- LIMITATION: no real customer conversation was available to run an end-to-end live round-trip, so actual AI output quality, Gmail OAuth refresh and real outbound delivery remain NOT VERIFIED. No test email was sent. The production flow will use AI negotiation when a genuine eligible inbound email is polled. Final commercial commitments remain Owner-only; WhatsApp stays disabled.
- Backup: `_MASTER_CONTROL/snapshot/pre-ai-negotiation-20261025_1135/`.


## 2026-10-25 — Remote outgoing-email failure investigation (not yet resolved)
- Owner asked for remote repair and a real outgoing email verification.
- Confirmed production D1 had 0 notifications with channel=email/status=sent, 0 failed email notifications, and 0 prepared email notifications at the time of audit. Outreach campaign records included the generic error `Gmail access token refresh failed.` The saved `gmail_oauth` refresh-token record exists (record presence only; no credential value read or exposed).
- Inspected `src/gmail-autoreply.js`, `src/outreach-scheduler.js`, and `src/gmail-oauth.js`. Both auto-reply and scheduled outreach fail before Gmail send when Google's OAuth token refresh does not return an access token. The implementation currently hides Google's specific OAuth error code/description, so the underlying cause (for example revoked/expired grant, OAuth client mismatch, or another Google OAuth rejection) is not proven yet.
- Called production `/api/gmail/status` without the Owner browser session; the route correctly returned `Login required. Please sign in to PakThai Tech.`. Opened the Google authorization start URL remotely in the default browser. Remote tooling available in this session can read/write project files and run processes, but does not provide GUI inspection/click controls to complete any Google consent prompt; no Owner authentication was bypassed.
- Created source backup before any edits: `_MASTER_CONTROL/snapshot/pre-gmail-oauth-diagnostic-20261025_0700/` (gmail-autoreply.js, outreach-scheduler.js, gmail-oauth.js). No source edits or new deployment were made in this diagnostic pass because the live Owner authorization step is not accessible to complete safely here.
- No email was sent in this pass; no Gmail send response/message ID or Sent-folder proof exists. Do not describe the email path as fixed or claim a message was sent.
- Required completion: finish Owner-authenticated Google Gmail reauthorization in the remote browser, then run a single approved, appropriate real outbound message, verify Gmail API acceptance/message ID and production `notifications` status=`sent`, and have Owner confirm the message appears in Gmail Sent. If refresh still fails, add a safe diagnostic exposing only Google OAuth `error` and `error_description` (never tokens/secrets), deploy after tests, and use that exact code to remediate.
