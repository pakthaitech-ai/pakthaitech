const fs = require('fs');
const path = 'D:\\Horse 2\\PakThai-Tech-AI-Sourcing-FINAL\\src\\worker.js';
let s = fs.readFileSync(path, 'utf8');
function replaceOnce(oldText, newText, label) {
  const i = s.indexOf(oldText);
  if (i < 0) throw new Error('Could not find patch target: ' + label);
  s = s.slice(0, i) + newText + s.slice(i + oldText.length);
}
replaceOnce(
'async function discoverSourceHandles() {\n  const pageSize = 250;\n  const headers = { "user-agent": "PakThai-Tech-Sourcing/1.0" };\n  const handles = [];\n  // Shopify products.json is paginated; include every page in the source cursor.\n  for (let page = 1; page <= 100; page++) {\n    const url = "https://sakoonsay.com/products.json?limit=" + pageSize + "&page=" + page;\n    const r = await fetch(url, { headers });\n    if (!r.ok) throw new Error("Source catalog page " + page + " returned " + r.status);\n    const data = await r.json();\n    const products = Array.isArray(data.products) ? data.products : [];\n    handles.push(...products.map(p => String(p.handle || \'\').trim()).filter(Boolean));\n    if (products.length < pageSize) return [...new Set(handles)];\n  }\n  throw new Error("Source catalog pagination exceeded 100 pages; sync stopped to avoid an incomplete catalog.");\n}',
'async function discoverSourceHandles() {\n  const pageSize = 250;\n  const headers = { "user-agent": "PakThai-Tech-Sourcing/1.0" };\n  const handles = [];\n  // Shopify products.json is paginated; retry transient rate limits and server errors.\n  for (let page = 1; page <= 100; page++) {\n    const url = "https://sakoonsay.com/products.json?limit=" + pageSize + "&page=" + page;\n    let r = null;\n    let lastStatus = 0;\n    for (let attempt = 0; attempt < 5; attempt++) {\n      try {\n        r = await fetch(url, { headers });\n        lastStatus = r.status;\n        if (r.ok) break;\n        if (![408, 425, 429, 500, 502, 503, 504].includes(r.status)) throw new Error("Source catalog page " + page + " returned " + r.status);\n      } catch (e) {\n        if (attempt === 4) throw e;\n      }\n      if (attempt < 4) {\n        const retryAfter = Number(r?.headers?.get("retry-after") || 0);\n        const waitMs = Math.min(10000, retryAfter > 0 ? retryAfter * 1000 : 500 * (2 ** attempt));\n        await new Promise(resolve => setTimeout(resolve, waitMs));\n      }\n    }\n    if (!r?.ok) throw new Error("Source catalog page " + page + " returned " + lastStatus + " after retries");\n    const data = await r.json();\n    const products = Array.isArray(data.products) ? data.products : [];\n    handles.push(...products.map(p => String(p.handle || \'\').trim()).filter(Boolean));\n    if (products.length < pageSize) return [...new Set(handles)];\n  }\n  throw new Error("Source catalog pagination exceeded 100 pages; sync stopped to avoid an incomplete catalog.");\n}',
'discoverSourceHandles');

replaceOnce(
'async function runManualCatalogSyncBatch(env, start, batchSize = 50) {\n  const settings = await getSettings(env.DB);\n  if (!settingBool(settings, "catalog_sync_enabled", true)) {\n    return { ok: false, error: "Catalog sync is disabled." };\n  }\n  let handles;\n  try {\n    handles = await discoverSourceHandles();',
'async function runManualCatalogSyncBatch(env, start, batchSize = 10) {\n  const settings = await getSettings(env.DB);\n  if (!settingBool(settings, "catalog_sync_enabled", true)) {\n    return { ok: false, error: "Catalog sync is disabled." };\n  }\n  let handles = null;\n  // Reuse the handle snapshot across batches in one manual cycle; avoid repeated upstream listing calls.\n  if (start > 0 && settings.catalog_sync_handles_cache) {\n    try {\n      const cached = JSON.parse(settings.catalog_sync_handles_cache);\n      if (Array.isArray(cached) && cached.length > 0 && cached.every(x => typeof x === "string")) handles = cached;\n    } catch (_) {}\n  }\n  try {\n    if (!handles) {\n      handles = await discoverSourceHandles();\n      await env.DB.prepare("INSERT INTO settings(key,value) VALUES(\'catalog_sync_handles_cache\',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")\n        .bind(JSON.stringify(handles)).run();\n    }',
'manual catalog handle cache');

replaceOnce(
'const result = await syncSource(env.DB, start, batchSize, handles);',
'const safeBatchSize = Math.max(1, Math.min(10, Math.floor(Number(batchSize) || 10)));\n  const result = await syncSource(env.DB, start, safeBatchSize, handles);',
'manual batch size cap');

replaceOnce('body:JSON.stringify({start,batch_size:50})','body:JSON.stringify({start,batch_size:10})','store sync batch size');
fs.writeFileSync(path, s, 'utf8');
console.log('PATCH_OK: upstream listing retries, manual-cycle handle cache, batch cap 10.');
