$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s=[System.IO.File]::ReadAllText($p)
Copy-Item $p ($p+'.pre-manual-sync-reporting-20261010.bak') -Force
$oldRoute=@'
  if (path === "/api/sync/source" && method === "POST") {
    const b = await request.json().catch(() => ({}));
    return json(await syncSource(env.DB, Math.max(0, Math.floor(num(b.start))), 25));
  }
'@
$newRoute=@'
  if (path === "/api/sync/source" && method === "POST") {
    const b = await request.json().catch(() => ({}));
    const start = Math.max(0, Math.floor(num(b.start)));
    const batchSize = Math.max(1, Math.min(50, Math.floor(num(b.batch_size) || 50)));
    return json(await runManualCatalogSyncBatch(env, start, batchSize));
  }
'@
$routeStart=$s.IndexOf('  if (path === "/api/sync/source" && method === "POST") {')
if($routeStart -lt 0){throw 'Manual sync route start not found; no edit made.'}
$retPos=$s.IndexOf('return json(await syncSource', $routeStart)
if($retPos -lt 0){throw 'Manual sync route body not found; no edit made.'}
$routeEnd=$s.IndexOf('  }', $retPos)+3
if($routeEnd -le $routeStart){throw 'Manual sync route end not found; no edit made.'}
$s=$s.Substring(0,$routeStart)+$newRoute+$s.Substring($routeEnd)
$anchor='async function runScheduledPhase2(env) {'
if(-not $s.Contains($anchor)){throw 'Scheduled phase2 insertion point not found; no edit made.'}
$helper=@'
async function runManualCatalogSyncBatch(env, start, batchSize = 50) {
  const settings = await getSettings(env.DB);
  if (!settingBool(settings, "catalog_sync_enabled", true)) {
    return { ok: false, error: "Catalog sync is disabled." };
  }
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
    return { ok: false, error: message, status: "failed" };
  }
  if (!handles.length) return { ok: false, error: "Source catalog is empty.", status: "empty_source" };
  if (start >= handles.length) start = 0;
  const previousCycleFailures = start === 0 ? 0 : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_cycle_failed", 0)));
  const result = await syncSource(env.DB, start, batchSize, handles);
  const cycleFailed = previousCycleFailures + result.failed;
  const nextCursor = result.complete ? 0 : result.next_start;
  const now = new Date().toISOString();
  const status = result.complete ? (cycleFailed === 0 ? "complete" : "partial") : "partial";
  const lastError = result.failed_handles.length ? result.failed_handles.map(x => x.handle + ": " + x.error).join(" | ").slice(0, 1000) : "";
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(nextCursor)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(now),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_saved',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.saved)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.failed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(lastError),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? 0 : cycleFailed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? cycleFailed : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_last_cycle_failed", 0))))),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(status)
  ]);
  return { ...result, ok: result.failed === 0, cursor: start, next_cursor: nextCursor, cycle_failed: cycleFailed, status, ran_at: now };
}

'@
$s=$s.Replace($anchor,$helper+$anchor)
$uiPattern='async function sync\(\)\{[\s\S]*?\r?\n\}'
if(-not [regex]::IsMatch($s,$uiPattern)){throw 'Sync UI function not found; no edit made.'}
$uiReplacement=@'
async function sync(){
 let start=0,done=false,total=0,failed=0,failedHandles=[];
 try{
  while(!done){
   const r=await api('/api/sync/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({start,batch_size:50})});
   if(!r||r.error)throw new Error(r?.error||'No sync response');
   total+=Number(r.saved)||0;
   failed+=Number(r.failed)||0;
   if(Array.isArray(r.failed_handles))failedHandles.push(...r.failed_handles.map(x=>x.handle));
   done=!!r.complete;
   start=Number(r.next_start)||start;
   if(!r.processed)break;
  }
  if(failed){
   alert('Catalog sync finished PARTIAL. Saved/updated '+total+' products; '+failed+' product(s) failed after retries. First failed handles: '+failedHandles.slice(0,5).join(', '));
  }else{
   alert('Catalog sync complete. Saved/updated '+total+' products.');
  }
  refresh();
 }catch(e){
  alert('Catalog sync stopped: '+String(e?.message||e)+'. Check login and sync status before retrying.');
  refresh();
 }
}
'@
$s=[regex]::Replace($s,$uiPattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $uiReplacement},1)
[System.IO.File]::WriteAllText($p,$s,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched manual sync to persist progress/errors and report partial results accurately; backup created.'
Select-String -Path $p -Pattern 'runManualCatalogSyncBatch|Catalog sync finished PARTIAL|batch_size:50' | ForEach-Object { $_.Line.Trim() }
