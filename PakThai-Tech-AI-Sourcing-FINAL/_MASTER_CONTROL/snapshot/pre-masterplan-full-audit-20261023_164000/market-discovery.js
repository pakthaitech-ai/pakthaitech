// Free, owner-triggered prospect discovery for Thailand and South Korea buyer markets.
// Public map entries are unverified leads only; this module never contacts businesses.
import { getSession } from "./auth-session.js";

const MARKETS = {
  Thailand: { key: "country_thailand_enabled", city: "Bangkok", countryCode: "th", radius: 15000, sourceKey: "thailand" },
  "South Korea": { key: "country_south_korea_enabled", city: "Pyeongtaek-si, Gyeonggi-do", countryCode: "kr", radius: 30000, sourceKey: "south_korea" }
};
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter"];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Keep buyer candidates tied to IT/computer intent; generic hardware shops and office/company
// listings are not computer buyers just because they fall inside the search radius.
function isRelevantBuyer(tags = {}) {
  const name = String(tags.name || tags["name:en"] || tags.brand || "").trim().toLowerCase();
  const shop = String(tags.shop || "").trim().toLowerCase();
  const office = String(tags.office || "").trim().toLowerCase();
  const strongIntent = /computer|computing|(^|[^a-z])pc([^a-z]|$)|it solutions?|information technology|laptop|notebook|server|network(?:ing)?|printer|computer parts|electronics? distributor|electronic components|(^|[^a-z])tech(nology)?([^a-z]|$)/.test(name);
  const mappedItShop = /^(computer|electronics|computer_parts)$/.test(shop);
  return Boolean(name && (mappedItShop || strongIntent || (office === "wholesale" && strongIntent)));
}

function normalizedBusinessKey(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9ก-๙가-힣]+/g, " ").trim();
}

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
  // Stable city-centre search origins avoid making every discovery depend on a live geocoder.
  // These coordinates are search centres only, never coordinates assigned to individual prospects.
  const centres = { Thailand: { lat: 13.7563, lon: 100.5018 }, "South Korea": { lat: 36.9929, lon: 127.1129 } };
  const { lat, lon } = centres[country];
  const around = "around:" + market.radius + "," + lat + "," + lon;
  const query = '[out:json][timeout:6];(nwr["shop"~"^(computer|electronics|computer_parts)$"](' + around + ');nwr["office"="wholesale"]["name"](' + around + ');nwr["name"~"computer|computing|laptop|server|network|IT|technology|electronics",i](' + around + '););out center tags 80;';
  let elements = null, lastError = "No public Overpass endpoint responded";
  // Public Overpass servers are queried one at a time to avoid parallel load and rate limiting.
  for (const endpoint of OVERPASS) {
    try {
      const u = new URL(endpoint); u.searchParams.set("data", query);
      const response = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "PakThaiTechMarketDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" }, signal: AbortSignal.timeout(3000) });
      if (!response.ok) throw new Error("Overpass HTTP " + response.status);
      const data = await response.json(); elements = data.elements || []; break;
    } catch (error) { lastError = String(error?.message || error).slice(0, 160); }
  }
  if (elements === null || elements.length === 0) {
    const photon = new URL("https://photon.komoot.io/api/");
    const localTerms = "computer electronics retailer";
    photon.searchParams.set("q", localTerms + " " + market.city + " " + country);
    photon.searchParams.set("lat", String(lat)); photon.searchParams.set("lon", String(lon)); photon.searchParams.set("limit", "60");
    try {
      const response = await fetch(photon, { headers: { Accept: "application/json", "User-Agent": "PakThaiTechMarketDiscovery/1.0" }, signal: AbortSignal.timeout(3000) });
      if (!response.ok) {
        lastError += "; Photon HTTP " + response.status;
        elements = [];
      } else {
        const data = await response.json();
        elements = (data.features || []).map(feature => {
          const p = feature.properties || {}, coordinates = feature.geometry?.coordinates || [];
          const type = String(p.osm_type || "node"), id = String(p.osm_id || p.name || "");
          return { type, id, lat: Number(coordinates[1]), lon: Number(coordinates[0]), tags: { name: p.name, shop: p.osm_value, "addr:city": p.city, phone: p.phone, website: p.website } };
        });
      }
    } catch (error) {
      lastError += "; Photon fallback: " + String(error?.message || error).slice(0, 100);
      elements = [];
    }
  }
  // Final free fallback: named OSM place search when Overpass and Photon return no results.
  if (!elements.length) {
    try {
      const fallback = new URL("https://nominatim.openstreetmap.org/search");
      fallback.searchParams.set("q", "computer electronics shop " + market.city + ", " + country);
      fallback.searchParams.set("format", "jsonv2");
      fallback.searchParams.set("limit", "40");
      fallback.searchParams.set("countrycodes", market.countryCode);
      const fallbackResponse = await fetch(fallback, {
        headers: { Accept: "application/json", "User-Agent": "PakThaiTechMarketDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
        signal: AbortSignal.timeout(3500)
      });
      if (fallbackResponse.ok) {
        const places = await fallbackResponse.json();
        if (Array.isArray(places)) {
          elements = places.map(place => ({
            type: place.osm_type || "node",
            id: place.osm_id || place.place_id,
            lat: Number(place.lat),
            lon: Number(place.lon),
            tags: { name: place.name || String(place.display_name || "").split(",")[0], shop: "computer", "addr:city": market.city, description: place.type || place.class }
          }));
        }
      } else {
        lastError += "; Nominatim fallback HTTP " + fallbackResponse.status;
      }
    } catch (error) {
      lastError += "; Nominatim fallback: " + String(error?.message || error).slice(0, 100);
    }
  }
  const seen = new Set(), seenBusinesses = new Set(), rows = [];
  for (const element of elements) {
    const tags = element.tags || {}, name = String(tags.name || tags["name:en"] || tags.brand || "").trim();
    const id = String(element.type || "node") + ":" + String(element.id || name);
    if (!name || seen.has(id) || !isRelevantBuyer(tags)) continue;
    const coords = element.center || { lat: element.lat, lon: element.lon };
    const placeLat = Number(coords?.lat), placeLon = Number(coords?.lon);
    if (!Number.isFinite(placeLat) || !Number.isFinite(placeLon) || distanceKm(lat, lon, placeLat, placeLon) > market.radius / 1000) continue;
    const businessKey = normalizedBusinessKey(name + " " + String(tags["addr:city"] || market.city));
    if (seenBusinesses.has(businessKey)) continue;
    seen.add(id);
    seenBusinesses.add(businessKey);
    const shop = String(tags.shop || "").toLowerCase(), office = String(tags.office || "").toLowerCase();
    const rawUrl = new URL("https://www.openstreetmap.org/" + encodeURIComponent(String(element.type || "node")) + "/" + encodeURIComponent(String(element.id || id)));
    rawUrl.searchParams.set("pakthai_market", market.sourceKey + "_buyer");
    const address = [tags["addr:street"], tags["addr:city"] || market.city, country].filter(Boolean).join(", ");
    rows.push({ title: name, url: rawUrl.toString(), domain: "openstreetmap.org", snippet: [address, tags.shop || tags.office || "Computer/electronics business", tags.phone || tags["contact:phone"] || "", tags.website || tags["contact:website"] || ""].filter(Boolean).join(" | ").slice(0, 1500), search_query: "computer/electronics retailer or wholesaler near " + market.city + ", " + country, source_engine: "osm-market-buyer" });
  }
  if (!rows.length) {
    // A web-search fallback broadens discovery when local map coverage is sparse.
    // These are clearly labeled location-unverified prospects; no coordinates or buyer status are inferred.
    let searchError = "No named map results";
    try {
      const rss = new URL("https://www.bing.com/search");
      rss.searchParams.set("q", "computer electronics IT retailer distributor " + market.city + " " + country);
      rss.searchParams.set("format", "rss");
      rss.searchParams.set("cc", market.countryCode === "kr" ? "KR" : "TH");
      const response = await fetch(rss, { headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechMarketDiscovery/1.0)" }, signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new Error("Bing RSS HTTP " + response.status);
      const xml = await response.text();
      const decode = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
      const webRows = [];
      for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
        const item = match[1];
        const title = decode(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
        const link = decode(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]);
        const description = decode(item.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1]);
        let target; try { target = new URL(link); } catch { continue; }
        const host = target.hostname.toLowerCase().replace(/^www\./, "");
        const searchable = (title + " " + description + " " + host).toLowerCase();
        if (!title || !["http:", "https:"].includes(target.protocol) || /(^|\.)(bing\.com|microsoft\.com|google\.[a-z.]+|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org|linkedin\.com)$/i.test(host)) continue;
        if (!/computer|electronics?|hardware|laptop|pc parts|it solution|technology|technologies|printer|server|wholesale|retailer|distributor|mobile phone/.test(searchable)) continue;
        if (webRows.some(row => row.domain === host)) continue;
        webRows.push({ title: title.slice(0, 250), url: target.origin, domain: host, snippet: ("Web-search result; exact address and market presence unverified. " + description).slice(0, 1500), search_query: "computer/electronics business near " + market.city + ", " + country + " (web result; verify location)", source_engine: "web-search-unverified-buyer" });
        if (webRows.length >= 20) break;
      }
      if (webRows.length) return webRows;
      searchError = "Bing RSS returned no qualifying business results";
      // Bing sometimes serves useful HTML results even when its RSS endpoint is empty.
      try {
        const htmlUrl = new URL("https://www.bing.com/search");
        htmlUrl.searchParams.set("q", "computer retailer IT hardware distributor " + market.city + " " + country);
        htmlUrl.searchParams.set("cc", market.countryCode.toUpperCase()); htmlUrl.searchParams.set("count", "20");
        const htmlResponse = await fetch(htmlUrl, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechMarketDiscovery/1.0)" }, signal: AbortSignal.timeout(2500) });
        if (htmlResponse.ok) {
          const html = await htmlResponse.text();
          const decodeText = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
          const blocks = [...html.matchAll(/<h2\b[\s\S]*?<\/h2>[\s\S]{0,2200}?(?=<h2\b|<\/ol>|$)/gi)].map(match => match[0]);
          for (const block of blocks) {
            const anchor = block.match(/<h2[^>]*>\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
            if (!anchor) continue;
            const title = decodeText(anchor[2]); let target;
            try { target = new URL(decodeText(anchor[1]), "https://www.bing.com"); } catch { continue; }
            if (target.hostname === "www.bing.com" && target.pathname === "/ck/a") {
              const token = target.searchParams.get("u") || "";
              if (token.startsWith("a1")) { try { target = new URL(atob(token.slice(2).replace(/-/g, "+").replace(/_/g, "/"))); } catch {} }
            }
            const host = target.hostname.toLowerCase().replace(/^www\./, "");
            const searchable = (title + " " + host + " " + block).toLowerCase();
            if (!title || !["http:", "https:"].includes(target.protocol) || /(^|\.)(bing\.com|microsoft\.com|google\.[a-z.]+|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org|linkedin\.com)$/i.test(host)) continue;
            if (!/computer|electronics?|hardware|laptop|technology|printer|server|wholesale|retailer|distributor|it solution/.test(searchable) || webRows.some(row => row.domain === host)) continue;
            webRows.push({ title: title.slice(0,250), url: target.origin, domain: host, snippet: "Bing public HTML result; exact address and buyer interest unverified. Owner review required.", search_query: "computer/electronics business near " + market.city + ", " + country + " (web result; verify location)", source_engine: "web-search-unverified-buyer" });
            if (webRows.length >= 15) break;
          }
        }
      } catch (error) { searchError += "; Bing HTML: " + String(error?.message || error).slice(0, 100); }
      if (webRows.length) return webRows;
      // Secondary public HTML search parser; every returned item remains explicitly unverified.
      const ddg = new URL("https://html.duckduckgo.com/html/");
      ddg.searchParams.set("q", "computer electronics retailer " + market.city + " " + country);
      const ddgResponse = await fetch(ddg, { headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechMarketDiscovery/1.0)" }, signal: AbortSignal.timeout(2500) });
      if (ddgResponse.ok) {
        const html = await ddgResponse.text();
        const decodeHtml = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
        for (const match of html.matchAll(/<a\b[^>]*class=[\"'][^\"']*(?:result__a|result-link)[^\"']*[\"'][^>]*href=[\"']([^\"']+)[\"'][^>]*>([\s\S]*?)<\/a>/gi)) {
          let target; try { target = new URL(decodeHtml(match[1])); } catch { continue; }
          const title = decodeHtml(match[2]);
          if (target.hostname.includes("duckduckgo.com")) { const actual = target.searchParams.get("uddg"); if (actual) { try { target = new URL(actual); } catch {} } }
          const host = target.hostname.toLowerCase().replace(/^www\\./, "");
          if (!title || !["http:", "https:"].includes(target.protocol) || /(^|\\.)(duckduckgo\\.com|google\\.[a-z.]+|facebook\\.com|instagram\\.com|youtube\\.com|wikipedia\\.org|linkedin\\.com)$/i.test(host)) continue;
          if (!/computer|electronics?|hardware|laptop|technology|retailer|wholesale|distributor|it solution/.test((title + " " + host).toLowerCase()) || webRows.some(row => row.domain === host)) continue;
          webRows.push({ title: title.slice(0,250), url: target.origin, domain: host, snippet: "Public web result; exact address and market presence unverified. Owner review required.", search_query: "computer/electronics business near " + market.city + ", " + country + " (web result; verify location)", source_engine: "web-search-unverified-buyer" });
          if (webRows.length >= 15) break;
        }
      }
      if (webRows.length) return webRows;
    } catch (error) { searchError = String(error?.message || error).slice(0, 160); }
    // Last-resort Korea buyer shortlist from known public retail sites when all free discovery providers are unavailable.
    // These are candidate websites only: no local address, buying interest, or export eligibility is inferred.
    if (country === "South Korea") {
      return [
        { title: "Compuzone — Korean computer retailer candidate", url: "https://www.compuzone.co.kr/", domain: "compuzone.co.kr", snippet: "Public Korean computer retail website candidate. Exact location, wholesale buying interest, supplier onboarding and cross-border suitability require owner verification.", search_query: "Korean computer retailer candidate; provider fallback after public search failure", source_engine: "curated-public-site-unverified-buyer" },
        { title: "Icodaa — Korean computer retailer candidate", url: "https://www.icoda.co.kr/", domain: "icoda.co.kr", snippet: "Public Korean computer retail website candidate. Exact location, wholesale buying interest, supplier onboarding and cross-border suitability require owner verification.", search_query: "Korean computer retailer candidate; provider fallback after public search failure", source_engine: "curated-public-site-unverified-buyer" },
        { title: "Joyzen — Korean computer retailer candidate", url: "https://www.joyzen.co.kr/", domain: "joyzen.co.kr", snippet: "Public Korean computer retail website candidate. Exact location, wholesale buying interest, supplier onboarding and cross-border suitability require owner verification.", search_query: "Korean computer retailer candidate; provider fallback after public search failure", source_engine: "curated-public-site-unverified-buyer" },
        { title: "Lotte Hi-Mart — Korean electronics retailer candidate", url: "https://www.e-himart.co.kr/", domain: "e-himart.co.kr", snippet: "Public Korean electronics retail website candidate. Exact location, wholesale buying interest, supplier onboarding and cross-border suitability require owner verification.", search_query: "Korean electronics retailer candidate; provider fallback after public search failure", source_engine: "curated-public-site-unverified-buyer" }
      ];
    }
    if (country === "Thailand") {
      // Last-resort public-site shortlist when free search providers fail.
      // These are candidate retail/channel websites only; buying interest, address, stock and wholesale suitability remain unverified.
      return [
        { title: "JIB Computer Group — Thailand retail candidate", url: "https://www.jib.co.th/", domain: "jib.co.th", snippet: "Public Thai computer retailer website candidate. Buying interest, wholesale suitability, address and cross-border fit require Owner verification.", search_query: "Thailand computer retailer candidate; public-site fallback after search failure", source_engine: "curated-public-site-unverified-buyer" },
        { title: "Advice IT — Thailand retail candidate", url: "https://www.advice.co.th/", domain: "advice.co.th", snippet: "Public Thai IT retailer website candidate. Buying interest, wholesale suitability, address and cross-border fit require Owner verification.", search_query: "Thailand IT retailer candidate; public-site fallback after search failure", source_engine: "curated-public-site-unverified-buyer" },
        { title: "BaNANA — Thailand electronics retail candidate", url: "https://www.bnn.in.th/", domain: "bnn.in.th", snippet: "Public Thai electronics retail website candidate. Buying interest, wholesale suitability, address and cross-border fit require Owner verification.", search_query: "Thailand electronics retailer candidate; public-site fallback after search failure", source_engine: "curated-public-site-unverified-buyer" },
        { title: "IT City — Thailand IT retail candidate", url: "https://www.itcity.in.th/", domain: "itcity.in.th", snippet: "Public Thai IT retailer website candidate. Buying interest, wholesale suitability, address and cross-border fit require Owner verification.", search_query: "Thailand IT retailer candidate; public-site fallback after search failure", source_engine: "curated-public-site-unverified-buyer" },
        { title: "Power Buy — Thailand electronics retail candidate", url: "https://www.powerbuy.co.th/", domain: "powerbuy.co.th", snippet: "Public Thai electronics retailer website candidate. Buying interest, wholesale suitability, address and cross-border fit require Owner verification.", search_query: "Thailand electronics retailer candidate; public-site fallback after search failure", source_engine: "curated-public-site-unverified-buyer" }
      ];
    }
    throw new Error("No named map prospects near " + market.city + "; web-search fallback: " + searchError);
  }
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
    const items = await discoverBuyers(country, market);
    // Batch writes so a broad map result cannot exhaust the Worker subrequest budget.
    // Discovery caps the result set at 80 rows, within D1 batch statement limits.
    const statements = items.map(item => db.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at,country)
        VALUES('buyer',?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,country=excluded.country,last_seen_at=CURRENT_TIMESTAMP`)
        .bind(item.source_engine,item.title,item.url,item.domain,item.snippet,item.search_query,country));
    const writeResults = statements.length ? await db.batch(statements) : [];
    const saved = writeResults.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
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
