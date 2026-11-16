import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const store = resolve(projectRoot, "../PakThai-Store-DEPLOY") + sep;
const worker = resolve(projectRoot, "src") + sep;
const read = path => readFileSync(path, "utf8");

test("store has a real service worker and valid robots file", () => {
  assert.ok(existsSync(store + "sw.js"));
  const sw = read(store + "sw.js");
  assert.match(sw, /addEventListener\(["']install/);
  assert.match(sw, /addEventListener\(["']fetch/);
  assert.match(sw, /url\.pathname\.startsWith\("\/api\/"\)/);
  const robots = read(store + "robots.txt");
  assert.match(robots, /User-agent:\s*\*/);
  assert.match(robots, /Sitemap:\s*https:\/\/pakthai-tech-store\.pages\.dev\/sitemap\.xml/);
});

test("store product and sitemap Pages Functions exist", () => {
  assert.ok(existsSync(store + "functions/products/[handle].js"));
  assert.ok(existsSync(store + "functions/sitemap.xml.js"));
  assert.match(read(store + "functions/products/[handle].js"), /status: 404/);
  assert.match(read(store + "functions/sitemap.xml.js"), /application\/xml/);
});

test("AI chat carries explicit source-market context and request handoff", () => {
  assert.match(read(store + "index.html"), /supportSourceCountry/);
  assert.match(read(store + "index.html"), /prepare-chat-request/);
  assert.match(read(store + "app.js"), /source_country_code/);
  assert.match(read(worker + "support-chat.js"), /Explicit requested sourcing market/);
  assert.match(read(store + "app.js"), /Sourcing request from chat/);
});

test("catalog and feed provide working product route identifiers", () => {
  const workerSource = read(worker + "worker.js");
  assert.match(workerSource, /SELECT id,handle,title,category,price_pkr,available,image_url/);
  assert.match(workerSource, /\/products\//);
  assert.match(workerSource, /handle: String\(p\.handle \|\| ""\)/);
});

test("Thailand and Korea buyer discovery tries all listed Overpass endpoints", () => {
  const source = read(worker + "market-discovery.js");
  assert.match(source, /for \(const endpoint of OVERPASS\)/);
  assert.doesNotMatch(source, /OVERPASS\.slice\(0,1\)/);
  assert.match(source, /curated-public-site-unverified-buyer/);
});

test("store order-request failure is honest and does not fall back to WhatsApp-only delivery", () => {
  const app = read(store + "app.js");
  assert.match(app, /Request not recorded/);
  assert.match(app, /Your form details are still here/);
  assert.doesNotMatch(app, /WhatsApp request ready/);
});

test("paused WhatsBox handlers remain syntax-safe without duplicate lexical declarations", () => {
  const source = read(worker + "worker.js");
  function body(name) {
    const start = source.indexOf("async function " + name + "(");
    assert.ok(start >= 0, "missing " + name);
    const nextAsync = source.indexOf("\nasync function ", start + 1);
    const nextPlain = source.indexOf("\nfunction ", start + 1);
    const ends = [nextAsync, nextPlain].filter(x => x >= 0);
    assert.ok(ends.length, "missing next function boundary for " + name);
    return source.slice(start, Math.min(...ends));
  }
  const mailbox = body("loadWhatsAppMailbox");
  const status = body("loadWhatsAppStatus");
  assert.equal((mailbox.match(/\bconst box\s*=/g) || []).length, 1);
  assert.equal((status.match(/\bconst summary\s*=/g) || []).length, 1);
  assert.doesNotThrow(() => new Function(mailbox + "\n" + status));
});
