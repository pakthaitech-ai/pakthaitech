$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s=[System.IO.File]::ReadAllText($p)
$old="env.WHATSAPP_PHONE_NUMBER_ID || '1426391470555242'"
$new="env.WHATSAPP_PHONE_NUMBER_ID || '1359558747244650'"
if(-not $s.Contains($old)){throw 'WhatsApp phone ID fallback did not match; no edit made.'}
Copy-Item $p ($p+'.pre-whatsapp-phone-id-fix-20261010.bak') -Force
$s=$s.Replace($old,$new)
[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Updated WhatsApp fallback Phone Number ID to the latest confirmed PakThai +92 asset; backup created.'
Select-String -Path $p -Pattern 'WHATSAPP_PHONE_NUMBER_ID' | ForEach-Object { $_.Line.Trim() }
