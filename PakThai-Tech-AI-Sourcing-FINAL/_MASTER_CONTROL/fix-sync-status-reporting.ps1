$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s=[System.IO.File]::ReadAllText($p)
Copy-Item $p ($p+'.pre-sync-status-ui-20261010.bak') -Force
$old="Math.min(25,Math.floor(settingNum(settings,'catalog_sync_batch_size',25)))"
$new="Math.min(50,Math.floor(settingNum(settings,'catalog_sync_batch_size',25)))"
if(-not $s.Contains($old)){ throw 'batch-size clamp not found; no edit made.' }
$s=$s.Replace($old,$new)
$old2=@'
          last_saved: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_saved',0))),
          last_status: settings.catalog_sync_last_status || null
'@
$new2=@'
          last_saved: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_saved',0))),
          last_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_failed',0))),
          last_cycle_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_cycle_failed',0))),
          last_error: settings.catalog_sync_last_error || null,
          last_status: settings.catalog_sync_last_status || null
'@
if(-not $s.Contains($old2)){ throw 'catalog_sync control fields not found; no edit made.' }
$s=$s.Replace($old2,$new2)
$old3=@'
  const handles = await discoverSourceHandles();

  if (!handles.length) {
'@
$new3=@'
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

  if (!handles.length) {
'@
if(-not $s.Contains($old3)){ throw 'scheduled discovery block not found; no edit made.' }
$s=$s.Replace($old3,$new3)
[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched sync status visibility, batch-size display, and discovery-failure logging.'
Select-String -Path $p -Pattern 'batch_size: Math.max|last_failed:|last_cycle_failed:|let handles;|catalog_sync_last_status.*failed' | ForEach-Object { $_.Line.Trim() }
