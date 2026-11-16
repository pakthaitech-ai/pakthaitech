import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../src/worker.js";

const env = {
  SESSION_SIGNING_SECRET: "route-auth-test-secret-with-at-least-32-characters",
  DB: { prepare() { return { bind() { return this; }, async all() { return { results: [] }; }, async first() { return null; }, async run() { return { meta: { changes: 0 } }; } }; }, async batch() { return []; } }
};

const protectedRoutes = [
  ["POST", "/api/settings"],
  ["POST", "/api/approvals"],
  ["POST", "/api/quotations/approve"],
  ["POST", "/api/notifications/whatsapp"],
  ["POST", "/api/notifications/approve"],
  ["POST", "/api/notifications/whatsapp-send"],
  ["POST", "/api/notifications/whatsapp-status/remove"],
  ["POST", "/api/negotiations/message"],
  ["POST", "/api/buyer-prospects/discover"],
  ["POST", "/api/buyer-prospects/import"],
  ["POST", "/api/seller-prospects/discover"],
  ["POST", "/api/korea-seller-prospects/discover"],
  ["GET", "/api/external-prospects"],
  ["POST", "/api/opportunities"],
  ["POST", "/api/sellers"],
  ["POST", "/api/buyers"],
  ["POST", "/api/buyer-requirements"],
  ["POST", "/api/buyer-match/run"],
  ["POST", "/api/sync/source"],
  ["GET", "/api/customer-requests"],
  ["GET", "/api/customer-approvals"],
  ["POST", "/api/customer-approvals"],
  ["GET", "/api/sourcing-partners"],
  ["POST", "/api/sourcing-partners"],
  ["PATCH", "/api/sourcing-partners/1"],
  ["GET", "/api/gmail/status"],
  ["GET", "/api/gmail/inbox"],
  ["GET", "/api/browser-push/config"],
  ["POST", "/api/browser-push/subscribe"],
  ["POST", "/api/browser-push/test"],
  ["POST", "/api/browser-push/unsubscribe"],
  ["GET", "/api/notifications/whatsapp-inbox"],
  ["GET", "/api/notifications/whatsapp-diagnostics"],
  ["POST", "/api/notifications/whatsapp-template-test"],
  ["POST", "/api/notifications/whatsapp-webhook-subscribe"],
  ["POST", "/api/orders"],
  ["POST", "/api/purchases"]
];

for (const [method, path] of protectedRoutes) {
  test(`unauthenticated ${method} ${path} is denied before handler`, async () => {
    const response = await worker.fetch(new Request(`https://worker.test${path}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ test: true }) } : {})
    }), env);
    assert.equal(response.status, 401, `expected 401 for ${method} ${path}; got ${response.status}`);
  });
}

test("unauthenticated Gmail send is denied before provider access", async () => {
  const response = await worker.fetch(new Request("https://worker.test/api/notifications/gmail-send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ notification_id: 1 })
  }), env);
  assert.equal(response.status, 401);
});

test("public read-only catalog remains available without session", async () => {
  const response = await worker.fetch(new Request("https://worker.test/api/catalog"), env);
  assert.notEqual(response.status, 401);
  assert.ok([200, 503].includes(response.status), `unexpected status ${response.status}`);
});
