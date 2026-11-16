import assert from "node:assert/strict";
import test from "node:test";
import { runMarketBuyerDiscovery } from "./src/market-discovery.js";

test("market buyer discovery rejects Photon results outside radius and irrelevant companies", async () => {
  const originalFetch = globalThis.fetch;
  const inserted = [];
  const db = {
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
        { properties: { name: "Generic Office Company", osm_key: "office", osm_value: "company", osm_type: "node", osm_id: 103, city: "Pyeongtaek" }, geometry: { coordinates: [127.05, 37.0] } }
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
    assert.equal(inserted[0][1], "Pyeongtaek Computer Shop");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
