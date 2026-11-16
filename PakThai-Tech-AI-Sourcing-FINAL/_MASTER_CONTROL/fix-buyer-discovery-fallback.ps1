$path = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\buyer-discovery.js'
$s = [System.IO.File]::ReadAllText($path)
$old = @'
  if (!data) throw new Error("OpenStreetMap business search unavailable: " + lastError);
  return (data.elements || []).map(el => {
'@
$new = @'
  if (!data) {
    // Fallback to Nominatim's public place search if Overpass mirrors are down.
    const fallbackUrl = new URL(NOMINATIM);
    fallbackUrl.searchParams.set("q", phrase + ", " + city + ", Pakistan");
    fallbackUrl.searchParams.set("format", "jsonv2");
    fallbackUrl.searchParams.set("limit", "20");
    fallbackUrl.searchParams.set("countrycodes", "pk");
    try {
      const fallbackResponse = await fetch(fallbackUrl.toString(), {
        headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (business prospect research)" },
        signal: AbortSignal.timeout(6500)
      });
      if (fallbackResponse.ok) {
        const places = await fallbackResponse.json();
        if (Array.isArray(places) && places.length) {
          return places.map(place => ({
            place_id: "nominatim:" + String(place.osm_type || "place") + ":" + String(place.osm_id || place.place_id),
            osm_type: String(place.osm_type || "place"),
            osm_id: String(place.osm_id || place.place_id || ""),
            business_name: String(place.name || (place.display_name || "").split(",")[0] || "Unnamed business").trim(),
            address: String(place.display_name || "").slice(0, 500),
            website: "", phone: "", discovery_query: phrase, discovery_city: city
          }));
        }
      } else { lastError += "; Nominatim fallback HTTP " + fallbackResponse.status; }
    } catch (e) { lastError += "; Nominatim fallback: " + String(e.message || e).slice(0,100); }
    throw new Error("OpenStreetMap business search unavailable: " + lastError);
  }
  return (data.elements || []).map(el => {
'@
if (-not $s.Contains($old)) { throw 'Expected fallback insertion point not found; no changes made.' }
$s = $s.Replace($old, $new)
[System.IO.File]::WriteAllText($path, $s, [System.Text.UTF8Encoding]::new($false))

$worker = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$w = [System.IO.File]::ReadAllText($worker)
$oldUi = "if(!r.ok) throw new Error(r.error||'Discovery request failed');"
$newUi = "if(!r.ok) throw new Error(r.error||(Array.isArray(r.errors)&&r.errors.length?r.errors.map(function(x){return x.city+': '+x.error;}).join(' | '):'Discovery request failed'));"
if (-not $w.Contains($oldUi)) { throw 'Expected UI error line not found; backend fallback was written, UI not changed.' }
$w = $w.Replace($oldUi, $newUi)
[System.IO.File]::WriteAllText($worker, $w, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Added Nominatim fallback and visible detailed discovery errors.'
