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

async function syncFxRates(env){const p=[['THB','PKR'],['USD','PKR'],['EUR','PKR']],n=new Date().toISOString();for(const [b,q] of p){const r=await fetch('https://api.frankfurter.dev/v2/rate/'+b.toLowerCase()+'/'+q.toLowerCase());if(!r.ok)throw Error('FX '+b+'/'+q+' HTTP '+r.status);const d=await r.json(),v=Number(d.rate);if(!Number.isFinite(v)||v<=0)throw Error('Invalid FX');await env.DB.prepare('INSERT OR REPLACE INTO fx_rates (base_currency,quote_currency,rate,source,rate_date,fetched_at) VALUES (?,?,?,?,?,?)').bind(b,q,v,'Frankfurter',d.date||n.slice(0,10),n).run()}}
async function calcOpportunity(input, env) { try { await syncFxRates(env); } catch(e) { console.log('FX sync skipped:',e?.message||e); }
  const quantity = Math.max(1, Math.floor(num(input.quantity) || 1));
  const asking = num(input.asking_price);
  const distance = Math.max(0, num(input.distance_km));
  const retailPerUnit = num(input.retail_price_pkr);

  const settingsRows = await env.DB.prepare(
    `SELECT key,value FROM settings`
  ).all();

  const settings = Object.fromEntries(
    (settingsRows.results || []).map(x => [x.key, x.value])
  );

  const rate = key => num(settings[key]);
  const targetMargin = Math.max(
    0,
    num(input.target_margin_pct) || rate("default_margin_pct") || 20
  );

  const purchaseTotal = asking * quantity;

  // Automatic cost engine:
  // travel_rate = PKR per km
  // pickup_rate = PKR per opportunity
  // packing_rate = PKR per unit
  // freight_rate = % of purchase total
  // duty_rate = % of purchase total
  // payment_fee_rate = % of purchase total
  // pakistan_transport_rate = PKR per opportunity
  // contingency_rate = % of purchase + base costs
  const travel = distance * rate("travel_rate");
  const pickup = rate("pickup_rate");
  const packing = quantity * rate("packing_rate");
  const freight = purchaseTotal * rate("freight_rate") / 100;
  const duties = purchaseTotal * rate("duty_rate") / 100;
  const payment = purchaseTotal * rate("payment_fee_rate") / 100;
  const pkTransport = rate("pakistan_transport_rate");

  const baseCosts =
    travel + pickup + packing + freight + duties + payment + pkTransport;

  const contingency =
    (purchaseTotal + baseCosts) * rate("contingency_rate") / 100;

  const totalExtra = baseCosts + contingency;
  const landedTotal = purchaseTotal + totalExtra;
  const landedPerUnit = landedTotal / quantity;
  const retailTotal = retailPerUnit * quantity;

  const maxLandedTotal = retailTotal * (1 - targetMargin / 100);
  const maxPurchaseTotal = Math.max(0, maxLandedTotal - totalExtra);
  const maxBuyPerUnit = maxPurchaseTotal / quantity;

  const expectedProfit = retailTotal - landedTotal;
  const expectedMargin =
    retailTotal > 0 ? (expectedProfit / retailTotal) * 100 : 0;

  let classification = "Review";
  if (retailTotal <= 0) {
    classification = "Needs Retail Reference";
  } else if (
    expectedMargin >= targetMargin &&
    quantity <= 5 &&
    distance <= 10
  ) {
    classification = "Local Small-Lot Opportunity";
  } else if (expectedMargin >= targetMargin) {
    classification = "Meets Target Margin";
  }

  return {
    quantity,
    purchase_total: purchaseTotal,
    travel_cost: travel,
    pickup_cost: pickup,
    packing_cost: packing,
    freight_cost: freight,
    duties_cost: duties,
    payment_fee: payment,
    pakistan_transport_cost: pkTransport,
    contingency_cost: contingency,
    extra_costs_total: totalExtra,
    landed_total: landedTotal,
    landed_per_unit: landedPerUnit,
    retail_total: retailTotal,
    max_purchase_total: maxPurchaseTotal,
    max_buy_per_unit: maxBuyPerUnit,
    expected_profit: expectedProfit,
    expected_margin_pct: expectedMargin,
    target_margin_pct: targetMargin,
    classification
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
      SELECT * FROM sellers ORDER BY id DESC
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
  if (path === "/api/fx/sync" && method === "POST") {
    try {
      await syncFxRates(env);
      const rows = await env.DB.prepare(
        "SELECT base_currency,quote_currency,rate,source,rate_date FROM fx_rates ORDER BY id DESC LIMIT 10"
      ).all();
      return json({ ok: true, rates: rows.results || [] });
    } catch (e) {
      return json({ ok: false, error: e?.message || String(e) }, 500);
    }
  }
  if (path === "/api/opportunities/calculate" && method === "POST") {
    const b = await request.json();
    return json(await calcOpportunity(b, env));
  }

  if (path === "/api/opportunities" && method === "POST") {
    const b = await request.json();
    const calc = await calcOpportunity(b, env);

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
      calc.travel_cost, calc.pickup_cost, calc.packing_cost, calc.freight_cost,
      calc.duties_cost, calc.payment_fee, calc.pakistan_transport_cost,
      calc.contingency_cost, calc.landed_total, num(b.retail_price_pkr),
      calc.target_margin_pct, calc.expected_profit,
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
<title>PAKTHAI TECH â€” AI Sourcing Engine</title>
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
<header><div><strong>PAKTHAI TECH</strong><div>AI Sourcing Engine â€¢ Phase 2</div></div><button onclick="sync()">Sync Source Catalog</button></header>
<main>
<div class="cards">
<div class="card">Products<b id="products">â€”</b></div>
<div class="card">Sellers<b id="sellers">â€”</b></div>
<div class="card">Opportunities<b id="opps">â€”</b></div>
<div class="card">Active Zones<b id="zones">â€”</b></div>
</div>
<nav>
<button onclick="show('dashboard')">Dashboard</button>
<button onclick="show('seller')">Seller Database</button>
<button onclick="show('opportunity')">Small-Lot Calculator</button>
<button onclick="show('history')">Seller History</button>
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
<h2>Small-Lot Opportunity Calculator</h2>
<p>Product retail price and seller are loaded from the PakThai Tech database. Travel, pickup, packing, freight, duty, payment, Pakistan transport and contingency costs are calculated automatically from Settings.</p>
<div class="grid">
<div><label>Product</label><select id="productSelect"><option value="">Select product</option></select></div>
<div><label>Seller</label><select id="sellerSelect"><option value="">Select seller</option></select></div>
<div><label>Quantity</label><input id="q" type="number" value="2" min="1"></div>
<div><label>Asking price per unit (PKR)</label><input id="ask" type="number" value="0" min="0"></div>
<div><label>Pakistan retail per unit (PKR)</label><input id="retail" type="number" value="0" readonly></div>
<div><label>Target margin %</label><input id="margin" type="number" value="20" min="0"></div>
<div><label>Distance to seller (km)</label><input id="distance" type="number" value="4" min="0"></div>
</div>
<button onclick="calculate()">Calculate</button>
<div id="calcResult" style="margin-top:18px"></div>
</section>

<section id="history" class="panel" style="display:none">
<h2>Seller History</h2><div id="historyList">Loadingâ€¦</div>
</section>
</main>
<script>
async function api(p,o){return fetch(p,o).then(r=>r.json())}
async function refresh(){
 const [p,s,z,o]=await Promise.all([api('/api/products'),api('/api/sellers'),api('/api/zones'),api('/api/opportunities')]);
 products.textContent=p.length;sellers.textContent=s.length;zones.textContent=z.length;opps.textContent=o.length;
 renderSellers(s);renderOpportunitySelectors(p,s);renderHistory();
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
function renderOpportunitySelectors(productsData,sellersData){
 const ps=document.getElementById('productSelect');
 const ss=document.getElementById('sellerSelect');
 const currentProduct=ps.value;
 const currentSeller=ss.value;

 ps.innerHTML='<option value="">Select product</option>'+productsData.map(x=>
   '<option value="'+x.id+'" data-price="'+num(x.price_pkr)+'">'+esc(x.title)+' â€” PKR '+fmt(x.price_pkr)+'</option>'
 ).join('');

 ss.innerHTML='<option value="">Select seller</option>'+sellersData.map(x=>
   '<option value="'+x.id+'">'+esc(x.name)+' â€” '+esc((x.city||'')+', '+(x.country||''))+'</option>'
 ).join('');

 if(currentProduct) ps.value=currentProduct;
 if(currentSeller) ss.value=currentSeller;

 ps.onchange=function(){
   const opt=ps.options[ps.selectedIndex];
   retail.value=opt?.dataset?.price || 0;
 };
}

function num(v){return Number.isFinite(Number(v))?Number(v):0}

async function calculate(){
 const b={
   product_id:document.getElementById('productSelect').value||null,
   seller_id:document.getElementById('sellerSelect').value||null,
   quantity:q.value,
   asking_price:ask.value,
   retail_price_pkr:retail.value,
   target_margin_pct:margin.value,
   distance_km:distance.value
 };
 const x=await api('/api/opportunities/calculate',{
   method:'POST',
   headers:{'content-type':'application/json'},
   body:JSON.stringify(b)
 });
 calcResult.innerHTML='<div class="card"><b>'+esc(x.classification)+'</b>'+
   '<p>Purchase total: PKR '+fmt(x.purchase_total)+'</p>'+
   '<p>Automatic extra costs: PKR '+fmt(x.extra_costs_total)+'</p>'+
   '<p>Landed total: PKR '+fmt(x.landed_total)+'</p>'+
   '<p>Landed/unit: PKR '+fmt(x.landed_per_unit)+'</p>'+
   '<p>Max buy/unit for target margin: PKR '+fmt(x.max_buy_per_unit)+'</p>'+
   '<p>Expected profit: PKR '+fmt(x.expected_profit)+'</p>'+
   '<p>Expected margin: '+fmt(x.expected_margin_pct)+'%</p></div>';
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
</body>
</html>`;

export default {
  async fetch(request, env) {
    try {
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      const url = new URL(request.url);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);
      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch (e) {
      return json({ error: e?.message || String(e) }, 500);
    }
  }
};





