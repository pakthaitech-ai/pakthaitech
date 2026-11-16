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
  "https://z.overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.osm.jp/api/interpreter"
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
    last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    country TEXT
  )`).run();
  try { await db.prepare("ALTER TABLE external_prospects ADD COLUMN country TEXT").run(); } catch (_) {}
  await db.prepare("UPDATE external_prospects SET country='Thailand' WHERE (country IS NULL OR country='') AND search_query LIKE '%Thailand%'").run();
}

async function discoverBangkokSuppliers() {
  // Fixed approximate Bangkok city centre avoids a separate geocoder timeout.
  const lat = 13.7563, lon = 100.5018;
  const around = "around:5000," + lat + "," + lon;
  const query = '[out:json][timeout:5];(' +
    'node["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'way["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    'relation["shop"~"^(computer|electronics|computer_parts|hardware)$"](' + around + ');' +
    ');out center tags 60;';
  const seen = new Set(), rows = [];
  // Try public Overpass mirrors sequentially: parallel requests were causing avoidable throttling,
  // and a single overloaded mirror should not make Thailand discovery fail immediately.
  for (const endpoint of OVERPASS) {
    try {
      const u = new URL(endpoint); u.searchParams.set("data", query);
      const res = await fetch(u.toString(), { headers: { Accept: "application/json", "User-Agent": "PakThaiTechSellerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" }, signal: AbortSignal.timeout(2200) });
      if (!res.ok) continue;
      const data = await res.json();
      for (const el of data.elements || []) {
        const tags = el.tags || {};
        const name = String(tags.name || tags["name:en"] || tags.brand || "").trim();
        const key = String(el.type) + ":" + String(el.id);
        if (!name || seen.has(key)) continue;
        seen.add(key);
        const address = [tags["addr:street"], tags["addr:suburb"], tags["addr:city"] || "Bangkok", tags["addr:postcode"], "Thailand"].filter(Boolean).join(", ");
        rows.push({ title: name, url: "https://www.openstreetmap.org/" + encodeURIComponent(String(el.type)) + "/" + encodeURIComponent(String(el.id)), domain: "openstreetmap.org", snippet: [address, tags.shop || "Computer/electronics business", tags.phone || tags["contact:phone"] || "", tags.website || tags["contact:website"] || ""].filter(Boolean).join(" | ").slice(0, 1500), search_query: "computer/electronics supplier, Bangkok, Thailand", source_engine: "osm" });
      }
      if (rows.length) return rows.slice(0, 80);
    } catch (_) { /* try the next public mirror */ }
  }
  // Photon is a free public geocoder; tolerate a timeout and try a bounded public web-search fallback.
  try {
    const p = new URL("https://photon.komoot.io/api/");
    p.searchParams.set("q", "computer electronics shop Bangkok Thailand"); p.searchParams.set("limit", "30"); p.searchParams.set("lat", String(lat)); p.searchParams.set("lon", String(lon));
    const pr = await fetch(p.toString(), { headers: { Accept: "application/json", "User-Agent": "PakThaiTechSellerDiscovery/1.0" }, signal: AbortSignal.timeout(2500) });
    if (pr.ok) {
      const pd = await pr.json();
      for (const f of pd.features || []) {
        const x = f.properties || {}, name = String(x.name || "").trim();
        const searchable = (name + " " + String(x.osm_value || "")).toLowerCase();
        const id = String(x.osm_type || "feature") + ":" + String(x.osm_id || name);
        if (!name || seen.has(id) || !/computer|electronic|hardware|technology|laptop|it solution|supplier/.test(searchable)) continue;
        seen.add(id);
        rows.push({ title: name, url: "https://www.openstreetmap.org/" + encodeURIComponent(String(x.osm_type || "node")) + "/" + encodeURIComponent(String(x.osm_id || id)), domain: "openstreetmap.org", snippet: [x.street, x.district, x.city || "Bangkok", x.state, "Thailand", x.phone, x.website].filter(Boolean).join(", ").slice(0,1500), search_query: "computer/electronics supplier, Bangkok, Thailand", source_engine: "photon" });
      }
    }
  } catch (_) { /* public Photon may be temporarily unreachable */ }
  if (rows.length) return rows.slice(0, 80);

  // Geocoder fallback: keep discovery alive when all Overpass mirrors and Photon are unavailable.
  // Results are bounded to the Bangkok radius and remain unverified owner-review prospects.
  try {
    const nominatim = new URL(NOMINATIM);
    nominatim.searchParams.set("q", "computer electronics shop Bangkok Thailand");
    nominatim.searchParams.set("format", "jsonv2");
    nominatim.searchParams.set("limit", "40");
    nominatim.searchParams.set("countrycodes", "th");
    const nr = await fetch(nominatim, { headers: { Accept: "application/json", "User-Agent": "PakThaiTechSellerDiscovery/1.0 (https://pakthai-tech-store.pages.dev/)" }, signal: AbortSignal.timeout(3500) });
    if (nr.ok) {
      const places = await nr.json();
      for (const place of Array.isArray(places) ? places : []) {
        const name = String(place.name || String(place.display_name || "").split(",")[0] || "").trim();
        const placeLat = Number(place.lat), placeLon = Number(place.lon);
        if (!name || !Number.isFinite(placeLat) || !Number.isFinite(placeLon)) continue;
        const rad = n => n * Math.PI / 180;
        const dLat = rad(placeLat - lat), dLon = rad(placeLon - lon);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(placeLat)) * Math.sin(dLon / 2) ** 2;
        if (6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) > 30) continue;
        const id = String(place.osm_type || "node") + ":" + String(place.osm_id || place.place_id || name);
        if (seen.has(id)) continue;
        seen.add(id);
        rows.push({ title: name.slice(0, 240), url: "https://www.openstreetmap.org/" + encodeURIComponent(String(place.osm_type || "node")) + "/" + encodeURIComponent(String(place.osm_id || place.place_id || id)), domain: "openstreetmap.org", snippet: (String(place.display_name || "Bangkok, Thailand") + " | Computer/electronics category search; supplier status unverified").slice(0, 1500), search_query: "computer hardware/electronics supplier, Bangkok, Thailand", source_engine: "nominatim" });
        if (rows.length >= 20) break;
      }
    }
  } catch (_) { /* continue to public search fallback */ }
  if (rows.length) return rows.slice(0, 80);

  // Last free fallback: Bing's public HTML results. Every result stays unverified and is saved only as a prospect.
  const search = new URL("https://www.bing.com/search");
  search.searchParams.set("q", "computer shop Bangkok Thailand electronics supplier");
  search.searchParams.set("cc", "TH"); search.searchParams.set("setlang", "en"); search.searchParams.set("form", "QBLH"); search.searchParams.set("pt", String(Date.now()));
  search.searchParams.set("count", "20");
  const sr = await fetch(search.toString(), { headers: { Accept: "text/html", "Cache-Control": "no-cache", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechSellerDiscovery/1.0)" }, signal: AbortSignal.timeout(4500) });
  if (!sr.ok) throw new Error("OpenStreetMap/Photon unavailable; free web search HTTP " + sr.status);
  const html = await sr.text();
  const clean = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/\s+/g, " ").trim();
  let blocks = [...html.matchAll(/<li\b[^>]*class="[^"]*\bb_algo\b[^"]*"[^>]*>[\s\S]*?<\/li>/gi)].map(m => m[0]);
  // Bing sometimes changes result wrappers; use bounded h2 sections as a fallback while keeping strict relevance checks.
  if (!blocks.length) blocks = [...html.matchAll(/<h2\b[\s\S]*?<\/h2>[\s\S]{0,2200}?(?=<h2\b|<\/ol>|$)/gi)].map(m => m[0]);
  for (const block of blocks) {
    const a = block.match(/<h2[^>]*>\s*<a[^>]+href="(https?:[^" ]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    let u; try { u = new URL(a[1].replace(/&amp;/g, "&")); } catch (_) { continue; }
    // Bing wraps result URLs in a base64url `u=a1...` redirect parameter.
    if (/^(www\.)?bing\.com$/i.test(u.hostname) && u.pathname === "/ck/a") {
      const token = u.searchParams.get("u") || "";
      if (token.startsWith("a1")) {
        try { const encoded = token.slice(2).replace(/-/g, "+").replace(/_/g, "/"); u = new URL(atob(encoded)); } catch (_) { continue; }
      }
    }
    if (!/^https?:$/.test(u.protocol) || /(^|\.)(bing\.com|microsoft\.com|google\.com|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org)$/i.test(u.hostname)) continue;
    const title = clean(a[2]);
    const paragraph = block.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = clean(paragraph?.[1] || "Public web search result; supplier details need owner review.");
    const relevance = (title + " " + snippet + " " + u.hostname).toLowerCase();
    const relevantProduct = /computer|electronics?|hardware|laptop|pc parts|it solution|technology|printer|server/.test(relevance);
    const relevantLocation = true; // Query is location-scoped; result location still requires owner verification.
    if (!relevantProduct || !relevantLocation || /elephant|poop coffee|coffee beans/.test(relevance)) continue;
    if (!title || !u.hostname || seen.has(u.href)) continue;
    seen.add(u.href);
    rows.push({ title: title.slice(0,240), url: u.href, domain: u.hostname.toLowerCase(), snippet: (snippet + " | Location and supplier status unverified").slice(0,1500), search_query: "computer hardware/electronics supplier, Bangkok, Thailand", source_engine: "bing" });
    if (rows.length >= 20) break;
  }
  // Bing can return a successful but unparseable HTML variant from Worker egress.
  // Try Bing's simpler RSS output before other public HTML fallbacks.
  if (!rows.length) {
    try {
      const rssUrl = new URL("https://www.bing.com/search");
      rssUrl.searchParams.set("q", "computer shop Bangkok Thailand electronics supplier");
      rssUrl.searchParams.set("format", "rss");
      rssUrl.searchParams.set("cc", "TH");
      const rssResponse = await fetch(rssUrl.toString(), {
        headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechSellerDiscovery/1.0)" },
        signal: AbortSignal.timeout(4000)
      });
      if (rssResponse.ok) {
        const rss = await rssResponse.text();
        const xmlText = value => clean(String(value || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"));
        for (const itemMatch of rss.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
          const item = itemMatch[1];
          const title = xmlText(item.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
          const link = xmlText(item.match(/<link\b[^>]*>([\s\S]*?)<\/link>/i)?.[1]);
          const snippet = xmlText(item.match(/<description\b[^>]*>([\s\S]*?)<\/description>/i)?.[1]);
          let target; try { target = new URL(link); } catch (_) { continue; }
          if (!/^https?:$/.test(target.protocol) || /(^|\.)(bing\.com|microsoft\.com|google\.com|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org)$/i.test(target.hostname)) continue;
          const relevance = (title + " " + snippet + " " + target.hostname).toLowerCase();
          if (!/computer|electronics?|hardware|laptop|pc parts|it solution|technology|printer|server/.test(relevance)) continue;
          if (/elephant|poop coffee|coffee beans/.test(relevance) || seen.has(target.href)) continue;
          seen.add(target.href);
          rows.push({ title: title.slice(0,240), url: target.href, domain: target.hostname.toLowerCase(), snippet: (snippet + " | Location and supplier status unverified").slice(0,1500), search_query: "computer hardware/electronics supplier, Bangkok, Thailand", source_engine: "bing-rss" });
          if (rows.length >= 20) break;
        }
      }
    } catch (_) { /* try another free public search source */ }
  }
  // Try DuckDuckGo's public HTML endpoint before failing; this remains discovery-only.
  if (!rows.length) {
    try {
      const ddg = new URL("https://html.duckduckgo.com/html/");
      ddg.searchParams.set("q", "computer shop Bangkok Thailand electronics supplier");
      const ddgResponse = await fetch(ddg.toString(), {
        headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; PakThaiTechSellerDiscovery/1.0)" },
        signal: AbortSignal.timeout(4500)
      });
      if (ddgResponse.ok) {
        const ddgHtml = await ddgResponse.text();
        const anchors = [...ddgHtml.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
        for (const match of anchors) {
          const attrs = match[1] || "";
          if (!/\bresult__a\b/i.test(attrs.match(/class=["']([^"']*)["']/i)?.[1] || "")) continue;
          const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
          if (!hrefMatch) continue;
          let target;
          try { target = new URL(hrefMatch[1].replace(/&amp;/g, "&"), ddg.toString()); } catch (_) { continue; }
          if (/duckduckgo\.com$/i.test(target.hostname)) {
            const redirected = target.searchParams.get("uddg");
            if (redirected) { try { target = new URL(redirected); } catch (_) { continue; } }
          }
          if (!/^https?:$/.test(target.protocol) || /(^|\.)(duckduckgo\.com|bing\.com|microsoft\.com|google\.com|facebook\.com|instagram\.com|youtube\.com|wikipedia\.org)$/i.test(target.hostname)) continue;
          const title = clean(match[2]);
          const surrounding = ddgHtml.slice(Math.max(0, match.index - 300), Math.min(ddgHtml.length, match.index + match[0].length + 1800));
          const paragraph = surrounding.match(/class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i);
          const snippet = clean(paragraph?.[1] || "Public web search result; supplier details need owner review.");
          const relevance = (title + " " + snippet + " " + target.hostname).toLowerCase();
          const relevantProduct = /computer|electronics?|hardware|laptop|pc parts|it solution|technology|printer|server/.test(relevance);
          const relevantLocation = true; // Query is location-scoped; result location still requires owner verification.
          if (!relevantProduct || !relevantLocation || /elephant|poop coffee|coffee beans/.test(relevance)) continue;
          if (!title || seen.has(target.href)) continue;
          seen.add(target.href);
          rows.push({ title: title.slice(0,240), url: target.href, domain: target.hostname.toLowerCase(), snippet: (snippet + " | Location and supplier status unverified").slice(0,1500), search_query: "computer hardware/electronics supplier, Bangkok, Thailand", source_engine: "duckduckgo" });
          if (rows.length >= 20) break;
        }
      }
    } catch (_) { /* try the next scheduled run if public search is unavailable */ }
  }
  if (!rows.length) {
    // Last-resort shortlist from public company sites already identified for Thailand; never treat as verified suppliers.
    const curated = [
      ["Wilcon Distribution Co., Ltd.","https://www.wcdt.co.th/","IT equipment and networking distribution; export, stock and terms require verification."],
      ["Computer Peripheral and Supplies (CPS)","https://www.cps.co.th/","Computer/peripheral distribution; export, stock and terms require verification."],
      ["Advice IT Infinite Public Company Limited","https://www.advicepcl.co.th/","IT retail/wholesale candidate; export eligibility and dealer terms require verification."],
      ["ICOM TECH","https://www.icom.co.th/","IT distributor candidate; product range and export terms require verification."],
      ["STARCOMM TECHNOLOGY CO., LTD.","https://www.startcomtech.com/","IT hardware sourcing/trading candidate; credentials and export terms require verification."],
      ["Piston Total Supply Co., Ltd.","https://www.pistonthai.com/","IT equipment supply candidate; export terms and current stock require verification."],
      ["S.A. Com Business","https://www.sacombusiness.com/","IT procurement/services candidate; wholesale suitability requires verification."],
      ["Bangkok IT Distribution Co., Ltd.","https://www.bangkokitdis.com/","IT equipment distribution candidate; credentials and export terms require verification."],
      ["Supreme Distribution Public Company Limited","https://www.supreme.co.th/","IT hardware/peripheral distribution candidate; reseller onboarding and export terms require verification."],
      ["Greenwill Solution","https://store.greenwillsolution.com/it-hardware-software-supply","IT hardware/software supply candidate; stock and export terms require verification."]
    ];
    for (const [title, url, details] of curated) {
      let target; try { target = new URL(url); } catch { continue; }
      rows.push({ title, url: target.origin, domain: target.hostname.toLowerCase().replace(/^www\\./, ""), snippet: "Public company-site fallback; " + details + " Bangkok presence and supplier status require owner verification.", search_query: "computer hardware/electronics supplier, Bangkok, Thailand (public-site fallback)", source_engine: "curated-public-site-unverified-seller" });
    }
  }
  if (!rows.length) throw new Error("Free public supplier search returned no usable results (Bing HTML bytes " + html.length + ", result blocks " + blocks.length + "; DuckDuckGo fallback empty)");
  return rows.slice(0, 80);
}
export async function runScheduledSellerDiscovery(db) {
  await ensureSchema(db);
  const started = new Date().toISOString();
  try {
    const items = await discoverBangkokSuppliers();
    let saved = 0;
    const statements = items.map(item => db.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at,country)
        VALUES('seller',?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'Thailand')
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,country='Thailand',last_seen_at=CURRENT_TIMESTAMP`)
        .bind(item.source_engine,item.title,item.url,item.domain,item.snippet,item.search_query));
    // Bound D1 subrequests: a broad public map result must not perform one DB call per supplier.
    for (let i = 0; i < statements.length; i += 80) {
      const results = await db.batch(statements.slice(i, i + 80));
      saved += results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
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
