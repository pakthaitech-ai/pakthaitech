// PAKTHAI TECH — scheduled Thailand supplier prospect discovery.
// Public OpenStreetMap leads only: no seller records, offers, outreach, or orders are created.
import { getSession } from "./auth-session.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
  "https://z.overpass-api.de/api/interpreter"
];

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS external_prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_type TEXT NOT NULL DEFAULT 'seller',
    source_engine TEXT NOT NULL DEFAULT 'openserp',
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    domain TEXT,
    snippet TEXT,
    search_query TEXT,
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    owner_notes TEXT,
    first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function discoverBangkokSuppliers() {
  const geoUrl = new URL(NOMINATIM);
  geoUrl.searchParams.set("q", "Bangkok, Thailand");
  geoUrl.searchParams.set("format", "jsonv2");
  geoUrl.searchParams.set("limit", "1");
  geoUrl.searchParams.set("countrycodes", "th");
  const geoRes = await fetch(geoUrl.toString(), {
    headers: { "Accept": "application/json", "User-Agent": "PakThaiTechSellerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
    signal: AbortSignal.timeout(8000)
  });
  if (!geoRes.ok) throw new Error("Thailand geocoding HTTP " + geoRes.status);
  const geo = await geoRes.json();
  if (!Array.isArray(geo) || !geo.length) throw new Error("Bangkok, Thailand not found");
  const lat = Number(geo[0].lat), lon = Number(geo[0].lon);
  const around = "around:15000," + lat + "," + lon;
  const query = '[out:json][timeout:12];(' +
    'node["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'way["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'relation["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'node["office"="company"]["name"](' + around + ');' +
    'way["office"="company"]["name"](' + around + ');' +
    ');out center tags 80;';
  const attempts = await Promise.allSettled(OVERPASS.map(async endpoint => {
    const u = new URL(endpoint); u.searchParams.set("data", query);
    const res = await fetch(u.toString(), {
      headers: { "Accept": "application/json", "User-Agent": "PakThaiTechSellerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error("Overpass HTTP " + res.status);
    return await res.json();
  }));
  const good = attempts.find(x => x.status === "fulfilled");
  if (good) {
    const seen = new Set();
    const overpassRows = (good.value.elements || []).map(el => {
      const tags = el.tags || {};
      const name = String(tags.name || tags["name:en"] || tags.brand || "").trim();
      const key = String(el.type) + ":" + String(el.id);
      if (!name || seen.has(key)) return null;
      seen.add(key);
      const address = [tags["addr:street"], tags["addr:suburb"], tags["addr:city"] || "Bangkok", tags["addr:postcode"], "Thailand"].filter(Boolean).join(", ");
      return {
        title: name,
        url: "https://www.openstreetmap.org/" + encodeURIComponent(String(el.type)) + "/" + encodeURIComponent(String(el.id)),
        domain: "openstreetmap.org",
        snippet: [address, tags.shop || tags.office || "Computer/electronics business", tags.phone || tags["contact:phone"] || "", tags.website || tags["contact:website"] || ""].filter(Boolean).join(" | ").slice(0, 1500),
        search_query: "computer/electronics supplier, Bangkok, Thailand",
        source_engine: "osm"
      };
    }).filter(Boolean);
    if (overpassRows.length) return overpassRows;
  }
  // Free Photon fallback when public Overpass mirrors fail or return no named businesses.
  const p = new URL("https://photon.komoot.io/api/");
  p.searchParams.set("q", "computer shop Bangkok Thailand");
  p.searchParams.set("limit", "50"); p.searchParams.set("lat", String(lat)); p.searchParams.set("lon", String(lon));
  const pr = await fetch(p.toString(), {
    headers: { "Accept": "application/json", "User-Agent": "PakThaiTechSellerDiscovery/1.0" },
    signal: AbortSignal.timeout(8000)
  });
  if (!pr.ok) throw new Error("Overpass unavailable; Photon HTTP " + pr.status);
  const pd = await pr.json(), seen = new Set(), rows = [];
  for (const f of pd.features || []) {
    const x = f.properties || {}, name = String(x.name || "").trim();
    const searchable = (name + " " + String(x.osm_value || "")).toLowerCase();
    const id = String(x.osm_type || "feature") + ":" + String(x.osm_id || name);
    if (!name || seen.has(id) || !/computer|electronic|hardware|technology|laptop|it solution|supplier/.test(searchable)) continue;
    seen.add(id);
    rows.push({
      title: name,
      url: "https://www.openstreetmap.org/" + encodeURIComponent(String(x.osm_type || "node")) + "/" + encodeURIComponent(String(x.osm_id || id)),
      domain: "openstreetmap.org",
      snippet: [x.street, x.district, x.city || "Bangkok", x.state, "Thailand", x.phone, x.website].filter(Boolean).join(", ").slice(0,1500),
      search_query: "computer/electronics supplier, Bangkok, Thailand",
      source_engine: "photon"
    });
  }
  return rows;
}

export async function runScheduledSellerDiscovery(db) {
  await ensureSchema(db);
  const started = new Date().toISOString();
  try {
    const items = await discoverBangkokSuppliers();
    let saved = 0;
    for (const item of items) {
      const r = await db.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at)
        VALUES('seller',?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,last_seen_at=CURRENT_TIMESTAMP`)
        .bind(item.source_engine,item.title,item.url,item.domain,item.snippet,item.search_query).run();
      if (Number(r.meta?.changes || 0) > 0) saved++;
    }
    const result = { ok:true, ran_at:started, city:"Bangkok, Thailand", source:"OpenStreetMap/Photon", results_seen:items.length, saved_or_refreshed:saved };
    await db.prepare("INSERT INTO settings(key,value) VALUES('seller_discovery_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(started).run();
    await db.prepare("INSERT INTO settings(key,value) VALUES('seller_discovery_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();
    return result;
  } catch (e) {
    const result = { ok:false, ran_at:started, city:"Bangkok, Thailand", error:String(e?.message || e).slice(0,250) };
    await db.prepare("INSERT INTO settings(key,value) VALUES('seller_discovery_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(started).run();
    await db.prepare("INSERT INTO settings(key,value) VALUES('seller_discovery_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();
    return result;
  }
}

export async function handleSellerDiscoveryRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname !== "/api/seller-prospects/discover") return null;
  if (request.method !== "POST") return json({ ok:false, error:"POST required" },405);
  const session = await getSession(request, env);
  if (session?.role !== "owner") return json({ ok:false, error:"Owner login required for seller discovery." },403);
  const result = await runScheduledSellerDiscovery(env.DB);
  return json({ ...result, note:"These are unverified public leads only. No seller records, offers, messages, purchases, or orders were created." }, result.ok ? 200 : 502);
}
