// Free OpenStreetMap prospect discovery around Pyeongtaek, South Korea.
// City-centre distance is an initial screen only; results are unverified leads.
// This module never sends messages or creates seller accounts/offers/orders.
import { getSession } from "./auth-session.js";

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter"];
const USER_AGENT = "PakThaiTechKoreaDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)";
const SEARCH_RADIUS_KM = 30;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function ensureProspectCountry(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS external_prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, prospect_type TEXT NOT NULL DEFAULT 'seller',
    source_engine TEXT NOT NULL DEFAULT 'openserp', title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
    domain TEXT, snippet TEXT, search_query TEXT, review_status TEXT NOT NULL DEFAULT 'unreviewed',
    owner_notes TEXT, first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, country TEXT
  )`).run();
  try { await db.prepare("ALTER TABLE external_prospects ADD COLUMN country TEXT").run(); } catch (_) {}
  await db.prepare("UPDATE external_prospects SET country='South Korea' WHERE (country IS NULL OR country='') AND search_query LIKE '%South Korea%'").run();
}

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
  const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(4500) });
  if (!response.ok) throw new Error("South Korea geocoding HTTP " + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) throw new Error("Pyeongtaek city centre not found in OpenStreetMap");
  return { lat: Number(rows[0].lat), lon: Number(rows[0].lon) };
}

function isRelevantKoreaItSupplier(name, category = "", office = "") {
  const text = (String(name || "") + " " + String(office || "")).toLowerCase();
  const mapped = /^(computer|electronics|computer_parts)$/.test(String(category || "").toLowerCase());
  const intent = /computer|computing|pc parts|it solutions?|information technology|electronics?|laptop|server|network|printer|component|semiconductor|technology|technologies|distributor|wholesale/.test(text);
  const unrelated = /steel|metal works|bus company|transport|taxi|restaurant|food company|laundry|locksmith|hardware store|construction tools/.test(text);
  return !unrelated && (mapped || intent);
}

function queryAround(lat, lon) {
  const around = "around:" + (SEARCH_RADIUS_KM * 1000) + "," + lat + "," + lon;
  return '[out:json][timeout:8];(' +
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
    if (!name || !Number.isFinite(Number(coords?.lat)) || !Number.isFinite(Number(coords?.lon)) || !isRelevantKoreaItSupplier(name, tags.shop, tags.office)) continue;
    const km = distanceKm(base.lat, base.lon, Number(coords.lat), Number(coords.lon));
    if (km > SEARCH_RADIUS_KM) continue;
    const id = String(element.type) + ":" + String(element.id);
    if (seen.has(id)) continue;
    seen.add(id);
    const address = [tags["addr:city"], tags["addr:province"], "South Korea"].filter(Boolean).join(", ");
    rows.push({ title: name, url: "https://www.openstreetmap.org/" + encodeURIComponent(String(element.type)) + "/" + encodeURIComponent(String(element.id)), domain: "openstreetmap.org", snippet: [address, tags.shop || tags.office || "Computer/electronics business", "Approx. " + Math.round(km) + " km from Pyeongtaek city centre", tags.phone || tags["contact:phone"] || "", tags.website || tags["contact:website"] || ""].filter(Boolean).join(" | ").slice(0, 1500), search_query: "computer/electronics supplier within 30 km of Pyeongtaek, South Korea", source_engine: "osm-korea" });
  }
  return rows;
}

async function discoverKoreaSuppliers() {
  const base = await geocodeBase();
  const query = queryAround(base.lat, base.lon);
  // Try public Overpass mirrors concurrently so one stalled mirror does not consume
  // the full timeout budget. Prefer the first successful response with usable leads.
  const attempts = await Promise.allSettled(OVERPASS.map(async endpoint => {
    const url = new URL(endpoint); url.searchParams.set("data", query);
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(4500) });
    if (!response.ok) throw new Error("Overpass HTTP " + response.status);
    return response.json();
  }));
  let lastOverpassError = "No Overpass endpoint responded";
  const combined = new Map();
  for (const attempt of attempts) {
    if (attempt.status === "fulfilled") {
      // Merge usable results from every successful mirror. Returning after the
      // first non-empty mirror silently discarded additional public listings.
      for (const row of osmRows(attempt.value.elements, base)) combined.set(row.url, row);
    } else lastOverpassError = String(attempt.reason?.message || attempt.reason).slice(0,150);
  }
  if (combined.size) return Array.from(combined.values()).slice(0, 100);
  // Photon is a geocoder, not a business directory. Try several local search
  // terms, deduplicate OSM IDs, and retain only named, in-radius relevant listings.
  const seen = new Set(), rows = [];
  for (const term of ["computer", "electronics"]) {
    try {
      const photon = new URL("https://photon.komoot.io/api/");
      photon.searchParams.set("q", term);
      photon.searchParams.set("limit", "100"); photon.searchParams.set("lat", String(base.lat)); photon.searchParams.set("lon", String(base.lon));
      const response = await fetch(photon, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(4500) });
      if (!response.ok) { lastOverpassError = "Photon HTTP " + response.status; continue; }
      const data = await response.json();
      for (const feature of data.features || []) {
        const p = feature.properties || {}, name = String(p.name || "").trim();
        const [lon, lat] = feature.geometry?.coordinates || [];
        if (!name || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) continue;
        const km = distanceKm(base.lat, base.lon, Number(lat), Number(lon));
        const type = String(p.osm_type || "feature"), id = type + ":" + String(p.osm_id || name);
        if (km > SEARCH_RADIUS_KM || seen.has(id)) continue;
        const relevant = (name + " " + String(p.osm_value || "") + " " + term).toLowerCase();
        if (!isRelevantKoreaItSupplier(name, p.osm_value, relevant)) continue;
        seen.add(id);
        rows.push({ title: name, url: "https://www.openstreetmap.org/" + encodeURIComponent(type) + "/" + encodeURIComponent(String(p.osm_id || id)), domain: "openstreetmap.org", snippet: [p.city, p.state, "South Korea", "Approx. " + Math.round(km) + " km from Pyeongtaek city centre", p.phone || "", p.website || ""].filter(Boolean).join(" | ").slice(0, 1500), search_query: "computer/electronics supplier within 30 km of Pyeongtaek, South Korea", source_engine: "photon-korea" });
      }
      if (rows.length >= 30) break;
    } catch (error) { lastOverpassError = String(error?.message || error).slice(0,150); }
  }
  if (rows.length) return rows.slice(0, 100);
  throw new Error("OpenStreetMap discovery returned no relevant named leads within 30 km of Pyeongtaek (" + lastOverpassError + "). Retry later or expand the search area.");
}

async function countryEnabled(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key='country_south_korea_enabled'").first();
  return ["true", "1", "on", "enabled"].includes(String(row?.value || "").toLowerCase());
}

export async function runKoreaSellerDiscovery(db, { scheduled = false } = {}) {
  const started = new Date().toISOString();
  try {
    await ensureProspectCountry(db);
    if (!(await countryEnabled(db))) return { ok: true, skipped: true, reason: "South Korea sourcing control is off", ran_at: started };
    const items = await discoverKoreaSuppliers();
    const statements = items.map(item => db.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at,country)
        VALUES('seller',?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'South Korea')
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,country='South Korea',last_seen_at=CURRENT_TIMESTAMP`)
        .bind(item.source_engine,item.title,item.url,item.domain,item.snippet,item.search_query));
    let saved = 0;
    // Batch database writes; never spend one Worker subrequest per prospect.
    for (let i = 0; i < statements.length; i += 80) {
      const results = await db.batch(statements.slice(i, i + 80));
      saved += results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
    }
  const result = { ok: true, ran_at: started, market: "Pyeongtaek, South Korea (30 km initial search radius from city centre)", source: "OpenStreetMap/Photon; public listings only", results_seen: items.length, saved_or_refreshed: saved, scheduled, note: "Leads are unverified. City-centre distance is approximate; confirm exact pickup distance, local price and stock with the supplier. No outreach or commitments were made." };
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

