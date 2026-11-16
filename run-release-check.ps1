$ErrorActionPreference = 'Stop'
Set-Location 'D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL'
Write-Output '--- FULL TESTS ---'
npm.cmd test
if ($LASTEXITCODE -ne 0) { throw ('TESTS_FAILED=' + $LASTEXITCODE) }
Write-Output '--- WORKER SYNTAX ---'
node --check src\worker.js
if ($LASTEXITCODE -ne 0) { throw 'WORKER_SYNTAX_FAILED' }
Write-Output '--- DRY RUN ---'
npx.cmd wrangler deploy --dry-run
if ($LASTEXITCODE -ne 0) { throw ('DRY_RUN_FAILED=' + $LASTEXITCODE) }
Write-Output '--- DEPLOY ---'
npx.cmd wrangler deploy
if ($LASTEXITCODE -ne 0) { throw ('DEPLOY_FAILED=' + $LASTEXITCODE) }
Write-Output '--- POST DEPLOY ---'
curl.exe -sS -w ' HEALTH_HTTP=%{http_code}`n' https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/health
curl.exe -sS -o NUL -w ' STORE_HTTP=%{http_code}`n' https://pakthai-tech-store.pages.dev/
