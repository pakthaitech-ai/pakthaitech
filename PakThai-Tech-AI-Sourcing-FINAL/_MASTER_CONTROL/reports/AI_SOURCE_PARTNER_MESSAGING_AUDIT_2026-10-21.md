# AI Sourcing Partner Messaging & Setup Audit
**Date:** 2026-10-21 (Asia/Karachi)
**Live AI Sourcing:** https://pakthai-ai-sourcing.pakthaitech.workers.dev/
**Scope:** read-only dashboard, live health/catalog, production partner/WhatsApp opt-in/status records, tests and deploy dry-run.

## Verified live state
- Owner dashboard visibly reports `Signed in: Owner`, database connected, catalog sync `COMPLETE`, 455 products, 0 sellers, 0 opportunities and 3 active zones.
- Live Worker homepage HTTP 200; `/api/health` HTTP 200 with `ok:true`; `/api/catalog` HTTP 200 with 455 products.
- Production `sourcing_partners` query returned two active records: `ahmad` (United Arab Emirates, partner id 3) and `M Nadeem` (South Korea, partner id 2). Contact numbers match the intended UAE and Korea recipients.
- Read-only `whatsapp_partner_optins` query found active opt-in records for both partners. These records prove a START opt-in was processed at least once; they do not prove that the webhook is healthy right now or that an outbound message was delivered.
- No `whatsapp_start_requests` rows or recent `whatsapp_message_status` receipts were found for these two recipients in the queried tables.
- Partner Delivery panel confirms Meta sender status `CONNECTED`, quality `GREEN`, but `code_verification_status=NOT_VERIFIED`. Automated WhatsApp remains correctly paused. It also confirms partner email is prepared for Owner review, not sent automatically; browser-push final activation/self-test remains pending; Resend remains inactive pending verified sender domain/API key.
- Current checked-in Wrangler config sets `OUTBOUND_EMAIL_PROVIDER="gmail"`. This is not a phone-text channel and was not changed.

## Validation
- `npm.cmd test`: PASS, 117/117 tests; rendered dashboard inline-script validator PASS (2 scripts).
- `npm.cmd run dry-run`: PASS, Wrangler 4.141.0, bundle 513.60 KiB / 112.52 KiB gzip.
- Live health and public catalog checks: PASS.

## Actions and boundary
- No code or production settings were changed; no deployment was made because the requested phone-message test is blocked by the external Meta sender-verification state, not a demonstrated code defect.
- No SMS, WhatsApp, email or Telegram message was sent. No production row was created or modified. D1 checks were SELECT-only (`rows_written=0`, `changed_db=false`).
- Do not request another Meta code, call `/register`, disconnect/re-register, migrate or delete the WhatsApp account. Do not bypass `NOT_VERIFIED` with a production send. Once Meta provides the supported account-specific remedy and Graph reports `VERIFIED`, run a controlled approved delivery test and verify the provider delivery receipt separately.
- If testing through another channel is desired, first verify that channel is configured for the specific recipient; phone numbers alone are not Telegram chat IDs, and email acceptance is not inbox delivery proof.

## Conclusion
AI Sourcing dashboard and public catalog are healthy, both intended partners are active, and both have historical opt-in records. Phone messaging is **BLOCKED / NOT VERIFIED** for automated WhatsApp because the production sender remains unverified. No deployment is warranted from this audit alone.

## Follow-up verification (2026-10-21 16:45 local)
- Re-read authenticated live Graph diagnostics in Edge: WABA 2330969974304488 subscription is active; `pakthai_partner_lead_alert` is APPROVED; phone `+92 300 7982289` is CONNECTED/CLOUD_API/GREEN but still `NOT_VERIFIED`. This remains the explicit safety stop in both WhatsApp sender modules.
- Read-only production D1 shows prior WhatsApp notification rows labelled `sent` for UAE `971562355960` on 2026-10-09 and South Korea `821068879265` on 2026-10-11/12. Those are historic API-acceptance records; no matching recent delivery-status receipts were found. They do not prove delivery to the phone.
- Both partners' last inbound WhatsApp events were 2026-10-19 around 05:50Z (UAE) and 04:58Z (Korea). At the 2026-10-21 review, both are outside the 24-hour service window. A fresh inbound message/START is needed to reopen that window for free-form service replies; it will not bypass the unverified sender gate.
- Twilio credentials exist as secret names for account SID/auth token, but `TWILIO_FROM_NUMBER` is not present in Wrangler's configured secret list, so SMS is not configured as an alternate test channel.
- Meta AI support question was entered and visible in the assistant conversation. The assistant displayed an initial acknowledgement that it would look up the SMB fix/escalation path, but no final answer was confirmed in this review. Both formal support cases still show Completed.
- No message sent, no production D1 writes, no source/config changes, and no deployment. There is no safe application-code change that can turn Meta's live `NOT_VERIFIED` into `VERIFIED`; deployment would not remove this external blocker.
## Meta AI preliminary reply (2026-10-21)
- Meta AI displayed an initial analysis saying the registration source is identified as an `SMB App` endpoint and speculated that Code 100 can indicate a mismatch between how the number was initially added and how it is being used with Cloud API. This was preliminary, not an account-specific confirmed remediation; the assistant said it was still analyzing Code 100. No reset, migration, code request or registration action was taken based on that speculation.
## Source-level blocker review (2026-10-21)
- `src/whatsapp-sender.js` currently returns HTTP 409 with a deliberate pause before the approved-template send logic; therefore paid template sends cannot run even if the sender later becomes verified. This is an explicit policy gate while using the free service-message allowance, not safe to remove without owner approval for paid template usage.
- `src/whatsapp-free-window.js` independently refuses all sends unless the live production phone is `CLOUD_API`, `CONNECTED`, and `VERIFIED`, and the recipient has an active opt-in plus an inbound event inside 24 hours. Current production sender is `NOT_VERIFIED`; UAE/Korea inbound windows are expired. This is why no free-form test message can be sent now.
- Meta AI conversation only shows preliminary analysis of an `SMB App`/Cloud API mismatch and says it is still analyzing Code 100; no final account-specific remedy or human escalation confirmation is visible. The two support cases remain Completed.
- No deploy was made: removing the code-level pause alone would not solve the live verification gate, and paid-template mode could incur messaging charges. No reset, new code request, migration, deletion, or test message was performed.