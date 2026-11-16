import test from "node:test";
import assert from "node:assert/strict";
import { notifyOwnerOfCustomerRequest } from "../../src/owner-request-alerts.js";

test("owner request alert skips when free Telegram is not configured", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("network should not be called"); };
  try {
    const result = await notifyOwnerOfCustomerRequest({}, { requestId: 42, productTitle: "GPU", quantity: 2 });
    assert.deepEqual(result, { sent: false, reason: "not_configured" });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test("owner request alert sends only minimal request details to configured Owner Telegram", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 71, chat: { id: 555 } } }), { status: 200 });
  };
  try {
    const result = await notifyOwnerOfCustomerRequest(
      { TELEGRAM_BOT_TOKEN: "mock-token", TELEGRAM_OWNER_CHAT_ID: "555" },
      { requestId: 42, productTitle: "  Gaming PC\n<unsafe> ", quantity: 3, customer_name: "Private Name", phone: "+923001234567", email: "private@example.com" }
    );
    assert.deepEqual(result, { sent: true, message_id: "71" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.telegram.org/botmock-token/sendMessage");
    assert.equal(calls[0].body.chat_id, "555");
    assert.match(calls[0].body.text, /Request: #42/);
    assert.match(calls[0].body.text, /Product: Gaming PC <unsafe>/);
    assert.match(calls[0].body.text, /Quantity: 3/);
    assert.doesNotMatch(calls[0].body.text, /Private Name|\+923001234567|private@example.com/);
    assert.match(calls[0].body.text, /Awaiting Owner review/);
  } finally { globalThis.fetch = originalFetch; }
});

test("owner request alert reports Telegram failure without throwing or leaking customer data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, description: "Bad Request: chat not found" }), { status: 400 });
  try {
    const result = await notifyOwnerOfCustomerRequest(
      { TELEGRAM_BOT_TOKEN: "mock-token", TELEGRAM_OWNER_CHAT_ID: "555" },
      { requestId: 43, productTitle: "Laptop", quantity: 1, phone: "+923001234567" }
    );
    assert.equal(result.sent, false);
    assert.equal(result.reason, "send_failed");
    assert.match(result.error, /chat not found/i);
    assert.doesNotMatch(JSON.stringify(result), /mock-token|923001234567/);
  } finally { globalThis.fetch = originalFetch; }
});
