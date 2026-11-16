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

## 2026-10-22 follow-up forensic clarification — prevent repeat loops
- The prior “correction” was an audit/documentation pass, not a production code fix or deployment. The current code still intentionally pauses the paid-template sender. The apparent recurring error therefore persists because the guard remains in source; it is not evidence of a new Meta rejection from the paused route.
- Verified local source: `src/whatsapp-sender.js` returns HTTP 409 `paused:true` immediately after Owner authentication, so the subsequent code that checks the live Meta phone, WABA linkage, `code_verification_status`, template approval, recipient, duplicate cap, and calls Graph `/messages` is unreachable. `src/worker.js` route `/api/notifications/whatsapp-template-test` returns HTTP 410 with `sent:false` and never calls Meta.
- Verified latest project checks on 2026-10-22: full `npm test` PASS 122/122; inline dashboard validation PASS; `wrangler deploy --dry-run` PASS; production health and catalog HTTP 200 (455 products). Node emits a non-fatal `MODULE_TYPELESS_PACKAGE_JSON` warning. These checks establish regression/build health only; they do not prove WhatsApp delivery or resolve Meta verification.
- Meta evidence remains separate and unchanged: latest recorded `CONNECTED` / `CLOUD_API` / quality `GREEN`, but `code_verification_status=NOT_VERIFIED`; earlier code request returned `136024`, and `/register` returned SMB-business error. Do not call verification endpoints again, reset/migrate the production number, or bypass the verification guard.
- Next implementation must remove only misleading/unreachable app-side pauses where a safe supported flow can be implemented, and make the test endpoint return actual read-only Meta readiness diagnostics while refusing to send when not VERIFIED. Add regression tests; back up, syntax-check, run full tests and dry-run, inspect diff. Then deploy only after the project’s explicit release gate. Do not claim the Meta blocker is fixed until authenticated diagnostics show VERIFIED; do not claim delivery without a delivery receipt.
- Backup of these handoff edits: `_MASTER_CONTROL/snapshot/before-whatsapp-handoff-update-20261022-190420`.

## Scope completed in this pass
- Created a dated backup of the prior source-of-truth, partner handoff, and relevant WhatsApp source files in `OLD_REPORTS/AUTOMATION_APPROVAL_BACKUP_20261022_183105`.
- This is a status/decision record only. No source-code behavior, production D1 data, secrets, provider settings, or deployment were changed.


## 2026-10-22 live WhatsApp diagnostic fix — deployed
- Backed up source before edits: `_MASTER_CONTROL/snapshot/before-live-whatsapp-diagnostic-fix-20261022` (`src/worker.js`, `src/whatsapp-sender.js`).
- Replaced `/api/notifications/whatsapp-template-test` HTTP 410 hardcoded pause with an Owner-authenticated, diagnostic-only live Meta lookup for phone status/verification, WABA phone linkage, and `pakthai_partner_lead_alert` template status. It always returns `sent:false` and never POSTs `/messages`.
- Updated the dashboard test action to call this diagnostic route and display phone verification/status, template status, linkage, and sanitized Meta Graph errors rather than claiming a generic provider-migration pause.
- Updated regression test and inline-dashboard validator for the new diagnostic behavior.
- Validation: `node --check src/worker.js` PASS; `npm test` PASS 122/122; inline dashboard validation PASS (HTTP 200, 2 scripts checked); `npm run dry-run` PASS.
- Deployed `pakthai-ai-sourcing` production Worker; version `29573e37-5a41-4e58-8f83-47b666633457`. Post-deploy root HTTP 200 and dashboard includes the new diagnostic UI. Unauthenticated POST to diagnostic route correctly returned HTTP 401.
- No WhatsApp message was sent in this run. The authenticated Owner UI must run the diagnostic button to retrieve fresh live Meta results. Do not send until Meta returns `code_verification_status=VERIFIED`, sender is CONNECTED/CLOUD_API, template is APPROVED, and recipient opt-in/24-hour eligibility plus approval are valid. The paid-template sender remains paused; no verification or registration endpoints were called.
