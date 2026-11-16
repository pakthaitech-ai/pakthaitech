// PAKTHAI TECH Ã¢â‚¬â€ free OpenStreetMap buyer-prospect discovery.
// Uses public Nominatim + Overpass endpoints; no Google API key or billing.
// OSM-listed computer/electronics businesses are leads only, not confirmed buyers.
// No messages are sent and no buyer/seller records are created automatically.
import { getSession } from "./auth-session.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.osm.jp/api/interpreter"];

async function ensureProspectSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS buyer_prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    place_id TEXT NOT NULL UNIQUE,
    discovery_query TEXT NOT NULL,
    discovery_city TEXT NOT NULL,
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    owner_notes TEXT,
    business_name TEXT,
    address TEXT,
    website TEXT,
    phone TEXT,
    osm_type TEXT,
    osm_id TEXT
  )`).run();
  for (const sql of [
    "ALTER TABLE buyer_prospects ADD COLUMN business_name TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN address TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN website TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN phone TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN osm_type TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN osm_id TEXT"
  ]) { try { await db.prepare(sql).run(); } catch {} }
}

async function geocodeCity(city) {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", city + ", Pakistan");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "pk");
  const response = await fetch(url.toString(), {
    headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (business prospect research)" }
  });
  if (!response.ok) throw new Error("OpenStreetMap geocoding unavailable (HTTP " + response.status + ")");
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error("City not found in OpenStreetMap: " + city);
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
}

export async function searchOsmBusinesses(city, phrase) {
  const point = await geocodeCity(city);
  const around = "around:8000," + point.lat + "," + point.lon;
  const query = '[out:json][timeout:8];(' +
    'node["shop"~"^(computer|electronics|computer_parts)$"](' + around + ');' +
    'way["shop"~"^(computer|electronics|computer_parts)$"](' + around + ');' +
    'relation["shop"~"^(computer|electronics|computer_parts)$"](' + around + ');' +
    'node["office"="company"]["name"](' + around + ');' +
    'way["office"="company"]["name"](' + around + ');' +
    ');out center tags 60;';
  let data = null, lastError = "No Overpass endpoint responded";
  // Use one public endpoint at a time; parallel mirror races caused avoidable 429s.
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const requestUrl = new URL(endpoint);
      requestUrl.searchParams.set("data", query);
      const response = await fetch(requestUrl.toString(), {
        method: "GET",
        headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
        signal: AbortSignal.timeout(9000)
      });
      if (!response.ok) throw new Error("Overpass HTTP " + response.status);
      data = await response.json();
      break;
    } catch (error) { lastError = String(error?.message || error).slice(0,160); }
  }
  if (!data || !(data.elements || []).some(el => { const tags = el.tags || {}; return String(tags.name || tags["name:en"] || tags.brand || "").trim(); })) {
    // Photon is a free OSM-based geocoder/search service and often works when Overpass is overloaded or returns no named businesses.
    try {
      const photonUrl = new URL("https://photon.komoot.io/api/");
      photonUrl.searchParams.set("q", phrase + " " + city);
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
          const relevant = (key === "shop" && /^(computer|electronics|computer_parts|yes|hardware)$/.test(value)) || /computer|computing|it solutions|technology|technologies|laptop|electronic|hardware/.test(searchable);
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
    const t = el.tags || {};
    const id = String(el.type) + ":" + String(el.id);
    const name = String(t.name || t["name:en"] || t.brand || "").trim();
    const address = [t["addr:street"], t["addr:suburb"], t["addr:city"] || city, t["addr:postcode"]].filter(Boolean).join(", ");
    return {
      place_id: "osm:" + id, osm_type: String(el.type), osm_id: String(el.id),
      business_name: name || ("Unnamed " + String(t.shop || t.office || "business")),
      address, website: String(t.website || t["contact:website"] || "").slice(0, 500),
      phone: String(t.phone || t["contact:phone"] || "").slice(0, 100),
      discovery_query: phrase, discovery_city: city
    };
  });
}

// Daily scheduled discovery: collect public business leads only. Never creates confirmed buyers or sends outreach.
export async function runScheduledBuyerDiscovery(db) {
  await ensureProspectSchema(db);
  const cities = ["Faisalabad", "Lahore", "Karachi"];
  const phrases = ["computer hardware retailer", "computer parts wholesaler"];
  const day = Math.floor(Date.now() / 86400000);
  const city = cities[day % cities.length];
  const phrase = phrases[Math.floor(day / cities.length) % phrases.length];
  try {
    const items = await searchOsmBusinesses(city, phrase);
    let saved = 0;
    for (const item of items) {
      const result = await db.prepare(`INSERT INTO buyer_prospects
        (place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,business_name,address,website,phone,osm_type,osm_id)
        VALUES(?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?)
        ON CONFLICT(place_id) DO UPDATE SET discovery_query=excluded.discovery_query,discovery_city=excluded.discovery_city,last_seen_at=CURRENT_TIMESTAMP,business_name=excluded.business_name,address=excluded.address,website=excluded.website,phone=excluded.phone`)
        .bind(item.place_id,item.discovery_query,item.discovery_city,item.business_name,item.address,item.website,item.phone,item.osm_type,item.osm_id).run();
      if (Number(result.meta?.changes || 0) > 0) saved++;
    }
    const result = {ok:true,city,phrase,source:"OpenStreetMap/Overpass with Photon/Nominatim fallback",results_seen:items.length,saved_or_refreshed:saved,ran_at:new Date().toISOString()};
    await db.prepare("INSERT INTO settings(key,value) VALUES('buyer_discovery_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(result.ran_at).run();
    await db.prepare("INSERT INTO settings(key,value) VALUES('buyer_discovery_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();
    return result;
  } catch (e) {
    const result = {ok:false,city,phrase,source:"OpenStreetMap/Overpass with Photon/Nominatim fallback",error:String(e?.message || e).slice(0,250),ran_at:new Date().toISOString()};
    await db.prepare("INSERT INTO settings(key,value) VALUES('buyer_discovery_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(result.ran_at).run();
    await db.prepare("INSERT INTO settings(key,value) VALUES('buyer_discovery_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();
    return result;
  }
}

export async function handleBuyerDiscoveryRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/buyer-prospects")) return null;
  if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Cache-Control": "no-store" } });
  const session = await getSession(request, env);
  if (session?.role !== "owner") return json({ ok:false, error:"Owner login required for buyer discovery." }, 403);

  await ensureProspectSchema(env.DB);
  if (url.pathname === "/api/buyer-prospects/status" && request.method === "GET") {
    return json({ ok:true, source:"OpenStreetMap + Overpass", api_key_configured:true, search_enabled:true, billing_required:false, outreach_enabled:false, owner_approval_required:true, note:"Free public map data; coverage depends on local OpenStreetMap contributions. Leads are not confirmed buyers." });
  }
  if (url.pathname === "/api/buyer-prospects" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id,place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,owner_notes,business_name,address,website,phone,osm_type,osm_id FROM buyer_prospects ORDER BY last_seen_at DESC LIMIT 300").all();
    return json({ ok:true, prospects:rows.results || [], source:"OpenStreetMap" });
  }
  if (url.pathname === "/api/buyer-prospects/discover" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const cities = Array.isArray(body.cities) ? body.cities : ["Faisalabad", "Lahore", "Karachi"];
    const searches = Array.isArray(body.searches) ? body.searches : ["computer hardware retailer"];
    const safeCities = [...new Set(cities.map(x => String(x).trim()).filter(Boolean))].slice(0, 3);
    const safeSearches = [...new Set(searches.map(x => String(x).trim()).filter(Boolean))].slice(0, 2);
    if (!safeCities.length || !safeSearches.length) return json({ ok:false, error:"Provide at least one city and search phrase." }, 400);
    let queriesRun = 0, resultsSeen = 0, saved = 0;
    const errors = [];
    for (const city of safeCities) {
      for (const phrase of safeSearches) {
        try {
          const items = await searchOsmBusinesses(city, phrase);
          queriesRun++;
          for (const item of items) {
            resultsSeen++;
            const result = await env.DB.prepare(`INSERT INTO buyer_prospects
              (place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,business_name,address,website,phone,osm_type,osm_id)
              VALUES(?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?)
              ON CONFLICT(place_id) DO UPDATE SET discovery_query=excluded.discovery_query,discovery_city=excluded.discovery_city,last_seen_at=CURRENT_TIMESTAMP,business_name=excluded.business_name,address=excluded.address,website=excluded.website,phone=excluded.phone`)
              .bind(item.place_id,item.discovery_query,item.discovery_city,item.business_name,item.address,item.website,item.phone,item.osm_type,item.osm_id).run();
            if (Number(result.meta?.changes || 0) > 0) saved++;
          }
        } catch (e) { errors.push({ city, phrase, error:String(e.message || e).slice(0,250) }); }
      }
    }
    return json({ ok:errors.length===0, source:"OpenStreetMap", billing_required:false, queries_run:queriesRun, results_seen:resultsSeen, saved_or_refreshed:saved, errors, next_step:"Review each lead and verify buying interest. No outreach or orders were created." }, errors.length && !queriesRun ? 502 : 200);
  }
  if (url.pathname === "/api/buyer-prospects/review" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const id = Number(body.id) || 0;
    const status = String(body.review_status || "");
    if (!id || !["unreviewed","contact_to_verify","qualified","not_a_fit"].includes(status)) return json({ ok:false, error:"Valid id and review_status required." },400);
    await env.DB.prepare("UPDATE buyer_prospects SET review_status=?,owner_notes=? WHERE id=?").bind(status,String(body.owner_notes||"").slice(0,1000),id).run();
    return json({ ok:true, id, review_status:status });
  }
  return json({ ok:false, error:"Route or method not found." },404);
}



