$ErrorActionPreference = 'Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s=[IO.File]::ReadAllText($p)
$startMarker='async function sendWhatsAppTemplateTest(){'
$endMarker='async function archiveNotificationRecord(id){'
$start=$s.IndexOf($startMarker)
if($start -lt 0){throw 'WhatsApp template test helper not found'}
$end=$s.IndexOf($endMarker,$start+$startMarker.Length)
if($end -lt 0){throw 'Archive helper boundary not found'}
$replacement=@'
async function sendWhatsAppTemplateTest(){
 const box=document.getElementById('whatsAppMailbox');
 if(box)box.textContent='Automated WhatsApp sending is paused during provider migration. No message was sent.';
}
'@
$s=$s.Substring(0,$start)+$replacement+$s.Substring($end)
[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))
Write-Output 'Removed hardcoded Nadeem/Meta template test path from dashboard JavaScript.'
