# PAKTHAI TECH — NEXT SESSION START HERE
Updated: 2026-10-22 (Asia/Karachi)

## Canonical project
- Root: `D:\PakThai\PakThai-Tech-AI-Sourcing-FINAL`
- Store: https://pakthai-tech-store.pages.dev/
- AI Sourcing Worker: https://pakthai-ai-sourcing.pakthaitech.workers.dev/
- Worker service: `pakthai-ai-sourcing`; D1 binding: `pakthai-sourcing-db`
- Canonical code: `src\worker.js`; master record: `FINAL_SOURCE_OF_TRUTH.md`; release history: `RELEASE_LOG.md`.

## Read order (avoid repeating old work)
1. Read this file.
2. Read only the latest state and safety rules in `FINAL_SOURCE_OF_TRUTH.md`.
3. Check `RELEASE_LOG.md` only for changes after the last recorded state.
4. Inspect live source / production state only when it affects the requested task. Do not treat archived handoffs as current instructions.

## Current confirmed live baseline (2026-10-22)
- Production Worker `/` and `/api/health` returned HTTP 200; `/api/catalog` returned HTTP 200 with 455 products.
- Owner-only Meta diagnostics returned HTTP 401 when queried without an authenticated Owner session; this is an expected access boundary, not proof of a bad token.
- WhatsApp sender `+92 300 7982289` last authenticated diagnostic showed CONNECTED / CLOUD_API / GREEN but `code_verification_status=NOT_VERIFIED`. Outbound WhatsApp stays blocked until authenticated diagnostics show VERIFIED and consent/window/provider checks pass. Do not request codes again, call `/register`, disconnect/re-add/migrate the production number, or send a test while blocked.
- WhatsApp secret names exist in Wrangler; secret values must never be printed or copied into reports.
- Current notification automation note: `CURRENT_NOTIFICATION_AUTOMATION_2026-10-22.md`. Documentation was updated; no notification source code was changed or deployed in that work.
- Dated backup for notification review: `OLD_REPORTS\AUTOMATION_APPROVAL_BACKUP_20261022_183105`.

## Working rules
- PakThai Tech / PakThai AI Sourcing is the main project. Ignore unrelated WKP temporary items; do not clean or alter them.
- Keep historical audit evidence and production D1 rows. Do not restore archived test data or run old repair scripts merely because they exist.
- Before code edits, create a dated backup; run focused tests, syntax checks, Wrangler dry-run, and inspect the diff. Production deploy requires explicit Owner approval.
- Routine notifications may be automated only where recipient consent, provider eligibility, rate limits, idempotency, and delivery status are enforced. Quotes, prices, purchases, payments, orders, stock commitments, delivery promises, and sensitive external commitments still require Owner approval.
- Never expose secrets. Do not claim a message was delivered based only on API acceptance.

## Historical files
Older conflicting chat handoffs were preserved in `OLD_REPORTS\LEGACY_HANDOFFS_2026-10-22`; they are historical references only. Pre-clean copies are in `_MASTER_CONTROL\snapshot\pre-handoff-clean-<timestamp>`.

## Immediate next work
Resume the requested PakThai AI Sourcing notification workflow from the current source. Inspect `src\worker.js`, `src\whatsapp-sender.js`, and `src\whatsapp-free-window.js`; keep the Meta verification fail-closed guard. Implement and test only a safe, evidence-backed fix. Do not deploy or send a real outbound message without the required Owner approval and provider readiness.
