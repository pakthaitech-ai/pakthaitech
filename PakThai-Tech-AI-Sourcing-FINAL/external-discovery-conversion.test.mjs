import test from "node:test";
import assert from "node:assert/strict";
import { handleExternalDiscoveryRequest } from "./src/external-discovery.js";

function ownerCookie(secret) {
  const encode = value => Buffer.from(value).toString("base64url");
  const payload = encode(JSON.stringify({ role: "owner", iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600, nonce: "test" }));
  const key = Buffer.from(secret);
  return crypto.subtle.importKey("raw", key, {name:"HMAC",hash:"SHA-256"}, false, ["sign"]).then(async k => {
    const sig = Buffer.from(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(payload))).toString("base64url");
    return "pakthai_session=" + encodeURIComponent(payload + "." + sig);
  });
}

test("only owner-qualified seller prospects convert to pending seller records, idempotently", async () => {
  const secret = "test-session-secret-long-enough-for-hmac-123";
  const cookie = await ownerCookie(secret);
  const writes = [];
  let linkedSellerId = null;
  const prospect = { id: 7, prospect_type: "seller", title: "Qualified Thailand Supplier", url: "https://supplier.example", domain: "supplier.example", snippet: "Public listing", search_query: "computer supplier Thailand", review_status: "qualified", owner_notes: "Owner reviewed", country: "Thailand", linked_seller_id: null };
  const db = {
    prepare(sql) {
      let params = [];
      const stmt = {
        bind(...values) { params = values; return stmt; },
        async run() {
          writes.push({sql, params});
          if (sql.includes("UPDATE external_prospects SET linked_seller_id")) linkedSellerId = params[0];
          return { meta: { changes: 1, last_row_id: sql.includes("INSERT INTO sellers") ? 42 : undefined } };
        },
        async first() {
          if (sql.includes("FROM external_prospects WHERE id=?")) return { ...prospect, linked_seller_id: linkedSellerId };
          if (sql.includes("SELECT id FROM sellers")) return null;
          return null;
        },
        async all() { return { results: [] }; }
      };
      return stmt;
    },
    async batch(stmts) { return Promise.all(stmts.map(s => s.run())); }
  };
  const env = { DB: db, SESSION_SIGNING_SECRET: secret };
  const request = () => new Request("https://example.test/api/external-prospects/convert-seller", { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify({id:7}) });
  const first = await handleExternalDiscoveryRequest(request(), env);
  const firstBody = await first.json();
  assert.equal(first.status, 201);
  assert.equal(firstBody.id, 42);
  assert.equal(firstBody.status, "pending");
  assert.ok(writes.some(x => x.sql.includes("INSERT INTO sellers")));
  assert.ok(writes.some(x => x.sql.includes("UPDATE external_prospects SET linked_seller_id")));
  const second = await handleExternalDiscoveryRequest(request(), env);
  const secondBody = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondBody.id, 42);
  assert.equal(secondBody.existing, true);
  assert.equal(writes.filter(x => x.sql.includes("INSERT INTO sellers")).length, 1);
});
