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
        async first() { return null; }
      };
    }
  };
}

test("scheduled outreach creates owner-review drafts only and never sends email", async () => {
  const db = makeDb([
    { id: 11, company_name: "Supplier One", prospect_type: "seller", recipient: "sales1@example.com", market: "Thailand", status: "queued", touch_count: 0, next_action_at: new Date(Date.now() - 1000).toISOString() },
    { id: 12, company_name: "Buyer Two", prospect_type: "buyer_channel", recipient: "buyer2@example.com", market: "Pakistan", status: "queued", touch_count: 0, next_action_at: new Date(Date.now() - 1000).toISOString() }
  ]);
  const result = await runScheduledOutreach({ DB: db });
  assert.equal(result.ok, true);
  assert.equal(result.prepared, 2);
  assert.equal(result.sent, 0);
  assert.equal(db.notifications.length, 2);
  assert.ok(db.notifications.every(n => n.sql.includes("'prepared'")));
  assert.ok(db.sqlCalls.some(sql => sql.includes("outreach_suppressions")));
  assert.ok(db.sqlCalls.every(sql => !/messages\/send/i.test(sql)));
});

test("scheduled outreach caps draft generation at three per run", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, company_name: "Company " + i, prospect_type: "seller",
    recipient: "sales" + i + "@example.com", market: "Thailand", status: "queued",
    touch_count: 0, next_action_at: new Date(Date.now() - 1000).toISOString()
  }));
  const db = makeDb(rows);
  const result = await runScheduledOutreach({ DB: db });
  assert.equal(result.prepared, 3);
  assert.equal(result.sent, 0);
  assert.equal(db.notifications.length, 3);
});
