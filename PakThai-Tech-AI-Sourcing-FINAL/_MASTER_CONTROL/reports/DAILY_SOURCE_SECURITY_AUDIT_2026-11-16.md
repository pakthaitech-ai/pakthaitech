# PakThai Daily Source Security Audit — 2026-11-16

## Scope
- GitHub repository: `pakthaitech-ai/pakthaitech`
- Local checkout: `D:\pakthai`
- Main application: `PakThai-Tech-AI-Sourcing-FINAL`
- Related Store source: `PakThai-Store-DEPLOY`
- Windows self-hosted runner: `DESKTOP-MRO7VUR`

## Findings before remediation
- Git branch was `main`, tracking `origin/main`; no pre-existing tracked working-tree changes were present.
- GitHub showed both existing workflows completing successfully, but both targeted `ubuntu-24.04`; the newly registered Windows self-hosted runner was therefore not receiving these jobs.
- The daily source audit workflow used `continue-on-error: true` for both npm audit steps and `|| true` for the full audit. A green workflow could therefore hide dependency vulnerabilities.
- Production dependency audit: 0 vulnerabilities.
- Full dependency audit initially reported 4 high-severity vulnerable package entries in development tooling: Wrangler 4.141.0 and transitive Miniflare, Sharp and Undici dependencies. The lockfile included Miniflare 5.20260925.0-alpha, Sharp 0.35.4 and Undici 7.29.0.
- Initial local `node_modules` was inconsistent with the lockfile (`npm ls` reported extraneous/invalid packages). This was corrected with a clean `npm ci`.

## Remediation
- Updated the exact dev dependency `wrangler` from 4.141.0 to 4.163.0 and regenerated `package-lock.json`.
- Preserved pre-change `package.json`, `package-lock.json` and the prior daily workflow in:
  `_MASTER_CONTROL/snapshot/pre-dependency-audit-fix-20261116_191208/`
- Updated `.github/workflows/daily-source-audit.yml` to target the repository's Windows runner labels: `[self-hosted, Windows, X64]`.
- Removed `continue-on-error` from the production dependency audit.
- Changed the complete dependency audit to run even after earlier step failures and to preserve npm's non-zero exit status. Audit evidence is still uploaded with `if: always()`.
- The separate 30-minute Engine Runner workflow remains on GitHub-hosted Ubuntu; only the daily source audit was moved to the local Windows runner.
- No Worker or Pages deployment, production database mutation, billing change, external email, WhatsApp message, customer/partner outreach, quote, purchase or order was performed.

## Post-remediation validation
- Clean locked install: `npm ci --no-audit --no-fund` — PASS.
- Top-level dependency tree: only declared dependencies; Wrangler 4.163.0 — PASS.
- Project test suite: 149 passed, 0 failed — PASS.
- Dashboard inline validation: HTTP 200; 2 inline scripts checked — PASS.
- Production dependency audit: 0 vulnerabilities — PASS.
- Full dependency audit: 0 info, 0 low, 0 moderate, 0 high, 0 critical — PASS.
- Wrangler 4.163.0 deploy dry-run: PASS; 591.35 KiB upload / 131.71 KiB gzip.
- npm emitted an install-script allow-list warning for `esbuild@0.28.2` and `workerd@1.20261116.1`. No install-script approvals were added; tests and Wrangler dry-run succeeded without changing that policy.

## Workflow verification status
- The daily audit workflow has been updated locally to run on the self-hosted Windows runner and to fail on npm audit findings.
- Commit/push and a GitHub Actions run on `DESKTOP-MRO7VUR` are pending at the time this report was first written. Do not call the runner workflow verified until GitHub shows a completed run assigned to the self-hosted runner.
- The Windows runner service was observed as `Running` with `Automatic` startup; GitHub previously displayed the runner as `Idle`.
- The runner's system PATH includes Git for Windows. The remote PowerShell session itself did not refresh/use that PATH, so Git was invoked by its verified absolute path during this audit.

## Remaining boundaries
- This is a source/dependency and CI audit, not a full penetration test or proof of every live business workflow.
- WhatsApp automation remains disabled; Meta phone verification/delivery is not to be bypassed.
- Gmail real delivery, push notification receipt, Store Analytics funnel events, verified FX/landed-cost rates, and actual buyer/opportunity creation remain evidence-gated as recorded in the canonical project notes.
- Keep the Windows machine powered on and connected for scheduled self-hosted audits. If it is offline, GitHub will leave the job queued until a matching runner is available.


## Self-hosted GitHub Actions integration — 2026-11-16
The repository-side workflow is now configured to use the local Windows checkout directly (no third-party `uses:` actions), Node/npm already installed on the PC, and a clean/main/revision guard before running tests and audits. The current workflow commit is `be4de41`.

Integration attempts and observed outcomes:
- Run `43884092805`: runner accepted the job; checkout failed on a Windows long-path file and the default `pwsh` shell was unavailable.
- Run `43885268652`: cancelled while the broad sparse checkout stalled.
- Run `43887595916`: cancelled after the runner ActionManager timed out while downloading external GitHub Actions.
- Run `43889352202`: failed during the runner job due to a GitHub Actions service WebSocket/connectivity probe failure.
- Run `43890573425`: local repository verification step exited non-zero. The Git safe-directory setting was normalized to `D:/pakthai` in the follow-up workflow commit.
- Run `43891088323`: queued and not yet assigned to a runner at last check.

Current machine evidence:
- Windows runner service is `Running` with `Automatic` startup.
- `Runner.Listener` process is responsive and has an established TCP 443 connection.
- The remote command session is not elevated (`IsAdministrator=False`); restarting the Windows service was denied. No attempt was made to bypass elevation.
- The local Git checkout is clean on `main`, at the pushed workflow revision. Node.js 24.20.0 and npm 11.19.0 are available in the machine PATH.
- ACL inspection showed inherited Modify access for Authenticated Users on `D:\pakthai`; the runner service account is `NT AUTHORITY\NETWORK SERVICE`.

Next operational step: from an elevated Administrator PowerShell on the PC, restart the runner service with:
`Restart-Service -Name "actions.runner.pakthaitech-ai-pakthaitech.DESKTOP-MRO7VUR"`
Then confirm the service returns to Running and check whether queued run `43891088323` is assigned to `DESKTOP-MRO7VUR`. If the runner still does not accept the job, investigate outbound WebSocket connectivity to `*.actions.githubusercontent.com` over TCP 443. Do not mark GitHub-side self-hosted execution verified until a full run completes successfully.


## Final checkpoint — 2026-11-16
- Latest workflow commit: `243c7b8`. The local revision guard now accepts a clean local `main` that contains the triggering SHA (for example, when only documentation commits follow the trigger), while refusing dirty or divergent checkouts.
- Latest GitHub audit run: `43892271305` (run #9), status `queued` at final check; no runner assignment had occurred yet.
- Runner service remains `Running` / `Automatic`; `Runner.Listener` is responsive. The remote command context is non-administrator, so service restart could not be performed from this session.
- Required handoff: execute the one-line `Restart-Service` command above from elevated Administrator PowerShell, then verify run `43892271305` is assigned to `DESKTOP-MRO7VUR` and completes. Until then, the local audit is PASS but GitHub self-hosted scheduled execution remains PENDING.
