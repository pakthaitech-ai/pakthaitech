# PakThai AI Sourcing — Project File Index
Updated: 2026-10-23
Root: `D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL`

## Start here (current, not archived)
1. `FINAL_SOURCE_OF_TRUTH.md` — canonical current status, rules, blockers and next steps.
2. `NEXT_SESSION_START_HERE.md` — short continuation checklist and latest session notes.
3. `MASTER_PLAN_VOICE_REVIEW.md` — master plan / intended end state.
4. `RELEASE_LOG.md` — chronological implementation and deployment history.
5. `PROJECT_FOLDER_HYGIENE_INDEX_2026-10-23.md` — folder cleanup record.
6. This file, `PROJECT_FILE_INDEX.md` — where to find files by purpose.

## Current application / do not casually move
- `src\worker.js` — Cloudflare Worker entry point and route wiring.
- `src\*.js` — active application modules (auth, discovery, sourcing, notifications, support, WhatsApp, Gmail, Telegram).
- `wrangler.jsonc` — active Worker, bindings and schedule configuration.
- `package.json`, `package-lock.json` — scripts and dependency lock.
- `node_modules\`, `.wrangler\` — generated dependencies/runtime cache; do not manually reorganize.
- Root `*.test.mjs` and `tools\audit\` tests — automated regression/audit tests. Check `package.json` before moving any test.

## Current plan, truth, and release documents
- `FINAL_SOURCE_OF_TRUTH.md` — canonical status and safety rules; keep in root.
- `NEXT_SESSION_START_HERE.md` — current quick-start; keep in root.
- `MASTER_PLAN_VOICE_REVIEW.md` — master plan.
- `RELEASE_LOG.md` — long-form change/deployment history.
- `CURRENT_NOTIFICATION_AUTOMATION_2026-10-22.md` — notification policy/status record; compare with newer source/audit before acting.
- `FINAL_WHATSAPP_WORKFLOW_FIX_2026-10-23.md` — dated source-fix report; not proof of actual delivery.
- `FINALs\` — dated audits/reconciliation reports; historical evidence, read latest relevant report.
- `PROJECT_STRUCTURE.md` — older structure note; some paths/details may be stale, verify against current tree.
- `RELEASE_LOG-2026-10-14-UPDATE.md` — dated release summary, historical.
- `KOREA_PICKUP_CONFIG.md` — Korea pickup/discovery config notes; verify current source before use.

## Folder map
- `src\` — active runtime source.
- `tools\audit\` — test/audit scripts and dated JSON/SQL/CSV prospect snapshots. Preserve prospect data.
- `tools\maintenance\` — maintenance utilities; inspect scripts before running. `legacy\` holds old utilities.
- `tools\sql\` — SQL utilities/history; never run historical SQL against production without review.
- `tools\openserp\` — bundled discovery tool.
- `backups\` — dated pre-change rollback copies; preserve.
- `_MASTER_CONTROL\snapshot\` — rollback snapshots and evidence; preserve.
- `_MASTER_CONTROL\reports\` — audit reports and status evidence.
- `_MASTER_CONTROL\docs\` — integration and plan-history documents.
- `_MASTER_CONTROL\working\` — work-in-progress artifacts; inspect before relying on them.
- `OLD_HANDOFF\` — superseded chat/session handoffs only. Never treat these as current instructions.
- `OLD_WORKER_BACKUPS\` — historical Worker/source/config copies. Do not deploy from here.
- `OLD_REPAIR_FILES\` — old repair scripts, captured pages and patch artifacts. Do not run blindly.
- `OLD_REPORTS\` — old reports plus Pakistan buyer lead CSVs; preserve lead CSVs.
- `FINALs\` — dated final/audit reports, not the canonical source-of-truth.
- `logo pics\` — project logo/image assets.

## Prospect / lead data — preserve
- `tools\audit\` may contain dated buyer/seller JSON, CSV and SQL snapshots.
- `OLD_REPORTS\pakistan-*.csv` contains historical Pakistan buyer lead exports.
- These are discovery candidates, not automatically verified buyers/sellers. Do not delete, merge, or import them based on filename alone.

## Duplicate / cleanup policy
- Exact byte-identical files may be candidates for archival only after confirming neither is an active config/source file and references are checked.
- Similar filenames or older dates do not prove duplicates.
- Preserve all rollback snapshots, SQL/CSV/JSON prospect records, production configuration, secrets and test fixtures.
- Keep one canonical current status file: `FINAL_SOURCE_OF_TRUTH.md`. Other status reports remain dated evidence.
- Once project implementation is complete, write a fresh dated completion report with only checks actually run and evidence actually verified.

## Known caveats
- Some historical docs contain contradictory or outdated statuses and old checkout paths. Prefer current source plus latest dated audit, and update this index when file organization changes.
- Folder inventory and duplicate-hash audit are not yet complete; no files should be deleted based solely on an unverified duplicate claim.
