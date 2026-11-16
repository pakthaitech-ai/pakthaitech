import { handleGmailOAuth } from './gmail-oauth.js';
import { handleTelegramNotifications } from './telegram-notifications.js';
import { notifyOwnerOfCustomerRequest } from './owner-request-alerts.js';
import { queuePartnerLeadNotification } from './partner-notifications.js';
import { runGmailAutoReply } from './gmail-autoreply.js';
import { handleBuyerDiscoveryRequest, runScheduledBuyerDiscovery } from './buyer-discovery.js';
import { handleExternalDiscoveryRequest } from './external-discovery.js';
import { runScheduledSellerDiscovery, handleSellerDiscoveryRequest } from './seller-discovery.js';
import { runKoreaSellerDiscovery, handleKoreaSellerDiscoveryRequest } from './korea-seller-discovery.js';
import { runMarketBuyerDiscovery, handleMarketDiscoveryRequest } from './market-discovery.js';
import { handleMarketDealsRequest } from './market-deals.js';
import { runScheduledOutreach, handleOutreachRequest } from './outreach-scheduler.js';
import { handleAuthRoute, authorizeRequest, getSession } from './auth-session.js';
import { runAIProspectScreening } from './ai-prospect-screening.js';
import { handleSupportChat } from './support-chat.js';
import { handleWhatsAppSend } from './whatsapp-sender.js';
import { handleWhatsAppPartnerInbound, sendQueuedPartnerLeadInFreeWindow } from './whatsapp-free-window.js';
import { buildPushPayload } from '@block65/webcrypto-web-push';
import { handleTwilioSms } from './twilio-sms.js';

// Owner review - no active country partner: preserve the explicit Owner-review fallback when routing has no active partner.
const BROWSER_PUSH_SW = `self.addEventListener('push',event=>{let d={};try{d=event.data?event.data.json():{}}catch(_){d={body:event.data?event.data.text():'You have a PakThai Tech update.'}};event.waitUntil(self.registration.showNotification(String(d.title||'PAKTHAI TECH'),{body:String(d.body||'You have a new owner dashboard update.'),icon:'https://pakthai-tech-store.pages.dev/icons/icon-192.png',badge:'https://pakthai-tech-store.pages.dev/icons/icon-192.png',data:{url:'/'},tag:'pakthai-owner-update',renotify:false}));});self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const all=await clients.matchAll({type:'window',includeUncontrolled:true});for(const c of all){if(new URL(c.url).origin===self.location.origin){await c.focus();return;}}await clients.openWindow('/');})());});`;

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  ...SECURITY_HEADERS
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store, max-age=0", "pragma": "no-cache", ...CORS }
  });

const text = (body, status = 200) =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", ...CORS }
  });

async function rateLimitPublicRequest(request, db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS public_request_rate_limits (rate_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)").run();
  const ip = String(request.headers.get("CF-Connecting-IP") || "unknown").split(",")[0].trim();
  const digest = await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));
  const key = Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
  const now = Date.now(), windowMs = 15 * 60 * 1000;
  const row = await db.prepare(`INSERT INTO public_request_rate_limits(rate_key,window_start,attempts) VALUES(?,?,1)
    ON CONFLICT(rate_key) DO UPDATE SET
      attempts=CASE WHEN public_request_rate_limits.window_start + ? <= excluded.window_start THEN 1 ELSE public_request_rate_limits.attempts+1 END,
      window_start=CASE WHEN public_request_rate_limits.window_start + ? <= excluded.window_start THEN excluded.window_start ELSE public_request_rate_limits.window_start END
    RETURNING attempts`).bind(key,now,windowMs,windowMs).first();
  return Number(row?.attempts || 0) > 5;
}

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
      target_margin_pct REAL DEFAULT 25,
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
    ["default_margin_pct", "25"],
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
    `CREATE TABLE IF NOT EXISTS sourcing_partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country_code TEXT NOT NULL,
      country_name TEXT NOT NULL, contact TEXT, email TEXT, lead_types TEXT DEFAULT 'all',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
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
  for (const [table,name,type] of [
    ['customer_requests','country_code',"TEXT DEFAULT ''"],
    ['customer_requests','assigned_partner_id','INTEGER'],
    ['customer_requests','assigned_partner_name',"TEXT DEFAULT ''"],
    ['buyers','country_code',"TEXT DEFAULT ''"]
  ]) { try { await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run(); } catch (_) {} }
  try { await db.prepare(`UPDATE seller_offers SET asking_price=COALESCE(asking_price,negotiated_price,dealer_price,online_reference_price,0), quantity=COALESCE(quantity,min_quantity,1)`).run(); } catch (_) {}
}

 // Legacy Meta Graph API outbound sender removed during the Owner-approved provider migration.
 // Historical delivery status and inbound webhook records remain readable.
async function ensureWhatsAppStatusTable(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_inbox_messages (message_id TEXT PRIMARY KEY, sender TEXT NOT NULL, sender_name TEXT, message_type TEXT, message_text TEXT, message_timestamp TEXT, received_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_message_status (
    message_id TEXT PRIMARY KEY,
    recipient TEXT,
    status TEXT NOT NULL DEFAULT 'accepted',
    status_timestamp TEXT,
    error_code TEXT,
    error_title TEXT,
    error_message TEXT,
    notification_id INTEGER,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function verifyWhatsAppSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret || !signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const expected = 'sha256=' + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  if (expected.length !== signatureHeader.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i);
  return diff === 0;
}

async function handleWhatsAppWebhook(request, env) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const webhookVerifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && token && webhookVerifyToken && token === webhookVerifyToken && challenge) {
      return text(challenge);
    }
    return text('Webhook verification failed', 403);
  }
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const rawBody = await request.text();
  if (!env.WHATSAPP_APP_SECRET) return json({ error: 'Webhook signature validation is not configured. Set WHATSAPP_APP_SECRET in Worker secrets.' }, 503);
  const valid = await verifyWhatsAppSignature(rawBody, request.headers.get('x-hub-signature-256') || '', env.WHATSAPP_APP_SECRET);
  if (!valid) return json({ error: 'Invalid webhook signature' }, 401);
  let payload;
  try { payload = JSON.parse(rawBody); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (payload?.object !== 'whatsapp_business_account') return json({ ok: true, ignored: true });
  await ensureWhatsAppStatusTable(env.DB);
  let updates = 0;
  let inboundMessages = 0;
  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages') continue;
      const value = change.value || {};
      const contactNames = new Map((value.contacts || []).map(c => [String(c.wa_id || ""), String(c.profile?.name || "")]));
      for (const incoming of value.messages || []) {
        if (!incoming.id || !incoming.from) continue;
        const type = String(incoming.type || "unknown");
        const textBody = type === "text" ? String(incoming.text?.body || "") : ["image","document","video"].includes(type) ? String(incoming[type]?.caption || "[" + type + " message]") : "[" + type + " message]";
        const timestamp = incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000).toISOString() : new Date().toISOString();
        await env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_inbox_messages(message_id,sender,sender_name,message_type,message_text,message_timestamp) VALUES(?,?,?,?,?,?)`).bind(String(incoming.id),String(incoming.from),contactNames.get(String(incoming.from)) || "",type,textBody.slice(0,8000),timestamp).run();
        inboundMessages++;
        if (type === 'text') {
          try { await handleWhatsAppPartnerInbound(env, { phone: String(incoming.from), message: textBody, timestamp }); }
          catch (error) { console.error('WhatsApp partner free-window automation failed:', String(error?.message || error).slice(0, 250)); }
        }
      }
      for (const item of value.statuses || []) {
        if (!item.id || !item.status) continue;
        const current = await env.DB.prepare('SELECT status FROM whatsapp_message_status WHERE message_id=?').bind(String(item.id)).first();
        const incoming = String(item.status).toLowerCase();
        const rank = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 4 };
        const oldStatus = String(current?.status || 'accepted').toLowerCase();
        const keep = oldStatus === 'read' || oldStatus === 'failed' || (oldStatus === 'delivered' && incoming !== 'read' && incoming !== 'delivered') || ((rank[oldStatus] ?? 0) > (rank[incoming] ?? 0));
        const errors = Array.isArray(item.errors) ? item.errors : [];
        const err = errors[0] || {};
        const ts = item.timestamp ? new Date(Number(item.timestamp) * 1000).toISOString() : new Date().toISOString();
        await env.DB.prepare(`INSERT INTO whatsapp_message_status(message_id,recipient,status,status_timestamp,error_code,error_title,error_message,updated_at)
          VALUES(?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(message_id) DO UPDATE SET
            recipient=COALESCE(excluded.recipient,whatsapp_message_status.recipient),
            status=CASE WHEN ? THEN whatsapp_message_status.status ELSE excluded.status END,
            status_timestamp=CASE WHEN ? THEN whatsapp_message_status.status_timestamp ELSE excluded.status_timestamp END,
            error_code=COALESCE(excluded.error_code,whatsapp_message_status.error_code),
            error_title=COALESCE(excluded.error_title,whatsapp_message_status.error_title),
            error_message=COALESCE(excluded.error_message,whatsapp_message_status.error_message),
            updated_at=CURRENT_TIMESTAMP`).bind(String(item.id),String(item.recipient_id || ''),incoming,ts,err.code ? String(err.code) : null,String(err.title || ''),String(err.message || err.error_data?.details || ''),keep ? 1 : 0,keep ? 1 : 0).run();
        updates++;
      }
    }
  }
  return json({ ok: true, status_updates_processed: updates, inbound_messages_processed: inboundMessages });
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function calcOpportunity(input) {
  const quantity = Math.max(1, Math.floor(num(input.quantity) || 1));
  const asking = num(input.asking_price);
  const targetMargin = Math.max(0, num(input.target_margin_pct) || 25);
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
  // Negative rates are invalid inputs, never discounts against landed cost.
  return settingBool(settings, enabledKey, true) ? Math.max(0, settingNum(settings, rateKey, 0)) : 0;
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
  const targetMargin = Math.max(0, num(input.target_margin_pct) || settingNum(settings, "default_margin_pct", 25));
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
   (label) => label + " cost is 0 and marked Pending - actual rate/quote not available"
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

function catalogRetryDelayMs(retryAfter, attempt, baseMs = 2000) {
  const raw = String(retryAfter || "").trim();
  let requestedMs = 0;
  if (raw) {
    const seconds = Number(raw);
    if (Number.isFinite(seconds) && seconds > 0) requestedMs = seconds * 1000;
    else {
      const dateMs = Date.parse(raw);
      if (Number.isFinite(dateMs)) requestedMs = dateMs - Date.now();
    }
  }
  if (requestedMs > 0) return Math.min(15000, Math.max(1000, requestedMs));
  return Math.min(15000, baseMs * (2 ** Math.max(0, attempt - 1)));
}
async function d1BatchWithRetry(db, statements, label = "catalog sync") {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try { return await db.batch(statements); }
    catch (e) {
      lastError = e;
      const message = String(e?.message || e);
      const transient = /D1_ERROR: internal error|internal error; reference|temporar|overloaded|SQLITE_BUSY|database is locked/i.test(message);
      if (!transient || attempt === 4) break;
      await new Promise(resolve => setTimeout(resolve, 250 * (2 ** (attempt - 1))));
    }
  }
  throw new Error(String(label) + ' D1 batch failed after retry policy: ' + String(lastError?.message || lastError));
}
async function discoverSourceHandles() {
  const pageSize = 250;
  const headers = { "user-agent": "PakThai-Tech-Sourcing/1.0" };
  const handles = [];
  // Shopify products.json is paginated; retry transient rate limits and server errors.
  for (let page = 1; page <= 100; page++) {
    const url = "https://sakoonsay.com/products.json?limit=" + pageSize + "&page=" + page;
    let r = null;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        r = await fetch(url, { headers });
        lastStatus = r.status;
        if (r.ok) break;
        if (![408, 425, 429, 500, 502, 503, 504].includes(r.status)) throw new Error("Source catalog page " + page + " returned " + r.status);
      } catch (e) {
        if (attempt === 4) throw e;
      }
      if (attempt < 4) {
        const waitMs = catalogRetryDelayMs(r?.headers?.get("retry-after"), attempt + 1, 1000);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
    if (!r?.ok) throw new Error("Source catalog page " + page + " returned " + lastStatus + " after retries");
    const data = await r.json();
    const products = Array.isArray(data.products) ? data.products : [];
    handles.push(...products.map(p => String(p.handle || '').trim()).filter(Boolean));
    if (products.length < pageSize) return [...new Set(handles)];
  }
  throw new Error("Source catalog pagination exceeded 100 pages; sync stopped to avoid an incomplete catalog.");
}

async function fetchProduct(handle) {
  const url = `https://sakoonsay.com/products/${handle}.js`;
  const r = await fetch(url, { headers: { "user-agent": "PakThai-Tech-Sourcing/1.0" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}; retry-after=${r.headers.get("retry-after") || ""}`);
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

async function syncSource(db, start = 0, batchSize = 25, discoveredHandles = null) {
  const handles = discoveredHandles || await discoverSourceHandles();
  const slice = handles.slice(start, start + batchSize);
  const results = []; for (let i = 0; i < slice.length; i += 2) { results.push(...await Promise.all(slice.slice(i, i + 2).map(async (handle) => {
    let lastError = "Unknown source error";
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const product = await fetchProduct(handle);
        if (!product) throw new Error("Source returned no product record");
        return { handle, product, error: null };
      } catch (e) {
        lastError = String(e?.message || e).slice(0, 240);
        // Runtime subrequest-budget errors cannot recover by retrying in the same invocation.
        if (/Too many subrequests by single Worker invocation/i.test(lastError)) break;
        if (attempt < 5) { const retryAfterMatch = lastError.match(/retry-after=([^;]*)/i); const waitMs = catalogRetryDelayMs(retryAfterMatch?.[1], attempt, 2000); await new Promise(resolve => setTimeout(resolve, waitMs)); }
      }
    }
    return { handle, product: null, error: lastError };
  }))); }

  const products = results.filter(x => x.product).map(x => x.product);
  const failures = results.filter(x => x.error).map(x => ({ handle: x.handle, error: x.error }));

  const productWrites = products.map(p => db.prepare("INSERT INTO products (source_id,handle,title,description,price_pkr,compare_at_pkr,available,image_url,source_url,category,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(source_id) DO UPDATE SET handle=excluded.handle,title=excluded.title,description=excluded.description,price_pkr=excluded.price_pkr,compare_at_pkr=excluded.compare_at_pkr,available=excluded.available,image_url=excluded.image_url,source_url=excluded.source_url,category=excluded.category,updated_at=CURRENT_TIMESTAMP").bind(
    p.source_id, p.handle, p.title, p.description, p.price_pkr,
    p.compare_at_pkr, p.available, p.image_url, p.source_url, p.category
  ));
  // One D1 batch keeps product persistence inside the free Worker subrequest budget.
  if (productWrites.length) await d1BatchWithRetry(db, productWrites, "catalog product persistence");

  return {
    discovered: handles.length,
    processed: slice.length,
    saved: products.length,
    failed: failures.length,
    failed_handles: failures.slice(0, 20),
    next_start: start + slice.length,
    complete: start + slice.length >= handles.length
  };
}

async function handleApi(request, env) {
  const url = new URL(request.url);

  // CUSTOMER REQUEST OWNER APPROVAL: request records and approval decisions are private.
  if (url.pathname === "/api/customer-approvals" && (request.method === "GET" || request.method === "POST")) {
    const approvalSession = await getSession(request, env);
    if (approvalSession?.role !== "owner") return json({ ok: false, error: "Owner login required." }, 401);
  }
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

  // Owner-managed partner directory. Partner contact details never leave authenticated Owner APIs.
  if (url.pathname.startsWith("/api/sourcing-partners")) {
    const session = await getSession(request, env);
    if (session?.role !== "owner") return json({ok:false,error:"Owner login required."},403);
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sourcing_partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country_code TEXT NOT NULL,
      country_name TEXT NOT NULL, contact TEXT, email TEXT, lead_types TEXT DEFAULT 'all',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
    if (url.pathname === "/api/sourcing-partners" && request.method === "GET") {
      const rows = await env.DB.prepare("SELECT id,name,country_code,country_name,contact,email,lead_types,active,created_at,updated_at FROM sourcing_partners ORDER BY country_name,name LIMIT 200").all();
      return json({ok:true,partners:rows.results||[]});
    }
    if (url.pathname === "/api/sourcing-partners" && request.method === "POST") {
      const body = await request.json().catch(()=>null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ok:false,error:"Valid JSON is required."},400);
      const name=String(body.name||"").trim(), countryCode=String(body.country_code||"").trim().toUpperCase(), countryName=String(body.country_name||"").trim();
      const contact=String(body.contact||"").trim(), email=String(body.email||"").trim().toLowerCase(), leadTypes=String(body.lead_types||"all").trim().toLowerCase();
      if (!name || name.length>100 || !/^[A-Z]{2}$/.test(countryCode) || !countryName || countryName.length>100) return json({ok:false,error:"Name, country name and two-letter ISO country code are required."},400);
      if (contact.length>100 || email.length>254 || (email && (!email.includes("@") || email.indexOf("@") !== email.lastIndexOf("@") || email.startsWith("@") || email.endsWith("@"))) || !["all","buyer","supplier"].includes(leadTypes)) return json({ok:false,error:"Invalid contact, email or lead type."},400);
      const ins=await env.DB.prepare("INSERT INTO sourcing_partners(name,country_code,country_name,contact,email,lead_types,active,updated_at) VALUES(?,?,?,?,?,?,1,CURRENT_TIMESTAMP)").bind(name,countryCode,countryName,contact,email,leadTypes).run();
      return json({ok:true,id:ins.meta?.last_row_id||null,message:"Partner saved. External notifications are not enabled."},201);
    }
    const partnerIdPath = url.pathname.startsWith("/api/sourcing-partners/") ? url.pathname.slice("/api/sourcing-partners/".length) : "";
    const partnerId = /^[0-9]+$/.test(partnerIdPath) ? Number(partnerIdPath) : 0;
    if (partnerId && request.method === "PATCH") {
      const body=await request.json().catch(()=>null);
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({ok:false,error:"Valid JSON is required."},400);
      if (typeof body.active === "boolean" && Object.keys(body).length === 1) {
        const result=await env.DB.prepare("UPDATE sourcing_partners SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(body.active?1:0,partnerId).run();
        if (!result.meta?.changes) return json({ok:false,error:"Partner not found."},404);
        return json({ok:true,active:body.active});
      }
      const name=String(body.name||"").trim(), countryCode=String(body.country_code||"").trim().toUpperCase(), countryName=String(body.country_name||"").trim();
      const contact=String(body.contact||"").trim(), email=String(body.email||"").trim().toLowerCase(), leadTypes=String(body.lead_types||"all").trim().toLowerCase();
      if (!name || name.length>100 || !/^[A-Z]{2}$/.test(countryCode) || !countryName || countryName.length>100) return json({ok:false,error:"Name, country name and two-letter ISO country code are required."},400);
      if (contact.length>100 || email.length>254 || (email && (!email.includes("@") || email.indexOf("@") !== email.lastIndexOf("@") || email.startsWith("@") || email.endsWith("@"))) || !["all","buyer","supplier"].includes(leadTypes)) return json({ok:false,error:"Invalid contact, email or lead type."},400);
      const result=await env.DB.prepare("UPDATE sourcing_partners SET name=?,country_code=?,country_name=?,contact=?,email=?,lead_types=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(name,countryCode,countryName,contact,email,leadTypes,partnerId).run();
      if (!result.meta?.changes) return json({ok:false,error:"Partner not found."},404);
      return json({ok:true,message:"Partner updated."});
    }
    if (partnerId && request.method === "DELETE") {
      const partner=await env.DB.prepare("SELECT id,active FROM sourcing_partners WHERE id=?").bind(partnerId).first();
      if (!partner) return json({ok:false,error:"Partner not found."},404);
      if (Number(partner.active)===1) return json({ok:false,error:"Deactivate this partner before removing it."},409);
      const linked=await env.DB.prepare("SELECT id FROM customer_requests WHERE assigned_partner_id=? LIMIT 1").bind(partnerId).first();
      if (linked) return json({ok:false,error:"This partner is linked to customer request history. Keep it inactive to preserve history."},409);
      await env.DB.prepare("DELETE FROM sourcing_partners WHERE id=?").bind(partnerId).run();
      return json({ok:true,message:"Inactive partner removed."});
    }
    return json({ok:false,error:"Not found"},404);
  }

  // BLOCK6_CUSTOMER_ORDER_REQUEST_API
  if (url.pathname === "/api/customer-requests" && request.method === "GET") {
    // Customer contact/address data is private: never expose it to unauthenticated visitors or read-only staff.
    const session = await getSession(request, env);
    if (session?.role !== "owner") return json({ ok: false, error: "Owner login required." }, 401);
    const rows = await env.DB.prepare("SELECT * FROM customer_requests ORDER BY id DESC LIMIT 200").all();
    return json(rows.results || []);
  }

  if (url.pathname === "/api/customer-requests" && request.method === "POST") {
    const body = await request.json().catch(()=>null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({error:"A valid JSON request is required."},400);
    if (String(body.website || "").trim()) return json({error:"Request rejected."},400);
    const idempotencyKey = String(request.headers.get("Idempotency-Key") || body.idempotency_key || "").trim();
    if (idempotencyKey && idempotencyKey.length <= 100 && /^[A-Za-z0-9._:-]+$/.test(idempotencyKey)) {
      try {
        const previous = await env.DB.prepare("SELECT id,buyer_id,requirement_id,status FROM customer_requests WHERE idempotency_key=? LIMIT 1").bind(idempotencyKey).first();
        if (previous) return json({success:true,duplicate:true,request_id:previous.id,buyer_id:previous.buyer_id,requirement_id:previous.requirement_id,status:previous.status||"new",message:"This request was already received."},200);
      } catch (_) {}
    }
    if (await rateLimitPublicRequest(request,env.DB)) return json({error:"Too many requests from this network. Please try again in 15 minutes."},429);
    const customerName = String(body.customer_name || "").trim();
    const phone = String(body.phone || "").trim();
    const whatsapp = String(body.whatsapp || phone).trim();
    const email = String(body.email || "").trim();
    const city = String(body.city || "").trim();
    const address = String(body.delivery_address || "").trim();
    const countryCode = String(body.country_code || "").trim().toUpperCase();
    const productId = Number(body.product_id) || null;
    const productTitle = String(body.product_title || "").trim();
    const requestType = String(body.request_type || "order_request").trim();
    const note = String(body.customer_note || "").trim();
    const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    const quantityRaw = Number(body.quantity ?? 1);
    const priceRaw = body.requested_price_pkr == null || body.requested_price_pkr === "" ? null : Number(body.requested_price_pkr);
    const budgetRaw = body.max_budget_pkr == null || body.max_budget_pkr === "" ? null : Number(body.max_budget_pkr);
    if (!customerName || customerName.length > 100) return json({error:"Customer name is required and must be 100 characters or fewer."},400);
    if (phone.length > 40 || whatsapp.length > 40 || email.length > 254 || city.length > 100 || address.length > 500 || productTitle.length > 200 || note.length > 1000) return json({error:"One or more fields exceed the allowed length."},400);
    if (!emailValid) return json({error:"Enter a valid email address."},400);
    if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) return json({error:"Country must use a two-letter ISO country code."},400);
    if (idempotencyKey && (idempotencyKey.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(idempotencyKey))) return json({error:"Invalid idempotency key."},400);
    if (!phone && !whatsapp && !email) return json({error:"Phone, WhatsApp or email is required."},400);
    if (!Number.isFinite(quantityRaw) || !Number.isInteger(quantityRaw) || quantityRaw < 1 || quantityRaw > 1000) return json({error:"Quantity must be between 1 and 1000."},400);
    if ((priceRaw !== null && (!Number.isFinite(priceRaw) || priceRaw <= 0 || priceRaw > 100000000000)) || (budgetRaw !== null && (!Number.isFinite(budgetRaw) || budgetRaw <= 0 || budgetRaw > 100000000000))) return json({error:"Price and budget must be positive valid PKR amounts."},400);
    if (!["order_request","quote_request","availability_request","product_question","custom_build"].includes(requestType)) return json({error:"Unsupported request type."},400);
    const quantity = quantityRaw;
    const requestedPrice = priceRaw;
    const maxBudget = budgetRaw;

    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS sourcing_partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, country_code TEXT NOT NULL,
      country_name TEXT NOT NULL, contact TEXT, email TEXT, lead_types TEXT DEFAULT 'all',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`).run();
    for (const [table,name,type] of [['customer_requests','country_code',"TEXT DEFAULT ''"],['customer_requests','assigned_partner_id','INTEGER'],['customer_requests','assigned_partner_name',"TEXT DEFAULT ''"],['customer_requests','idempotency_key',"TEXT"],['buyers','country_code',"TEXT DEFAULT ''"]]) { try { await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run(); } catch (_) {}}
    try { await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_requests_idempotency_key ON customer_requests(idempotency_key)").run(); } catch (_) {}
    if (idempotencyKey) {
      const previous = await env.DB.prepare("SELECT id,buyer_id,requirement_id,status FROM customer_requests WHERE idempotency_key=? LIMIT 1").bind(idempotencyKey).first();
      if (previous) return json({success:true,duplicate:true,request_id:previous.id,buyer_id:previous.buyer_id,requirement_id:previous.requirement_id,status:previous.status||"new",message:"This request was already received."},200);
    }
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
    if (countryCode && buyerId) {
      try { await env.DB.prepare("UPDATE buyers SET country_code=?,country=CASE WHEN country IS NULL OR country='' THEN ? ELSE country END,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(countryCode,countryCode,buyerId).run(); } catch (_) {}
    }
    // customer country_code describes the buyer/destination, not the sourcing market.
    // Route by an explicit sourcing-country field or clear market mention; if none is given,
    // use the sole active buyer-capable partner as the default. Ambiguous multi-partner leads stay Owner-review.
    const sourceText = [productTitle, String(body.product_keyword || ""), note, String(body.sourcing_country || "")].join(" ").toLowerCase();
    let sourcingCountryCode = String(body.sourcing_country_code || body.source_country_code || "").trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(sourcingCountryCode)) {
      if (/\b(south korea|korea|korean)\b/.test(sourceText)) sourcingCountryCode = "KR";
      else if (/\b(thailand|thai)\b/.test(sourceText)) sourcingCountryCode = "TH";
      else if (/\b(malaysia|malaysian)\b/.test(sourceText)) sourcingCountryCode = "MY";
      else if (/\b(singapore|singaporean)\b/.test(sourceText)) sourcingCountryCode = "SG";
      else if (/\b(australia|australian)\b/.test(sourceText)) sourcingCountryCode = "AU";
      else sourcingCountryCode = "";
    }
    let assignedPartner = null;
    if (sourcingCountryCode) assignedPartner = await env.DB.prepare("SELECT id,name,country_code,contact,email FROM sourcing_partners WHERE country_code=? AND active=1 AND lead_types IN ('all','buyer') ORDER BY id LIMIT 1").bind(sourcingCountryCode).first();
    if (!sourcingCountryCode) {
      const activePartnerRows = await env.DB.prepare("SELECT id,name,country_code,contact,email FROM sourcing_partners WHERE active=1 AND lead_types IN ('all','buyer') ORDER BY id LIMIT 2").all();
      const activePartners = activePartnerRows.results || [];
      if (activePartners.length === 1) assignedPartner = activePartners[0];
    }
    const ins = await env.DB.prepare(
      "INSERT INTO customer_requests (buyer_id, requirement_id, product_id, product_title, customer_name, phone, whatsapp, email, city, delivery_address, quantity, requested_price_pkr, max_budget_pkr, request_type, customer_note, country_code, assigned_partner_id, assigned_partner_name, status, created_at, updated_at, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)"
    ).bind(buyerId, requirementId, productId, productTitle, customerName, phone, whatsapp, email, city, address, quantity, requestedPrice, maxBudget, requestType, note, countryCode, assignedPartner?.id || null, assignedPartner?.name || '', idempotencyKey || null).run();

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
    if (assignedPartner && requestId) {
      try {
        await env.DB.prepare("INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES('internal','dashboard',?,?,?,'customer_request',?,'pending')")
          .bind("Partner: " + assignedPartner.name,"Country-matched buyer lead assigned","New buyer request #" + requestId + " for " + (productTitle || "product/requirement") + " (Qty " + quantity + "). Partner delivery is queued separately for Owner review.",requestId).run();
      } catch (_) {}
      try {
        const queuedPartnerLead = await queuePartnerLeadNotification(env.DB, {
          partner: assignedPartner,
          requestId,
          whatsappEnabled: true,
          lead: { customer_name: customerName, phone, whatsapp, email, city, country_code: countryCode, product_title: productTitle, quantity, requested_price_pkr: requestedPrice, max_budget_pkr: maxBudget, customer_note: note }
        });
        if (queuedPartnerLead?.queued && queuedPartnerLead.channel === 'whatsapp') {
          const automaticDelivery = await sendQueuedPartnerLeadInFreeWindow(env, queuedPartnerLead.notification_id);
          if (automaticDelivery.sent) console.log('WhatsApp partner lead delivered inside an opted-in free service window:', queuedPartnerLead.notification_id);
        }
      } catch (error) {
        try {
          await env.DB.prepare("INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES('internal','dashboard','Owner',?,?, 'partner_lead',?,'pending')")
            .bind("Partner notification could not be queued", "Customer request #" + requestId + " was saved, but partner notification preparation failed: " + String(error?.message || error).slice(0, 250), requestId).run();
        } catch (_) {}
      }
    }

    // Optional free Telegram alert goes only to the configured Owner chat.
    // It excludes customer contact details and never replaces the D1 request record.
    try {
      const ownerAlert = await notifyOwnerOfCustomerRequest(env, {
        requestId,
        productTitle,
        quantity
      });
      if (!ownerAlert.sent && ownerAlert.reason !== "not_configured") {
        try {
          await env.DB.prepare(
            "INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES('internal','dashboard','Owner',?,?, 'customer_request',?,'pending')"
          ).bind(
            "Owner Telegram alert failed",
            "Customer request #" + requestId + " was saved, but the optional Owner Telegram alert failed: " + String(ownerAlert.error || ownerAlert.reason || "unknown error").slice(0, 220) + ". Review the request in the dashboard.",
            requestId
          ).run();
        } catch (_) {}
      }
    } catch (_) {
      // Notification failure must never undo a successfully saved customer request.
    }

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

    if (auto && auto.pending_costs?.length) {
      return json({
        ok: false,
        error: "Opportunity not created: landed-cost rates are incomplete.",
        pending_costs: auto.pending_costs,
        calculation: auto
      }, 409);
    }
    if (auto && !(Number(b.asking_price) > 0)) {
      return json({ ok: false, error: "Opportunity not created: a positive supplier asking price is required." }, 409);
    }
    if (auto && !(Number(auto.retail_price_pkr) > 0)) {
      return json({ ok: false, error: "Opportunity not created: a valid retail reference is required." }, 409);
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
      Math.max(0, num(b.target_margin_pct) || 25), calc.expected_profit,
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
    const start = Math.max(0, Math.floor(num(b.start)));
    const batchSize = Math.max(1, Math.min(50, Math.floor(num(b.batch_size) || 50)));
    const startedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','running') ON CONFLICT(key) DO UPDATE SET value='running'`).run();
    await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_started_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(startedAt).run();
    try {
      const result = await runManualCatalogSyncBatch(env, start, batchSize);
      if (result.status === 'failed' || result.error) {
        await env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','failed') ON CONFLICT(key) DO UPDATE SET value='failed'`).run();
      }
      return json(result);
    } catch (e) {
      const message = String(e?.message || e).slice(0,1000);
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','failed') ON CONFLICT(key) DO UPDATE SET value='failed'`),
        env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(message),
        env.DB.prepare(`INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).bind(new Date().toISOString())
      ]);
      return json({ ok:false,error:message,status:'failed' },500);
    }
  }

  return json({ error: "Not found" }, 404);
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PAKTHAI TECH - AI Sourcing Engine</title>
<link rel="icon" type="image/png" sizes="192x192" href="https://pakthai-tech-store.pages.dev/icons/icon-192.png?v=5">
<link rel="apple-touch-icon" href="https://pakthai-tech-store.pages.dev/icons/icon-192.png?v=5">
<style>
body{font-family:Arial,sans-serif;margin:0;background:#f4f6fa;color:#111}
header{background:#111827;color:#fff;padding:14px 24px;display:flex;justify-content:space-between;align-items:center;gap:16px}.brand-lockup{display:flex;align-items:center;gap:14px;min-width:0}.brand-logo{display:block;width:clamp(112px,18vw,190px);height:64px;object-fit:contain;object-position:left center;flex:0 0 auto}.brand-copy{min-width:0}.brand-copy strong{display:block;font-size:clamp(16px,2vw,22px);line-height:1.2}.brand-copy div{font-size:14px;opacity:.9;margin-top:4px}@media(max-width:520px){header{padding:10px 12px;gap:8px}.brand-lockup{gap:8px}.brand-logo{width:86px;height:48px}header button{padding:8px 9px;font-size:12px}}
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
@keyframes pakthaiSpin{to{transform:rotate(360deg)}}
.sync-spin{width:12px!important;height:12px!important;border:2px solid #9ca3af;border-top-color:#22c55e;border-radius:50%;animation:pakthaiSpin .8s linear infinite;box-sizing:border-box;background:transparent!important}
input,select{width:100%;box-sizing:border-box;padding:9px;border:1px solid #ccc;border-radius:8px;margin:5px 0 10px}
label{font-size:13px;font-weight:600}
@media(max-width:800px){.cards,.grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>
<div id="authGate" style="display:flex;position:fixed;inset:0;z-index:99999;background:#f4f6fa;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;overflow:auto"><form id="authForm" style="background:white;border:1px solid #ddd;border-radius:16px;padding:26px;width:100%;max-width:440px;box-shadow:0 8px 30px #0002"><h2 style="margin-top:0">PAKTHAI TECH Secure Login</h2><p>Owner and approved staff use separate accounts. Login stays active on this device for up to 8 hours.</p><label for="authRole">Account type</label><select id="authRole" style="width:100%;padding:10px;margin:6px 0 14px"><option value="owner">Owner</option><option value="staff">Approved Staff (read-only)</option></select><label for="authEmail">Email (staff only)</label><input id="authEmail" type="email" autocomplete="username" placeholder="Staff email" style="width:100%;padding:10px;margin:6px 0 14px;box-sizing:border-box"><label for="authPassword">Password</label><input id="authPassword" type="password" autocomplete="current-password" required style="width:100%;padding:10px;margin:6px 0 14px;box-sizing:border-box"><button type="submit" style="width:100%">Log In</button><button type="button" id="staffRequestBtn" style="width:100%;margin-top:8px;background:#eef2ff;color:#172554">Request Staff Access</button><button type="button" id="ownerRecoveryBtn" style="width:100%;margin-top:8px;background:#f3f4f6;color:#111">Set / Recover Owner Password by Email</button><p id="authMessage" role="status" style="white-space:pre-wrap;color:#a11"></p><small>Owner password reset links go only to pakthaitech@gmail.com. Staff access requires Owner approval. Never share passwords or email links.</small></form></div>
<header><div class="brand-lockup"><img class="brand-logo" src="https://pakthai-tech-store.pages.dev/assets/pakthai-tech-brand-cover.png" alt="PakThai Tech logo" onerror="this.style.display='none'"><div class="brand-copy"><strong>PAKTHAI TECH</strong><div>AI Sourcing Engine</div></div></div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><span id="catalogSyncIndicator" role="status" aria-live="polite" title="Live source catalog synchronization status" style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#fff;background:#1f2937;border:1px solid #64748b;border-radius:999px;padding:9px 13px;min-height:18px"><span id="catalogSyncDot" style="display:inline-block;width:12px;height:12px;flex:0 0 12px;border-radius:50%;background:#9ca3af;box-shadow:0 0 0 3px #ffffff20"></span><span id="catalogSyncLabel">Catalog sync: checkingâ€¦</span></span><button id="catalogSyncBtn" onclick="sync()">Sync Source Catalog</button></div></header>
<main>
<div class="cards">
<div class="card">Products<b id="products">Loading...</b></div>
<div class="card">Sellers<b id="sellers">Loading...</b></div>
<div class="card" onclick="show('opportunitiesPage')" style="cursor:pointer">Opportunities<b id="opps">Loading...</b><small>Click to view sourcing opportunities</small></div>
<div class="card">Active Zones<b id="zones">Loading...</b></div>
</div>
<p id="dashboardLoadStatus" role="status" aria-live="polite" style="margin:8px 0;color:#475569"></p>
<nav>
<button onclick="show('dashboard')">Dashboard</button>
<button onclick="show('seller')">Seller Database</button>
<button onclick="show('opportunity')">Small-Lot Calculator</button>
<button onclick="show('history')">Seller History</button><button onclick="show('opportunitiesPage');loadOpportunitiesPage()">Sourcing Opportunities</button><button onclick="openBuyerCenter()">Pakistan Buyer Center</button><button onclick="openDiscoveryCenter()">Buyer Discovery</button><button onclick="show('partnersPage');loadSourcingPartners()">Sourcing Partners</button><button onclick="show('voicecenter')">Voice Assistant</button>
</nav><section id="partnersPage" class="panel" style="display:none"><h2>Sourcing Partner Management</h2><p>Owner-only. External messages are not sent automatically.</p><form id="partnerForm" onsubmit="return addSourcingPartner(event)"><label>Name <input id="partnerName" required maxlength="120"></label> <label>Country code <input id="partnerCountryCode" required pattern="[A-Za-z]{2}" maxlength="2" placeholder="KR"></label> <label>Country name <input id="partnerCountryName" required maxlength="80"></label> <label>Contact <input id="partnerContact" maxlength="160"></label> <label>Email <input id="partnerEmail" type="email" maxlength="160"></label> <label>Lead type <select id="partnerLeadType"><option value="all">All</option><option value="buyer">Buyer</option><option value="supplier">Supplier</option></select></label> <button type="submit">Add partner</button></form><p id="partnerStatus" role="status"></p><div id="partnerList">Loading partnersâ€¦</div></section>
<section id=dashboard class=panel><h2>System Status</h2><p>Database connected. Small-lot sourcing is allowed. Partner lead alerts use saved partner email when available and remain subject to Owner review. Meta WhatsApp automation is paused while sender verification is incomplete; quotes, prices, orders and commitments still require Owner approval.</p><p>Customer-facing PakThai Tech remains separate from the upstream source.</p><div class="card" style="margin-top:16px"><h3>Engine Health &amp; Automation Monitor</h3><p>Read-only view of recorded automation status. A recorded run is not proof of a complete customer workflow.</p><div id="engineMonitorStatus" role="status" aria-live="polite">Loading engine status...</div><button type="button" class="alt" onclick="loadEngineMonitor()">Refresh Engine Monitor</button></div>
<div class="card" style="margin-top:16px" id="masterPlanFeatureCenter">
<h3>Master Plan - Feature Control Center</h3>
<p>Use each button to open the relevant module or inspect its current implementation status. A proposal is not marked active until its feature, tests and evidence are complete.</p>
<div class="grid">
<div class="card"><b style="font-size:16px">U1 - Engine Monitor</b><p><strong>DEPLOYED - READ ONLY</strong><br>Recorded runs, errors and real record counts.</p><button type="button" onclick="openUpgradeFeature(&quot;U1&quot;)">View / Refresh</button></div>
<div class="card"><b style="font-size:16px">U2 - Lead Evidence Priority Score</b><p><strong>PARTIAL - HEURISTIC DEPLOYED</strong><br>Buyer and market prospect tables show a 0–100 evidence-priority hint; it is not verified lead quality.</p><button type="button" onclick="openUpgradeFeature(&quot;U2&quot;)">Open Discovery</button></div>
<div class="card"><b style="font-size:16px">U3 - Store Analytics</b><p><strong>NOT VERIFIED</strong><br>Views, searches and inquiry funnel are not confirmed.</p><button type="button" onclick="openUpgradeFeature(&quot;U3&quot;)">Check Status</button></div>
<div class="card"><b style="font-size:16px">U4 - Product Comparison</b><p><strong>PARTIAL</strong><br>Catalogue exists; advanced comparison remains outstanding.</p><button type="button" onclick="openUpgradeFeature(&quot;U4&quot;)">Open Store</button></div>
<div class="card"><b style="font-size:16px">U5 - Auditable Quote Builder</b><p><strong>PARTIAL - OWNER GATED</strong><br>Calculator exists; verified costs and FX are required.</p><button type="button" onclick="openUpgradeFeature(&quot;U5&quot;)">Open Calculator</button></div>
<div class="card"><b style="font-size:16px">U6 - Lead-to-Order Timeline</b><p><strong>PARTIAL</strong><br>History and records exist; unified timeline remains outstanding.</p><button type="button" onclick="openUpgradeFeature(&quot;U6&quot;)">Open History</button></div>
</div>
<div id="upgradeFeatureDetails" role="status" aria-live="polite" style="margin-top:12px"></div>
</div>
<details class=card style=margin-top:16px><summary style="cursor:pointer;font-weight:700">Partner Delivery & Provider Status</summary><div style="padding-top:12px"><h3>Partner notification route</h3><p><b>Current route:</b> Partner lead routing prefers WhatsApp when the feature is enabled. However, automated WhatsApp delivery is currently blocked because Meta has not verified the Pakistan sender number. The system must not claim a WhatsApp alert was sent in this state.</p><p><b>Fallback:</b> A validated partner email is prepared as an Owner-review draft; it is not automatically sent. If no valid email exists, the dashboard can prepare a WhatsApp draft for manual review. Automated WhatsApp requires Meta sender status VERIFIED and confirmed webhook delivery. No lead details are sent outside the active partner list.</p><p><b>Delivery proof:</b> WhatsApp API acceptance does not prove delivery; use the delivery-status receipt. Gmail provider acceptance also does not prove that an email reached the recipient inbox.</p><p><b>Backup status:</b> Browser-push code and public VAPID key are deployed, and the private VAPID key is stored as a Cloudflare secret. Final activation still requires the Owner to enable this browser and receive a self-test notification. Resend remains inactive until a verified sender domain and API key are provided.</p><p>The Meta webhook subscription was previously configured. Inbound delivery has not been confirmed in this review; sender phone verification remains the current outbound blocker.</p><div class="card" style="margin:12px 0;padding:12px"><h4>Meta phone verification status</h4><p id="whatsappVerificationStatus" role="status" aria-live="polite">Checking the current Meta phone statusâ€¦</p><button type="button" class="alt" onclick="refreshWhatsAppVerificationStatus()">Refresh Meta status</button><p>Meta previously refused a verification-code request (136024) and rejected the Register endpoint for SMB businesses (code 100). Do not request another SMS or voice code, use /register, disconnect, or re-register while Meta support case 29002498606053019 is pending. Automatic WhatsApp stays paused until live diagnostics report VERIFIED. Profile review and phone-number code verification are separate.</p></div></div><button class="alt" onclick="loadOutboundQueue()">Refresh Message Queue</button></div></details><details class="card" style="margin-top:16px" id="browserPushPanel"><summary style="cursor:pointer;font-weight:700">Owner Browser Push Backup</summary><div style="padding-top:12px"><p>Browser push is for the signed-in Owner device only. It is separate from WhatsApp and Gmail. Nothing is sent to customers or partners by this feature.</p><p id="browserPushStatus" role="status">Checking browser-push setup...</p><button type="button" onclick="enableOwnerBrowserPush()">Enable this browser</button> <button type="button" class="alt" onclick="testOwnerBrowserPush()">Send test to this Owner browser</button></div></details><div class=card style=margin-top:16px><h3>AI Automation Controls - ON / OFF</h3><p>These switches control the AI sourcing automation. Changes save immediately.</p><div class=grid><div><label>Master AI</label><button id=ctrlMaster data-key=master_ai_mode data-type=mode onclick=toggleControl(this)>Loading...</button></div><div><label>Auto Search</label><button id=ctrlSearch data-key=auto_search_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Seller Matching</label><button id=ctrlSeller data-key=seller_matching_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Negotiation</label><button id=ctrlNegotiation data-key=negotiation_mode data-type=mode onclick=toggleControl(this)>Loading...</button></div><div><label>Auto Follow-up</label><button id=ctrlFollowup data-key=auto_followup_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Opportunity Creation</label><button id=ctrlOpportunity data-key=opportunity_creation_enabled onclick=toggleControl(this)>Loading...</button></div></div><h3 style=margin-top:18px>Global Cost Controls</h3><div class=grid><div><label>Travel</label><button data-key=travel_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Pickup</label><button data-key=pickup_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Packing</label><button data-key=packing_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Freight / Shipping</label><button data-key=freight_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Duties</label><button data-key=duty_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Payment</label><button data-key=payment_fee_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Pakistan Transport</label><button data-key=pakistan_transport_enabled onclick=toggleControl(this)>Loading...</button></div><div><label>Contingency</label><button data-key=contingency_enabled onclick=toggleControl(this)>Loading...</button></div></div><p style=margin-top:12px><b>Owner Approval:</b> ALWAYS ON / REQUIRED</p></div><div class=card style="margin-top:16px" id="landedCostSettings"><h3>Landed Cost Rates & Exchange Rates</h3><p>Owner-only configuration. Enter verified actual costs and current exchange rates. Zero means NOT CONFIGURED; it must not be treated as a real cost or quote. No customer quote is sent from this form.</p><div class="grid"><div><label>Travel (PKR / km)</label><input id="rateTravel" type="number" min="0" step="0.01" value="0"></div><div><label>Pickup (PKR / lot)</label><input id="ratePickup" type="number" min="0" step="0.01" value="0"></div><div><label>Packing (PKR / item)</label><input id="ratePacking" type="number" min="0" step="0.01" value="0"></div><div><label>Freight / shipping (PKR / item)</label><input id="rateFreight" type="number" min="0" step="0.01" value="0"></div><div><label>Duties (% of purchase)</label><input id="rateDuty" type="number" min="0" max="100" step="0.01" value="0"></div><div><label>Payment fee (% of retail)</label><input id="ratePayment" type="number" min="0" max="100" step="0.01" value="0"></div><div><label>Pakistan transport (PKR / item)</label><input id="ratePakistanTransport" type="number" min="0" step="0.01" value="0"></div><div><label>Contingency (% of costs)</label><input id="rateContingency" type="number" min="0" max="100" step="0.01" value="0"></div><div><label>THB â†’ PKR (1 THB)</label><input id="rateTHB" type="number" min="0" step="0.0001" value="0"></div><div><label>KRW â†’ PKR (1 KRW)</label><input id="rateKRW" type="number" min="0" step="0.0001" value="0"></div><div><label>Default target margin (%)</label><input id="rateMargin" type="number" min="1" max="80" step="0.1" value="25"></div></div><p><button type="button" onclick="saveCostSettings()">Save Rates</button> <button type="button" class="alt" onclick="loadCostSettings()">Reload Current Rates</button></p><p id="costSettingsStatus" role="status" aria-live="polite">Loading saved rates...</p></div><div class=card style=margin-top:16px><h3>Country Sourcing Controls</h3><p>Turn sourcing countries ON or OFF. Changes are saved immediately.</p><div class=grid><div><label>Thailand / Bangkok</label><button id=countryThailandBtn data-key=country_thailand_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>South Korea</label><button data-key=country_south_korea_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Singapore</label><button data-key=country_singapore_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Malaysia</label><button data-key=country_malaysia_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Vietnam</label><button data-key=country_vietnam_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Australia</label><button data-key=country_australia_enabled onclick=toggleCountry(this)>Loading...</button></div><div><label>Pakistan</label><button data-key=country_pakistan_enabled onclick=toggleCountry(this)>Loading...</button></div></div></div><div class=card style=margin-top:16px><h3>Inbox Center</h3><p>Mailbox and WhatsBox stay collapsed until you open them. Select any message to read its content.</p><details style="border:1px solid #d7dee8;border-radius:10px;padding:12px;margin:10px 0"><summary style="cursor:pointer;font-weight:700">Mailbox â€” Gmail Inbox</summary><p><button type="button" onclick="window.location.href='/auth/google/start'">Connect / Reconnect Gmail</button> <button type="button" class="alt" onclick="loadGmailStatus()">Check Gmail Status</button> <button type="button" class="alt" onclick="loadGmailMailbox()">Refresh Mailbox</button></p><p id="gmailConnectionStatus" role="status" aria-live="polite">Gmail connection not checked.</p><div id="gmailMailbox" aria-live="polite">Open and refresh to load recent Gmail messages.</div></details><details style="border:1px solid #d7dee8;border-radius:10px;padding:12px;margin:10px 0"><summary style="cursor:pointer;font-weight:700">WhatsApp Inbox â€” opt-in and delivery history</summary><p><button onclick="loadWhatsAppMailbox()">Refresh WhatsBox</button></p><div id="whatsAppMailbox" aria-live="polite">Open and refresh to load inbound WhatsApp messages and outgoing status.</div></details></div><details class=card style=margin-top:16px><summary style="cursor:pointer;font-weight:700">Outgoing Message Queue â€” WhatsApp opt-in / Email Owner Approval</summary><div style="padding-top:12px"><h3>AI Outbound Message Queue</h3><p>AI prepares replies and follow-ups automatically. <b>Approve &amp; Send sends the email immediately</b> after your confirmation, using the connected provider. Anti-spam limit: maximum 10 emails in any rolling 24 hours and no repeat email to the same recipient within 24 hours. Remove record hides a queue entry; it does not recall an email already sent. Quotes, prices, orders and commitments remain approval-gated.</p><div class="card" style="margin:14px 0"><h4>Prepare a free WhatsApp draft</h4><p>For a self-test, use your own number. For client leads, use the prepared partner draft below. This opens WhatsApp with text filled in; review it and press Send there. No API provider is used.</p><form id="freeWhatsAppForm" onsubmit="return prepareFreeWhatsAppDraft(event)"><label for="freeWhatsAppPhone">WhatsApp number with country code</label><input id="freeWhatsAppPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" placeholder="971â€¦ or 82â€¦" required><label for="freeWhatsAppMessage">Text</label><textarea id="freeWhatsAppMessage" maxlength="4000" rows="4" required placeholder="Type a message or self-test textâ€¦"></textarea><button type="submit">Prepare &amp; Open WhatsApp</button></form><p id="freeWhatsAppStatus" role="status" aria-live="polite"></p></div><button onclick="prepareOutreachDraftsNow()">Prepare Outreach Drafts Now</button> <button class="alt" onclick="loadOutboundQueue()">Refresh Message Queue</button><div id="outboundQueue" style="margin-top:12px">Loading prepared messages...</div></div></details><div class=card style=margin-top:16px><h3>Customer Requests â€” Owner Approval</h3><p>New customer requests stay pending until Owner approves or rejects them.</p><div id=customerRequestsApproval>Loading...</div></div></section>

<section id="voicecenter" class="panel" style="display:none">
<h2>PakThai Voice & Quick Status</h2>
<p>Read-only assistant. Use the microphone where supported, or type a command. It will not approve orders, change settings, or send messages.</p>
<div class="grid">
<div><label>Type a command</label><input id="voiceCommand" placeholder="e.g. system status / catalog sync status / pending approvals / Gmail status"><button onclick="runVoiceCommand(document.getElementById('voiceCommand').value)">Run Command</button><button class="alt" onclick="startVoiceInput()">ðŸŽ™ Speak</button></div>
<div><label>Assistant result</label><div id="voiceResult" class="card" aria-live="polite">Ready. Try â€œsystem statusâ€.</div></div>
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
<button class="alt" onclick="createOpportunity()">Create Opportunity - Owner Approval Pending</button>
<div id="calcResult" style="margin-top:18px"></div>
</section>
<section id="history" class="panel" style="display:none">
<h2>Seller History</h2><div id="historyList">Loading...</div>
</section>
<section id="opportunitiesPage" class="panel" style="display:none">
<h2>Sourcing Opportunities</h2>
<p>All created sourcing opportunities are listed below. Owner approval remains pending until approved.</p>
<div id="opportunitiesList">Loading...</div>
</section>
</main>
<script>

function pushBase64UrlToBytes(value){const pad='='.repeat((4-value.length%4)%4);const b=atob((value+pad).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0));}
async function initBrowserPushPanel(){const box=document.getElementById('browserPushStatus');if(!box)return;try{const r=await fetch('/api/browser-push/config',{cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Push configuration unavailable');if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){box.textContent='This browser does not support web push. Use an up-to-date Chrome or Edge on HTTPS.';return;}const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});const sub=await reg.pushManager.getSubscription();box.textContent=sub?'Browser push enabled on this device. Server subscriptions: '+j.subscriptions_count+'.':'Ready to enable. Server subscriptions: '+j.subscriptions_count+'. Click Enable this browser.';if(!j.configured)box.textContent='Push sender keys are not configured on the server; subscription is disabled until setup completes.';}catch(e){box.textContent='Browser push setup status: '+String(e.message||e);}}
async function enableOwnerBrowserPush(){const box=document.getElementById('browserPushStatus');try{if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw new Error('Browser push is unsupported here.');const permission=await Notification.requestPermission();if(permission!=='granted')throw new Error('Notification permission was not granted.');const r=await fetch('/api/browser-push/config',{cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok||!j.configured)throw new Error(j.error||'Server push keys are not configured.');const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/'});let sub=await reg.pushManager.getSubscription();if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:pushBase64UrlToBytes(j.public_key)});const save=await fetch('/api/browser-push/subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sub)});const saved=await save.json();if(!save.ok||!saved.ok)throw new Error(saved.error||'Subscription could not be saved.');box.textContent='Enabled and saved for this Owner browser. You can send a local setup test now.';}catch(e){box.textContent='Could not enable browser push: '+String(e.message||e);}}
async function testOwnerBrowserPush(){const box=document.getElementById('browserPushStatus');if(!confirm('Send one setup-test notification to your own signed-in browser only? No partner or customer will be contacted.'))return;try{const r=await fetch('/api/browser-push/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({owner_confirmed:true})});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'Push test failed');box.textContent='Owner-browser test result: '+j.sent+' sent to push service, '+j.failed+' failed. A service acceptance is not proof the notification was displayed.';}catch(e){box.textContent='Owner-browser test failed: '+String(e.message||e);}}

async function api(p,o){return fetch(p,o).then(r=>r.json())}
async function dashboardRead(path,kind){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(path,{cache:'no-store',credentials:'same-origin',headers:{accept:'application/json'},signal:controller.signal});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error('HTTP '+response.status+(data?.error?': '+String(data.error):''));
  if(!Array.isArray(data))throw new Error('Unexpected '+kind+' response format');
  return data;
 }catch(error){if(error?.name==='AbortError')throw new Error('Timed out after 12 seconds');throw error;}
 finally{clearTimeout(timer);}
}
async function refresh(){
 const status=document.getElementById('dashboardLoadStatus');
 const cards=[['products','Products'],['sellers','Sellers'],['zones','Active zones'],['opps','Opportunities']];
 for(const [id] of cards){const el=document.getElementById(id);if(el)el.textContent='Loading...';}
 if(status)status.textContent='Loading dashboard data...';
 const requests=[['products','/api/products'],['sellers','/api/sellers'],['zones','/api/zones'],['opps','/api/opportunities']];
 const results=await Promise.allSettled(requests.map(([key,path])=>dashboardRead(path,key)));
 const loaded={},failures=[];
 results.forEach((result,index)=>{
  const [key,path]=requests[index],el=document.getElementById(key);
  if(result.status==='fulfilled'){
   loaded[key]=result.value;
   if(el)el.textContent=result.value.length.toLocaleString();
  }else{
   const message=String(result.reason?.message||result.reason||'Request failed');
   failures.push(path+': '+message);
   if(el)el.textContent='Unavailable';
  }
 });
 if(Array.isArray(loaded.products))cachedProducts=loaded.products;
 if(Array.isArray(loaded.sellers)){cachedSellers=loaded.sellers;renderSellers(loaded.sellers);}
 else{const list=document.getElementById('sellerList');if(list)list.textContent='Seller list unavailable. '+(failures.find(x=>x.startsWith('/api/sellers:'))||'');}
 renderHistory();
 if(Array.isArray(loaded.products)&&Array.isArray(loaded.sellers))populateOpportunitySelectors();
 if(status){
  status.style.color=failures.length?'#b45309':'#475569';
  status.innerHTML=failures.length?'Some dashboard data could not be loaded: '+esc(failures.join(' | '))+' <button type="button" class="alt" onclick="refresh()">Retry</button>':'Dashboard data loaded.';
 }
 loadCustomerRequestsApproval();loadOutboundQueue();loadWhatsAppStatus();refreshWhatsAppVerificationStatus();updateCatalogSyncIndicator();loadEngineMonitor();
}
async function loadEngineMonitor(){
 const box=document.getElementById('engineMonitorStatus');if(!box)return;
 box.textContent='Checking recorded engine runs...';
 try{
  const [d,c]=await Promise.all([api('/api/dashboard'),api('/api/controls')]);
  if(d.error||!d.engine_monitor)throw new Error(d.error||'Engine status is not available');
  const e=d.engine_monitor,cat=e.catalog_sync||{},controls=c.controls||{};
  const runs=[['Catalog sync',cat],['AI prospect screening',e.ai_screening],['Pakistan buyer discovery',e.buyer_discovery],['Market discovery',e.market_discovery],['Sourcing phase 2',e.phase2]];
  const stamp=x=>x?.ran_at?String(x.ran_at):'No run recorded';
  const items=runs.map(([label,x])=>'<li><b>'+esc(label)+':</b> '+esc(String(x?.status||'not reported').toUpperCase())+' <small>('+esc(stamp(x))+')</small>'+(x?.last_error?'<br><small>Last error: '+esc(x.last_error)+'</small>':'')+(label==='Catalog sync'?'<br><small>Cursor '+Number(cat.cursor||0)+'; last batch saved '+Number(cat.last_saved||0)+'; failed '+Number(cat.last_failed||0)+'; cycle failures '+Number(cat.cycle_failed||0)+'</small>':'')+'</li>').join('');
  const b=e.business_readiness||{};
  box.innerHTML='<ul>'+items+'</ul><p><b>Real business records:</b> buyers '+Number(b.buyers||0)+', active buyer requirements '+Number(b.active_requirements||0)+', sellers '+Number(b.sellers||0)+', opportunities '+Number(b.opportunities||0)+'.</p><p><b>Owner approval:</b> '+(controls.owner_approval_required?'REQUIRED':'Check control status')+'. This monitor is read-only; recorded runs do not prove end-to-end delivery.</p>';
 }catch(err){box.textContent='Engine monitor could not load: '+String(err.message||err)+'. Use Refresh Engine Monitor to retry.';}
}
function openUpgradeFeature(id){
 const box=document.getElementById('upgradeFeatureDetails');
 const details={
  U1:{title:'U1 - Engine Monitor',status:'DEPLOYED - READ ONLY',text:'Refresh the Engine Health panel above. Recorded run markers do not prove end-to-end delivery.',action:()=>loadEngineMonitor()},
  U2:{title:'U2 - Lead Evidence Priority Score',status:'PARTIAL - HEURISTIC DEPLOYED',text:'Buyer Discovery and Thailand/South Korea market prospect tables show a transparent 0–100 evidence-priority hint. It is a heuristic for review, not verified lead quality or proof of buyer intent; remaining calibration and factor-specific tests are outstanding. No automatic qualification, opportunity creation or outreach occurs.',action:()=>openDiscoveryCenter()},
  U3:{title:'U3 - Store Analytics & Funnel',status:'NOT VERIFIED / NOT ENABLED',text:'No confirmed event dashboard is available yet. Views, searches, inquiry starts and completed sales must be measured separately. No analytics data is fabricated.',action:()=>{}},
  U4:{title:'U4 - Product Search & Comparison',status:'PARTIAL',text:'The live store catalogue is available. Advanced filters and side-by-side technical comparison are not yet implemented in this engine.',action:()=>window.open('https://pakthai-tech-store.pages.dev/','_blank','noopener')},
  U5:{title:'U5 - Auditable Quote Builder',status:'PARTIAL - OWNER APPROVAL REQUIRED',text:'Use the existing Small-Lot Calculator. Verified seller offers, current THB/KRW rates and real cost inputs are required before relying on a quote.',action:()=>show('opportunity')},
  U6:{title:'U6 - Lead-to-Order CRM Timeline',status:'PARTIAL',text:'Seller History and current records exist, but one connected inquiry-to-delivery timeline is not yet implemented.',action:()=>show('history')}
 };
 const x=details[id];if(!x||!box)return;
 box.innerHTML='<h4>'+esc(x.title)+' - '+esc(x.status)+'</h4><p>'+esc(x.text)+'</p>';
 try{x.action()}catch(e){box.textContent=x.title+': '+String(e.message||e)}
}
async function loadCustomerRequestsApproval(){
  const box=document.getElementById('customerRequestsApproval'); if(!box)return;
  try{
    const r=await api('/api/customer-approvals'); const a=r.requests||[];
    if(!a.length){box.innerHTML='<p>No customer requests yet.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>ID</th><th>Customer</th><th>Contact</th><th>Country</th><th>Request</th><th>Qty</th><th>Budget</th><th>Assigned Partner</th><th>Status</th><th>Owner Action</th></tr>'+a.map(x=>{
      const st=String(x.status||'new'); const pending=!['approved','rejected'].includes(st);
      const action=pending?'<button onclick="setCustomerApproval('+Number(x.id)+',&#39;approved&#39;)">Approve</button> <button class="alt" onclick="setCustomerApproval('+Number(x.id)+',&#39;rejected&#39;)">Reject</button>':esc(st);
      const contact=[x.phone,x.whatsapp,x.email].filter(Boolean).map(esc).join('<br>')||'Not provided';
      const partner=x.assigned_partner_name?esc(x.assigned_partner_name):'Owner review - no active country partner';
      const budget=x.max_budget_pkr?('PKR '+fmt(x.max_budget_pkr)):'Not provided';
       return '<tr><td>#'+Number(x.id)+'</td><td>'+esc(x.customer_name||'')+'<br><small>'+esc(x.city||'')+'</small></td><td>'+contact+'</td><td>'+esc(x.country_code||'Not specified')+'</td><td>'+esc(x.product_title||'')+'<br><small>'+esc(x.request_type||'order_request')+' - '+esc(x.customer_note||'')+'</small></td><td>'+Number(x.quantity||1)+'</td><td>'+budget+'</td><td>'+partner+'</td><td>'+esc(st)+'</td><td>'+action+'</td></tr>';
    }).join('')+'</table></div>';
  }catch(e){box.innerHTML='<p style="color:red">'+esc(e.message||String(e))+'</p>';}
}
async function setCustomerApproval(id,decision){
  if(!id || !['approved','rejected'].includes(decision))return;
  const r=await api('/api/customer-approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_request_id:id,decision:decision,approved_by:'Owner'})});
  if(r.error){alert(r.error);return;}
  await loadCustomerRequestsApproval(); await refresh();
}
function show(id){for(const x of ['dashboard','seller','opportunity','history','opportunitiesPage','buyercenter','voicecenter','partnersPage','discoverycenter']){const el=document.getElementById(x);if(el)el.style.display=x===id?'block':'none'} if(id==='opportunitiesPage')loadOpportunitiesPage();if(id==='buyercenter')loadBuyerCenter();if(id==='voicecenter')checkVoiceSupport();if(id==='partnersPage'){loadSourcingPartners();loadGmailMailbox();loadWhatsAppMailbox();loadWhatsAppStatus();loadOutboundQueue();}}

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
  el.textContent='Listening - please speak a short status command.';
 rec.onresult=e=>{const heard=e.results?.[0]?.[0]?.transcript||'';document.getElementById('voiceCommand').value=heard;runVoiceCommand(heard);};
 rec.onerror=e=>{el.textContent='Voice input error: '+String(e.error||'unknown')+'. You can type the command instead.';};
 rec.onend=()=>checkVoiceSupport();
 try{rec.start();}catch(e){el.textContent='Could not start microphone. Check browser permission or type a command.';}
}
async function runVoiceCommand(raw){
 const cmd=String(raw||'').trim().toLowerCase();
 const out=document.getElementById('voiceResult');
 if(!cmd){out.textContent='Please type or speak a command.';return;}
  out.textContent='Checking...';
 try{
   if(/system status|status system|status check/.test(cmd)){
   const [h,d,c]=await Promise.all([api('/api/health'),api('/api/dashboard'),api('/api/controls')]);
   out.textContent='System: '+(h.ok?'ONLINE':'CHECK REQUIRED')+'; products '+(d.summary?.products??'?')+', sellers '+(d.summary?.sellers??'?')+', buyers '+(d.summary?.buyers??'?')+', opportunities '+(d.summary?.opportunities??'?')+'. Owner approval: '+(c.controls?.owner_approval_required?'REQUIRED':'CHECK REQUIRED')+'.';
   }else if(/catalog|sync status|catalog sync/.test(cmd)){
   const c=await api('/api/controls');const s=c.controls?.catalog_sync||{};
   const batchProgress=s.last_status==='partial'&&Number(s.last_failed||0)===0&&Number(s.last_cycle_failed||0)===0&&Number(s.cursor||0)>0&&!s.last_error;out.textContent='Catalog sync: '+(batchProgress?'SCHEDULED BATCH IN PROGRESS':String(s.last_status||'NOT REPORTED').toUpperCase())+'. Cursor '+(s.cursor??'?')+', latest batch saved '+(s.last_saved??'?')+', latest batch failed '+(s.last_failed??'?')+', completed-cycle failures '+(s.last_cycle_failed??'?')+', last run '+(s.last_run_at||'not recorded')+'. '+(batchProgress?'No product failures recorded so far; scheduled timer will continue from this cursor.':'Review latest error and completed-cycle failure count before interpreting status.');
   }else if(/pending approvals|approvals|pending approval/.test(cmd)){
   const d=await api('/api/dashboard');
   out.textContent='Pending approvals: '+(d.summary?.pending_approval??'not reported')+'. Pending notifications: '+(d.summary?.pending_notifications??'not reported')+'. This command only reads status; it does not approve anything.';
   }else if(/gmail|email/.test(cmd)){
   const g=await api('/api/gmail/status');
   out.textContent='Gmail authorized: '+String(!!g.authorized).toUpperCase()+'. Sending ready: '+String(!!g.actual_sending_ready).toUpperCase()+'. Real inbound/reply test: NOT VERIFIED.';
   }else if(/whatsapp/.test(cmd)){
   out.textContent='WhatsApp end-to-end status: NOT VERIFIED. Do not treat the outgoing helper as proof that inbound and replies work.';
   }else if(/buyer|seller|opportunity|buyers|sellers/.test(cmd)){
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
       return '<tr><td>#'+Number(x.id)+'</td><td>'+esc(x.customer_name||'')+'<br><small>'+esc(x.city||'')+'</small></td><td>'+contact+'</td><td>'+esc(x.country_code||'Not specified')+'</td><td>'+esc(x.product_title||'')+'<br><small>'+esc(x.request_type||'order_request')+' - '+esc(x.customer_note||'')+'</small></td><td>'+Number(x.quantity||1)+'</td><td>'+budget+'</td><td>'+partner+'</td><td>'+esc(st)+'</td><td>'+action+'</td></tr>';
  }catch(e){box.innerHTML='<p style="color:red">'+esc(e.message||String(e))+'</p>';}
}
let lastAutomaticCalculation=null;
let cachedProducts=[],cachedSellers=[];
function populateOpportunitySelectors(){
  productSelect.innerHTML=cachedProducts.map(x=>'<option value="'+x.id+'" data-price="'+(x.price_pkr||0)+'">'+esc(x.title)+' - PKR '+fmt(x.price_pkr)+'</option>').join('')||'<option value="">No products</option>';
  sellerSelect.innerHTML=cachedSellers.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' - '+esc((x.city||'')+', '+(x.country||''))+'</option>').join('')||'<option value="">No sellers</option>';
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
 lastAutomaticCalculation=null;
 calcResult.textContent='Recalculating with the current inputs...';
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById("costTravel").checked,pickup:document.getElementById("costPickup").checked,packing:document.getElementById("costPacking").checked,freight:document.getElementById("costFreight").checked,duties:document.getElementById("costDuties").checked,payment:document.getElementById("costPayment").checked,pakistan_transport:document.getElementById("costPakistan").checked,contingency:document.getElementById("costContingency").checked}};
 if(!b.product_id||!b.seller_id)return alert('Product aur Seller select karein.');
 const x=await api('/api/opportunities/calculate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(x.error)return alert(x.error);
 lastAutomaticCalculation=x; margin.value=x.target_margin_pct; retail.value=x.retail_price_pkr;
 const c=x.cost_breakdown||{};
 calcResult.innerHTML='<div class="card"><b>'+esc(x.classification)+'</b><p>Product: '+esc(x.product_title)+'</p><p>Seller: '+esc(x.seller_name)+'</p><p>Auto costs: Travel '+fmt(c.travel)+' | Pickup '+fmt(c.pickup)+' | Packing '+fmt(c.packing)+' | Freight '+fmt(c.freight)+' | Duties '+fmt(c.duties)+' | Payment '+fmt(c.payment)+' | Pakistan transport '+fmt(c.pakistan_transport)+' | Contingency '+fmt(c.contingency)+'</p><p>Landed cost / total: PKR '+fmt(x.landed_total)+'</p><p>Landed cost / unit: PKR '+fmt(x.landed_per_unit)+'</p><p>Max buy/unit for target margin: PKR '+fmt(x.max_buy_per_unit)+'</p><p>Expected profit: PKR '+fmt(x.expected_profit)+'</p><p>Expected margin: '+fmt(x.expected_margin_pct)+'%</p><p>Approval: Pending Owner Approval</p>'+(x.warnings&&x.warnings.length?'<p><b>Settings note:</b> '+esc(x.warnings.join(', '))+'</p>':'')+'</div>';
}
async function createOpportunity(){
 await calculateAuto();
 if(!lastAutomaticCalculation)return;
 if(lastAutomaticCalculation.costs_complete===false){
   const missing=(lastAutomaticCalculation.pending_costs||[]).join(', ');
   alert('Opportunity blocked: configure verified landed-cost rates first'+(missing?' ('+missing+')':'')+'.');
   return;
 }
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById("costTravel").checked,pickup:document.getElementById("costPickup").checked,packing:document.getElementById("costPacking").checked,freight:document.getElementById("costFreight").checked,duties:document.getElementById("costDuties").checked,payment:document.getElementById("costPayment").checked,pakistan_transport:document.getElementById("costPakistan").checked,contingency:document.getElementById("costContingency").checked}};
 const r=await api('/api/opportunities',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(r.error)return alert(r.error);
 alert('Opportunity #'+r.id+' created. Owner approval is pending.'); refresh();
}
let catalogSyncActive=false;
function paintCatalogSync(status,label,active){
 const dot=document.getElementById('catalogSyncDot'),txt=document.getElementById('catalogSyncLabel');
 if(!dot||!txt)return;
 dot.className=active?'sync-spin':'';
 dot.style.background=active?'transparent':(status==='complete'?'#22c55e':(['partial','failed','empty_source'].includes(status)?'#f59e0b':status==='running'?'#3b82f6':'#9ca3af'));
 txt.textContent=label;
}
async function updateCatalogSyncIndicator(){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
   const response=await fetch('/api/controls',{cache:'no-store',credentials:'same-origin',headers:{accept:'application/json'},signal:controller.signal});
   const r=await response.json().catch(()=>null);
   if(!response.ok)throw new Error('HTTP '+response.status+(r?.error?': '+String(r.error):''));
   const s=r.controls?.catalog_sync||{};const st=String(s.last_status||'not_run').toLowerCase();
  if(catalogSyncActive)return;
  const batchProgress=st==='partial'&&Number(s.last_failed||0)===0&&Number(s.last_cycle_failed||0)===0&&Number(s.cursor||0)>0&&!s.last_error;const label=st==='complete'?'Catalog sync: COMPLETE':batchProgress?'Catalog sync: SCHEDULED BATCH IN PROGRESS - latest batch saved '+(s.last_saved??0)+', 0 failed; cursor '+s.cursor:st==='partial'?'Catalog sync: PARTIAL - '+(s.last_failed||0)+' failed in latest batch'+(s.last_error?'; '+s.last_error:''):st==='failed'?'Catalog sync: FAILED':st==='empty_source'?'Catalog sync: source empty':st==='running'?'Catalog sync: RUNNING / possibly interrupted':'Catalog sync: NOT RUN YET';
  paintCatalogSync(st,label,false);
  }catch(e){paintCatalogSync('unknown','Catalog sync: status unavailable ('+String(e?.message||e)+')',false);}
  finally{clearTimeout(timer);}
}
async function prepareOutreachDraftsNow(){
 const box=document.getElementById('outboundQueue');if(box)box.textContent='Preparing safe outreach drafts; no messages will be sent...';
 try{
  const r=await api('/api/outreach/prepare',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if(!r.ok)throw new Error(r.reason||r.error||'Draft preparation failed');
  if(box)box.textContent='Draft preparation complete: '+Number(r.prepared||0)+' prepared; '+Number(r.skipped||0)+' skipped. No external messages were sent.';
  await loadOutboundQueue();
 }catch(e){if(box)box.textContent='Could not prepare outreach drafts: '+String(e.message||e);}
}async function deleteGmailMessage(id){if(!id||!confirm('Move this email to Gmail Trash?'))return;const box=document.getElementById('gmailMailbox');try{const r=await fetch('/api/gmail/delete',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({message_id:id})});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));if(box)box.textContent='Email moved to Gmail Trash. Refreshing inbox...';await loadGmailMailbox();}catch(e){if(box)box.textContent='Email delete failed: '+String(e.message||e)+'. If Gmail asks for more permission, reconnect Gmail once.';}}
async function loadGmailStatus(){const box=document.getElementById('gmailConnectionStatus');if(!box)return;box.textContent='Checking Gmail connection...';try{const g=await api('/api/gmail/status');if(!g.ok)throw new Error(g.error||'Status check failed');box.textContent='Gmail authorization: '+(g.authorized?'PRESENT':'MISSING')+'; sending provider configured: '+(g.sending_provider_configured?'YES':'NO')+'; provider: '+String(g.outbound_email_provider||'unknown')+'. '+(g.authorized?'If inbox refresh still fails, use Connect / Reconnect Gmail and complete Google consent.':'Use Connect / Reconnect Gmail and complete Google consent. Provider acceptance is not proof of inbox delivery.');}catch(e){box.textContent='Gmail status check failed: '+String(e.message||e)+'. Confirm the Owner is signed in, then reconnect Gmail if needed.';}}
async function loadGmailMailbox(){
 const box=document.getElementById('gmailMailbox');if(!box)return;box.textContent='Loading Gmail inbox...';
 try{const r=await api('/api/gmail/inbox');const msgs=r.messages||[];if(!msgs.length){box.textContent='No messages found in Gmail Inbox.';return;}box.innerHTML=msgs.map(m=>'<details style="border-top:1px solid #e5e7eb;padding:9px 0"><summary style="cursor:pointer"><b>'+esc(m.unread?'[UNREAD] ':'')+esc(m.subject||'(no subject)')+'</b><div style="font-size:12px;color:#64748b">'+esc(m.from||'')+' - '+esc(m.date||'')+'</div><div style="font-size:13px">'+esc(m.snippet||'')+'</div></summary><div style="padding:10px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.body||m.snippet||'(No plain-text body available)')+'</div><button class="alt" onclick="deleteGmailMessage(&quot;'+esc(m.id)+'&quot;)">Delete email</button></details>').join('');}
 catch(e){box.textContent='Mailbox error: '+String(e.message||e)+'. Confirm Gmail is connected and Owner session is active.';}
}
async function subscribeWhatsAppWebhook(){const box=document.getElementById('whatsAppMailbox');const status=document.getElementById('whatsappAutomationStatus');const say=m=>{if(box)box.textContent=m;if(status)status.textContent=m;};say('Verifying Meta WhatsApp webhook subscription...');try{const r=await fetch('/api/notifications/whatsapp-webhook-subscribe',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||'Meta subscription failed');say('Meta webhook subscription and callback verified. Saved active partner numbers can now send START.');}catch(e){say('WhatsApp webhook setup failed: '+String(e.message||e));}}
async function refreshWhatsAppVerificationStatus(){
 const box=document.getElementById('whatsappVerificationStatus');if(!box)return;box.textContent='Checking...';
 try{const r=await fetch('/api/notifications/whatsapp-diagnostics',{headers:{'accept':'application/json'}});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));const p=j.phone||{};const status=String(p.status||'unknown').toUpperCase();const quality=String(p.quality_rating||'unknown').toUpperCase();const verification=String(p.code_verification_status||'unknown').toUpperCase();box.textContent='Meta phone status: '+status+'; quality: '+quality+'; code verification: '+verification+'. '+(verification==='VERIFIED'?'Meta now reports the phone as verified.':'Keep automatic WhatsApp paused until Meta Support provides the supported SMB action and Graph reports VERIFIED.');}
 catch(e){box.textContent='Could not refresh Meta phone status: '+String(e.message||e)+'. The verification-code and Register actions remain blocked.';}
}
async function sendWhatsAppTemplateTest(){
 const box=document.getElementById('whatsAppMailbox');if(!box)return;box.textContent='Checking the live Meta sender, WABA link and approved template. This check does not send a message...';
 try{const r=await fetch('/api/notifications/whatsapp-template-test',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:'{}'});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||!j.ok)throw new Error((j.error||('HTTP '+r.status))+(j.meta_error_code?' (Meta code '+j.meta_error_code+')':''));const p=j.phone||{};const lines=['LIVE META DIAGNOSTICS â€” NO MESSAGE SENT','Checked: '+(j.checked_at||'unknown'),'Phone: '+(p.display_phone_number||'unavailable'),'Phone status: '+(p.status||'unknown'),'Verification: '+(p.code_verification_status||'unknown'),'Platform: '+(p.platform_type||'unknown'),'Quality: '+(p.quality_rating||'unknown'),'Phone linked to WABA: '+String(j.waba_phone_linked),'Template: '+(j.template?.status||j.template?.error?.message||'unknown'),'Ready: '+String(j.ready_to_send),'Result: '+(j.message||'No message was sent.')];for(const k of ['phone','waba_phones','templates'])if(j.errors?.[k])lines.push(k+' error: '+(j.errors[k].message||JSON.stringify(j.errors[k]))+(j.errors[k].code?' [Meta code '+j.errors[k].code+']':''));box.textContent=lines.join(' | ');}
 catch(e){box.textContent='Live Meta diagnostics failed: '+String(e.message||e)+'. No message was sent.';}
}async function archiveNotificationRecord(id){
 const notificationId=Number(id);if(!Number.isSafeInteger(notificationId)||notificationId<1)return;
 if(!confirm('Hide this message record from the dashboard? This does not recall a message already delivered.'))return;
 const box=document.getElementById('whatsAppMailbox');
 try{const r=await fetch('/api/notifications/archive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:notificationId})});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));await loadWhatsAppMailbox();await loadOutboundQueue();await loadWhatsAppStatus();}
 catch(e){if(box)box.textContent='Could not hide record: '+String(e.message||e);}
}
async function loadWhatsAppMailbox(){
  const box=document.getElementById('whatsAppMailbox');if(!box)return;
  box.textContent='Loading WhatsApp messages and delivery receipts...';
  try{
   const getJson=async path=>{const r=await fetch(path,{credentials:'same-origin'});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||j.error||j.ok===false)throw new Error(j.error||('HTTP '+r.status));return j;};
   const [inbox,notes,status]=await Promise.all([getJson('/api/notifications/whatsapp-inbox'),getJson('/api/notifications'),getJson('/api/notifications/whatsapp-status')]);
   const rows=[];
   for(const m of inbox.messages||[])rows.push({time:m.message_timestamp||m.received_at||'',direction:'INCOMING',peer:m.sender_name?m.sender_name+' Â· '+m.sender:m.sender,body:m.message_text||('['+(m.message_type||'message')+']'),status:'Received',id:m.message_id});
   const byNotification=new Map((status.messages||[]).filter(m=>m.notification_id).map(m=>[Number(m.notification_id),m]));
   for(const n of notes.notifications||[]){
    if(n.channel!=='whatsapp'||!['prepared','approved','sent','failed'].includes(String(n.status)))continue;
    const d=byNotification.get(Number(n.id));const raw=String(d?.status||'').toLowerCase();
    const delivery={accepted:'API accepted - delivery unconfirmed',sent:'Sent by WhatsApp server',delivered:'Delivered',read:'Read',failed:'Failed'}[raw]||(n.status==='failed'?'Failed':n.status==='sent'?'Sent Â· no delivery receipt':'Pending');
    rows.push({time:n.sent_at||n.created_at||'',direction:'OUTGOING',peer:n.recipient||'',body:n.message||n.subject||'',status:delivery,id:d?.message_id||('notification '+n.id),error:d?.error_message||''});
   }
   rows.sort((a,b)=>String(b.time).localeCompare(String(a.time)));
   if(!rows.length){box.textContent='No WhatsApp messages or delivery receipts are recorded yet. If you sent START, check that the sender number is saved as an Active partner, then refresh.';return;}
   box.innerHTML=rows.slice(0,100).map(m=>'<details style="border-top:1px solid #e5e7eb;padding:9px 0"><summary style="cursor:pointer"><b>'+esc(m.direction)+' Â· '+esc(m.peer)+'</b><div style="font-size:12px;color:#64748b">'+esc(m.time)+' Â· '+esc(m.status)+'</div><div style="font-size:13px">'+esc(String(m.body||'').slice(0,180))+'</div></summary><div style="padding:10px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.body||'')+'<hr><b>Status:</b> '+esc(m.status)+'<br><b>Message ID:</b> '+esc(m.id||'')+(m.error?'<br><b>Error:</b> '+esc(m.error):'')+'</div>'+(m.direction==='INCOMING'?'<button class="alt" onclick="deleteWhatsAppInboxMessage(&quot;'+esc(m.id)+'&quot;)">Delete message</button>':'')+'</details>').join('');
  }catch(e){box.textContent='WhatsApp Inbox error: '+String(e.message||e)+'. Please refresh after confirming Owner login.';}
}
async function deleteWhatsAppInboxMessage(id){if(!id||!confirm('Delete this message from the AI Source inbox memory?'))return;const box=document.getElementById('whatsAppMailbox');try{const r=await fetch('/api/notifications/whatsapp-inbox/delete',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({message_id:id})});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));await loadWhatsAppMailbox();}catch(e){if(box)box.textContent='Could not delete inbox message: '+String(e.message||e);}}
async function prepareFreeWhatsAppDraft(event){
 event.preventDefault();
 const status=document.getElementById('freeWhatsAppStatus');
 const rawPhone=String(document.getElementById('freeWhatsAppPhone')?.value||'').trim();
 const phone=rawPhone.replace(/[^0-9]/g,'');
 const message=String(document.getElementById('freeWhatsAppMessage')?.value||'').trim();
 if(phone.length<8||phone.length>20){if(status)status.textContent='Enter a valid full international number, including country code.';return false;}
 if(!message||message.length>4000){if(status)status.textContent='Enter a message between 1 and 4000 characters.';return false;}
 const draftWindow=window.open('about:blank','_blank');
 if(!draftWindow){if(status)status.textContent='Allow pop-ups for this dashboard to open WhatsApp.';return false;}
 if(status)status.textContent='Saving...';
 try{
  const response=await fetch('/api/notifications/whatsapp',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({phone,message})});
  const data=await response.json().catch(()=>({error:'Invalid server response'}));
  if(!response.ok||!data.ok||!data.whatsapp_url)throw new Error(data.error||('HTTP '+response.status));
  draftWindow.location.href=data.whatsapp_url;
  if(status)status.textContent='Draft saved in Outgoing Message Queue and WhatsApp opened with the text filled in. Review it and press Send in WhatsApp; AI Source has not sent it.';
  return false;
 }catch(error){draftWindow.close();if(status)status.textContent='Could not prepare WhatsApp draft: '+String(error.message||error);return false;}
}async function loadOutboundQueue(){
 const box=document.getElementById('outboundQueue');if(!box)return;
 box.textContent='Loading prepared messages...';
 try{
  const [r,ws]=await Promise.all([api('/api/notifications'),api('/api/notifications/whatsapp-status').catch(()=>({messages:[]}))]);const deliveryByNotification=new Map((ws.messages||[]).filter(m=>m.notification_id).map(m=>[Number(m.notification_id),m]));const rows=(r.notifications||[]).filter(n=>{const outbound=['email','whatsapp'].includes(String(n.channel||''))&&['prepared','approved','sent','failed'].includes(String(n.status||''))&&String(n.status)!=='archived';const diagnostic=/\b(test|diagnostic|verification|connection check|please ignore)\b/i.test(String(n.subject||'')+' '+String(n.message||''));const created=Date.parse(String(n.created_at||''));const stale=!Number.isFinite(created)||created<Date.now()-24*60*60*1000;return outbound&&!(diagnostic&&stale);});
  if(!rows.length){box.textContent='Inbox is clear. Prepared drafts and recent sent messages will appear here when available.';return;}
   const deliveryLabel=m=>!m?'Not sent / no WhatsApp receipt':({accepted:'API accepted - delivery unconfirmed',sent:'Sent by WhatsApp server',delivered:'Delivered to recipient device',read:'Read by recipient',failed:'Failed - see Meta error details'}[String(m.status||'').toLowerCase()]||String(m.status||'Unknown'));
  box.innerHTML='<div style="overflow:auto"><table><tr><th>Created</th><th>Channel</th><th>Recipient</th><th>Subject / Preview</th><th>Queue Status</th><th>Delivery Status</th><th>Owner Action</th></tr>'+rows.map(n=>{const d=n.channel==='whatsapp'?deliveryByNotification.get(Number(n.id)):null;const pending=['prepared','approved'].includes(String(n.status));return '<tr><td>'+esc(n.created_at||'')+'</td><td>'+esc(n.channel||'')+'</td><td style="max-width:190px;word-break:break-word">'+esc(n.recipient||'')+'</td><td><b>'+esc(n.subject||'')+'</b><div style="white-space:pre-wrap;max-width:420px;max-height:120px;overflow:auto">'+esc(String(n.message||'').slice(0,1200))+'</div></td><td>'+esc(n.status)+'</td><td>'+esc(n.channel==='whatsapp'?deliveryLabel(d):(n.status==='sent'?'Accepted by Gmail; recipient delivery unconfirmed':n.status==='failed'?'Failed':'Not sent'))+(d&&d.error_code?'Error '+esc(d.error_code)+' '+esc(d.error_message||''):'')+'</td><td>'+'<button class="alt" onclick="archiveNotificationRecord('+Number(n.id)+')">Delete record</button></td></tr>';}).join('')+'</table></div>';
 }catch(e){box.textContent='Could not load message queue: '+String(e.message||e);}
}
async function openManualMessageDraft(id,channel){
 if(!Number.isInteger(Number(id))||!['email','whatsapp'].includes(channel))return;
 const box=document.getElementById('outboundQueue');
 const draftWindow=window.open('about:blank','_blank');
 try{
  if(!draftWindow)throw new Error('Allow pop-ups for this dashboard to open the manual draft.');
  const response=await fetch('/api/notifications',{credentials:'same-origin'});const data=await response.json();
  if(!response.ok)throw new Error(data.error||('HTTP '+response.status));
  const item=(data.notifications||[]).find(n=>Number(n.id)===Number(id));
  if(!item||item.channel!==channel||!['prepared','approved'].includes(String(item.status)))throw new Error('Draft is no longer pending. Refresh the queue.');
  let url='';
  if(channel==='email'){
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(item.recipient||'')))throw new Error('Recipient email is invalid.');
   url='mailto:'+String(item.recipient).trim()+'?subject='+encodeURIComponent(String(item.subject||''))+'&body='+encodeURIComponent(String(item.message||''));
  }else{
   const phone=String(item.recipient||'').replace(/[^0-9]/g,'');
   if(phone.length<8||phone.length>20)throw new Error('Partner phone number is invalid.');
   url='https://wa.me/'+phone+'?text='+encodeURIComponent(String(item.message||''));
  }
  draftWindow.location.href=url;
  if(box)box.textContent='Manual '+channel.toUpperCase()+' draft opened for review. It has NOT been marked sent; send it in the opened app and verify delivery separately.';
 }catch(e){if(draftWindow)draftWindow.close();if(box)box.textContent='Could not open manual draft: '+String(e.message||e);}
}
async function approveAndSendNotification(id,channel){
 if(!Number.isInteger(Number(id))||channel!=='email')return;
 if(!confirm('Owner approval: send this '+channel.toUpperCase()+' message to the recipient shown in the queue? This action contacts an external recipient.'))return;
 const box=document.getElementById('outboundQueue');if(box)box.textContent='Sending approved message...';
 try{
  const getJson=async(path,options={})=>{const r=await fetch(path,options);const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||j.error||j.ok===false)throw new Error(j.error||('HTTP '+r.status));return j;};
  const current=await getJson('/api/notifications');const item=(current.notifications||[]).find(n=>Number(n.id)===Number(id));
  if(!item||item.channel!==channel||!['prepared','approved'].includes(String(item.status)))throw new Error('Notification is no longer pending. Refresh the queue.');
  if(item.status==='prepared')await getJson('/api/notifications/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:Number(id)})});
  const sent=channel==='whatsapp'
   ? await getJson('/api/notifications/whatsapp-send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:Number(id)})})
   : await getJson('/api/notifications/gmail-send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:Number(id)})});
  if(!sent.sent)throw new Error('Provider did not confirm acceptance. Check status before retrying.');
  if(box)box.textContent='Email provider accepted message ID: '+(sent.message_id||'not returned')+'. Provider acceptance is not recipient delivery confirmation.';
  await loadOutboundQueue();await loadWhatsAppStatus();
 }catch(e){if(box)box.textContent='Send failed or unconfirmed: '+String(e.message||e)+'. Refresh status before retrying to avoid duplicates.';}
}let whatsAppDeliveryFilter='all';
async function removeWhatsAppStatusRecord(messageId){
 const id=String(messageId||'').trim();if(!id)return;
 if(!confirm('Remove this WhatsApp delivery-status record from the dashboard history? This does not recall or delete a message from the recipient phone.'))return;
 const summary=document.getElementById('whatsappDeliverySummary');
 try{const r=await fetch('/api/notifications/whatsapp-status/remove',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message_id:id})});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));if(summary)summary.textContent='Status record removed. Refreshing list...';await loadWhatsAppStatus();await loadWhatsAppMailbox();await loadOutboundQueue();}
 catch(e){if(summary)summary.textContent='Could not remove status record: '+String(e.message||e);}
}
async function loadWhatsAppStatus(){
  const summary=document.getElementById('whatsappDeliverySummary');
  const hook=document.getElementById('whatsappWebhookSetup');
  const list=document.getElementById('whatsappDeliveryList');
  if(summary)summary.textContent='WhatsApp partner alerts use the free opt-in service window; send START from a saved active partner number to activate.';
  if(hook)hook.textContent='No legacy-provider diagnostics are requested from this panel.';
  if(list)list.textContent='Historical WhatsApp delivery records are retained but not refreshed from the retired provider.';
}
async function sync(){
 if(catalogSyncActive)return;
 catalogSyncActive=true;
 const btn=document.getElementById('catalogSyncBtn');
  if(btn){btn.disabled=true;btn.textContent='Syncing...';}
  paintCatalogSync('running','Catalog sync: WORKING...',true);
 let start=0,done=false,total=0,failed=0,failedHandles=[],sourceWarnings=[];
 try{
  while(!done){
    paintCatalogSync('running','Syncing catalog... saved '+total+' product(s)',true);
   const r=await api('/api/sync/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({start,batch_size:10})});
   if(!r||r.error)throw new Error(r?.error||'No sync response');
   total+=Number(r.saved)||0;failed+=Number(r.failed)||0;
   if(Array.isArray(r.failed_handles))failedHandles.push(...r.failed_handles.map(x=>x.handle+": "+(x.error||"unknown error")));
   if(r.source_discovery_warning&&!sourceWarnings.includes(r.source_discovery_warning))sourceWarnings.push(r.source_discovery_warning);
   done=!!r.complete;start=Number(r.next_start)||start;
   if(!r.processed)break;
  }
  if(failed||sourceWarnings.length){paintCatalogSync('partial','Catalog sync: PARTIAL',false);alert('Catalog sync finished PARTIAL. Saved/updated '+total+' products; '+failed+' product(s) failed after retry policy (up to 5 attempts per product).'+(sourceWarnings.length?' Source warning: '+sourceWarnings.join(' | '):'')+(failedHandles.length?' First product failures: '+failedHandles.slice(0,5).join(', '):''));}
  else{paintCatalogSync('complete','Catalog sync: COMPLETE',false);alert('Catalog sync complete. Saved/updated '+total+' products.');}
  await refresh();
 }catch(e){
  paintCatalogSync('failed','Catalog sync: FAILED',false);
  alert('Catalog sync stopped: '+String(e?.message||e)+'. Check login and sync status before retrying.');
  await refresh();
 }finally{
  catalogSyncActive=false;
  if(btn){btn.disabled=false;btn.textContent='Sync Source Catalog';}
  await updateCatalogSyncIndicator();
 }
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
async function loadCostSettings(){const box=document.getElementById('costSettingsStatus');try{const r=await api('/api/settings');const s=Array.isArray(r)?Object.fromEntries(r.map(x=>[x.key,x.value])):(r.settings||r);const fields={rateTravel:'travel_rate',ratePickup:'pickup_rate',ratePacking:'packing_rate',rateFreight:'freight_rate',rateDuty:'duty_rate',ratePayment:'payment_fee_rate',ratePakistanTransport:'pakistan_transport_rate',rateContingency:'contingency_rate',rateTHB:'thb_to_pkr',rateKRW:'krw_to_pkr',rateMargin:'default_margin_pct'};for(const [id,key] of Object.entries(fields)){const el=document.getElementById(id);if(el)el.value=String(s[key]??(key==='default_margin_pct'?'25':'0'));}if(box)box.textContent='Saved rates loaded. Any enabled cost rate at 0 remains pending and cannot support a final quotation.';}catch(e){if(box)box.textContent='Could not load saved rates: '+String(e.message||e);}}
async function saveCostSettings(){const box=document.getElementById('costSettingsStatus');const fields={rateTravel:'travel_rate',ratePickup:'pickup_rate',ratePacking:'packing_rate',rateFreight:'freight_rate',rateDuty:'duty_rate',ratePayment:'payment_fee_rate',ratePakistanTransport:'pakistan_transport_rate',rateContingency:'contingency_rate',rateTHB:'thb_to_pkr',rateKRW:'krw_to_pkr',rateMargin:'default_margin_pct'};const values={};for(const [id,key] of Object.entries(fields)){const el=document.getElementById(id);const n=Number(el?.value);if(!el||!Number.isFinite(n)||n<0){if(box)box.textContent='Invalid value for '+key+'. Rates must be finite and non-negative.';return;}if(['duty_rate','payment_fee_rate','contingency_rate'].includes(key)&&n>100){if(box)box.textContent=key+' cannot exceed 100%.';return;}if(key==='default_margin_pct'&&(n<1||n>80)){if(box)box.textContent='Default target margin must be between 1% and 80%.';return;}values[key]=n;}if(box)box.textContent='Saving verified Owner-entered rates...';try{const r=await api('/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({settings:values})});if(!r.ok)throw new Error(r.error||'Rate save failed');const s=r.settings||values;const costFields=[['travel_rate','travel_enabled','Travel'],['pickup_rate','pickup_enabled','Pickup'],['packing_rate','packing_enabled','Packing'],['freight_rate','freight_enabled','Freight'],['duty_rate','duty_enabled','Duties'],['payment_fee_rate','payment_fee_enabled','Payment'],['pakistan_transport_rate','pakistan_transport_enabled','Pakistan transport'],['contingency_rate','contingency_enabled','Contingency']];const missing=costFields.filter(([rate,enabled])=>!['false','0','off','no'].includes(String(s[enabled]??'true').toLowerCase())&&Number(s[rate]||0)===0).map(([, ,label])=>label);if(Number(s.thb_to_pkr||0)<=0)missing.push('THB/PKR exchange rate');if(Number(s.krw_to_pkr||0)<=0)missing.push('KRW/PKR exchange rate');if(box)box.textContent=missing.length?'Rates saved. STILL PENDING: '+missing.join(', ')+'. Configure verified values before relying on margin or quotations.':'Rates saved. All enabled cost rates and both exchange rates are populated; verify the source/date of each rate before approving a quote.';}catch(e){if(box)box.textContent='Rate save failed: '+String(e.message||e)+'. Confirm that the Owner session is active.';}}
function fmt(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function loadSourcingPartners(){const box=document.getElementById('partnerList'),status=document.getElementById('partnerStatus');if(!box)return;box.textContent='Loading partners...';try{const r=await fetch('/api/sourcing-partners',{credentials:'same-origin'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load partners');const rows=Array.isArray(j)?j:(j.partners||j.results||[]);box.innerHTML=rows.length?'<table><thead><tr><th>Name</th><th>Country</th><th>Lead type</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody>'+rows.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.country_name)+' ('+esc(p.country_code)+')</td><td>'+esc(p.lead_types||'all')+'</td><td>'+esc(p.contact||p.email||'Not provided')+'</td><td>'+(Number(p.active)?'Active':'Inactive')+'</td><td><button type="button" onclick="editSourcingPartner('+Number(p.id)+')">Edit</button> <button type="button" onclick="toggleSourcingPartner('+Number(p.id)+','+(Number(p.active)?'false':'true')+')">'+(Number(p.active)?'Deactivate':'Activate')+'</button> <button type="button" class="alt" onclick="removeSourcingPartner('+Number(p.id)+','+Number(p.active)+')">Remove</button></td></tr>').join('')+'</tbody></table>':'No partners added yet.';if(status)status.textContent='';}catch(e){box.textContent=e.message||'Could not load partners';}}
async function addSourcingPartner(e){e.preventDefault();const status=document.getElementById('partnerStatus');status.textContent='Saving...';const body={name:document.getElementById('partnerName').value.trim(),country_code:document.getElementById('partnerCountryCode').value.trim().toUpperCase(),country_name:document.getElementById('partnerCountryName').value.trim(),contact:document.getElementById('partnerContact').value.trim(),email:document.getElementById('partnerEmail').value.trim(),lead_types:document.getElementById('partnerLeadType').value};try{const r=await fetch('/api/sourcing-partners',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not add partner');document.getElementById('partnerForm').reset();status.textContent='Partner added.';await loadSourcingPartners();}catch(err){status.textContent=err.message||'Could not add partner';}return false;}
async function toggleSourcingPartner(id,active){const status=document.getElementById('partnerStatus');status.textContent='Updating...';try{const r=await fetch('/api/sourcing-partners/'+id,{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({active})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not update partner');status.textContent='Partner status updated.';await loadSourcingPartners();}catch(e){status.textContent=e.message||'Could not update partner';}}
async function editSourcingPartner(id){const status=document.getElementById('partnerStatus');try{const resp=await fetch('/api/sourcing-partners',{credentials:'same-origin'}),data=await resp.json();if(!resp.ok)throw new Error(data.error||'Could not load partner');const p=(data.partners||[]).find(x=>Number(x.id)===Number(id));if(!p)throw new Error('Partner not found. Refresh the list.');const name=prompt('Partner name:',p.name||'');if(name===null)return;const countryCode=prompt('ISO country code (e.g. KR):',p.country_code||'');if(countryCode===null)return;const countryName=prompt('Country name:',p.country_name||'');if(countryName===null)return;const contact=prompt('Phone / contact (e.g. +821068879265):',p.contact||'');if(contact===null)return;const email=prompt('Email (optional):',p.email||'Not provided');if(email===null)return;const leadTypes=prompt('Lead type: all, buyer, or supplier',p.lead_types||'all');if(leadTypes===null)return;status.textContent='Saving...';const r=await fetch('/api/sourcing-partners/'+id,{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name,country_code:countryCode,country_name:countryName,contact,email,lead_types:leadTypes})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not update partner');status.textContent='Partner details updated.';await loadSourcingPartners();}catch(e){status.textContent=e.message||'Could not edit partner';}}
async function removeSourcingPartner(id,active){const status=document.getElementById('partnerStatus');if(Number(active)===1){status.textContent='Deactivate this partner first, then Remove. Active partners cannot be deleted.';return;}if(!confirm('Remove this inactive partner record? If it is linked to customer request history, removal will be blocked to preserve history.'))return;status.textContent='Removing partner...';try{const r=await fetch('/api/sourcing-partners/'+id,{method:'DELETE',credentials:'same-origin'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not remove partner');status.textContent=j.message||'Partner removed.';await loadSourcingPartners();}catch(e){status.textContent=e.message||'Could not remove partner';}}
loadControlPanel();
loadCountryControls();
loadCostSettings();
refresh();
</script>
<section id="discoverycenter" class="panel" style="display:none">
<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h2>Buyer & Seller Discovery</h2><p>Pakistan buyers stay separate. Thailand and South Korea have separate buyer and seller prospect searches. Leads are unverified; no messages, quotes, purchases, orders or commitments are automatic.</p></div><button onclick="show('dashboard')">Back to Dashboard</button></div>
<div class="card"><h3>Pakistan Buyer Discovery</h3><p id="discoveryStatus">Checking configuration...</p><label>Search cities (comma separated)</label><input id="discoveryCities" value="Lahore, Faisalabad, Karachi"/><label>Business types</label><select id="discoverySearch"><option value="computer parts wholesaler">Computer parts wholesalers</option><option value="computer hardware retailer">Computer hardware retailers</option><option value="computer shop">Computer shops</option></select><button id="discoveryRunBtn" onclick="runBuyerDiscovery()">Search Pakistan Buyers</button><div id="discoveryResult" style="margin-top:12px"></div><button class="alt" onclick="loadBuyerProspects()">Refresh Pakistan Buyers</button><div id="buyerProspectList" style="margin-top:12px">Loading...</div></div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:16px">
<div class="card"><h3>Thailand Market - Bangkok</h3><p>Free public map search. Separate potential buyers and sellers; results need owner verification.</p><button id="sellerDiscoveryRunBtn" onclick="runSellerDiscovery()">Find Thailand Sellers</button> <button id="thaiBuyerDiscoveryRunBtn" onclick="runMarketBuyerDiscovery('Thailand')">Find Thailand Buyers</button><p id="thaiMarketRunStatus">Loading search status...</p><div id="sellerDiscoveryResult" style="margin-top:10px"></div><div id="thaiBuyerDiscoveryResult" style="margin-top:10px"></div><h4>Thailand seller prospects</h4><div id="thaiSellerProspectList">Loading...</div><h4>Thailand buyer prospects</h4><div id="thaiBuyerProspectList">Loading...</div></div>
<div class="card"><h3>South Korea Market - Pyeongtaek search area</h3><p>Free public map search within an initial 30 km of Pyeongtaek city centre. Seller and buyer leads are unverified; expand the area after local coverage is reviewed.</p><button id="koreaSellerDiscoveryRunBtn" onclick="runKoreaSellerDiscovery()">Find Korea Sellers</button> <button id="koreaBuyerDiscoveryRunBtn" onclick="runMarketBuyerDiscovery('South Korea')">Find Korea Buyers</button><p id="koreaMarketRunStatus">Loading search status...</p><div id="koreaSellerDiscoveryResult" style="margin-top:10px"></div><div id="koreaBuyerDiscoveryResult" style="margin-top:10px"></div><h4>Korea seller prospects</h4><div id="koreaSellerProspectList">Loading...</div><h4>Korea buyer prospects</h4><div id="koreaBuyerProspectList">Loading...</div></div>
</div>
<div class="card" style="margin-top:16px"><h3>Market Deal Pipeline - Draft Only</h3><p>Qualified leads can become internal deal drafts. THB/KRW prices, exchange rates, export costs and delivery are not configured here; prepare no customer quote until those are verified and owner-approved.</p><label>Market</label><select id="marketDealCountry" onchange="refreshMarketDealProspects()"><option value="Thailand">Thailand</option><option value="South Korea">South Korea</option></select><label>Trade direction</label><select id="marketDealDirection" onchange="refreshMarketDealProspects()"><option value="sell_to_market">Sell PakThai products to a market buyer</option><option value="source_from_market">Source from a market seller</option></select><label>Qualified prospect</label><select id="marketDealProspect"></select><label>Product / requirement</label><input id="marketDealItem" placeholder="Product or buyer requirement"/><label>Quantity</label><input id="marketDealQuantity" type="number" min="1" value="1"/><label>Owner notes</label><input id="marketDealNotes" placeholder="Internal notes only"/><button onclick="createMarketDealDraft()">Create Internal Deal Draft</button><div id="marketDealResult" style="margin-top:10px"></div><h4 style="margin-top:18px">Thailand & Korea deal drafts</h4><button class="alt" onclick="loadMarketDeals()">Refresh Deal Pipeline</button><div id="marketDealsList" style="margin-top:10px">Loading...</div></div>
</section>
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
async function openDiscoveryCenter(){
  document.querySelectorAll('.panel').forEach(function(x){x.style.display='none';});
  var el=document.getElementById('discoverycenter'); if(el) el.style.display='block';
  await loadBuyerDiscoveryStatus(); await loadBuyerProspects(); await loadSellerProspects(); await loadMarketDiscoveryStatus(); await loadMarketDeals(); await refreshMarketDealProspects();
}
function leadEvidenceScore(x,kind,all){
 const text=[x.business_name,x.title,x.snippet,x.discovery_query,x.search_query,x.domain,x.url,x.website].filter(Boolean).join(' ').toLowerCase();
 const relevance=/\b(computer|pc parts|computer parts|hardware|gpu|graphics card|processor|cpu|ram|memory|ssd|storage|motherboard|electronics|it equipment|technology|gaming pc)\b/.test(text)?30:(/\b(wholesale|retail|distributor|shop|store|supplier|buyer)\b/.test(text)?15:0);
 const hasSource=!!(x.website||x.url||x.domain);
 const contact=(x.website?10:0)+(x.phone?10:0);
 const location=kind==='buyer'?((x.address?8:0)+(x.discovery_city?7:0)):((x.country?15:0));
 const rawDate=Date.parse(x.last_seen_at||x.first_seen_at||'');
 const age=Number.isFinite(rawDate)?Math.max(0,(Date.now()-rawDate)/86400000):Infinity;
 const freshness=age<=30?15:age<=90?10:age<=180?5:0;
 const key=String(x.domain||x.website||x.url||'').toLowerCase().replace('https://','').replace('http://','').replace('www.','').split('/')[0];
 const title=String(x.business_name||x.title||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,60);
 const duplicate=(all||[]).some(y=>y!==x&&((key&&String(y.domain||y.website||y.url||'').toLowerCase().replace('https://','').replace('http://','').replace('www.','').split('/')[0]===key)||(title&&title.length>5&&String(y.business_name||y.title||'').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,60)===title)));
 const total=Math.max(0,Math.min(100,relevance+(hasSource?20:0)+contact+location+freshness-(duplicate?20:0)));
 return {score:total,relevance,source:hasSource?20:0,contact,location,freshness,duplicate};
}
function leadEvidenceBadge(x,kind,all){
 const q=leadEvidenceScore(x,kind,all);
 const reasons='Relevance '+q.relevance+'/30; source traceability '+q.source+'/20; contact evidence '+q.contact+'/20; location '+q.location+'/15; freshness '+q.freshness+'/15; duplicate signal '+(q.duplicate?'possible (-20)':'none detected')+'. This is a prioritisation hint, not proof that a buyer/seller is verified.';
 return '<strong>'+q.score+'/100</strong><br><small title="'+esc(reasons)+'">Evidence priority</small>';
}

async function loadBuyerDiscoveryStatus(){
  var box=document.getElementById('discoveryStatus'),btn=document.getElementById('discoveryRunBtn');
  try{var s=await api('/api/buyer-prospects/status');
    if(!s.ok) throw new Error(s.error||'Status unavailable');
    if(s.api_key_configured){box.textContent='Ready: Free OpenStreetMap search. No Google API key or billing required. Leads are unverified; no outreach is sent.';btn.disabled=false;}
    else{box.textContent='Free OpenStreetMap discovery is enabled. Search runs only when you press the button; no paid API key is required.';btn.disabled=true;}
  }catch(e){box.textContent='Could not verify discovery setup: '+(e.message||String(e));btn.disabled=true;}
}
async function loadBuyerProspects(){
  var box=document.getElementById('buyerProspectList'); if(!box)return; box.textContent='Loading prospects...';
  try{var r=await api('/api/buyer-prospects');var a=r.prospects||[];
    if(!a.length){box.innerHTML='<p>No prospects found yet. Run a free OpenStreetMap search.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>Business / Source ID</th><th>City</th><th>Search</th><th>Evidence score</th><th>Review status</th><th>Owner notes</th><th>Save</th></tr>'+a.map(function(x){return '<tr><td>'+esc((x.business_name||'Unnamed business')+' ('+x.place_id+')')+'</td><td>'+esc(x.discovery_city)+'</td><td>'+esc(x.discovery_query)+'</td><td>'+leadEvidenceBadge(x,'buyer',a)+'</td><td><select id="prospectStatus'+Number(x.id)+'"><option value="unreviewed" '+(x.review_status==='unreviewed'?'selected':'')+'>Unreviewed</option><option value="contact_to_verify" '+(x.review_status==='contact_to_verify'?'selected':'')+'>Contact to verify</option><option value="qualified" '+(x.review_status==='qualified'?'selected':'')+'>Qualified</option><option value="not_a_fit" '+(x.review_status==='not_a_fit'?'selected':'')+'>Not a fit</option></select></td><td><input id="prospectNotes'+Number(x.id)+'" value="'+esc(x.owner_notes||'')+'" placeholder="Owner notes"></td><td><button onclick="saveBuyerProspectReview('+Number(x.id)+')">Save</button></td></tr>';}).join('')+'</table></div>';
  }catch(e){box.textContent='Could not load prospects: '+(e.message||String(e));}
}
async function loadSellerProspects(){
  await Promise.all([loadMarketProspects('Thailand'),loadMarketProspects('South Korea')]);
}
async function loadMarketDiscoveryStatus(){
  try{
    var r=await api('/api/market-prospects/status');if(!r.ok)throw new Error(r.error||'Status unavailable');
    function laneText(label,lane,count){if(!lane)return label+': no run recorded yet; '+count+' total unverified prospect(s) stored.';var at=lane.ran_at||lane.timestamp||'';var when=at?new Date(at).toLocaleString():'time unavailable';return label+': latest run '+(lane.ok?'OK':'FAILED')+' â€” '+(Number(lane.results_seen)||0)+' results returned; '+count+' total unverified prospect(s) stored as of '+when+(lane.error?' â€” '+lane.error:'');}
    var th=r.markets?.Thailand||{},kr=r.markets?.['South Korea']||{};
    document.getElementById('thaiMarketRunStatus').textContent=laneText('Thailand sellers',th.sellers,th.seller_count||0)+' '+laneText('Thailand buyers',th.buyers,th.buyer_count||0);
    document.getElementById('koreaMarketRunStatus').textContent=laneText('Korea sellers',kr.sellers,kr.seller_count||0)+' '+laneText('Korea buyers',kr.buyers,kr.buyer_count||0);
  }catch(e){var msg='Could not load owner-only search status: '+(e.message||String(e));document.getElementById('thaiMarketRunStatus').textContent=msg;document.getElementById('koreaMarketRunStatus').textContent=msg;}
}
async function loadMarketProspects(country){
  var slug=country==='Thailand'?'thai':'korea';
  for(var type of ['seller','buyer']){
    var box=document.getElementById(slug+(type==='seller'?'Seller':'Buyer')+'ProspectList');
    if(!box)continue; box.textContent='Loading '+type+' prospects...';
    try{
      var r=await api('/api/external-prospects?type='+type+'&country='+encodeURIComponent(country));var a=r.prospects||[];
      if(!a.length){box.innerHTML='<p>No '+type+' prospects found yet.</p>';continue;}
      box.innerHTML='<div style="overflow:auto;max-height:360px"><table><tr><th>Business</th><th>Evidence score</th><th>Source</th><th>Review</th><th>Notes</th><th>Save / Seller link</th></tr>'+a.map(function(x){var link=x.linked_seller_id?'Seller #'+Number(x.linked_seller_id)+' linked':(type==='seller'&&x.review_status==='qualified'?'<button onclick="convertMarketSellerProspect('+Number(x.id)+',&quot;'+esc(country)+'&quot;)">Add to Seller Database</button>':'Not eligible');return '<tr><td>'+esc(x.title)+'</td><td>'+leadEvidenceBadge(x,'market',a)+'</td><td>'+esc(x.snippet||'')+'<br><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.domain||x.url)+'</a></td><td><select id="marketProspectStatus'+Number(x.id)+'"><option value="unreviewed" '+(x.review_status==='unreviewed'?'selected':'')+'>Unreviewed</option><option value="contact_to_verify" '+(x.review_status==='contact_to_verify'?'selected':'')+'>Verify contact</option><option value="qualified" '+(x.review_status==='qualified'?'selected':'')+'>Qualified</option><option value="not_a_fit" '+(x.review_status==='not_a_fit'?'selected':'')+'>Not a fit</option></select></td><td><input id="marketProspectNotes'+Number(x.id)+'" value="'+esc(x.owner_notes||'')+'" placeholder="Owner notes"></td><td><button onclick="saveMarketProspectReview('+Number(x.id)+',&quot;'+esc(country)+'&quot;)">Save review</button><div style="margin-top:5px">'+link+'</div></td></tr>';}).join('')+'</table></div>';
    }catch(e){box.textContent='Could not load '+type+' prospects: '+(e.message||String(e));}
  }
  await refreshMarketDealProspects();
}
async function saveMarketProspectReview(id,country){
  var status=document.getElementById('marketProspectStatus'+id).value,notes=document.getElementById('marketProspectNotes'+id).value;
  try{var r=await api('/api/external-prospects/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,review_status:status,owner_notes:notes})});if(!r.ok)throw new Error(r.error||'Save failed');await loadMarketProspects(country);}
  catch(e){alert('Could not save prospect review: '+(e.message||String(e)));}
}
async function convertMarketSellerProspect(id,country){
  if(!confirm('Add this owner-qualified prospect to the Seller Database as pending verification? No message or purchase will be made.'))return;
  try{
    var r=await api('/api/external-prospects/convert-seller',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id})});
    if(!r.ok)throw new Error(r.error||'Could not add seller');
    alert((r.existing?'Seller record linked.':'Seller added as pending verification.')+' Seller ID: '+r.id+'. Verify contact, stock and asking price before creating a sourcing opportunity.');
    await loadMarketProspects(country);
    await refresh();
  }catch(e){alert('Seller conversion failed: '+(e.message||String(e)));}
}
async function runSellerDiscovery(){
  var btn=document.getElementById('sellerDiscoveryRunBtn'),box=document.getElementById('sellerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching public listings around Bangkok. Leads are unverified.';
  try{var r=await api('/api/seller-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error(r.error||'Seller discovery failed');box.textContent='Thailand search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. No messages were sent.';await loadMarketProspects('Thailand');await loadMarketDiscoveryStatus();}
  catch(e){box.textContent='Thailand seller search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function runKoreaSellerDiscovery(){
  var btn=document.getElementById('koreaSellerDiscoveryRunBtn'),box=document.getElementById('koreaSellerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching free public listings within an initial 30 km of Pyeongtaek. Leads are unverified.';
  try{var r=await api('/api/korea-seller-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error(r.error||'Korea discovery failed');box.textContent=r.skipped?r.reason:'Korea search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. No messages were sent.';await loadMarketProspects('South Korea');await loadMarketDiscoveryStatus();}
  catch(e){box.textContent='Korea seller search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function runMarketBuyerDiscovery(country){
  var slug=country==='Thailand'?'thai':'korea',btn=document.getElementById(slug+'BuyerDiscoveryRunBtn'),box=document.getElementById(slug+'BuyerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching free public business listings. No outreach will be sent.';
  try{var r=await api('/api/market-prospects/discover-buyers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({country:country})});if(!r.ok)throw new Error(r.error||'Buyer search failed');box.textContent=r.skipped?r.reason:country+' buyer search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. Unverified leads only.';await loadMarketProspects(country);await loadMarketDiscoveryStatus();}
  catch(e){box.textContent=country+' buyer search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function refreshMarketDealProspects(){
  var country=document.getElementById('marketDealCountry')?.value||'Thailand',direction=document.getElementById('marketDealDirection')?.value||'sell_to_market',type=direction==='sell_to_market'?'buyer':'seller',box=document.getElementById('marketDealProspect');
  if(!box)return;
   try{var r=await api('/api/external-prospects?type='+type+'&country='+encodeURIComponent(country));var qualified=(r.prospects||[]).filter(function(x){return x.review_status==='qualified';});box.innerHTML=qualified.length?qualified.map(function(x){return '<option value="'+Number(x.id)+'">'+esc(x.title)+' - '+esc(country)+'</option>';}).join(''):'<option value="">No qualified '+type+' leads yet - review a prospect above first</option>';}
  catch(e){box.innerHTML='<option value="">Could not load qualified prospects</option>';}
}
async function createMarketDealDraft(){
  var box=document.getElementById('marketDealResult'),body={country:document.getElementById('marketDealCountry').value,direction:document.getElementById('marketDealDirection').value,prospect_id:Number(document.getElementById('marketDealProspect').value),item_description:document.getElementById('marketDealItem').value,quantity:Number(document.getElementById('marketDealQuantity').value),owner_notes:document.getElementById('marketDealNotes').value};
  try{var r=await api('/api/market-deals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(r.error||'Could not create deal draft');box.textContent='Internal draft created for '+r.country+' ('+r.currency+'). Pricing/logistics need verification and owner approval; no quote or message was sent.';document.getElementById('marketDealItem').value='';await loadMarketDeals();}
  catch(e){box.textContent=e.message||String(e);}
}
async function loadMarketDeals(){
  var box=document.getElementById('marketDealsList');if(!box)return;box.textContent='Loading deal drafts...';
  try{var r=await api('/api/market-deals');var a=r.deals||[];if(!a.length){box.innerHTML='<p>No internal market deal drafts yet.</p>';return;}var stages=['lead_review','qualified','pricing_required','draft_quote','closed_won','closed_lost'];
    box.innerHTML='<div style="overflow:auto"><table><tr><th>Market</th><th>Direction</th><th>Lead</th><th>Product / need</th><th>Qty</th><th>Currency</th><th>Stage</th><th>Save</th></tr>'+a.map(function(x){return '<tr><td>'+esc(x.country)+'</td><td>'+esc(x.direction==='sell_to_market'?'Sell to market':'Source from market')+'</td><td>'+esc(x.prospect_name||'')+'</td><td>'+esc(x.item_description||'')+'</td><td>'+Number(x.quantity||1)+'</td><td>'+esc(x.currency)+'</td><td><select id="marketDealStage'+Number(x.id)+'">'+stages.map(function(s){return '<option value="'+s+'" '+(x.stage===s?'selected':'')+'>'+s.replace(/_/g,' ')+'</option>';}).join('')+'</select></td><td><button onclick="saveMarketDealStage('+Number(x.id)+')">Save</button></td></tr>';}).join('')+'</table></div>';
  }catch(e){box.textContent='Could not load deal drafts: '+(e.message||String(e));}
}
async function saveMarketDealStage(id){
  var stage=document.getElementById('marketDealStage'+id).value;
  try{var r=await api('/api/market-deals/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,stage:stage})});if(!r.ok)throw new Error(r.error||'Could not save deal stage');await loadMarketDeals();}
  catch(e){alert(e.message||String(e));}
}async function runBuyerDiscovery(){
  var btn=document.getElementById('discoveryRunBtn'),box=document.getElementById('discoveryResult');
  var cities=document.getElementById('discoveryCities').value.split(',').map(function(x){return x.trim();}).filter(Boolean);
  var search=document.getElementById('discoverySearch').value;
  if(!cities.length){box.textContent='Enter at least one city.';return;}
  btn.disabled=true;box.textContent='Searching free OpenStreetMap business data. No Google billing is used.';
  try{var r=await api('/api/buyer-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cities:cities,searches:[search]})});
    if(!r.ok) throw new Error(r.error||(Array.isArray(r.errors)&&r.errors.length?r.errors.map(function(x){return x.city+': '+x.error;}).join(' | '):'Discovery request failed'));
    box.textContent='Search complete (OpenStreetMap). Queries: '+r.queries_run+'; businesses found: '+r.results_seen+'; leads saved/refreshed: '+r.saved_or_refreshed+'. No outreach was sent.';
    await loadBuyerProspects();
  }catch(e){box.textContent='Discovery not completed: '+(e.message||String(e));await loadBuyerDiscoveryStatus();}
  finally{btn.disabled=!(document.getElementById('discoveryStatus').textContent.indexOf('Ready:')===0);}
}
async function saveBuyerProspectReview(id){
  var status=document.getElementById('prospectStatus'+id).value,notes=document.getElementById('prospectNotes'+id).value;
  try{var r=await api('/api/buyer-prospects/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,review_status:status,owner_notes:notes})});if(!r.ok)throw new Error(r.error||'Save failed');await loadBuyerProspects();}
  catch(e){alert('Could not save review: '+(e.message||String(e)));}
}
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
             return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.name)+'</b> - '+esc(x.city||'Pakistan')+' - '+esc(x.phone||x.whatsapp||'')+'</div>';
          }).join('')
        : '<p>No Pakistan buyers yet.</p>';
    }

    var r=await api('/api/buyer-requirements');
    var req=r.requirements||[];
    var rl=document.getElementById('requirementList');
    if(rl){
      rl.innerHTML=req.length
        ? req.map(function(x){
             return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.buyer_name||'Buyer')+'</b> - '+esc(x.product_keyword||'')+' - Qty '+x.quantity+' - Budget PKR '+fmt(x.max_budget_pkr||0)+'</div>';
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
async function sendNadeemWhatsAppTest(){
 const out=document.getElementById('whatsappTestResult');
 if(!out)return;
 out.textContent='Checking AI Sourcing WhatsApp sender readiness. This is diagnostic-only; no message will be sent...';
 try{const r=await fetch('/api/notifications/whatsapp-template-test',{method:'POST',headers:{'content-type':'application/json'},credentials:'same-origin',body:'{}'});const j=await r.json().catch(()=>({error:'Invalid server response'}));const p=j.phone||{};const lines=['AI SOURCING WHATSAPP READINESS - NO MESSAGE SENT','HTTP: '+r.status,'Phone status: '+(p.status||'unknown'),'Verification: '+(p.code_verification_status||'unknown'),'Platform: '+(p.platform_type||'unknown'),'Phone linked to WABA: '+String(j.waba_phone_linked),'Template: '+(j.template?.status||j.template?.error?.message||'unknown'),'Ready to send: '+String(j.ready_to_send),'Result: '+(j.message||j.error||'Diagnostic completed.')];if(j.meta_error_code)lines.push('Meta error code: '+j.meta_error_code);for(const k of ['phone','waba_phones','templates'])if(j.errors?.[k])lines.push(k+' error: '+(j.errors[k].message||'lookup failed')+(j.errors[k].code?' [code '+j.errors[k].code+']':''));out.textContent=lines.join(' | ');}catch(e){out.textContent='Diagnostic request failed: '+String(e.message||e)+'. No message was sent.';}
}async function initPakThaiAuth(){
 const gate=document.getElementById('authGate');
 const form=document.getElementById('authForm');
 const msg=document.getElementById('authMessage');
 const authQuery=new URLSearchParams(location.search);
 const staffSetupToken=authQuery.get('staff_setup_token');
 const ownerPasswordToken=authQuery.get('owner_password_token');
 if(staffSetupToken||ownerPasswordToken){
  form.innerHTML='<h2>PAKTHAI TECH Password Setup</h2><p>One-time link, expires in 15 minutes.</p><label>New password (minimum 12 characters)</label><input id="newAuthPassword" type="password" minlength="12" required style="width:100%;padding:10px;margin:8px 0 14px;box-sizing:border-box"><button type="submit" style="width:100%">Save Password</button><p id="authMessage" role="status"></p>';
  form.addEventListener('submit',async e=>{e.preventDefault();document.getElementById('authMessage').textContent='Saving...';const staff=Boolean(staffSetupToken);const payload={token:staff?staffSetupToken:ownerPasswordToken,password:document.getElementById('newAuthPassword').value};if(!staff)payload.purpose=authQuery.get('owner_password_purpose')||'owner_setup';try{const r=await fetch(staff?'/api/auth/staff/set-password':'/api/auth/owner/set-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();document.getElementById('authMessage').textContent=j.message||j.error||'Done';if(r.ok)setTimeout(()=>{location.href=location.pathname;},1200);}catch(e){document.getElementById('authMessage').textContent='Request failed.';}});
  return;
 }
 function signedIn(role){
  gate.style.display='none';
  const h=document.querySelector('header');
  if(h&&!document.getElementById('authStatus')){
   const box=document.createElement('div');box.id='authStatus';box.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
   box.innerHTML='<span style="font-size:12px">Signed in: '+(role==='owner'?'Owner':'Staff (read-only)')+'</span><button class="alt" id="authLogout">Log Out</button>';
   h.appendChild(box);
   if(role==='owner'){const manage=document.createElement('button');manage.className='alt';manage.textContent='Staff Requests';manage.onclick=async()=>{try{const r=await fetch('/api/auth/staff/list');const j=await r.json();if(!r.ok){alert(j.error||'Could not load staff requests');return;}const rows=j.staff||[];alert(rows.length?rows.map(x=>'ID '+x.id+' | '+x.name+' | '+x.email+' | '+x.status).join(' | '):'No staff requests.');const id=prompt('Enter the ID of a PENDING staff request to approve, or Cancel:');if(!id)return;const a=await fetch('/api/auth/staff/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({staff_id:Number(id)})});const result=await a.json();alert(result.message||result.error||'Done');}catch(e){alert('Staff management failed.');}};box.insertBefore(manage,box.firstChild);}
   document.getElementById('authLogout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload();};
  }
  if(role==='staff'){
   document.querySelectorAll('button').forEach(b=>{if(/approve|reject|save|create opportunity|sync source catalog|run buyer matching|calculate automatically/i.test(b.textContent||'')){b.title='Staff account is read-only. Ask the Owner to perform this action.';}});
  }
  Promise.all([refresh(),loadControlPanel(),loadCountryControls()]).catch(e=>console.error(e));
   if(role==='owner')initBrowserPushPanel();
 }
 document.getElementById('staffRequestBtn').addEventListener('click',async()=>{const name=prompt('Staff member name:');if(!name)return;const email=prompt('Staff member email:');if(!email)return;msg.textContent='Submitting request...';try{const r=await fetch('/api/auth/staff/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,email})});const j=await r.json();msg.textContent=j.message||j.error||'Request submitted.';}catch(e){msg.textContent='Request failed.';}});
 document.getElementById('ownerRecoveryBtn').addEventListener('click',async()=>{const email=prompt('Enter Owner email: pakthaitech@gmail.com');if(!email)return;msg.textContent='Requesting secure email link...';try{const r=await fetch('/api/auth/owner/recovery-request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});const j=await r.json();msg.textContent=j.message||j.error||'If eligible, an email will be sent.';}catch(e){msg.textContent='Recovery request failed.';}});
 form.addEventListener('submit',async e=>{
  e.preventDefault();msg.textContent='Signing in...';
  try{
   const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:document.getElementById('authRole').value,email:document.getElementById('authEmail').value,password:document.getElementById('authPassword').value})});
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
  BLOCK 8: PRODUCT -> SELLER / SUPPLIER MATCHING

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

function block8OfferCurrencyToPkr(offer, thbToPkr, krwToPkr = 0) {
  const currency = String(offer.currency || "THB").trim().toUpperCase();
  const asking = Number(offer.asking_price) || 0;
  if (currency === "PKR") return { supported: true, currency, rate: 1, unitPkr: asking };
  if (currency === "THB" && Number.isFinite(thbToPkr) && thbToPkr > 0) return { supported: true, currency, rate: thbToPkr, unitPkr: asking * thbToPkr };
  if (currency === "KRW" && Number.isFinite(krwToPkr) && krwToPkr > 0) return { supported: true, currency, rate: krwToPkr, unitPkr: asking * krwToPkr };
  return { supported: false, currency, rate: 0, unitPkr: 0 };
}

async function runProductSellerMatching(db, input = {}) {
  const settings = await getSettings(db);
  const thbToPkr = Number(input.thb_to_pkr ?? settings.thb_to_pkr ?? 0);
  const krwToPkr = Number(input.krw_to_pkr ?? settings.krw_to_pkr ?? 0);
  if (masterMode(settings) !== "on") {
    return { ok: true, block: 8, paused: true, reason: `Master AI is ${masterMode(settings)}.` , results: [] };
  }
  if (!settingBool(settings, "seller_matching_enabled", true)) {
    return { ok: true, block: 8, paused: true, reason: "Seller Matching is OFF.", results: [] };
  }

  const defaultMargin = Math.max(
    0,
    Number(input.target_margin_pct) ||
      settingNum(settings, "default_margin_pct", 25)
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

      const currency = block8OfferCurrencyToPkr(offer, thbToPkr, krwToPkr);
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
         'seller match only - owner approval still required.';

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
  BLOCK 9: SELLER MATCH -> SOURCING OPPORTUNITY

  Converts an approved-by-logic seller match into an internal sourcing opportunity.
  It uses the existing opportunities table; no schema change is required.
  This block never purchases anything and always leaves approval_status = pending.
*/

async function buildBlock9Opportunity(db, input = {}) {
  const buyerMatchId = Math.floor(Number(input.buyer_match_id) || 0);
  if (!buyerMatchId) throw new Error("buyer_match_id is required.");

  const settings = await getSettings(db);
  const thbToPkr = Number(input.thb_to_pkr ?? settings.thb_to_pkr ?? 0);
  const krwToPkr = Number(input.krw_to_pkr ?? settings.krw_to_pkr ?? 0);
  const defaultMargin = Math.max(
    0,
    Number(input.target_margin_pct) || settingNum(settings, "default_margin_pct", 25)
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

  const currency = block8OfferCurrencyToPkr(offer, thbToPkr, krwToPkr);
  if (!currency.supported) {
    throw new Error(`Unsupported seller-offer currency: ${currency.currency || "unknown"}`);
  }

  if (!(Number(offer.asking_price) > 0)) {
    throw new Error("Seller offer must include a positive asking price.");
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
  const pending_costs = [
    ["travel_enabled", "travel_rate", "travel"],
    ["pickup_enabled", "pickup_rate", "pickup"],
    ["packing_enabled", "packing_rate", "packing"],
    ["freight_enabled", "freight_rate", "freight"],
    ["duty_enabled", "duty_rate", "duties"],
    ["payment_fee_enabled", "payment_fee_rate", "payment"],
    ["pakistan_transport_enabled", "pakistan_transport_rate", "pakistan_transport"],
    ["contingency_enabled", "contingency_rate", "contingency"]
  ].filter(([enabledKey, rateKey]) =>
    settingBool(settings, enabledKey, true) && settingNum(settings, rateKey, 0) === 0
  ).map(([, , label]) => label);
  const viable = pending_costs.length === 0 && marginPass && budgetPass && targetPricePass;

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
    pending_costs,
    costs_complete: pending_costs.length === 0,
    classification: pending_costs.length
      ? "Incomplete Cost Inputs"
      : viable
        ? (quantity <= 5 && distance <= 10 ? "Local Small-Lot Opportunity" : "Meets Target Margin")
        : !budgetPass || !targetPricePass
          ? "Budget Review"
          : "Below Target Margin"
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
        message: calc.pending_costs?.length
          ? `Opportunity blocked: landed-cost rates are not configured for ${calc.pending_costs.join(", ")}.`
          : "Seller match did not meet target margin, buyer budget, or target price; opportunity was not created."
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

    // FX is validated per offer below so PKR offers can still be screened when
    // an unrelated foreign-currency rate is not configured.
    const thbToPkr = Number(settings.thb_to_pkr || 0);
    const krwToPkr = Number(settings.krw_to_pkr || 0);

    const targetMargin = Math.max(
      0,
      Number(body.target_margin_pct) ||
      settingNum(settings, "default_margin_pct", 25)
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

      const currency = block8OfferCurrencyToPkr(r, thbToPkr, krwToPkr);
      if (!currency.supported) {
        results.push({
          offer_id: r.offer_id,
          seller_id: r.seller_id,
          seller_name: r.seller_name,
          seller_country: r.seller_country,
          seller_city: r.seller_city,
          product_id: r.product_id,
          product_title: r.product_title,
          original_currency: currency.currency,
          original_asking_price: Number(r.asking_price) || 0,
          fx_configured: false,
          costs_complete: false,
          viable: false,
          pending_costs: [`${currency.currency}/PKR exchange rate`],
          classification: "FX Rate Missing"
        });
        continue;
      }
      const askingUnitPkr = currency.unitPkr;
      const purchasePKR = askingUnitPkr * quantity;
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
        costRate(settings, "pakistan_transport_enabled", "pakistan_transport_rate");

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

      const pending_costs = [
        ["travel_enabled", "travel_rate", "travel"],
        ["pickup_enabled", "pickup_rate", "pickup"],
        ["packing_enabled", "packing_rate", "packing"],
        ["freight_enabled", "freight_rate", "freight"],
        ["duty_enabled", "duty_rate", "duties"],
        ["payment_fee_enabled", "payment_fee_rate", "payment"],
        ["pakistan_transport_enabled", "pakistan_transport_rate", "pakistan_transport"],
        ["contingency_enabled", "contingency_rate", "contingency"]
      ].filter(([enabledKey, rateKey]) =>
        settingBool(settings, enabledKey, true) && settingNum(settings, rateKey, 0) <= 0
      ).map(([, , label]) => label);
      const costsComplete = pending_costs.length === 0;
      const viable = costsComplete && retailTotal > 0 && margin >= targetMargin;
      let classification = "Not Viable";

      if (!costsComplete) {
        classification = "Incomplete Cost Inputs";
      } else if (retailTotal <= 0) {
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

        original_currency: currency.currency,
        original_asking_price: Number(r.asking_price) || 0,
        fx_rate_to_pkr: currency.rate,
        fx_configured: true,
        asking_price_pkr_per_unit: askingUnitPkr,

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

        costs_complete: costsComplete,
        pending_costs,
        viable,
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
        results.filter(x => x.viable === true).length,
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
  BLOCKS 10-17: LANDED COST, OWNER APPROVAL, QUOTATION, ORDER, PURCHASE TRACKING, PAKISTAN DELIVERY, NOTIFICATIONS, FINAL DASHBOARD.
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

    // BLOCK 10: Landed cost / margin
  if (path === '/api/landed-cost/calculate' && method === 'POST') {
    const settings = await getSettings(env.DB);

    const opportunityId = Math.floor(Number(body.opportunity_id || 0));
    const opp = opportunityId ? await getOpportunityFull(env.DB, opportunityId) : null;
    if (opportunityId && !opp) return json({ error: 'Opportunity not found' }, 404);
    const quantityInput=Number(body.quantity ?? opp?.quantity ?? 1);
    if(!Number.isInteger(quantityInput)||quantityInput<1||quantityInput>1000) return json({error:'Quantity must be between 1 and 1000.'},400);
    const retailInput=Number(body.retail_price_pkr ?? opp?.current_retail_pkr ?? opp?.retail_price_pkr ?? 0);
    const askingInput=Number(body.asking_price ?? opp?.asking_price ?? 0);
    const distanceInput=Number(body.distance_km ?? opp?.distance_km ?? 0);
    const marginInput=Number(body.target_margin_pct ?? opp?.target_margin_pct ?? settings.default_margin_pct ?? 20);
    const budgetInput=body.buyer_max_budget_pkr==null||body.buyer_max_budget_pkr===''?null:Number(body.buyer_max_budget_pkr);
    if(budgetInput!==null&&(!Number.isFinite(budgetInput)||budgetInput<=0||budgetInput>100000000000)) return json({error:'Buyer budget must be a positive valid PKR amount.'},400);
    if(!Number.isFinite(retailInput)||retailInput<0||retailInput>100000000000||!Number.isFinite(askingInput)||askingInput<0||askingInput>100000000000||!Number.isFinite(distanceInput)||distanceInput<0||distanceInput>100000||!Number.isFinite(marginInput)||marginInput<20||marginInput>80) return json({error:'Retail price, supplier price, distance or target margin is outside the valid range.'},400);
    for(const field of ['travel_cost','pickup_cost','packing_cost','freight_cost','pakistan_transport_cost','payment_fee','duties_cost','contingency_cost']){
      if(body[field]!=null&&(!Number.isFinite(Number(body[field]))||Number(body[field])<0||Number(body[field])>100000000000)) return json({error:'Cost fields must be finite, non-negative amounts.'},400);
    }

    const productId = Math.floor(Number(body.product_id || opp?.product_id || 0));
    const product = productId
      ? await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(productId).first()
      : null;

    const quantity = quantityInput;

    const retailPrice = Math.max(0,Number(body.retail_price_pkr ?? opp?.current_retail_pkr ?? opp?.retail_price_pkr ?? product?.price_pkr ?? 0));

    const askingPrice = askingInput;

    const targetMargin = marginInput;

    const distanceKm = distanceInput;

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
      ...(askingPrice>0?[]:['supplier_price']),
      ...(retailPrice>0?[]:['retail_reference']),
      ...[
        ['travel_enabled','travel_rate','travel','travel_cost','travel_cost'],
        ['pickup_enabled','pickup_rate','pickup','pickup_cost','pickup_cost'],
        ['packing_enabled','packing_rate','packing','packing_cost','packing_cost'],
        ['freight_enabled','freight_rate','freight','freight_cost','freight_cost'],
        ['duty_enabled','duty_rate','duties','duties_cost','duties_cost'],
        ['payment_fee_enabled','payment_fee_rate','payment','payment_fee','payment_fee'],
        ['pakistan_transport_enabled','pakistan_transport_rate','pakistan_transport','pakistan_transport_cost','pakistan_transport_cost'],
        ['contingency_enabled','contingency_rate','contingency','contingency_cost','contingency_cost']
      ].filter(([ek,rk,,bodyKey,oppKey]) => settingBool(settings,ek,true) && settingNum(settings,rk,0) === 0 && body[bodyKey] == null && !(Number(opp?.[oppKey]) > 0))
       .map(([, ,label]) => label)
    ];

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
      viable: pending_costs.length === 0 && marginPass && budgetPass,
      pending_costs,
      costs_complete: pending_costs.length === 0,
      classification: pending_costs.length ? 'Incomplete Cost Inputs' : classification,
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
      'default_margin_pct','small_lot_allowed','owner_approval_required','travel_rate','pickup_rate','packing_rate','freight_rate','duty_rate','payment_fee_rate','pakistan_transport_rate','contingency_rate','thb_to_pkr','krw_to_pkr',
      'master_ai_mode','auto_search_enabled','seller_matching_enabled','negotiation_mode','auto_followup_enabled','negotiation_max_attempts','negotiation_followup_delay_hours','opportunity_creation_enabled',
      'travel_enabled','pickup_enabled','packing_enabled','freight_enabled','duty_enabled','payment_fee_enabled','pakistan_transport_enabled','contingency_enabled','missing_rate_action',
      'country_thailand_enabled','country_thailand_city_scope','country_south_korea_enabled','country_singapore_enabled','country_malaysia_enabled','country_vietnam_enabled','country_australia_enabled','country_pakistan_enabled','pakistan_source_enabled'
    ]);
    const numericLimits = { default_margin_pct:[1,80], travel_rate:[0,1000000000], pickup_rate:[0,1000000000], packing_rate:[0,1000000000], freight_rate:[0,1000000000], duty_rate:[0,100], payment_fee_rate:[0,100], pakistan_transport_rate:[0,1000000000], contingency_rate:[0,100], thb_to_pkr:[0,1000000], krw_to_pkr:[0,1000000] };
    for (const [k,v] of Object.entries(entries)) {
      if (!allowed.has(k) || !Object.prototype.hasOwnProperty.call(numericLimits,k)) continue;
      const n = Number(v), [min,max] = numericLimits[k];
      if (!Number.isFinite(n) || n < min || n > max) return json({ok:false,error:'Invalid numeric setting: '+k+'.'},400);
    }
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
          batch_size: Math.max(1,Math.min(50,Math.floor(settingNum(settings,'catalog_sync_batch_size',25)))),
          cursor: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_cursor',0))),
          last_run_at: settings.catalog_sync_last_run_at || null,
          last_saved: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_saved',0))),
          last_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_failed',0))),
          last_cycle_failed: Math.max(0,Math.floor(settingNum(settings,'catalog_sync_last_cycle_failed',0))),
          last_error: settings.catalog_sync_last_error || null,
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
    const recipient = String(body.recipient || '').replace(/[^0-9]/g, '');
    const sendResult = {sent:false,prepared:true,reason:'owner_approval_required'};
    const r = await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status,sent_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind('external','whatsapp',recipient,'Seller negotiation message',message,'negotiation',id,'prepared',null).run();
    await env.DB.prepare(`UPDATE negotiations SET last_offer_price_pkr=?,next_followup_at=NULL,status='awaiting_owner_approval',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(proposed,id).run();
    return json({
      ok:true,
      negotiation_id:id,
      attempt_count:attempt,
      max_attempts:Number(n.max_attempts||3),
      status:'awaiting_owner_approval',
      next_followup_at:null,
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
      const sendResult = {sent:false,prepared:true,reason:'owner_approval_required'};
      const r = await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status,sent_at) VALUES(?,?,?,?,?,?,?,?,?)`).bind('external','whatsapp',recipient,`Seller follow-up: ${n.seller_name || 'Seller'}`,message,'negotiation',n.id,'prepared',null).run();
      await env.DB.prepare(`UPDATE negotiations SET next_followup_at=NULL,status='awaiting_owner_approval',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(n.id).run();
      processed.push({negotiation_id:n.id,notification_id:r.meta?.last_row_id || null,attempt_count:attempts,max_attempts:maxAttempts,next_followup_at:null,actual_sending:'prepared_only',whatsapp:sendResult});
    }
    return json({ok:true,processed:processed.length,results:processed,actual_sending:processed.length && processed.every(x => x.actual_sending === 'sent') ? 'sent' : (processed.some(x => x.actual_sending === 'sent') ? 'partial' : 'prepared_only')});
  }

  // BLOCK 11: Owner approval
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

  // BLOCK 12: Quotation
  if (path === '/api/quotations' && method === 'GET') {
    const r=await env.DB.prepare(`SELECT q.*,p.title AS product_title FROM quotations q LEFT JOIN products p ON p.id=q.product_id ORDER BY q.id DESC LIMIT 200`).all();
    return json({ok:true,quotations:r.results||[]});
  }
  if (path === '/api/quotations' && method === 'POST') {
    const opp=await getOpportunityFull(env.DB,Math.floor(num(body.opportunity_id)));
    if(!opp) return json({error:'Opportunity not found'},404);
    if(String(opp.approval_status||'pending')!=='approved') return json({error:'Owner approval is required before quotation.'},409);
    const settings=await getSettings(env.DB);
    const pendingCosts=[
      ['travel_enabled','travel_rate','travel_cost','travel'],
      ['pickup_enabled','pickup_rate','pickup_cost','pickup'],
      ['packing_enabled','packing_rate','packing_cost','packing'],
      ['freight_enabled','freight_rate','freight_cost','freight'],
      ['duty_enabled','duty_rate','duties_cost','duties'],
      ['payment_fee_enabled','payment_fee_rate','payment_fee','payment'],
      ['pakistan_transport_enabled','pakistan_transport_rate','pakistan_transport_cost','pakistan_transport'],
      ['contingency_enabled','contingency_rate','contingency_cost','contingency']
    ].filter(([enabled,rate,field])=>settingBool(settings,enabled,true)&&settingNum(settings,rate,0)===0&&!(Number(opp[field])>0)).map(([, , ,label])=>label);
    if(pendingCosts.length) return json({error:'Quotation blocked: landed-cost inputs are incomplete.',pending_costs:pendingCosts},409);
    if(!(num(opp.asking_price)>0)) return json({error:'Quotation blocked: a verified supplier asking price is required.'},409);
    const quoteProduct=opp.product_id?await env.DB.prepare('SELECT price_pkr FROM products WHERE id=? LIMIT 1').bind(opp.product_id).first():null;
    if(!(num(opp.retail_price_pkr)>0 || num(opp.current_retail_pkr)>0 || num(quoteProduct?.price_pkr)>0)) return json({error:'Quotation blocked: a verified retail reference is required.'},409);
    const qtyRaw=Number(body.quantity ?? opp.quantity ?? 1);
    if(!Number.isInteger(qtyRaw)||qtyRaw<1||qtyRaw>1000) return json({error:'Quantity must be between 1 and 1000.'},400);
    const unit=Number(body.unit_price_pkr);
    if(!Number.isFinite(unit)||unit<=0||unit>100000000000) return json({error:'A positive explicit unit_price_pkr is required; retail price is not used as a quote fallback.'},400);
    const customerName=String(body.customer_name||'').trim();
    const customerPhone=String(body.customer_phone||'').trim();
    const customerWhatsApp=String(body.customer_whatsapp||'').trim();
    const buyerId=body.buyer_id?Math.floor(num(body.buyer_id)):null;
    if(body.buyer_id&&!buyerId) return json({error:'buyer_id must be a valid existing buyer ID.'},400);
    if(buyerId){const buyer=await env.DB.prepare('SELECT id FROM buyers WHERE id=? LIMIT 1').bind(buyerId).first();if(!buyer)return json({error:'Buyer not found.'},404);}
    if(!customerName||customerName.length>100||customerPhone.length>40||customerWhatsApp.length>40||(!customerPhone&&!customerWhatsApp&&!buyerId)) return json({error:'Valid customer name and a phone/WhatsApp contact or existing buyer are required.'},400);
    const validUntil=String(body.valid_until||'').trim();
    const expiry=Date.parse(validUntil);
    if(!validUntil||!Number.isFinite(expiry)||expiry<=Date.now()) return json({error:'A valid future quote expiry date/time is required.'},400);
    const qty=qtyRaw;
    const total=unit*qty;
    const ref=String(body.quote_number||makeRef('PTQ')).trim();
    if(ref.length>60) return json({error:'Quote number is too long.'},400);
    const r=await env.DB.prepare(`INSERT INTO quotations(opportunity_id,buyer_id,product_id,quote_number,customer_name,customer_phone,customer_whatsapp,quantity,unit_price_pkr,total_price_pkr,valid_until,status,notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(opp.id,buyerId,opp.product_id,ref,customerName,customerPhone,customerWhatsApp,qty,unit,total,new Date(expiry).toISOString(),'draft',String(body.notes||'').slice(0,2000)).run();
    return json({ok:true,block:12,quotation_id:r.meta?.last_row_id,quote_number:ref,total_price_pkr:total,status:'draft',message:'Quote saved as draft; owner must approve and send it separately.'},201);
  }
  if (path === '/api/quotations/approve' && method === 'POST') {
    const quoteId=Math.floor(num(body.quotation_id));
    if(!quoteId) return json({error:'quotation_id is required'},400);
    const quote=await env.DB.prepare('SELECT id,opportunity_id,status FROM quotations WHERE id=? LIMIT 1').bind(quoteId).first();
    if(!quote) return json({error:'Quotation not found'},404);
    if(String(quote.status)!=='draft') return json({error:'Only draft quotations can be approved.'},409);
    const opp=await getOpportunityFull(env.DB,Math.floor(num(quote.opportunity_id)));
    if(!opp||String(opp.approval_status||'pending')!=='approved') return json({error:'The linked opportunity must remain Owner-approved.'},409);
    await env.DB.prepare("UPDATE quotations SET status='approved' WHERE id=? AND status='draft'").bind(quoteId).run();
    return json({ok:true,quotation_id:quoteId,status:'approved',message:'Quote approved. Create a prepared email/WhatsApp notification, then approve and send it separately.'});
  }

  // BLOCK 13: Customer order
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

  // BLOCK 14: Supplier purchase tracking
  if (path === '/api/purchases' && method === 'GET') { const r=await env.DB.prepare(`SELECT pt.*,o.order_number,s.name AS seller_name FROM purchase_tracking pt LEFT JOIN orders o ON o.id=pt.order_id LEFT JOIN sellers s ON s.id=pt.seller_id ORDER BY pt.id DESC LIMIT 200`).all(); return json({ok:true,purchases:r.results||[]}); }
  if (path === '/api/purchases' && method === 'POST') {
    const orderId=Math.floor(num(body.order_id)); if(!orderId) return json({error:'order_id is required'},400);
    const order=await env.DB.prepare(`SELECT * FROM orders WHERE id=? LIMIT 1`).bind(orderId).first();
    if(!order) return json({error:'Order not found'},404);
    if (!['confirmed','purchasing'].includes(String(order.status||''))) return json({error:`Order is not ready for purchase tracking: ${order.status || 'unknown'}`},409);
    const r=await env.DB.prepare(`INSERT INTO purchase_tracking(order_id,opportunity_id,seller_id,purchase_status,agreed_price_pkr,currency,quantity,purchase_date,tracking_ref,notes) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(orderId,body.opportunity_id?num(body.opportunity_id):order.opportunity_id,body.seller_id?num(body.seller_id):null,String(body.purchase_status||'pending'),num(body.agreed_price_pkr),String(body.currency||'PKR'),Math.max(1,Math.floor(num(body.quantity)||order.quantity||1)),String(body.purchase_date||''),String(body.tracking_ref||''),String(body.notes||'')).run();
    await env.DB.prepare(`UPDATE orders SET status='purchasing',updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(orderId).run(); return json({ok:true,block:14,purchase_id:r.meta?.last_row_id},201);
  }

  // BLOCK 15: Pakistan delivery tracking
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

  // BLOCK 16: Notifications / WhatsApp helper
  if (path === '/api/notifications/whatsapp-webhook-subscribe' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    const verifyToken=String(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET||env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||'').trim();
    if(!token||!wabaId||!env.WHATSAPP_APP_SECRET||!verifyToken) return json({ok:false,error:'Missing access token, WABA ID, app secret, or webhook verify token. No Meta API request made.'},409);
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    const endpoint='https://graph.facebook.com/'+version+'/'+encodeURIComponent(wabaId)+'/subscribed_apps';
    const callbackUrl=new URL(request.url).origin+'/webhooks/whatsapp';
    const call=async(method,payload=null)=>{try{const r=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(payload||{})}:{})});let data={};try{data=await r.json()}catch{};return {ok:r.ok,data,error:r.ok?null:{message:data?.error?.message||('Meta Graph API HTTP '+r.status),code:data?.error?.code||null,subcode:data?.error?.error_subcode||null}}}catch(e){return {ok:false,data:{},error:{message:String(e?.message||e).slice(0,240)}}}};
    const before=await call('GET');
    if(!before.ok)return json({ok:false,error:'Could not inspect existing Meta subscription: '+before.error.message,meta_error_code:before.error.code||null},502);
    const existing=Array.isArray(before.data?.data)?before.data.data:[];
    let action='already_subscribed';
    if(!existing.length){const subscribed=await call('POST');if(!subscribed.ok)return json({ok:false,error:'Meta rejected app subscription: '+subscribed.error.message,meta_error_code:subscribed.error.code||null},502);action='subscription_requested';}
    const override=await call('POST',{override_callback_uri:callbackUrl,verify_token:verifyToken});
    if(!override.ok)return json({ok:false,action,waba_subscription_verified:true,callback_url:callbackUrl,callback_verified:false,error:'WABA app subscription is active, but Meta did not accept/verify the callback override: '+override.error.message,meta_error_code:override.error.code||null,note:'No message was sent.'},502);
    const after=await call('GET');
    if(!after.ok)return json({ok:false,action,waba_subscription_verified:true,callback_url:callbackUrl,callback_verified:false,error:'Meta accepted callback setup but final lookup failed: '+after.error.message},502);
    const apps=Array.isArray(after.data?.data)?after.data.data:[];
    const app=apps.find(a=>String(a.whatsapp_business_api_data?.id||'')===String((existing[0]?.whatsapp_business_api_data?.id)||apps[0]?.whatsapp_business_api_data?.id||''))||apps[0];
    const callbackVerified=String(app?.override_callback_uri||'')===callbackUrl;
    return json({ok:apps.length>0&&callbackVerified,action,waba_subscription_verified:apps.length>0,callback_url:callbackUrl,callback_verified:callbackVerified,subscribed_apps_count:apps.length,note:callbackVerified?'WABA subscription and callback override verified. No message was sent.':'WABA is subscribed, but the expected callback override is not visible in Meta readback.'},apps.length&&callbackVerified?200:502);
  }
  if (path === '/api/notifications/whatsapp-diagnostics' && method === 'GET') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const phoneId=String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    const checked_at=new Date().toISOString();
    const configured={access_token:Boolean(token),phone_number_id:Boolean(phoneId),waba_id:Boolean(wabaId),app_secret:Boolean(env.WHATSAPP_APP_SECRET),webhook_verify_token:Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET||env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)};
    if(!token||!phoneId||!wabaId) return json({ok:false,checked_at,configured,phone:{ok:false,error:{message:'Missing WhatsApp Cloud API configuration.'}},accounts_ok:false,accounts_error:{message:'Check WhatsApp Business account ID configuration.'},wabas:[]});
    const getMeta=async(path)=>{try{const r=await fetch('https://graph.facebook.com/'+version+'/'+path,{headers:{Authorization:'Bearer '+token}});let data={};try{data=await r.json()}catch{};if(!r.ok)return {ok:false,error:{message:data?.error?.message||('Meta Graph API HTTP '+r.status),code:data?.error?.code||null,subcode:data?.error?.error_subcode||null}};return {ok:true,data};}catch(e){return {ok:false,error:{message:String(e?.message||e).slice(0,240)}}}};
    const [phone,waba,subs,templates]=await Promise.all([getMeta(encodeURIComponent(phoneId)+'?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status,status,platform_type'),getMeta(encodeURIComponent(wabaId)+'?fields=id,name'),getMeta(encodeURIComponent(wabaId)+'/subscribed_apps'),getMeta(encodeURIComponent(wabaId)+'/message_templates?fields=name,status,language,category,components&limit=100')]);
    return json({ok:true,checked_at,configured,phone:{ok:phone.ok,...(phone.ok?phone.data:{error:phone.error})},accounts_ok:waba.ok,accounts_error:waba.ok?null:waba.error,wabas:[{id:waba.ok?waba.data.id:wabaId,name:waba.ok?waba.data.name:null,subscribed_apps_ok:subs.ok,subscribed_apps:subs.ok?(subs.data.data||[]):[],subscription_error:subs.ok?null:subs.error,templates_ok:templates.ok,templates:templates.ok?(templates.data.data||[]):[],templates_error:templates.ok?null:templates.error}]});
  }
  if (path === '/api/notifications/whatsapp-token-diagnostics' && method === 'GET') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    if(!token||!wabaId)return json({ok:false,error:'WhatsApp access token or WABA ID is missing.'},409);
    try{
      const appsRes=await fetch('https://graph.facebook.com/'+version+'/'+encodeURIComponent(wabaId)+'/subscribed_apps',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});
      const appsData=await appsRes.json().catch(()=>({}));
      if(!appsRes.ok)return json({ok:false,error:'Could not read subscribed app for token diagnostics.',meta_error_code:appsData?.error?.code||null,meta_error_message:String(appsData?.error?.message||'').slice(0,180)},502);
      const appId=String((appsData.data||[]).find(a=>a.whatsapp_business_api_data?.id)?.whatsapp_business_api_data?.id||'').trim();
      if(!appId)return json({ok:false,error:'No subscribed Meta app ID found for token diagnostics.'},409);
      const url=new URL('https://graph.facebook.com/'+version+'/debug_token');
      url.searchParams.set('input_token',token);
      // Meta's official WhatsApp Cloud API collection documents the token debugger
      // with the current bearer token; avoid synthesizing an app token from a secret.
      const r=await fetch(url.toString(),{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(5000)});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.data)return json({ok:false,error:String(d?.error?.message||'Meta token debugger returned no data').slice(0,180),meta_error_code:d?.error?.code||null},502);
      const scopes=Array.isArray(d.data.scopes)?d.data.scopes:[];
      return json({ok:true,token_diagnostics:{is_valid:d.data.is_valid===true,app_id:String(d.data.app_id||''),type:String(d.data.type||''),expires_at:Number(d.data.expires_at||0),data_access_expires_at:Number(d.data.data_access_expires_at||0),has_whatsapp_business_management:scopes.includes('whatsapp_business_management'),has_whatsapp_business_messaging:scopes.includes('whatsapp_business_messaging'),has_business_management:scopes.includes('business_management'),scopes:scopes.filter(s=>/^(whatsapp_business_management|whatsapp_business_messaging|business_management)$/.test(s))}});
    }catch(e){return json({ok:false,error:'Meta token diagnostics failed: '+String(e?.message||e).slice(0,180)},502);}
  }
  if (path === '/api/notifications/whatsapp-phone-request-code' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,blocked:true,error:'Meta verification-code requests are paused after Meta error 136024. Use support case 29002498606053019 for the supported SMB action.'},410);
  }
  if (path === '/api/notifications/whatsapp-phone-verify-code' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,blocked:true,error:'Code submission is unavailable because Meta did not issue a verification code. Follow support case 29002498606053019.'},410);
  }
  if (path === '/api/notifications/whatsapp-template-submit' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    if(body.confirm!==true)return json({ok:false,error:'Explicit Owner confirmation is required to submit the partner-alert template for Meta review.'},400);
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    if(!token||!wabaId)return json({ok:false,error:'WhatsApp access token or WABA ID is missing.'},409);
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    const url='https://graph.facebook.com/'+version+'/'+encodeURIComponent(wabaId)+'/message_templates';
    const name='pakthai_partner_lead_alert';
    try{
      const existingRes=await fetch(url+'?fields=id,name,status,language,category&limit=100',{headers:{Authorization:'Bearer '+token}});
      const existingData=await existingRes.json().catch(()=>({}));
      if(!existingRes.ok)return json({ok:false,error:existingData?.error?.message||('Meta template lookup HTTP '+existingRes.status),meta_error_code:existingData?.error?.code||null},502);
      const existing=(existingData.data||[]).find(t=>t.name===name&&t.language==='en_US');
      if(existing)return json({ok:true,already_exists:true,template:{id:existing.id,name:existing.name,status:existing.status,language:existing.language,category:existing.category},note:'No message was sent.'});
      const template={name,language:'en_US',category:'UTILITY',components:[{type:'BODY',text:'PakThai Tech has a new sourcing request for partner review.\nProduct: {{1}}\nQuantity: {{2}}\nDestination: {{3}}\nRequest reference: {{4}}\nPlease review details with the Owner before making any commitment.',example:{body_text:[['gaming laptop','50 units','Pakistan','PT-12345']]}}]};
      const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(template)});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)return json({ok:false,error:data?.error?.message||('Meta template submission HTTP '+r.status),meta_error_code:data?.error?.code||null,meta_error_subcode:data?.error?.error_subcode||null},502);
      return json({ok:true,submitted:true,template:{id:data.id||null,name,status:data.status||'PENDING',language:'en_US',category:'UTILITY'},note:'Submitted for Meta review only. This does not send a WhatsApp message. Sending remains disabled until Meta approves the template and the phone number is ready.'},201);
    }catch(e){return json({ok:false,error:'Meta template submission failed: '+String(e?.message||e).slice(0,220)},502)}
  }
  if (path === '/api/notifications/whatsapp-template-test' && method === 'POST') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    // This button is deliberately diagnostic-only: it must never send a test message.
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const phoneId=String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    const checked_at=new Date().toISOString();
    if(!token||!phoneId||!wabaId) return json({ok:false,diagnostic_only:true,sent:false,checked_at,error:'WhatsApp Cloud API configuration is incomplete.',configured:{access_token:Boolean(token),phone_number_id:Boolean(phoneId),waba_id:Boolean(wabaId)}},409);
    const getMeta=async path=>{try{const r=await fetch('https://graph.facebook.com/'+version+'/'+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});const data=await r.json().catch(()=>({}));return r.ok?{ok:true,data}:{ok:false,http_status:r.status,error:{message:String(data?.error?.message||('Meta Graph API HTTP '+r.status)).slice(0,240),code:data?.error?.code??null,subcode:data?.error?.error_subcode??null,type:data?.error?.type??null}};}catch(e){return {ok:false,error:{message:String(e?.message||e).slice(0,240)}}}};
    const [phone,wabaPhones,templates]=await Promise.all([
      getMeta(encodeURIComponent(phoneId)+'?fields=id,display_phone_number,code_verification_status,status,platform_type,quality_rating'),
      getMeta(encodeURIComponent(wabaId)+'/phone_numbers?fields=id,display_phone_number&limit=100'),
      getMeta(encodeURIComponent(wabaId)+'/message_templates?fields=name,status,language&limit=100')
    ]);
    const linked=Boolean(phone.ok&&wabaPhones.ok&&(wabaPhones.data.data||[]).some(x=>String(x.id)===phoneId));
    const p=phone.ok?phone.data:{};
    const template=templates.ok?(templates.data.data||[]).find(x=>x.name==='pakthai_partner_lead_alert'&&x.language==='en_US'):null;
    const verified=String(p.code_verification_status||'').toUpperCase()==='VERIFIED';
    const connected=String(p.status||'').toUpperCase()==='CONNECTED';
    const ready=phone.ok&&wabaPhones.ok&&templates.ok&&linked&&verified&&connected&&String(p.platform_type||'')==='CLOUD_API'&&String(template?.status||'').toUpperCase()==='APPROVED';
    return json({ok:true,diagnostic_only:true,sent:false,checked_at,ready_to_send:ready,phone:phone.ok?{id:p.id,display_phone_number:p.display_phone_number,code_verification_status:p.code_verification_status||null,status:p.status||null,platform_type:p.platform_type||null,quality_rating:p.quality_rating||null}:{error:phone.error},waba_phone_linked:linked,waba_phone_lookup:wabaPhones.ok?{ok:true}:wabaPhones,template:templates.ok?{name:'pakthai_partner_lead_alert',language:'en_US',status:template?.status||'MISSING'}:{error:templates.error},errors:{phone:phone.ok?null:phone.error,waba_phones:wabaPhones.ok?null:wabaPhones.error,templates:templates.ok?null:templates.error},message:ready?'Readiness checks passed. No message was sent by this diagnostic action.':'Not ready: resolve the reported Meta/WABA/template issue before any permitted send. No message was sent.'},200);
  }  if (path === '/api/notifications/whatsapp-inbox' && method === 'GET') {
    await ensureWhatsAppStatusTable(env.DB);
    const r = await env.DB.prepare("SELECT message_id,sender,sender_name,message_type,message_text,message_timestamp,received_at FROM whatsapp_inbox_messages ORDER BY COALESCE(message_timestamp,received_at) DESC LIMIT 100").all();
    return json({ ok:true, messages:r.results||[] });
  }
  if (path === '/api/notifications/whatsapp-inbox/delete' && method === 'POST') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    const messageId=String(body.message_id||'').trim();
    if(!messageId||messageId.length>300) return json({ok:false,error:'A valid message_id is required'},400);
    const result=await env.DB.prepare('DELETE FROM whatsapp_inbox_messages WHERE message_id=?').bind(messageId).run();
    if(!result.meta?.changes) return json({ok:false,error:'Inbox message not found'},404);
    return json({ok:true,deleted:true,message_id:messageId});
  }
  if (path === '/api/notifications/whatsapp-status/remove' && method === 'POST') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    await ensureWhatsAppStatusTable(env.DB);
    const messageId = String(body.message_id || '').trim();
    if (!messageId || messageId.length > 300) return json({ok:false,error:'A valid message_id is required'},400);
    const result = await env.DB.prepare('DELETE FROM whatsapp_message_status WHERE message_id=?').bind(messageId).run();
    if (!result.meta?.changes) return json({ok:false,error:'Status record not found; refresh the list.'},404);
    return json({ok:true,removed:true,message_id:messageId});
  }
  if (path === '/api/notifications/whatsapp-status' && method === 'GET') {
    await ensureWhatsAppStatusTable(env.DB);
    const r = await env.DB.prepare(`SELECT w.message_id,w.recipient,w.status,w.status_timestamp,w.error_code,w.error_title,w.error_message,w.notification_id,w.updated_at FROM whatsapp_message_status w LEFT JOIN notifications n ON n.id=w.notification_id WHERE w.notification_id IS NULL OR COALESCE(n.status,'')<>'archived' ORDER BY w.updated_at DESC LIMIT 50`).all();
    const webhookVerifyToken = env.WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET || env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
    return json({ ok: true, webhook_configured: Boolean(webhookVerifyToken && env.WHATSAPP_APP_SECRET), webhook_verify_configured: Boolean(webhookVerifyToken), app_secret_configured: Boolean(env.WHATSAPP_APP_SECRET), callback_url: new URL(request.url).origin + '/webhooks/whatsapp', messages: r.results || [] });
  }
  if (path === '/api/notifications' && method === 'GET') { const r=await env.DB.prepare(`SELECT * FROM notifications ORDER BY id DESC LIMIT 200`).all(); return json({ok:true,notifications:r.results||[]}); }
  if (path === '/api/notifications/archive' && method === 'POST') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    const notificationId = Math.floor(num(body.notification_id));
    if (!notificationId) return json({ok:false,error:'notification_id is required'},400);
    const item = await env.DB.prepare('SELECT id,channel,status FROM notifications WHERE id=? LIMIT 1').bind(notificationId).first();
    if (!item) return json({ok:false,error:'Notification not found'},404);
    if (!['whatsapp','email'].includes(String(item.channel||''))) return json({ok:false,error:'Only outbound email/WhatsApp records can be hidden here.'},409);
    const result = await env.DB.prepare("UPDATE notifications SET status='archived' WHERE id=? AND status<>'archived'").bind(notificationId).run();
    if (!result.meta?.changes) return json({ok:false,error:'Record is already hidden.'},409);
    return json({ok:true,archived:true,notification_id:notificationId});
  }
  if (path === '/api/notifications' && method === 'POST') {
    const channel=String(body.channel||'dashboard');
    const requestedStatus=String(body.status||'pending');
    const status=['pending','prepared'].includes(requestedStatus)?requestedStatus:'pending';
    const recipient=String(body.recipient||'').trim(), subject=String(body.subject||'').trim(), message=String(body.message||'').trim();
    if(recipient.length>254||subject.length>200||message.length>4000) return json({error:'Notification fields exceed allowed lengths.'},400);
    const r=await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES(?,?,?,?,?,?,?,?)`).bind(String(body.type||'internal'),channel,recipient,subject,message,String(body.related_type||''),body.related_id?num(body.related_id):null,status).run();
    return json({ok:true,block:16,notification_id:r.meta?.last_row_id,status},201);
  }
  if (path === '/api/notifications/whatsapp' && method === 'POST') {
    const phone=String(body.phone||body.whatsapp||'').replace(/[^0-9]/g,'');
    const message=String(body.message||'').trim();
     if(!phone || phone.length < 8 || phone.length > 20 || !message || message.length > 4000) return json({error:'A valid phone number and message (1-4000 characters) are required'},400);
    const link=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    const r=await env.DB.prepare(`INSERT INTO notifications(type,channel,recipient,subject,message,status) VALUES(?,?,?,?,?,'prepared')`).bind('external','whatsapp',phone,'WhatsApp message',message).run();
    return json({ok:true,block:16,notification_id:r.meta?.last_row_id,whatsapp_url:link,actual_sending:'prepared_only',reason:'Owner approval is required before sending.'},201);
  }
  if (path === '/api/notifications/approve' && method === 'POST') {
    const notificationId=Math.floor(num(body.notification_id));
    if(!notificationId) return json({error:'notification_id is required'},400);
    const result=await env.DB.prepare("UPDATE notifications SET status='approved' WHERE id=? AND status='prepared' AND channel IN ('email','whatsapp') AND NOT (created_at < datetime('now','-1 day') AND (lower(coalesce(subject,'')) LIKE '%test%' OR lower(coalesce(subject,'')) LIKE '%diagnostic%' OR lower(coalesce(subject,'')) LIKE '%verification%' OR lower(coalesce(subject,'')) LIKE '%connection check%' OR lower(coalesce(subject,'')) LIKE '%please ignore%' OR lower(coalesce(message,'')) LIKE '%diagnostic%' OR lower(coalesce(message,'')) LIKE '%please ignore%' OR lower(coalesce(message,'')) LIKE '%connection check%' OR lower(coalesce(message,'')) LIKE '%test%' OR lower(coalesce(message,'')) LIKE '%verification%' OR lower(coalesce(message,'')) LIKE '%test message%'))").bind(notificationId).run();
    if(!result.meta?.changes) return json({error:'Prepared email notification not found or already reviewed.'},409);
    return json({ok:true,notification_id:notificationId,status:'approved',message:'Approved. Sending still requires a separate explicit send action.'});
  }
  if (path === '/api/notifications/whatsapp-send' && method === 'POST') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    return await handleWhatsAppSend(request, env, body, getSession, ensureWhatsAppStatusTable);
  }
  // BLOCK 17: Final dashboard summary
  if (path === '/api/dashboard' && method === 'GET') {
    const one=async(sql)=>{const r=await env.DB.prepare(sql).first();return r||{n:0};};
    const [products,sellers,buyers,reqs,matches,opps,pending,approved,quotes,orders,purchases,deliveries,notes]=await Promise.all([
      one(`SELECT COUNT(*) n FROM products`),one(`SELECT COUNT(*) n FROM sellers`),one(`SELECT COUNT(*) n FROM buyers`),one(`SELECT COUNT(*) n FROM buyer_requirements WHERE status='active'`),one(`SELECT COUNT(*) n FROM buyer_matches`),one(`SELECT COUNT(*) n FROM opportunities`),one(`SELECT COUNT(*) n FROM opportunities WHERE approval_status='pending'`),one(`SELECT COUNT(*) n FROM opportunities WHERE approval_status='approved'`),one(`SELECT COUNT(*) n FROM quotations`),one(`SELECT COUNT(*) n FROM orders`),one(`SELECT COUNT(*) n FROM purchase_tracking`),one(`SELECT COUNT(*) n FROM delivery_tracking`),one(`SELECT COUNT(*) n FROM notifications WHERE status='pending'`)
    ]);
    const recent=await env.DB.prepare(`SELECT o.id,o.status,o.approval_status,o.expected_margin_pct,p.title AS product_title,s.name AS seller_name,o.updated_at FROM opportunities o LEFT JOIN products p ON p.id=o.product_id LEFT JOIN sellers s ON s.id=o.seller_id ORDER BY o.id DESC LIMIT 20`).all();
    const settingRows=await env.DB.prepare(`SELECT key,value FROM settings WHERE key IN ('catalog_sync_last_status','catalog_sync_last_run_at','catalog_sync_last_saved','catalog_sync_last_failed','catalog_sync_last_cycle_failed','catalog_sync_last_error','catalog_sync_cursor','ai_screening_last_status','ai_screening_last_run_at','buyer_discovery_last_status','buyer_discovery_last_run_at','prospect_discovery_last_status','phase2_last_status','phase2_last_run_at')`).all();
    const statusSettings=Object.fromEntries((settingRows.results||[]).map(x=>[x.key,x.value]));
    const parseRun=(raw,ranAt)=>{if(!raw)return {status:'not_run',ran_at:ranAt||null};try{const x=JSON.parse(raw);return {status:String(x.status||(x.ok===false?'failed':'recorded')).slice(0,40),ran_at:x.ran_at||ranAt||null,results_seen:Number(x.results_seen||x.seen||0),saved_or_refreshed:Number(x.saved_or_refreshed||x.saved||0),last_error:String(x.last_error||x.error||'').slice(0,180)||null};}catch(_){return {status:String(raw).slice(0,40),ran_at:ranAt||null};}};
    return json({ok:true,block:17,summary:{products:products.n,sellers:sellers.n,buyers:buyers.n,active_requirements:reqs.n,buyer_matches:matches.n,opportunities:opps.n,pending_approval:pending.n,approved_opportunities:approved.n,quotations:quotes.n,orders:orders.n,purchases:purchases.n,deliveries:deliveries.n,pending_notifications:notes.n},engine_monitor:{catalog_sync:{status:statusSettings.catalog_sync_last_status||'not_run',ran_at:statusSettings.catalog_sync_last_run_at||null,cursor:Number(statusSettings.catalog_sync_cursor||0),last_saved:Number(statusSettings.catalog_sync_last_saved||0),last_failed:Number(statusSettings.catalog_sync_last_failed||0),cycle_failed:Number(statusSettings.catalog_sync_last_cycle_failed||0),last_error:String(statusSettings.catalog_sync_last_error||'').slice(0,180)||null},ai_screening:parseRun(statusSettings.ai_screening_last_status,statusSettings.ai_screening_last_run_at),buyer_discovery:parseRun(statusSettings.buyer_discovery_last_status,statusSettings.buyer_discovery_last_run_at),market_discovery:parseRun(statusSettings.prospect_discovery_last_status,null),phase2:parseRun(statusSettings.phase2_last_status,statusSettings.phase2_last_run_at),business_readiness:{buyers:Number(buyers.n||0),active_requirements:Number(reqs.n||0),sellers:Number(sellers.n||0),opportunities:Number(opps.n||0),note:'Counts are real database records; no synthetic opportunities are created.'}},recent_opportunities:recent.results||[]});
  }

  return null;
}


async function runScheduledCatalogSync(env) {
  const settings = await getSettings(env.DB);
  if (!settingBool(settings, "catalog_sync_enabled", true)) {
    return { ok: true, skipped: true, reason: "catalog_sync_disabled" };
  }
  const startedAt = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','running') ON CONFLICT(key) DO UPDATE SET value='running'"),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_started_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(startedAt)
  ]);

  // Scheduled invocations must stay below the Workers subrequest budget; manual sync already caps at 10.
  const batchSize = Math.max(1, Math.min(10, Math.floor(settingNum(settings, "catalog_sync_batch_size", 10))));
  let cursor = Math.max(0, Math.floor(settingNum(settings, "catalog_sync_cursor", 0)));
  let handles = null;
  let cachedHandles = null;
  let discoveryWarning = "";
  if (settings.catalog_sync_handles_cache) {
    try {
      const cached = JSON.parse(settings.catalog_sync_handles_cache);
      if (Array.isArray(cached) && cached.length > 0 && cached.every(x => typeof x === "string")) cachedHandles = cached;
    } catch (_) {}
  }
  try {
    handles = await discoverSourceHandles();
    if (handles.length > 0) {
      await env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_handles_cache',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(JSON.stringify(handles)).run();
    }
  } catch (e) {
    const now = new Date().toISOString();
    const message = String(e?.message || e).slice(0, 1000);
    if (cachedHandles) {
      handles = cachedHandles;
      discoveryWarning = "Source listing refresh failed (" + message + "); using the last successful handle snapshot. New source products will be discovered when the listing endpoint recovers.";
    } else {
      await Promise.all([
        env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','failed') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(),
        env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(now).run(),
        env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(message).run()
      ]);
      return { ok: false, status: "failed", error: message, ran_at: now };
    }
  }

  if (!handles.length) {
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','empty_source') ON CONFLICT(key) DO UPDATE SET value='empty_source'").run();
    return { ok: true, skipped: true, reason: "empty_source" };
  }

  if (cursor >= handles.length) cursor = 0;
  const previousCycleFailures = cursor === 0 ? 0 : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_cycle_failed", 0)));
  const result = await syncSource(env.DB, cursor, batchSize, handles);
  const cycleFailed = previousCycleFailures + result.failed;
  const nextCursor = result.complete ? 0 : result.next_start;
  const now = new Date().toISOString();
  const cycleStatus = result.complete ? (cycleFailed === 0 && !discoveryWarning ? "complete" : "partial") : "partial";
  const lastError = result.failed_handles.length ? result.failed_handles.map(x => x.handle + ": " + x.error).join(" | ").slice(0, 1000) : discoveryWarning;

  await d1BatchWithRetry(env.DB, [
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(nextCursor)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(now),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_saved',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.saved)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.failed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(lastError),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? 0 : cycleFailed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? cycleFailed : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_last_cycle_failed", 0))))),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(cycleStatus)
  ], "catalog sync progress persistence");

  return { ok: result.failed === 0 && !discoveryWarning, cursor, next_cursor: nextCursor, ...result, cycle_failed: cycleFailed, status: cycleStatus, ran_at: now, source_discovery_warning: discoveryWarning || null };
}

async function runManualCatalogSyncBatch(env, start, batchSize = 10) {
  const settings = await getSettings(env.DB);
  if (!settingBool(settings, "catalog_sync_enabled", true)) {
    return { ok: false, error: "Catalog sync is disabled." };
  }
  let handles = null;
  let discoveryWarning = "";
  let cachedHandles = null;
  // Preserve the last successful handle snapshot if a fresh source listing is rate-limited.
  if (settings.catalog_sync_handles_cache) {
    try {
      const cached = JSON.parse(settings.catalog_sync_handles_cache);
      if (Array.isArray(cached) && cached.length > 0 && cached.every(x => typeof x === "string")) cachedHandles = cached;
    } catch (_) {}
  }
  // Reuse the snapshot between batches in a manual cycle.
  if (start > 0 && cachedHandles) handles = cachedHandles;
  try {
    if (!handles) {
      handles = await discoverSourceHandles();
      await env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_handles_cache',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
        .bind(JSON.stringify(handles)).run();
    }
  } catch (e) {
    const message = String(e?.message || e).slice(0, 1000);
    if (cachedHandles) {
      handles = cachedHandles;
      discoveryWarning = "Source listing refresh failed (" + message + "); using the last successful handle snapshot.";
    } else {
      // If this is the first cached cycle, seed handles from the existing PakThai catalog so current items can still refresh.
      const existingRows = await env.DB.prepare("SELECT handle FROM products WHERE handle IS NOT NULL AND handle != '' ORDER BY id").all();
      handles = [...new Set((existingRows.results || []).map(row => String(row.handle || '').trim()).filter(Boolean))];
      if (handles.length) {
        discoveryWarning = "Source listing refresh failed (" + message + "); using handles from the existing PakThai catalog. New source products will be discovered when the listing endpoint recovers.";
        await env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_handles_cache',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
          .bind(JSON.stringify(handles)).run();
      } else {
        const now = new Date().toISOString();
        await Promise.all([
          env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status','failed') ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(),
          env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(now).run(),
          env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(message).run()
        ]);
        return { ok: false, error: message, status: "failed" };
      }
    }
  }
  if (!handles.length) return { ok: false, error: "Source catalog is empty.", status: "empty_source" };
  if (start >= handles.length) start = 0;
  const previousCycleFailures = start === 0 ? 0 : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_cycle_failed", 0)));
  const safeBatchSize = Math.max(1, Math.min(10, Math.floor(Number(batchSize) || 10)));
  const result = await syncSource(env.DB, start, safeBatchSize, handles);
  const cycleFailed = previousCycleFailures + result.failed;
  const nextCursor = result.complete ? 0 : result.next_start;
  const now = new Date().toISOString();
  const status = result.complete ? (cycleFailed === 0 && !discoveryWarning ? "complete" : "partial") : "partial";
  const lastError = result.failed_handles.length ? result.failed_handles.map(x => x.handle + ": " + x.error).join(" | ").slice(0, 1000) : discoveryWarning;
  await env.DB.batch([
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cursor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(nextCursor)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_run_at',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(now),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_saved',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.saved)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.failed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_error',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(lastError),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? 0 : cycleFailed)),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_cycle_failed',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String(result.complete ? cycleFailed : Math.max(0, Math.floor(settingNum(settings, "catalog_sync_last_cycle_failed", 0))))),
    env.DB.prepare("INSERT INTO settings(key,value) VALUES('catalog_sync_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(status)
  ]);
  return { ...result, ok: result.failed === 0, cursor: start, next_cursor: nextCursor, cycle_failed: cycleFailed, status, ran_at: now, source_discovery_warning: discoveryWarning || null };
}
async function runScheduledProspectDiscovery(env) {
  await initDb(env.DB);
  const settings = await getSettings(env.DB);
  const now = new Date().toISOString();
  if (masterMode(settings) !== "on" || !settingBool(settings, "auto_search_enabled", true)) {
    const paused = { ok:true, paused:true, reason: masterMode(settings) !== "on" ? "Master AI is OFF." : "Auto Search is OFF.", ran_at:now };
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("prospect_discovery_last_status",JSON.stringify(paused)).run();
    return paused;
  }
  const jobs = [
    { key:"pakistan_buyers", run:() => runScheduledBuyerDiscovery(env.DB) },
    { key:"thailand_sellers", run:() => runScheduledSellerDiscovery(env.DB) },
    { key:"korea_sellers", run:() => runKoreaSellerDiscovery(env.DB, { scheduled:true }) },
    { key:"thailand_buyers", run:() => runMarketBuyerDiscovery(env.DB, "Thailand") },
    { key:"korea_buyers", run:() => runMarketBuyerDiscovery(env.DB, "South Korea") }
  ];
  const cursorRow = await env.DB.prepare("SELECT value FROM settings WHERE key=?").bind("prospect_discovery_cursor").first();
  const cursor = Math.max(0, Math.floor(Number(cursorRow?.value || 0))) % jobs.length;
  const job = jobs[cursor];
  try {
    const discovery = await job.run();
    const screening = discovery?.ok !== false && env.AI?.run ? await runAIProspectScreening(env) : null;
    const result = { ok:discovery?.ok !== false && (!screening || screening.ok), paused:false, job:job.key, cursor, next_cursor:(cursor+1)%jobs.length, discovery:discovery||null, screening:screening||null, ran_at:new Date().toISOString() };
    await env.DB.batch([
      env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("prospect_discovery_cursor",String((cursor+1)%jobs.length)),
      env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("prospect_discovery_last_status",JSON.stringify(result))
    ]);
    return result;
  } catch (error) {
    const result = { ok:false, paused:false, job:job.key, cursor, error:String(error?.message||error).slice(0,250), ran_at:new Date().toISOString() };
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("prospect_discovery_last_status",JSON.stringify(result)).run();
    await env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("prospect_discovery_cursor",String((cursor+1)%jobs.length)).run();
    return result;
  }
}
async function runScheduledPhase2(env) {
  await initDb(env.DB);
  const settings = await getSettings(env.DB);

  if (masterMode(settings) !== "on") {
    return { ok: true, paused: true, reason: `Master AI is ${masterMode(settings)}.` };
  }

  // Respect dashboard switches; no background job may override an OFF control.
  let buyerMatchResult = { ok:true, paused:true, reason:"Auto Search is OFF." };
  if (settingBool(settings,"auto_search_enabled",true)) {
    const buyerMatchRequest = new Request("https://internal/api/buyer-match/run", {
      method: "POST", headers: { "content-type": "application/json" }, body: "{}"
    });
    const buyerMatchResponse = await handleMasterBuyerApi(buyerMatchRequest, env);
    buyerMatchResult = await buyerMatchResponse.json().catch(() => ({}));
  }

  const sellerMatchResult = settingBool(settings,"seller_matching_enabled",true)
    ? await runProductSellerMatching(env.DB, {
        only_unmatched: true, apply: true, limit: 100,
        thb_to_pkr: Number(settings.thb_to_pkr || 0),
        krw_to_pkr: Number(settings.krw_to_pkr || 0),
        target_margin_pct: Number(settings.default_margin_pct || 25)
      })
    : { ok:true, paused:true, reason:"Seller Matching is OFF.", matched:0 };

  const matchedRows = settingBool(settings,"opportunity_creation_enabled",true)
    ? ((await env.DB.prepare(`
        SELECT bm.id FROM buyer_matches bm
        WHERE bm.seller_id IS NOT NULL AND bm.match_status = 'seller_matched'
          AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.notes LIKE '%Block 9 buyer_match_id:' || bm.id || '%')
        ORDER BY bm.id ASC LIMIT 100
      `).all()).results || [])
    : [];

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

async function handleBrowserPush(request, env, authorization) {
  if (authorization?.session?.role !== 'owner') return json({ok:false,error:'Owner access is required.'},403);
  if (!env.DB) return json({ok:false,error:'Database is unavailable.'},503);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS browser_push_subscriptions (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, owner_label TEXT NOT NULL DEFAULT 'Owner', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_status TEXT NOT NULL DEFAULT 'subscribed', last_error TEXT)`).run();
  const path=new URL(request.url).pathname;
  const publicKey=String(env.VAPID_PUBLIC_KEY||'');
  const privateKey=String(env.VAPID_PRIVATE_KEY||'');
  const configured=Boolean(publicKey&&privateKey&&env.VAPID_SUBJECT);
  if(path==='/api/browser-push/config'&&request.method==='GET'){const c=await env.DB.prepare("SELECT COUNT(*) AS n FROM browser_push_subscriptions WHERE last_status IN ('subscribed','accepted')").first();return json({ok:true,configured,public_key:configured?publicKey:'',subscriptions_count:Number(c?.n||0),owner_approval_required:true});}
  if(path==='/api/browser-push/subscribe'&&request.method==='POST'){if(!configured)return json({ok:false,error:'Server push keys are not configured.'},503);const sub=await request.json().catch(()=>null);const endpoint=String(sub?.endpoint||'');const p256dh=String(sub?.keys?.p256dh||'');const auth=String(sub?.keys?.auth||'');if(!endpoint.startsWith('https://')||endpoint.length>2048||!p256dh||p256dh.length>256||!auth||auth.length>256)return json({ok:false,error:'Invalid browser push subscription.'},400);await env.DB.prepare("INSERT INTO browser_push_subscriptions(endpoint,p256dh,auth,owner_label,last_status,last_error,updated_at) VALUES(?,?,?,'Owner','subscribed',NULL,CURRENT_TIMESTAMP) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth,last_status='subscribed',last_error=NULL,updated_at=CURRENT_TIMESTAMP").bind(endpoint,p256dh,auth).run();return json({ok:true,saved:true});}
  if(path==='/api/browser-push/test'&&request.method==='POST'){if(!configured)return json({ok:false,error:'Server push keys are not configured.'},503);const b=await request.json().catch(()=>({}));if(b.owner_confirmed!==true)return json({ok:false,error:'Explicit Owner confirmation is required.'},400);const rows=await env.DB.prepare("SELECT id,endpoint,p256dh,auth FROM browser_push_subscriptions WHERE last_status IN ('subscribed','accepted') ORDER BY id DESC LIMIT 10").all();let sent=0,failed=0;const errors=[];for(const row of rows.results||[]){try{const subscription={endpoint:row.endpoint,expirationTime:null,keys:{p256dh:row.p256dh,auth:row.auth}};const payload=await buildPushPayload({data:JSON.stringify({title:'PAKTHAI TECH â€” Push Test',body:'Owner browser push setup test succeeded. No partner or customer was contacted.'}),options:{ttl:60}},subscription,{subject:String(env.VAPID_SUBJECT),publicKey,privateKey});const res=await fetch(row.endpoint,payload);if(res.status===201||res.status===202){sent++;await env.DB.prepare("UPDATE browser_push_subscriptions SET last_status='accepted',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(row.id).run();}else{failed++;const err='Push service HTTP '+res.status;if(res.status===404||res.status===410)await env.DB.prepare("UPDATE browser_push_subscriptions SET last_status='expired',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(err,row.id).run();else await env.DB.prepare("UPDATE browser_push_subscriptions SET last_status='failed',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(err,row.id).run();errors.push(err);}}catch(e){failed++;const err=String(e?.message||e).slice(0,300);await env.DB.prepare("UPDATE browser_push_subscriptions SET last_status='failed',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(err,row.id).run();errors.push(err);}}return json({ok:sent>0&&failed===0,sent,failed,subscriptions:(rows.results||[]).length,errors:errors.slice(0,3),note:'Push-service acceptance is not proof the notification was displayed.'},sent>0?200:502);}
  if(path==='/api/browser-push/unsubscribe'&&request.method==='POST'){const b=await request.json().catch(()=>({}));const endpoint=String(b.endpoint||'');if(!endpoint.startsWith('https://'))return json({ok:false,error:'Invalid endpoint.'},400);await env.DB.prepare('DELETE FROM browser_push_subscriptions WHERE endpoint=?').bind(endpoint).run();return json({ok:true,removed:true});}
  return json({ok:false,error:'Not found.'},404);
}

export default {
  async scheduled(event, env, ctx) {
    // Keep the existing three free-plan cron triggers. Run one real discovery job per hour
    // so all five markets rotate every five hours without parallel public-map bursts.
    const cron = String(event?.cron || "").trim();
    if (cron === "0 * * * *") {
      ctx.waitUntil(runGmailAutoReply(env));
      ctx.waitUntil(runScheduledProspectDiscovery(env));
      ctx.waitUntil(runScheduledPhase2(env));
      return;
    }
    if (cron === "0 4 * * *") {
      ctx.waitUntil(runScheduledOutreach(env));
      return;
    }
    if (cron === "0 2 * * *") {
      ctx.waitUntil(runScheduledCatalogSync(env));
    }
  },

  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      // WhatsApp status webhook is public only for Meta's verification/callback; POST signatures are validated.
      if (request.method === 'GET' && url.pathname === '/sw.js') return new Response(BROWSER_PUSH_SW,{headers:{'content-type':'application/javascript; charset=utf-8','cache-control':'no-cache','service-worker-allowed':'/',...SECURITY_HEADERS}});
      if (url.pathname === '/webhooks/whatsapp') return await handleWhatsAppWebhook(request, env);
      // OAuth start/callback and token-guarded Gmail send must remain usable by their own secure flow.
      if (["/auth/google/start", "/auth/google/callback", "/api/notifications/gmail-send", "/api/notifications/telegram-status", "/api/notifications/telegram-send", "/api/notifications/sms-status", "/api/notifications/sms-test"].includes(url.pathname)) {
        const oauthPublicResponse = await handleGmailOAuth(request, env); if (oauthPublicResponse) return oauthPublicResponse;
        const telegramResponse = await handleTelegramNotifications(request, env); if (telegramResponse) return telegramResponse;
        const smsResponse = await handleTwilioSms(request, env); if (smsResponse) return smsResponse;
      }
      if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
      // Public customer-support chat: bounded input, IP rate limit, read-only catalog lookup; no transcript persistence.
      if (url.pathname === '/api/support/chat') return await handleSupportChat(request, env);
      // Public, read-only Meta Commerce product feed. Uses the same PakThai D1 catalog as the storefront.
      if (request.method === "GET" && url.pathname === "/meta-catalog.xml") {
        try {
          const rows = await env.DB.prepare(`
            SELECT id,handle,title,description,category,price_pkr,available,image_url
            FROM products
            WHERE title IS NOT NULL AND TRIM(title) <> ''
            ORDER BY available DESC, title COLLATE NOCASE ASC
            LIMIT 500
          `).all();
          const xml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
          const items = (rows.results || []).filter(p => Number(p.price_pkr) > 0).map(p => {
            const handle = String(p.handle || "").trim();
            const productSlug = handle || String(p.title || "product").normalize("NFKD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            const productUrl = "https://pakthai-tech-store.pages.dev/products/" + encodeURIComponent(productSlug || String(p.id));
            const description = String(p.description || p.category || p.title || "PAKTHAI TECH product").replace(/<[^>]*>/g, " ").trim();
            const image = String(p.image_url || "").trim();
            return `<item>
              <g:id>${xml(p.id)}</g:id>
              <g:title>${xml(p.title)}</g:title>
              <g:description>${xml(description || p.title)}</g:description>
              <g:availability>${Number(p.available) === 1 ? "in stock" : "out of stock"}</g:availability>
              <g:condition>used</g:condition>
              <g:price>${Number(p.price_pkr).toFixed(2)} PKR</g:price>
              <g:link>${xml(productUrl)}</g:link>
              ${image.startsWith("https://") || image.startsWith("http://") ? `<g:image_link>${xml(image)}</g:image_link>` : ""}
              <g:brand>PAKTHAI TECH</g:brand>
              ${p.category ? `<g:product_type>${xml(p.category)}</g:product_type>` : ""}
            </item>`;
          }).join("\n");
          const body = `<?xml version="1.0" encoding="UTF-8"?>
          <rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
            <channel>
              <title>PAKTHAI TECH Official Catalog</title>
              <link>https://pakthai-tech-store.pages.dev/</link>
              <description>PAKTHAI TECH product catalog in PKR</description>
              ${items}
            </channel>
          </rss>`;
          return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300", ...CORS } });
        } catch (_) {
          return new Response("Catalog feed temporarily unavailable", { status: 503, headers: { "content-type": "text/plain; charset=utf-8", ...CORS } });
        }
      }
      // Public, read-only storefront catalog. Never expose the authenticated sourcing API here.
      if (request.method === "GET" && url.pathname === "/api/catalog") {
        try {
          const rows = await env.DB.prepare(`
            SELECT id,handle,title,category,price_pkr,available,image_url
            FROM products
            WHERE title IS NOT NULL AND TRIM(title) <> ''
            ORDER BY available DESC, title COLLATE NOCASE ASC
            LIMIT 500
          `).all();
          const products = (rows.results || []).map(p => ({
            id: p.id,
            handle: String(p.handle || ""),
            title: String(p.title || "Product"),
            category: String(p.category || "Other"),
            price_pkr: Number(p.price_pkr) || 0,
            available: Number(p.available) === 1,
            image_url: p.image_url ? String(p.image_url) : ""
          }));
          return json({ ok: true, products });
        } catch (_) {
          return json({ ok: false, error: "Catalog temporarily unavailable" }, 503);
        }
      }
      const authResponse = await handleAuthRoute(request, env); if (authResponse) return authResponse;
      const authorization = await authorizeRequest(request, env);
      if (!authorization.allowed) return json({ok:false,error:authorization.error}, authorization.status || 401);
      const oauthResponse = await handleGmailOAuth(request, env); if (oauthResponse) return oauthResponse;
      if (url.pathname.startsWith('/api/browser-push/')) return await handleBrowserPush(request, env, authorization);
      const buyerDiscoveryResponse = await handleBuyerDiscoveryRequest(request, env); if (buyerDiscoveryResponse) return buyerDiscoveryResponse;
      const sellerDiscoveryResponse = await handleSellerDiscoveryRequest(request, env); if (sellerDiscoveryResponse) return sellerDiscoveryResponse;
      const koreaSellerDiscoveryResponse = await handleKoreaSellerDiscoveryRequest(request, env); if (koreaSellerDiscoveryResponse) return koreaSellerDiscoveryResponse;
      const marketDiscoveryResponse = await handleMarketDiscoveryRequest(request, env); if (marketDiscoveryResponse) return marketDiscoveryResponse;
      const marketDealsResponse = await handleMarketDealsRequest(request, env); if (marketDealsResponse) return marketDealsResponse;
      const externalDiscoveryResponse = await handleExternalDiscoveryRequest(request, env); if (externalDiscoveryResponse) return externalDiscoveryResponse;
      const outreachResponse = await handleOutreachRequest(request, env); if (outreachResponse) return outreachResponse;
      if (url.pathname.startsWith('/api/landed-cost/') || url.pathname === '/api/approvals' || url.pathname === '/api/quotations' || url.pathname === '/api/quotations/approve' || url.pathname === '/api/orders' || url.pathname === '/api/purchases' || url.pathname === '/api/deliveries' || url.pathname === '/api/notifications' || url.pathname === '/api/notifications/archive' || url.pathname === '/api/notifications/whatsapp' || url.pathname === '/api/notifications/whatsapp-status' || url.pathname === '/api/notifications/whatsapp-status/remove' || url.pathname === '/api/notifications/whatsapp-inbox' || url.pathname === '/api/notifications/whatsapp-inbox/delete' || url.pathname === '/api/notifications/whatsapp-diagnostics' || url.pathname === '/api/notifications/whatsapp-token-diagnostics' || url.pathname === '/api/notifications/whatsapp-webhook-subscribe' || url.pathname === '/api/notifications/whatsapp-phone-request-code' || url.pathname === '/api/notifications/whatsapp-phone-verify-code' || url.pathname === '/api/notifications/whatsapp-template-test' || url.pathname === '/api/notifications/whatsapp-template-submit' || url.pathname === '/api/notifications/approve' || url.pathname === '/api/notifications/whatsapp-send' || url.pathname === '/api/dashboard' || url.pathname === '/api/controls' || url.pathname === '/api/negotiations' || url.pathname === '/api/negotiations/message' || url.pathname === '/api/negotiations/followups') { const r = await handleFinalBlocks(request, env); if (r) return r; }
      if (url.pathname === '/api/settings' && request.method === 'POST') { const r = await handleFinalBlocks(request, env); if (r) return r; }
      if (url.pathname.startsWith('/api/sourcing/')) return await handleSellerOfferAutoSourcing(request, env);
        if (url.pathname.startsWith("/api/product-seller-match")) return await handleProductSellerMatching(request, env);
if (url.pathname.startsWith("/api/opportunity-from-seller-match")) return await handleBlock9Opportunity(request, env);
        if (url.pathname.startsWith("/api/buyers") || url.pathname.startsWith("/api/buyer-requirements") || url.pathname.startsWith("/api/buyer-matches") || url.pathname.startsWith("/api/buyer-match/")) return await handleMasterBuyerApi(request, env);
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env);

  // BLOCK6_CUSTOMER_REQUEST_ROUTE
  if (url.pathname === "/customer-request") {
    return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PakThai Tech - Customer Request</title><style>body{font-family:Arial,sans-serif;max-width:760px;margin:40px auto;padding:20px}input,textarea,button{width:100%;padding:12px;margin:6px 0 14px;box-sizing:border-box}button{cursor:pointer;font-weight:700}.ok{padding:12px;background:#e9f7ef}.err{padding:12px;background:#fdecec}</style></head><body><h1>PAKTHAI TECH</h1><h2>Order / Request Quote</h2><form id="f"><input name="website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden"><input name="customer_name" placeholder="Your name" required><input name="phone" placeholder="Phone"><input name="whatsapp" placeholder="WhatsApp"><input name="email" placeholder="Email"><input name="city" placeholder="City" required><textarea name="delivery_address" placeholder="Delivery address"></textarea><input name="product_title" placeholder="Product / requirement" required><input name="quantity" type="number" min="1" value="1" required><input name="requested_price_pkr" type="number" min="0" placeholder="Target price PKR"><input name="max_budget_pkr" type="number" min="0" placeholder="Maximum budget PKR"><textarea name="customer_note" placeholder="Additional requirement"></textarea><button>Submit Request</button></form><div id="m"></div><script>document.getElementById("f").addEventListener("submit",async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const r=await fetch("/api/customer-requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(d)});const j=await r.json();document.getElementById("m").className=r.ok?"ok":"err";document.getElementById("m").textContent=j.message||j.error||"Done";if(r.ok)e.target.reset();});</script></body></html>`,{headers:{"content-type":"text/html;charset=UTF-8",...SECURITY_HEADERS,"Content-Security-Policy":"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://pakthai-ai-sourcing.pakthaitech.workers.dev https://pakthai-tech-store.pages.dev; font-src 'self' data: https:"}});
  }

      return new Response(HTML, { headers: {
        "content-type": "text/html; charset=utf-8",
        ...SECURITY_HEADERS,
        "Content-Security-Policy": "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://pakthai-ai-sourcing.pakthaitech.workers.dev https://pakthai-tech-store.pages.dev; font-src 'self' data: https:; frame-src https://go.crisp.chat https://client.crisp.chat"
      } });
    } catch (e) {
      return json({ error: e?.message || String(e) }, 500);
    }
  }
};

