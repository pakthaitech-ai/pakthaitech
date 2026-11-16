$path = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\buyer-discovery.js'
$s = [System.IO.File]::ReadAllText($path)
$s = $s.Replace("const query = '[out:json][timeout:20];(' +", "const query = '[out:json][timeout:8];(' +")
$old = @'
  let data = null, lastError = "No Overpass endpoint responded";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0" },
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(9000)
      });
      if (!response.ok) { lastError = "Overpass HTTP " + response.status; continue; }
      data = await response.json();
      break;
    } catch (e) { lastError = String(e.message || e).slice(0,160); }
  }
  if (!data) throw new Error("OpenStreetMap business search unavailable: " + lastError);
'@
$new = @'
  let data = null, lastError = "No Overpass endpoint responded";
  // Race public mirrors so one slow server cannot stall discovery.
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
  const good = attempts.find(x => x.status === "fulfilled");
  if (good) data = good.value;
  else {
    const first = attempts.find(x => x.status === "rejected");
    if (first) lastError = String(first.reason?.message || first.reason).slice(0,160);
  }
  if (!data) throw new Error("OpenStreetMap business search unavailable: " + lastError);
'@
if (-not $s.Contains($old)) { throw 'Expected Overpass block not found; no changes made.' }
$s = $s.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $s, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Patched Overpass parallel timeout and lighter query timeout.'
