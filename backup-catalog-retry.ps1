$root='D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL'
$stamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$backup=Join-Path $root ('_MASTER_CONTROL\snapshot\pre-catalog-retry-fix-'+$stamp)
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item (Join-Path $root 'src\worker.js') (Join-Path $backup 'worker.js')
Copy-Item (Join-Path $root 'package.json') (Join-Path $backup 'package.json')
Copy-Item (Join-Path $root 'tools\audit\discovery-batching.test.mjs') (Join-Path $backup 'discovery-batching.test.mjs')
Write-Output ('BACKUP='+$backup)
Get-FileHash (Join-Path $backup 'worker.js') -Algorithm SHA256
