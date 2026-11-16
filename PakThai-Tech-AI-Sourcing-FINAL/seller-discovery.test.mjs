import test from "node:test";
import assert from "node:assert/strict";
import { runScheduledSellerDiscovery } from "./src/seller-discovery.js";

test("scheduled seller discovery stores public Bangkok supplier prospects only", async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  const batchSizes = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return new Response(JSON.stringify([{ lat: "13.75", lon: "100.50" }]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.hostname.endsWith("overpass-api.de")) {
      return new Response(JSON.stringify({ elements: [{ type: "node", id: 12345, tags: { name: "Bangkok Computer Supply", shop: "computer", phone: "+66-2-000-0000", website: "https://example.invalid" } }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected fetch " + url.hostname);
  };
  const db = {
    async batch(statements) {
      batchSizes.push(statements.length);
      return Promise.all(statements.map(statement => statement.run()));
    },
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async run() {
              writes.push({ sql, params });
              return { meta: { changes: 1 } };
            }
          };
        },
        async run() { writes.push({ sql, params: [] }); return { meta: { changes: 0 } }; }
      };
    }
  };
  try {
    const result = await runScheduledSellerDiscovery(db);
    assert.equal(result.ok, true);
    assert.equal(result.results_seen, 1);
    assert.equal(result.saved_or_refreshed, 1);
    assert.deepEqual(batchSizes, [1], "seller prospect rows should be persisted in a single D1 batch");
    const insert = writes.find(x => x.sql.includes("INSERT INTO external_prospects"));
    assert.ok(insert);
    assert.equal(insert.params[0], "osm");
    assert.equal(insert.params[1], "Bangkok Computer Supply");
    assert.match(insert.params[2], /openstreetmap\.org/);
    assert.ok(writes.some(x => x.sql.includes("seller_discovery_last_status")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Bangkok seller discovery falls back to bounded public Bing results when OSM services time out", async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "www.bing.com") {
      return new Response('<ol><li class="b_algo"><h2><a href="https://www.bing.com/ck/a?u=a1aHR0cHM6Ly9leGFtcGxlLmNvLnRoL2NvbXB1dGVyLXN1cHBseQ%3D%3D" target="_blank">Bangkok Computer Supplier</a></h2><p>Computer hardware and electronics supplier in Bangkok.</p></li></ol>', { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error("Simulated public map timeout: " + url.hostname);
  };
  const db = {
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
    prepare(sql) {
      return { bind(...params) { return { async run() { writes.push({ sql, params }); return { meta: { changes: 1 } }; } }; }, async run() { writes.push({ sql, params: [] }); return { meta: { changes: 0 } }; } };
    }
  };
  try {
    const result = await runScheduledSellerDiscovery(db);
    assert.equal(result.ok, true);
    assert.equal(result.results_seen, 1);
    const insert = writes.find(x => x.sql.includes("INSERT INTO external_prospects"));
    assert.ok(insert);
    assert.equal(insert.params[0], "bing");
    assert.equal(insert.params[1], "Bangkok Computer Supplier");
    assert.equal(insert.params[2], "https://example.co.th/computer-supply");
    assert.match(insert.params[4], /Location and supplier status unverified/);
  } finally { globalThis.fetch = originalFetch; }
});


test("Bangkok seller discovery falls back to DuckDuckGo when Bing returns unparseable HTML", async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.hostname === "www.bing.com") {
      return new Response("<html><title>Search</title><body>Search results could not be parsed</body></html>", { status: 200, headers: { "content-type": "text/html" } });
    }
    if (url.hostname === "html.duckduckgo.com") {
      return new Response('<div class="result"><a class="result__a" href="https://example.co.th/computer-hardware">Bangkok Computer Hardware Supplier</a><a class="result__snippet">Computer hardware and electronics supplier in Bangkok, Thailand.</a></div>', { status: 200, headers: { "content-type": "text/html" } });
    }
    throw new Error("Simulated public map timeout: " + url.hostname);
  };
  const db = {
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
    prepare(sql) {
      return { bind(...params) { return { async run() { writes.push({ sql, params }); return { meta: { changes: 1 } }; } }; }, async run() { writes.push({ sql, params: [] }); return { meta: { changes: 0 } }; } };
    }
  };
  try {
    const result = await runScheduledSellerDiscovery(db);
    assert.equal(result.ok, true);
    assert.equal(result.results_seen, 1);
    const insert = writes.find(x => x.sql.includes("INSERT INTO external_prospects"));
    assert.ok(insert);
    assert.equal(insert.params[0], "duckduckgo");
    assert.equal(insert.params[1], "Bangkok Computer Hardware Supplier");
    assert.equal(insert.params[2], "https://example.co.th/computer-hardware");
  } finally { globalThis.fetch = originalFetch; }
});
