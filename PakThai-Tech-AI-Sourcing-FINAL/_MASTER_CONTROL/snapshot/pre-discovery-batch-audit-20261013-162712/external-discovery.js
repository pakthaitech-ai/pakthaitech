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
    country TEXT
  )`).run();
  try { await db.prepare("ALTER TABLE external_prospects ADD COLUMN country TEXT").run(); } catch (_) {}
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
      "SELECT id,prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,owner_notes,first_seen_at,last_seen_at,country FROM external_prospects WHERE (?='' OR review_status=?) AND (?='' OR prospect_type=?) AND (?='' OR country=?) ORDER BY last_seen_at DESC LIMIT 300"
    ).bind(status,status,type,type,country,country).all();
    return json({ ok: true, prospects: rows.results || [] });
  }

  if (url.pathname === "/api/external-prospects/import" && request.method === "POST") {
    let body = {};
    try { body = await request.json(); } catch {}
    const items = Array.isArray(body.prospects) ? body.prospects.slice(0, 100) : [];
    if (!items.length) return json({ ok:false, error:"prospects array required (max 100 per import)." }, 400);
    let saved = 0, skipped = 0;
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
      await env.DB.prepare(`INSERT INTO external_prospects
        (prospect_type,source_engine,title,url,domain,snippet,search_query,review_status,first_seen_at,last_seen_at,country)
        VALUES(?,?,?,?,?,?,?,'unreviewed',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?)
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,domain=excluded.domain,snippet=excluded.snippet,search_query=excluded.search_query,country=COALESCE(excluded.country,external_prospects.country),last_seen_at=CURRENT_TIMESTAMP`
      ).bind(type, String(item.source_engine || "openserp").slice(0, 40), title, target, domain, snippet, query, String(item.country || "").slice(0, 80) || null).run();
      saved++;
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
