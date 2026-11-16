$ErrorActionPreference = 'Stop'
Set-Location 'D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL'
$backup = 'D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL\_MASTER_CONTROL\snapshot\pre-masterplan-full-audit-20261023_164000'
New-Item -ItemType Directory -Force -Path $backup | Out-Null
$files = @('MASTER_PLAN_VOICE_REVIEW.md','FINAL_SOURCE_OF_TRUTH.md','NEXT_SESSION_START_HERE.md','RELEASE_LOG.md','src\worker.js','src\buyer-discovery.js','src\seller-discovery.js','src\market-discovery.js','src\korea-seller-discovery.js','src\ai-prospect-screening.js','.validate-inline.mjs','tools\audit\discovery-batching.test.mjs')
foreach ($f in $files) { Copy-Item -LiteralPath $f -Destination $backup -Force }
Write-Output ('BACKUP=' + $backup)
Write-Output '---GIT STATUS---'
git status --short
Write-Output '---DIFF STAT---'
git diff --stat
Write-Output '---LIVE ENDPOINTS---'
curl.exe -sS -w ' HEALTH_HTTP=%{http_code}`n' https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/health
curl.exe -sS -o NUL -w ' STORE_HTTP=%{http_code}`n' https://pakthai-tech-store.pages.dev/
