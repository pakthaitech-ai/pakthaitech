import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { handleBuyerDiscoveryRequest, searchOsmBusinesses } from "../../src/buyer-discovery.js";
import { handleExternalDiscoveryRequest } from "../../src/external-discovery.js";

const SECRET = "discovery-batching-test-secret-at-least-32-characters";

function ownerCookie() {
  const payload = Buffer.from(JSON.stringify({
    role: "owner",
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url");
  const signature = createHmac("sha256", SECRET).update(payload).digest("base64url");
  return "pakthai_session=" + payload + "." + signature;
}

function fakeDb() {
  const inserted = [];
  const batchSizes = [];
  const db = {
    inserted,
    batchSizes,
    async batch(statements) {
      batchSizes.push(statements.length);
      return Promise.all(statements.map(statement => statement.run()));
    },
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() {
          if (/INSERT INTO (buyer_prospects|external_prospects)/i.test(sql)) inserted.push(args);
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  return db;
}

test("Owner buyer-prospect discovery persists 60 leads in one D1 batch", async () => {
  const originalFetch = globalThis.fetch;
  const db = fakeDb();
  const env = { DB: db, SESSION_SIGNING_SECRET: SECRET };
  let geocodeCalls = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      geocodeCalls++;
      return Response.json([{ lat: "31.4", lon: "73.1" }]);
    }
    if (url.hostname.includes("overpass")) {
      return Response.json({ elements: Array.from({ length: 60 }, (_, i) => ({
        type: "node", id: 5000 + i, lat: 31.4 + i * 0.0001, lon: 73.1,
        tags: { name: "Test Computer Business " + i, shop: "computer" }
      })) });
    }
    throw new Error("Unexpected URL: " + url);
  };
  try {
    const response = await handleBuyerDiscoveryRequest(new Request(
      "https://worker.test/api/buyer-prospects/discover",
      { method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" },
        body: JSON.stringify({ cities: ["Faisalabad"], searches: ["computer retailer", "electronics wholesaler"] }) }
    ), env);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true, JSON.stringify(body.errors));
    assert.equal(body.queries_run, 1, "only one search phrase should run per request to protect the subrequest budget");
    assert.equal(geocodeCalls, 0, "known Pakistani cities use the stable search origin and do not wait on geocoding");
    assert.equal(body.results_seen, 60);
    assert.equal(body.saved_or_refreshed, 60);
    assert.equal(db.inserted.length, 60);
    assert.deepEqual(db.batchSizes, [60]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Owner external-prospect import batches 100 validated leads in chunks of at most 80", async () => {
  const db = fakeDb();
  const env = { DB: db, SESSION_SIGNING_SECRET: SECRET };
  const prospects = Array.from({ length: 100 }, (_, i) => ({
    title: "Public business lead " + i,
    url: "https://example.com/prospect/" + i,
    prospect_type: "buyer",
    country: "South Korea"
  }));
  const response = await handleExternalDiscoveryRequest(new Request(
    "https://worker.test/api/external-prospects/import",
    { method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" },
      body: JSON.stringify({ prospects }) }
  ), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.saved_or_refreshed, 100);
  assert.equal(body.skipped, 0);
  assert.equal(db.inserted.length, 100);
  assert.deepEqual(db.batchSizes, [80, 20]);
});

test("Owner buyer-prospect import validates official websites and leaves records unreviewed", async () => {
  const db = fakeDb();
  const env = { DB: db, SESSION_SIGNING_SECRET: SECRET };
  const response = await handleBuyerDiscoveryRequest(new Request(
    "https://worker.test/api/buyer-prospects/import",
    { method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" }, body: JSON.stringify({ prospects: [
      { business_name: "Lahore Computer Retailer", website: "https://retailer.example.pk/about", discovery_city: "Lahore", address: "Lahore, Pakistan", phone: "+92 300 0000000" },
      { business_name: "Bad URL", website: "javascript:alert(1)", discovery_city: "Lahore" },
      { business_name: "Unknown City", website: "https://another.example.pk", discovery_city: "Not a Pakistani city" }
    ] }) }
  ), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.received, 3);
  assert.equal(body.saved_or_refreshed, 1);
  assert.equal(body.skipped, 2);
  assert.equal(db.inserted.length, 1);
  assert.deepEqual(db.batchSizes, [1]);
  assert.equal(db.inserted[0][0], "web:retailer.example.pk");
  assert.equal(db.inserted[0][2], "Lahore");
  assert.equal(db.inserted[0][3], "Lahore Computer Retailer");
  assert.equal(db.inserted[0][7], "web");
  assert.match(body.note, /unreviewed/i);
});


test("Pakistan buyer discovery prefers local OSM results and filters unrelated companies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname.includes("overpass")) {
      assert.match(url.searchParams.get("data"), /around:8000/);
      return Response.json({ elements: [
        { type: "node", id: 7001, lat: 31.52, lon: 74.35, tags: { name: "Lahore Computer Shop", shop: "computer" } },
        { type: "node", id: 7002, lat: 31.52, lon: 74.35, tags: { name: "Generic Office Company", office: "company" } },
        { type: "node", id: 7003, lat: 31.52, lon: 74.35, tags: { name: "Random Trading House", office: "company" } }
      ] });
    }
    throw new Error("Unexpected request; local OSM should run before web fallback: " + url.hostname);
  };
  try {
    const rows = await searchOsmBusinesses("Lahore", "computer hardware retailer");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].business_name, "Lahore Computer Shop");
    assert.equal(rows[0].discovery_city, "Lahore");
    assert.match(rows[0].address, /8 km of Lahore search centre/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pakistan web-search fallback never attributes an unverified website to the requested city", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname.includes("overpass")) return new Response("map unavailable", { status: 503 });
    if (url.hostname === "photon.komoot.io") return new Response("unavailable", { status: 503 });
    if (url.hostname === "nominatim.openstreetmap.org") return new Response("unavailable", { status: 503 });
    if (url.hostname === "www.bing.com") {
      return new Response("<rss><channel><item><title>National Computer Hardware Distributor</title><link>https://national.com.pk/</link><description>Computer hardware wholesaler</description></item></channel></rss>", { status: 200 });
    }
    throw new Error("Unexpected URL: " + url.hostname);
  };
  try {
    const rows = await searchOsmBusinesses("Lahore", "computer hardware retailer");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].business_name, "National Computer Hardware Distributor");
    assert.equal(rows[0].discovery_city, "Unverified (Pakistan)");
    assert.match(rows[0].discovery_query, /requested city Lahore; actual city unverified/);
    assert.match(rows[0].address, /actual location unverified/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pakistan country name is rejected instead of being treated as a city search", async () => {
  const originalFetch = globalThis.fetch;
  const db = fakeDb();
  globalThis.fetch = async () => { throw new Error("Search must not run for a country-only city value"); };
  try {
    const response = await handleBuyerDiscoveryRequest(new Request(
      "https://worker.test/api/buyer-prospects/discover",
      { method: "POST", headers: { Cookie: ownerCookie(), "Content-Type": "application/json" },
        body: JSON.stringify({ cities: ["Pakistan"], searches: ["computer parts wholesalers"] }) }
    ), { DB: db, SESSION_SIGNING_SECRET: SECRET });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.match(body.error, /Pakistani city names/i);
    assert.equal(db.inserted.length, 0);
    assert.deepEqual(db.batchSizes, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
