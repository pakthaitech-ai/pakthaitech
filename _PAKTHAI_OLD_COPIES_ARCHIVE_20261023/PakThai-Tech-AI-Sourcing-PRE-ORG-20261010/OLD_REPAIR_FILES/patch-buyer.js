const fs = require("fs");
const path = require("path");

const file = path.join(process.cwd(), "src", "worker.js");
const backup = path.join(process.cwd(), "src", "worker.backup-before-buyer-api.js");

let s = fs.readFileSync(file, "utf8");

if (s.includes("handleMasterBuyerApi")) {
  console.log("BUYER API ALREADY EXISTS");
  process.exit(0);
}

fs.copyFileSync(file, backup);

const fn = [
'async function handleMasterBuyerApi(request, env) {',
'  const u = new URL(request.url);',
'',
'  if (u.pathname === "/api/buyers" && request.method === "GET") {',
'    const r = await env.DB.prepare("SELECT * FROM buyers ORDER BY id DESC").all();',
'    return json({ ok: true, buyers: r.results || [] });',
'  }',
'',
'  if (u.pathname === "/api/buyers" && request.method === "POST") {',
'    const x = await request.json();',
'    const name = String(x.name || "").trim();',
'    if (!name) return json({ error: "Buyer name is required" }, 400);',
'    const r = await env.DB.prepare("INSERT INTO buyers (name,phone,whatsapp,email,city,country,company,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime(\\"now\\"),datetime(\\"now\\"))").bind(name,String(x.phone||""),String(x.whatsapp||""),String(x.email||""),String(x.city||"Pakistan"),String(x.country||"Pakistan"),String(x.company||""),String(x.status||"active"),String(x.notes||"")).run();',
'    return json({ ok: true, id: r.meta.last_row_id });',
'  }',
'',
'  if (u.pathname === "/api/buyer-requirements" && request.method === "GET") {',
'    const r = await env.DB.prepare("SELECT br.*, b.name AS buyer_name FROM buyer_requirements br JOIN buyers b ON b.id=br.buyer_id ORDER BY br.id DESC").all();',
'    return json({ ok: true, requirements: r.results || [] });',
'  }',
'',
'  if (u.pathname === "/api/buyer-requirements" && request.method === "POST") {',
'    const x = await request.json();',
'    const buyerId = Number(x.buyer_id);',
'    if (!buyerId) return json({ error: "buyer_id is required" }, 400);',
'    const now = new Date().toISOString();',
'    const r = await env.DB.prepare("INSERT INTO buyer_requirements (buyer_id,product_keyword,quantity,max_budget_pkr,target_price_pkr,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(buyerId,String(x.product_keyword||""),Math.max(1,Number(x.quantity)||1),Number(x.max_budget_pkr)||0,Number(x.target_price_pkr)||0,String(x.notes||""),"active",now,now).run();',
'    return json({ ok: true, id: r.meta.last_row_id });',
'  }',
'',
'  if (u.pathname === "/api/buyer-matches" && request.method === "GET") {',
'    const r = await env.DB.prepare("SELECT bm.*,b.name AS buyer_name,p.title AS product_title,p.price_pkr,s.name AS seller_name FROM buyer_matches bm JOIN buyers b ON b.id=bm.buyer_id JOIN products p ON p.id=bm.product_id LEFT JOIN sellers s ON s.id=bm.seller_id ORDER BY bm.id DESC").all();',
'    return json({ ok: true, matches: r.results || [] });',
'  }',
'',
'  if (u.pathname === "/api/buyer-match/run" && request.method === "POST") {',
'    const qs = (await env.DB.prepare("SELECT * FROM buyer_requirements WHERE status=\\"active\\"").all()).results || [];',
'    let created = 0;',
'    for (const q of qs) {',
'      const k = String(q.product_keyword || "").trim().toLowerCase();',
'      if (!k) continue;',
'      const ps = (await env.DB.prepare("SELECT id FROM products WHERE lower(title) LIKE ? LIMIT 20").bind("%" + k + "%").all()).results || [];',
'      for (const p of ps) {',
'        const old = await env.DB.prepare("SELECT id FROM buyer_matches WHERE buyer_id=? AND requirement_id=? AND product_id=? LIMIT 1").bind(q.buyer_id,q.id,p.id).first();',
'        if (old) continue;',
'        await env.DB.prepare("INSERT INTO buyer_matches (buyer_id,requirement_id,product_id,seller_id,match_status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime(\\"now\\"),datetime(\\"now\\"))").bind(q.buyer_id,q.id,p.id,null,"matched","Automatic product match - seller selection pending").run();',
'        created++;',
'      }',
'    }',
'    return json({ ok: true, created });',
'  }',
'',
'  return json({ error: "Master Buyer API route not found" }, 404);',
'}'
].join("\n");

s = s.replace("export default {", fn + "\n\nexport default {");

const marker = 'if (url.pathname.startsWith("/api/")) return await handleApi(request, env);';

if (!s.includes(marker)) {
  throw new Error("Existing API route marker not found");
}

const replacement =
'if (url.pathname.startsWith("/api/buyers") || url.pathname.startsWith("/api/buyer-requirements") || url.pathname.startsWith("/api/buyer-matches") || url.pathname.startsWith("/api/buyer-match/")) return await handleMasterBuyerApi(request, env);\n      ' +
marker;

s = s.replace(marker, replacement);

fs.writeFileSync(file, s, "utf8");

console.log("");
console.log("==============================================");
console.log("PAKTHAI TECH BUYER API PATCH SUCCESS");
console.log("==============================================");
console.log("Backup: " + backup);
console.log("Worker: " + file);
console.log("Worker bytes: " + fs.statSync(file).size);
console.log("==============================================");
