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

test("Gmail OAuth start requires Owner session while callback uses expiring single-use state", () => {
  const oauth = read("src/gmail-oauth.js");
  assert.match(oauth, /Owner login required to connect Gmail/);
  const start = oauth.slice(oauth.indexOf('if (path === "/auth/google/start"'), oauth.indexOf('if (path === "/auth/google/callback"'));
  const callback = oauth.slice(oauth.indexOf('if (path === "/auth/google/callback"'), oauth.indexOf('if (path === "/api/notifications/gmail-send"'));
  assert.match(start, /getSession\(request,env\)/);
  assert.match(start, /owner_session_nonce/);
  assert.match(callback, /SELECT state,owner_session_nonce FROM gmail_oauth_state/);
  assert.match(callback, /OAuth state has already been used/);
  assert.doesNotMatch(callback, /getSession\(request,env\)/);
});


test("Gmail OAuth failure response avoids malformed text and caching", () => {
  const oauth = read("src/gmail-oauth.js");
  assert.match(oauth, /Google token exchange failed:.*Cache-Control.*no-store/s);
  assert.doesNotMatch(oauth, /ï¿½\?/);
});
test("Gmail auto-reply sends only eligible routine replies and keeps security/opt-out and rate-limit gates", () => {
  const auto = read("src/gmail-autoreply.js");
  assert.match(auto, /INSERT INTO notifications/);
  assert.match(auto, /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/messages\/send/);
  assert.match(auto, /rolling_24h_limit_retry_pending/);
  assert.match(auto, /COUNT\(\*\) AS total FROM notifications/);
  assert.match(auto, /unsubscribe_request/);
  assert.match(auto, /automated_or_bulk_sender/);
  assert.match(auto, /EMAIL_AUTO_REPLY_ENABLED/);
});

test("Meta WhatsApp sending fails closed until the real Pakistan number and approved template are ready", () => {
  const worker = read("src/worker.js");
  const sender = read("src/whatsapp-sender.js");
  assert.match(worker, /handleWhatsAppSend\(request, env, body, getSession, ensureWhatsAppStatusTable\)/);
  assert.match(sender, /code_verification_status/);
  assert.match(sender, /923007982289/);
  assert.match(sender, /ensureWhatsAppFreeWindowTables\(env\.DB\)/);
  assert.match(sender, /SELECT id,name,contact FROM sourcing_partners WHERE active=1 AND contact IS NOT NULL/);
  assert.match(sender, /JOIN sourcing_partners p ON p\.id=o\.partner_id WHERE o\.phone=\? AND o\.partner_id=\? AND o\.active=1 AND p\.active=1/);
  assert.match(sender, /partner has no recorded WhatsApp opt-in/);
  assert.match(sender, /template.*APPROVED/s);
  assert.doesNotMatch(sender, /Owner approval is required before sending/);
  assert.doesNotMatch(sender, /return json\(\{ok:false,paused:true,error:/);
  assert.match(sender, /\[\"prepared\",\"approved\"\]\.includes/);
  assert.ok(sender.includes("UPDATE notifications SET status='sending' WHERE id=? AND status IN ('prepared','approved')"));
  assert.match(sender, /Meta message send failed/);
  assert.match(sender, /delivery_confirmed:false/);
  assert.match(worker, /diagnostic-only: it must never send a test message/);
  assert.match(worker, /diagnostic_only:true,sent:false/);
  assert.match(worker, /code_verification_status/);
  assert.match(worker, /Readiness checks passed\. No message was sent by this diagnostic action/);
  assert.match(worker, /AI SOURCING WHATSAPP READINESS - NO MESSAGE SENT/);
  assert.match(worker, /fetch\('\/api\/notifications\/whatsapp-template-test'/);
  assert.doesNotMatch(worker, /Automated WhatsApp sending is paused during provider migration/);
  assert.match(worker, /channel IN \('email','whatsapp'\) AND NOT/);
});

test("landed-cost viability and quotation status require complete commercial inputs", () => {
  const worker = read("src/worker.js");
  assert.match(worker, /viable: pending_costs\.length === 0 && marginPass && budgetPass/);
  const block9 = worker.slice(worker.indexOf("async function buildBlock9Opportunity"), worker.indexOf("async function handleProductSellerMatching"));
  assert.ok(block9.includes("const pending_costs = ["), "Block 9 must detect missing enabled landed-cost rates");
  assert.match(block9, /viable = pending_costs\.length === 0 && marginPass && budgetPass && targetPricePass/);
  assert.match(block9, /classification: pending_costs\.length\s*\? "Incomplete Cost Inputs"/);
  assert.match(block9, /Seller offer must include a positive asking price/);
  assert.match(worker, /Quotation blocked: landed-cost inputs are incomplete/);
  assert.match(worker, /if \(auto && auto\.pending_costs\?\.length\)/);
  assert.match(worker, /Opportunity not created: landed-cost rates are incomplete/);
  assert.match(worker, /async function createOpportunity\(\)\{\s*await calculateAuto\(\);/);
  assert.match(worker, /async function calculateAuto\(\)\{\s*lastAutomaticCalculation=null;/);
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
  assert.match(worker, /async function runScheduledProspectDiscovery\(env\)/);
  assert.match(worker, /ctx\.waitUntil\(runScheduledProspectDiscovery\(env\)\)/);
  assert.match(worker, /prospect_discovery_cursor/);
  assert.match(worker, /if \(masterMode\(settings\) !== "on" \|\| !settingBool\(settings, "auto_search_enabled", true\)\)/);
  assert.match(worker, /settingBool\(settings,"auto_search_enabled",true\)/);
  assert.match(worker, /settingBool\(settings,"seller_matching_enabled",true\)/);
  assert.match(worker, /settingBool\(settings,"opportunity_creation_enabled",true\)/);
});

test("dashboard exposes an owner-confirmed outbound queue for prepared email and WhatsApp", () => {
  const worker = read("src/worker.js");
  assert.match(worker, /id="outboundQueue"/);
  assert.match(worker, /id="freeWhatsAppForm"/);
  assert.match(worker, /async function prepareFreeWhatsAppDraft\(event\)/);
  assert.match(worker, /Prepare &amp; Open WhatsApp/);
  assert.match(worker, /AI Source has not sent it/);
  assert.match(worker, /id="gmailMailbox"/);
  assert.match(worker, /id="whatsAppMailbox"/);
  assert.match(worker, /async function loadGmailMailbox\(\)/);
  assert.match(worker, /async function loadWhatsAppMailbox\(\)/);
  assert.match(worker, /api\/notifications\/whatsapp-diagnostics/);
  assert.match(worker, /api\/notifications\/whatsapp-template-test/);
  assert.match(worker, /api\/notifications\/whatsapp-webhook-subscribe/);
  assert.match(worker, /Partner lead routing prefers WhatsApp when the feature is enabled/);
  assert.match(worker, /A validated partner email is prepared as an Owner-review draft/);
  assert.match(worker, /Automated WhatsApp requires Meta sender status VERIFIED and confirmed webhook delivery/);
  assert.doesNotMatch(worker, /Enable \/ verify WhatsApp auto-replies/);
  assert.doesNotMatch(worker, /Approved template test to Nadeem/);
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
  assert.match(worker, /Owner review - no active country partner/);
});


test("accepted Owner browser-push subscriptions remain eligible for later tests and stay counted", () => {
  const worker = read("src/worker.js");
  assert.match(worker, /SELECT COUNT\(\*\) AS n FROM browser_push_subscriptions WHERE last_status IN \('subscribed','accepted'\)/);
  assert.match(worker, /SELECT id,endpoint,p256dh,auth FROM browser_push_subscriptions WHERE last_status IN \('subscribed','accepted'\) ORDER BY id DESC LIMIT 10/);
  assert.match(worker, /UPDATE browser_push_subscriptions SET last_status='accepted',last_error=NULL/);
});
