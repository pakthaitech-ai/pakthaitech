import assert from "node:assert/strict";
import test from "node:test";
import { runMarketBuyerDiscovery } from "./src/market-discovery.js";

test("market buyer discovery rejects Photon results outside radius and irrelevant companies", async () => {
  const originalFetch = globalThis.fetch;
  const inserted = [];
  let batchCalls = 0;
  const db = {
    async batch(statements) { batchCalls++; return Promise.all(statements.map(statement => statement.run())); },
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes("SELECT value FROM settings")) return { value: "true" };
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes("INSERT INTO external_prospects")) inserted.push(args);
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return new Response(JSON.stringify([{ lat: "37.0", lon: "127.0" }]), { status: 200 });
    }
    if (url.hostname.includes("overpass")) {
      return new Response("temporarily unavailable", { status: 503 });
    }
    if (url.hostname === "photon.komoot.io") {
      return new Response(JSON.stringify({ features: [
        { properties: { name: "Pyeongtaek Computer Shop", osm_key: "shop", osm_value: "computer", osm_type: "node", osm_id: 101, city: "Pyeongtaek" }, geometry: { coordinates: [127.05, 37.0] } },
        { properties: { name: "Far Away Computer Shop", osm_key: "shop", osm_value: "computer", osm_type: "node", osm_id: 102, city: "Other City" }, geometry: { coordinates: [128.0, 37.0] } },
        { properties: { name: "Generic Office Company", osm_key: "office", osm_value: "company", osm_type: "node", osm_id: 103, city: "Pyeongtaek" }, geometry: { coordinates: [127.05, 37.0] } },
        { properties: { name: "Pyeongtaek Computer Shop", osm_key: "shop", osm_value: "computer", osm_type: "node", osm_id: 104, city: "Pyeongtaek" }, geometry: { coordinates: [127.051, 37.0] } },
        { properties: { name: "Generic Steel Hardware", osm_key: "shop", osm_value: "hardware", osm_type: "node", osm_id: 105, city: "Pyeongtaek" }, geometry: { coordinates: [127.05, 37.0] } }
      ] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error("Unexpected mocked URL: " + url);
  };
  try {
    const result = await runMarketBuyerDiscovery(db, "South Korea");
    assert.equal(result.ok, true, result.error);
    assert.equal(result.results_seen, 1);
    assert.equal(result.saved_or_refreshed, 1);
    assert.equal(inserted.length, 1);
    assert.equal(batchCalls, 1, "lead rows should be persisted in one D1 batch");
    assert.equal(inserted[0][1], "Pyeongtaek Computer Shop");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("market buyer discovery batches 60+ public leads in one D1 call", async () => {
  const originalFetch = globalThis.fetch;
  const inserted = [];
  const batchSizes = [];
  const db = {
    async batch(statements) {
      batchSizes.push(statements.length);
      return Promise.all(statements.map(statement => statement.run()));
    },
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          if (sql.includes("SELECT value FROM settings")) return { value: "true" };
          return null;
        },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes("INSERT INTO external_prospects")) inserted.push(args);
          return { meta: { changes: 1 } };
        }
      };
    }
  };
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return Response.json([{ lat: "37.0", lon: "127.0" }]);
    }
    if (url.hostname.includes("overpass")) return new Response("temporarily unavailable", { status: 503 });
    if (url.hostname === "photon.komoot.io") {
      return Response.json({ features: Array.from({ length: 60 }, (_, i) => ({
        properties: { name: "Pyeongtaek Computer Shop " + i, osm_value: "computer", osm_type: "node", osm_id: 1000 + i, city: "Pyeongtaek" },
        geometry: { coordinates: [127 + i * 0.002, 37.0] }
      })) });
    }
    throw new Error("Unexpected mocked URL: " + url);
  };
  try {
    const result = await runMarketBuyerDiscovery(db, "South Korea");
    assert.equal(result.ok, true, result.error);
    assert.equal(result.results_seen, 60);
    assert.equal(result.saved_or_refreshed, 60);
    assert.equal(inserted.length, 60);
    assert.deepEqual(batchSizes, [60], "all prospect inserts should be one batch under D1's statement limit");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
