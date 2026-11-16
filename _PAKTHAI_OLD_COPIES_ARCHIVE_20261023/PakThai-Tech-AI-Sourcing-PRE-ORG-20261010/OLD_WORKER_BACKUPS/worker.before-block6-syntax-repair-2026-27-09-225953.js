const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type"
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS }
  });

const text = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...CORS }
  });

async function initDb(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT UNIQUE,
      handle TEXT,
      title TEXT NOT NULL,
      description TEXT,
      price_pkr REAL DEFAULT 0,
      compare_at_pkr REAL,
      available INTEGER DEFAULT 1,
      image_url TEXT,
      source_url TEXT,
      category TEXT,
      sourcing_enabled INTEGER DEFAULT 1,
      priority TEXT DEFAULT 'normal',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS zones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      city TEXT NOT NULL,
      radius_km REAL DEFAULT 25,
      enabled INTEGER DEFAULT 1,
      operator_name TEXT DEFAULT 'Owner',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS sellers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      contact TEXT,
      country TEXT,
      city TEXT,
      location_text TEXT,
      platform TEXT,
      seller_type TEXT,
      status TEXT DEFAULT 'active',
      reliability_score REAL DEFAULT 0,
      response_speed TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS seller_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL,
      product_id INTEGER,
      deal_date TEXT,
      quantity INTEGER DEFAULT 1,
      asking_price REAL,
      agreed_price REAL,
      currency TEXT DEFAULT 'PKR',
      outcome TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS opportunities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER,
      seller_id INTEGER,
      zone_id INTEGER,
      quantity INTEGER DEFAULT 1,
      condition TEXT DEFAULT 'used',
      asking_price REAL DEFAULT 0,
      target_price REAL,
      max_buy_price REAL,
      distance_km REAL DEFAULT 0,
      travel_mode TEXT,
      travel_cost REAL DEFAULT 0,
      pickup_cost REAL DEFAULT 0,
      packing_cost REAL DEFAULT 0,
      freight_cost REAL DEFAULT 0,
      duties_cost REAL DEFAULT 0,
      payment_fee REAL DEFAULT 0,
      pakistan_transport_cost REAL DEFAULT 0,
      contingency_cost REAL DEFAULT 0,
      landed_cost REAL DEFAULT 0,
      retail_price_pkr REAL DEFAULT 0,
      target_margin_pct REAL DEFAULT 20,
      expected_profit REAL DEFAULT 0,
      expected_margin_pct REAL DEFAULT 0,
      status TEXT DEFAULT 'new',
      approval_status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )`)
  ]);

  const seeds = [
    ["default_margin_pct", "20"],
    ["small_lot_allowed", "true"],
    ["owner_approval_required", "true"],
    ["customer_store_brand", "PAKTHAI TECH"],
    ["source_adapter", "hidden Shopify source adapter"],
    ["travel_rate", "0"],
    ["pickup_rate", "0"],
    ["packing_rate", "0"],
    ["freight_rate", "0"],
    ["duty_rate", "0"],
    ["payment_fee_rate", "0"],
    ["pakistan_transport_rate", "0"],
    ["contingency_rate", "0"]
  ];

  for (const [key, value] of seeds) {
    await db.prepare(
      `INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`
    ).bind(key, value).run();
  }

  const zoneCount = await db.prepare(`SELECT COUNT(*) AS n FROM zones`).first();
  if (!zoneCount || Number(zoneCount.n) === 0) {
    await db.batch([
      db.prepare(`INSERT INTO zones (country,city,radius_km,enabled,operator_name)
        VALUES ('Thailand','Bangkok',25,1,'Owner')`),
      db.prepare(`INSERT INTO zones (country,city,radius_km,enabled,operator_name)
        VALUES ('South Korea','Partner Location',25,1,'Korea Partner')`),
      db.prepare(`INSERT INTO zones (country,city,radius_km,enabled,operator_name)
        VALUES ('Pakistan','Local Network',0,1,'Owner')`)
    ]);
  }
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcOpportunity(input) {
  const quantity = Math.max(1, Math.floor(num(input.quantity) || 1));
  const asking = num(input.asking_price);
  const targetMargin = Math.max(0, num(input.target_margin_pct) || 20);
  const retailPerUnit = num(input.retail_price_pkr);

  const enabled = input.cost_enabled || {};
  const travel = enabled.travel === false ? 0 : num(input.travel_cost);
  const pickup = enabled.pickup === false ? 0 : num(input.pickup_cost);
  const packing = enabled.packing === false ? 0 : num(input.packing_cost);
  const freight = enabled.freight === false ? 0 : num(input.freight_cost);
  const duties = enabled.duties === false ? 0 : num(input.duties_cost);
  const payment = enabled.payment === false ? 0 : num(input.payment_fee);
  const pkTransport = enabled.pakistan_transport === false ? 0 : num(input.pakistan_transport_cost);
  const contingency = enabled.contingency === false ? 0 : num(input.contingency_cost);

  const purchaseTotal = asking * quantity;
  const totalExtra = travel + pickup + packing + freight + duties +
    payment + pkTransport + contingency;
  const landedTotal = purchaseTotal + totalExtra;
  const landedPerUnit = landedTotal / quantity;
  const retailTotal = retailPerUnit * quantity;

  const maxLandedTotal = retailTotal * (1 - targetMargin / 100);
  const maxPurchaseTotal = Math.max(0, maxLandedTotal - totalExtra);
  const maxBuyPerUnit = maxPurchaseTotal / quantity;

  const expectedProfit = asking > 0 ? retailTotal - landedTotal : 0;
  const expectedMargin = asking > 0 && retailTotal > 0
    ? (expectedProfit / retailTotal) * 100
    : 0;

  let classification = asking <= 0 ? "Price Pending" : "Review";
  if (asking > 0 && expectedMargin >= targetMargin) classification = "Meets Target Margin";
  if (quantity <= 5 && num(input.distance_km) <= 10 && expectedMargin >= targetMargin) {
    classification = "Local Small-Lot Opportunity";
  }
  if (retailTotal <= 0) classification = "Needs Retail Reference";

  return {
    quantity,
    purchase_total: purchaseTotal,
    extra_costs_total: totalExtra,
    landed_total: landedTotal,
    landed_per_unit: landedPerUnit,
    retail_total: retailTotal,
    max_purchase_total: maxPurchaseTotal,
    max_buy_per_unit: maxBuyPerUnit,
    expected_profit: expectedProfit,
    expected_margin_pct: expectedMargin,
    cost_enabled: enabled,
    classification
  };
}

async function getSettings(db) {
  const rows = await db.prepare(`SELECT key,value FROM settings`).all();
  const out = {};
  for (const r of rows.results || []) out[r.key] = r.value;
  return out;
}

function settingNum(settings, key, fallback = 0) {
  const n = Number(settings?.[key]);
  return Number.isFinite(n) ? n : fallback;
}

async function buildAutomaticOpportunity(db, input) {
  const productId = Math.floor(num(input.product_id));
  const sellerId = Math.floor(num(input.seller_id));
  if (!productId || !sellerId) throw new Error("Product and seller are required for automatic sourcing.");

  const product = await db.prepare(`SELECT * FROM products WHERE id=? LIMIT 1`).bind(productId).first();
  const seller = await db.prepare(`SELECT * FROM sellers WHERE id=? LIMIT 1`).bind(sellerId).first();
  if (!product) throw new Error("Selected product was not found.");
  if (!seller) throw new Error("Selected seller was not found.");

  const settings = await getSettings(db);
  const quantity = Math.max(1, Math.floor(num(input.quantity) || 1));
  const asking = num(input.asking_price);
  const retail = num(product.price_pkr);
  const targetMargin = Math.max(0, num(input.target_margin_pct) || settingNum(settings, "default_margin_pct", 20));
  const distance = Math.max(0, num(input.distance_km));

  // Configurable automatic cost model. Rates are read from D1 settings so they
  // can be changed later without changing the Worker code.
  const travel = distance * settingNum(settings, "travel_rate");
  const pickup = settingNum(settings, "pickup_rate");
  const packing = quantity * settingNum(settings, "packing_rate");
  const freight = quantity * settingNum(settings, "freight_rate");
  const purchaseTotal = asking * quantity;
  const retailTotal = retail * quantity;
  const duties = purchaseTotal * settingNum(settings, "duty_rate") / 100;
  const payment = retailTotal * settingNum(settings, "payment_fee_rate") / 100;
  const pkTransport = quantity * settingNum(settings, "pakistan_transport_rate");
  const preContingency = purchaseTotal + travel + pickup + packing + freight + duties + payment + pkTransport;
  const contingency = preContingency * settingNum(settings, "contingency_rate") / 100;

  const calc = calcOpportunity({
    quantity, asking_price: asking, retail_price_pkr: retail, target_margin_pct: targetMargin,
    distance_km: distance, travel_cost: travel, pickup_cost: pickup, packing_cost: packing,
    freight_cost: freight, duties_cost: duties, payment_fee: payment,
    pakistan_transport_cost: pkTransport, contingency_cost: contingency
  });
const configuredKeys = [
  ["travel_rate","travel"],
  ["pickup_rate","pickup"],
  ["packing_rate","packing"],
  ["freight_rate","freight"],
  ["duty_rate","duties"],
  ["payment_fee_rate","payment"],
  ["pakistan_transport_rate","pakistan_transport"],
  ["contingency_rate","contingency"]
];

const pendingCosts = configuredKeys
  .filter(([key]) => settingNum(settings, key) === 0)
  .map(([key, label]) => label);

const warnings = pendingCosts.map(
  (label) => `${label} cost is 0 and marked Pending — actual rate/quote not available`
);
  return {
    ...calc, automatic: true, product_id: product.id, product_title: product.title,
    seller_id: seller.id, seller_name: seller.name, seller_country: seller.country, seller_city: seller.city,
    retail_price_pkr: retail, target_margin_pct: targetMargin, distance_km: distance,
    cost_breakdown: { travel, pickup, packing, freight, duties, payment, pakistan_transport: pkTransport, contingency },
    settings_used: { travel_rate: settingNum(settings,"travel_rate"), pickup_rate: settingNum(settings,"pickup_rate"),
      packing_rate: settingNum(settings,"packing_rate"), freight_rate: settingNum(settings,"freight_rate"),
      duty_rate: settingNum(settings,"duty_rate"), payment_fee_rate: settingNum(settings,"payment_fee_rate"),
      pakistan_transport_rate: settingNum(settings,"pakistan_transport_rate"), contingency_rate: settingNum(settings,"contingency_rate") },pending_costs: pendingCosts,
costs_complete: pendingCosts.length === 0,
    warnings
  };
}

async function discoverSourceHandles() {
  const url = "https://sakoonsay.com/collections/all?limit=250";
  const r = await fetch(url, { headers: { "user-agent": "PakThai-Tech-Sourcing/1.0" } });
  if (!r.ok) throw new Error(`Source collection returned ${r.status}`);
  const html = await r.text();
  const handles = [...html.matchAll(/\/products\/([a-zA-Z0-9][a-zA-Z0-9-]*)/g)]
    .map(m => m[1]);
  return [...new Set(handles)];
}

async function fetchProduct(handle) {
  const url = `https://sakoonsay.com/products/${handle}.js`;
  const r = await fetch(url, { headers: { "user-agent": "PakThai-Tech-Sourcing/1.0" } });
  if (!r.ok) return null;
  const p = await r.json();
  const price = Array.isArray(p.variants) && p.variants.length
    ? Math.min(...p.variants.map(v => num(v.price) / 100))
    : 0;
  const compare = Array.isArray(p.variants) && p.variants.length
    ? Math.max(...p.variants.map(v => num(v.compare_at_price) / 100))
    : null;
  const image = p.featured_image || (Array.isArray(p.images) ? p.images[0] : null);
  const category = p.type || (Array.isArray(p.tags) && p.tags[0]) || "Uncategorized";
  return {
    source_id: String(p.id ?? handle),
    handle,
    title: p.title || handle,
    description: p.description || "",
    price_pkr: price,
    compare_at_pkr: compare || null,
    available: p.available ? 1 : 0,
    image_url: image,
    source_url: url,
    category
  };
}

async function syncSource(db, start = 0, batchSize = 25) {
  const handles = await discoverSourceHandles();
  const slice = handles.slice(start, start + batchSize);
  const products = [];

  for (const handle of slice) {
    try {
      const p = await fetchProduct(handle);
      if (p) products.push(p);
    } catch (_) {}
  }

  for (const p of products) {
    await db.prepare(`
      INSERT INTO products
      (source_id,handle,title,description,price_pkr,compare_at_pkr,available,image_url,source_url,category,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(source_id) DO UPDATE SET
        handle=excluded.handle,
        title=excluded.title,
        description=excluded.description,
        price_pkr=excluded.price_pkr,
        compare_at_pkr=excluded.compare_at_pkr,
        available=excluded.available,
        image_url=excluded.image_url,
        source_url=excluded.source_url,
        category=excluded.category,
        updated_at=CURRENT_TIMESTAMP
    `).bind(
      p.source_id, p.handle, p.title, p.description, p.price_pkr,
      p.compare_at_pkr, p.available, p.image_url, p.source_url, p.category
    ).run();
  }

  return {
    discovered: handles.length,
    processed: slice.length,
    saved: products.length,
    next_start: start + slice.length,
    complete: start + slice.length >= handles.length
  };
}

async function handleApi(request, env) {

  // BLOCK6_CUSTOMER_ORDER_REQUEST_API
  if (url.pathname === "/api/customer-requests" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT * FROM customer_requests ORDER BY id DESC LIMIT 200").all();
    return json(rows.results || []);
  }

  if (url.pathname === "/api/customer-requests" && request.method === "POST") {
    const body = await request.json();
    const customerName = String(body.customer_name || "").trim();
    const phone = String(body.phone || "").trim();
    const whatsapp = String(body.whatsapp || phone).trim();
    const email = String(body.email || "").trim();
    const city = String(body.city || "").trim();
    const address = String(body.delivery_address || "").trim();
    const productId = Number(body.product_id) || null;
    const productTitle = String(body.product_title || "").trim();
    const quantity = Math.max(1, Math.floor(Number(body.quantity) || 1));
    const requestedPrice = Number(body.requested_price_pkr) || null;
    const maxBudget = Number(body.max_budget_pkr) || null;
    const requestType = String(body.request_type || "order_request").trim();
    const note = String(body.customer_note || "").trim();

    if (!customerName) return json({error:"Customer name is required."},400);
    if (!phone && !whatsapp && !email) return json({error:"Phone, WhatsApp or email is required."},400);

    const existingBuyer = await env.DB.prepare(
      "SELECT * FROM buyers WHERE lower(COALESCE(phone,''))=lower(?) OR lower(COALESCE(whatsapp,''))=lower(?) OR lower(COALESCE(email,''))=lower(?) LIMIT 1"
    ).bind(phone, whatsapp, email).first();

    let buyerId = existingBuyer ? existingBuyer.id : null;
    if (!buyerId) {
      const b = await env.DB.prepare(
        "INSERT INTO buyers (name, phone, whatsapp, email, city, company, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, '', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
      ).bind(customerName, phone, whatsapp, email, city).run();
      buyerId = b.meta?.last_row_id || null;
    }

    const req = await env.DB.prepare(
      "INSERT INTO buyer_requirements (buyer_id, product_keyword, quantity, max_budget_pkr, target_price_pkr, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(buyerId, productTitle || String(body.product_keyword || ""), quantity, maxBudget, requestedPrice).run();

    const requirementId = req.meta?.last_row_id || null;

    const ins = await env.DB.prepare(
      "INSERT INTO customer_requests (buyer_id, requirement_id, product_id, product_title, customer_name, phone, whatsapp, email, city, delivery_address, quantity, requested_price_pkr, max_budget_pkr, request_type, customer_note, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
    ).bind(buyerId, requirementId, productId, productTitle, customerName, phone, whatsapp, email, city, address, quantity, requestedPrice, maxBudget, requestType, note).run();

    return json({
      success:true,
      request_id:ins.meta?.last_row_id || null,
      buyer_id:buyerId,
      requirement_id:requirementId,
      status:"new",
      message:"Customer request received and added to Pakistan Buyer Center."
    },201);
  }


  await initDb(env.DB);
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health") {
    return json({ ok: true, service: "PAKTHAI TECH AI Sourcing Engine", phase: 2 });
  }

  if (path === "/api/products" && method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT id,title,category,price_pkr,available,image_url,sourcing_enabled,priority,updated_at
      FROM products ORDER BY updated_at DESC, id DESC LIMIT 500
    `).all();
    return json(rows.results || []);
  }

  if (path === "/api/zones" && method === "GET") {
    const rows = await env.DB.prepare(`SELECT * FROM zones ORDER BY id`).all();
    return json(rows.results || []);
  }

  if (path === "/api/zones" && method === "POST") {
    const b = await request.json();
    const r = await env.DB.prepare(`
      INSERT INTO zones (country,city,radius_km,enabled,operator_name,notes)
      VALUES (?,?,?,?,?,?)
    `).bind(
      b.country, b.city, num(b.radius_km) || 25, b.enabled === false ? 0 : 1,
      b.operator_name || "Owner", b.notes || null
    ).run();
    return json({ ok: true, id: r.meta?.last_row_id });
  }

  if (path === "/api/sellers" && method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT * FROM sellers ORDER BY updated_at DESC, id DESC
    `).all();
    return json(rows.results || []);
  }

  if (path === "/api/sellers" && method === "POST") {
    const b = await request.json();
    if (!b.name) return json({ error: "Seller name is required" }, 400);
    const r = await env.DB.prepare(`
      INSERT INTO sellers
      (name,contact,country,city,location_text,platform,seller_type,status,reliability_score,response_speed,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      b.name, b.contact || null, b.country || null, b.city || null,
      b.location_text || null, b.platform || null, b.seller_type || "seller",
      b.status || "active", num(b.reliability_score), b.response_speed || null,
      b.notes || null
    ).run();
    return json({ ok: true, id: r.meta?.last_row_id });
  }

  if (path === "/api/seller-history" && method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT h.*, s.name AS seller_name, p.title AS product_title
      FROM seller_history h
      JOIN sellers s ON s.id=h.seller_id
      LEFT JOIN products p ON p.id=h.product_id
      ORDER BY h.deal_date DESC, h.id DESC
      LIMIT 500
    `).all();
    return json(rows.results || []);
  }

  if (path === "/api/seller-history" && method === "POST") {
    const b = await request.json();
    const r = await env.DB.prepare(`
      INSERT INTO seller_history
      (seller_id,product_id,deal_date,quantity,asking_price,agreed_price,currency,outcome,notes)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).bind(
      num(b.seller_id), b.product_id ? num(b.product_id) : null,
      b.deal_date || new Date().toISOString(), Math.max(1, Math.floor(num(b.quantity) || 1)),
      num(b.asking_price), num(b.agreed_price), b.currency || "PKR",
      b.outcome || null, b.notes || null
    ).run();
    return json({ ok: true, id: r.meta?.last_row_id });
  }

  if (path === "/api/opportunities" && method === "GET") {
    const rows = await env.DB.prepare(`
      SELECT o.*, p.title AS product_title, s.name AS seller_name,
             z.country, z.city
      FROM opportunities o
      LEFT JOIN products p ON p.id=o.product_id
      LEFT JOIN sellers s ON s.id=o.seller_id
      LEFT JOIN zones z ON z.id=o.zone_id
      ORDER BY o.created_at DESC, o.id DESC
      LIMIT 500
    `).all();
    return json(rows.results || []);
  }

  if (path === "/api/opportunities/calculate" && method === "POST") {
    const b = await request.json();
    if (b.product_id && b.seller_id) return json(await buildAutomaticOpportunity(env.DB, b));
    return json(calcOpportunity(b));
  }

  if (path === "/api/opportunities" && method === "POST") {
    const b = await request.json();
    const auto = b.product_id && b.seller_id ? await buildAutomaticOpportunity(env.DB, b) : null;
    const calc = auto || calcOpportunity(b);
    if (auto) {
      b.retail_price_pkr = auto.retail_price_pkr;
      b.target_margin_pct = auto.target_margin_pct;
      b.distance_km = auto.distance_km;
      for (const [k,v] of Object.entries(auto.cost_breakdown)) {
        if (k === "travel") b.travel_cost = v;
        else if (k === "pickup") b.pickup_cost = v;
        else if (k === "packing") b.packing_cost = v;
        else if (k === "freight") b.freight_cost = v;
        else if (k === "duties") b.duties_cost = v;
        else if (k === "payment") b.payment_fee = v;
        else if (k === "pakistan_transport") b.pakistan_transport_cost = v;
        else if (k === "contingency") b.contingency_cost = v;
      }
    }

    const r = await env.DB.prepare(`
      INSERT INTO opportunities
      (product_id,seller_id,zone_id,quantity,condition,asking_price,target_price,max_buy_price,
       distance_km,travel_mode,travel_cost,pickup_cost,packing_cost,freight_cost,duties_cost,
       payment_fee,pakistan_transport_cost,contingency_cost,landed_cost,retail_price_pkr,
       target_margin_pct,expected_profit,expected_margin_pct,status,approval_status,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      b.product_id ? num(b.product_id) : null,
      b.seller_id ? num(b.seller_id) : null,
      b.zone_id ? num(b.zone_id) : null,
      calc.quantity, b.condition || "used", num(b.asking_price), b.target_price == null ? null : num(b.target_price),
      calc.max_buy_per_unit, num(b.distance_km), b.travel_mode || null,
      num(b.travel_cost), num(b.pickup_cost), num(b.packing_cost), num(b.freight_cost),
      num(b.duties_cost), num(b.payment_fee), num(b.pakistan_transport_cost),
      num(b.contingency_cost), calc.landed_total, num(b.retail_price_pkr),
      Math.max(0, num(b.target_margin_pct) || 20), calc.expected_profit,
      calc.expected_margin_pct, "new", "pending", b.notes || null
    ).run();

    return json({ ok: true, id: r.meta?.last_row_id, calculation: calc });
  }

  if (path === "/api/settings" && method === "GET") {
    const rows = await env.DB.prepare(`SELECT * FROM settings ORDER BY key`).all();
    return json(rows.results || []);
  }

  if (path === "/api/sync/source" && method === "POST") {
    const b = await request.json().catch(() => ({}));
    return json(await syncSource(env.DB, Math.max(0, Math.floor(num(b.start))), 25));
  }

  return json({ error: "Not found" }, 404);
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PAKTHAI TECH — AI Sourcing Engine</title>
<style>
body{font-family:Arial,sans-serif;margin:0;background:#f4f6fa;color:#111}
header{background:#111827;color:#fff;padding:20px 24px;display:flex;justify-content:space-between;align-items:center}
main{max-width:1200px;margin:24px auto;padding:0 16px}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.card,.panel{background:#fff;border:1px solid #ddd;border-radius:14px;padding:18px;box-shadow:0 2px 8px #00000010}
.card b{font-size:25px;display:block;margin-top:8px}
nav{display:flex;gap:8px;margin:16px 0;flex-wrap:wrap}
button{background:#111827;color:#fff;border:0;border-radius:9px;padding:10px 14px;cursor:pointer}
button.alt{background:#e8edf5;color:#111827}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:10px;border-bottom:1px solid #eee;font-size:14px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
input,select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccc;border-radius:8px;margin:5px 0 10px}
label{font-size:13px;font-weight:600}
@media(max-width:800px){.cards,.grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<header><div><strong>PAKTHAI TECH</strong><div>AI Sourcing Engine • Phase 2</div></div><button onclick="sync()">Sync Source Catalog</button></header>
<main>
<div class="cards">
<div class="card">Products<b id="products">—</b></div>
<div class="card">Sellers<b id="sellers">—</b></div>
<div class="card">Opportunities<b id="opps">—</b></div>
<div class="card">Active Zones<b id="zones">—</b></div>
</div>
<nav>
<button onclick="show('dashboard')">Dashboard</button>
<button onclick="show('seller')">Seller Database</button>
<button onclick="show('opportunity')">Small-Lot Calculator</button>
<button onclick="show('history')">Seller History</button><button onclick="openBuyerCenter()">Pakistan Buyer Center</button>
</nav>
<section id="dashboard" class="panel"><h2>Phase 2 Status</h2><p>Database connected. Small-lot sourcing is allowed. Owner approval remains required.</p><p>Customer-facing PakThai Tech remains separate from the upstream source.</p></section>

<section id="seller" class="panel" style="display:none">
<h2>Seller Database</h2>
<div class="grid">
<div><label>Name</label><input id="sname" placeholder="Seller / shop name"></div>
<div><label>Contact</label><input id="scontact" placeholder="WhatsApp / phone / email"></div>
<div><label>Country</label><input id="scountry" placeholder="Thailand"></div>
<div><label>City</label><input id="scity" placeholder="Bangkok"></div>
<div><label>Platform</label><input id="splatform" placeholder="Local shop / Marketplace / Contact"></div>
<div><label>Seller type</label><select id="stype"><option>seller</option><option>supplier</option><option>shop</option><option>scrap</option><option>individual</option><option>buyer</option></select></div>
</div>
<button onclick="addSeller()">Save Seller</button>
<div id="sellerList" style="margin-top:18px"></div>
</section>

<section id="opportunity" class="panel" style="display:none">
<h2>Automatic Small-Lot Opportunity</h2>
<p>Select a product + seller. The engine pulls Pakistan retail price and D1 cost settings automatically. Only quantity, seller asking price and distance need to be supplied for a fresh quote.</p>
<div class="grid">
<div><label>Product</label><select id="productSelect"></select></div>
<div><label>Seller</label><select id="sellerSelect"></select></div>
<div><label>Quantity</label><input id="q" type="number" value="2" min="1"></div>
<div><label>Seller asking price / unit (PKR)</label><input id="ask" type="number" value="0" min="0"></div>
<div><label>Pakistan retail / unit (auto)</label><input id="retail" type="number" value="0" readonly></div>
<div><label>Target margin % (auto setting)</label><input id="margin" type="number" value="20" readonly></div>
<div><label>Distance to seller (km)</label><input id="distance" type="number" value="0" min="0"></div>
</div>
<div style="margin-top:12px;padding:12px;border:1px solid #ccc;border-radius:8px"><b>Cost Controls - ON/OFF</b><br><label><input type="checkbox" id="costTravel" checked> Travel</label> <label><input type="checkbox" id="costPickup" checked> Pickup</label> <label><input type="checkbox" id="costPacking" checked> Packing</label> <label><input type="checkbox" id="costFreight" checked> Freight / Shipping</label> <label><input type="checkbox" id="costDuties" checked> Duties</label> <label><input type="checkbox" id="costPayment" checked> Payment</label> <label><input type="checkbox" id="costPakistan" checked> Pakistan Transport</label> <label><input type="checkbox" id="costContingency" checked> Contingency</label></div><br><button onclick="calculateAuto()">Calculate Automatically</button>
<button class="alt" onclick="createOpportunity()">Create Opportunity — Owner Approval Pending</button>
<div id="calcResult" style="margin-top:18px"></div>
</section>
<section id="history" class="panel" style="display:none">
<h2>Seller History</h2><div id="historyList">Loading…</div>
</section>
</main>
<script>
async function api(p,o){return fetch(p,o).then(r=>r.json())}
async function refresh(){
 const [p,s,z,o]=await Promise.all([api('/api/products'),api('/api/sellers'),api('/api/zones'),api('/api/opportunities')]);
 cachedProducts=p; cachedSellers=s;
 products.textContent=p.length;sellers.textContent=s.length;zones.textContent=z.length;opps.textContent=o.length;
 renderSellers(s);renderHistory();populateOpportunitySelectors();
}
function show(id){for(const x of ['dashboard','seller','opportunity','history'])document.getElementById(x).style.display=x===id?'block':'none'}
async function addSeller(){
 const b={name:sname.value,contact:scontact.value,country:scountry.value,city:scity.value,platform:splatform.value,seller_type:stype.value};
 if(!b.name)return alert('Seller name is required');
 await api('/api/sellers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 sname.value='';scontact.value='';refresh();
}
function renderSellers(a){sellerList.innerHTML='<table><tr><th>Name</th><th>Location</th><th>Platform</th><th>Type</th><th>Status</th></tr>'+a.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc((x.city||'')+', '+(x.country||''))+'</td><td>'+esc(x.platform||'')+'</td><td>'+esc(x.seller_type||'')+'</td><td>'+esc(x.status||'')+'</td></tr>').join('')+'</table>'}
async function renderHistory(){const a=await api('/api/seller-history');historyList.innerHTML='<table><tr><th>Seller</th><th>Product</th><th>Qty</th><th>Asking</th><th>Agreed</th><th>Outcome</th></tr>'+a.map(x=>'<tr><td>'+esc(x.seller_name)+'</td><td>'+esc(x.product_title||'')+'</td><td>'+x.quantity+'</td><td>'+x.asking_price+'</td><td>'+x.agreed_price+'</td><td>'+esc(x.outcome||'')+'</td></tr>').join('')+'</table>'}
let lastAutomaticCalculation=null;
let cachedProducts=[],cachedSellers=[];
function populateOpportunitySelectors(){
 productSelect.innerHTML=cachedProducts.map(x=>'<option value="'+x.id+'" data-price="'+(x.price_pkr||0)+'">'+esc(x.title)+' — PKR '+fmt(x.price_pkr)+'</option>').join('')||'<option value="">No products</option>';
 sellerSelect.innerHTML=cachedSellers.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' — '+esc((x.city||'')+', '+(x.country||''))+'</option>').join('')||'<option value="">No sellers</option>';
 updateRetailFromProduct();
}
function updateRetailFromProduct(){const o=productSelect.options[productSelect.selectedIndex]; retail.value=o?Number(o.dataset.price||0):0;}
productSelect.addEventListener('change',updateRetailFromProduct);
async function calculateAuto(){
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById(costTravel).checked,pickup:document.getElementById(costPickup).checked,packing:document.getElementById(costPacking).checked,freight:document.getElementById(costFreight).checked,duties:document.getElementById(costDuties).checked,payment:document.getElementById(costPayment).checked,pakistan_transport:document.getElementById(costPakistan).checked,contingency:document.getElementById(costContingency).checked}};
 if(!b.product_id||!b.seller_id)return alert('Product aur Seller select karein.');
 const x=await api('/api/opportunities/calculate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(x.error)return alert(x.error);
 lastAutomaticCalculation=x; margin.value=x.target_margin_pct; retail.value=x.retail_price_pkr;
 const c=x.cost_breakdown||{};
 calcResult.innerHTML='<div class="card"><b>'+esc(x.classification)+'</b><p>Product: '+esc(x.product_title)+'</p><p>Seller: '+esc(x.seller_name)+'</p><p>Auto costs: Travel '+fmt(c.travel)+' | Pickup '+fmt(c.pickup)+' | Packing '+fmt(c.packing)+' | Freight '+fmt(c.freight)+' | Duties '+fmt(c.duties)+' | Payment '+fmt(c.payment)+' | Pakistan transport '+fmt(c.pakistan_transport)+' | Contingency '+fmt(c.contingency)+'</p><p>Landed total: PKR '+fmt(x.landed_total)+'</p><p>Landed/unit: PKR '+fmt(x.landed_per_unit)+'</p><p>Max buy/unit for target margin: PKR '+fmt(x.max_buy_per_unit)+'</p><p>Expected profit: PKR '+fmt(x.expected_profit)+'</p><p>Expected margin: '+fmt(x.expected_margin_pct)+'%</p><p>Approval: Pending Owner Approval</p>'+(x.warnings&&x.warnings.length?'<p><b>Settings note:</b> '+esc(x.warnings.join(', '))+'</p>':'')+'</div>';
}
async function createOpportunity(){
 if(!lastAutomaticCalculation) await calculateAuto();
 if(!lastAutomaticCalculation)return;
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById(costTravel).checked,pickup:document.getElementById(costPickup).checked,packing:document.getElementById(costPacking).checked,freight:document.getElementById(costFreight).checked,duties:document.getElementById(costDuties).checked,payment:document.getElementById(costPayment).checked,pakistan_transport:document.getElementById(costPakistan).checked,contingency:document.getElementById(costContingency).checked}};
 const r=await api('/api/opportunities',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(r.error)return alert(r.error);
 alert('Opportunity #'+r.id+' created. Owner approval is pending.'); refresh();
}
async function sync(){
 let start=0,done=false,total=0;
 while(!done){const r=await api('/api/sync/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({start})});total+=r.saved;done=r.complete;start=r.next_start;if(!r.processed)break}
 alert('Sync complete. Saved/updated '+total+' products in this run.');
 refresh();
}
function fmt(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
refresh();
</script>
<section id="buyercenter" class="panel" style="display:none">
<div style="display:flex;justify-content:space-between;align-items:center;gap:15px;flex-wrap:wrap">
<div>
<h2>Pakistan Buyer Center</h2>
<p>Pakistan buyers, requirements and automatic product matching.</p>
</div>
<button onclick="show('dashboard')">Back to Dashboard</button>
</div>

<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-top:20px">

<div class="card">
<h3>Add Pakistan Buyer</h3>
<input id="buyerName" placeholder="Buyer name" style="width:100%;padding:10px;margin:5px 0">
<input id="buyerPhone" placeholder="Phone / WhatsApp" style="width:100%;padding:10px;margin:5px 0">
<input id="buyerWhatsapp" placeholder="WhatsApp" style="width:100%;padding:10px;margin:5px 0">
<input id="buyerEmail" placeholder="Email" style="width:100%;padding:10px;margin:5px 0">
<input id="buyerCity" value="Pakistan" placeholder="City" style="width:100%;padding:10px;margin:5px 0">
<input id="buyerCompany" placeholder="Company" style="width:100%;padding:10px;margin:5px 0">
<button onclick="addPakistanBuyer()">Save Buyer</button>
</div>

<div class="card">
<h3>Buyer Requirement</h3>
<select id="requirementBuyer" style="width:100%;padding:10px;margin:5px 0"></select>
<input id="requirementKeyword" placeholder="Product keyword e.g. RTX 3060 / RAM / PSU" style="width:100%;padding:10px;margin:5px 0">
<input id="requirementQty" type="number" value="1" min="1" placeholder="Quantity" style="width:100%;padding:10px;margin:5px 0">
<input id="requirementBudget" type="number" value="0" placeholder="Maximum budget PKR" style="width:100%;padding:10px;margin:5px 0">
<input id="requirementTarget" type="number" value="0" placeholder="Target price PKR" style="width:100%;padding:10px;margin:5px 0">
<button onclick="savePakistanRequirement()">Save Requirement</button>
</div>

<div class="card">
<h3>Automatic Matching</h3>
<p>System will match buyer requirements with PakThai Tech products.</p>
<button onclick="runPakistanMatching()">Run Buyer Matching</button>
<div id="buyerMatchResult" style="margin-top:12px"></div>
</div>

</div>

<div class="card" style="margin-top:20px">
<h3>Pakistan Buyers</h3>
<div id="buyerList">Loading...</div>
</div>

<div class="card" style="margin-top:20px">
<h3>Buyer Requirements</h3>
<div id="requirementList">Loading...</div>
</div>
</section>

<script>
async function openBuyerCenter(){
  document.querySelectorAll('.panel').forEach(function(x){x.style.display='none';});
  var el=document.getElementById('buyercenter');
  if(el) el.style.display='block';
  await loadBuyerCenter();
}

async function loadBuyerCenter(){
  try{
    var b=await api('/api/buyers');
    var buyers=b.buyers||[];
    var sel=document.getElementById('requirementBuyer');
    if(sel){
      sel.innerHTML=buyers.length
        ? buyers.map(function(x){return '<option value="'+x.id+'">'+esc(x.name)+'</option>';}).join('')
        : '<option value="">Add a buyer first</option>';
    }

    var list=document.getElementById('buyerList');
    if(list){
      list.innerHTML=buyers.length
        ? buyers.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.name)+'</b> — '+esc(x.city||'Pakistan')+' — '+esc(x.phone||x.whatsapp||'')+'</div>';
          }).join('')
        : '<p>No Pakistan buyers yet.</p>';
    }

    var r=await api('/api/buyer-requirements');
    var req=r.requirements||[];
    var rl=document.getElementById('requirementList');
    if(rl){
      rl.innerHTML=req.length
        ? req.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.buyer_name||'Buyer')+'</b> — '+esc(x.product_keyword||'')+' — Qty '+x.quantity+' — Budget PKR '+fmt(x.max_budget_pkr||0)+'</div>';
          }).join('')
        : '<p>No buyer requirements yet.</p>';
    }
  }catch(e){
    alert(e.message||e);
  }
}

async function addPakistanBuyer(){
  var body={
    name:(document.getElementById('buyerName').value||'').trim(),
    phone:document.getElementById('buyerPhone').value,
    whatsapp:document.getElementById('buyerWhatsapp').value,
    email:document.getElementById('buyerEmail').value,
    city:document.getElementById('buyerCity').value||'Pakistan',
    country:'Pakistan',
    company:document.getElementById('buyerCompany').value,
    status:'active'
  };
  if(!body.name){alert('Buyer name is required.');return;}
  var r=await api('/api/buyers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(r.error){alert(r.error);return;}
  alert('Buyer saved successfully.');
  await loadBuyerCenter();
}

async function savePakistanRequirement(){
  var buyer=document.getElementById('requirementBuyer').value;
  if(!buyer){alert('Add a buyer first.');return;}
  var body={
    buyer_id:Number(buyer),
    product_keyword:document.getElementById('requirementKeyword').value,
    quantity:Number(document.getElementById('requirementQty').value||1),
    max_budget_pkr:Number(document.getElementById('requirementBudget').value||0),
    target_price_pkr:Number(document.getElementById('requirementTarget').value||0),
    notes:'',
    status:'active'
  };
  if(!body.product_keyword){alert('Product keyword is required.');return;}
  var r=await api('/api/buyer-requirements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(r.error){alert(r.error);return;}
  alert('Buyer requirement saved.');
  await loadBuyerCenter();
}

async function runPakistanMatching(){
  var box=document.getElementById('buyerMatchResult');
  box.innerHTML='Running automatic buyer matching...';
  try{
    var r=await api('/api/buyer-match/run',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    box.innerHTML='<b>Matching complete.</b> Created matches: '+(r.created||0);
    await loadBuyerCenter();
  }catch(e){
    box.innerHTML='<span style="color:red">'+esc(e.message||String(e))+'</span>';
  }
}
</script></body>
</html>`;

async function handleMasterBuyerApi(request, env) {
  const u = new URL(request.url);

  if (u.pathname === "/api/buyers" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT * FROM buyers ORDER BY id DESC").all();
    return json({ ok: true, buyers: r.results || [] });
  }

  if (u.pathname === "/api/buyers" && request.method === "POST") {
    const x = await request.json();
    const name = String(x.name || "").trim();
    if (!name) return json({ error: "Buyer name is required" }, 400);
    const r = await env.DB.prepare("INSERT INTO buyers (name,phone,whatsapp,email,city,country,company,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime(\"now\"),datetime(\"now\"))").bind(name,String(x.phone||""),String(x.whatsapp||""),String(x.email||""),String(x.city||"Pakistan"),String(x.country||"Pakistan"),String(x.company||""),String(x.status||"active"),String(x.notes||"")).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }

  if (u.pathname === "/api/buyer-requirements" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT br.*, b.name AS buyer_name FROM buyer_requirements br JOIN buyers b ON b.id=br.buyer_id ORDER BY br.id DESC").all();
    return json({ ok: true, requirements: r.results || [] });
  }

  if (u.pathname === "/api/buyer-requirements" && request.method === "POST") {
    const x = await request.json();
    const buyerId = Number(x.buyer_id);
    if (!buyerId) return json({ error: "buyer_id is required" }, 400);
    const now = new Date().toISOString();
    const r = await env.DB.prepare("INSERT INTO buyer_requirements (buyer_id,product_keyword,quantity,max_budget_pkr,target_price_pkr,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(buyerId,String(x.product_keyword||""),Math.max(1,Number(x.quantity)||1),Number(x.max_budget_pkr)||0,Number(x.target_price_pkr)||0,String(x.notes||""),"active",now,now).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }

  if (u.pathname === "/api/buyer-matches" && request.method === "GET") {
    const r = await env.DB.prepare("SELECT bm.*,b.name AS buyer_name,p.title AS product_title,p.price_pkr,s.name AS seller_name FROM buyer_matches bm JOIN buyers b ON b.id=bm.buyer_id JOIN products p ON p.id=bm.product_id LEFT JOIN sellers s ON s.id=bm.seller_id ORDER BY bm.id DESC").all();
    return json({ ok: true, matches: r.results || [] });
  }

  if (u.pathname === "/api/buyer-match/run" && request.method === "POST") {
    const qs = (await env.DB.prepare("SELECT * FROM buyer_requirements WHERE status=\"active\"").all()).results || [];
    let created = 0;
    for (const q of qs) {
      const k = String(q.product_keyword || "").trim().toLowerCase();
      if (!k) continue;
      const ps = (await env.DB.prepare("SELECT id FROM products WHERE lower(title) LIKE ? LIMIT 20").bind("%" + k + "%").all()).results || [];
      for (const p of ps) {
        const old = await env.DB.prepare("SELECT id FROM buyer_matches WHERE buyer_id=? AND requirement_id=? AND product_id=? LIMIT 1").bind(q.buyer_id,q.id,p.id).first();
        if (old) continue;
        await env.DB.prepare("INSERT INTO buyer_matches (buyer_id,requirement_id,product_id,seller_id,match_status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,datetime(\"now\"),datetime(\"now\"))").bind(q.buyer_id,q.id,p.id,null,"matched","Automatic product match - seller selection pending").run();
        created++;
      }
    }
    return json({ ok: true, created });
  }

  return json({ error: "Master Buyer API route not found" }, 404);
}


async function handleSellerOfferAutoSourcing(request, env) {
  try {
    const url = new URL(request.url);
    const body = request.method === "POST"
      ? await request.json().catch(() => ({}))
      : {};

    const settings = await getSettings(env.DB);

    const thbToPkr = Math.max(
      0.01,
      Number(body.thb_to_pkr) || 8.36
    );

    const targetMargin = Math.max(
      0,
      Number(body.target_margin_pct) ||
      settingNum(settings, "default_margin_pct", 20)
    );

    const limit = Math.min(
      100,
      Math.max(1, Number(body.limit) || 50)
    );

    const rows = await env.DB.prepare(`
      SELECT
        so.id AS offer_id,
        so.seller_id,
        so.product_id,
        so.asking_price,
        so.currency,
        so.quantity,
        so.distance_km,
        so.status AS offer_status,
        so.source,
        so.notes,
        p.title AS product_title,
        p.price_pkr AS retail_price_pkr,
        s.name AS seller_name,
        s.country AS seller_country,
        s.city AS seller_city
      FROM seller_offers so
      JOIN products p ON p.id = so.product_id
      JOIN sellers s ON s.id = so.seller_id
      WHERE so.status = 'active'
      ORDER BY so.id DESC
      LIMIT ?
    `).bind(limit).all();

    const results = [];

    for (const r of (rows.results || [])) {
      const quantity = Math.max(
        1,
        Math.floor(Number(r.quantity) || 1)
      );

      const askingTHB = Number(r.asking_price) || 0;
      const purchasePKR = askingTHB * thbToPkr * quantity;
      const retailTotal =
        Number(r.retail_price_pkr || 0) * quantity;

      const distance = Math.max(
        0,
        Number(r.distance_km) || 0
      );

      const travel =
        distance * settingNum(settings, "travel_rate", 75);

      const pickup =
        settingNum(settings, "pickup_rate", 0);

      const packing =
        quantity * settingNum(settings, "packing_rate", 0);

      const freight =
        quantity * settingNum(settings, "freight_rate", 0);

      const duties =
        purchasePKR *
        settingNum(settings, "duty_rate", 0) / 100;

      const payment =
        retailTotal *
        settingNum(settings, "payment_fee_rate", 0) / 100;

      const pakistanTransport =
        quantity *
        settingNum(settings, "pakistan_transport_rate", 0);

      const preContingency =
        purchasePKR +
        travel +
        pickup +
        packing +
        freight +
        duties +
        payment +
        pakistanTransport;

      const contingency =
        preContingency *
        settingNum(settings, "contingency_rate", 0) / 100;

      const landedTotal =
        preContingency + contingency;

      const landedPerUnit =
        landedTotal / quantity;

      const profit =
        retailTotal - landedTotal;

      const margin =
        retailTotal > 0
          ? (profit / retailTotal) * 100
          : 0;

      const maxLandedTotal =
        retailTotal * (1 - targetMargin / 100);

      const maxPurchaseTotal =
        Math.max(0, maxLandedTotal -
          (travel + pickup + packing + freight +
           duties + payment + pakistanTransport +
           contingency));

      const maxBuyPerUnitPKR =
        maxPurchaseTotal / quantity;

      let classification = "Not Viable";

      if (retailTotal <= 0) {
        classification = "Needs Retail Reference";
      } else if (margin >= targetMargin) {
        classification =
          quantity <= 5 && distance <= 10
            ? "Local Small-Lot Opportunity"
            : "Meets Target Margin";
      } else if (margin > 0) {
        classification = "Below Target Margin";
      }

      results.push({
        offer_id: r.offer_id,
        seller_id: r.seller_id,
        seller_name: r.seller_name,
        seller_country: r.seller_country,
        seller_city: r.seller_city,
        product_id: r.product_id,
        product_title: r.product_title,

        asking_price_thb: askingTHB,
        thb_to_pkr: thbToPkr,
        asking_price_pkr_per_unit:
          askingTHB * thbToPkr,

        quantity,
        distance_km: distance,

        retail_price_pkr:
          Number(r.retail_price_pkr || 0),

        purchase_total_pkr:
          purchasePKR,

        cost_breakdown: {
          travel,
          pickup,
          packing,
          freight,
          duties,
          payment,
          pakistan_transport: pakistanTransport,
          contingency
        },

        landed_total_pkr:
          landedTotal,

        landed_per_unit_pkr:
          landedPerUnit,

        retail_total_pkr:
          retailTotal,

        max_buy_per_unit_pkr:
          maxBuyPerUnitPKR,

        expected_profit_pkr:
          profit,

        expected_margin_pct:
          margin,

        target_margin_pct:
          targetMargin,

        classification,

        automatic: true,
        owner_approval_required:
          settingNum(settings, "owner_approval_required", 1) !== 0
      });
    }

    results.sort(
      (a, b) =>
        b.expected_margin_pct -
        a.expected_margin_pct
    );

    return json({
      ok: true,
      automatic: true,
      thb_to_pkr: thbToPkr,
      target_margin_pct: targetMargin,
      scanned_offers: results.length,
      viable_opportunities:
        results.filter(
          x => x.expected_margin_pct >= targetMargin
        ).length,
      results
    });

  } catch (error) {
    return json({
      ok: false,
      error: error.message
    }, 500);
  }
}

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/sourcing/")) return await handleSellerOfferAutoSourcing(request, env);
        if (url.pathname.startsWith("/api/buyers") || url.pathname.startsWith("/api/buyer-requirements") || url.pathname.startsWith("/api/buyer-matches") || url.pathname.startsWith("/api/buyer-match/")) return await handleMasterBuyerApi(request, env);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);

  // BLOCK6_CUSTOMER_REQUEST_ROUTE
  if (url.pathname === "/customer-request") {
    return new Response(\`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PakThai Tech - Customer Request</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:20px}input,textarea,button{width:100%;padding:12px;margin:6px 0 14px;box-sizing:border-box}button{cursor:pointer;font-weight:700}.ok{padding:12px;background:#e9f7ef}.err{padding:12px;background:#fdecec}</style></head><body><h1>PAKTHAI TECH</h1><h2>Order / Request Quote</h2><form id="f"><input name="customer_name" placeholder="Your name" required><input name="phone" placeholder="Phone"><input name="whatsapp" placeholder="WhatsApp"><input name="email" placeholder="Email"><input name="city" placeholder="City" required><textarea name="delivery_address" placeholder="Delivery address"></textarea><input name="product_title" placeholder="Product / requirement" required><input name="quantity" type="number" min="1" value="1" required><input name="requested_price_pkr" type="number" min="0" placeholder="Target price PKR"><input name="max_budget_pkr" type="number" min="0" placeholder="Maximum budget PKR"><textarea name="customer_note" placeholder="Additional requirement"></textarea><button>Submit Request</button></form><div id="m"></div><script>document.getElementById("f").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch("/api/customer-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});const j=await r.json();document.getElementById("m").className=r.ok?"ok":"err";document.getElementById("m").textContent=j.message||j.error||"Done";if(r.ok)e.target.reset();});</script></body></html>\`,{headers:{"content-type":"text/html;charset=UTF-8"}});
  }

      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch (e) {
      return json({ error: e?.message || String(e) }, 500);
    }
  }
};


