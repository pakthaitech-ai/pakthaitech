import assert from "node:assert/strict";
import test from "node:test";
import { runGmailAutoReply } from "../../src/gmail-autoreply.js";

function makeHarness() {
  const state = new Map([["last_poll_ms", "1000"]]);
  const processed = new Map();
  const suppressions = new Set();
  const sent = [];
  const preparedDrafts = [];
  const listCalls = [];
  const messages = Array.from({ length: 30 }, (_, i) => ({ id: `msg-${i + 1}` }));
  const db = {
    prepare(sql) {
      let params = [];
      return {
        bind(...values) { params = values; return this; },
        async first() {
          if (sql.includes("COUNT(*) AS total FROM notifications")) return { total: preparedDrafts.length };
          if (sql.includes("SELECT refresh_token FROM gmail_oauth")) return { refresh_token: "test-refresh-token" };
          if (sql.includes("SELECT value FROM gmail_auto_reply_state")) return state.has("last_poll_ms") ? { value: state.get("last_poll_ms") } : null;
          if (sql.includes("SELECT message_id FROM gmail_auto_reply_processed")) return processed.has(params[0]) ? { message_id: params[0] } : null;
          if (sql.includes("SELECT sender FROM gmail_auto_reply_suppressions")) return suppressions.has(params[0]) ? { sender: params[0] } : null;
          return null;
        },
        async run() {
          if (sql.includes("INSERT INTO notifications")) preparedDrafts.push({recipient:params[0],subject:params[1],message:params[2]});
          if (sql.includes("INSERT OR IGNORE INTO gmail_auto_reply_processed")) processed.set(params[0], { status: params[4], reason: params[5] });
          if (sql.includes("INSERT OR IGNORE INTO gmail_auto_reply_suppressions")) suppressions.add(params[0]);
          if (sql.includes("INSERT INTO gmail_auto_reply_state")) state.set(params[0], params[1]);
          if (sql.includes("UPDATE gmail_auto_reply_state")) state.set("last_poll_ms", params[0]);
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(String(input));
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "test-access-token" });
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/messages/send")) {
      sent.push(JSON.parse(options.body));
      return Response.json({ id: `sent-${sent.length}` });
    }
    if (url.hostname === "gmail.googleapis.com" && /\/messages\/msg-\d+$/.test(url.pathname)) {
      const id = url.pathname.split("/").pop();
      const n = Number(id.replace("msg-", ""));
      return Response.json({
        id, threadId: `thread-${n}`, internalDate: String(5000 + n), snippet: n === 1 ? "Use code to log in" : "Please send pricing details",
        payload: { headers: [
          { name: "From", value: n === 1 ? "Meta Notifications <notification@email.meta.com>" : `Buyer ${n} <buyer${n}@example.com>` },
          { name: "Subject", value: n === 1 ? "Re: Use code to log in" : "Pricing enquiry" },
          { name: "Message-ID", value: `<${id}@example.com>` }
        ] }
      });
    }
    if (url.hostname === "gmail.googleapis.com" && url.pathname.endsWith("/messages")) {
      listCalls.push({ query: url.searchParams.get("q"), pageToken: url.searchParams.get("pageToken"), maxResults: url.searchParams.get("maxResults") });
      if (url.searchParams.get("pageToken") === "page-2") return Response.json({ messages: messages.slice(25) });
      return Response.json({ messages: messages.slice(0, 25), nextPageToken: "page-2" });
    }
    throw new Error(`Unexpected mocked fetch: ${url.href}`);
  };
  return {
    env: { EMAIL_AUTO_REPLY_ENABLED: "true", GOOGLE_CLIENT_ID: "test-client", GOOGLE_CLIENT_SECRET: "test-secret", DB: db },
    sent, preparedDrafts, listCalls, processed, state,
    restore() { globalThis.fetch = originalFetch; }
  };
}

test("Gmail auto-reply sends eligible messages within the 24-hour cap and holds cursor for deferred replies", async () => {
  const h = makeHarness();
  try {
    const result = await runGmailAutoReply(h.env);
    assert.equal(result.ok, true);
    assert.equal(result.checked, 25);
    assert.equal(result.sent, 10, "routine replies are sent automatically but stay within the rolling 24-hour cap");
    assert.equal(result.prepared, 0);
    assert.equal(result.skipped, 2, "security messages are skipped and polling stops safely at the rate limit");
    assert.equal(result.reason, "rolling_24h_limit_retry_pending");
    assert.equal(h.sent.length, 10, "eligible routine replies are sent through Gmail");
    assert.equal(h.preparedDrafts.length, 10);
    assert.equal(h.processed.size, 11);
    assert.equal(h.processed.get("msg-1").status, "skipped");
    assert.ok([...h.processed.values()].filter(x => x.status === "sent").length === 10);
    assert.equal(h.listCalls.length, 1);
    assert.equal(h.listCalls[0].maxResults, "100");
    assert.equal(h.state.get("last_poll_ms"), "1000", "cursor stays put so rate-limited messages can be retried later");
    assert.match(h.listCalls[0].query, /after:0/);
  } finally { h.restore(); }
});

test("Gmail auto-reply does not resend already processed message IDs on a repeat poll", async () => {
  const h = makeHarness();
  try {
    const first = await runGmailAutoReply(h.env);
    const second = await runGmailAutoReply(h.env);
    assert.equal(first.sent, 10);
    assert.equal(first.prepared, 0);
    assert.equal(second.sent, 0);
    assert.equal(second.prepared, 0);
    assert.equal(h.sent.length, 10);
    assert.equal(h.preparedDrafts.length, 10);
  } finally { h.restore(); }
});
