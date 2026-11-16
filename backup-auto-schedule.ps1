$ErrorActionPreference='Stop'
$root='D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL'
$stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$backup=Join-Path $root ("_MASTER_CONTROL\snapshot\pre-auto-discovery-schedule-"+$stamp)
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item (Join-Path $root 'src\worker.js') (Join-Path $backup 'worker.js')
Copy-Item (Join-Path $root 'src\outreach-scheduler.js') (Join-Path $backup 'outreach-scheduler.js')
Copy-Item (Join-Path $root 'src\gmail-autoreply.js') (Join-Path $backup 'gmail-autoreply.js')
Copy-Item (Join-Path $root 'wrangler.jsonc') (Join-Path $backup 'wrangler.jsonc')
Copy-Item (Join-Path $root 'package.json') (Join-Path $backup 'package.json')
Write-Output "BACKUP=$backup"
