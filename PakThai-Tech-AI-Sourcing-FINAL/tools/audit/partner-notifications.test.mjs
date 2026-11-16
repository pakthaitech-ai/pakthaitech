import assert from "node:assert/strict";
import test from "node:test";
import { buildPartnerLeadMessage, queuePartnerLeadNotification } from "../../src/partner-notifications.js";

function fakeDb() {
  const writes = [];
  return {
    writes,
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async run() {
          writes.push({ sql, args });
          return { meta: { last_row_id: writes.length, changes: 1 } };
        }
      };
    }
  };
}

const lead = {
  customer_name: "Buyer Example",
  phone: "+923001234567",
  whatsapp: "+923001234567",
  email: "buyer@example.com",
  city: "Faisalabad",
  country_code: "KR",
  product_title: "Computer parts",
  quantity: 4,
  requested_price_pkr: 120000,
  max_budget_pkr: 150000,
  customer_note: "Need wholesale availability"
};

test("partner lead prefers validated email while Meta WhatsApp automation is disabled", async () => {
  const db = fakeDb();
  const result = await queuePartnerLeadNotification(db, {
    partner: { id: 7, name: "Korea Partner", email: "PARTNER@example.com", contact: "+821068879265" },
    requestId: 42,
    lead
  });
  assert.equal(result.queued, true);
  assert.equal(result.channel, "email");
  assert.equal(result.status, "prepared");
  assert.equal(db.writes.length, 1);
  assert.match(db.writes[0].sql, /VALUES\('external',/);
  assert.match(db.writes[0].sql, /'prepared'\)$/);
  assert.equal(db.writes[0].args[0], "email");
  assert.equal(db.writes[0].args[1], "partner@example.com");
  assert.match(db.writes[0].args[2], /partner review/);
  assert.equal(db.writes[0].args[4], "partner_lead");
  assert.equal(db.writes[0].args[5], 42);
  assert.match(db.writes[0].args[3], /Lead reference: #42/);
  assert.match(db.writes[0].args[3], /Customer contact: \+923001234567/);
});

test("partner WhatsApp is primary when enabled and Gmail remains a clearly labelled fallback draft", async () => {
  const db = fakeDb();
  const result = await queuePartnerLeadNotification(db, {
    partner: { id: 7, name: "Korea Partner", email: "partner@example.com", contact: "+821068879265" },
    requestId: 45,
    lead,
    whatsappEnabled: true
  });
  assert.equal(result.channel, "whatsapp");
  assert.equal(result.notification_id, 1);
  assert.equal(db.writes[0].args[0], "whatsapp");
  assert.equal(db.writes[0].args[1], "821068879265");
  assert.equal(db.writes.length, 2);
  assert.equal(result.email_fallback_notification_id, 2);
  assert.equal(db.writes[1].args[0], "email");
  assert.equal(db.writes[1].args[1], "partner@example.com");
  assert.match(db.writes[1].args[2], /^FALLBACK ONLY/);
  assert.match(db.writes[1].args[3], /only if WhatsApp delivery is unavailable or unconfirmed/i);
});

test("partner lead falls back to validated email when no usable WhatsApp number exists", async () => {
  const db = fakeDb();
  const result = await queuePartnerLeadNotification(db, {
    partner: { id: 8, name: "Korea Partner", email: "PARTNER@example.com", contact: "N/A" },
    requestId: 43,
    lead
  });
  assert.equal(result.queued, true);
  assert.equal(result.channel, "email");
  assert.equal(db.writes[0].args[0], "email");
  assert.equal(db.writes[0].args[1], "partner@example.com");
  assert.match(buildPartnerLeadMessage(43, lead), /No order|Do not promise/);
});

test("partner without usable contact creates an Owner warning instead of pretending delivery", async () => {
  const db = fakeDb();
  const result = await queuePartnerLeadNotification(db, {
    partner: { id: 9, name: "Uncontactable Partner", email: "not-an-email", contact: "N/A" },
    requestId: 44,
    lead
  });
  assert.equal(result.queued, false);
  assert.equal(result.reason, "partner_contact_missing");
  assert.equal(db.writes.length, 1);
  assert.match(db.writes[0].args[0], /Partner contact missing/);
  assert.equal(db.writes[0].args[2], 44);
});
