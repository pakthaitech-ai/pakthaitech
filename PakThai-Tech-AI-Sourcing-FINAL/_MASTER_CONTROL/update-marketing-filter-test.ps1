$ErrorActionPreference='Stop'
$p='D:\pakthai\PakThai-Tech-AI-SOURCING-FINAL\tools\audit\gmail-autoreply.test.mjs'
$s=[IO.File]::ReadAllText($p)
$old='assert.equal(h.processed.get("msg-2").reason, "no_clear_commercial_enquiry");'
$new='assert.equal(h.processed.get("msg-2").reason, "automated_or_bulk_sender");'
if(-not $s.Contains($old)){throw 'Expected assertion not found; no test file changed.'}
[IO.File]::WriteAllText($p,$s.Replace($old,$new),[Text.UTF8Encoding]::new($false))
Write-Output 'Updated test to assert promotional mail is classified as bulk/marketing.'
