import test from "node:test";
import assert from "node:assert/strict";
import { gmailPlainBody, handleGmailOAuth, sendAccountSecurityEmail } from "../../src/gmail-oauth.js";

function makeDb() {
  return {
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) { this.values = values; return this; },
        async run() { return { meta: { changes: 1, last_row_id: 42 } }; },
        async all() { return { results: [] }; },
        async first() {
          if (sql.includes("SELECT * FROM notifications WHERE id=?")) {
            return {
              id: 42,
              channel: "email",
              status: "approved",
              recipient: "buyer@example.test",
              subject: "Owner-approved test",
              message: "Synthetic test only",
              related_type: "customer_request",
              related_id: null
            };
          }
          return null;
        }
      };
      return statement;
    }
  };
}

test("approved email notification can use Resend without calling Google", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ id: "resend_mock_123" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const env = {
      DB: makeDb(),
      EMAIL_SEND_TOKEN: "test-send-token",
      OUTBOUND_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_only",
      RESEND_FROM_EMAIL: "PakThai Tech <notify@example.test>"
    };
    const request = new Request("https://worker.example.test/api/notifications/gmail-send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-send-token"
      },
      body: JSON.stringify({ notification_id: 42 })
    });

    const response = await handleGmailOAuth(request, env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.sent, true);
    assert.equal(body.message_id, "resend_mock_123");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://api.resend.com/emails");
    assert.equal(calls[0].init.headers.Authorization, "Bearer re_test_only");
    const payload = JSON.parse(calls[0].init.body);
    assert.equal(payload.from, "PakThai Tech <notify@example.test>");
    assert.deepEqual(payload.to, ["buyer@example.test"]);
    assert.equal(payload.subject, "Owner-approved test");
    assert.equal(payload.text, "Synthetic test only");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("account-security email can use Resend and fails closed without sender configuration", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async (url, init = {}) => {
    callCount++;
    assert.equal(String(url), "https://api.resend.com/emails");
    assert.equal(init.headers.Authorization, "Bearer re_test_only");
    return new Response(JSON.stringify({ id: "resend_security_mock" }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };

  try {
    const sent = await sendAccountSecurityEmail({
      OUTBOUND_EMAIL_PROVIDER: "resend",
      RESEND_API_KEY: "re_test_only",
      RESEND_FROM_EMAIL: "PakThai Tech <notify@example.test>"
    }, "owner@example.test", "Synthetic security test", "This message is mocked and not sent.");
    assert.equal(sent, true);
    assert.equal(callCount, 1);
    await assert.rejects(
      sendAccountSecurityEmail({ OUTBOUND_EMAIL_PROVIDER: "resend" }, "owner@example.test", "Subject", "Body"),
      /Resend API key and verified sender are not configured/
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Gmail multipart delivery failures preserve the full SMTP diagnostic part", () => {
  const encode = value => Buffer.from(value, "utf8").toString("base64url");
  const body = gmailPlainBody({
    mimeType: "multipart/report",
    parts: [
      { mimeType: "text/plain", body: { data: encode("Message not delivered. The response was: see diagnostic details below.") } },
      { mimeType: "message/delivery-status", body: { data: encode("Final-Recipient: rfc822; buyer@example.test\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 User unknown") } },
      { mimeType: "text/html", body: { data: encode("<p>HTML summary that should not replace the diagnostic.</p>") } }
    ]
  });
  assert.match(body, /message\/delivery-status/);
  assert.match(body, /Final-Recipient: rfc822; buyer@example\.test/);
  assert.match(body, /550 5\.1\.1 User unknown/);
  assert.match(body, /Message not delivered/);
  assert.doesNotMatch(body, /HTML summary/);
});