import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

test("storefront dynamic catalog values are not interpolated into JavaScript event handlers", () => {
  const html = read("../PakThai-Store-DEPLOY/index.html");
  assert.match(html, /<script src="\/app\.js(?:\?[^\"]*)?" defer><\/script>/);
  assert.doesNotMatch(html, /onclick\s*=/);
  const app = read("../PakThai-Store-DEPLOY/app.js");
  assert.match(app, /data-quote-product-id=/);
  assert.match(app, /data-category=/);
  assert.match(app, /addEventListener\('click',function\(e\)/);
  assert.doesNotMatch(app, /onclick\s*=/);
});

test("Pages sends baseline security headers and a restrictive resource policy", () => {
  const headers = read("../PakThai-Store-DEPLOY/_headers");
  for (const header of ["X-Content-Type-Options: nosniff","Referrer-Policy: strict-origin-when-cross-origin","X-Frame-Options: DENY","Permissions-Policy:","Strict-Transport-Security:","Content-Security-Policy:"]) assert.ok(headers.includes(header), header);
  assert.match(headers, /object-src 'none'/);
  assert.match(headers, /frame-ancestors 'none'/);
  assert.match(headers, /script-src-attr 'none'/);
  assert.match(headers, /script-src 'self' https:\/\/cdn\.tailwindcss\.com/);
  assert.doesNotMatch(headers, /script-src 'self' 'unsafe-inline'/);
});

test("authentication entry points include database-backed rate limits", () => {
  const auth = read("src/auth-session.js");
  assert.match(auth, /CREATE TABLE IF NOT EXISTS auth_rate_limits/);
  assert.match(auth, /rateLimited\(request, env\.DB, path\)/);
  assert.match(auth, /Too many login attempts/);
});

test("Gmail OAuth start and callback are Owner-session and single-use-state bound", () => {
  const oauth = read("src/gmail-oauth.js");
  assert.match(oauth, /Owner login required to connect Gmail/);
  assert.match(oauth, /owner_session_nonce/);
  assert.match(oauth, /OAuth state has already been used/);
});


test("Gmail OAuth failure response avoids malformed text and caching", () => {
  const oauth = read("src/gmail-oauth.js");
  assert.match(oauth, /Google token exchange failed:.*Cache-Control.*no-store/s);
  assert.doesNotMatch(oauth, /�\?/);
});
test("Gmail auto-reply only creates drafts; it cannot call the Gmail send API", () => {
  const auto = read("src/gmail-autoreply.js");
  assert.match(auto, /INSERT INTO notifications/);
  assert.match(auto, /owner_approval_required_notification_/);
  assert.doesNotMatch(auto, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/);
});

test("WhatsApp provider send is reachable only through an approved notification", () => {
  const worker = read("src/worker.js");
  const sendCalls = worker.match(/await sendWhatsAppCloudMessage\(env/g) || [];
  assert.equal(sendCalls.length, 1);
  assert.match(worker, /VALUES\(\?,\?,\?,\?,\?,'prepared'\)/);
  assert.match(worker, /status='approved' LIMIT 1/);
  assert.match(worker, /Owner approval required: approve a prepared WhatsApp notification first/);
});

test("landed-cost viability and quotation status require complete commercial inputs", () => {
  const worker = read("src/worker.js");
  assert.match(worker, /viable: pending_costs\.length === 0 && marginPass && budgetPass/);
  assert.match(worker, /Quotation blocked: landed-cost inputs are incomplete/);
  assert.match(worker, /'draft',String\(body\.notes\|\|''\)\.slice/);
  assert.doesNotMatch(worker, /valid_until,status,notes\) VALUES\([^\n]*'sent'/);
});

test("currency conversion never falls back to an unverified hard-coded FX rate", () => {
  const worker = read("src/worker.js");
  assert.doesNotMatch(worker, /8\.36/);
  assert.match(worker, /currency === "KRW" && Number\.isFinite\(krwToPkr\) && krwToPkr > 0/);
  assert.match(worker, /THB\/PKR exchange rate is not configured/);
});

test("scheduled discovery and matching honor their dashboard automation switches", () => {
  const worker = read("src/worker.js");
  assert.match(worker, /if \(!settingBool\(automationSettings,"auto_search_enabled",true\)\)/);
  assert.match(worker, /settingBool\(settings,"auto_search_enabled",true\)/);
  assert.match(worker, /settingBool\(settings,"seller_matching_enabled",true\)/);
  assert.match(worker, /settingBool\(settings,"opportunity_creation_enabled",true\)/);
});

test("dashboard exposes an owner-confirmed outbound queue for prepared email and WhatsApp", () => {
  const worker = read("src/worker.js");
  assert.match(worker, /id="outboundQueue"/);
  assert.match(worker, /id="gmailMailbox"/);
  assert.match(worker, /id="whatsAppMailbox"/);
  assert.match(worker, /async function loadGmailMailbox\(\)/);
  assert.match(worker, /async function loadWhatsAppMailbox\(\)/);
  assert.match(worker, /api\/notifications\/whatsapp-diagnostics/);
  assert.match(worker, /api\/notifications\/whatsapp-template-test/);
  assert.match(worker, /api\/notifications\/whatsapp-webhook-subscribe/);
  assert.match(worker, /Only approved templates without variables are offered/);
  assert.match(worker, /async function loadOutboundQueue\(\)/);
  assert.match(worker, /async function approveAndSendNotification\(id,channel\)/);
  assert.match(worker, /This action contacts an external recipient/);
  assert.match(worker, /api\/notifications\/whatsapp-send/);
  assert.match(worker, /api\/notifications\/gmail-send/);
});


test("customer approval APIs are Owner-only and dashboard shows country routing plus customer contact", () => {
  const worker = read("src/worker.js");
  assert.match(worker, /approvalSession\?\.role !== "owner"/);
  assert.match(worker, /session\?\.role !== "owner"/);
  assert.match(worker, /<th>Assigned Partner<\/th>/);
  assert.match(worker, /<th>Country<\/th>/);
  assert.match(worker, /const contact=\[x\.phone,x\.whatsapp,x\.email\]/);
  assert.match(worker, /Owner review — no active country partner/);
});
