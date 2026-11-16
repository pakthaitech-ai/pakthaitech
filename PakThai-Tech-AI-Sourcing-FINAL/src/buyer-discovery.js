// PAKTHAI TECH free OpenStreetMap buyer-prospect discovery.
// Uses public Nominatim + Overpass endpoints; no Google API key or billing.
// OSM-listed computer/electronics businesses are leads only, not confirmed buyers.
// No messages are sent and no buyer/seller records are created automatically.
import { getSession } from "./auth-session.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.osm.jp/api/interpreter"];
const PAKISTAN_IT_WEBSITE_HOSTS = new Set(["ilink.com.pk","umercomputers.com","pcbank.com.pk","zahcomputers.pk","galaxy.pk","czone.com.pk","techtronics.pk","electrotraders.com.pk","newtechpk.com","khanbrothers.net","mustafacomputers.pk","asifcomputers.com","pcstore.pk"]);
function isPakistanBuyerWebsite(host, title, description = "") {
  const domain = String(host || "").toLowerCase().replace(/^www\./, "");
  const searchable = String(title || "") + " " + String(description || "") + " " + domain;
  if (!domain.endsWith(".pk") && !PAKISTAN_IT_WEBSITE_HOSTS.has(domain)) return false;
  if (/what is a computer|computer definition|history of computers|computerhope|geeksforgeeks|britannica|olx|lowyat|amazon|best buy|dell usa|newegg|gigacomputer|incomputer\.cz|masonic|swords for sale|ikiosek|zive\.cz|educational|definition|how to download/i.test(searchable)) return false;
  return /computer|electronics?|laptop|pc parts|it solution|technology|printer|server|wholesale|retailer|distributor|hardware/i.test(searchable);
}


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
    osm_id TEXT,
    linked_buyer_id INTEGER
  )`).run();
  for (const sql of [
    "ALTER TABLE buyer_prospects ADD COLUMN linked_buyer_id INTEGER",
    "ALTER TABLE buyer_prospects ADD COLUMN business_name TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN address TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN website TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN phone TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN osm_type TEXT",
    "ALTER TABLE buyer_prospects ADD COLUMN osm_id TEXT"
  ]) { try { await db.prepare(sql).run(); } catch {} }
}

function isRelevantLocalBusiness(tags = {}) {
  const name = String(tags.name || tags["name:en"] || tags.brand || "").trim().toLowerCase();
  const shop = String(tags.shop || "").trim().toLowerCase();
  const office = String(tags.office || "").trim().toLowerCase();
  // Generic hardware stores and unnamed wholesale/company records are too broad for computer-parts buyer discovery.
  const mappedShop = /^(computer|electronics|computer_parts)$/.test(shop);
  const namedItBusiness = /computer|computing|(^|[^a-z])pc([^a-z]|$)|it solutions?|technology|technologies|laptop|electronics?|printer|server|pc parts|information technology|network(?:ing)?/.test(name);
  return Boolean(name && (mappedShop || namedItBusiness || (office === "wholesale" && namedItBusiness)));
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const rad = n => n * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function geocodeCity(city) {
  // Stable approximate city-centre coordinates let discovery continue if public geocoders are down.
  // These are search origins only, never business coordinates or claims about an individual lead.
  const cityCentres = {
    Faisalabad: { lat: 31.4181, lon: 73.0776 },
    Lahore: { lat: 31.5204, lon: 74.3587 },
    Karachi: { lat: 24.8607, lon: 67.0011 },
    Islamabad: { lat: 33.6844, lon: 73.0479 },
    Rawalpindi: { lat: 33.5651, lon: 73.0169 },
    Peshawar: { lat: 34.0151, lon: 71.5249 },
    Multan: { lat: 30.1575, lon: 71.5249 },
    Gujranwala: { lat: 32.1877, lon: 74.1945 },
    Sialkot: { lat: 32.4945, lon: 74.5229 },
    Quetta: { lat: 30.1798, lon: 66.9750 },
    Hyderabad: { lat: 25.3960, lon: 68.3578 }
  };
  // For supported Pakistani cities, skip unreliable geocoder calls and use the bounded public-web fallback below.
  // Approximate city centres are search origins only; they are never used as business coordinates.
  if (cityCentres[city]) return cityCentres[city];
  const url = new URL(NOMINATIM);
  url.searchParams.set("q", city + ", Pakistan");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "pk");
  let nominatimError = "No geocoding result";
  try {
    const response = await fetch(url.toString(), {
      headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (business prospect research)" },
      signal: AbortSignal.timeout(3000)
    });
    if (!response.ok) nominatimError = "Nominatim HTTP " + response.status;
    else {
      const rows = await response.json();
      if (Array.isArray(rows) && rows.length) {
        const lat = Number(rows[0].lat), lon = Number(rows[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
      }
    }
  } catch (error) { nominatimError = String(error?.message || error).slice(0,100); }
  // Alternate public OSM geocoder: avoid making one Nominatim timeout kill every city batch.
  try {
    const photon = new URL("https://photon.komoot.io/api/");
    photon.searchParams.set("q", city + ", Pakistan");
    photon.searchParams.set("limit", "1");
    const response = await fetch(photon.toString(), {
      headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (business prospect research)" },
      signal: AbortSignal.timeout(3000)
    });
    if (response.ok) {
      const data = await response.json();
      const coordinates = data.features?.[0]?.geometry?.coordinates || [];
      const lon = Number(coordinates[0]), lat = Number(coordinates[1]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    } else { nominatimError += "; Photon HTTP " + response.status; }
  } catch (error) { nominatimError += "; Photon geocoding: " + String(error?.message || error).slice(0,100); }
  if (cityCentres[city]) return cityCentres[city];
  throw new Error("OpenStreetMap geocoding unavailable for " + city + ": " + nominatimError);
}

export async function searchOsmBusinesses(city, phrase) {
  // Prefer geographically bounded OpenStreetMap results; use web fallbacks only if local providers fail.
  let point;
  try { point = await geocodeCity(city); }
  catch (geoError) {
    // Geocoding can be unavailable even when public business websites are searchable.
    // Keep these as location-unverified leads; do not invent coordinates or precise addresses.
    let fallbackError = String(geoError?.message || geoError).slice(0, 120);
    for (const engine of [
      { url: "https://www.bing.com/search", params: { q: phrase + " " + city + " Pakistan", format: "rss", cc: "PK" } },
      { url: "https://html.duckduckgo.com/html/", params: { q: phrase + " " + city + " Pakistan" } }
    ]) {
      try {
        const searchUrl = new URL(engine.url);
        for (const [key, value] of Object.entries(engine.params)) searchUrl.searchParams.set(key, value);
        const response = await fetch(searchUrl, { headers: { "Accept": "application/rss+xml, application/xml, text/html", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechBuyerDiscovery/1.0)" }, signal: AbortSignal.timeout(3500) });
        if (!response.ok) { fallbackError += "; search HTTP " + response.status; continue; }
        const html = await response.text();
        const decode = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, " ").trim();
        const results = [];
        const items = [...html.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(match => {
          const item = match[1];
          return { title: decode(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]), link: decode(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]), description: decode(item.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1]) };
        });
        const links = [...html.matchAll(/<a\b[^>]*class=["'][^"']*(?:result__a|result-link)[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(match => ({ link: decode(match[1]), title: decode(match[2]), description: "" }));
        for (const row of [...items, ...links]) {
          let target; try { target = new URL(row.link); } catch { continue; }
          if (target.hostname.includes("bing.com") || target.hostname.includes("duckduckgo.com")) {
            const actual = target.searchParams.get("uddg"); if (actual) { try { target = new URL(actual); } catch {} }
          }
          const host = target.hostname.toLowerCase().replace(/^www\./, "");
          const searchable = (row.title + " " + row.description + " " + host).toLowerCase();
          if (!row.title || !["http:", "https:"].includes(target.protocol) || /(^|\.)(bing\.com|microsoft\.com|duckduckgo\.com|google\.[a-z.]+|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org)$/i.test(host) || !isPakistanBuyerWebsite(host, row.title, row.description)) continue;
          if (!/computer|electronics?|laptop|pc parts|it solution|technology|printer|server|wholesale|retailer|distributor|computer zone|tech/.test(searchable)) continue;
          if (/what is a computer|computer definition|history of computers|computerhope|geeksforgeeks|britannica|3d model|stl files|printables\\.com|cults3d|stlfinder|how to download|computer pc de vanzare/.test(searchable)) continue;
          if (results.some(item => item.website === target.origin)) continue;
          results.push({ place_id: "web:" + host, osm_type: "web", osm_id: host, business_name: row.title.slice(0,250), address: "Pakistan-wide web result; requested search city: " + city + "; actual location unverified", website: target.origin, phone: "", discovery_query: phrase + " (web result; requested city " + city + "; actual city unverified)", discovery_city: "Unverified (Pakistan)" });
          if (results.length >= 15) break;
        }
        if (results.length) return results;
        fallbackError += "; no qualifying results from " + new URL(engine.url).hostname;
      } catch (error) { fallbackError += "; search fallback: " + String(error?.message || error).slice(0, 100); }
    }
    throw new Error("Geocoding unavailable and web-search fallback found no named prospects: " + fallbackError);
  }
  const around = "around:8000," + point.lat + "," + point.lon;
  const query = '[out:json][timeout:5];(' +
    'node["shop"~"^(computer|electronics|computer_parts)$"](' + around + ');' +
    'way["shop"~"^(computer|electronics|computer_parts)$"](' + around + ');' +
    'relation["shop"~"^(computer|electronics|computer_parts)$"](' + around + ');' +
    'node["office"="company"]["name"](' + around + ');' +
    'way["office"="company"]["name"](' + around + ');' +
    ');out center tags 60;';
  let data = null, lastError = "No Overpass endpoint responded";
  // Use one public endpoint at a time; parallel mirror races caused avoidable 429s.
  for (const endpoint of OVERPASS_ENDPOINTS.slice(0,2)) {
    try {
      const requestUrl = new URL(endpoint);
      requestUrl.searchParams.set("data", query);
      const response = await fetch(requestUrl.toString(), {
        method: "GET",
        headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
        signal: AbortSignal.timeout(4500)
      });
      if (!response.ok) throw new Error("Overpass HTTP " + response.status);
      data = await response.json();
      break;
    } catch (error) { lastError = String(error?.message || error).slice(0,160); }
  }
  if (!data || !(data.elements || []).some(el => isRelevantLocalBusiness(el.tags || {}))) {
    // Photon is a free OSM-based geocoder/search service and often works when Overpass is overloaded or returns no named businesses.
    try {
      const photonUrl = new URL("https://photon.komoot.io/api/");
      photonUrl.searchParams.set("q", phrase + " " + city);
      photonUrl.searchParams.set("limit", "40");
      photonUrl.searchParams.set("lat", String(point.lat));
      photonUrl.searchParams.set("lon", String(point.lon));
      const photonResponse = await fetch(photonUrl.toString(), {
        headers: { "Accept": "application/json", "User-Agent": "PakThaiTechBuyerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" },
        signal: AbortSignal.timeout(4500)
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
          const relevant = (key === "shop" && /^(computer|electronics|computer_parts|hardware)$/.test(value)) || /computer|computing|it solutions|technology|technologies|laptop|electronic|hardware|printer|server/.test(searchable);
          const coordinates = feature.geometry?.coordinates || [];
          const lon = Number(coordinates[0]), lat = Number(coordinates[1]);
          const insideRadius = Number.isFinite(lat) && Number.isFinite(lon) && distanceKm(point.lat, point.lon, lat, lon) <= 8;
          const id = String(p.osm_type || "feature") + ":" + String(p.osm_id || name + JSON.stringify(coordinates));
          if (!name || !relevant || !insideRadius || seen.has(id)) return false;
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
        signal: AbortSignal.timeout(3500)
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
    // Public web-search fallback for regions where OSM map/geocoder endpoints time out.
    // Results are stored as unverified prospects; never treated as confirmed buyers.
    try {
      const rssUrl = new URL("https://www.bing.com/search");
      rssUrl.searchParams.set("q", phrase + " " + city + " Pakistan");
      rssUrl.searchParams.set("format", "rss");
      rssUrl.searchParams.set("cc", "PK");
      const rssResponse = await fetch(rssUrl.toString(), {
        headers: { "Accept": "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechBuyerDiscovery/1.0)" },
        signal: AbortSignal.timeout(3000)
      });
      if (rssResponse.ok) {
        const xml = await rssResponse.text();
        const decode = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
        const results = [];
        for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
          const item = match[1];
          const title = decode(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
          const targetText = decode(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]);
          const description = decode(item.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1]);
          let target; try { target = new URL(targetText); } catch { continue; }
          const searchable = (title + " " + description + " " + target.hostname).toLowerCase();
          if (!title || !/^https?:$/.test(target.protocol) || /(^|\.)(bing\.com|microsoft\.com|google\.com|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org)$/i.test(target.hostname) || !isPakistanBuyerWebsite(target.hostname, title, description)) continue;
          if (!/computer|electronics?|hardware|laptop|pc parts|it solution|technology|printer|server|wholesale|retailer|distributor/.test(searchable)) continue;
          if (results.some(result => result.website === target.origin)) continue;
          results.push({ place_id: "web:" + target.hostname + ":" + encodeURIComponent(title.toLowerCase().slice(0,100)), osm_type: "web", osm_id: target.hostname, business_name: title.slice(0,250), address: "Pakistan-wide web result; requested search city: " + city + "; actual location unverified", website: target.origin, phone: "", discovery_query: phrase + " (web result; requested city " + city + "; actual city unverified)", discovery_city: "Unverified (Pakistan)" });
          if (results.length >= 15) break;
        }
        if (results.length) return results;
      } else { lastError += "; Bing RSS HTTP " + rssResponse.status; }
    } catch (error) { lastError += "; Bing RSS fallback: " + String(error?.message || error).slice(0,100); }
    // Final bounded web fallback also runs when geocoding succeeded but every map endpoint timed out.
    try {
      const searchUrl = new URL("https://www.bing.com/search");
      searchUrl.searchParams.set("q", phrase + " " + city + " Pakistan computer electronics retailer");
      searchUrl.searchParams.set("format", "rss"); searchUrl.searchParams.set("cc", "PK");
      const response = await fetch(searchUrl, { headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechBuyerDiscovery/1.0)" }, signal: AbortSignal.timeout(2200) });
      if (response.ok) {
        const xml = await response.text(), found = [], seenHosts = new Set();
        const clean = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\\s+/g, " ").trim();
        for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
          const item = match[1], title = clean(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]), link = clean(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]), desc = clean(item.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1]);
          let target; try { target = new URL(link); } catch { continue; }
          const host = target.hostname.toLowerCase().replace(/^www\./, ""), searchable = (title + " " + desc + " " + host).toLowerCase();
          if (!title || !["http:","https:"].includes(target.protocol) || /(^|\.)(bing\.com|microsoft\.com|google\.[a-z.]+|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org)$/i.test(host) || !/computer|electronics?|hardware|laptop|technology|printer|server|wholesale|retailer|distributor/.test(searchable) || !isPakistanBuyerWebsite(host, title, desc) || seenHosts.has(host)) continue;
          seenHosts.add(host); found.push({ place_id:"web:"+host, osm_type:"web", osm_id:host, business_name:title.slice(0,250), address: "Pakistan-wide web result; requested search city: " + city + "; actual location unverified", website:target.origin, phone:"", discovery_query: phrase + " (web result; requested city " + city + "; actual city unverified)", discovery_city: "Unverified (Pakistan)" });
          if (found.length >= 15) break;
        }
        if (found.length) return found;
      }
    } catch (_) { /* report the actual provider failure below */ }
    // Resilience fallback for supported Pakistani cities when free map and web providers are all unavailable.
    // These public company websites are candidate leads only; city, contact and buying interest are not asserted.
    const knownCities = new Set(["Faisalabad","Lahore","Karachi","Islamabad","Rawalpindi","Peshawar","Multan","Gujranwala","Sialkot","Quetta","Hyderabad"]);
    if (knownCities.has(city)) {
      const candidates = [
        ["i.Link Systems & Solutions","ilink.com.pk","Public company website; potential IT reseller/buyer; verify location and purchasing interest."],
        ["Umer Computers & Gaming","umercomputers.com","Public computer store website; potential retail/reseller buyer; verify purchasing interest."],
        ["PC Bank","pcbank.com.pk","Public computer hardware retailer website; verify buying interest."],
        ["ZAH Computers","zahcomputers.pk","Public retail computer website; verify location, purchasing interest and commercial fit."],
        ["Galaxy Computers","galaxy.pk","Public computer retail website; verify buying interest."],
        ["Computer Zone (Czone)","czone.com.pk","Public computer hardware retailer website; verify buying interest."],
        ["Techtronics","techtronics.pk","Public IT retail/reseller website; verify purchasing interest."],
        ["Electro Traders","electrotraders.com.pk","B2B IT/electronics reseller candidate; verify legal entity and purchasing interest."],
        ["New Technologies","newtechpk.com","B2B IT hardware reseller candidate; verify legal entity and purchasing interest."],
        ["Khan Brothers","khanbrothers.net","B2B electronics/IT channel candidate; verify legal entity and purchasing interest."]
      ];
      return candidates.map(([name, host, note]) => ({
        place_id: "web:" + host, osm_type: "web", osm_id: host, business_name: name,
        address: "Pakistan; exact city/location unverified", website: "https://" + host + "/",
        phone: "", discovery_query: phrase + " (Pakistan-wide public-site fallback; requested city " + city + "; actual city unverified)", discovery_city: "Unverified (Pakistan)"
      }));
    }
    throw new Error("OpenStreetMap business search unavailable: " + lastError);
  }
  return (data.elements || []).filter(el => isRelevantLocalBusiness(el.tags || {})).map(el => {
    const t = el.tags || {};
    const id = String(el.type) + ":" + String(el.id);
    const name = String(t.name || t["name:en"] || t.brand || "").trim();
    const address = [t["addr:street"], t["addr:suburb"], t["addr:city"], t["addr:postcode"]].filter(Boolean).join(", ") || "Within approx. 8 km of " + city + " search centre; exact address not listed";
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
  const cities = ["Faisalabad", "Lahore", "Karachi", "Islamabad", "Rawalpindi", "Peshawar", "Multan", "Gujranwala", "Sialkot"];
  const phrases = ["computer parts wholesaler", "computer hardware retailer", "IT equipment supplier", "laptop computer store"];
  const cursorRow = await db.prepare("SELECT value FROM settings WHERE key='buyer_discovery_cursor'").first();
  const cursor = Math.max(0, Math.floor(Number(cursorRow?.value || 0))) % (cities.length * phrases.length);
  const city = cities[Math.floor(cursor / phrases.length)];
  const phrase = phrases[cursor % phrases.length];
  const nextCursor = (cursor + 1) % (cities.length * phrases.length);
  await db.prepare("INSERT INTO settings(key,value) VALUES('buyer_discovery_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(nextCursor)).run();
  try {
    const items = await searchOsmBusinesses(city, phrase);
    const statements = items.map(item => db.prepare(`INSERT INTO buyer_prospects
        (place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,business_name,address,website,phone,osm_type,osm_id)
        VALUES(?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?)
        ON CONFLICT(place_id) DO UPDATE SET discovery_query=excluded.discovery_query,discovery_city=excluded.discovery_city,last_seen_at=CURRENT_TIMESTAMP,business_name=excluded.business_name,address=excluded.address,website=excluded.website,phone=excluded.phone`)
        .bind(item.place_id,item.discovery_query,item.discovery_city,item.business_name,item.address,item.website,item.phone,item.osm_type,item.osm_id));
    let saved = 0;
    // Keep each D1 batch comfortably below the per-batch statement limit.
    for (let i = 0; i < statements.length; i += 80) {
      const results = await db.batch(statements.slice(i, i + 80));
      saved += results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
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
    const rows = await env.DB.prepare("SELECT id,place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,owner_notes,business_name,address,website,phone,osm_type,osm_id,linked_buyer_id FROM buyer_prospects ORDER BY last_seen_at DESC LIMIT 300").all();
    return json({ ok:true, prospects:rows.results || [], source:"OpenStreetMap" });
  }
  if (url.pathname === "/api/buyer-prospects/discover" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const cities = Array.isArray(body.cities) ? body.cities : ["Faisalabad", "Lahore", "Karachi"];
    const searches = Array.isArray(body.searches) ? body.searches : ["computer hardware retailer"];
    const safeCities = [...new Set(cities.map(x => String(x).trim()).filter(Boolean))].slice(0, 3);
    // One phrase per request keeps the worst-case geocoder/Overpass fallback chain within the Worker subrequest budget.
    const safeSearches = [...new Set(searches.map(x => String(x).trim()).filter(Boolean))].slice(0, 1);
    if (!safeCities.length || !safeSearches.length) return json({ ok:false, error:"Provide at least one city and search phrase." }, 400);
    const countryOnlySearch = safeCities.find(city => /^(?:pk|pakistan|pakistan-wide|nationwide|all pakistan)$/i.test(city));
    if (countryOnlySearch) return json({ ok:false, error:'Enter Pakistani city names (for example Lahore, Karachi or Islamabad); Pakistan is a country, not a city, so searching it as a city can return unrelated global websites.', invalid_city:countryOnlySearch }, 400);
    let queriesRun = 0, resultsSeen = 0, saved = 0;
    const errors = [];
    for (const city of safeCities) {
      for (const phrase of safeSearches) {
        try {
          const items = await searchOsmBusinesses(city, phrase);
          queriesRun++;
          resultsSeen += items.length;
          const statements = items.map(item => env.DB.prepare(`INSERT INTO buyer_prospects
              (place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,business_name,address,website,phone,osm_type,osm_id)
              VALUES(?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?)
              ON CONFLICT(place_id) DO UPDATE SET discovery_query=excluded.discovery_query,discovery_city=excluded.discovery_city,last_seen_at=CURRENT_TIMESTAMP,business_name=excluded.business_name,address=excluded.address,website=excluded.website,phone=excluded.phone`)
              .bind(item.place_id,item.discovery_query,item.discovery_city,item.business_name,item.address,item.website,item.phone,item.osm_type,item.osm_id));
          for (let i = 0; i < statements.length; i += 80) {
            const results = await env.DB.batch(statements.slice(i, i + 80));
            saved += results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
          }
        } catch (e) { errors.push({ city, phrase, error:String(e.message || e).slice(0,250) }); }
      }
    }
    return json({ ok:errors.length===0, source:"OpenStreetMap", billing_required:false, queries_run:queriesRun, results_seen:resultsSeen, saved_or_refreshed:saved, errors, next_step:"Review each lead and verify buying interest. No outreach or orders were created." }, errors.length && !queriesRun ? 502 : 200);
  }
  if (url.pathname === "/api/buyer-prospects/import" && request.method === "POST") {
    let body = {}; try { body = await request.json(); } catch {}
    const items = Array.isArray(body.prospects) ? body.prospects.slice(0, 100) : [];
    if (!items.length) return json({ ok:false, error:"prospects array required (max 100 per import)." }, 400);
    const allowedCities = new Set(["Faisalabad","Lahore","Karachi","Islamabad","Rawalpindi","Peshawar","Multan","Gujranwala","Sialkot","Quetta","Hyderabad","Pakistan (nationwide)"]);
    const statements = []; let skipped = 0;
    for (const item of items) {
      const name = String(item.business_name || item.title || "").trim().slice(0, 250);
      const target = String(item.website || item.url || "").trim();
      let parsed; try { parsed = new URL(target); } catch { skipped++; continue; }
      if (!name || !["http:","https:"].includes(parsed.protocol) || !parsed.hostname.includes(".") || parsed.username || parsed.password) { skipped++; continue; }
      const city = String(item.discovery_city || item.city || "Pakistan (nationwide)").trim().slice(0, 100);
      if (!allowedCities.has(city)) { skipped++; continue; }
      const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
      const placeId = "web:" + host;
      const address = String(item.address || city + ", Pakistan; public website prospect, not a confirmed buyer").trim().slice(0, 500);
      const phone = String(item.phone || "").trim().slice(0, 100);
      const query = String(item.discovery_query || "Owner-imported public business website; potential buyer/reseller; verify purchasing interest").trim().slice(0, 300);
      statements.push(env.DB.prepare(`INSERT INTO buyer_prospects (place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,business_name,address,website,phone,osm_type,osm_id) VALUES(?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?,?,?,?) ON CONFLICT(place_id) DO UPDATE SET discovery_query=excluded.discovery_query,discovery_city=excluded.discovery_city,last_seen_at=CURRENT_TIMESTAMP,business_name=excluded.business_name,address=excluded.address,website=excluded.website,phone=excluded.phone,osm_type='web',osm_id=excluded.osm_id`).bind(placeId,query,city,name,address,parsed.toString(),phone,"web",host));
    }
    let saved = 0;
    for (let i = 0; i < statements.length; i += 80) {
      const results = await env.DB.batch(statements.slice(i, i + 80));
      saved += results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
    }
    return json({ ok:true, received:items.length, saved_or_refreshed:saved, skipped, note:"Public business prospects only; every new row remains unreviewed. No confirmed buyer, outreach, quote, order or commitment was created." });
  }

  if (url.pathname === "/api/buyer-prospects/convert-buyer" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const id = Math.floor(Number(body.id) || 0);
    if (!id) return json({ ok:false, error:"A valid buyer prospect id is required." }, 400);
    const prospect = await env.DB.prepare(
      "SELECT id,business_name,address,website,phone,discovery_city,discovery_query,review_status,owner_notes,linked_buyer_id FROM buyer_prospects WHERE id=? LIMIT 1"
    ).bind(id).first();
    if (!prospect) return json({ ok:false, error:"Buyer prospect not found." }, 404);
    if (prospect.review_status !== "qualified") return json({ ok:false, error:"Owner must mark this prospect Qualified before adding it to the Buyer Center." }, 409);
    if (prospect.linked_buyer_id) return json({ ok:true, id:Number(prospect.linked_buyer_id), existing:true, note:"This prospect is already linked to a buyer record." });
    const name = String(prospect.business_name || "").trim();
    if (!name) return json({ ok:false, error:"Prospect has no verified business name; review the source first." }, 409);
    const duplicate = await env.DB.prepare(
      "SELECT id FROM buyers WHERE lower(name)=lower(?) AND lower(country)='pakistan' LIMIT 1"
    ).bind(name).first();
    if (duplicate) {
      await env.DB.prepare("UPDATE buyer_prospects SET linked_buyer_id=? WHERE id=? AND linked_buyer_id IS NULL").bind(duplicate.id,id).run();
      return json({ ok:true, id:Number(duplicate.id), existing:true, note:"Existing Pakistan buyer record linked; no duplicate created." });
    }
    const rawCity = String(prospect.discovery_city || "").trim();
    const city = rawCity && !/^unverified/i.test(rawCity) ? rawCity : "Unverified";
    const notes = [
      "Owner-qualified public buyer prospect; buyer identity/contact and purchasing intent still require direct verification.",
      prospect.website ? "Public source: " + prospect.website : "",
      prospect.address ? "Listed address: " + prospect.address : "",
      prospect.discovery_query ? "Discovery query: " + prospect.discovery_query : "",
      prospect.owner_notes ? "Owner review: " + prospect.owner_notes : "",
      "Do not treat as an active customer or send outreach until contact and buying interest are verified."
    ].filter(Boolean).join(" | ").slice(0,2000);
    const inserted = await env.DB.prepare(
      "INSERT INTO buyers (name,phone,whatsapp,email,city,country,company,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))"
    ).bind(name,String(prospect.phone || ""),"","",city,"Pakistan",name,"pending",notes).run();
    const buyerId = Number(inserted.meta?.last_row_id || 0);
    if (!buyerId) return json({ ok:false, error:"Buyer insert did not return a record id." }, 500);
    await env.DB.prepare("UPDATE buyer_prospects SET linked_buyer_id=? WHERE id=? AND linked_buyer_id IS NULL").bind(buyerId,id).run();
    return json({ ok:true, id:buyerId, existing:false, status:"pending", note:"Added to Buyer Center as pending verification. No requirement, message, quote, order or commitment was created." }, 201);
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



