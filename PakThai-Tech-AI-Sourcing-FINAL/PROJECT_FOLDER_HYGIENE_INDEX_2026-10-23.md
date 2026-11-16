# Project Folder Hygiene Index — 2026-10-23

Canonical project root:
D:\\pakthai\\PakThai-Tech-AI-Sourcing-FINAL

## Start here
1. Read `NEXT_SESSION_START_HERE.md` first.
2. Treat `src\\worker.js` and the other non-backup `.js` files in `src` as the current working source.
3. Read `MASTER_PLAN_VOICE_REVIEW.md`, `FINAL_SOURCE_OF_TRUTH.md`, and the latest audit notes under `FINALs` for project status.
4. Run tests from the project root using the scripts in `package.json`; do not treat archived code as current.

## Folder meanings
- `src`: current source only. Historical `.bak`/backup copies were moved out on 2026-10-23.
- `tools`: active audit, maintenance, discovery, and test utilities. Some scripts can affect outreach or live data; inspect before running.
- `tools\\audit`: test/audit code plus dated lead snapshots. Keep JSON/SQL/CSV discovery snapshots; they may contain useful prospect records.
- `_MASTER_CONTROL\\snapshot`: dated rollback snapshots. Preserve; do not delete as clutter.
- `backups`: recent dated pre-change backups. Preserve.
- `OLD_WORKER_BACKUPS`: historical worker/source copies. The three remaining backup copies formerly in `src` are under `OLD_WORKER_BACKUPS\\ARCHIVED_SRC_BACKUPS_20261023`.
- `OLD_REPAIR_FILES`: old repair/debug scripts and artifacts. Archive only; do not run blindly.
- `OLD_REPORTS`: historical reports and lead CSV exports. Keep lead CSVs unless the actual data is independently verified elsewhere.
- `FINALs`: dated audit/reconciliation reports; retain for provenance.
- `node_modules`, `.wrangler`: tool/runtime working data. Do not hand-edit or archive while using the project.

## Safety / cleanup policy
- No source code, tests, configuration, credentials, database data, discovery/contact records, or rollback snapshots were deleted in this cleanup.
- Do not remove old buyer/seller prospect JSON, SQL, or CSV files solely because they are dated. They may be the only surviving copies of leads.
- Do not alter Meta/WhatsApp production configuration, production phone registration, Store, Crisp, Telegram, Gmail settings, or outreach behavior during folder hygiene.
- Do not send real outreach while cleaning or auditing.
- Move clearly historical backup copies out of `src`; keep archive paths stable and searchable.
- Do not claim the entire repository is free of all obsolete files; this pass focused on the source folder and identifying existing archive boundaries. Further cleanup should be evidence-based.

## 2026-10-23 actions
- Reviewed project root, `src`, `tools`, `backups`, and `_MASTER_CONTROL\\snapshot` structure.
- Moved three remaining `src` backup copies to `OLD_WORKER_BACKUPS\\ARCHIVED_SRC_BACKUPS_20261023`.
- Verified `src` now contains 19 active `.js` source files and zero filenames matching `.bak`, `.backup`, or `.before`.
- Existing lead CSV/JSON/SQL files and rollback snapshots were preserved.

## Follow-up archive pass � 2026-10-23
- Moved dated pre-fix audit script PAKTHAI-LIVE-AUDIT.ps1.pre-fix-20261010.bak from tools\audit to OLD_WORKER_BACKUPS\ARCHIVED_TOOL_BACKUPS_20261023.
- Verified tools\audit has no remaining files matching .bak, .before, or .pre-fix naming patterns.
- Historical reports and lead CSV/JSON/SQL snapshots remain in place; no lead snapshots or scripts with uncertain purpose were deleted.
- Root-level dated handoff/release documents were retained because some may contain canonical history. NEXT_SESSION_START_HERE.md remains the recommended entry point.


## Old handoff archive — 2026-10-23
- Created `OLD_HANDOFF` for superseded handoff/resume notes.
- Moved `RESUME-TOMORROW-2026-10-14.md` into `OLD_HANDOFF`.
- Kept `NEXT_SESSION_START_HERE.md` in the project root because it is the current session entry point, not an old handoff.
- Other dated release/status documents were not moved just based on age; review them after checking references and current project status.
- Once the project work is completed, create a fresh completion report dated 2026-10-23, based only on checks actually performed and results verified at that time.

## Further organization — old handoffs consolidated (2026-10-23)
- Consolidated the historical handoff files from `OLD_REPORTS\\LEGACY_HANDOFFS_2026-10-22` into the root `OLD_HANDOFF` folder, alongside the previously archived resume note.
- Added `OLD_HANDOFF\\README.md` to explain that these are historical only and to point to the current entry points.
- `FINAL_SOURCE_OF_TRUTH.md` remains in the project root as the single canonical source-of-truth document. `NEXT_SESSION_START_HERE.md` also remains at root as the quick-start entry point; `RELEASE_LOG.md` remains at root as deployment/change history.
- Active `wrangler.jsonc`, `package.json`, `package-lock.json`, source code, tests, runtime/dependency folders, backups, and lead-data archives were not moved because their paths or contents can be operationally important.
- Final completion report is intentionally deferred until the project work is completed; then create a dated report based on checks actually performed and verified.
