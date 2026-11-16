const fs=require('fs');const p='src/buyer-discovery.js';let s=fs.readFileSync(p,'utf8');
s=s.replace('const OVERPASS = "https://overpass-api.de/api/interpreter";','const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];');
const old = `  const response = await fetch(OVERPASS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0" },
    body: "data=" + encodeURIComponent(query)
  });
  if (!response.ok) throw new Error("OpenStreetMap business search unavailable (HTTP " + response.status + ")");
  const data = await response.json();
  return (data.elements || []).map(el => {`;
const replacement = `  let data = null, lastError = "No Overpass endpoint responded";
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0" },
        body: "data=" + encodeURIComponent(query)
      });
      if (!response.ok) { lastError = "Overpass HTTP " + response.status; continue; }
      data = await response.json();
      break;
    } catch (e) { lastError = String(e.message || e).slice(0,160); }
  }
  if (!data) throw new Error("OpenStreetMap business search unavailable: " + lastError);
  return (data.elements || []).map(el => {`;
if(!s.includes(old)) throw new Error('Overpass block not found; no file changed');
s=s.replace(old,replacement);fs.writeFileSync(p,s);
