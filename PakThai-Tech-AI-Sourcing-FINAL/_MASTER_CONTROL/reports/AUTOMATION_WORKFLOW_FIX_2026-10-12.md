# Automation Workflow Fix — 2026-10-12

## Deployed
- Worker: https://pakthai-ai-sourcing.pakthaitech.workers.dev
- Version: d5b527af-75f8-4682-aea0-43b694232118
- Deployment succeeded; Worker health and public catalog smoke checks passed.

## Changes
- Dashboard now includes an Owner outbound-message queue for prepared/approved Gmail and WhatsApp notifications.
- Added an Owner-confirmed Approve & Send action that calls the official Gmail or WhatsApp API; it does not open WhatsApp Web.
- Gmail send route now accepts a valid Owner session as well as the configured send token; unauthenticated send remains HTTP 401.
- Daily outreach scheduler now prepares at most 3 email drafts per run; it never sends email automatically.
- Outreach draft queue can be prepared from the dashboard without sending any messages.
- After an Owner-approved outreach email is accepted by Gmail, campaign status advances and schedules follow-ups after 3 and 7 business days.
- Before a follow-up draft, scheduler checks for replies; replies stop the sequence, and STOP/unsubscribe requests add a suppression.
- Hourly matching and opportunity generation now respect Auto Search, Seller Matching and Opportunity Creation controls.
- Daily prospect discovery and AI screening respect Auto Search.
- Added regression tests for draft-only outreach, 3-draft limit, automation switches, message queue and unauthorized Gmail send.

## Verification
- npm.cmd test: 49 passed, 0 failed.
- npm.cmd run dry-run: passed.
- Production /api/health: HTTP 200.
- Production /api/catalog: HTTP 200, 388 products.
- Unauthenticated notifications, outreach, Gmail-send and WhatsApp-send endpoints: HTTP 401.
- Dashboard HTML includes the outbound queue and draft-preparation action.

## External side effects and remaining limitations
- No new emails or WhatsApp messages were sent during this deployment.
- Outbound messages remain prepared until an Owner approves and sends them from the dashboard.
- WhatsApp API acceptance still does not prove recipient delivery; delivery status depends on Meta webhook callbacks.
- Gmail inbox/reply handling is still draft-first; this change did not enable unattended automatic sending.
- The Worker’s routine outreach schedule runs at 09:00 Pakistan time, Monday–Saturday, and queues up to 3 drafts per run.
