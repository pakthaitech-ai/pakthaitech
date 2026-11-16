import { handleGmailOAuth } from './gmail-oauth.js';
import { runGmailAutoReply } from './gmail-autoreply.js';
import { handleBuyerDiscoveryRequest } from './buyer-discovery.js';
import { handleExternalDiscoveryRequest } from './external-discovery.js';
import { handleAuthRoute, authorizeRequest } from './auth-session.js';

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization"
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
    ["catalog_sync_enabled", "true"],
    ["catalog_sync_batch_size", "25"],
    ["catalog_sync_cursor", "0"],
    ["travel_rate", "0"],
    ["pickup_rate", "0"],
    ["packing_rate", "0"],
    ["freight_rate", "0"],
    ["duty_rate", "0"],
    ["payment_fee_rate", "0"],
    ["pakistan_transport_rate", "0"],
    ["contingency_rate", "0"],
    ["master_ai_mode", "on"],
    ["auto_search_enabled", "true"],
    ["seller_matching_enabled", "true"],
    ["negotiation_mode", "on"],
    ["auto_followup_enabled", "true"],
    ["negotiation_max_attempts", "3"],
    ["negotiation_followup_delay_hours", "24"],
    ["opportunity_creation_enabled", "true"],
    ["travel_enabled", "true"],
    ["pickup_enabled", "true"],
    ["packing_enabled", "true"],
    ["freight_enabled", "true"],
    ["duty_enabled", "true"],
    ["payment_fee_enabled", "true"],
    ["pakistan_transport_enabled", "true"],
    ["contingency_enabled", "true"],
    ["missing_rate_action", "pending"],
    ["country_thailand_enabled", "true"],
    ["country_thailand_city_scope", "Bangkok"],
    ["country_south_korea_enabled", "true"],
    ["country_singapore_enabled", "false"],
    ["country_malaysia_enabled", "false"],
    ["country_vietnam_enabled", "false"],
    ["country_australia_enabled", "false"],
    ["country_pakistan_enabled", "true"],
    ["pakistan_source_enabled", "false"]
  ];

  for (const [key, value] of seeds) {
    await db.prepare(
      `INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)`
    ).bind(key, value).run();
  }

  await ensureFinalSchema(db);
  await db.prepare(`INSERT INTO settings(key,value) VALUES('owner_approval_required','true') ON CONFLICT(key) DO UPDATE SET value='true'`).run();

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



async function ensureFinalSchema(db) {
  const ddl = [
    `CREATE TABLE IF NOT EXISTS buyers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, phone TEXT, whatsapp TEXT, email TEXT, city TEXT,
      country TEXT DEFAULT 'Pakistan', company TEXT, status TEXT DEFAULT 'active', notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS buyer_requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT, buyer_id INTEGER NOT NULL, product_keyword TEXT,
      quantity INTEGER DEFAULT 1, max_budget_pkr REAL DEFAULT 0, target_price_pkr REAL DEFAULT 0,
      notes TEXT, status TEXT DEFAULT 'active', created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS buyer_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT, buyer_id INTEGER NOT NULL, requirement_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL, seller_id INTEGER, match_status TEXT DEFAULT 'matched', notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customer_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT, buyer_id INTEGER, requirement_id INTEGER, product_id INTEGER,
      product_title TEXT, customer_name TEXT, phone TEXT, whatsapp TEXT, email TEXT, city TEXT,
      delivery_address TEXT, quantity INTEGER DEFAULT 1, requested_price_pkr REAL, max_budget_pkr REAL,
      request_type TEXT DEFAULT 'order_request', customer_note TEXT, status TEXT DEFAULT 'new',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS seller_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT, seller_id INTEGER, product_id INTEGER NOT NULL,
      online_reference_price REAL, dealer_price REAL, negotiated_price REAL, currency TEXT DEFAULT 'THB',
      min_quantity INTEGER DEFAULT 1, warranty TEXT, quote_date TEXT, status TEXT DEFAULT 'reference',
      notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS owner_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER NOT NULL, decision TEXT NOT NULL,
      approved_by TEXT DEFAULT 'Owner', note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS customer_approvals (
      id INTEGER PRIMARY KEY AUTOINCREMENT, customer_request_id INTEGER NOT NULL, decision TEXT NOT NULL,
      approved_by TEXT DEFAULT 'Owner', note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS quotations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER, buyer_id INTEGER, product_id INTEGER,
      quote_number TEXT UNIQUE NOT NULL, customer_name TEXT, customer_phone TEXT, customer_whatsapp TEXT,
      quantity INTEGER DEFAULT 1, unit_price_pkr REAL DEFAULT 0, total_price_pkr REAL DEFAULT 0,
      valid_until TEXT, status TEXT DEFAULT 'draft', notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, quotation_id INTEGER, opportunity_id INTEGER, buyer_id INTEGER,
      order_number TEXT UNIQUE NOT NULL, product_id INTEGER, quantity INTEGER DEFAULT 1,
      sale_unit_price_pkr REAL DEFAULT 0, sale_total_pkr REAL DEFAULT 0, status TEXT DEFAULT 'new',
      payment_status TEXT DEFAULT 'pending', customer_note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, opportunity_id INTEGER,
      seller_id INTEGER, purchase_status TEXT DEFAULT 'pending', agreed_price_pkr REAL DEFAULT 0,
      currency TEXT DEFAULT 'PKR', quantity INTEGER DEFAULT 1, purchase_date TEXT, tracking_ref TEXT,
      notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS delivery_tracking (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, delivery_status TEXT DEFAULT 'pending',
      carrier TEXT, tracking_number TEXT, origin TEXT, destination TEXT DEFAULT 'Faisalabad, Pakistan',
      estimated_date TEXT, delivered_date TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT DEFAULT 'internal', channel TEXT DEFAULT 'dashboard',
      recipient TEXT, subject TEXT, message TEXT, related_type TEXT, related_id INTEGER,
      status TEXT DEFAULT 'pending', sent_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`,
    db.prepare(`CREATE TABLE IF NOT EXISTS negotiations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, opportunity_id INTEGER, buyer_match_id INTEGER,
      seller_id INTEGER NOT NULL, offer_id INTEGER, status TEXT DEFAULT 'active',
      attempt_count INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3,
      last_contact_at TEXT, next_followup_at TEXT, original_price_pkr REAL DEFAULT 0,
      last_offer_price_pkr REAL DEFAULT 0, seller_counter_price_pkr REAL DEFAULT 0,
      agreed_price_pkr REAL DEFAULT 0, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`)
  ]
  for (const sql of ddl) { try { await db.prepare(sql).run(); } catch (_) {} }
  const cols = [
    ['asking_price','REAL'], ['quantity','INTEGER DEFAULT 1'], ['distance_km','REAL DEFAULT 0'], ['source','TEXT']
  ];
  for (const [name,type] of cols) { try { await db.prepare(`ALTER TABLE seller_offers ADD COLUMN ${name} ${type}`).run(); } catch (_) {} }
  try { await db.prepare(`UPDATE seller_offers SET asking_price=COALESCE(asking_price,negotiated_price,dealer_price,online_reference_price,0), quantity=COALESCE(quantity,min_quantity,1)`).run(); } catch (_) {}
}

async function sendWhatsAppCloudMessage(env, recipient, message) {
  const phoneNumberId = String(env.WHATSAPP_PHONE_NUMBER_ID || '1426391470555242').trim();
  const accessToken = String(env.WHATSAPP_ACCESS_TOKEN || '').trim();
  const graphVersion = String(env.WHATSAPP_GRAPH_API_VERSION || 'v26.0').trim();
  const to = String(recipient || '').replace(/[^0-9]/g, '');
  const body = String(message || '').trim();

  if (!phoneNumberId || !accessToken) {
    return { sent: false, configured: false, reason: 'WhatsApp Cloud API secrets are not configured.' };
  }
  if (!to || !body) {
    return { sent: false, configured: true, reason: 'recipient and message are required.' };
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { preview_url: false, body }
      })
    }
  );

  const responseText = await response.text();
  let data = {};
  try { data = JSON.parse(responseText); }
  catch { data = { raw_error: responseText.slice(0, 500) }; }
  
  if (!response.ok) {
    return {
      sent: false,
      configured: true,
      status: response.status,
      error: data?.error?.message || 'WhatsApp Cloud API request failed.',
      error_code: data?.error?.code ?? null,
      error_subcode: data?.error?.error_subcode ?? null,
      error_type: data?.error?.type ?? null,
      fbtrace_id: data?.error?.fbtrace_id ?? response.headers.get('x-fb-trace-id') ?? null,
      raw_error: data?.raw_error ?? null,
      diagnostic_headers: { status_text: response.statusText, response_url: response.url, redirected: response.redirected, server: response.headers.get('server'), via: response.headers.get('via'), cf_ray: response.headers.get('cf-ray'), date: response.headers.get('date'), www_authenticate: response.headers.get('www-authenticate'), fb_request_id: response.headers.get('x-fb-request-id'), facebook_api_version: response.headers.get('facebook-api-version'), content_type: response.headers.get('content-type'), content_length: response.headers.get('content-length') }
    };
  }

  return {
    sent: true,
    configured: true,
    message_id: data?.messages?.[0]?.id || null
  };
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

function settingBool(settings, key, fallback = true) {
  const v = settings?.[key];
  if (v === undefined || v === null || v === "") return fallback;
  return ["1", "true", "yes", "on", "enabled"].includes(String(v).toLowerCase());
}

function masterMode(settings) {
  const mode = String(settings?.master_ai_mode || "on").toLowerCase();
  return ["on", "pause", "off"].includes(mode) ? mode : "on";
}

function automationAllowed(settings, featureKey) {
  const mode = masterMode(settings);
  if (mode !== "on") return false;
  return featureKey ? settingBool(settings, featureKey, true) : true;
}

function countrySettingKey(country) {
  const c = String(country || "").trim().toLowerCase();
  const map = {
    thailand: "country_thailand_enabled",
    "south korea": "country_south_korea_enabled",
    korea: "country_south_korea_enabled",
    singapore: "country_singapore_enabled",
    malaysia: "country_malaysia_enabled",
    vietnam: "country_vietnam_enabled",
    australia: "country_australia_enabled",
    pakistan: "country_pakistan_enabled"
  };
  return map[c] || null;
}

function sourceCountryAllowed(settings, country) {
  const c = String(country || "").trim();
  if (!c) return false;
  if (c.toLowerCase() === "pakistan" && !settingBool(settings, "pakistan_source_enabled", false)) return false;
  const key = countrySettingKey(c);
  return key ? settingBool(settings, key, false) : false;
}

function normalizeLocationText(value) {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function sourceLocationAllowed(settings, country, city) {
  if (!sourceCountryAllowed(settings, country)) return false;
  const c = normalizeLocationText(country);
  const cityName = normalizeLocationText(city);
  if (c === "thailand") {
    const scope = normalizeLocationText(settings?.country_thailand_city_scope || "Bangkok");
    if (scope && scope !== "all" && scope !== "*") {
      const allowedCities = scope.split(",").map(normalizeLocationText).filter(Boolean);
      if (!allowedCities.includes(cityName)) return false;
    }
  }
  return true;
}

function costRate(settings, enabledKey, rateKey) {
  return settingBool(settings, enabledKey, true) ? settingNum(settings, rateKey, 0) : 0;
}

async function createNegotiation(db, input = {}) {
  const settings = await getSettings(db);
  const negotiationMode = String(settings.negotiation_mode || "on").toLowerCase();
  if (masterMode(settings) !== "on") throw new Error("Master AI is paused/off.");
  if (negotiationMode !== "on") throw new Error(`Negotiation is ${negotiationMode}.`);
  const sellerId = Math.floor(num(input.seller_id));
  if (!sellerId) throw new Error("seller_id is required.");
  const maxAttempts = Math.max(1, Math.floor(settingNum(settings, "negotiation_max_attempts", 3)));
  const r = await db.prepare(`INSERT INTO negotiations(seller_id,opportunity_id,buyer_match_id,offer_id,status,attempt_count,max_attempts,original_price_pkr,last_offer_price_pkr,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`)
    .bind(sellerId, input.opportunity_id ? num(input.opportunity_id) : null, input.buyer_match_id ? num(input.buyer_match_id) : null, input.offer_id ? num(input.offer_id) : null, "active", 0, maxAttempts, num(input.original_price_pkr), num(input.last_offer_price_pkr || input.original_price_pkr), String(input.notes || ""))
    .run();
  return r.meta?.last_row_id || null;
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
  if (!automationAllowed(settings, 'opportunity_creation_enabled')) throw new Error(`Automatic opportunity creation is unavailable while Master AI is ${masterMode(settings)} or Opportunity Creation is OFF.`);
  if (!sourceLocationAllowed(settings, seller.country, seller.city)) throw new Error(`Seller location ${seller.city || 'Unknown'}, ${seller.country || 'Unknown'} is disabled for sourcing.`);
  const quantity = Math.max(1, Math.floor(num(input.quantity) || 1));
  const asking = num(input.asking_price);
  const retail = num(product.price_pkr);
  const targetMargin = Math.max(0, num(input.target_margin_pct) || settingNum(settings, "default_margin_pct", 20));
  const distance = Math.max(0, num(input.distance_km));

  // Configurable automatic cost model. Rates are read from D1 settings so they
  // can be changed later without changing the Worker code.
  const travel = distance * costRate(settings, "travel_enabled", "travel_rate");
  const pickup = costRate(settings, "pickup_enabled", "pickup_rate");
  const packing = quantity * costRate(settings, "packing_enabled", "packing_rate");
  const freight = quantity * costRate(settings, "freight_enabled", "freight_rate");
  const purchaseTotal = asking * quantity;
  const retailTotal = retail * quantity;
  const duties = purchaseTotal * costRate(settings, "duty_enabled", "duty_rate") / 100;
  const payment = retailTotal * costRate(settings, "payment_fee_enabled", "payment_fee_rate") / 100;
  const pkTransport = quantity * costRate(settings, "pakistan_transport_enabled", "pakistan_transport_rate");
  const preContingency = purchaseTotal + travel + pickup + packing + freight + duties + payment + pkTransport;
  const contingency = preContingency * costRate(settings, "contingency_enabled", "contingency_rate") / 100;

  const calc = calcOpportunity({
    quantity, asking_price: asking, retail_price_pkr: retail, target_margin_pct: targetMargin,
    distance_km: distance, travel_cost: travel, pickup_cost: pickup, packing_cost: packing,
    freight_cost: freight, duties_cost: duties, payment_fee: payment,
    pakistan_transport_cost: pkTransport, contingency_cost: contingency
  });
  const maxLandedTotal = retailTotal * (1 - targetMargin / 100);
  const dutyRate = costRate(settings, 'duty_enabled', 'duty_rate') / 100;
  const contingencyRate = costRate(settings, 'contingency_enabled', 'contingency_rate') / 100;
  const fixedPreContingency = travel + pickup + packing + freight + payment + pkTransport;
  calc.max_purchase_total = Math.max(0, (maxLandedTotal - fixedPreContingency * (1 + contingencyRate)) / ((1 + dutyRate) * (1 + contingencyRate)));
  calc.max_buy_per_unit = calc.max_purchase_total / quantity;
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
  .filter(([key, label]) => {
    const enabledKey = {
      travel: "travel_enabled",
      pickup: "pickup_enabled",
      packing: "packing_enabled",
      freight: "freight_enabled",
      duties: "duty_enabled",
      payment: "payment_fee_enabled",
      pakistan_transport: "pakistan_transport_enabled",
      contingency: "contingency_enabled"
    }[label];
    return settingBool(settings, enabledKey, true) && settingNum(settings, key) === 0;
  })
  .map(([key, label]) => label);

const warnings = pendingCosts.map(
  (label) => `${label} cost is 0 and marked Pending â€” actual rate/quote not available`
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
  const url = "https://sakoonsay.com/products.json?limit=250";
  const r = await fetch(url, { headers: { "user-agent": "PakThai-Tech-Sourcing/1.0" } });
  if (!r.ok) throw new Error(`Source catalog returned ${r.status}`);
  const data = await r.json();
  const handles = (data.products || []).map(p => String(p.handle || '').trim()).filter(Boolean);
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
  const products = (await Promise.all(slice.map(async (handle) => {
    try {
      return await fetchProduct(handle);
    } catch (_) {
      return null;
    }
  }))).filter(Boolean);

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
  const url = new URL(request.url);

  // CUSTOMER REQUEST OWNER APPROVAL
  if (url.pathname === "/api/customer-approvals" && request.method === "GET") {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS customer_approvals (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_request_id INTEGER NOT NULL, decision TEXT NOT NULL, approved_by TEXT DEFAULT 'Owner', note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
    const rows = await env.DB.prepare("SELECT cr.* FROM customer_requests cr ORDER BY cr.id DESC LIMIT 200").all();
    const approvals = await env.DB.prepare("SELECT * FROM customer_approvals ORDER BY id DESC LIMIT 500").all();
    const latest = {};
    for (const a of (approvals.results||[])) { if (!latest[a.customer_request_id]) latest[a.customer_request_id]=a; }
    const requests = (rows.results||[]).map(x => ({...x, approval_decision: latest[x.id]?.decision || null, approved_by: latest[x.id]?.approved_by || null, approval_at: latest[x.id]?.created_at || null}));
    return json({ok:true,requests});
  }
  if (url.pathname === "/api/customer-approvals" && request.method === "POST") {
    const body = await request.json();
    const id = Math.floor(Number(body.customer_request_id)||0);
    const decision = String(body.decision||"").toLowerCase();
    if (!id || !["approved","rejected"].includes(decision)) return json({error:"customer_request_id and decision approved/rejected are required"},400);
    const req = await env.DB.prepare("SELECT * FROM customer_requests WHERE id=?").bind(id).first();
    if (!req) return json({error:"Customer request not found"},404);
    await env.DB.prepare("INSERT INTO customer_approvals(customer_request_id,decision,approved_by,note) VALUES(?,?,?,?)").bind(id,decision,String(body.approved_by||"Owner"),String(body.note||"")).run();
    await env.DB.prepare("UPDATE customer_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(decision==='approved'?'approved':'rejected',id).run();
    try {
      await env.DB.prepare("UPDATE notifications SET status='handled' WHERE related_type='customer_request' AND related_id=? AND status='pending'").bind(id).run();
    } catch (_) {}
    let sourcing = null;
    if (decision === 'approved') {
      try {
        sourcing = await runScheduledPhase2(env);
      } catch (e) {
        sourcing = { ok:false, error:e?.message || String(e) };
      }
    }
    return json({ok:true,customer_request_id:id,approval_status:decision,sourcing});
  }

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

    const requestId = ins.meta?.last_row_id || null;
    try {
      await env.DB.prepare(
        "INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES('internal','dashboard','Owner',?,?, 'customer_request',?,'pending')"
      ).bind(
        "Customer approval required",
        "New customer request from " + customerName + " for " + (productTitle || "product/requirement") + " (Qty " + quantity + "). Owner approval required before quotation/order action.",
        requestId
      ).run();
    } catch (_) {}

    return json({
      success:true,
      request_id:ins.meta?.last_row_id || null,
      buyer_id:buyerId,
      requirement_id:requirementId,
      status:"new",
      message:"Customer request received and added to Pakistan Buyer Center."
    },201);
  }


  // Database schema is maintained by deployment/scheduled migrations; API reads must not
  // rerun the full initialization on every request.
  const path = url.pathname;
  const method = request.method;

  if (path === "/api/health") {
    return json({ ok: true, service: "PAKTHAI TECH AI Sourcing Engine" });
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
<div id="authGate" style="display:flex;position:fixed;inset:0;z-index:99999;background:#f4f6fa;align-items:center;justify-content:center;padding:20px;box-sizing:border-box"><form id="authForm" style="background:white;border:1px solid #ddd;border-radius:16px;padding:26px;width:100%;max-width:420px;box-shadow:0 8px 30px #0002"><h2 style="margin-top:0">PAKTHAI TECH Secure Login</h2><p>Owner and trusted staff use their own account. Your login stays active on this device for up to 8 hours.</p><label for="authRole">Account type</label><select id="authRole" style="width:100%;padding:10px;margin:6px 0 14px"><option value="owner">Owner</option><option value="staff">Trusted Staff (read-only)</option></select><label for="authPassword">Password</label><input id="authPassword" type="password" autocomplete="current-password" required style="width:100%;padding:10px;margin:6px 0 14px;box-sizing:border-box"><button type="submit" style="width:100%">Log In</button><p id="authMessage" role="status" style="white-space:pre-wrap;color:#a11"></p><small>For security, never share the Owner password. Each trusted staff member should use a separate staff credential.</small></form></div>
<header><div><strong>PAKTHAI TECH</strong><div>AI Sourcing Engine</div></div><button onclick="sync()">Sync Source Catalog</button></header>
<main>
<div class="cards">
<div class="card">Products<b id="products">â€”</b></div>
<div class="card">Sellers<b id="sellers">â€”</b></div>
<div class="card" onclick="show('opportunitiesPage')" style="cursor:pointer">Opportunities<b id="opps">â€”</b><small>Click to view sourcing opportunities</small></div>
<div class="card">Active Zones<b id="zones">â€”</b></div>
</div>
<nav>
<button onclick="show('dashboard')">Dashboard</button>
<button onclick="show('seller')">Seller Database</button>
<button onclick="show('opportunity')">Small-Lot Calculator</button>
<button onclick="show('history')">Seller History</button><button onclick="show('opportunitiesPage');loadOpportunitiesPage()">Sourcing Opportunities</button><button onclick="openBuyerCenter()">Pakistan Buyer Center</button><button onclick="show('voicecenter')">Voice Assistant</button>
</nav>
<section id=dashboard class=panel><h2>System Status</h2><p>Database connected. Small-lot sourcing is allowed. Owner approval remains required.</p><p>Customer-facing PakThai Tech remains separate from the upstream source.</p><div class=card style=margin-top:16px><h3>AI Automation Controls - ON / OFF</h3><p>These switches control the AI sourcing automation. Changes save immediately.</p><div class=grid><div><label>Master AI</label><button id=ctrlMaster data-key=master_ai_mode data-type=mode onclick=toggleControl(this)>Loading...</button></div><div><label>Auto Search</label><button id=ctrlSearch data-key=auto_search_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Seller Matching</label><button id=ctrlSeller data-key=seller_matching_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Negotiation</label><button id=ctrlNegotiation data-key=negotiation_mode data-type=mode onclick=toggleControl(this)>Loading...</button></div><div><label>Auto Follow-up</label><button id=ctrlFollowup data-key=auto_followup_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Opportunity Creation</label><button id=ctrlOpportunity data-key=opportunity_creation_enabled onclick=toggleControl(this)>Loading...</button></div></div><h3 style=margin-top:18px>Global Cost Controls</h3><div class=grid><div><label>Travel</label><button data-key=travel_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Pickup</label><button data-key=pickup_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Packing</label><button data-key=packing_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Freight / Shipping</label><button data-key=freight_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Duties</label><button data-key=duty_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Payment</label><button data-key=payment_fee_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Pakistan Transport</label><button data-key=pakistan_transport_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Contingency</label><button data-key=contingency_enabled onclick=toggleControl(this)>Loading...</button></div></div><p style=margin-top:12px><b>Owner Approval:</b> ALWAYS ON / REQUIRED</p></div><div class=card style=margin-top:16px><h3>Country Sourcing Controls</h3><p>Turn sourcing countries ON or OFF. Changes are saved immediately.</p><div class=grid><div><label>Thailand / Bangkok</label><button id=countryThailandBtn data-key=country_thailand_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>South Korea</label><button data-key=country_south_korea_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Singapore</label><button data-key=country_singapore_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Malaysia</label><button data-key=country_malaysia_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Vietnam</label><button data-key=country_vietnam_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Australia</label><button data-key=country_australia_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Pakistan</label><button data-key=country_pakistan_enabled onclick=toggleCountry(this)>Loading...</button></div></div></div><div class=card style=margin-top:16px><h3>Customer Requests — Owner Approval</h3><p>New customer requests stay pending until Owner approves or rejects them.</p><div id=customerRequestsApproval>Loading...</div></div></section>

<section id="voicecenter" class="panel" style="display:none">
<h2>PakThai Voice & Quick Status</h2>
<p>Read-only assistant. Use the microphone where supported, or type a command. It will not approve orders, change settings, or send messages.</p>
<div class="grid">
<div><label>Type a command</label><input id="voiceCommand" placeholder="e.g. system status / catalog sync status / pending approvals / Gmail status"><button onclick="runVoiceCommand(document.getElementById('voiceCommand').value)">Run Command</button><button class="alt" onclick="startVoiceInput()">🎙 Speak</button></div>
<div><label>Assistant result</label><div id="voiceResult" class="card" aria-live="polite">Ready. Try “system status”.</div></div>
</div>
<p id="voiceSupport" style="color:#666;font-size:13px">Voice recognition availability will be checked by your browser.</p>
</section>

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
<button class="alt" onclick="createOpportunity()">Create Opportunity â€” Owner Approval Pending</button>
<div id="calcResult" style="margin-top:18px"></div>
</section>
<section id="history" class="panel" style="display:none">
<h2>Seller History</h2><div id="historyList">Loadingâ€¦</div>
</section>
<section id="opportunitiesPage" class="panel" style="display:none">
<h2>Sourcing Opportunities</h2>
<p>All created sourcing opportunities are listed below. Owner approval remains pending until approved.</p>
<div id="opportunitiesList">Loading...</div>
</section>
</main>
<script>
async function api(p,o){return fetch(p,o).then(r=>r.json())}
async function refresh(){
 const [p,s,z,o]=await Promise.all([api('/api/products'),api('/api/sellers'),api('/api/zones'),api('/api/opportunities')]);
 cachedProducts=p; cachedSellers=s;
 products.textContent=p.length;sellers.textContent=s.length;zones.textContent=z.length;opps.textContent=o.length;
 renderSellers(s);renderHistory();populateOpportunitySelectors();loadCustomerRequestsApproval();
}
async function loadCustomerRequestsApproval(){
  const box=document.getElementById('customerRequestsApproval'); if(!box)return;
  try{
    const r=await api('/api/customer-approvals'); const a=r.requests||[];
    if(!a.length){box.innerHTML='<p>No customer requests yet.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>ID</th><th>Customer</th><th>Request</th><th>Qty</th><th>Budget</th><th>Status</th><th>Owner Action</th></tr>'+a.map(x=>{
      const st=String(x.status||'new'); const pending=!['approved','rejected'].includes(st);
      const action=pending?'<button onclick="setCustomerApproval('+Number(x.id)+',\'approved\')">Approve</button> <button class="alt" onclick="setCustomerApproval('+Number(x.id)+',\'rejected\')">Reject</button>':esc(st);
      return '<tr><td>#'+x.id+'</td><td>'+esc(x.customer_name||'')+'<br><small>'+esc(x.city||'')+'</small></td><td>'+esc(x.product_title||'')+'<br><small>'+esc(x.customer_note||'')+'</small></td><td>'+x.quantity+'</td><td>PKR '+fmt(x.max_budget_pkr||0)+'</td><td>'+esc(st)+'</td><td>'+action+'</td></tr>';
    }).join('')+'</table></div>';
  }catch(e){box.innerHTML='<p style="color:red">'+esc(e.message||String(e))+'</p>';}
}
async function setCustomerApproval(id,decision){
  if(!id || !['approved','rejected'].includes(decision))return;
  const r=await api('/api/customer-approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_request_id:id,decision:decision,approved_by:'Owner'})});
  if(r.error){alert(r.error);return;}
  await loadCustomerRequestsApproval(); await refresh();
}
function show(id){for(const x of ['dashboard','seller','opportunity','history','opportunitiesPage','buyercenter','voicecenter']){const el=document.getElementById(x);if(el)el.style.display=x===id?'block':'none'} if(id==='opportunitiesPage')loadOpportunitiesPage();if(id==='buyercenter')loadBuyerCenter();if(id==='voicecenter')checkVoiceSupport();}

function checkVoiceSupport(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 const el=document.getElementById('voiceSupport');
 if(el)el.textContent=SR?'Voice input available in this browser. Typed commands also work.':'Voice input is not supported here; use the typed command box.';
}
function startVoiceInput(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){checkVoiceSupport();return;}
 const rec=new SR();rec.lang='en-PK';rec.interimResults=false;rec.maxAlternatives=1;
 const el=document.getElementById('voiceResult');
 el.textContent='Listening… please speak a short status command.';
 rec.onresult=e=>{const heard=e.results?.[0]?.[0]?.transcript||'';document.getElementById('voiceCommand').value=heard;runVoiceCommand(heard);};
 rec.onerror=e=>{el.textContent='Voice input error: '+String(e.error||'unknown')+'. You can type the command instead.';};
 rec.onend=()=>checkVoiceSupport();
 try{rec.start();}catch(e){el.textContent='Could not start microphone. Check browser permission or type a command.';}
}
async function runVoiceCommand(raw){
 const cmd=String(raw||'').trim().toLowerCase();
 const out=document.getElementById('voiceResult');
 if(!cmd){out.textContent='Please type or speak a command.';return;}
 out.textContent='Checking…';
 try{
  if(/system status|status system|سسٹم اسٹیٹس|حالت نظام/.test(cmd)){
   const [h,d,c]=await Promise.all([api('/api/health'),api('/api/dashboard'),api('/api/controls')]);
   out.textContent='System: '+(h.ok?'ONLINE':'CHECK REQUIRED')+'; products '+(d.summary?.products??'?')+', sellers '+(d.summary?.sellers??'?')+', buyers '+(d.summary?.buyers??'?')+', opportunities '+(d.summary?.opportunities??'?')+'. Owner approval: '+(c.controls?.owner_approval_required?'REQUIRED':'CHECK REQUIRED')+'.';
  }else if(/catalog|sync status|catalog sync|کیٹلاگ|سنک/.test(cmd)){
   const c=await api('/api/controls');const s=c.controls?.catalog_sync||{};
   out.textContent='Catalog sync: '+String(s.last_status||'NOT REPORTED').toUpperCase()+'. Cursor '+(s.cursor??'?')+', last saved '+(s.last_saved??'?')+', last run '+(s.last_run_at||'not recorded')+'. A PARTIAL status means sync is not confirmed complete.';
  }else if(/pending approvals|approvals|منظوری|pending approval/.test(cmd)){
   const d=await api('/api/dashboard');
   out.textContent='Pending approvals: '+(d.summary?.pending_approval??'not reported')+'. Pending notifications: '+(d.summary?.pending_notifications??'not reported')+'. This command only reads status; it does not approve anything.';
  }else if(/gmail|email|ای میل|جی میل/.test(cmd)){
   const g=await api('/api/gmail/status');
   out.textContent='Gmail authorized: '+String(!!g.authorized).toUpperCase()+'. Sending ready: '+String(!!g.actual_sending_ready).toUpperCase()+'. Real inbound/reply test: NOT VERIFIED.';
  }else if(/whatsapp|واٹس ایپ/.test(cmd)){
   out.textContent='WhatsApp end-to-end status: NOT VERIFIED. Do not treat the outgoing helper as proof that inbound and replies work.';
  }else if(/buyer|seller|opportunity|buyers|sellers|خریدار|سیلر/.test(cmd)){
   const d=await api('/api/dashboard');const s=d.summary||{};
   out.textContent='Products '+(s.products??'?')+'; sellers '+(s.sellers??'?')+'; buyers '+(s.buyers??'?')+'; active requirements '+(s.active_requirements??'?')+'; matches '+(s.buyer_matches??'?')+'; opportunities '+(s.opportunities??'?')+'.';
  }else{
   out.textContent='Command not recognized. Try: system status, catalog sync status, pending approvals, Gmail status, WhatsApp status, or buyer/seller summary.';
  }
 }catch(e){out.textContent='Could not read status: '+String(e.message||e)+'. Please try again.';}
}
async function addSeller(){
 const b={name:sname.value,contact:scontact.value,country:scountry.value,city:scity.value,platform:splatform.value,seller_type:stype.value};
 if(!b.name)return alert('Seller name is required');
 await api('/api/sellers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 sname.value='';scontact.value='';refresh();
}
function renderSellers(a){sellerList.innerHTML='<table><tr><th>Name</th><th>Location</th><th>Platform</th><th>Type</th><th>Status</th></tr>'+a.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc((x.city||'')+', '+(x.country||''))+'</td><td>'+esc(x.platform||'')+'</td><td>'+esc(x.seller_type||'')+'</td><td>'+esc(x.status||'')+'</td></tr>').join('')+'</table>'}
async function renderHistory(){const a=await api('/api/seller-history');historyList.innerHTML='<table><tr><th>Seller</th><th>Product</th><th>Qty</th><th>Asking</th><th>Agreed</th><th>Outcome</th></tr>'+a.map(x=>'<tr><td>'+esc(x.seller_name)+'</td><td>'+esc(x.product_title||'')+'</td><td>'+x.quantity+'</td><td>'+x.asking_price+'</td><td>'+x.agreed_price+'</td><td>'+esc(x.outcome||'')+'</td></tr>').join('')+'</table>'}
async function loadOpportunitiesPage(){
  const box=document.getElementById('opportunitiesList');
  if(!box)return;
  box.textContent='Loading...';
  try{
    const a=await api('/api/opportunities');
    if(!a.length){box.innerHTML='<p>No sourcing opportunities have been created yet.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>ID</th><th>Product</th><th>Seller</th><th>Qty</th><th>Asking / Unit</th><th>Landed Cost / Total</th><th>Retail / Unit</th><th>Expected Profit / Total</th><th>Margin</th><th>Status</th><th>Approval</th><th>Owner Action</th></tr>'+a.map(x=>{const ap=String(x.approval_status||'pending').toLowerCase(); const action=ap==='pending'?'<button onclick="setOpportunityApproval('+Number(x.id)+',&#39;approved&#39;)">Approve</button> <button class="alt" onclick="setOpportunityApproval('+Number(x.id)+',&#39;rejected&#39;)">Reject</button>':esc(ap); return '<tr><td>#'+x.id+'</td><td>'+esc(x.product_title||'')+'</td><td>'+esc(x.seller_name||'')+'</td><td>'+x.quantity+'</td><td>PKR '+fmt(x.asking_price)+'</td><td>PKR '+fmt(x.landed_cost)+'</td><td>PKR '+fmt(x.retail_price_pkr)+'</td><td>PKR '+fmt(x.expected_profit)+'</td><td>'+fmt(x.expected_margin_pct)+'%</td><td>'+esc(x.status||'')+'</td><td>'+esc(ap)+'</td><td>'+action+'</td></tr>';}).join('')+'</table></div>';
  }catch(e){box.innerHTML='<p style="color:red">'+esc(e.message||String(e))+'</p>';}
}
let lastAutomaticCalculation=null;
let cachedProducts=[],cachedSellers=[];
function populateOpportunitySelectors(){
 productSelect.innerHTML=cachedProducts.map(x=>'<option value="'+x.id+'" data-price="'+(x.price_pkr||0)+'">'+esc(x.title)+' â€” PKR '+fmt(x.price_pkr)+'</option>').join('')||'<option value="">No products</option>';
 sellerSelect.innerHTML=cachedSellers.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' â€” '+esc((x.city||'')+', '+(x.country||''))+'</option>').join('')||'<option value="">No sellers</option>';
 updateRetailFromProduct();
}
function updateRetailFromProduct(){const o=productSelect.options[productSelect.selectedIndex]; retail.value=o?Number(o.dataset.price||0):0;}
productSelect.addEventListener('change',updateRetailFromProduct);
async function setOpportunityApproval(id,decision){
  if(!id || !['approved','rejected'].includes(decision)) return;
  const label=decision==='approved'?'approve':'reject';
  if(!confirm('Are you sure you want to '+label+' Opportunity #'+id+'?')) return;
  const r=await api('/api/approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({opportunity_id:id,decision:decision,approved_by:'Owner'})});
  if(r.error){alert(r.error);return;}
  alert('Opportunity #'+id+' is now '+decision+'.');
  await refresh();
  await loadOpportunitiesPage();
}

async function calculateAuto(){
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById("costTravel").checked,pickup:document.getElementById("costPickup").checked,packing:document.getElementById("costPacking").checked,freight:document.getElementById("costFreight").checked,duties:document.getElementById("costDuties").checked,payment:document.getElementById("costPayment").checked,pakistan_transport:document.getElementById("costPakistan").checked,contingency:document.getElementById("costContingency").checked}};
 if(!b.product_id||!b.seller_id)return alert('Product aur Seller select karein.');
 const x=await api('/api/opportunities/calculate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(x.error)return alert(x.error);
 lastAutomaticCalculation=x; margin.value=x.target_margin_pct; retail.value=x.retail_price_pkr;
 const c=x.cost_breakdown||{};
 calcResult.innerHTML='<div class="card"><b>'+esc(x.classification)+'</b><p>Product: '+esc(x.product_title)+'</p><p>Seller: '+esc(x.seller_name)+'</p><p>Auto costs: Travel '+fmt(c.travel)+' | Pickup '+fmt(c.pickup)+' | Packing '+fmt(c.packing)+' | Freight '+fmt(c.freight)+' | Duties '+fmt(c.duties)+' | Payment '+fmt(c.payment)+' | Pakistan transport '+fmt(c.pakistan_transport)+' | Contingency '+fmt(c.contingency)+'</p><p>Landed cost / total: PKR '+fmt(x.landed_total)+'</p><p>Landed cost / unit: PKR '+fmt(x.landed_per_unit)+'</p><p>Max buy/unit for target margin: PKR '+fmt(x.max_buy_per_unit)+'</p><p>Expected profit: PKR '+fmt(x.expected_profit)+'</p><p>Expected margin: '+fmt(x.expected_margin_pct)+'%</p><p>Approval: Pending Owner Approval</p>'+(x.warnings&&x.warnings.length?'<p><b>Settings note:</b> '+esc(x.warnings.join(', '))+'</p>':'')+'</div>';
}
async function createOpportunity(){
 if(!lastAutomaticCalculation) await calculateAuto();
 if(!lastAutomaticCalculation)return;
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById("costTravel").checked,pickup:document.getElementById("costPickup").checked,packing:document.getElementById("costPacking").checked,freight:document.getElementById("costFreight").checked,duties:document.getElementById("costDuties").checked,payment:document.getElementById("costPayment").checked,pakistan_transport:document.getElementById("costPakistan").checked,contingency:document.getElementById("costContingency").checked}};
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
function setControlButton(b,on){
if(!b)return;
b.textContent=on?"ON":"OFF";
b.style.background=on?"#198754":"#777";
b.style.color="white";
b.style.fontWeight="700";
}
async function loadControlPanel(){
try{
const r=await api("/api/controls");
const c=r.controls||{};
const vals={master_ai_mode:String(c.master_ai_mode||"on").toLowerCase()==="on",auto_search_enabled:!!c.auto_search_enabled,seller_matching_enabled:!!c.seller_matching_enabled,negotiation_mode:String(c.negotiation_mode||"on").toLowerCase()==="on",auto_followup_enabled:!!c.auto_followup_enabled,opportunity_creation_enabled:!!c.opportunity_creation_enabled,travel_enabled:!!c.cost_controls?.travel,pickup_enabled:!!c.cost_controls?.pickup,packing_enabled:!!c.cost_controls?.packing,freight_enabled:!!c.cost_controls?.freight,duty_enabled:!!c.cost_controls?.duties,payment_fee_enabled:!!c.cost_controls?.payment,pakistan_transport_enabled:!!c.cost_controls?.pakistan_transport,contingency_enabled:!!c.cost_controls?.contingency};
document.querySelectorAll("button[data-key]").forEach(b=>{if(Object.prototype.hasOwnProperty.call(vals,b.dataset.key))setControlButton(b,vals[b.dataset.key]);});
}catch(e){console.error(e)}}
async function toggleControl(b){
if(!b||!b.dataset.key)return;
const wasOn=b.textContent==="ON";
const key=b.dataset.key;
const value=b.dataset.type==="mode"?(wasOn?"off":"on"):(!wasOn);
try{b.disabled=true;const r=await api("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({[key]:value})});if(!r.ok)throw new Error(r.error||"Update failed");await loadControlPanel();}catch(e){alert(e.message||"Could not update setting");await loadControlPanel();}finally{b.disabled=false}}
async function loadCountryControls(){
 try{
  const r=await api("/api/settings");
  const settings=Array.isArray(r)?Object.fromEntries(r.map(x=>[x.key,x.value])):(r.settings||r);
  document.querySelectorAll("button[data-key^=country_]").forEach(b=>{
   const key=b.dataset.key;
   setControlButton(b,["1","true","yes","on","enabled"].includes(String(settings[key]??"false").toLowerCase()));
  });
 }catch(e){console.error(e)}
}
async function toggleCountry(b){
 if(!b||!b.dataset.key)return;
 const wasOn=b.textContent==="ON",key=b.dataset.key;
 try{
  b.disabled=true;
  const r=await api("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({[key]:!wasOn})});
  if(!r.ok)throw new Error(r.error||"Country setting update failed");
  await loadCountryControls();
 }catch(e){alert(e.message||"Could not update country setting");await loadCountryControls();}
 finally{b.disabled=false}
}
function fmt(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
loadControlPanel();
loadCountryControls();
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
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.name)+'</b> â€” '+esc(x.city||'Pakistan')+' â€” '+esc(x.phone||x.whatsapp||'')+'</div>';
          }).join('')
        : '<p>No Pakistan buyers yet.</p>';
    }

    var r=await api('/api/buyer-requirements');
    var req=r.requirements||[];
    var rl=document.getElementById('requirementList');
    if(rl){
      rl.innerHTML=req.length
        ? req.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.buyer_name||'Buyer')+'</b> â€” '+esc(x.product_keyword||'')+' â€” Qty '+x.quantity+' â€” Budget PKR '+fmt(x.max_budget_pkr||0)+'</div>';
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
async function initPakThaiAuth(){
 const gate=document.getElementById('authGate');
 const form=document.getElementById('authForm');
 const msg=document.getElementById('authMessage');
 function signedIn(role){
  gate.style.display='none';
  const h=document.querySelector('header');
  if(h&&!document.getElementById('authStatus')){
   const box=document.createElement('div');box.id='authStatus';box.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
   box.innerHTML='<span style="font-size:12px">Signed in: '+(role==='owner'?'Owner':'Staff (read-only)')+'</span><button class="alt" id="authLogout">Log Out</button>';
   h.appendChild(box);
   document.getElementById('authLogout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload();};
  }
  if(role==='staff'){
   document.querySelectorAll('button').forEach(b=>{if(/approve|reject|save|create opportunity|sync source catalog|run buyer matching|calculate automatically/i.test(b.textContent||'')){b.title='Staff account is read-only. Ask the Owner to perform this action.';}});
  }
  Promise.all([refresh(),loadControlPanel(),loadCountryControls()]).catch(e=>console.error(e));
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();msg.textContent='Signing in...';
  try{
   const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:document.getElementById('authRole').value,password:document.getElementById('authPassword').value})});
   const j=await r.json();
   if(!r.ok||!j.ok){msg.textContent=j.error||'Login failed';return;}
   document.getElementById('authPassword').value='';signedIn(j.role);
  }catch(err){msg.textContent='Login request failed. Check connection and try again.';}
 });
 try{const r=await fetch('/api/auth/me',{cache:'no-store'});const j=await r.json();if(j.ok&&j.role){signedIn(j.role);return;}
  const status=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'owner',password:''})});
  if(status.status===503){const x=await status.json();msg.textContent=x.error||'Login secrets are not configured yet.';}
 }catch(e){msg.textContent='Secure login service could not be reached.';}
}
initPakThaiAuth();
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
    const r = await env.DB.prepare("INSERT INTO buyers (name,phone,whatsapp,email,city,country,company,status,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,datetime(\"now\"),datetime(\"now\"))").bind(
      name,
      String(x.phone || ""),
      String(x.whatsapp || ""),
      String(x.email || ""),
      String(x.city || "Pakistan"),
      String(x.country || "Pakistan"),
      String(x.company || ""),
      String(x.status || "active"),
      String(x.notes || "")
    ).run();
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
    const r = await env.DB.prepare("INSERT INTO buyer_requirements (buyer_id,product_keyword,quantity,max_budget_pkr,target_price_pkr,notes,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(
      buyerId,
      String(x.product_keyword || ""),
      Math.max(1, Number(x.quantity) || 1),
      Number(x.max_budget_pkr) || 0,
      Number(x.target_price_pkr) || 0,
      String(x.notes || ""),
      "active",
      now,
      now
    ).run();
    return json({ ok: true, id: r.meta.last_row_id });
  }

  if (u.pathname === "/api/buyer-matches" && request.method === "GET") {
    const r = await env.DB.prepare(
      "SELECT bm.*,b.name AS buyer_name,p.title AS product_title,p.price_pkr,s.name AS seller_name " +
      "FROM buyer_matches bm " +
      "JOIN buyers b ON b.id=bm.buyer_id " +
      "JOIN products p ON p.id=bm.product_id " +
      "LEFT JOIN sellers s ON s.id=bm.seller_id " +
      "ORDER BY bm.id DESC"
    ).all();
    return json({ ok: true, matches: r.results || [] });
  }

  if (u.pathname === "/api/buyer-match/run" && request.method === "POST") {
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
}

  return json({ error: "Master Buyer API route not found" }, 404);
}


/*
  BLOCK 8 â€” PRODUCT -> SELLER / SUPPLIER MATCHING

  Uses the existing seller_offers table. No new table is created.
  It evaluates active offers against:
    - requested quantity
    - product retail price
    - target margin
    - configured sourcing costs
    - buyer maximum budget
    - seller status/reliability
    - distance
    - THB -> PKR conversion

  It only assigns seller_id on buyer_matches.
  It DOES NOT purchase anything and DOES NOT create an opportunity.
  Opportunity creation remains Block 9.
*/

function block8OfferCurrencyToPkr(offer, thbToPkr) {
  const currency = String(offer.currency || "THB").trim().toUpperCase();
  const asking = Number(offer.asking_price) || 0;

  if (currency === "PKR") {
    return { supported: true, currency, rate: 1, unitPkr: asking };
  }

  if (currency === "THB") {
    return {
      supported: true,
      currency,
      rate: thbToPkr,
      unitPkr: asking * thbToPkr
    };
  }

  return {
    supported: false,
    currency,
    rate: 0,
    unitPkr: 0
  };
}

async function runProductSellerMatching(db, input = {}) {
  const thbToPkr = Math.max(
    0.01,
    Number(input.thb_to_pkr) || 8.36
  );

  const settings = await getSettings(db);
  if (masterMode(settings) !== "on") {
    return { ok: true, block: 8, paused: true, reason: `Master AI is ${masterMode(settings)}.` , results: [] };
  }
  if (!settingBool(settings, "seller_matching_enabled", true)) {
    return { ok: true, block: 8, paused: true, reason: "Seller Matching is OFF.", results: [] };
  }

  const defaultMargin = Math.max(
    0,
    Number(input.target_margin_pct) ||
      settingNum(settings, "default_margin_pct", 20)
  );

  const onlyUnmatched = input.only_unmatched !== false;
  const apply = input.apply !== false;
  const requestedMatchId = Number(input.buyer_match_id) || 0;
  const limit = Math.min(
    100,
    Math.max(1, Number(input.limit) || 100)
  );

  let matchRows;

  if (requestedMatchId) {
    matchRows = (await db.prepare(`
      SELECT
        bm.*,
        br.quantity AS required_quantity,
        br.max_budget_pkr,
        br.target_price_pkr,
        br.product_keyword,
        b.name AS buyer_name,
        p.title AS product_title,
        p.price_pkr AS retail_price_pkr,
        p.min_margin_pct,
        p.sourcing_enabled
      FROM buyer_matches bm
      JOIN buyer_requirements br ON br.id = bm.requirement_id
      JOIN buyers b ON b.id = bm.buyer_id
      JOIN products p ON p.id = bm.product_id
      WHERE bm.id = ?
      LIMIT 1
    `).bind(requestedMatchId).all()).results || [];
  } else {
    matchRows = (await db.prepare(`
      SELECT
        bm.*,
        br.quantity AS required_quantity,
        br.max_budget_pkr,
        br.target_price_pkr,
        br.product_keyword,
        b.name AS buyer_name,
        p.title AS product_title,
        p.price_pkr AS retail_price_pkr,
        p.min_margin_pct,
        p.sourcing_enabled
      FROM buyer_matches bm
      JOIN buyer_requirements br ON br.id = bm.requirement_id
      JOIN buyers b ON b.id = bm.buyer_id
      JOIN products p ON p.id = bm.product_id
      WHERE p.sourcing_enabled = 1
        ${onlyUnmatched ? "AND bm.seller_id IS NULL" : ""}
      ORDER BY bm.id DESC
      LIMIT ?
    `).bind(limit).all()).results || [];
  }

  const results = [];
  let assigned = 0;
  let unmatched = 0;

  for (const match of matchRows) {
    const quantity = Math.max(
      1,
      Math.floor(Number(match.required_quantity) || 1)
    );

    const retailPerUnit = Number(match.retail_price_pkr) || 0;
    const retailTotal = retailPerUnit * quantity;

    const targetMargin = Math.max(
      defaultMargin,
      Number(match.min_margin_pct) || 0
    );

    const offers = (await db.prepare(`
      SELECT
        so.*,
        s.name AS seller_name,
        s.country AS seller_country,
        s.city AS seller_city,
        s.status AS seller_status,
        s.reliability_score,
        s.response_speed
      FROM seller_offers so
      JOIN sellers s ON s.id = so.seller_id
      WHERE so.product_id = ?
        AND so.status = 'active'
        AND s.status = 'active'
        AND (lower(coalesce(s.country,'')) <> 'pakistan' OR ? = 'true')
      ORDER BY so.id DESC
      LIMIT 100
    `).bind(match.product_id, settingBool(settings, "pakistan_source_enabled", false) ? "true" : "false").all()).results || [];

    const candidates = [];

    for (const offer of offers) {
      if (!sourceLocationAllowed(settings, offer.seller_country, offer.seller_city)) continue;
      const offerQty = Math.max(
        1,
        Math.floor(Number(offer.quantity) || 1)
      );

      if (offerQty < quantity) continue;

      const currency = block8OfferCurrencyToPkr(offer, thbToPkr);
      if (!currency.supported) continue;

      const purchaseTotal = currency.unitPkr * quantity;
      const distance = Math.max(0, Number(offer.distance_km) || 0);

      const travel =
        distance * settingNum(settings, "travel_rate", 0);

      const pickup =
        settingNum(settings, "pickup_rate", 0);

      const packing =
        quantity * settingNum(settings, "packing_rate", 0);

      const freight =
        quantity * settingNum(settings, "freight_rate", 0);

      const duties =
        purchaseTotal *
        settingNum(settings, "duty_rate", 0) / 100;

      const payment =
        retailTotal *
        settingNum(settings, "payment_fee_rate", 0) / 100;

      const pakistanTransport =
        quantity *
        settingNum(settings, "pakistan_transport_rate", 0);

      const preContingency =
        purchaseTotal +
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

      // Solve the maximum purchase price from the configured cost model.
      // Duties and contingency depend on purchase total, so simply subtracting
      // them from maxLandedTotal would under/over-state the real buying ceiling.
      const maxLandedTotal =
        retailTotal * (1 - targetMargin / 100);

      const dutyRate =
        Math.max(0, settingNum(settings, "duty_rate", 0)) / 100;

      const contingencyRate =
        Math.max(0, settingNum(settings, "contingency_rate", 0)) / 100;

      const fixedPreContingency =
        travel +
        pickup +
        packing +
        freight +
        payment +
        pakistanTransport;

      const fixedWithContingency =
        fixedPreContingency * (1 + contingencyRate);

      const purchaseMultiplier =
        (1 + dutyRate) * (1 + contingencyRate);

      const maxPurchaseTotal =
        purchaseMultiplier > 0
          ? Math.max(
              0,
              (maxLandedTotal - fixedWithContingency) /
                purchaseMultiplier
            )
          : 0;

      const maxBuyPerUnit =
        maxPurchaseTotal / quantity;

      const budget =
        Number(match.max_budget_pkr) || 0;

      const budgetPass =
        budget <= 0 || landedTotal <= budget;

      const targetPrice =
        Number(match.target_price_pkr) || 0;

      const targetPricePass =
        targetPrice <= 0 || landedPerUnit <= targetPrice;

      const marginPass =
        retailTotal > 0 && margin >= targetMargin;

      candidates.push({
        offer_id: offer.id,
        seller_id: offer.seller_id,
        seller_name: offer.seller_name,
        seller_country: offer.seller_country,
        seller_city: offer.seller_city,
        reliability_score: Number(offer.reliability_score) || 0,
        response_speed: offer.response_speed || "",
        product_id: match.product_id,
        product_title: match.product_title,
        buyer_match_id: match.id,
        buyer_name: match.buyer_name,
        quantity,
        offer_quantity: offerQty,
        asking_price: Number(offer.asking_price) || 0,
        currency: currency.currency,
        asking_price_pkr_per_unit: currency.unitPkr,
        thb_to_pkr: thbToPkr,
        distance_km: distance,
        retail_price_pkr_per_unit: retailPerUnit,
        purchase_total_pkr: purchaseTotal,
        landed_total_pkr: landedTotal,
        landed_per_unit_pkr: landedPerUnit,
        max_buy_per_unit_pkr: maxBuyPerUnit,
        expected_profit_pkr: profit,
        expected_margin_pct: margin,
        target_margin_pct: targetMargin,
        buyer_max_budget_pkr: budget,
        buyer_target_price_pkr_per_unit: targetPrice,
        budget_pass: budgetPass,
        target_price_pass: targetPricePass,
        margin_pass: marginPass,
        classification:
          marginPass && budgetPass
            ? (quantity <= 5 && distance <= 10
              ? "Local Small-Lot Seller Match"
              : "Seller Match Meets Target")
            : marginPass
              ? "Seller Match - Budget Review"
              : "Seller Match Below Target",
        source: offer.source || "",
        listing_url: offer.listing_url || ""
      });
    }

    candidates.sort((a, b) => {
      const aViable = a.margin_pass && a.budget_pass ? 1 : 0;
      const bViable = b.margin_pass && b.budget_pass ? 1 : 0;
      if (bViable !== aViable) return bViable - aViable;

      if (b.expected_margin_pct !== a.expected_margin_pct) {
        return b.expected_margin_pct - a.expected_margin_pct;
      }

      if (a.landed_total_pkr !== b.landed_total_pkr) {
        return a.landed_total_pkr - b.landed_total_pkr;
      }

      if (a.distance_km !== b.distance_km) {
        return a.distance_km - b.distance_km;
      }

      return b.reliability_score - a.reliability_score;
    });

    const best = candidates[0] || null;

    if (!best) {
      unmatched++;
      results.push({
        buyer_match_id: match.id,
        buyer_name: match.buyer_name,
        product_id: match.product_id,
        product_title: match.product_title,
        required_quantity: quantity,
        seller_id: null,
        match_status: "no_seller_match",
        candidates_checked: 0,
        reason: "No active seller offer found with sufficient quantity and supported currency for this product."
      });
      continue;
    }

    const viable = best.margin_pass && best.budget_pass && best.target_price_pass;

    if (apply && viable) {
      const note =
        `Block 8 seller match: offer #${best.offer_id}; ` +
        `landed PKR ${best.landed_total_pkr.toFixed(2)}; ` +
        `margin ${best.expected_margin_pct.toFixed(2)}%; ` +
        `target ${best.target_margin_pct.toFixed(2)}%; ` +
        `seller match only â€” owner approval still required.`;

      await db.prepare(`
        UPDATE buyer_matches
        SET seller_id=?,
            match_status=?,
            notes=?,
            updated_at=datetime("now")
        WHERE id=?
      `).bind(
        best.seller_id,
        "seller_matched",
        note,
        match.id
      ).run();

      assigned++;
    } else {
      unmatched++;
    }

    results.push({
      ...best,
      match_status:
        viable
          ? (apply ? "seller_matched" : "seller_match_preview")
          : "seller_match_review",
      applied: Boolean(apply && viable),
      candidates_checked: candidates.length
    });
  }

  return {
    ok: true,
    block: 8,
    automatic: true,
    applied: apply,
    thb_to_pkr: thbToPkr,
    target_margin_pct: defaultMargin,
    matches_scanned: matchRows.length,
    assigned,
    unmatched,
    results
  };
}


/*
  BLOCK 9 â€” SELLER MATCH -> SOURCING OPPORTUNITY

  Converts an approved-by-logic seller match into an internal sourcing opportunity.
  It uses the existing opportunities table; no schema change is required.
  This block never purchases anything and always leaves approval_status = pending.
*/

async function buildBlock9Opportunity(db, input = {}) {
  const buyerMatchId = Math.floor(Number(input.buyer_match_id) || 0);
  if (!buyerMatchId) throw new Error("buyer_match_id is required.");

  const settings = await getSettings(db);
  const thbToPkr = Math.max(0.01, Number(input.thb_to_pkr) || 8.36);
  const defaultMargin = Math.max(
    0,
    Number(input.target_margin_pct) || settingNum(settings, "default_margin_pct", 20)
  );

  const match = await db.prepare(`
    SELECT
      bm.*,
      br.quantity AS required_quantity,
      br.max_budget_pkr,
      br.target_price_pkr,
      b.name AS buyer_name,
      p.title AS product_title,
      p.price_pkr AS retail_price_pkr,
      p.min_margin_pct,
      s.name AS seller_name,
      s.country AS seller_country,
      s.city AS seller_city,
      s.status AS seller_status
    FROM buyer_matches bm
    JOIN buyer_requirements br ON br.id=bm.requirement_id
    JOIN buyers b ON b.id=bm.buyer_id
    JOIN products p ON p.id=bm.product_id
    JOIN sellers s ON s.id=bm.seller_id
    WHERE bm.id=?
    LIMIT 1
  `).bind(buyerMatchId).first();

  if (!match) throw new Error("Buyer/seller match was not found.");
  if (!match.seller_id) throw new Error("Seller is not assigned to this buyer match yet.");
  if (!sourceLocationAllowed(settings, match.seller_country, match.seller_city)) {
    throw new Error(`Seller location ${match.seller_city || "Unknown"}, ${match.seller_country || "Unknown"} is disabled for sourcing.`);
  }
  if (String(match.seller_status || "active") !== "active") {
    throw new Error("Matched seller is not active.");
  }

  const quantity = Math.max(1, Math.floor(Number(match.required_quantity) || 1));
  const retailPerUnit = Number(match.retail_price_pkr) || 0;
  const retailTotal = retailPerUnit * quantity;
  const targetMargin = Math.max(defaultMargin, Number(match.min_margin_pct) || 0);

  const offer = await db.prepare(`
    SELECT so.*
    FROM seller_offers so
    WHERE so.product_id=?
      AND so.seller_id=?
      AND so.status='active'
    ORDER BY so.id DESC
    LIMIT 1
  `).bind(match.product_id, match.seller_id).first();

  if (!offer) throw new Error("No active seller offer found for the matched product and seller.");

  const currency = block8OfferCurrencyToPkr(offer, thbToPkr);
  if (!currency.supported) {
    throw new Error(`Unsupported seller-offer currency: ${currency.currency || "unknown"}`);
  }

  const offerQty = Math.max(1, Math.floor(Number(offer.quantity) || 1));
  if (offerQty < quantity) {
    throw new Error(`Seller offer quantity ${offerQty} is below required quantity ${quantity}.`);
  }

  const distance = Math.max(0, Number(offer.distance_km) || 0);
  const travel = distance * costRate(settings, "travel_enabled", "travel_rate");
  const pickup = costRate(settings, "pickup_enabled", "pickup_rate");
  const packing = quantity * costRate(settings, "packing_enabled", "packing_rate");
  const freight = quantity * costRate(settings, "freight_enabled", "freight_rate");
  const purchaseTotal = currency.unitPkr * quantity;
  const duties = purchaseTotal * costRate(settings, "duty_enabled", "duty_rate") / 100;
  const payment = retailTotal * costRate(settings, "payment_fee_enabled", "payment_fee_rate") / 100;
  const pakistanTransport = quantity * costRate(settings, "pakistan_transport_enabled", "pakistan_transport_rate");
  const preContingency = purchaseTotal + travel + pickup + packing + freight + duties + payment + pakistanTransport;
  const contingency = preContingency * costRate(settings, "contingency_enabled", "contingency_rate") / 100;
  const landedTotal = preContingency + contingency;
  const landedPerUnit = landedTotal / quantity;
  const expectedProfit = retailTotal - landedTotal;
  const expectedMargin = retailTotal > 0 ? (expectedProfit / retailTotal) * 100 : 0;
  const maxLandedTotal = retailTotal * (1 - targetMargin / 100);
  const dutyRate = costRate(settings, "duty_enabled", "duty_rate") / 100;
  const contingencyRate = costRate(settings, "contingency_enabled", "contingency_rate") / 100;
  const fixedPreContingency = travel + pickup + packing + freight + payment + pakistanTransport;
  const maxPurchaseTotal = Math.max(
    0,
    (maxLandedTotal - fixedPreContingency * (1 + contingencyRate)) /
      ((1 + dutyRate) * (1 + contingencyRate))
  );
  const maxBuyPerUnit = maxPurchaseTotal / quantity;
  const budget = Number(match.max_budget_pkr) || 0;
  const budgetPass = budget <= 0 || landedTotal <= budget;
  const marginPass = retailTotal > 0 && expectedMargin >= targetMargin;
  const targetPrice = Number(match.target_price_pkr) || 0;
  const targetPricePass = targetPrice <= 0 || landedPerUnit <= targetPrice;
  const viable = marginPass && budgetPass && targetPricePass;

  return {
    buyer_match_id: buyerMatchId,
    buyer_id: match.buyer_id,
    buyer_name: match.buyer_name,
    product_id: match.product_id,
    product_title: match.product_title,
    seller_id: match.seller_id,
    seller_name: match.seller_name,
    offer_id: offer.id,
    offer_quantity: offerQty,
    original_asking_price: Number(offer.asking_price) || 0,
    original_currency: currency.currency,
    asking_price_pkr_per_unit: currency.unitPkr,
    quantity,
    distance_km: distance,
    retail_price_pkr: retailPerUnit,
    target_margin_pct: targetMargin,
    target_price_pkr_per_unit: targetPrice,
    target_price_pass: targetPricePass,
    buyer_max_budget_pkr: budget,
    budget_pass: budgetPass,
    margin_pass: marginPass,
    expected_profit_pkr: expectedProfit,
    expected_margin_pct: expectedMargin,
    landed_total_pkr: landedTotal,
    landed_per_unit_pkr: landedPerUnit,
    max_buy_per_unit_pkr: maxBuyPerUnit,
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
    viable,
    classification: viable
      ? (quantity <= 5 && distance <= 10 ? "Local Small-Lot Opportunity" : "Meets Target Margin")
      : (marginPass ? "Budget Review" : "Below Target Margin")
  };
}

async function handleBlock9Opportunity(request, env) {
  try {
    const body = request.method === "POST"
      ? await request.json().catch(() => ({}))
      : {};

    if (request.method !== "POST") return json({ error: "POST required" }, 405);
    const settings = await getSettings(env.DB);
    if (!automationAllowed(settings, "opportunity_creation_enabled")) {
      return json({ ok: true, block: 9, automatic: true, created: false, paused: true, reason: `Opportunity Creation unavailable while Master AI is ${masterMode(settings)} or Opportunity Creation is OFF.` });
    }

    const calc = await buildBlock9Opportunity(env.DB, body);

    if (!calc.viable) {
      return json({
        ok: true,
        block: 9,
        automatic: true,
        created: false,
        approval_status: "pending",
        calculation: calc,
        message: "Seller match did not meet both target margin and buyer budget; opportunity was not created."
      });
    }

    const duplicate = await env.DB.prepare(`
      SELECT id,status,approval_status
      FROM opportunities
      WHERE notes LIKE ?
      ORDER BY id DESC
      LIMIT 1
    `).bind(`%Block 9 buyer_match_id:${calc.buyer_match_id}%`).first();

    if (duplicate) {
      return json({
        ok: true,
        block: 9,
        automatic: true,
        created: false,
        duplicate: true,
        opportunity_id: duplicate.id,
        approval_status: duplicate.approval_status || "pending",
        calculation: calc
      });
    }

    const zone = await env.DB.prepare(`
      SELECT id
      FROM zones
      WHERE enabled=1
        AND lower(country)=lower(?)
        AND lower(city)=lower(?)
      ORDER BY id
      LIMIT 1
    `).bind(calc.seller_country || "", calc.seller_city || "").first();

    const note = [
      `Block 9 buyer_match_id:${calc.buyer_match_id}`,
      `offer_id:${calc.offer_id}`,
      `buyer:${calc.buyer_name}`,
      `seller:${calc.seller_name}`,
      `source_asking:${calc.original_asking_price} ${calc.original_currency}`,
      `owner approval required`
    ].join(" | ");

    const c = calc.cost_breakdown;
    const r = await env.DB.prepare(`
      INSERT INTO opportunities
      (product_id,seller_id,zone_id,quantity,condition,asking_price,target_price,max_buy_price,
       distance_km,travel_mode,travel_cost,pickup_cost,packing_cost,freight_cost,duties_cost,
       payment_fee,pakistan_transport_cost,contingency_cost,landed_cost,retail_price_pkr,
       target_margin_pct,expected_profit,expected_margin_pct,status,approval_status,notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).bind(
      calc.product_id,
      calc.seller_id,
      zone?.id || null,
      calc.quantity,
      body.condition || "used",
      calc.asking_price_pkr_per_unit,
      calc.target_price_pkr_per_unit || null,
      calc.max_buy_per_unit_pkr,
      calc.distance_km,
      body.travel_mode || null,
      c.travel,
      c.pickup,
      c.packing,
      c.freight,
      c.duties,
      c.payment,
      c.pakistan_transport,
      c.contingency,
      calc.landed_total_pkr,
      calc.retail_price_pkr,
      calc.target_margin_pct,
      calc.expected_profit_pkr,
      calc.expected_margin_pct,
      "new",
      "pending",
      note
    ).run();

    return json({
      ok: true,
      block: 9,
      automatic: true,
      created: true,
      opportunity_id: r.meta?.last_row_id || null,
      approval_status: "pending",
      calculation: calc
    }, 201);
  } catch (error) {
    return json({
      ok: false,
      block: 9,
      error: error?.message || String(error)
    }, 500);
  }
}

async function handleProductSellerMatching(request, env) {
  try {
    const body =
      request.method === "POST"
        ? await request.json().catch(() => ({}))
        : {};

    if (request.method === "GET") {
      const rows = await env.DB.prepare(`
        SELECT
          bm.id AS buyer_match_id,
          bm.match_status,
          bm.seller_id,
          bm.notes,
          bm.updated_at,
          b.name AS buyer_name,
          br.quantity AS required_quantity,
          br.max_budget_pkr,
          br.target_price_pkr,
          p.id AS product_id,
          p.title AS product_title,
          p.price_pkr AS retail_price_pkr,
          s.name AS seller_name,
          s.country AS seller_country,
          s.city AS seller_city
        FROM buyer_matches bm
        JOIN buyers b ON b.id=bm.buyer_id
        JOIN buyer_requirements br ON br.id=bm.requirement_id
        JOIN products p ON p.id=bm.product_id
        LEFT JOIN sellers s ON s.id=bm.seller_id
        ORDER BY bm.id DESC
        LIMIT 200
      `).all();

      return json({
        ok: true,
        block: 8,
        matches: rows.results || []
      });
    }

    if (request.method !== "POST") {
      return json({ error: "POST or GET required" }, 405);
    }

    const result = await runProductSellerMatching(env.DB, body);
    return json(result);
  } catch (error) {
    return json({
      ok: false,
      block: 8,
      error: error?.message || String(error)
    }, 500);
  }
}

async function handleSellerOfferAutoSourcing(request, env) {
  try {
    const url = new URL(request.url);
    const body = request.method === "POST"
      ? await request.json().catch(() => ({}))
      : {};

    const settings = await getSettings(env.DB);
    if (!automationAllowed(settings, "auto_search_enabled")) {
      return json({ ok: true, automatic: true, paused: true, reason: `Auto Search unavailable while Master AI is ${masterMode(settings)} or Auto Search is OFF.` });
    }

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
      if (!sourceLocationAllowed(settings, r.seller_country, r.seller_city)) continue;
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
        distance * costRate(settings, "travel_enabled", "travel_rate");

      const pickup =
        costRate(settings, "pickup_enabled", "pickup_rate");

      const packing =
        quantity * costRate(settings, "packing_enabled", "packing_rate");

      const freight =
        quantity * costRate(settings, "freight_enabled", "freight_rate");

      const duties =
        purchasePKR *
        costRate(settings, "duty_enabled", "duty_rate") / 100;

      const payment =
        retailTotal *
        costRate(settings, "payment_fee_enabled", "payment_fee_rate") / 100;

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
        costRate(settings, "contingency_enabled", "contingency_rate") / 100;

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

      const dutyRate = costRate(settings, "duty_enabled", "duty_rate") / 100;
      const contingencyRate = costRate(settings, "contingency_enabled", "contingency_rate") / 100;
      const fixedPreContingency = travel + pickup + packing + freight + payment + pakistanTransport;
      const maxPurchaseTotal = Math.max(0,
        (maxLandedTotal - fixedPreContingency * (1 + contingencyRate)) /
        ((1 + dutyRate) * (1 + contingencyRate))
      );

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



/*
  BLOCKS 10-17 â€” LANDED COST, OWNER APPROVAL, QUOTATION, ORDER,
  PURCHASE TRACKING, PAKISTAN DELIVERY, NOTIFICATIONS, FINAL DASHBOARD.
  These blocks are owner-controlled workflow tools. No automatic purchasing occurs.
*/
function makeRef(prefix) {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g,'').slice(0,14);
  return `${prefix}-${stamp}-${Math.floor(Math.random()*900+100)}`;
}

async function getOpportunityFull(db, id) {
  return await db.prepare(`
    SELECT o.*, p.title AS product_title, p.price_pkr AS current_retail_pkr,
           s.name AS seller_name, s.country AS seller_country, s.city AS seller_city
    FROM opportunities o
    LEFT JOIN products p ON p.id=o.product_id
    LEFT JOIN sellers s ON s.id=o.seller_id
    WHERE o.id=? LIMIT 1`).bind(id).first();
}

async function handleFinalBlocks(request, env) {
  const u = new URL(request.url);
  const path = u.pathname;
  const method = request.method;
  const body = method === 'POST' || method === 'PUT' ? await request.json().catch(()=>({})) : {};

    // BLOCK 10 Ã¢â‚¬â€ Landed cost / margin
  if (path === '/api/landed-cost/calculate' && method === 'POST') {
    const settings = await getSettings(env.DB);

    const opportunityId = Math.floor(Number(body.opportunity_id || 0));
    const opp = opportunityId ? await getOpportunityFull(env.DB, opportunityId) : null;
    if (opportunityId && !opp) return json({ error: 'Opportunity not found' }, 404);

    const productId = Math.floor(Number(body.product_id || opp?.product_id || 0));
    const product = productId
      ? await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(productId).first()
      : null;

    const quantity = Math.max(
      1,
      Math.floor(Number(body.quantity ?? opp?.quantity ?? 1))
    );

    const retailPrice = Math.max(
      0,
      Number(
        body.retail_price_pkr ??
        opp?.current_retail_pkr ??
        opp?.retail_price_pkr ??
        product?.price_pkr ??
        0
      )
    );

    const askingPrice = Math.max(
      0,
      Number(body.asking_price ?? opp?.asking_price ?? 0)
    );

    const targetMargin = Math.max(
      20,
      Number(
        body.target_margin_pct ??
        opp?.target_margin_pct ??
        settings.default_margin_pct ??
        20
      )
    );

    const distanceKm = Math.max(
      0,
      Number(body.distance_km ?? opp?.distance_km ?? 0)
    );

    const travel = body.travel_cost != null
      ? Math.max(0, Number(body.travel_cost))
      : (
          opp?.travel_cost != null
            ? Math.max(0, Number(opp.travel_cost))
            : distanceKm * costRate(settings, 'travel_enabled', 'travel_rate')
        );

    const pickup = body.pickup_cost != null
      ? Math.max(0, Number(body.pickup_cost))
      : (
          opp?.pickup_cost != null
            ? Math.max(0, Number(opp.pickup_cost))
            : quantity * costRate(settings, 'pickup_enabled', 'pickup_rate')
        );

    const packing = body.packing_cost != null
      ? Math.max(0, Number(body.packing_cost))
      : (
          opp?.packing_cost != null
            ? Math.max(0, Number(opp.packing_cost))
            : quantity * costRate(settings, 'packing_enabled', 'packing_rate')
        );

    const freight = body.freight_cost != null
      ? Math.max(0, Number(body.freight_cost))
      : (
          opp?.freight_cost != null
            ? Math.max(0, Number(opp.freight_cost))
            : quantity * costRate(settings, 'freight_enabled', 'freight_rate')
        );

    const pakistanTransport = body.pakistan_transport_cost != null
      ? Math.max(0, Number(body.pakistan_transport_cost))
      : (
          opp?.pakistan_transport_cost != null
            ? Math.max(0, Number(opp.pakistan_transport_cost))
            : quantity * costRate(settings, 'pakistan_transport_enabled', 'pakistan_transport_rate')
        );

    const paymentRate =
      costRate(settings, 'payment_fee_enabled', 'payment_fee_rate') / 100;

    const dutyRate =
      costRate(settings, 'duty_enabled', 'duty_rate') / 100;

    const contingencyRate =
      costRate(settings, 'contingency_enabled', 'contingency_rate') / 100;

    const purchaseTotal = askingPrice * quantity;

    const paymentFee = body.payment_fee != null
      ? Math.max(0, Number(body.payment_fee))
      : (
          opp?.payment_fee != null
            ? Math.max(0, Number(opp.payment_fee))
            : purchaseTotal * paymentRate
        );

    const duties = body.duties_cost != null
      ? Math.max(0, Number(body.duties_cost))
      : (
          opp?.duties_cost != null
            ? Math.max(0, Number(opp.duties_cost))
            : purchaseTotal * dutyRate
        );

    const fixedPreContingency =
      travel +
      pickup +
      packing +
      freight +
      paymentFee +
      pakistanTransport;

    const preContingency =
      purchaseTotal +
      fixedPreContingency +
      duties;

    const contingency = body.contingency_cost != null
      ? Math.max(0, Number(body.contingency_cost))
      : (
          opp?.contingency_cost != null
            ? Math.max(0, Number(opp.contingency_cost))
            : preContingency * contingencyRate
        );

    const landedTotal = preContingency + contingency;
    const landedPerUnit = landedTotal / quantity;
    const retailTotal = retailPrice * quantity;
    const expectedProfit = retailTotal - landedTotal;

    const expectedMargin = retailTotal > 0
      ? (expectedProfit / retailTotal) * 100
      : 0;

    const maxLandedTotal =
      retailTotal * (1 - targetMargin / 100);

    // Solve the maximum purchase ceiling algebraically so duty
    // and contingency are applied consistently.
    const maxPurchaseTotal = Math.max(
      0,
      (
        maxLandedTotal -
        fixedPreContingency * (1 + contingencyRate)
      ) /
      (
        (1 + dutyRate) *
        (1 + contingencyRate)
      )
    );

    const maxBuyPerUnit = maxPurchaseTotal / quantity;

    const marginPass = expectedMargin >= targetMargin;

    const budgetPass =
      body.buyer_max_budget_pkr == null ||
      landedTotal <= Math.max(
        0,
        Number(body.buyer_max_budget_pkr)
      );

    const classification =
      retailTotal <= 0
        ? 'Needs Retail Reference'
        : marginPass && budgetPass
          ? 'Meets Target Margin'
          : !budgetPass
            ? 'Above Buyer Budget'
            : 'Below Target Margin';

    const pending_costs = [
      ['travel_enabled','travel_rate','travel'],['pickup_enabled','pickup_rate','pickup'],
      ['packing_enabled','packing_rate','packing'],['freight_enabled','freight_rate','freight'],
      ['duty_enabled','duty_rate','duties'],['payment_fee_enabled','payment_fee_rate','payment'],
      ['pakistan_transport_enabled','pakistan_transport_rate','pakistan_transport'],
      ['contingency_enabled','contingency_rate','contingency']
    ].filter(([ek,rk]) => settingBool(settings,ek,true) && settingNum(settings,rk,0) === 0)
     .map(([, ,label]) => label);

    return json({
      ok: true,
      block: 10,
      opportunity_id: opportunityId || null,
      product_id: productId || null,
      quantity,
      asking_price: askingPrice,
      retail_price_pkr: retailPrice,
      target_margin_pct: targetMargin,
      purchase_total: purchaseTotal,
      landed_total: landedTotal,
      landed_per_unit: landedPerUnit,
      retail_total: retailTotal,
      expected_profit: expectedProfit,
      expected_margin_pct: expectedMargin,
      max_purchase_total: maxPurchaseTotal,
      max_buy_per_unit: maxBuyPerUnit,
      margin_pass: marginPass,
      budget_pass: budgetPass,
      viable: marginPass && budgetPass,
      pending_costs,
      costs_complete: pending_costs.length === 0,
      classification,
      cost_breakdown: {
        travel,
        pickup,
        packing,
        freight,
        duties,
        payment: paymentFee,
        pakistan_transport: pakistanTransport,
        contingency
      }
    });
  }
if (path === '/api/settings' && method === 'POST') {
    const entries = body.settings && typeof body.settings === 'object' ? body.settings : body;
    const allowed = new Set([
      'default_margin_pct','small_lot_allowed','owner_approval_required','travel_rate','pickup_rate','packing_rate','freight_rate','duty_rate','payment_fee_rate','pakistan_transport_rate','contingency_rate','thb_to_pkr',
      'master_ai_mode','auto_search_enabled','seller_matching_enabled','negotiation_mode','auto_followup_enabled','negotiation_max_attempts','negotiation_followup_delay_hours','opportunity_creation_enabled',
      'travel_enabled','pickup_enabled','packing_enabled','freight_enabled','duty_enabled','payment_fee_enabled','pakistan_transport_enabled','contingency_enabled','missing_rate_action',
      'country_thailand_enabled','country_thailand_city_scope','country_south_korea_enabled','country_singapore_enabled','country_malaysia_enabled','country_vietnam_enabled','country_australia_enabled','country_pakistan_enabled','pakistan_source_enabled'
    ]);
    for (const [k,v] of Object.entries(entries)) {
      if (!allowed.has(k)) continue;
      if (k === 'owner_approval_required') {
        await env.DB.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(k,'true').run();
      } else {
        await env.DB.prepare(`INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(k,String(v)).run();
      }
    }
    await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('owner_approval_required','true') ON CONFLICT(key) DO UPDATE SET value='true'`).run();
    return json({ok:true,settings:await getSettings(env.DB),owner_approval_required:true});
  }

  // PERMANENT CONTROLS / NEGOTIATION
  if (path === '/api/controls' && method === 'GET') {
    const settings = await getSettings(env.DB);
    return json({
      ok:true,
      controls:{
        master_ai_mode: masterMode(settings),
        auto_search_enabled: settingBool(settings,'auto_search_enabled',true),
        seller_matching_enabled: settingBool(settings,'seller_matching_enabled',true),
        negotiation_mode: String(settings.negotiation_mode || 'on'),
        auto_followup_enabled: settingBool(settings,'auto_followup_enabled',true),
        negotiation_max_attempts: Math.max(1,Math.floor(settingNum(settings,'negotiation_max_attempts',3))),
        negotiation_followup_delay_hours: Math.max(1,settingNum(settings,'negotiation_followup_delay_hours',24)),
        opportunity_creation_enabled: settingBool(settings,'opportunity_creation_enabled',true),
        cost_controls:{travel:settingBool(settings,'travel_enabled',true),pickup:settingBool(settings,'pickup_enabled',true),packing:settingBool(settings,'packing_enabled',true),freight:settingBool(settings,'freight_enabled',true),duties:settingBool(settings,'duty_enabled',true),payment:settingBool(settings,'payment_fee_enabled',true),pakistan_transport:settingBool(settings,'pakistan_transport_enabled',true),contingency:settingBool(settings,'contingency_enabled',true)},
        owner_approval_required: true,
        missing_rate_action: 'pending',
        catalog_sync:{
          enabled: settingBool(settings,'catalog_sync_enabled',true),
          batch_size: Math.max(1,Math.min(25,Math.floor(settingNum(settings,'catalog_sync_batch_size',25)))),
          cursor: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_cursor',0))),
          last_run_at: settings.catalog_sync_last_run_at || null,
          last_saved: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_saved',0))),
          last_status: settings.catalog_sync_last_status || null
        },
        countries:{
          Thailand: settingBool(settings,'country_thailand_enabled',true),
          ThailandCityScope: settings.country_thailand_city_scope || 'Bangkok',
          'South Korea': settingBool(settings,'country_south_korea_enabled',true),
          Singapore: settingBool(settings,'country_singapore_enabled',false),
          Malaysia: settingBool(settings,'country_malaysia_enabled',false),
          Vietnam: settingBool(settings,'country_vietnam_enabled',false),
          Australia: settingBool(settings,'country_australia_enabled',false),
          Pakistan: settingBool(settings,'country_pakistan_enabled',true),
          PakistanSource: settingBool(settings,'pakistan_source_enabled',false)
        }
      }
    });
  }

  if (path === '/api/negotiations' && method === 'GET') {
    const r = await env.DB.prepare(`SELECT n.*,s.name AS seller_name,s.country AS seller_country,s.city AS seller_city FROM negotiations n LEFT JOIN sellers s ON s.id=n.seller_id ORDER BY n.id DESC LIMIT 200`).all();
    return json({ok:true,negotiations:r.results||[]});
  }

  if (path === '/api/negotiations' && method === 'POST') {
    const settings = await getSettings(env.DB);
    const mode = String(settings.negotiation_mode || 'on').toLowerCase();
    if (masterMode(settings) !== 'on' || mode !== 'on') return json({ok:true,created:false,paused:true,reason:`Negotiation is ${mode} or Master AI is ${masterMode(settings)}.`},409);
    const sellerId = Math.floor(num(body.seller_id));
    const offerId = Math.floor(num(body.offer_id));
    if (!sellerId) return json({error:'seller_id is required'},400);
    const seller = await env.DB.prepare(`SELECT * FROM sellers WHERE id=? LIMIT 1`).bind(sellerId).first();
    if (!seller) return json({error:'Seller not found'},404);
    if (!sourceLocationAllowed(settings,seller.country,seller.city)) return json({error:`Seller location ${seller.city || 'Unknown'}, ${seller.country || 'Unknown'} is disabled for sourcing.`},409);
    const negotiationId = await createNegotiation(env.DB, body);
    const maxAttempts = Math.max(1,Math.floor(settingNum(settings,'negotiation_max_attempts',3)));
    return json({ok:true,negotiation_id:negotiationId,status:'active',attempt_count:0,max_attempts:maxAttempts,followup_enabled:settingBool(settings,'auto_followup_enabled',true)},201);
  }

  if (path === '/api/negotiations/message' && method === 'POST') {
    const settings = await getSettings(env.DB);
    const negotiationMode = String(settings.negotiation_mode || 'on').toLowerCase();
    if (masterMode(settings) !== 'on' || negotiationMode !== 'on') {
      return json({ok:true,negotiation_id:Math.floor(num(body.negotiation_id)) || null,paused:true,reason:`Negotiation is ${negotiationMode} or Master AI is ${masterMode(settings)}.`},409);
    }
    const id = Math.floor(num(body.negotiation_id));
    const n = id ? await env.DB.prepare(`SELECT * FROM negotiations WHERE id=?`).bind(id).first() : null;
    if (!n) return json({error:'Negotiation not found'},404);
    const seller = await env.DB.prepare(`SELECT country,city FROM sellers WHERE id=? LIMIT 1`).bind(n.seller_id).first();
    if (!seller || !sourceLocationAllowed(settings, seller.country, seller.city)) return json({error:'Seller location is disabled for sourcing.'},409);
    if (String(n.status || '') === 'completed' || String(n.status || '') === 'cancelled') return json({error:`Negotiation is ${n.status}.`},409);
    if (Number(n.attempt_count || 0) >= Number(n.max_attempts || 3)) return json({error:'Negotiation attempt limit reached.'},409);
    const attempt = Math.min(Math.max(1,Number(n.attempt_count||0)+1),Math.max(1,Number(n.max_attempts||3)));
    const proposed = Math.max(0,num(body.proposed_price_pkr || n.last_offer_price_pkr || n.original_price_pkr));
    const nextHours = Math.max(1,settingNum(settings,'negotiation_followup_delay_hours',24));
    const message = String(body.message || `PakThai Tech price request: please confirm your best final price for this quantity. Our target buying price is PKR ${proposed.toFixed(2)} per unit.`);
    const followup = settingBool(settings,'auto_followup_enabled',true) && attempt < Number(n.max_attempts||3);
    const next = followup ? new Date(Date.now()+nextHours*3600000).toISOString() : null;
    await env.DB.prepare(`UPDATE negotiations SET attempt_count=?,last_contact_at=CURRENT_TIMESTAMP,last_offer_price_pkr=?,next_followup_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(attempt,proposed,next,followup?'follow_up_pending':'waiting_response',id).run();
    const recipient = String(body.recipient || '').replace(/[^0-9]/g, '');
    const sendResult = await sendWhatsAppCloudMessage(env, recipient, message);
    const notificationStatus = sendResult.sent ? 'sent' : 'prepared';
    const sentAt = sendResult.sent ? new Date().toISOString() : null;
    const r = await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status,sent_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind('external','whatsapp',recipient,'Seller negotiation message',message,'negotiation',id,notificationStatus,sentAt).run();
    return json({
      ok:true,
      negotiation_id:id,
      attempt_count:attempt,
      max_attempts:Number(n.max_attempts||3),
      status:followup?'follow_up_pending':'waiting_response',
      next_followup_at:next,
      notification_id:r.meta?.last_row_id||null,
      message,
      actual_sending:sendResult.sent ? 'sent' : 'prepared_only',
      whatsapp:sendResult
    });
  }

  if (path === '/api/negotiations/followups' && method === 'POST') {
    const settings = await getSettings(env.DB);
    const negotiationMode = String(settings.negotiation_mode || 'on').toLowerCase();
    if (masterMode(settings) !== 'on' || negotiationMode !== 'on' || !settingBool(settings,'auto_followup_enabled',true)) {
      return json({ok:true,processed:0,paused:true,reason:`Auto follow-up unavailable while Master AI is ${masterMode(settings)}, Negotiation is ${negotiationMode}, or Auto Follow-up is OFF.`},409);
    }
    const now = new Date().toISOString();
    const due = await env.DB.prepare(`SELECT n.*,s.name AS seller_name,s.contact AS seller_contact,s.country AS seller_country,s.city AS seller_city FROM negotiations n LEFT JOIN sellers s ON s.id=n.seller_id WHERE n.status='follow_up_pending' AND n.next_followup_at IS NOT NULL AND n.next_followup_at <= ? ORDER BY n.id ASC LIMIT 100`).bind(now).all();
    const processed = [];
    for (const n of (due.results || [])) {
      if (!sourceLocationAllowed(settings,n.seller_country,n.seller_city)) {
        await env.DB.prepare(`UPDATE negotiations SET status='paused',updated_at=CURRENT_TIMESTAMP,notes=COALESCE(notes,'') || ? WHERE id=?`).bind(' Seller location disabled by sourcing controls.',n.id).run();
        continue;
      }
      const attempts = Number(n.attempt_count || 0);
      const maxAttempts = Math.max(1,Number(n.max_attempts || settingNum(settings,'negotiation_max_attempts',3)));
      if (attempts >= maxAttempts) {
        await env.DB.prepare(`UPDATE negotiations SET status='waiting_response',next_followup_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(n.id).run();
        continue;
      }
      const proposed = Math.max(0,Number(n.last_offer_price_pkr || n.original_price_pkr || 0));
      const message = `PakThai Tech follow-up: please confirm your best final price for the requested quantity. Our current target buying price is PKR ${proposed.toFixed(2)} per unit.`;
      const recipient = String(n.seller_contact || '').replace(/[^0-9]/g, '');
      const sendResult = await sendWhatsAppCloudMessage(env, recipient, message);
      const notificationStatus = sendResult.sent ? 'sent' : 'prepared';
      const sentAt = sendResult.sent ? new Date().toISOString() : null;
      const r = await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status,sent_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind('external','whatsapp',recipient,`Seller follow-up: ${n.seller_name || 'Seller'}`,message,'negotiation',n.id,notificationStatus,sentAt).run();
      const nextHours = Math.max(1,settingNum(settings,'negotiation_followup_delay_hours',24));
      const next = attempts + 1 < maxAttempts ? new Date(Date.now()+nextHours*3600000).toISOString() : null;
      await env.DB.prepare(`UPDATE negotiations SET attempt_count=?,last_contact_at=CURRENT_TIMESTAMP,next_followup_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(attempts+1,next,next?'follow_up_pending':'waiting_response',n.id).run();
      processed.push({negotiation_id:n.id,notification_id:r.meta?.last_row_id || null,attempt_count:attempts+1,max_attempts:maxAttempts,next_followup_at:next,actual_sending:sendResult.sent ? 'sent' : 'prepared_only',whatsapp:sendResult});
    }
    return json({ok:true,processed:processed.length,results:processed,actual_sending:processed.length && processed.every(x => x.actual_sending === 'sent') ? 'sent' : (processed.some(x => x.actual_sending === 'sent') ? 'partial' : 'prepared_only')});
  }

  // BLOCK 11 â€” Owner approval
  if (path === '/api/approvals' && method === 'GET') {
    const r=await env.DB.prepare(`SELECT o.*,p.title AS product_title,s.name AS seller_name FROM opportunities o LEFT JOIN products p ON p.id=o.product_id LEFT JOIN sellers s ON s.id=o.seller_id ORDER BY o.id DESC LIMIT 200`).all();
    return json({ok:true,opportunities:r.results||[]});
  }
  if (path === '/api/approvals' && method === 'POST') {
    const id=Math.floor(num(body.opportunity_id)); const decision=String(body.decision||'').toLowerCase();
    if(!id || !['approved','rejected'].includes(decision)) return json({error:'opportunity_id and decision approved/rejected are required'},400);
    const opp=await getOpportunityFull(env.DB,id); if(!opp) return json({error:'Opportunity not found'},404);
    await env.DB.prepare(`INSERT INTO owner_approvals(opportunity_id,decision,approved_by,note) VALUES(?,?,?,?)`).bind(id,decision,String(body.approved_by||'Owner'),String(body.note||'')).run();
    await env.DB.prepare(`UPDATE opportunities SET approval_status=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(decision,decision==='approved'?'approved':'rejected',id).run();
    return json({ok:true,block:11,opportunity_id:id,approval_status:decision});
  }

  // BLOCK 12 â€” Quotation
  if (path === '/api/quotations' && method === 'GET') {
    const r=await env.DB.prepare(`SELECT q.*,p.title AS product_title FROM quotations q LEFT JOIN products p ON p.id=q.product_id ORDER BY q.id DESC LIMIT 200`).all();
    return json({ok:true,quotations:r.results||[]});
  }
  if (path === '/api/quotations' && method === 'POST') {
    const opp=await getOpportunityFull(env.DB,Math.floor(num(body.opportunity_id))); if(!opp) return json({error:'Opportunity not found'},404);
    if(String(opp.approval_status||'pending')!=='approved') return json({error:'Owner approval is required before quotation.'},409);
    const qty=Math.max(1,Math.floor(num(body.quantity)||opp.quantity||1));
    const unit=Math.max(0,num(body.unit_price_pkr)||num(opp.retail_price_pkr)||num(opp.current_retail_pkr));
    const total=unit*qty; const ref=String(body.quote_number||makeRef('PTQ'));
    const r=await env.DB.prepare(`INSERT INTO quotations(opportunity_id,buyer_id,product_id,quote_number,customer_name,customer_phone,customer_whatsapp,quantity,unit_price_pkr,total_price_pkr,valid_until,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(opp.id,body.buyer_id?num(body.buyer_id):null,opp.product_id,ref,String(body.customer_name||''),String(body.customer_phone||''),String(body.customer_whatsapp||''),qty,unit,total,String(body.valid_until||''),'sent',String(body.notes||'')).run();
    return json({ok:true,block:12,quotation_id:r.meta?.last_row_id,quote_number:ref,total_price_pkr:total},201);
  }

  // BLOCK 13 â€” Customer order
  if (path === '/api/orders' && method === 'GET') {
    const r=await env.DB.prepare(`SELECT o.*,q.quote_number,p.title AS product_title FROM orders o LEFT JOIN quotations q ON q.id=o.quotation_id LEFT JOIN products p ON p.id=o.product_id ORDER BY o.id DESC LIMIT 200`).all();
    return json({ok:true,orders:r.results||[]});
  }
  if (path === '/api/orders' && method === 'POST') {
  const qid = Math.floor(num(body.quotation_id));
  if (!qid) {
    return json({error:'quotation_id is required. Order must be created from an approved quotation.'},400);
  }

  const q = await env.DB.prepare(`SELECT * FROM quotations WHERE id=?`).bind(qid).first();
  if (!q) {
    return json({error:'Quotation not found'},404);
  }

  const opp = q.opportunity_id
    ? await getOpportunityFull(env.DB,Math.floor(num(q.opportunity_id)))
    : null;

  if (!opp) {
    return json({error:'Quotation opportunity not found'},404);
  }

  if (String(opp.approval_status||'pending') !== 'approved') {
    return json({error:'Owner approval is required before order creation.'},409);
  }

  if (body.opportunity_id && Math.floor(num(body.opportunity_id)) !== Number(opp.id)) {
    return json({error:'Quotation and opportunity do not match'},400);
  }

  const qty = Math.max(
    1,
    Math.floor(num(body.quantity) || q.quantity || opp.quantity || 1)
  );

  const unit =
    num(body.sale_unit_price_pkr) ||
    q.unit_price_pkr ||
    opp.retail_price_pkr ||
    opp.current_retail_pkr ||
    0;

  const ref = String(body.order_number || makeRef('PTO'));

  const r = await env.DB.prepare(`
    INSERT INTO orders(
      quotation_id,
      opportunity_id,
      buyer_id,
      order_number,
      product_id,
      quantity,
      sale_unit_price_pkr,
      sale_total_pkr,
      status,
      payment_status,
      customer_note
    )
    VALUES(?,?,?,?,?,?,?,?,?,?,?)
  `).bind(
    q.id,
    opp.id,
    body.buyer_id ? num(body.buyer_id) : (q.buyer_id || null),
    ref,
    q.product_id || opp.product_id,
    qty,
    unit,
    unit * qty,
    'confirmed',
    'pending',
    String(body.customer_note || '')
  ).run();

  await env.DB.prepare(`
    INSERT INTO notifications(
      type,
      channel,
      recipient,
      subject,
      message,
      related_type,
      related_id,
      status
    )
    VALUES('internal','dashboard','Owner','New order',?,?,?,'pending')
  `).bind(
    `Order ${ref} created`,
    'order',
    r.meta?.last_row_id
  ).run();

  return json({
    ok:true,
    block:13,
    order_id:r.meta?.last_row_id,
    order_number:ref
  },201);
}

  // BLOCK 14 â€” Supplier purchase tracking
  if (path === '/api/purchases' && method === 'GET') { const r=await env.DB.prepare(`SELECT pt.*,o.order_number,s.name AS seller_name FROM purchase_tracking pt LEFT JOIN orders o ON o.id=pt.order_id LEFT JOIN sellers s ON s.id=pt.seller_id ORDER BY pt.id DESC LIMIT 200`).all(); return json({ok:true,purchases:r.results||[]}); }
  if (path === '/api/purchases' && method === 'POST') {
    const orderId=Math.floor(num(body.order_id)); if(!orderId) return json({error:'order_id is required'},400);
    const order=await env.DB.prepare(`SELECT * FROM orders WHERE id=? LIMIT 1`).bind(orderId).first();
    if(!order) return json({error:'Order not found'},404);
    if (!['confirmed','purchasing'].includes(String(order.status||''))) return json({error:`Order is not ready for purchase tracking: ${order.status || 'unknown'}`},409);
    const r=await env.DB.prepare(`INSERT INTO purchase_tracking(order_id,opportunity_id,seller_id,purchase_status,agreed_price_pkr,currency,quantity,purchase_date,tracking_ref,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(orderId,body.opportunity_id?num(body.opportunity_id):order.opportunity_id,body.seller_id?num(body.seller_id):null,String(body.purchase_status||'pending'),num(body.agreed_price_pkr),String(body.currency||'PKR'),Math.max(1,Math.floor(num(body.quantity)||order.quantity||1)),String(body.purchase_date||''),String(body.tracking_ref||''),String(body.notes||'')).run();
    await env.DB.prepare(`UPDATE orders SET status='purchasing',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run(); return json({ok:true,block:14,purchase_id:r.meta?.last_row_id},201);
  }

  // BLOCK 15 â€” Pakistan delivery tracking
  if (path === '/api/deliveries' && method === 'GET') { const r=await env.DB.prepare(`SELECT d.*,o.order_number FROM delivery_tracking d LEFT JOIN orders o ON o.id=d.order_id ORDER BY d.id DESC LIMIT 200`).all(); return json({ok:true,deliveries:r.results||[]}); }
  if (path === '/api/deliveries' && method === 'POST') {
    const orderId=Math.floor(num(body.order_id)); if(!orderId) return json({error:'order_id is required'},400);
    const order=await env.DB.prepare(`SELECT * FROM orders WHERE id=? LIMIT 1`).bind(orderId).first();
    if(!order) return json({error:'Order not found'},404);
    if (!['purchasing','delivery'].includes(String(order.status||''))) return json({error:`Order is not ready for delivery tracking: ${order.status || 'unknown'}`},409);
    const status=String(body.delivery_status||'pending');
    const r=await env.DB.prepare(`INSERT INTO delivery_tracking(order_id,delivery_status,carrier,tracking_number,origin,destination,estimated_date,delivered_date,notes) VALUES(?,?,?,?,?,?,?,?,?)`).bind(orderId,status,String(body.carrier||''),String(body.tracking_number||''),String(body.origin||''),String(body.destination||'Faisalabad, Pakistan'),String(body.estimated_date||''),String(body.delivered_date||''),String(body.notes||'')).run();
    await env.DB.prepare(`UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status==='delivered'?'completed':'delivery',orderId).run(); return json({ok:true,block:15,delivery_id:r.meta?.last_row_id},201);
  }

  // BLOCK 16 â€” Notifications / WhatsApp helper
  if (path === '/api/notifications' && method === 'GET') { const r=await env.DB.prepare(`SELECT * FROM notifications ORDER BY id DESC LIMIT 200`).all(); return json({ok:true,notifications:r.results||[]}); }
  if (path === '/api/notifications' && method === 'POST') {
    const r=await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES(?,?,?,?,?,?,?,?)`).bind(String(body.type||'internal'),String(body.channel||'dashboard'),String(body.recipient||''),String(body.subject||''),String(body.message||''),String(body.related_type||''),body.related_id?num(body.related_id):null,String(body.status||'pending')).run(); return json({ok:true,block:16,notification_id:r.meta?.last_row_id},201);
  }
  if (path === '/api/notifications/whatsapp' && method === 'POST') {
    const phone=String(body.phone||body.whatsapp||'').replace(/[^0-9]/g,''); const message=String(body.message||''); if(!phone||!message) return json({error:'phone and message are required'},400);
    const link=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const sendResult = await sendWhatsAppCloudMessage(env, phone, message);
    const notificationStatus = sendResult.sent ? 'sent' : 'prepared';
    const sentAt = sendResult.sent ? new Date().toISOString() : null;
    const r=await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,status,sent_at) VALUES(?,?,?,?,?,?,?)`).bind('external','whatsapp',phone,'WhatsApp message',message,notificationStatus,sentAt).run();
    return json({ok:true,block:16,notification_id:r.meta?.last_row_id,whatsapp_url:link,actual_sending:sendResult.sent ? 'sent' : 'prepared_only',whatsapp:sendResult});
  }

  // BLOCK 17 â€” Final dashboard summary
  if (path === '/api/dashboard' && method === 'GET') {
    const one=async(sql)=>{const r=await env.DB.prepare(sql).first();return r||{n:0};};
    const [products,sellers,buyers,reqs,matches,opps,pending,approved,quotes,orders,purchases,deliveries,notes]=await Promise.all([
      one(`SELECT COUNT(*) n FROM products`),one(`SELECT COUNT(*) n FROM sellers`),one(`SELECT COUNT(*) n FROM buyers`),one(`SELECT COUNT(*) n FROM buyer_requirements WHERE status='active'`),one(`SELECT COUNT(*) n FROM buyer_matches`),one(`SELECT COUNT(*) n FROM opportunities`),one(`SELECT COUNT(*) n FROM opportunities WHERE approval_status='pending'`),one(`SELECT COUNT(*) n FROM opportunities WHERE approval_status='approved'`),one(`SELECT COUNT(*) n FROM quotations`),one(`SELECT COUNT(*) n FROM orders`),one(`SELECT COUNT(*) n FROM purchase_tracking`),one(`SELECT COUNT(*) n FROM delivery_tracking`),one(`SELECT COUNT(*) n FROM notifications WHERE status='pending'`)
    ]);
    const recent=await env.DB.prepare(`SELECT o.id,o.status,o.approval_status,o.expected_margin_pct,p.title AS product_title,s.name AS seller_name,o.updated_at FROM opportunities o LEFT JOIN products p ON p.id=o.product_id LEFT JOIN sellers s ON s.id=o.seller_id ORDER BY o.id DESC LIMIT 20`).all();
    return json({ok:true,block:17,summary:{products:products.n,sellers:sellers.n,buyers:buyers.n,active_requirements:reqs.n,buyer_matches:matches.n,opportunities:opps.n,pending_approval:pending.n,approved_opportunities:approved.n,quotations:quotes.n,orders:orders.n,purchases:purchases.n,deliveries:deliveries.n,pending_notifications:notes.n},recent_opportunities:recent.results||[]});
  }

  return null;
}


async function runScheduledCatalogSync(env) {
  const settings = await getSettings(env.DB);
  if (!settingBool(settings, "catalog_sync_enabled", true)) {
    return { ok: true, skipped: true, reason: "catalog_sync_disabled" };
  }

  const batchSize = Math.max(1, Math.min(50, Math.floor(settingNum(settings, "catalog_sync_batch_size", 50))));
  let cursor = Math.max(0, Math.floor(settingNum(settings, "catalog_sync_cursor", 0)));
  const handles = await discoverSourceHandles();

  if (!handles.length) {
    await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','empty_source') ON CONFLICT(key) DO UPDATE SET value='empty_source'`).run();
    return { ok: true, skipped: true, reason: "empty_source" };
  }

  if (cursor >= handles.length) cursor = 0;
  const result = await syncSource(env.DB, cursor, batchSize);
  const nextCursor = result.complete ? 0 : result.next_start;
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(String(nextCursor)),
    env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(now),
    env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_saved',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(String(result.saved)),
    env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(result.complete ? "complete" : "partial")
  ]);

  return { ok: true, cursor, next_cursor: nextCursor, ...result, ran_at: now };
}

async function runScheduledPhase2(env) {
  await initDb(env.DB);
  const settings = await getSettings(env.DB);

  if (masterMode(settings) !== "on") {
    return { ok: true, paused: true, reason: `Master AI is ${masterMode(settings)}.` };
  }

  // 1) Pakistan buyer requirements -> PakThai Tech products
  const buyerMatchRequest = new Request("https://internal/api/buyer-match/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
  const buyerMatchResponse = await handleMasterBuyerApi(buyerMatchRequest, env);
  const buyerMatchResult = await buyerMatchResponse.json().catch(() => ({}));

  // 2) Product match -> eligible Bangkok/Thailand seller match.
  const sellerMatchResult = await runProductSellerMatching(env.DB, {
    only_unmatched: true,
    apply: true,
    limit: 100,
    thb_to_pkr: Number(settings.thb_to_pkr || 8.36),
    target_margin_pct: Number(settings.default_margin_pct || 20)
  });

  // 3) Seller-matched records -> sourcing opportunities, still requiring owner approval.
  const matchedRows = (await env.DB.prepare(`
    SELECT bm.id
    FROM buyer_matches bm
    WHERE bm.seller_id IS NOT NULL
      AND bm.match_status = 'seller_matched'
      AND NOT EXISTS (
        SELECT 1 FROM opportunities o
        WHERE o.notes LIKE '%Block 9 buyer_match_id:' || bm.id || '%'
      )
    ORDER BY bm.id ASC
    LIMIT 100
  `).all()).results || [];

  let opportunitiesCreated = 0;
  const opportunityErrors = [];

  for (const row of matchedRows) {
    try {
      const req = new Request("https://internal/api/opportunity-from-seller-match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buyer_match_id: row.id })
      });
      const resp = await handleBlock9Opportunity(req, env);
      const result = await resp.json().catch(() => ({}));
      if (result.created) opportunitiesCreated++;
      if (result.error) opportunityErrors.push({ buyer_match_id: row.id, error: result.error });
    } catch (e) {
      opportunityErrors.push({ buyer_match_id: row.id, error: e?.message || String(e) });
    }
  }

  // 4) Due negotiation follow-ups. These remain prepared notifications until a real
  // external messaging provider/API is connected; the Worker must not claim they were sent.
  let followups = { ok: true, processed: 0, actual_sending: "prepared_only" };
  try {
    const req = new Request("https://internal/api/negotiations/followups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const resp = await handleFinalBlocks(req, env);
    followups = await resp.json().catch(() => followups);
  } catch (e) {
    followups = { ok: false, processed: 0, actual_sending: "prepared_only", error: e?.message || String(e) };
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('phase2_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(now).run();
  await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('phase2_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(
    opportunityErrors.length ? "partial" : "complete"
  ).run();

  return {
    ok: true,
    ran_at: now,
    buyer_matching: buyerMatchResult,
    seller_matching: sellerMatchResult,
    opportunities_created: opportunitiesCreated,
    opportunity_errors: opportunityErrors,
    followups
  };
}

export default {
  async scheduled(event, env, ctx) {
    // Cron 1: the daily 02:00 trigger is reserved for SakoonSay catalog sync.
    // Cron 2: hourly trigger runs Pakistan Buyer -> Bangkok Seller automation.
    const cron = String(event?.cron || "").trim();
    if (cron === "0 * * * *") {
      ctx.waitUntil(runGmailAutoReply(env));
      ctx.waitUntil(runScheduledPhase2(env));
      return;
    }
    ctx.waitUntil(runScheduledCatalogSync(env));
  },

  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      // OAuth start/callback and token-guarded Gmail send must remain usable by their own secure flow.
      if (["/auth/google/start", "/auth/google/callback", "/api/notifications/gmail-send"].includes(url.pathname)) {
        const oauthPublicResponse = await handleGmailOAuth(request, env); if (oauthPublicResponse) return oauthPublicResponse;
      }
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      const authResponse = await handleAuthRoute(request, env); if (authResponse) return authResponse;
      const authorization = await authorizeRequest(request, env);
      if (!authorization.allowed) return json({ok:false,error:authorization.error}, authorization.status || 401);
      const oauthResponse = await handleGmailOAuth(request, env); if (oauthResponse) return oauthResponse;
      const buyerDiscoveryResponse = await handleBuyerDiscoveryRequest(request, env); if (buyerDiscoveryResponse) return buyerDiscoveryResponse;
      const externalDiscoveryResponse = await handleExternalDiscoveryRequest(request, env); if (externalDiscoveryResponse) return externalDiscoveryResponse;
      if (url.pathname.startsWith('/api/landed-cost/') || url.pathname === '/api/approvals' || url.pathname === '/api/quotations' || url.pathname === '/api/orders' || url.pathname === '/api/purchases' || url.pathname === '/api/deliveries' || url.pathname === '/api/notifications' || url.pathname === '/api/notifications/whatsapp' || url.pathname === '/api/dashboard' || url.pathname === '/api/controls' || url.pathname === '/api/negotiations' || url.pathname === '/api/negotiations/message' || url.pathname === '/api/negotiations/followups') { const r = await handleFinalBlocks(request, env); if (r) return r; }
      if (url.pathname === '/api/settings' && request.method === 'POST') { const r = await handleFinalBlocks(request, env); if (r) return r; }
      if (url.pathname.startsWith('/api/sourcing/')) return await handleSellerOfferAutoSourcing(request, env);
        if (url.pathname.startsWith("/api/product-seller-match")) return await handleProductSellerMatching(request, env);
if (url.pathname.startsWith("/api/opportunity-from-seller-match")) return await handleBlock9Opportunity(request, env);
        if (url.pathname.startsWith("/api/buyers") || url.pathname.startsWith("/api/buyer-requirements") || url.pathname.startsWith("/api/buyer-matches") || url.pathname.startsWith("/api/buyer-match/")) return await handleMasterBuyerApi(request, env);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);

  // BLOCK6_CUSTOMER_REQUEST_ROUTE
  if (url.pathname === "/customer-request") {
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PakThai Tech - Customer Request</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:20px}input,textarea,button{width:100%;padding:12px;margin:6px 0 14px;box-sizing:border-box}button{cursor:pointer;font-weight:700}.ok{padding:12px;background:#e9f7ef}.err{padding:12px;background:#fdecec}</style></head><body><h1>PAKTHAI TECH</h1><h2>Order / Request Quote</h2><form id="f"><input name="customer_name" placeholder="Your name" required><input name="phone" placeholder="Phone"><input name="whatsapp" placeholder="WhatsApp"><input name="email" placeholder="Email"><input name="city" placeholder="City" required><textarea name="delivery_address" placeholder="Delivery address"></textarea><input name="product_title" placeholder="Product / requirement" required><input name="quantity" type="number" min="1" value="1" required><input name="requested_price_pkr" type="number" min="0" placeholder="Target price PKR"><input name="max_budget_pkr" type="number" min="0" placeholder="Maximum budget PKR"><textarea name="customer_note" placeholder="Additional requirement"></textarea><button>Submit Request</button></form><div id="m"></div><script>document.getElementById("f").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch("/api/customer-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});const j=await r.json();document.getElementById("m").className=r.ok?"ok":"err";document.getElementById("m").textContent=j.message||j.error||"Done";if(r.ok)e.target.reset();});</script></body></html>`,{headers:{"content-type":"text/html;charset=UTF-8"}});
  }

      return new Response(HTML, { headers: { "content-type": "text/html; charset=utf-8" } });
    } catch (e) {
      return json({ error: e?.message || String(e) }, 500);
    }
  }
};


