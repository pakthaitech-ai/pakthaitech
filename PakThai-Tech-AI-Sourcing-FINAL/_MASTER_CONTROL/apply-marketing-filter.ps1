$ErrorActionPreference='Stop'
$p='D:\pakthai\PakThai-Tech-AI-SOURCING-FINAL\src\gmail-autoreply.js'
$s=[IO.File]::ReadAllText($p)
$old='|| header(hs,"List-Id")) {'
$new='|| header(hs,"List-Id") || header(hs,"List-Unsubscribe") || /newsletter|new features|product update|special offer|limited-time offer|marketing update|weekly update|monthly update|uploaded an image recently|unlocking production features/i.test(originalSubject + " " + (msg.snippet || ""))) {'
if(-not $s.Contains($old)){ throw 'Target filter not found; no file changed.' }
$backup=$p+'.pre-marketing-filter-20261027.bak'
[IO.File]::Copy($p,$backup,$true)
$s=$s.Replace($old,$new)
[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))
Write-Output "Updated Gmail auto-reply filter. Backup: $backup"
