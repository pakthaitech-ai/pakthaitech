import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../src/worker.js";

function makeRoutingEnv(partner = { id: 7, name: "Korea Partner", country_code: "KR" }) {
  const calls = [];
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
            if (/INSERT INTO customer_requests/i.test(sql)) return { meta: { last_row_id: 33, changes: 1 } };
            return { meta: { last_row_id: 44, changes: 1 } };
          },
          async first() {
            if (/INSERT INTO public_request_rate_limits/i.test(sql)) return { attempts: 1 };
            if (/SELECT \* FROM buyers/i.test(sql)) return null;
            if (/SELECT id,name,country_code FROM sourcing_partners/i.test(sql)) return partner;
            return null;
          },
          async all() { return { results: [] }; }
        };
      },
      async batch() { return []; }
    }
  };
  return { env, calls };
}

const request = (country_code) => new Request("https://worker.test/api/customer-requests", {
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
    customer_note: "Synthetic test only; no real customer."
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
  assert.match(partnerNotification.args[2], /no external message was sent/i);
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

test("unsupported lead types and malformed country codes cannot create customer requests", async () => {
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
