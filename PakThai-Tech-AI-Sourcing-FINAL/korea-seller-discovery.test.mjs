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
      assert.match(url.searchParams.get("data"), /around:30000/);
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
        async run() { return {meta:{changes:1}}; },
        bind(...params) { return { sql, params, async run() { writes.push({sql,params}); return {meta:{changes:1}}; } }; },
        async first() { return {value:"true"}; }
      };
    },
    async batch(statements) {
      for (const statement of statements) writes.push({sql:statement.sql,params:statement.params});
      return statements.map(() => ({meta:{changes:1}}));
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

test("scheduled prospect outreach records failures safely and never reports a send", async () => {
  let statusWrite = null;
  const db = { prepare(sql) { return { bind(...params) { return { async run() { statusWrite={sql,params}; return {}; } }; } }; } };
  const result = await runScheduledOutreach({DB:db});
  assert.equal(result.sent,0);
  assert.equal(result.prepared,0);
  assert.equal(result.ok,false);
  assert.ok(statusWrite?.sql.includes("outreach_last_status"));
});

test("Korea discovery performs no search while the country control is off", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("search must not start when disabled"); };
  const db = { prepare() { return { async run() { return {}; }, async first() { return {value:"false"}; } }; } };
  try {
    const result = await runKoreaSellerDiscovery(db, {scheduled:true});
    assert.equal(result.skipped,true);
    assert.match(result.reason,/control is off/);
  } finally { globalThis.fetch = originalFetch; }
});

test("Korea seller discovery merges unique leads across all successful Overpass mirrors", async () => {
  const originalFetch = globalThis.fetch;
  const writes = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === "nominatim.openstreetmap.org") {
      return new Response(JSON.stringify([{lat:"37.0",lon:"127.0"}]), {status:200});
    }
    if (url.hostname.endsWith("overpass-api.de")) {
      const id = url.hostname.startsWith("lz4.") ? 2 : url.hostname.startsWith("z.") ? 3 : 1;
      return new Response(JSON.stringify({elements:[{
        type:"node",id,lat:37.01 + id*0.001,lon:127.01 + id*0.001,
        tags:{name:"Korea Supplier " + id,shop:"computer"}
      }]}), {status:200,headers:{"content-type":"application/json"}});
    }
    throw new Error("Unexpected fetch " + url.hostname);
  };
  const db = {
    prepare(sql) {
      return {
        async run() { return {meta:{changes:1}}; },
        bind(...params) { return {sql,params,async run(){writes.push({sql,params});return {meta:{changes:1}};}}; },
        async first() { return {value:"true"}; }
      };
    },
    async batch(statements) {
      for (const statement of statements) writes.push({sql:statement.sql,params:statement.params});
      return statements.map(() => ({meta:{changes:1}}));
    }
  };
  try {
    const result = await runKoreaSellerDiscovery(db);
    assert.equal(result.ok,true);
    assert.equal(result.results_seen,3);
    assert.equal(result.saved_or_refreshed,3);
    assert.equal(writes.filter(x => x.sql.includes("INSERT INTO external_prospects")).length,3);
  } finally { globalThis.fetch = originalFetch; }
});
