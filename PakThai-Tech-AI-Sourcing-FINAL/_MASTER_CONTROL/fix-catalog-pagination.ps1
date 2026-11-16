$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s = [System.IO.File]::ReadAllText($p)
$pattern = 'async function discoverSourceHandles\(\) \{[\s\S]*?\r?\n\}'
$replacement = @'
async function discoverSourceHandles() {
  const pageSize = 250;
  const headers = { "user-agent": "PakThai-Tech-Sourcing/1.0" };
  const handles = [];
  // Shopify products.json is paginated; include every page in the source cursor.
  for (let page = 1; page <= 100; page++) {
    const url = "https://sakoonsay.com/products.json?limit=" + pageSize + "&page=" + page;
    const r = await fetch(url, { headers });
    if (!r.ok) throw new Error("Source catalog page " + page + " returned " + r.status);
    const data = await r.json();
    const products = Array.isArray(data.products) ? data.products : [];
    handles.push(...products.map(p => String(p.handle || '').trim()).filter(Boolean));
    if (products.length < pageSize) return [...new Set(handles)];
  }
  throw new Error("Source catalog pagination exceeded 100 pages; sync stopped to avoid an incomplete catalog.");
}
'@
if (-not [regex]::IsMatch($s, $pattern)) { throw 'Could not locate discoverSourceHandles; no edit made.' }
Copy-Item $p ($p + '.pre-pagination-fix-20261010.bak') -Force
$s2 = [regex]::Replace($s, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $replacement }, 1)
[System.IO.File]::WriteAllText($p, $s2, [System.Text.UTF8Encoding]::new($false))
Write-Output 'PATCHED discoverSourceHandles with pagination; backup created.'
Select-String -Path $p -Pattern 'async function discoverSourceHandles|products.json\?limit=|pagination exceeded' | ForEach-Object { $_.Line }
