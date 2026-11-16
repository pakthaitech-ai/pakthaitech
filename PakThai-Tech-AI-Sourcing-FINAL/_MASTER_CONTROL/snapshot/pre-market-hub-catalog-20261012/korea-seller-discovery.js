// Free OpenStreetMap prospect discovery around Pyeongtaek, South Korea.
// City-centre distance is an initial screen only; results are unverified leads.
// This module never sends messages or creates seller accounts/offers/orders.
import { getSession } from "./auth-session.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter"];
const USER_AGENT = "PakThaiTechKoreaDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)";
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function geocodeBase() {
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", "Pyeongtaek-si, Gyeonggi-do, South Korea");
  url.searchParams.set("format", "jsonv2"); url.searchParams.set("limit", "1"); url.searchParams.set("countrycodes", "kr");
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error("South Korea geocoding HTTP " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error("Pyeongtaek city centre not found in OpenStreetMap");
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
}

function queryAround(lat, lon) {
  const around = "around:250000," + lat + "," + lon;
  return '[out:json][timeout:18];(' +
    'node["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'way["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'relation["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'node["office"="company"]["name"](' + around + ');' +
    'way["office"="company"]["name"](' + around + ');' +
    ');out center tags 100;';
}

function osmRows(elements, base) {
  const seen = new Set(), rows = [];
  for (const element of elements || []) {
    const tags = element.tags || {};
    const name = String(tags.name || tags["name:en"] || tags.brand || "").trim();
    const coords = element.type === "node" ? { lat: Number(element.lat), lon: Number(element.lon) } : element.center;
    if (!name || !Number.isFinite(Number(coords?.lat)) || !Number.isFinite(Number(coords?.lon))) continue;
    const km = distanceKm(base.lat, base.lon, Number(coords.lat), Number(coords.lon));
    if (km > 250) continue;
    const id = String(element.type) + ":" + String(element.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const address = [tags["addr:city"], tags["addr:province"], "South Korea"].filter(Boolean).join(", ");
    rows.push({ title: name, url: "https://www.openstreetmap.org/" + encodeURIComponent(String(element.type)) + "/" + encodeURIComponent(String(element.id)), domain: "openstreetmap.org", snippet: [address, tags.shop || tags.office || "Computer/electronics business", "Approx. " + Math.round(km) + " km from Pyeongtaek city centre", tags.phone || tags["contact:phone"] || "", tags.website || tags["contact:website"] || ""].filter(Boolean).join(" | ").slice(0, 1500), search_query: "computer/electronics supplier within 250 km of Pyeongtaek, South Korea", source_engine: "osm-korea" });
  }
  return rows;
}

async function discoverKoreaSuppliers() {
  const base = await geocodeBase();
  const query = queryAround(base.lat, base.lon);
  let overpassData = null, lastOverpassError = "No Overpass endpoint responded";
  for (const endpoint of OVERPASS) {
    try {
      const url = new URL(endpoint); url.searchParams.set("data", query);
      const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error("Overpass HTTP " + response.status);
      overpassData = await response.json();
      break;
    } catch (error) { lastOverpassError = String(error?.message || error).slice(0,150); }
  }
  if (overpassData) {
    const rows = osmRows(overpassData.elements, base);
    if (rows.length) return rows.slice(0, 100);
  }
  const photon = new URL("https://photon.komoot.io/api/");
  photon.searchParams.set("q", "computer electronics hardware supplier South Korea");
  photon.searchParams.set("limit", "100"); photon.searchParams.set("lat", String(base.lat)); photon.searchParams.set("lon", String(base.lon));
  const response = await fetch(photon, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Overpass unavailable (" + lastOverpassError + "); Photon HTTP " + response.status);
  const data = await response.json(), seen = new Set(), rows = [];
  for (const feature of data.features || []) {
    const p = feature.properties || {}, name = String(p.name || "").trim();
    const [lon, lat] = feature.geometry?.coordinates || [];
    if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) continue;
    const km = distanceKm(base.lat, base.lon, Number(lat), Number(lon));
    const type = String(p.osm_type || "feature"), id = type + ":" + String(p.osm_id || name);
    if (km > 250 || seen.has(id)) continue;
    const relevant = (name + " " + String(p.osm_value || "")).toLowerCase();
    if (!/computer|electronic|hardware|technology|laptop|it solution|supplier/.test(relevant)) continue;
    seen.add(id);
    rows.push({ title: name, url: "https://www.openstreetmap.org/" + encodeURIComponent(type) + "/" + encodeURIComponent(String(p.osm_id || id)), domain: "openstreetmap.org", snippet: [p.city, p.state, "South Korea", "Approx. " + Math.round(km) + " km from Pyeongtaek city centre", p.phone || "", p.website || ""].filter(Boolean).join(" | ").slice(0, 1500), search_query: "computer/electronics supplier within 250 km of Pyeongtaek, South Korea", source_engine: "photon-korea" });
  }
  if (!rows.length && !overpassData) throw new Error("OpenStreetMap search failed (" + lastOverpassError + ") and Photon returned no leads");
  return rows.slice(0, 100);
}

async function countryEnabled(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key='country_south_korea_enabled'").first();
  return ["true", "1", "on", "enabled"].includes(String(row?.value || "").toLowerCase());
}

export async function runKoreaSellerDiscovery(db, { scheduled = false } = {}) {
  const started = new Date().toISOString();
  try {
    if (!(await countryEnabled(db))) return { ok: true, skipped: true, reason: "South Korea sourcing control is off", ran_at: started };
    const items = await discoverKoreaSuppliers();
    let saved = 0;
    for (const item of items) {
      const result = await db.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at)
        VALUES('seller',?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,last_seen_at=CURRENT_TIMESTAMP`)
        .bind(item.source_engine,item.title,item.url,item.domain,item.snippet,item.search_query).run();
      if (Number(result.meta?.changes || 0) > 0) saved++;
    }
    const result = { ok: true, ran_at: started, market: "Pyeongtaek, South Korea (250 km screening radius from city centre)", source: "OpenStreetMap/Photon; public listings only", results_seen: items.length, saved_or_refreshed: saved, scheduled, note: "Leads are unverified. City-centre distance is approximate; confirm exact pickup distance, local price and stock with the supplier. No outreach or commitments were made." };
    await db.prepare("INSERT INTO settings(key,value) VALUES('korea_seller_discovery_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();
    return result;
  } catch (error) {
    const result = { ok: false, ran_at: started, market: "Pyeongtaek, South Korea", error: String(error?.message || error).slice(0, 250), scheduled };
    await db.prepare("INSERT INTO settings(key,value) VALUES('korea_seller_discovery_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();
    return result;
  }
}

export async function handleKoreaSellerDiscoveryRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/korea-seller-prospects/discover") return null;
  if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
  const session = await getSession(request, env);
  if (session?.role !== "owner") return json({ ok: false, error: "Owner login required for Korea seller discovery." }, 403);
  const result = await runKoreaSellerDiscovery(env.DB);
  return json(result, result.ok ? 200 : 502);
}
