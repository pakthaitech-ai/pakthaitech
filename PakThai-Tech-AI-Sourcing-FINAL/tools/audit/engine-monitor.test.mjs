import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../src/worker.js";

const env = {
  OWNER_LOGIN_PASSWORD: "engine-monitor-test-password",
  SESSION_SIGNING_SECRET: "engine-monitor-signing-secret-at-least-32-characters",
  DB: {
    prepare(sql) {
      const query = {
        bind() { return query; },
        async all() { return { results: [] }; },
        async first() { return sql.includes("COUNT(*)") ? { n: 0 } : null; },
        async run() { return { meta: { changes: 0, last_row_id: 0 } }; }
      };
      return query;
    },
    async batch() { return []; }
  }
};

test("engine monitor is Owner-protected and reports safe read-only status fields", async () => {
  const denied = await worker.fetch(new Request("https://worker.test/api/dashboard"), env);
  assert.equal(denied.status, 401, "dashboard must remain private without an Owner session");

  const login = await worker.fetch(new Request("https://worker.test/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "owner", password: env.OWNER_LOGIN_PASSWORD })
  }), env);
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];

  const response = await worker.fetch(new Request("https://worker.test/api/dashboard", {
    headers: { cookie }
  }), env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
  assert.equal(data.engine_monitor.catalog_sync.status, "not_run");
  assert.equal(data.engine_monitor.ai_screening.status, "not_run");
  assert.equal(data.engine_monitor.business_readiness.buyers, 0);
  assert.equal(data.engine_monitor.business_readiness.opportunities, 0);
  assert.equal(data.engine_monitor.business_readiness.note, "Counts are real database records; no synthetic opportunities are created.");
  assert.equal(JSON.stringify(data).includes("SESSION_SIGNING_SECRET"), false);
});


test("Master Plan feature center exposes status buttons for U1-U6", async () => {
  const response = await worker.fetch(new Request("https://worker.test/"), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("Master Plan - Feature Control Center"));
  for (const id of ["U1", "U2", "U4", "U5", "U6"]) {
    assert.ok(html.includes('openUpgradeFeature(&quot;' + id + '&quot;)'), "missing feature button " + id);
  }
  assert.ok(html.includes("function openUpgradeFeature(id)"));
  assert.ok(html.includes("PARTIAL - HEURISTIC DEPLOYED"));
  assert.ok(html.includes("U3 - Store Analytics"));
  assert.ok(html.includes("function loadStoreAnalytics()"));
  assert.ok(html.includes("AGGREGATE TRACKING IMPLEMENTED"));
  assert.ok(html.includes("LIVE PAGE VIEW VERIFIED - FUNNEL EVENTS PENDING"));
  assert.ok(html.includes("action:()=>loadStoreAnalytics()"));
});


test("Voice Assistant reads live WhatsApp and Owner Browser Push status without sending messages", async () => {
  const response = await worker.fetch(new Request("https://worker.test/"), env);
  const html = await response.text();
  assert.ok(html.includes("/api/notifications/whatsapp-diagnostics"));
  assert.ok(html.includes("/api/browser-push/config"));
  assert.ok(html.includes("replace(/\\s+/g,' ').trim()"), "voice command must preserve the whitespace regex after template rendering");
  assert.ok(html.includes("notification was visibly received on this browser"));
  assert.ok(html.includes("automatic sending stays paused"));
});


test("evidence priority scores are visible for buyer and market discovery", async () => {
  const response = await worker.fetch(new Request("https://worker.test/"), env);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("function leadEvidenceScore(x,kind,all)"));
  assert.ok(html.includes("leadEvidenceBadge(x,\'buyer\',a)"));
  assert.ok(html.includes("leadEvidenceBadge(x,\'market\',a)"));
  assert.ok(html.includes("<th>Evidence score</th>"));
  assert.ok(html.includes("not proof that a buyer/seller is verified"));
});

test('U4 status accurately distinguishes basic Store comparison from advanced specs', async () => {
  const response = await worker.fetch(new Request('https://worker.test/'), env);
  const html = await response.text();
  assert.ok(html.includes('PARTIAL - BASIC COMPARISON DEPLOYED'));
  assert.ok(html.includes('missing specs are never inferred'));
});
