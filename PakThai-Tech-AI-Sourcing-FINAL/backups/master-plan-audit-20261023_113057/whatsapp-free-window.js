const GRAPH_VERSION = "v26.0";
const FREE_SERVICE_MONTHLY_LIMIT = 1000;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const digits = value => String(value || "").replace(/\D/g, "").slice(0, 20);

export async function ensureWhatsAppFreeWindowTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_message_status (
    message_id TEXT PRIMARY KEY, recipient TEXT, status TEXT NOT NULL DEFAULT 'accepted',
    status_timestamp TEXT, error_code TEXT, error_title TEXT, error_message TEXT,
    notification_id INTEGER, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_partner_optins (
    phone TEXT PRIMARY KEY,
    partner_id INTEGER NOT NULL,
    partner_name TEXT NOT NULL DEFAULT '',
    opted_in_at TEXT NOT NULL,
    last_inbound_at TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_free_service_usage (
    month_key TEXT PRIMARY KEY,
    reserved_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_start_requests (
    phone TEXT PRIMARY KEY,
    last_acknowledged_at TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function reserveFreeMessage(db) {
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const result = await db.prepare(`INSERT INTO whatsapp_free_service_usage(month_key,reserved_count)
    VALUES(?,1) ON CONFLICT(month_key) DO UPDATE SET
    reserved_count=reserved_count+1,updated_at=CURRENT_TIMESTAMP
    WHERE reserved_count < ?`).bind(month, FREE_SERVICE_MONTHLY_LIMIT).run();
  return Number(result.meta?.changes || 0) > 0;
}

async function releaseReservedMessage(db) {
  const month = new Date().toISOString().slice(0, 7);
  await db.prepare(`UPDATE whatsapp_free_service_usage SET reserved_count=MAX(0,reserved_count-1),updated_at=CURRENT_TIMESTAMP WHERE month_key=?`).bind(month).run();
}

async function sendFreeServiceMessage(env, recipient, body) {
  const phone = digits(recipient);
  const token = String(env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneId = String(env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const wabaId = String(env.WHATSAPP_WABA_ID || "").trim();
  const version = String(env.WHATSAPP_GRAPH_API_VERSION || GRAPH_VERSION).trim();
  if (phone.length < 8 || !token || !phoneId || !wabaId) return { ok: false, error: "WhatsApp Cloud API credentials or recipient are missing." };
  let phoneCheck, wabaPhones;
  try {
    const getMeta = async path => {
      const response = await fetch(`https://graph.facebook.com/${version}/${path}`, { headers: { Authorization: "Bearer " + token } });
      return { ok: response.ok, data: await response.json().catch(() => ({})) };
    };
    [phoneCheck, wabaPhones] = await Promise.all([
      getMeta(`${encodeURIComponent(phoneId)}?fields=id,display_phone_number,code_verification_status,status,platform_type`),
      getMeta(`${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number&limit=100`)
    ]);
  } catch (error) {
    return { ok: false, error: "Could not verify the live WhatsApp sender; no message was sent. " + String(error?.message || error).slice(0, 160) };
  }
  const sourcePhone = phoneCheck?.data || {};
  const sourceDigits = digits(sourcePhone.display_phone_number);
  const linked = (wabaPhones?.data?.data || []).some(item => String(item.id) === phoneId && digits(item.display_phone_number) === sourceDigits);
  if (!phoneCheck?.ok || !wabaPhones?.ok || !linked || sourceDigits !== "923007982289" || sourcePhone.platform_type !== "CLOUD_API" || String(sourcePhone.code_verification_status || "").toUpperCase() !== "VERIFIED" || String(sourcePhone.status || "").toUpperCase() !== "CONNECTED") {
    return { ok: false, error: "Safety stop: the configured sender is not verified as the connected PakThai Tech production Cloud API number. No message was sent." };
  }
  if (!(await reserveFreeMessage(env.DB))) return { ok: false, limit_reached: true, error: "The free WhatsApp service-message allowance of 1,000 for this business number this month is used or reserved. No paid message was attempted." };
  let response;
  try {
    response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneId)}/messages`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: phone, type: "text", text: { preview_url: false, body: String(body || "").slice(0, 4000) } })
    });
  } catch (error) {
    // Keep the reservation when the outcome is unknown to prevent a retry from exceeding the free cap.
    return { ok: false, unconfirmed: true, error: "WhatsApp send outcome is unknown; its free allowance slot remains reserved. " + String(error?.message || error).slice(0, 160) };
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    await releaseReservedMessage(env.DB);
    return { ok: false, error: data?.error?.message || `WhatsApp API rejected the service reply (HTTP ${response.status}).`, code: data?.error?.code || null };
  }
  const messageId = data?.messages?.[0]?.id || null;
  if (messageId) {
    await env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_message_status(message_id,recipient,status,status_timestamp,updated_at)
      VALUES(?,?,'sent',?,CURRENT_TIMESTAMP)`).bind(String(messageId), phone, String(Math.floor(Date.now() / 1000))).run();
  }
  return { ok: true, message_id: messageId };
}

async function findActivePartner(db, phone) {
  const rows = await db.prepare("SELECT id,name,contact FROM sourcing_partners WHERE active=1 AND contact IS NOT NULL").all();
  return (rows.results || []).find(partner => digits(partner.contact) === phone) || null;
}

export async function sendQueuedPartnerLeadInFreeWindow(env, notificationId) {
  await ensureWhatsAppFreeWindowTables(env.DB);
  const id = Math.floor(Number(notificationId) || 0);
  if (!id) return { sent: false, reason: "notification_id_missing" };
  const item = await env.DB.prepare(`SELECT id,type,channel,recipient,message,related_type,related_id,status
    FROM notifications WHERE id=? LIMIT 1`).bind(id).first();
  if (!item || item.channel !== "whatsapp" || item.type !== "external" || item.related_type !== "partner_lead" || !item.related_id || item.status !== "prepared") {
    return { sent: false, reason: "not_an_eligible_prepared_partner_lead" };
  }
  const phone = digits(item.recipient);
  const optin = await env.DB.prepare(`SELECT o.last_inbound_at,o.active,p.id AS current_partner_id,p.name AS current_partner_name
    FROM whatsapp_partner_optins o JOIN sourcing_partners p ON p.id=o.partner_id
    WHERE o.phone=? AND o.active=1 AND p.active=1 LIMIT 1`).bind(phone).first();
  if (!optin || digits(phone) !== phone || Date.now() - Date.parse(String(optin.last_inbound_at || "")) > WINDOW_MS) return { sent: false, reason: "partner_has_no_open_24_hour_service_window" };

  const claimed = await env.DB.prepare("UPDATE notifications SET status='sending' WHERE id=? AND status='prepared'").bind(id).run();
  if (!claimed.meta?.changes) return { sent: false, reason: "notification_already_claimed" };
  const result = await sendFreeServiceMessage(env, phone, item.message);
  if (!result.ok) {
    await env.DB.prepare("UPDATE notifications SET status=? WHERE id=? AND status='sending'").bind(result.unconfirmed ? "unconfirmed" : "prepared", id).run();
    return { sent: false, ...result };
  }
  await env.DB.prepare("UPDATE notifications SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=? AND status='sending'").bind(id).run();
  if (result.message_id) {
    await env.DB.prepare("UPDATE whatsapp_message_status SET notification_id=? WHERE message_id=?").bind(id, result.message_id).run();
  }
  return { sent: true, message_id: result.message_id };
}

export async function handleWhatsAppPartnerInbound(env, { phone: rawPhone, message: rawMessage, timestamp }) {
  const phone = digits(rawPhone);
  const message = String(rawMessage || "").trim();
  if (phone.length < 8 || !message) return { handled: false };
  const inboundTime = Date.parse(String(timestamp || ""));
  if (!Number.isFinite(inboundTime) || inboundTime > Date.now() + 60_000) return { handled: false, reason: "invalid_inbound_timestamp" };
  if (Date.now() - inboundTime > WINDOW_MS) return { handled: false, reason: "inbound_message_outside_free_service_window" };
  await ensureWhatsAppFreeWindowTables(env.DB);
  const command = message.toUpperCase().replace(/\s+/g, " ");
  if (["STOP", "UNSUBSCRIBE", "CANCEL", "PAUSE"].includes(command)) {
    await env.DB.prepare("UPDATE whatsapp_partner_optins SET active=0,updated_at=CURRENT_TIMESTAMP WHERE phone=?").bind(phone).run();
    return { handled: true, opted_out: true };
  }
  const partner = await findActivePartner(env.DB, phone);
  if (!partner) {
    if (command !== "START") return { handled: false, reason: "sender_not_an_active_sourcing_partner" };
    const previous = await env.DB.prepare("SELECT last_acknowledged_at FROM whatsapp_start_requests WHERE phone=? LIMIT 1").bind(phone).first();
    const lastAck = Date.parse(String(previous?.last_acknowledged_at || ""));
    if (!previous || !Number.isFinite(lastAck) || Date.now() - lastAck > WINDOW_MS) {
      const response = await sendFreeServiceMessage(env, phone, "PakThai Tech auto-reply is online. This number is not currently listed as an active sourcing partner, so no customer or lead details will be sent. Ask the Owner to add and approve this partner number first.");
      if (response.ok || response.unconfirmed) {
        const ackAt = new Date().toISOString();
        await env.DB.prepare(`INSERT INTO whatsapp_start_requests(phone,last_acknowledged_at,updated_at) VALUES(?,?,CURRENT_TIMESTAMP)
          ON CONFLICT(phone) DO UPDATE SET last_acknowledged_at=excluded.last_acknowledged_at,updated_at=CURRENT_TIMESTAMP`).bind(phone, ackAt).run();
      }
      return { handled: true, test_acknowledged: response.ok, test_ack_error: response.ok ? null : response.error, reason: "sender_not_an_active_sourcing_partner" };
    }
    return { handled: true, test_acknowledged: false, reason: "test_ack_rate_limited" };
  }

  const now = new Date(inboundTime).toISOString();
  const prior = await env.DB.prepare("SELECT opted_in_at,last_inbound_at,active FROM whatsapp_partner_optins WHERE phone=? LIMIT 1").bind(phone).first();
  const previousInboundAt = Date.parse(String(prior?.last_inbound_at || ""));
  if (command === "START") {
    await env.DB.prepare(`INSERT INTO whatsapp_partner_optins(phone,partner_id,partner_name,opted_in_at,last_inbound_at,active,updated_at)
      VALUES(?,?,?,?,?,1,CURRENT_TIMESTAMP) ON CONFLICT(phone) DO UPDATE SET partner_id=excluded.partner_id,
      partner_name=excluded.partner_name,last_inbound_at=excluded.last_inbound_at,active=1,updated_at=CURRENT_TIMESTAMP`)
      .bind(phone, partner.id, String(partner.name || "").slice(0, 120), now, now).run();
  } else if (Number(prior?.active) === 1) {
    await env.DB.prepare("UPDATE whatsapp_partner_optins SET last_inbound_at=?,updated_at=CURRENT_TIMESTAMP WHERE phone=? AND active=1")
      .bind(now, phone).run();
  } else {
    return { handled: false, reason: "partner_must_send_START_to_opt_in" };
  }

  const sendAcknowledgement = command === "START" && (!prior || Number(prior.active) !== 1 || !Number.isFinite(previousInboundAt) || Date.now() - previousInboundAt > 60_000);
  let acknowledgement = null;
  if (sendAcknowledgement) {
    acknowledgement = await sendFreeServiceMessage(env, phone,
      "PakThai Tech partner alerts are active. New assigned buyer leads can arrive automatically while this 24-hour WhatsApp service window is open. Monthly free service-message cap: 1,000 per business number. Send START again to reopen after the window expires; send STOP to opt out.");
  }

  const waiting = await env.DB.prepare(`SELECT id FROM notifications WHERE type='external' AND channel='whatsapp'
    AND related_type='partner_lead' AND lower(recipient)=lower(?) AND status='prepared'
    AND created_at >= datetime('now','-24 hours') ORDER BY id LIMIT 10`).bind(phone).all();
  const dispatched = [];
  for (const row of waiting.results || []) dispatched.push(await sendQueuedPartnerLeadInFreeWindow(env, row.id));
  return { handled: true, opted_in: true, acknowledged: acknowledgement?.ok || false, acknowledgement_error: acknowledgement && !acknowledgement.ok ? acknowledgement.error : null, dispatched };
}
