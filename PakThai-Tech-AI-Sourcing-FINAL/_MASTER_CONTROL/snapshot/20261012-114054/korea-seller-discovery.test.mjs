import test from "node:test";
import assert from "node:assert/strict";
import { runKoreaSellerDiscovery } from "./src/korea-seller-discovery.js";
import { runScheduledOutreach } from "./src/outreach-scheduler.js";

test("Korea seller discovery filters by radius, respects country toggle and saves leads only", async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") return new Response(JSON.stringify([{lat:"37.0",lon:"127.0"}]), {status:200});
    if (url.hostname.endsWith("overpass-api.de")) {
      assert.match(url.searchParams.get("data"), /around:250000/);
      return new Response(JSON.stringify({elements:[
        {type:"node",id:1,lat:37.1,lon:127.1,tags:{name:"Korea Computer Supply",shop:"computer",website:"https://example.invalid"}},
        {type:"node",id:2,lat:33.5,lon:126.5,tags:{name:"Distant Computer Supply",shop:"computer"}}
      ]}), {status:200,headers:{"content-type":"application/json"}});
    }
    throw new Error("Unexpected fetch " + url.hostname);
  };
  const db = {
    prepare(sql) {
      return {
        bind(...params) { return { async run() { writes.push({sql,params}); return {meta:{changes:1}}; } }; },
        async first() { return {value:"true"}; }
      };
    }
  };
  try {
    const result = await runKoreaSellerDiscovery(db);
    assert.equal(result.ok,true);
    assert.equal(result.results_seen,1);
    assert.equal(result.saved_or_refreshed,1);
    const insert = writes.find(x => x.sql.includes("INSERT INTO external_prospects"));
    assert.ok(insert);
    assert.equal(insert.params[1],"Korea Computer Supply");
    assert.match(insert.params[4],/Pyeongtaek city centre/);
    assert.ok(writes.some(x => x.sql.includes("korea_seller_discovery_last_status")));
  } finally { globalThis.fetch = originalFetch; }
});

test("scheduled prospect outreach stays paused and sends no email", async () => {
  let statusWrite = null;
  const db = { prepare(sql) { return { bind(...params) { return { async run() { statusWrite={sql,params}; return {}; } }; } }; } };
  const result = await runScheduledOutreach({DB:db});
  assert.equal(result.paused,true);
  assert.equal(result.sent,0);
  assert.ok(statusWrite?.sql.includes("outreach_last_status"));
});

test("Korea discovery performs no search while the country control is off", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("search must not start when disabled"); };
  const db = { prepare() { return { async first() { return {value:"false"}; } }; } };
  try {
    const result = await runKoreaSellerDiscovery(db, {scheduled:true});
    assert.equal(result.skipped,true);
    assert.match(result.reason,/control is off/);
  } finally { globalThis.fetch = originalFetch; }
});
