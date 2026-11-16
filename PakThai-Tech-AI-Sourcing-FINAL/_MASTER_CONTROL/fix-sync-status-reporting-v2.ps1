$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s=[System.IO.File]::ReadAllText($p)
Copy-Item $p ($p+'.pre-sync-status-ui-20261010.bak') -Force
$batchPattern="Math\.min\(25,Math\.floor\(settingNum\(settings,'catalog_sync_batch_size',25\)\)\)"
if(-not [regex]::IsMatch($s,$batchPattern)){throw 'batch-size clamp not found; no edit made.'}
$s=[regex]::Replace($s,$batchPattern,"Math.min(50,Math.floor(settingNum(settings,'catalog_sync_batch_size',25)))",1)
$statusPattern="(?m)^(\s*)last_status: settings\.catalog_sync_last_status \|\| null$"
if(-not [regex]::IsMatch($s,$statusPattern)){throw 'catalog sync status field not found; no edit made.'}
$nl=[Environment]::NewLine
$s=[regex]::Replace($s,$statusPattern,[System.Text.RegularExpressions.MatchEvaluator]{
 param($m)
 $i=$m.Groups[1].Value
 return $i+"last_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_failed',0))),"+$nl+$i+"last_cycle_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_cycle_failed',0))),"+$nl+$i+"last_error: settings.catalog_sync_last_error || null,"+$nl+$i+"last_status: settings.catalog_sync_last_status || null"
},1)
$discoverPattern="(?s)(async function runScheduledCatalogSync\(env\) \{.*?)(  const handles = await discoverSourceHandles\(\);\r?\n)(.*?  if \(!handles\.length\) \{)"
if(-not [regex]::IsMatch($s,$discoverPattern)){throw 'scheduled discovery block not found; no edit made.'}
$s=[regex]::Replace($s,$discoverPattern,[System.Text.RegularExpressions.MatchEvaluator]{
 param($m)
 $prefix=$m.Groups[1].Value
 $suffix=$m.Groups[3].Value
 $new=@'
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
 return $prefix+$new+$suffix
},1)
[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched sync status visibility, batch-size display, and discovery-failure logging.'
Select-String -Path $p -Pattern 'batch_size: Math.max|last_failed:|last_cycle_failed:|let handles;|catalog_sync_last_status.*failed' | ForEach-Object { $_.Line.Trim() }
