# FINAL WHATSAPP WORKFLOW FIX — 2026-10-23

## Scope
Only the PakThai AI Sourcing partner WhatsApp notification path was edited. Meta account settings, phone registration/verification, tokens/secrets, partner records, Gmail, Telegram, Crisp, Store settings, and production D1 data were not changed. No WhatsApp message was sent.

## Change
File: src/whatsapp-sender.js
The atomic claim query now permits a notification whose status is either `prepared` or `approved`, matching the earlier eligibility check. It atomically moves the record to `sending`, so concurrent requests cannot both claim the same row.
Regression assertion added to tools/audit/security-hardening.test.mjs.

Backup:
backups/whatsapp-status-claim-20261023_111509/
- whatsapp-sender.js.before
- partner-notifications.test.mjs.before
- FINAL_SOURCE_OF_TRUTH.md.before

## Validation
- Focused security-hardening test: 12/12 PASS.
- Full `npm test`: 122/122 PASS.
- Dashboard inline validation: PASS; HTTP 200, 2 inline scripts checked.
- `node --check src/whatsapp-sender.js`: PASS (command continued to dry-run/deploy).
- Wrangler deploy dry-run: PASS, 525.42 KiB upload / 114.72 KiB gzip.
- Production deploy: SUCCESS.
- Worker version: e534903c-9583-484a-9570-f2600dd3b3aa; 100% traffic at deployment history check.
- Post-deploy live checks: Worker root HTTP 200; /api/health HTTP 200 with ok=true; /api/catalog HTTP 200 with 455 products; Store homepage and /catalog HTTP 200.
- Existing cron schedules remained 0 2 * * *, 0 4 * * *, 0 * * * *.

## Critical remaining blocker
This code fix does not resolve Meta's phone verification. Latest saved authenticated evidence still says the production sender is CONNECTED/CLOUD_API/GREEN but `code_verification_status=NOT_VERIFIED`. Public unauthenticated diagnostics return 401 as expected. A fresh diagnostic from the signed-in Owner dashboard was not available through the remote session in this pass, so current verification is NOT VERIFIED / NOT RECONFIRMED.
The sender retains live Meta gates requiring the correct PakThai production phone and CLOUD_API platform, WABA linkage, code_verification_status VERIFIED, phone status CONNECTED, approved template, valid recipient and rate/duplicate limits.
Therefore do not treat the deploy as proof that partner messages can now be delivered. No real recipient delivery was attempted and no delivery receipt exists from this pass.

## Next single focus
Open the already-signed-in Owner dashboard in Edge/Chrome and run the read-only WhatsApp diagnostics refresh. Do not request a new verification code, register, disconnect/re-add/migrate the number, or change Meta settings. Record sanitized result only. If and only if Meta returns VERIFIED and partner opt-in/readiness is confirmed, verify the sender path's consent/24-hour/template policy before one explicitly approved controlled test, then confirm an actual delivered status callback (not merely Meta API acceptance).

## Other workflow notes
- Partner notification currently carries buyer-lead review details; it is not yet a complete confirmed Korea pickup instruction with verified pickup address/contact, item, pickup reference, and deadline.
- Crisp remains the Store human-live-chat provider; not changed.
- Gmail source limits outbound sends to 10 per rolling 24 hours and scheduled drafts to 3 per run; no Gmail send was made.
