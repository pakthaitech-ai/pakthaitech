// Free, owner-triggered prospect discovery for Thailand and South Korea buyer markets.
// Public map entries are unverified leads only; this module never contacts businesses.
import { getSession } from "./auth-session.js";

const MARKETS = {
  Thailand: { key: "country_thailand_enabled", city: "Bangkok", countryCode: "th", radius: 15000, sourceKey: "thailand" },
  "South Korea": { key: "country_south_korea_enabled", city: "Pyeongtaek-si, Gyeonggi-do", countryCode: "kr", radius: 250000, sourceKey: "south_korea" }
};
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter"];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS external_prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT, prospect_type TEXT NOT NULL DEFAULT 'seller',
    source_engine TEXT NOT NULL DEFAULT 'openserp', title TEXT NOT NULL, url TEXT NOT NULL UNIQUE,
    domain TEXT, snippet TEXT, search_query TEXT, review_status TEXT NOT NULL DEFAULT 'unreviewed',
    owner_notes TEXT, first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, country TEXT
  )`).run();
  try { await db.prepare("ALTER TABLE external_prospects ADD COLUMN country TEXT").run(); } catch (_) {}
  await db.prepare("UPDATE external_prospects SET country='Thailand' WHERE (country IS NULL OR country='') AND search_query LIKE '%Thailand%'").run();
  await db.prepare("UPDATE external_prospects SET country='South Korea' WHERE (country IS NULL OR country='') AND search_query LIKE '%South Korea%'").run();
}

async function discoverBuyers(country, market) {
  const geoUrl = new URL("https://nominatim.openstreetmap.org/search");
  geoUrl.searchParams.set("q", market.city + ", " + country);
  geoUrl.searchParams.set("format", "jsonv2"); geoUrl.searchParams.set("limit", "1"); geoUrl.searchParams.set("countrycodes", market.countryCode);
  const geoResponse = await fetch(geoUrl, { headers: { Accept: "application/json", "User-Agent": "PakThaiTechMarketDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" }, signal: AbortSignal.timeout(9000) });
  if (!geoResponse.ok) throw new Error("Free geocoding HTTP " + geoResponse.status);
  const geo = await geoResponse.json();
  if (!Array.isArray(geo) || !geo.length) throw new Error("Could not locate " + market.city + ", " + country);
  const lat = Number(geo[0].lat), lon = Number(geo[0].lon);
  const around = "around:" + market.radius + "," + lat + "," + lon;
  const query = '[out:json][timeout:18];(nwr["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');nwr["office"~"^(company|wholesale)$"]["name"](' + around + '););out center tags 80;';
  let elements = null, lastError = "No public Overpass endpoint responded";
  // Public Overpass servers are queried one at a time to avoid parallel load and rate limiting.
  for (const endpoint of OVERPASS) {
    try {
      const u = new URL(endpoint); u.searchParams.set("data", query);
      const response = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "PakThaiTechMarketDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" }, signal: AbortSignal.timeout(22000) });
      if (!response.ok) throw new Error("Overpass HTTP " + response.status);
      const data = await response.json(); elements = data.elements || []; break;
    } catch (error) { lastError = String(error?.message || error).slice(0, 160); }
  }
  if (elements === null) {
    const photon = new URL("https://photon.komoot.io/api/");
    photon.searchParams.set("q", "computer electronics hardware retailer " + market.city + " " + country);
    photon.searchParams.set("lat", String(lat)); photon.searchParams.set("lon", String(lon)); photon.searchParams.set("limit", "60");
    const response = await fetch(photon, { headers: { Accept: "application/json", "User-Agent": "PakThaiTechMarketDiscovery/1.0" }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Overpass unavailable (" + lastError + "); Photon HTTP " + response.status);
    const data = await response.json();
    elements = (data.features || []).map(feature => {
      const p = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
      const type = String(p.osm_type || "node"), id = String(p.osm_id || p.name || "");
      return { type, id, lat: Number(coordinates[1]), lon: Number(coordinates[0]), tags: { name: p.name, shop: p.osm_value, "addr:city": p.city, phone: p.phone, website: p.website } };
    });
  }
  const seen = new Set(), rows = [];
  for (const element of elements) {
    const tags = element.tags || {}, name = String(tags.name || tags["name:en"] || tags.brand || "").trim();
    const id = String(element.type || "node") + ":" + String(element.id || name);
    if (!name || seen.has(id)) continue;
    seen.add(id);
    const rawUrl = new URL("https://www.openstreetmap.org/" + encodeURIComponent(String(element.type || "node")) + "/" + encodeURIComponent(String(element.id || id)));
    rawUrl.searchParams.set("pakthai_market", market.sourceKey + "_buyer");
    const address = [tags["addr:street"], tags["addr:city"] || market.city, country].filter(Boolean).join(", ");
    rows.push({ title: name, url: rawUrl.toString(), domain: "openstreetmap.org", snippet: [address, tags.shop || tags.office || "Computer/electronics business", tags.phone || tags["contact:phone"] || "", tags.website || tags["contact:website"] || ""].filter(Boolean).join(" | ").slice(0, 1500), search_query: "computer/electronics retailer or wholesaler near " + market.city + ", " + country, source_engine: "osm-market-buyer" });
  }
  if (!rows.length) throw new Error("Free public map search returned no named buyer prospects near " + market.city + "; try again later or review OpenStreetMap coverage.");
  return rows.slice(0, 80);
}

export async function runMarketBuyerDiscovery(db, country) {
  const market = MARKETS[country];
  if (!market) return { ok: false, error: "Country must be Thailand or South Korea." };
  await ensureSchema(db);
  const started = new Date().toISOString();
  try {
    const control = await db.prepare("SELECT value FROM settings WHERE key=?").bind(market.key).first();
    if (!["true", "1", "on", "enabled"].includes(String(control?.value || "").toLowerCase())) return { ok: true, skipped: true, country, reason: "Country sourcing control is off.", ran_at: started };
    const items = await discoverBuyers(country, market); let saved = 0;
    for (const item of items) {
      const result = await db.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at,country)
        VALUES('buyer',?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,country=excluded.country,last_seen_at=CURRENT_TIMESTAMP`)
        .bind(item.source_engine,item.title,item.url,item.domain,item.snippet,item.search_query,country).run();
      if (Number(result.meta?.changes || 0) > 0) saved++;
    }
    const result = { ok: true, country, city: market.city, ran_at: started, source: "OpenStreetMap/Overpass with Photon fallback", results_seen: items.length, saved_or_refreshed: saved, note: "Unverified public business leads only. No outreach, buyer accounts, quotes, orders or commitments were created." };
    await db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("market_buyer_discovery_" + market.sourceKey + "_last_status", JSON.stringify(result)).run();
    return result;
  } catch (error) {
    const result = { ok: false, country, city: market.city, ran_at: started, error: String(error?.message || error).slice(0, 250) };
    await db.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("market_buyer_discovery_" + market.sourceKey + "_last_status", JSON.stringify(result)).run();
    return result;
  }
}

export async function handleMarketDiscoveryRequest(request, env) {
  const url = new URL(request.url);
  if (!["/api/market-prospects/discover-buyers", "/api/market-prospects/status"].includes(url.pathname)) return null;
  const session = await getSession(request, env);
  if (session?.role !== "owner") return json({ ok: false, error: "Owner login required for market buyer discovery." }, 403);
  await ensureSchema(env.DB);
  if (url.pathname === "/api/market-prospects/status" && request.method === "GET") {
    const keys = ["seller_discovery_last_status", "seller_discovery_last_run_at", "korea_seller_discovery_last_status", "market_buyer_discovery_thailand_last_status", "market_buyer_discovery_south_korea_last_status"];
    const marks = keys.map(() => "?").join(",");
    const rows = await env.DB.prepare("SELECT key,value FROM settings WHERE key IN (" + marks + ")").bind(...keys).all();
    const status = Object.fromEntries((rows.results || []).map(row => {
      let value = row.value;
      try { value = JSON.parse(String(value)); } catch (_) { value = { ok: String(value) !== "failed", status: String(value) }; }
      return [row.key, value];
    }));
    const counts = await env.DB.prepare("SELECT country,prospect_type,COUNT(*) AS count FROM external_prospects WHERE country IN ('Thailand','South Korea') GROUP BY country,prospect_type").all();
    const markets = {};
    for (const country of ["Thailand", "South Korea"]) {
      const key = country === "Thailand" ? "thailand" : "south_korea";
      const countFor = type => Number((counts.results || []).find(row => row.country === country && row.prospect_type === type)?.count || 0);
      markets[country] = {
        sellers: status[country === "Thailand" ? "seller_discovery_last_status" : "korea_seller_discovery_last_status"] || null,
        buyers: status["market_buyer_discovery_" + key + "_last_status"] || null,
        seller_count: countFor("seller"), buyer_count: countFor("buyer")
      };
    }
    return json({ ok: true, markets, note: "Counts are unverified public prospects, not confirmed buyers or sellers." });
  }
  if (url.pathname !== "/api/market-prospects/discover-buyers") return json({ ok: false, error: "Route or method not found." }, 404);
  if (request.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
  let body = {}; try { body = await request.json(); } catch (_) {}
  const country = String(body.country || "").trim();
  const result = await runMarketBuyerDiscovery(env.DB, country);
  return json(result, result.ok ? 200 : 502);
}
