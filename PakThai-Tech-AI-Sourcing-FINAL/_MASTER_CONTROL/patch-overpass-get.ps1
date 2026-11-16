$ErrorActionPreference = 'Stop'
$path = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\buyer-discovery.js'
$s = [System.IO.File]::ReadAllText($path)
$old = @'
  const attempts = await Promise.allSettled(OVERPASS_ENDPOINTS.map(async endpoint => {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0" },
      body: "data=" + encodeURIComponent(query),
      signal: AbortSignal.timeout(6500)
    });
    if (!response.ok) throw new Error("Overpass HTTP " + response.status);
    return await response.json();
  }));
'@
$new = @'
  const attempts = await Promise.allSettled(OVERPASS_ENDPOINTS.map(async endpoint => {
    // GET is more consistently accepted by public Overpass mirrors from edge runtimes.
    const requestUrl = new URL(endpoint);
    requestUrl.searchParams.set("data", query);
    const response = await fetch(requestUrl.toString(), {
      method: "GET",
      headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
      signal: AbortSignal.timeout(9000)
    });
    if (!response.ok) throw new Error("Overpass HTTP " + response.status);
    return await response.json();
  }));
'@
if (-not $s.Contains($old)) { throw 'Patch target not found; no source change made.' }
[System.IO.File]::Copy($path, "$path.pre-get-fix-20261010.bak", $true)
$s = $s.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $s, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched Overpass POST to GET; backup created.'
