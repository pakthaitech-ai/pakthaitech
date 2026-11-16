$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s = [System.IO.File]::ReadAllText($p)
$syncPattern = 'async function syncSource\(db, start = 0, batchSize = 25\) \{[\s\S]*?\r?\n\}\r?\n\r?\nasync function handleApi'
$syncReplacement = @'
async function syncSource(db, start = 0, batchSize = 25, discoveredHandles = null) {
  const handles = discoveredHandles || await discoverSourceHandles();
  const slice = handles.slice(start, start + batchSize);
  const results = await Promise.all(slice.map(async (handle) => {
    let lastError = "Unknown source error";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const product = await fetchProduct(handle);
        if (!product) throw new Error("Source returned no product record");
        return { handle, product, error: null };
      } catch (e) {
        lastError = String(e?.message || e).slice(0, 240);
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 200 * attempt));
      }
    }
    return { handle, product: null, error: lastError };
  }));

  const products = results.filter(x => x.product).map(x => x.product);
  const failures = results.filter(x => x.error).map(x => ({ handle: x.handle, error: x.error }));

  for (const p of products) {
    await db.prepare("INSERT INTO products (source_id,handle,title,description,price_pkr,compare_at_pkr,available,image_url,source_url,category,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source_id) DO UPDATE SET handle=excluded.handle,title=excluded.title,description=excluded.description,price_pkr=excluded.price_pkr,compare_at_pkr=excluded.compare_at_pkr,available=excluded.available,image_url=excluded.image_url,source_url=excluded.source_url,category=excluded.category,updated_at=CURRENT_TIMESTAMP").bind(
      p.source_id, p.handle, p.title, p.description, p.price_pkr,
      p.compare_at_pkr, p.available, p.image_url, p.source_url, p.category
    ).run();
  }

  return {
    discovered: handles.length,
    processed: slice.length,
    saved: products.length,
    failed: failures.length,
    failed_handles: failures.slice(0, 20),
    next_start: start + slice.length,
    complete: start + slice.length >= handles.length
  };
}

async function handleApi
'@
if (-not [regex]::IsMatch($s,$syncPattern)) { throw 'syncSource block not found; no edit made.' }
$syncNew = [regex]::Replace($s,$syncPattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $syncReplacement},1)
$runPattern = 'async function runScheduledCatalogSync\(env\) \{[\s\S]*?\r?\n\}\r?\n\r?\nasync function runScheduledPhase2'
$runReplacement = @'
async function runScheduledCatalogSync(env) {
  const settings = await getSettings(env.DB);
  if (!settingBool(settings, "catalog_sync_enabled", true)) {
    return { ok: true, skipped: true, reason: "catalog_sync_disabled" };
  }

  const batchSize = Math.max(1, Math.min(50, Math.floor(settingNum(settings, "catalog_sync_batch_size", 25))));
  let cursor = Math.max(0, Math.floor(settingNum(settings, "catalog_sync_cursor", 0)));
  const handles = await discoverSourceHandles();

  if (!handles.length) {
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','empty_source') ON CONFLICT(key) DO UPDATE SET value='empty_source'").run();
    return { ok: true, skipped: true, reason: "empty_source" };
  }

  if (cursor >= handles.length) cursor = 0;
  const previousCycleFailures = cursor === 0 ? 0 : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_cycle_failed", 0)));
  const result = await syncSource(env.DB, cursor, batchSize, handles);
  const cycleFailed = previousCycleFailures + result.failed;
  const nextCursor = result.complete ? 0 : result.next_start;
  const now = new Date().toISOString();
  const cycleStatus = result.complete ? (cycleFailed === 0 ? "complete" : "partial") : "partial";
  const lastError = result.failed_handles.length ? result.failed_handles.map(x => x.handle + ": " + x.error).join(" | ").slice(0, 1000) : "";

  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(nextCursor)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(now),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_saved',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.saved)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.failed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(lastError),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? 0 : cycleFailed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? cycleFailed : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_last_cycle_failed", 0))))),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(cycleStatus)
  ]);

  return { ok: result.failed === 0, cursor, next_cursor: nextCursor, ...result, cycle_failed: cycleFailed, status: cycleStatus, ran_at: now };
}

async function runScheduledPhase2
'@
if (-not [regex]::IsMatch($syncNew,$runPattern)) { throw 'runScheduledCatalogSync block not found; no edit made.' }
$s2 = [regex]::Replace($syncNew,$runPattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $runReplacement},1)
Copy-Item $p ($p + '.pre-sync-reliability-20261010.bak') -Force
[System.IO.File]::WriteAllText($p,$s2,[System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched sync retries, failure counts, and cycle-level status. Backup created.'
Select-String -Path $p -Pattern 'async function syncSource|failed_handles|catalog_sync_cycle_failed|async function runScheduledCatalogSync' | ForEach-Object { $_.Line }
