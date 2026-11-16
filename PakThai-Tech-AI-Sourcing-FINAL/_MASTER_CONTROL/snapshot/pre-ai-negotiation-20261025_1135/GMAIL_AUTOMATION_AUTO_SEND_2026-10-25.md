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
