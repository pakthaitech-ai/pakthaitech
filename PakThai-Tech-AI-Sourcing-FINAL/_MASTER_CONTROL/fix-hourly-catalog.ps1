$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s = [System.IO.File]::ReadAllText($p)
$old = @'
    // Cron 1: the daily 02:00 trigger is reserved for SakoonSay catalog sync.
    // Cron 2: hourly trigger runs Pakistan Buyer -> Bangkok Seller automation.
    const cron = String(event?.cron || "").trim();
    if (cron === "0 * * * *") {
      ctx.waitUntil(runGmailAutoReply(env));
      ctx.waitUntil(runScheduledPhase2(env));
      return;
    }
    ctx.waitUntil(runScheduledCatalogSync(env));
'@
$new = @'
    // Daily trigger performs a catalog batch; the hourly trigger also advances
    // the catalog cursor so a large source catalog does not take many days.
    const cron = String(event?.cron || "").trim();
    if (cron === "0 * * * *") {
      ctx.waitUntil(runGmailAutoReply(env));
      ctx.waitUntil(runScheduledPhase2(env));
      ctx.waitUntil(runScheduledCatalogSync(env));
      return;
    }
    ctx.waitUntil(runScheduledCatalogSync(env));
'@
if (-not $s.Contains($old)) { throw 'Scheduled handler block did not match; no edit made.' }
Copy-Item $p ($p + '.pre-hourly-catalog-20261010.bak') -Force
$s = $s.Replace($old,$new)
[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched hourly cron to advance catalog sync; backup created.'
