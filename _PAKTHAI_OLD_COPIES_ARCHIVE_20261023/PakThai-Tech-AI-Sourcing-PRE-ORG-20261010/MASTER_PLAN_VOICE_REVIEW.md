# PAKTHAI TECH — MASTER PLAN & VOICE CONTROL REVIEW

Last reviewed: 2026-10-10
Project: D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL
Store: https://pakthai-tech-store.pages.dev/
Worker: https://pakthai-ai-sourcing.pakthaitech.workers.dev/

## 1. Purpose and change policy
This is the single working plan for safe completion of PakThai Tech AI Sourcing and voice control.
Preserve the existing store, Worker, D1 database, working routes, secrets, OAuth setup, scheduled jobs and backups.
Do not do a wholesale rewrite, delete real data, or redeploy without a specific approved change and a passing pre-deploy check.
Do not recreate the old 27 test Opportunities. They were intentionally cleared at activation; zero is the accepted fresh-start baseline.
Free-first only. Do not enable paid services, add billing/payment methods, or change Google Cloud billing without explicit owner approval.
Never print, commit, or ask the owner to paste secrets, access tokens, OAuth client secrets or passwords into chat.

## 2. Business approval boundaries
Owner approval remains required for final quotes/prices, purchases, payments, orders, stock commitments, delivery promises, and sensitive/external business commitments.
AI may research, summarize, draft, match buyers/sellers, calculate landed cost/margins, and prepare recommendations.
No automatic purchasing or payment. No sending a binding quote or commitment without the configured approval gate.
Notifications should tell the owner what needs review and provide a clear approve/reject path where supported.

## 3. Current baseline — not a claim of current live status
Last review reported HTTP 200 for the store homepage, Worker homepage, /api/health and /api/dashboard.
Reported dashboard baseline: 188 products, 5 sellers, 0 buyers, 0 active requirements, 0 buyer matches, 0 opportunities, 3 pending notifications, 1 delivery.
Reported controls: master AI, auto search, seller matching, negotiation, follow-up, opportunity creation and cost controls ON; owner approval required.
Reported enabled sourcing countries: Thailand, South Korea and Pakistan; other listed countries OFF.
Catalog sync previously showed PARTIAL (last_saved 48, cursor 200). It must be rechecked; do not call the catalog fully synced until verified.
Gmail OAuth was reported authorized and actual_sending_ready=true; EMAIL_AUTO_REPLY_ENABLED was set true. A real inbound email/reply round trip was not yet verified.
External prospect discovery previously returned HTTP 503; EXTERNAL_DISCOVERY_TOKEN was not confirmed configured.
WhatsApp outgoing helper exists, but inbound webhook, automatic replies and catalog messaging were not verified end-to-end. Official number: +92 300 7982289.
Crisp remains deferred. Do not restart Crisp work unless the owner asks.
No source edits or deployment were made during the last review. Confirm live state before relying on these historical observations.
## 4. Priority order — complete in sequence
1. Read-only safety audit of state-changing API routes and role/owner authorization. Fix only confirmed gaps, with a backup and focused tests.
2. Recheck health, dashboard, controls and catalog sync; identify why sync is partial and fix only the confirmed cause.
3. Run one controlled Gmail test: send a new test email from an external mailbox, confirm the expected reply, inspect logs without exposing message secrets, and confirm no duplicate reply.
4. Verify WhatsApp Cloud API configuration and webhook separately. Confirm incoming message, correct reply, delivery status and failure logging before calling it live.
5. Check external discovery configuration; leave it clearly marked NOT CONFIGURED if no safe free token/service is available. Do not enable billing-based Places services.
6. Add voice control as a progressive enhancement with a typed-command fallback. First release is read-only; then allow safe, bounded actions only after confirmation.
7. After each approved change, run tests, record results, and deploy only if explicitly authorized and checks pass.

## 5. Voice-control scope
Stage A — read-only commands: “system status”, “catalog sync status”, “pending approvals”, “show latest errors”, “summarize buyers/sellers/opportunities”, “Gmail status”, “WhatsApp status”.
Stage B — draft/preparation commands: prepare a sourcing search, summarize a seller, calculate landed cost, draft a message, prepare a follow-up. Show the draft before sending.
Stage C — bounded actions: trigger a sync or create a draft only after showing the exact action and receiving confirmation. Keep rate limits, deduplication and audit logs.
Never treat voice recognition alone as approval for purchases, payments, binding quotes, stock commitments or delivery promises.
If speech recognition is unavailable, blocked or inaccurate, all supported commands must remain usable through typed input. Display the interpreted command and ask for clarification when uncertain.

## 6. Security and staff usability
Do not force a password prompt for every button. Prefer one low-friction authenticated dashboard session with appropriate expiry, plus server-side role checks for every sensitive API operation.
Do not assume Gmail/Google/ChatGPT sign-in or 2FA automatically protects the public Worker API.
Audit POST/PUT/PATCH/DELETE routes, especially settings/control changes, approvals, messages, seller/buyer changes, sync triggers and notifications. Verify authentication and authorization on the server, not only by hiding UI buttons.
Use owner and staff permissions: staff may view operational status and prepare drafts; only owner-authorized roles may change high-impact controls or approve business commitments.
Protect against CSRF where cookie sessions are used, validate request bodies, rate-limit public endpoints, avoid leaking stack traces/secrets, and log actor/action/time/result without logging tokens or sensitive message content.
Do not implement a new login system or alter the current sign-in flow until the existing routes and deployment model are audited.
## 7. Reliability and maintenance
Prevent duplicate emails/messages, follow-ups, opportunities and scheduled actions using stable idempotency keys or equivalent database checks.
Preserve the existing cron schedule unless a measured issue requires a reviewed change: catalog sync at 02:00 and hourly workflow as currently configured.
Add/maintain a health panel with last successful catalog sync, last sourcing run, product/seller/buyer counts, matches/opportunities, pending approvals, Gmail and WhatsApp verification state, latest safe error summary and deployed version.
Use explicit status labels: VERIFIED, PARTIAL, NOT CONFIGURED, FAILED, NOT TESTED. A code path, toggle, dry-run or HTTP 200 alone does not prove an end-to-end feature works.
Back up source/configuration and record database migration plans before edits. Never overwrite the only known-good backup. Provide a rollback path before deployment.

## 8. Verification checklist
[ ] Read and back up the current source before editing.
[ ] Confirm GET /api/health and /api/dashboard and inspect /api/controls.
[ ] Re-run catalog sync and verify saved count, cursor progression, errors and repeat-run behavior; resolve PARTIAL status before claiming complete.
[ ] Test Gmail with one new inbound email; verify one appropriate reply and no duplicate reply. Do not send unsolicited real customer messages during testing.
[ ] Verify WhatsApp inbound webhook and outbound reply with a controlled test, using the official +92 300 7982289 number where supported; do not expose tokens in logs or chat.
[ ] Confirm unauthorized users cannot change settings, approve opportunities or send messages by calling API routes directly.
[ ] Verify staff can perform allowed tasks without repeated password prompts and cannot perform owner-only actions.
[ ] Test duplicate/retry behavior, error handling, and typed fallback for voice commands.
[ ] Run project tests and Wrangler dry-run; inspect diff and changed-file list.
[ ] Deploy only with explicit owner authorization; then verify live endpoints and record the result.

## 9. Release log template
For every change record: date/time; reason; files changed; backup location; tests run and results; dry-run result; deployment authorization; deployed version; live verification; rollback method.
2026-10-10 — Master plan document updated only. Application source not changed. No deployment performed. Catalog, Gmail end-to-end, WhatsApp end-to-end and API authorization remain pending verification.

## 10. Working rules
Make one controlled group of changes at a time. Do not repeatedly upload the whole project when a small diff is sufficient.
Before editing, inspect the actual current file and related route; do not rely on old screenshots or assumptions.
After editing, re-read the changed file, inspect the diff, test, and report exactly what was and was not verified.
Never describe a planned, configured or partially tested feature as live.
The 27 old test Opportunities were intentionally removed; do not recreate them or use zero opportunities as a defect by itself.

## 11. Live recheck — 2026-10-10
Verified from DESKTOP-8TCTLN6: GET /api/health = HTTP 200; GET /api/dashboard = HTTP 200; GET /api/controls = HTTP 200.
Live dashboard returned: products 188; sellers 5; buyers 0; active requirements 0; buyer matches 0; opportunities 0; pending approvals 0; quotations 0; orders 0; purchases 0; deliveries 1; pending notifications 3. This is consistent with the intentionally cleared fresh-start Opportunities baseline.
Live controls: Master AI ON; auto search, seller matching, negotiation, auto follow-up and opportunity creation ON; cost controls ON; owner approval required true. Thailand, South Korea and Pakistan enabled; Pakistan source enabled; other listed countries disabled.
Catalog sync is still PARTIAL: enabled=true, batch_size=25, cursor=200, last_saved=48, last_run_at=2026-10-09T02:01:19.565Z. Do not claim complete until investigated and successfully verified.
Critical source audit finding: the current Worker routes shown in src/worker.js expose state-changing handlers including POST /api/settings, POST /api/approvals, POST /api/notifications/whatsapp and other POST business routes without an evident shared owner/session authorization check at the routing layer. CORS also allows all origins. This is a source-review finding, not an exploit test. Treat the public control/mutation API as a HIGH-PRIORITY security gap.
Do not deploy a quick blanket auth patch: the existing dashboard currently calls these APIs without an authorization header, and a rushed patch could lock out the owner/staff or break customer requests. First design and test a low-friction session/role gate while keeping genuinely public customer request routes functional; then test direct API calls and UI flows before any deployment.
No app source changes were made and no deployment was performed during this live recheck.
## 12. Start-work findings — 2026-10-10
Created verified pre-security backup at _MASTER_CONTROL\snapshot\pre-security-audit-20261010-092833 containing worker.js, wrangler.jsonc, gmail-oauth.js and gmail-autoreply.js.
Local Wrangler 4.141.0 dry-run passed: 172.36 KiB total upload / 36.79 KiB gzip; D1 binding resolved. This is a local dry-run only, not a deployment.
Upstream https://sakoonsay.com/products.json?limit=250 returned 250 product handles. A read-only sample of product JS endpoints for handles 200–224 returned 25 successful responses and 0 failures. This suggests the PARTIAL status needs correlation with the live Worker version/settings and cursor progression; no cause is confirmed yet.
Local source's catalog discovery requests only the first 250 products and does not implement explicit pagination. If the upstream catalog exceeds 250, additional products may be missed. Verify actual catalog count/pagination semantics before changing sync behavior.
Security approach must be designed before code patch: current dashboard helper calls API without auth headers, and public customer request POST must remain accessible. Do not apply a blanket auth check that breaks customer intake or locks out the dashboard. Existing discovery adapters already use separate bearer-token guards, but those do not protect other Worker routes.

## 13. Live recheck after start — 2026-10-10
GET /api/health returned HTTP 200 with service healthy.
GET /api/gmail/status returned HTTP 200; client ID and secret configured, authorized=true, actual_sending_ready=true (authorization timestamp 2026-10-09T15:55:32.756Z). This confirms configuration readiness only, not a real inbound-email/autoreply round trip.
The source sample fetch was read-only; no catalog products were modified during diagnosis. No application source edits and no deployment occurred in this start phase.
Next safe execution boundary: before applying authorization changes, choose an owner-authentication path that avoids a password prompt on every action but still authenticates dashboard users and enforces server-side roles. Do not store an owner bearer token in public source code or expose it in a browser-visible file. Cloudflare Access/Google identity session or a carefully implemented login/session are options to evaluate; preserve the public customer request submission route separately.
## 14. Voice dashboard MVP implementation — 2026-10-10
Local-only edit to src/worker.js: added a Voice Assistant navigation item and read-only panel with typed commands and browser speech-recognition enhancement. Supported status queries: system summary, catalog sync status, pending approvals/notifications, Gmail readiness, WhatsApp verification label, and buyer/seller/opportunity counts. Voice does not trigger settings changes, approvals, message sending, sync, purchases or orders. Typed input remains available when microphone support is absent. Inline JavaScript parse check passed (INLINE_JS_SYNTAX_OK). Wrangler dry-run passed at 177.22 KiB upload / 38.49 KiB gzip with D1 binding resolved. Live endpoints were rechecked separately and remain HTTP 200. This UI change is currently local and has NOT been deployed. Deployment is paused pending the high-priority authorization design so we do not publish a new build while known state-changing routes lack clear server-side owner/session authorization. No D1 data was changed.


## 15. Continuation checkpoint — 2026-10-10
Release history is now being maintained in the project-root `RELEASE_LOG.md`.
This checkpoint verified the live read-only `/api/dashboard` and `/api/controls` JSON shapes; the local voice MVP's referenced summary and catalog-sync fields align with the observed shape. Live dashboard values at this check: 188 products, 5 sellers, 0 buyers, 0 active requirements, 0 buyer matches, 0 opportunities, 0 pending approvals, 3 pending notifications, 1 delivery. Controls still show owner approval required. Catalog sync remains PARTIAL (cursor 200, last_saved 48); no sync was triggered.
A fresh local Wrangler dry-run on 2026-10-10 passed (177.22 KiB / 38.49 KiB gzip; D1 binding resolved; exit code 0). No source edit, D1 write, customer message, or deployment was made in this continuation check.
Still not complete: live owner/staff session and server-side authorization; end-to-end duplicate protection; automatic backup/rollback exercise; catalog sync root-cause and successful completion; Gmail inbound/reply round trip; WhatsApp end-to-end; and live deployment of the voice panel. Do not mark these complete until their tests pass.


## Continuation checkpoint — 2026-10-10 (security review)
- Verified new rollback snapshot: `_MASTER_CONTROL/snapshot/pre-auth-hardening-20261010/` contains worker.js, wrangler.jsonc, gmail-oauth.js, and gmail-autoreply.js.
- Security audit found no shared owner/staff session gate in the main worker routing. CORS currently permits all origins. Approval and other write endpoints need server-side authorization, not merely hidden dashboard buttons.
- Preserve public customer request submission at `/api/customer-requests`; protect staff/owner review and operational write routes. Do not break the external store/customer intake path.
- No live deployment or D1 writes were made during this review. Next implementation step is a tested owner/staff authentication boundary and corresponding dashboard login/session behavior; deploy only after unauthorized/authorized API tests pass.

## 16. Owner / Trusted Staff session MVP — 2026-10-10
- Added local module `src/auth-session.js` with signed HMAC session cookies (`HttpOnly; Secure; SameSite=Strict`, 8-hour expiry), Owner and Staff credentials supplied only through Worker secrets, login/logout/session-check routes, and server-side API authorization.
- Added a dashboard login gate and persistent session check. Dashboard controls/buttons are not removed; the gate covers the dashboard until sign-in. A logout control is shown after sign-in. Staff currently has read-only API access; Owner has the full dashboard/API role.
- Protected API requests by default; exception intentionally preserved for public `POST /api/customer-requests` used by the public store intake. Gmail OAuth start/callback and the existing bearer-token-guarded Gmail send route retain their dedicated flows; `/api/gmail/status` now falls behind the session guard.
- Added `auth-session.test.mjs`; tests passed for Owner login and cookie session, unauthenticated API denial, public customer intake exception, Staff write denial, Owner write access, and wrong-password rejection. `node --check` passed for worker and auth module. Wrangler dry-run passed (186.45 KiB / 40.97 KiB gzip; D1 binding resolved; exit code 0).
- Backup created at `_MASTER_CONTROL/snapshot/auth-session-mvp-20261010/` with worker, auth module, wrangler config, and test file.
- Not deployed. Live deployment is blocked until real secrets are set securely (`SESSION_SIGNING_SECRET`, `OWNER_LOGIN_PASSWORD`, optional `STAFF_LOGIN_PASSWORD`) and final live checks are performed. Do not put real passwords in chat or source files. No D1 data or catalog was changed.
- Known limitation for this MVP: Staff is strictly read-only; role-specific write permissions and login rate limiting/audit trail are future hardening items. The local Node test reports a non-blocking module-type warning because package.json is not marked as ESM; Wrangler bundle succeeds.


## 2026-10-10 — Authentication deployment checkpoint
- Live Worker now includes Owner email-based initial password setup/recovery and separate approved Staff accounts.
- Staff registration requests remain pending until Owner approves; approval sends a 15-minute one-use setup link. Passwords are PBKDF2 hashed; signed sessions expire after 8 hours; revoked/unapproved staff sessions are rejected.
- Public store customer request POST remains exempt from login; health endpoint is public; all other API routes require a session except the dedicated Gmail-send token-guarded route and auth flow.
- Deployment version: db65dfe1-4161-4b63-b24d-31f968f12efc.
- Smoke tests: Store and Worker homepages HTTP 200; inline scripts parse (2/2 each); health 200; unauthenticated /api/auth/me gives {ok:false}; protected dashboard returns 401; public customer-intake OPTIONS returns 200.
- Before calling the review complete, Owner must complete initial password setup from the live Worker login gate, then we can test signed-in Owner actions and Staff approval workflow interactively. Do not expose or store the Owner password in the project, release log, or chat.
