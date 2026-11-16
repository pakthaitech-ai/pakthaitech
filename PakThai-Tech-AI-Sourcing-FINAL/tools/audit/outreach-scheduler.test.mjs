import assert from "node:assert/strict";
import test from "node:test";
import { runScheduledOutreach } from "../../src/outreach-scheduler.js";

function makeDb(rows) {
  const notifications = [];
  const sqlCalls = [];
  return {
    notifications, sqlCalls,
    prepare(sql) {
      let params = [];
      sqlCalls.push(sql);
      return {
        bind(...values) { params = values; return this; },
        async run() {
          if (sql.includes("INSERT INTO notifications")) notifications.push({ params, sql });
          return { meta: { last_row_id: notifications.length || 1, changes: 1 } };
        },
        async all() {
          if (sql.includes("SELECT c.* FROM outreach_campaigns")) return { results: rows.slice(0, Number(params[1] || 3)) };
          return { results: [] };
        },
        async first() {
          if (sql.includes("SELECT refresh_token FROM gmail_oauth")) return { refresh_token: "test-refresh-token" };
          if (sql.includes("COUNT(*) AS total FROM notifications")) return { total: notifications.filter(n => n.sql.includes("'sent'")).length };
          return null;
        }
      };
    }
  };
}

test("scheduled outreach automatically sends eligible emails and records sent status", async () => {
  const db = makeDb([
    { id: 11, company_name: "Supplier One", prospect_type: "seller", recipient: "sales1@example.com", market: "Thailand", status: "queued", touch_count: 0, next_action_at: new Date(Date.now() - 1000).toISOString() },
    { id: 12, company_name: "Buyer Two", prospect_type: "buyer_channel", recipient: "buyer2@example.com", market: "Pakistan", status: "queued", touch_count: 0, next_action_at: new Date(Date.now() - 1000).toISOString() }
  ]);
  const originalFetch = globalThis.fetch;
  let sendCount = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "test-access-token" });
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/messages/send")) return Response.json({ id: `sent-${++sendCount}` });
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/messages")) return Response.json({ messages: [] });
    throw new Error(`Unexpected mocked fetch: ${url.href}`);
  };
  try {
    const result = await runScheduledOutreach({ DB: db, GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" });
    assert.equal(result.ok, true);
    assert.equal(result.prepared, 0);
    assert.equal(result.sent, 2);
    assert.equal(sendCount, 2);
    assert.equal(db.notifications.length, 2);
    assert.ok(db.notifications.every(n => n.sql.includes("'sent'")));
    assert.ok(db.sqlCalls.some(sql => sql.includes("outreach_suppressions")));
  } finally { globalThis.fetch = originalFetch; }
});

test("scheduled outreach caps draft generation at three per run", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, company_name: "Company " + i, prospect_type: "seller",
    recipient: "sales" + i + "@example.com", market: "Thailand", status: "queued",
    touch_count: 0, next_action_at: new Date(Date.now() - 1000).toISOString()
  }));
  const db = makeDb(rows);
  const originalFetch = globalThis.fetch;
  let sendCount = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "test-access-token" });
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/messages/send")) return Response.json({ id: `sent-${++sendCount}` });
    throw new Error(`Unexpected mocked fetch: ${url.href}`);
  };
  try {
    const result = await runScheduledOutreach({ DB: db, GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret" });
    assert.equal(result.prepared, 0);
    assert.equal(result.sent, 3);
    assert.equal(sendCount, 3);
    assert.equal(db.notifications.length, 3);
  } finally { globalThis.fetch = originalFetch; }
});
