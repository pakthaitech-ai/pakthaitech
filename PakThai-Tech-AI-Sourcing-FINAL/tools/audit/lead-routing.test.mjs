import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../src/worker.js";

function makeRoutingEnv(partner = { id: 7, name: "Korea Partner", country_code: "KR", contact: "+821068879265", email: "partner@example.com" }, duplicateRequest = null) {
  const calls = [];
  const storedRequests = new Map();
  if (duplicateRequest?.key) storedRequests.set(duplicateRequest.key, duplicateRequest);
  const env = {
    SESSION_SIGNING_SECRET: "route-test-secret-at-least-32-characters-long",
    DB: {
      prepare(sql) {
        const call = { sql, args: [] };
        calls.push(call);
        return {
          bind(...args) { call.args = args; return this; },
          async run() {
            if (/INSERT INTO buyers/i.test(sql)) return { meta: { last_row_id: 11, changes: 1 } };
            if (/INSERT INTO buyer_requirements/i.test(sql)) return { meta: { last_row_id: 22, changes: 1 } };
            if (/INSERT INTO customer_requests/i.test(sql)) {
              if (call.args[18]) storedRequests.set(call.args[18], { id: 33, buyer_id: 11, requirement_id: 22, status: "new", key: call.args[18] });
              return { meta: { last_row_id: 33, changes: 1 } };
            }
            return { meta: { last_row_id: 44, changes: 1 } };
          },
          async first() {
            if (/INSERT INTO public_request_rate_limits/i.test(sql)) return { attempts: 1 };
            if (/SELECT id,buyer_id,requirement_id,status FROM customer_requests WHERE idempotency_key/i.test(sql)) return storedRequests.get(call.args[0]) || null;
            if (/SELECT \* FROM buyers/i.test(sql)) return null;
            if (/SELECT id,name,country_code,contact,email FROM sourcing_partners WHERE country_code=/i.test(sql)) {
              return Array.isArray(partner) ? (partner.find(p => p.country_code === call.args[0] && p.active !== 0) || null) : (partner?.active === 0 ? null : partner);
            }
            return null;
          },
          async all() {
            if (/SELECT id,name,country_code,contact,email FROM sourcing_partners WHERE active=1/i.test(sql)) {
              const list = Array.isArray(partner) ? partner : (partner && partner.active !== 0 ? [partner] : []);
              return { results: list.filter(p => p.active !== 0).slice(0, 2) };
            }
            return { results: [] };
          }
        };
      },
      async batch() { return []; }
    }
  };
  return { env, calls };
}

const request = (country_code, idempotency_key = "") => new Request("https://worker.test/api/customer-requests", {
  method: "POST",
  headers: { "content-type": "application/json", "CF-Connecting-IP": "198.51.100.41" },
  body: JSON.stringify({
    customer_name: "Synthetic Routing Test",
    phone: "+923000000000",
    email: "test@example.com",
    city: "Lahore",
    country_code,
    product_title: "Gaming PC",
    quantity: 2,
    request_type: "quote_request",
    customer_note: "Synthetic test only; no real customer.",
    ...(idempotency_key ? { idempotency_key } : {})
  })
});

test("country-matched customer intake assigns a Korea buyer lead internally", async () => {
  const { env, calls } = makeRoutingEnv();
  const response = await worker.fetch(request("KR"), env);
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.success, true);
  const insert = calls.find(c => /INSERT INTO customer_requests/i.test(c.sql));
  assert.ok(insert, "customer request should be recorded in the mocked database");
  assert.equal(insert.args[15], "KR");
  assert.equal(insert.args[16], 7);
  assert.equal(insert.args[17], "Korea Partner");
  const partnerNotification = calls.find(c => /INSERT INTO notifications/.test(c.sql) && c.args[0] === "Partner: Korea Partner");
  assert.ok(partnerNotification, "internal partner dashboard notification should be created");
  assert.match(partnerNotification.args[2], /delivery is queued separately/i);
  const externalPartnerDraft = calls.find(c => /INSERT INTO notifications/.test(c.sql) && c.args[0] === "email");
  assert.ok(externalPartnerDraft, "an Owner-reviewed partner email should be prepared while Meta WhatsApp automation is disabled");
  assert.equal(externalPartnerDraft.args[1], "partner@example.com");
  assert.equal(externalPartnerDraft.args[5], 33);
});

test("Pakistan buyer requests reach the sole active sourcing partner even when customer country differs", async () => {
  const { env, calls } = makeRoutingEnv();
  const response = await worker.fetch(request("PK"), env);
  assert.equal(response.status, 201);
  const insert = calls.find(c => /INSERT INTO customer_requests/i.test(c.sql));
  assert.equal(insert.args[15], "PK", "customer country remains Pakistan");
  assert.equal(insert.args[16], 7, "the only active buyer-capable partner is used as the default sourcing route");
  assert.equal(insert.args[17], "Korea Partner");
  assert.ok(calls.some(c => /INSERT INTO notifications/.test(c.sql) && c.args[0] === "email"), "partner email is prepared while Meta WhatsApp automation is disabled");
});

test("ambiguous buyer request does not guess between multiple active partners", async () => {
  const partners = [
    { id: 7, name: "Korea Partner", country_code: "KR", contact: "+821068879265", email: "korea@example.com" },
    { id: 8, name: "Thailand Partner", country_code: "TH", contact: "+66812345678", email: "thai@example.com" }
  ];
  const { env, calls } = makeRoutingEnv(partners);
  const response = await worker.fetch(request("KR"), env);
  assert.equal(response.status, 201);
  const insert = calls.find(c => /INSERT INTO customer_requests/i.test(c.sql));
  assert.equal(insert.args[15], "KR", "customer country remains independent");
  assert.equal(insert.args[16], null, "without an explicit sourcing market, two partners are ambiguous");
  assert.equal(insert.args[17], "");
  assert.equal(calls.some(c => /INSERT INTO notifications/.test(c.sql) && ["email", "whatsapp"].includes(c.args[0])), false);
});

test("country intake with no active or matching partner retains owner-review fallback", async () => {
  const { env, calls } = makeRoutingEnv(null);
  const response = await worker.fetch(request("AU"), env);
  assert.equal(response.status, 201);
  const insert = calls.find(c => /INSERT INTO customer_requests/i.test(c.sql));
  assert.ok(insert);
  assert.equal(insert.args[15], "AU");
  assert.equal(insert.args[16], null);
  assert.equal(insert.args[17], "");
  assert.ok(calls.some(c => /INSERT INTO notifications/.test(c.sql) && c.args[0] === "Customer approval required"));
  assert.ok(!calls.some(c => /INSERT INTO notifications/.test(c.sql) && String(c.args[0]).startsWith("Partner:")));
});

test("customer request idempotency key returns the existing request on a retry", async () => {
  const { env, calls } = makeRoutingEnv();
  const first = await worker.fetch(request("KR", "checkout-req-abc123"), env);
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.success, true);
  const savedRequest = calls.find(c => /INSERT INTO customer_requests/i.test(c.sql));
  assert.equal(savedRequest.args[18], "checkout-req-abc123");

  const retry = await worker.fetch(request("KR", "checkout-req-abc123"), env);
  assert.equal(retry.status, 200);
  const retryBody = await retry.json();
  assert.equal(retryBody.success, true);
  assert.equal(retryBody.duplicate, true);
  assert.equal(retryBody.request_id, firstBody.request_id);
  assert.equal(calls.filter(c => /INSERT INTO buyers/i.test(c.sql)).length, 1);
  assert.equal(calls.filter(c => /INSERT INTO buyer_requirements/i.test(c.sql)).length, 1);
  assert.equal(calls.filter(c => /INSERT INTO customer_requests/i.test(c.sql)).length, 1);
  const notificationInserts = calls.filter(c => /INSERT INTO notifications/i.test(c.sql));
  assert.equal(notificationInserts.length, 4);
  assert.ok(notificationInserts.some(c => c.args[0] === "whatsapp"), "new Korea lead must queue WhatsApp as the primary partner channel");
  assert.ok(notificationInserts.some(c => c.args[0] === "email" && String(c.args[2]).startsWith("FALLBACK ONLY")), "email is retained as a clearly labelled Owner-review fallback");
  assert.equal(calls.filter(c => /INSERT INTO public_request_rate_limits/i.test(c.sql)).length, 1, "a retry of a completed idempotency key should be resolved before consuming another rate-limit attempt");
});

test("customer intake rejects invalid idempotency keys", async () => {
  const { env, calls } = makeRoutingEnv();
  const bad = new Request("https://worker.test/api/customer-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "198.51.100.45" },
    body: JSON.stringify({ customer_name: "Synthetic Test", phone: "+923000000000", idempotency_key: "not a safe key" })
  });
  const response = await worker.fetch(bad, env);
  assert.equal(response.status, 400);
  assert.equal(calls.some(c => /INSERT INTO customer_requests/i.test(c.sql)), false);
});

test("customer intake rejects honeypot and invalid email before creating a lead", async () => {
  const { env, calls } = makeRoutingEnv();
  const honeypot = new Request("https://worker.test/api/customer-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "198.51.100.42" },
    body: JSON.stringify({ website: "bot-filled", customer_name: "Synthetic Bot", phone: "+923000000000", country_code: "KR" })
  });
  const honeypotResponse = await worker.fetch(honeypot, env);
  assert.equal(honeypotResponse.status, 400);
  assert.equal(calls.some(c => /INSERT INTO customer_requests/i.test(c.sql)), false);

  const invalidEmail = new Request("https://worker.test/api/customer-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "198.51.100.43" },
    body: JSON.stringify({ customer_name: "Synthetic Test", phone: "+923000000000", email: "not-an-email", country_code: "KR" })
  });
  const invalidEmailResponse = await worker.fetch(invalidEmail, env);
  assert.equal(invalidEmailResponse.status, 400);
  assert.equal(calls.some(c => /INSERT INTO customer_requests/i.test(c.sql)), false);
});

test("malformed country codes cannot create customer requests", async () => {
  const { env, calls } = makeRoutingEnv();
  const malformedCountry = new Request("https://worker.test/api/customer-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "198.51.100.44" },
    body: JSON.stringify({ customer_name: "Synthetic Test", phone: "+923000000000", country_code: "KOREA" })
  });
  const response = await worker.fetch(malformedCountry, env);
  assert.equal(response.status, 400);
  assert.equal(calls.some(c => /INSERT INTO customer_requests/i.test(c.sql)), false);
});

test("unsupported request types cannot create customer requests", async () => {
  const { env, calls } = makeRoutingEnv();
  const unsupported = new Request("https://worker.test/api/customer-requests", {
    method: "POST",
    headers: { "content-type": "application/json", "CF-Connecting-IP": "198.51.100.47" },
    body: JSON.stringify({ customer_name: "Synthetic Test", phone: "+923000000000", request_type: "freebie" })
  });
  const response = await worker.fetch(unsupported, env);
  assert.equal(response.status, 400);
  assert.equal(calls.some(c => /INSERT INTO customer_requests/i.test(c.sql)), false);
});

test("inactive country partner is skipped and customer request stays in Owner review", async () => {
  const { env, calls } = makeRoutingEnv({ id: 7, name: "Inactive Korea Partner", country_code: "KR", active: 0 });
  const response = await worker.fetch(request("KR"), env);
  assert.equal(response.status, 201);
  const insert = calls.find(c => /INSERT INTO customer_requests/i.test(c.sql));
  assert.ok(insert);
  assert.equal(insert.args[16], null);
  assert.equal(insert.args[17], "");
  assert.ok(calls.some(c => /INSERT INTO notifications/.test(c.sql) && c.args[0] === "Customer approval required"));
  assert.ok(!calls.some(c => /INSERT INTO notifications/.test(c.sql) && String(c.args[0]).startsWith("Partner:")));
});


test("new customer request triggers a minimal Owner Telegram alert when configured", async () => {
  const { env, calls } = makeRoutingEnv();
  env.TELEGRAM_BOT_TOKEN = "mock-owner-bot-token";
  env.TELEGRAM_OWNER_CHAT_ID = "555000";
  const originalFetch = globalThis.fetch;
  const telegramCalls = [];
  globalThis.fetch = async (url, init) => {
    telegramCalls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 91, chat: { id: 555000 } } }), { status: 200 });
  };
  try {
    const response = await worker.fetch(request("KR"), env);
    assert.equal(response.status, 201);
    assert.equal(telegramCalls.length, 1);
    assert.equal(telegramCalls[0].url, "https://api.telegram.org/botmock-owner-bot-token/sendMessage");
    assert.equal(telegramCalls[0].body.chat_id, "555000");
    assert.match(telegramCalls[0].body.text, /Request: #33/);
    assert.match(telegramCalls[0].body.text, /Product: Gaming PC/);
    assert.match(telegramCalls[0].body.text, /Quantity: 2/);
    assert.doesNotMatch(telegramCalls[0].body.text, /Synthetic Routing Test|test@example.com|\+923000000000/);
    assert.match(telegramCalls[0].body.text, /Awaiting Owner review/);
    assert.ok(calls.some(c => /INSERT INTO customer_requests/i.test(c.sql)), "D1 remains the source of truth");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
