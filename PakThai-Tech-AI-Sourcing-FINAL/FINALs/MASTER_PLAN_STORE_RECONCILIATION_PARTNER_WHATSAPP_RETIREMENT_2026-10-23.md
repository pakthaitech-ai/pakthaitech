# PakThai AI Sourcing + Store Master Plan Reconciliation — Partner WhatsApp Alert Retirement
Date: 2026-10-23 (Asia/Karachi)
Status: READ-ONLY AUDIT / PROPOSED CHANGES ONLY — NOT IMPLEMENTED

## Owner's latest decision (takes precedence for this workflow)
- Partner does not need AI Sourcing lead notifications on WhatsApp; staff login is sufficient to view assigned leads.
- Retire/disable the AI Sourcing partner WhatsApp lead-alert path only, using a narrow, reversible change.
- Do NOT disable, migrate, re-register, reset, or alter the Pakistan WhatsApp number +92 300 7982289.
- Do NOT disturb Meta account links, Facebook, Instagram, Gmail, Store WhatsApp contact/order links, Store customer notifications, or other Meta notifications.
- No code changes, deployment, production D1 writes, sending, or provider-setting changes until Owner reviews and approves the proposed change list.

## Scope and evidence reviewed
- Canonical Master Plan: `MASTER_PLAN_VOICE_REVIEW.md`
- Current source-of-truth and session handover documents.
- Prior report: `FINALs/MASTER_PLAN_VS_AI_SOURCING_SOURCE_AUDIT_2026-10-23.md`
- AI Sourcing modules: `src/partner-notifications.js`, `src/whatsapp-free-window.js`, `src/whatsapp-sender.js`, and references in `src/worker.js` / `src/gmail-oauth.js`.
- Store source tree: `D:\\pakthai\\PakThai-Store-DEPLOY`, including `index.html` and `app.js`.
- Store root has no `package.json`; do not assume the Store is a standalone npm project.
- This was a source/documentation inspection. It did not authenticate to Meta, inspect every private dashboard tab, or prove every live end-to-end integration.

## Findings
### 1. Partner WhatsApp alert path exists in AI Sourcing
- `src/partner-notifications.js` describes WhatsApp as the primary partner notification channel for customer requests.
- `src/whatsapp-free-window.js` can dispatch prepared external `partner_lead` WhatsApp notifications when a partner's opt-in and 24-hour service window qualify. It also handles inbound START/STOP and sends acknowledgements.
- `src/whatsapp-sender.js` exposes an Owner-session-protected sender for external WhatsApp partner-lead queue records, using the approved `pakthai_partner_lead_alert` template and checking Meta phone/template readiness.
- These paths are separate from the Store's visible WhatsApp contact link in `index.html` and the Store's customer/order request payload in `app.js`.
- Because the owner no longer wants partner alerts, keeping these partner dispatch paths active is no longer aligned with the latest workflow decision.

### 2. Preserve the staff-login workflow
- Intended replacement is internal visibility: partner/staff signs into the existing AI Sourcing dashboard and checks assigned leads there.
- Before implementing, confirm the existing staff role can view only its assigned leads and cannot access Owner-only controls or other partners' records. Source-level dashboard presence alone is not proof of a full authenticated role-isolation test.
- Lead creation, partner assignment, status tracking, audit history and Owner commercial approvals should remain intact.

### 3. Protect existing WhatsApp / Meta / Gmail / Store behavior
- Do not remove shared Meta credentials, WhatsApp webhook routes, phone-number configuration, the Store wa.me link, customer-request intake, Facebook/Instagram links, Gmail OAuth, or unrelated notifications.
- Disable only the AI Sourcing *partner-lead outbound alert* route/dispatch, not the underlying WhatsApp integration globally.
- Keep inbound webhook processing only if it is needed for unrelated Store/Meta features; remove/retire partner START acknowledgements and partner-lead sends from this workflow only after dependency review.
- Last recorded Meta phone evidence in the prior audit was CONNECTED / CLOUD_API / GREEN but `code_verification_status=NOT_VERIFIED`. This is historical evidence, not a fresh live check. No verification/reset/migration action is needed for the newly requested workflow and none should be attempted.

### 4. Master Plan consistency
- Free-first policy: maintained by avoiding unnecessary outbound partner alerts and avoiding paid template sends.
- No invented leads / safe prospect handling: retain.
- Owner approval for quotes, orders, purchases, payments, stock and delivery commitments: retain.
- Keep Crisp human live chat and the Store's existing WhatsApp contact link: retain.
- Avoid broad deletions: first disable/retire the partner outbound path, test staff access and ensure internal lead records remain visible; archive historical notification rows only if separately approved and only after retention implications are reviewed.
- Update older documentation that says partner WhatsApp alerts are planned/active; mark it as superseded by this dated Owner decision, do not erase release history.

## Proposed change list — NOT YET APPROVED OR IMPLEMENTED
1. Add an explicit configuration/feature gate for AI Sourcing partner-lead WhatsApp outbound, default OFF, and enforce it server-side in every dispatcher/sender path so direct endpoint calls cannot bypass it.
2. Stop enqueueing new external WhatsApp partner-lead alerts; retain internal notification/assignment records and dashboard visibility. Confirm whether an email-to-partner path exists before making any channel-routing changes; do not auto-send Gmail as a replacement without approval.
3. Disable partner START acknowledgement / automatic queued-lead dispatch only where these belong to the partner-alert workflow. Preserve unrelated Store WhatsApp and webhook functionality.
4. Review existing queued `prepared` / `approved` partner WhatsApp notifications. Do not send them; propose marking them held/retired with a clear reason, after checking status constraints. Do not delete historical records.
5. Add tests proving: partner alerts stay disabled even if sender endpoint is called; no new partner WhatsApp queue item is dispatched; staff can still see assigned leads; Owner-only controls remain protected; Store WhatsApp links/customer intake and Gmail/Meta configuration are untouched by the diff.
6. Update Master Plan addendum, source of truth, release log and next-session handover to record the new decision and exact scope.
7. Create a timestamped backup, review narrow diff, run focused + full tests, syntax checks, Wrangler dry-run, and inspect the final diff. Only then present the final deployment plan for separate Owner approval. No deploy before that approval.

## Explicitly out of scope
- No disabling or changing +92 300 7982289.
- No Meta/Facebook/Instagram unlinking, phone migration, re-registration, verification-code request, token rotation or settings edits.
- No changes to Store WhatsApp link, customer/order intake, Gmail OAuth or unrelated Meta notifications.
- No external messages, no paid template fallback, no new provider, no Cron change.
- No production D1 cleanup/deletion, no deployment, no release upgrade in this audit.

## Release gate / current decision
WAITING FOR OWNER REVIEW. This report records proposed changes only. No application source, production data, account configuration, or deployed Worker/Store was changed as part of this report.


## SUPERSEDED BY OWNER DIRECTION - 2026-10-23
The proposal above to retire/disable partner WhatsApp alerts is superseded by the Owner's newer instruction: Meta is considered complete by Owner; do not change Meta, Crisp, Telegram, Store WhatsApp, Gmail, or phone settings. Only fix technical AI Sourcing source-side issues and otherwise continue the Master Plan. See the appended 2026-10-23 source-side diagnostic UI correction in `MASTER_PLAN_VOICE_REVIEW.md`, `FINAL_SOURCE_OF_TRUTH.md`, and `NEXT_SESSION_START_HERE.md`. No outbound message or deployment was made.
