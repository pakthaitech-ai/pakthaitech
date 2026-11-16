import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { handleBuyerDiscoveryRequest } from "../../src/buyer-discovery.js";

const SECRET = "buyer-prospect-conversion-test-secret-at-least-32";
function ownerCookie() {
  const payload = Buffer.from(JSON.stringify({ role: "owner", exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url");
  return "pakthai_session=" + payload + "." + createHmac("sha256", SECRET).update(payload).digest("base64url");
}

function dbFor({ prospect = {}, duplicate = null, linked = null } = {}) {
  const writes = [];
  let insertedId = 91;
  const db = {
    writes,
    prepare(sql) {
      let params = [];
      const stmt = {
        bind(...values) { params = values; return stmt; },
        async run() {
          writes.push({ sql, params });
          if (sql.includes("INSERT INTO buyers")) return { meta: { changes: 1, last_row_id: insertedId } };
          return { meta: { changes: 1 } };
        },
        async first() {
          if (sql.includes("FROM buyer_prospects WHERE id=?")) return prospect ? { ...prospect, linked_buyer_id: linked } : null;
          if (sql.includes("FROM buyers WHERE lower(name)")) return duplicate;
          return null;
        },
        async all() { return { results: [] }; }
      };
      return stmt;
    },
    async batch(statements) { return Promise.all(statements.map(s => s.run())); }
  };
  return db;
}

test("only Owner-qualified buyer prospects convert to pending Buyer records", async () => {
  const db = dbFor({ prospect: { id: 7, business_name: "Lahore Computer House", address: "Lahore, Pakistan", website: "https://example.pk", phone: "+92 300 0000000", discovery_city: "Lahore", discovery_query: "computer retailer", review_status: "qualified", owner_notes: "Website checked" } });
  const response = await handleBuyerDiscoveryRequest(new Request("https://worker.test/api/buyer-prospects/convert-buyer", {
    method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" }, body: JSON.stringify({ id: 7 })
  }), { DB: db, SESSION_SIGNING_SECRET: SECRET });
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.status, "pending");
  const insert = db.writes.find(x => x.sql.includes("INSERT INTO buyers"));
  assert.ok(insert);
  assert.equal(insert.params[0], "Lahore Computer House");
  assert.equal(insert.params[4], "Lahore");
  assert.equal(insert.params[5], "Pakistan");
  assert.equal(insert.params[7], "pending");
  assert.ok(insert.params[8].includes("https://example.pk"));
  assert.ok(db.writes.some(x => x.sql.includes("UPDATE buyer_prospects SET linked_buyer_id")));
});

test("unqualified buyer prospects cannot be converted", async () => {
  const db = dbFor({ prospect: { id: 8, business_name: "Unreviewed Shop", review_status: "unreviewed" } });
  const response = await handleBuyerDiscoveryRequest(new Request("https://worker.test/api/buyer-prospects/convert-buyer", {
    method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" }, body: JSON.stringify({ id: 8 })
  }), { DB: db, SESSION_SIGNING_SECRET: SECRET });
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.match(body.error, /Qualified/i);
  assert.equal(db.writes.some(x => x.sql.includes("INSERT INTO buyers")), false);
});

test("buyer prospect conversion links an existing duplicate instead of inserting twice", async () => {
  const db = dbFor({ prospect: { id: 9, business_name: "Existing Buyer", review_status: "qualified" }, duplicate: { id: 33 } });
  const response = await handleBuyerDiscoveryRequest(new Request("https://worker.test/api/buyer-prospects/convert-buyer", {
    method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" }, body: JSON.stringify({ id: 9 })
  }), { DB: db, SESSION_SIGNING_SECRET: SECRET });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.existing, true);
  assert.equal(body.id, 33);
  assert.equal(db.writes.some(x => x.sql.includes("INSERT INTO buyers")), false);
});

test("linked buyer prospect conversion is idempotent", async () => {
  const db = dbFor({ prospect: { id: 10, business_name: "Linked Buyer", review_status: "qualified" }, linked: 44 });
  const response = await handleBuyerDiscoveryRequest(new Request("https://worker.test/api/buyer-prospects/convert-buyer", {
    method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" }, body: JSON.stringify({ id: 10 })
  }), { DB: db, SESSION_SIGNING_SECRET: SECRET });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.existing, true);
  assert.equal(body.id, 44);
  assert.equal(db.writes.some(x => x.sql.includes("INSERT INTO buyers")), false);
});

test("unauthenticated buyer prospect conversion is denied", async () => {
  const db = dbFor({ prospect: { id: 7, business_name: "No Access", review_status: "qualified" } });
  const response = await handleBuyerDiscoveryRequest(new Request("https://worker.test/api/buyer-prospects/convert-buyer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: 7 })
  }), { DB: db, SESSION_SIGNING_SECRET: SECRET });
  assert.equal(response.status, 403);
  assert.equal(db.writes.some(x => x.sql.includes("INSERT INTO buyers")), false);
});
