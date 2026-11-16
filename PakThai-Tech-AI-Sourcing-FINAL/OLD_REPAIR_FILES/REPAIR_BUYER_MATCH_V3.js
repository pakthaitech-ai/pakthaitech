const fs = require("fs");

const file = "src/worker.js";
const backup = `src/worker.js.bak-v3-${Date.now()}`;

if (!fs.existsSync(file)) {
  console.error("ERROR: src/worker.js not found.");
  process.exit(1);
}

const src = fs.readFileSync(file, "utf8");
fs.copyFileSync(file, backup);

const startMarker = 'if (u.pathname === "/api/buyer-match/run" && request.method === "POST") {';
const start = src.indexOf(startMarker);

if (start < 0) {
  console.error("ERROR: V2 buyer-match route not found.");
  console.error("Backup was created:", backup);
  process.exit(1);
}

// Find the matching closing brace for this if-block.
let depth = 0;
let inString = null;
let escaped = false;
let end = -1;

for (let i = start; i < src.length; i++) {
  const ch = src[i];

  if (inString) {
    if (escaped) escaped = false;
    else if (ch === "\\") escaped = true;
    else if (ch === inString) inString = null;
    continue;
  }

  if (ch === '"' || ch === "'" || ch === "`") {
    inString = ch;
    continue;
  }

  if (ch === "{") depth++;
  else if (ch === "}") {
    depth--;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
}

if (end < 0) {
  console.error("ERROR: Could not locate end of buyer-match route.");
  console.error("Backup was created:", backup);
  process.exit(1);
}

const replacement = String.raw`if (u.pathname === "/api/buyer-match/run" && request.method === "POST") {
  const qs = (await env.DB.prepare(
    "SELECT * FROM buyer_requirements WHERE status IN ('active','new') ORDER BY id DESC"
  ).all()).results || [];

  let created = 0;
  let matchedProducts = 0;
  let duplicatesSkipped = 0;
  let skippedKeyword = 0;

  for (const q of qs) {
    const k = String(q.product_keyword || "").trim().toLowerCase();
    if (!k) {
      skippedKeyword++;
      continue;
    }

    const ps = (await env.DB.prepare(
      "SELECT id, title, price_pkr FROM products WHERE sourcing_enabled=1 AND lower(title) LIKE ? ORDER BY id DESC LIMIT 50"
    ).bind("%" + k + "%").all()).results || [];

    if (ps.length) matchedProducts += ps.length;

    for (const p of ps) {
      const old = await env.DB.prepare(
        "SELECT id FROM buyer_matches WHERE buyer_id=? AND requirement_id=? AND product_id=? LIMIT 1"
      ).bind(q.buyer_id, q.id, p.id).first();

      if (old) {
        duplicatesSkipped++;
        continue;
      }

      await env.DB.prepare(
        "INSERT INTO buyer_matches (buyer_id,requirement_id,product_id,seller_id,match_status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime('now'),datetime('now'))"
      ).bind(
        q.buyer_id,
        q.id,
        p.id,
        null,
        "matched",
        "Automatic product match - seller selection pending"
      ).run();

      created++;
    }
  }

  return json({
    ok: true,
    created,
    processed_requirements: qs.length,
    matched_products: matchedProducts,
    duplicates_skipped: duplicatesSkipped,
    skipped_keyword: skippedKeyword,
    budget_check: "deferred_to_seller_opportunity_stage"
  });
}`;

const out = src.slice(0, start) + replacement + src.slice(end);
fs.writeFileSync(file, out, "utf8");

console.log("BUYER MATCH V3 PATCH APPLIED");
console.log("Backup:", backup);
