// Owner-managed, non-binding lead/deal board for the Thailand and South Korea markets.
// It stores no quote, payment, order, stock promise, or outbound message.
import { getSession } from "./auth-session.js";

const COUNTRIES = { Thailand: "THB", "South Korea": "KRW" };
const STAGES = ["lead_review", "qualified", "pricing_required", "draft_quote", "closed_won", "closed_lost"];
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS market_deals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country TEXT NOT NULL,
    direction TEXT NOT NULL,
    prospect_id INTEGER NOT NULL,
    item_description TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    currency TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'lead_review',
    owner_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function ownerSession(request, env) {
  const session = await getSession(request, env);
  return session?.role === "owner";
}

export async function handleMarketDealsRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/market-deals")) return null;
  if (!(await ownerSession(request, env))) return json({ ok: false, error: "Owner login required for market deal management." }, 403);
  await ensureSchema(env.DB);

  if (url.pathname === "/api/market-deals" && request.method === "GET") {
    const country = String(url.searchParams.get("country") || "").trim();
    const rows = await env.DB.prepare(`SELECT d.*,p.title AS prospect_name,p.prospect_type,p.review_status AS prospect_review_status,p.snippet
      FROM market_deals d JOIN external_prospects p ON p.id=d.prospect_id
      WHERE (?='' OR d.country=?) ORDER BY d.updated_at DESC,d.id DESC LIMIT 300`).bind(country,country).all();
    return json({ ok: true, deals: rows.results || [], note: "Internal draft pipeline only; no contact, quote, order, or payment was sent." });
  }

  if (url.pathname === "/api/market-deals" && request.method === "POST") {
    let body = {}; try { body = await request.json(); } catch (_) {}
    const country = String(body.country || "").trim();
    const direction = String(body.direction || "").trim();
    const prospectId = Math.floor(Number(body.prospect_id) || 0);
    const item = String(body.item_description || "").trim().slice(0, 300);
    const quantity = Math.max(1, Math.min(100000, Math.floor(Number(body.quantity) || 1)));
    const ownerNotes = String(body.owner_notes || "").trim().slice(0, 1000);
    if (!COUNTRIES[country] || !["sell_to_market", "source_from_market"].includes(direction) || !prospectId || !item) return json({ ok: false, error: "Country, direction, qualified prospect, item description and quantity are required." }, 400);
    const prospectType = direction === "sell_to_market" ? "buyer" : "seller";
    const prospect = await env.DB.prepare("SELECT id,prospect_type,country,review_status FROM external_prospects WHERE id=? LIMIT 1").bind(prospectId).first();
    if (!prospect || prospect.prospect_type !== prospectType || prospect.country !== country) return json({ ok: false, error: "Choose a prospect with the matching country and trade direction." }, 400);
    if (prospect.review_status !== "qualified") return json({ ok: false, error: "Only owner-qualified prospects can enter the deal pipeline." }, 409);
    const result = await env.DB.prepare(`INSERT INTO market_deals(country,direction,prospect_id,item_description,quantity,currency,stage,owner_notes)
      VALUES(?,?,?,?,?,?, 'pricing_required', ?)`)
      .bind(country,direction,prospectId,item,quantity,COUNTRIES[country],ownerNotes).run();
    return json({ ok: true, id: result.meta?.last_row_id, country, direction, currency: COUNTRIES[country], stage: "pricing_required", note: "Draft pipeline entry created. Configure verified FX, export/import landed costs and shipping before preparing any quote." }, 201);
  }

  if (url.pathname === "/api/market-deals/review" && request.method === "POST") {
    let body = {}; try { body = await request.json(); } catch (_) {}
    const id = Math.floor(Number(body.id) || 0), stage = String(body.stage || "");
    if (!id || !STAGES.includes(stage)) return json({ ok: false, error: "Valid deal ID and stage are required." }, 400);
    await env.DB.prepare("UPDATE market_deals SET stage=?,owner_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(stage,String(body.owner_notes || "").trim().slice(0,1000),id).run();
    return json({ ok: true, id, stage });
  }
  return json({ ok: false, error: "Route or method not found." }, 404);
}
