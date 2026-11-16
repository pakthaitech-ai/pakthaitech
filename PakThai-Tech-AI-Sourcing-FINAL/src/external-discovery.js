// PAKTHAI TECH - free self-hosted web-search prospect intake.
// Search results are prospects only; this module never creates confirmed buyers/sellers or sends outreach.
import { getSession } from "./auth-session.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});

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
    country TEXT,
    linked_seller_id INTEGER
  )`).run();
  try { await db.prepare("ALTER TABLE external_prospects ADD COLUMN country TEXT").run(); } catch (_) {}
  try { await db.prepare("ALTER TABLE external_prospects ADD COLUMN linked_seller_id INTEGER").run(); } catch (_) {}
  await db.prepare("UPDATE external_prospects SET country='Thailand' WHERE (country IS NULL OR country='') AND search_query LIKE '%Thailand%'").run();
  await db.prepare("UPDATE external_prospects SET country='South Korea' WHERE (country IS NULL OR country='') AND search_query LIKE '%South Korea%'").run();
}

export async function handleExternalDiscoveryRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/external-prospects")) return null;
  if (request.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type,Authorization", "Cache-Control": "no-store" } });
  // Worker session authorization plus Owner role; no second secret to configure or lose.
  const session = await getSession(request, env);
  if (session?.role !== "owner") return json({ ok:false, error:"Owner login required for prospect management." }, 403);

  await ensureSchema(env.DB);
  if (url.pathname === "/api/external-prospects" && request.method === "GET") {
    const status = String(url.searchParams.get("status") || "").trim();
    const type = String(url.searchParams.get("type") || "").trim();
    const country = String(url.searchParams.get("country") || "").trim();
    const rows = await env.DB.prepare(
      "SELECT id,prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,owner_notes,first_seen_at,last_seen_at,country,linked_seller_id FROM external_prospects WHERE (?='' OR review_status=?) AND (?='' OR prospect_type=?) AND (?='' OR country=?) ORDER BY last_seen_at DESC LIMIT 300"
    ).bind(status,status,type,type,country,country).all();
    return json({ ok: true, prospects: rows.results || [] });
  }

  if (url.pathname === "/api/external-prospects/convert-seller" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const id = Math.floor(Number(body.id) || 0);
    if (!id) return json({ ok:false, error:"A valid prospect id is required." }, 400);
    const prospect = await env.DB.prepare("SELECT id,prospect_type,title,url,domain,snippet,search_query,review_status,owner_notes,country,linked_seller_id FROM external_prospects WHERE id=? LIMIT 1").bind(id).first();
    if (!prospect) return json({ ok:false, error:"Prospect not found." }, 404);
    if (prospect.prospect_type !== "seller") return json({ ok:false, error:"Only seller prospects can be added to the seller database." }, 409);
    if (prospect.review_status !== "qualified") return json({ ok:false, error:"Owner must mark this prospect Qualified before adding it to the seller database." }, 409);
    if (!prospect.country || !["Thailand","South Korea","Pakistan"].includes(prospect.country)) return json({ ok:false, error:"Prospect country is missing or unsupported; review the source before conversion." }, 409);
    if (prospect.linked_seller_id) return json({ ok:true, id:prospect.linked_seller_id, existing:true, note:"This prospect is already linked to a seller record." });
    const duplicate = await env.DB.prepare("SELECT id FROM sellers WHERE name=? AND country=? LIMIT 1").bind(prospect.title, prospect.country).first();
    if (duplicate) {
      await env.DB.prepare("UPDATE external_prospects SET linked_seller_id=? WHERE id=?").bind(duplicate.id,id).run();
      return json({ ok:true, id:duplicate.id, existing:true, note:"Existing seller record linked; no duplicate created." });
    }
    const notes = ["Owner-qualified public prospect; not a verified supplier yet.", "Source: " + prospect.url, prospect.snippet || "", prospect.owner_notes ? "Owner review: " + prospect.owner_notes : "", "Verify business identity, contact, stock, asking price, and trade/export terms before negotiation or purchase."].filter(Boolean).join(" | ").slice(0,2000);
    const inserted = await env.DB.prepare("INSERT INTO sellers(name,contact,country,city,location_text,platform,seller_type,status,reliability_score,response_speed,notes) VALUES(?,NULL,?,NULL,?,?, 'supplier','pending',0,NULL,?)").bind(prospect.title,prospect.country,prospect.domain || null,prospect.url,notes).run();
    const sellerId = Number(inserted.meta?.last_row_id || 0);
    if (!sellerId) return json({ ok:false, error:"Seller insert did not return a record id." }, 500);
    await env.DB.prepare("UPDATE external_prospects SET linked_seller_id=? WHERE id=? AND linked_seller_id IS NULL").bind(sellerId,id).run();
    return json({ ok:true, id:sellerId, existing:false, status:"pending", note:"Added to Seller Database as pending verification. No outreach, price quote, order, or purchase was created." }, 201);
  }

  if (url.pathname === "/api/external-prospects/import" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const items = Array.isArray(body.prospects) ? body.prospects.slice(0, 100) : [];
    if (!items.length) return json({ ok:false, error:"prospects array required (max 100 per import)." }, 400);
    let saved = 0, skipped = 0;
    const statements = [];
    for (const item of items) {
      const title = String(item.title || "").trim().slice(0, 300);
      const target = String(item.url || "").trim();
      let parsed;
      try { parsed = new URL(target); } catch { skipped++; continue; }
      if (!title || !["http:","https:"].includes(parsed.protocol)) { skipped++; continue; }
      const type = String(item.prospect_type || "seller") === "buyer" ? "buyer" : "seller";
      const domain = String(item.domain || parsed.hostname).slice(0, 200);
      const snippet = String(item.snippet || "").slice(0, 1500);
      const query = String(item.search_query || "").slice(0, 300);
      statements.push(env.DB.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at,country)
        VALUES(?,?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,country=COALESCE(excluded.country,external_prospects.country),last_seen_at=CURRENT_TIMESTAMP`
      ).bind(type, String(item.source_engine || "openserp").slice(0, 40), title, target, domain, snippet, query, String(item.country || "").slice(0, 80) || null));
    }
    for (let i = 0; i < statements.length; i += 80) {
      const results = await env.DB.batch(statements.slice(i, i + 80));
      saved += results.reduce((count, result) => count + (Number(result?.meta?.changes || 0) > 0 ? 1 : 0), 0);
    }
    return json({ ok:true, received:items.length, saved_or_refreshed:saved, skipped, note:"Prospects are unverified. No buyer/seller records, requirements, quotations, orders or outreach were created." });
  }

  if (url.pathname === "/api/external-prospects/review" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const id = Number(body.id) || 0;
    const status = String(body.review_status || "");
    if (!id || !["unreviewed","contact_to_verify","qualified","not_a_fit"].includes(status)) return json({ ok:false, error:"Valid id and review_status required." }, 400);
    await env.DB.prepare("UPDATE external_prospects SET review_status=?,owner_notes=?,last_seen_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(status, String(body.owner_notes || "").slice(0, 1000), id).run();
    return json({ ok:true, id, review_status:status });
  }
  return json({ ok:false, error:"Route or method not found." }, 404);
}
