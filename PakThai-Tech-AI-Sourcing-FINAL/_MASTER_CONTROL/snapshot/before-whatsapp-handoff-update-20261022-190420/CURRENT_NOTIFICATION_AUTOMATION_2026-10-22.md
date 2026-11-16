# CURRENT AUTOMATED NOTIFICATION DECISION — 2026-10-22

This section supersedes older handoff statements about how to resume WhatsApp automation. Keep the previous text in the dated backup under OLD_REPORTS; do not delete historical audit evidence or production delivery records.

## Desired behavior
- Routine partner/customer service notifications should be automated only for the appropriate recipient, with documented opt-in/consent, provider eligibility, rate limits, idempotency, and delivery-status tracking.
- Do not require Owner clicks for routine, low-risk alerts once the channel is genuinely ready and the recipient is eligible.
- Owner approval remains required for quotes/prices, purchases, payments, orders, stock commitments, delivery promises, and other sensitive external commitments.
- Do not bypass Meta phone verification, approved-template requirements where applicable, WhatsApp opt-in / 24-hour service-window rules, or provider safeguards. Never send to arbitrary customers simply because a number exists in a record.

## Live source findings on 2026-10-22
- Production Worker health endpoint returned HTTP 200.
- `src/worker.js` `sendWhatsAppTemplateTest()` is a hard-coded no-send function; it reports paused and does not call Meta.
- `src/worker.js` `sendNadeemWhatsAppTest()` is also a hard-coded no-send function.
- `src/worker.js` route `/api/notifications/whatsapp-template-test` returns HTTP 410 with `paused: true` and `sent: false`.
- `src/whatsapp-sender.js` `handleWhatsAppSend()` returns HTTP 409 with `paused: true` before reaching its live Meta readiness checks.
- The existing free-window partner send path already attempts automatic delivery after a lead is queued, but only when the partner has an active opt-in and an open 24-hour service window; its live sender guard requires the Pakistan Cloud API number to be CONNECTED and VERIFIED.
- Latest dashboard status provided by Owner: sender CONNECTED, quality GREEN, `code_verification_status=NOT_VERIFIED`. Prior Meta errors were 136024 on code request and code 100 on `/register` for SMB businesses. Support case 29002498606053019 remains the supported escalation path.
- Partner record shown in dashboard: Ahmad, UAE, `+971562355960`, Active. This is a partner record, not proof of WhatsApp opt-in, an open service window, or sender verification. No test message was sent in this audit.

## Release gate / next work
1. Fix the test button so it reports the real send-path outcome instead of a misleading hard-coded pause; it must still refuse to send while verification/readiness fails and show the exact safe Meta error code/message.
2. Implement an automatic dispatcher only for eligible, consented routine notifications, with duplicate prevention and status receipts. Do not auto-send quote/order/price commitments.
3. Add/update tests for verified vs unverified sender, opt-in/window, provider errors, duplicate sends, and delivery callbacks.
4. Run project tests and Wrangler dry-run, inspect the diff, then request explicit production deployment approval. Do not deploy as part of this local file update.
5. Preserve the notification and delivery audit trail. Do not delete D1 rows to make the dashboard appear clean; archive old local reports only after saving an immutable backup.

## Scope completed in this pass
- Created a dated backup of the prior source-of-truth, partner handoff, and relevant WhatsApp source files in `OLD_REPORTS/AUTOMATION_APPROVAL_BACKUP_20261022_183105`.
- This is a status/decision record only. No source-code behavior, production D1 data, secrets, provider settings, or deployment were changed.
