import test from "node:test";
import assert from "node:assert/strict";
import { handleTelegramNotifications, sendTelegramMessage } from "../../src/telegram-notifications.js";

const secret = "test-session-signing-secret-which-is-long-enough-123";
function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}
async function ownerCookie() {
  const payload = b64url(Buffer.from(JSON.stringify({
    role: "owner", iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, nonce: "test-owner-session"
  })));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
  return "pakthai_session=" + encodeURIComponent(payload + "." + signature);
}

test("Telegram status is Owner-only and never reveals bot token or chat ID", async () => {
  const unauthorized = await handleTelegramNotifications(
    new Request("https://worker.example.test/api/notifications/telegram-status"),
    { SESSION_SIGNING_SECRET: secret }
  );
  assert.equal(unauthorized.status, 401);
  const response = await handleTelegramNotifications(
    new Request("https://worker.example.test/api/notifications/telegram-status", { headers: { cookie: await ownerCookie() } }),
    { SESSION_SIGNING_SECRET: secret, TELEGRAM_BOT_TOKEN: "secret-token-not-to-leak", TELEGRAM_OWNER_CHAT_ID: "123456" }
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ready, true);
  assert.doesNotMatch(JSON.stringify(body), /secret-token-not-to-leak|123456/);
});

test("Telegram send uses only configured Owner chat ID and returns mocked acceptance", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 77, chat: { id: 123456 } } }), {
      status: 200, headers: { "content-type": "application/json" }
    });
  };
  try {
    const response = await handleTelegramNotifications(
      new Request("https://worker.example.test/api/notifications/telegram-send", {
        method: "POST", headers: { cookie: await ownerCookie(), "content-type": "application/json" },
        body: JSON.stringify({ message: "Synthetic mocked alert", chat_id: "attacker-controlled" })
      }),
      { SESSION_SIGNING_SECRET: secret, TELEGRAM_BOT_TOKEN: "mock-token", TELEGRAM_OWNER_CHAT_ID: "123456" }
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.accepted, true);
    assert.equal(body.message_id, "77");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.telegram.org/botmock-token/sendMessage");
    assert.deepEqual(JSON.parse(calls[0].init.body), {
      chat_id: "123456", text: "Synthetic mocked alert", disable_web_page_preview: true
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram send fails closed without configuration and never makes a network call", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => { callCount++; throw new Error("Network must not be called"); };
  try {
    const response = await handleTelegramNotifications(
      new Request("https://worker.example.test/api/notifications/telegram-send", {
        method: "POST", headers: { cookie: await ownerCookie(), "content-type": "application/json" },
        body: JSON.stringify({ message: "No real message" })
      }),
      { SESSION_SIGNING_SECRET: secret }
    );
    assert.equal(response.status, 503);
    assert.equal(callCount, 0);
    await assert.rejects(sendTelegramMessage({}, "No real message"), /not configured/);
    assert.equal(callCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Telegram send rejects empty or oversized messages before fetch", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => { callCount++; throw new Error("Network must not be called"); };
  try {
    await assert.rejects(sendTelegramMessage({ TELEGRAM_BOT_TOKEN: "mock", TELEGRAM_OWNER_CHAT_ID: "123" }, " "), /1–3500/);
    await assert.rejects(sendTelegramMessage({ TELEGRAM_BOT_TOKEN: "mock", TELEGRAM_OWNER_CHAT_ID: "123" }, "x".repeat(3501)), /1–3500/);
    assert.equal(callCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
