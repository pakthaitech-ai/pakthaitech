$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s=[System.IO.File]::ReadAllText($p)
Copy-Item $p ($p+'.pre-sync-status-ui2-20261010.bak') -Force
$s=$s.Replace("Math.min(25,Math.floor(settingNum(settings,'catalog_sync_batch_size',25)))","Math.min(50,Math.floor(settingNum(settings,'catalog_sync_batch_size',25)))")
$old="last_status: settings.catalog_sync_last_status || null"
$new="last_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_failed',0))),"+[Environment]::NewLine+"          last_cycle_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_cycle_failed',0))),"+[Environment]::NewLine+"          last_error: settings.catalog_sync_last_error || null,"+[Environment]::NewLine+"          last_status: settings.catalog_sync_last_status || null"
if(-not $s.Contains($old)){throw 'sync status field missing; no edit made.'}
$s=$s.Replace($old,$new)
$start=$s.IndexOf('async function runScheduledCatalogSync(env) {')
if($start -lt 0){throw 'scheduled function missing; no edit made.'}
$pos=$s.IndexOf('  const handles = await discoverSourceHandles();',$start)
if($pos -lt 0){throw 'scheduled discovery call missing; no edit made.'}
$oldLine='  const handles = await discoverSourceHandles();'
$nl=[Environment]::NewLine
$newBlock=@'
  let handles;
  try {
    handles = await discoverSourceHandles();
  } catch (e) {
    const now = new Date().toISOString();
    const message = String(e?.message || e).slice(0, 1000);
    await Promise.all([
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','failed') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(),
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(now).run(),
      env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(message).run()
    ]);
    return { ok: false, status: "failed", error: message, ran_at: now };
  }
'@
$s=$s.Substring(0,$pos)+$newBlock+$s.Substring($pos+$oldLine.Length)
[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched sync status fields and discovery error logging.'
Select-String -Path $p -Pattern 'last_failed:|last_cycle_failed:|let handles;|catalog_sync_last_status.*failed|batch_size: Math.max' | ForEach-Object { $_.Line.Trim() }
