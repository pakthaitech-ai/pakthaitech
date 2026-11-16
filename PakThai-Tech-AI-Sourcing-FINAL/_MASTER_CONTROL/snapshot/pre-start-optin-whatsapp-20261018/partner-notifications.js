// Provider-neutral partner lead notification queue.
// WhatsApp is preferred when the partner has a usable number; it opens as a free manual draft.
// Email is the fallback when no usable WhatsApp number is saved.
// Nothing is sent automatically: external contact remains Owner-approved.
const clean = (value, max = 500) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

function validEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export function buildPartnerLeadMessage(requestId, lead) {
  const lines = [
    "PAKTHAI TECH — New buyer lead for partner review",
    "",
    "Lead reference: #" + requestId,
    "Customer: " + (clean(lead.customer_name, 100) || "Not provided"),
    "Product / requirement: " + (clean(lead.product_title, 200) || "Not specified"),
    "Quantity: " + Math.max(1, Math.floor(Number(lead.quantity) || 1)),
    "Destination city: " + (clean(lead.city, 100) || "Not provided"),
    "Country: " + (clean(lead.country_code, 2) || "Not provided"),
    "Budget (PKR): " + (Number(lead.max_budget_pkr) > 0 ? Number(lead.max_budget_pkr).toLocaleString("en-US") : "Not provided"),
    "Target price (PKR): " + (Number(lead.requested_price_pkr) > 0 ? Number(lead.requested_price_pkr).toLocaleString("en-US") : "Not provided"),
    "Customer contact: " + [clean(lead.phone, 40), clean(lead.whatsapp, 40), clean(lead.email, 254)].filter(Boolean).join(" | "),
    "Additional note: " + (clean(lead.customer_note, 500) || "None"),
    "",
    "Please review and reply with sourcing availability and the best contact/next step. Do not promise stock, pricing, delivery, or an order until PakThai Tech confirms.",
    "",
    "PAKTHAI TECH"
  ];
  return lines.join("\n").slice(0, 3800);
}

export async function queuePartnerLeadNotification(db, { partner, requestId, lead }) {
  if (!partner || !requestId) return { queued: false, reason: "partner_or_request_missing" };
  const email = validEmail(partner.email);
  const phone = String(partner.contact || "").replace(/[^0-9]/g, "").slice(0, 20);
  const message = buildPartnerLeadMessage(requestId, lead);
  let channel = "";
  let recipient = "";
  let subject = "";
  if (phone.length >= 8) {
    channel = "whatsapp";
    recipient = phone;
    subject = "PAKTHAI TECH buyer lead #" + requestId + " — manual WhatsApp draft";
  } else if (email) {
    channel = "email";
    recipient = email;
    subject = "PAKTHAI TECH buyer lead #" + requestId + " — partner review";
  } else {
    await db.prepare("INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES('internal','dashboard','Owner',?,?, 'partner_lead',?,'pending')")
      .bind("Partner contact missing", "Customer request #" + requestId + " is assigned to " + clean(partner.name, 100) + ", but no usable email or phone is saved. Add/verify partner contact before external delivery.", requestId)
      .run();
    return { queued: false, reason: "partner_contact_missing" };
  }
  const result = await db.prepare("INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES('external',?,?,?,?,? ,?,'prepared')")
    .bind(channel, recipient, subject, message, "partner_lead", requestId).run();
  return { queued: Boolean(result.meta?.last_row_id), notification_id: result.meta?.last_row_id || null, channel, status: "prepared" };
}
