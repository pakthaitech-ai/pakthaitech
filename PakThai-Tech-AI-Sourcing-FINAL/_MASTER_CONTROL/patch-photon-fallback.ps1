$ErrorActionPreference = 'Stop'
$path = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\buyer-discovery.js'
$s = [System.IO.File]::ReadAllText($path)
$needle = @'
  if (!data) {
    // Fallback to Nominatim's public place search if Overpass mirrors are down.
'@
$insert = @'
  if (!data) {
    // Photon is a free OSM-based geocoder/search service and often works when Overpass is overloaded.
    try {
      const photonUrl = new URL("https://photon.komoot.io/api/");
      photonUrl.searchParams.set("q", phrase + " " + city + " Pakistan");
      photonUrl.searchParams.set("limit", "40");
      photonUrl.searchParams.set("lat", String(point.lat));
      photonUrl.searchParams.set("lon", String(point.lon));
      const photonResponse = await fetch(photonUrl.toString(), {
        headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
        signal: AbortSignal.timeout(8000)
      });
      if (photonResponse.ok) {
        const photon = await photonResponse.json();
        const seen = new Set();
        const places = (photon.features || []).filter(feature => {
          const p = feature.properties || {};
          const name = String(p.name || "").trim();
          const key = String(p.osm_key || "").toLowerCase();
          const value = String(p.osm_value || "").toLowerCase();
          const searchable = (name + " " + value).toLowerCase();
          const relevant = (key === "shop" && /^(computer|electronics|computer_parts|yes)$/.test(value)) || /computer|computing|it solutions|technology|technologies|laptop/.test(searchable);
          const id = String(p.osm_type || "feature") + ":" + String(p.osm_id || name + JSON.stringify(feature.geometry?.coordinates || []));
          if (!name || !relevant || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
        if (places.length) return places.map(feature => {
          const p = feature.properties || {};
          const address = [p.housenumber, p.street, p.district, p.city, p.state, p.postcode, p.country].filter(Boolean).join(", ");
          return {
            place_id: "photon:" + String(p.osm_type || "feature") + ":" + String(p.osm_id || encodeURIComponent(p.name + address)),
            osm_type: String(p.osm_type || "feature"), osm_id: String(p.osm_id || ""),
            business_name: String(p.name || "Unnamed business").trim(), address,
            website: String(p.website || "").slice(0, 500), phone: String(p.phone || "").slice(0, 100),
            discovery_query: phrase, discovery_city: city
          };
        });
      } else { lastError += "; Photon fallback HTTP " + photonResponse.status; }
    } catch (e) { lastError += "; Photon fallback: " + String(e.message || e).slice(0,100); }
    // Last fallback: Nominatim's public place search.
'@
if (-not $s.Contains($needle)) { throw 'Patch target not found; no source change made.' }
[System.IO.File]::Copy($path, "$path.pre-photon-fix-20261010.bak", $true)
$s = $s.Replace($needle, $insert)
[System.IO.File]::WriteAllText($path, $s, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Added Photon OSM fallback before Nominatim.'
