# PakThai Tech AI Sourcing - Project Structure

Canonical project folder: D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL
Store: https://pakthai-tech-store.pages.dev/
Worker: https://pakthai-ai-sourcing.pakthaitech.workers.dev/

## Keep these root files stable
- src\worker.js: Cloudflare Worker entry point
- src\auth-session.js: owner/staff session authentication
- src\gmail-oauth.js and related src modules: Gmail integration
- wrangler.jsonc: active Worker and D1/cron configuration
- package.json / package-lock.json: project dependencies
- MASTER_PLAN_VOICE_REVIEW.md: canonical master plan
- RELEASE_LOG.md: change/deployment history
- NEXT_CHAT_HANDOVER.md: continuation handover
- auth-session.test.mjs: authentication regression tests
- Owner: retained untouched; contents intentionally not copied into reports

## Organized folders
- _MASTER_CONTROL\snapshot\: rollback snapshots and config backups
- _MASTER_CONTROL\reports\live-audit-2026-10-10\: captured live HTML/JS and worker audit output
- _MASTER_CONTROL\reports\historical\: dated status and test artifacts
- _MASTER_CONTROL\docs\integrations\: integration setup notes
- _MASTER_CONTROL\docs\master-plan-history\: older plan addenda; canonical plan remains at root
- _MASTER_CONTROL\quarantine\zero-byte-artifacts\: suspicious empty artifact preserved, not deleted
- tools\audit\: reusable audit/check scripts
- tools\maintenance\legacy\: older temporary scripts and deployment command; do not run without review
- tools\sql\historical\: historical SQL files; review before any execution
- OLD_REPAIR_FILES, OLD_REPORTS, OLD_WORKER_BACKUPS: legacy archives retained
- tools\openserp: existing bundled tool retained in place
- node_modules and .wrangler: generated dependencies/cache; not source of truth

## Safety rules
1. Do not edit/deploy the Worker without a timestamped backup, focused tests, and an explicit approved change.
2. Never run cleanup-test-data SQL or TEMP scripts on production without a reviewed plan.
3. Do not store secrets/passwords/tokens in source files or project reports.
4. The current local folder does not contain the deployable Cloudflare Pages store source/Function for /catalog. Only a captured live-page.html is retained in the audit report. Recover the actual Pages source/repository before repairing the store catalog route.
5. The external pre-organization backup is at D:\Horse 2\PakThai-Tech-AI-Sourcing-PRE-ORG-20261010.



## Canonical source-of-truth update — 2026-10-11
- Read `FINAL_SOURCE_OF_TRUTH.md` first for current state; `NEXT_CHAT_HANDOVER.md` is the new-chat continuation note.
- Consolidated final status: `_MASTER_CONTROL\reports\FINAL_PROJECT_STATUS_2026-10-11.md`.
- Dated audit reports and backups are historical records and must not override the current source-of-truth file. Preserve them; do not restore old seller/test data.
