import test from "node:test";
import assert from "node:assert/strict";
import { runAIBuyerProspectScreening } from "../../src/ai-buyer-prospect-screening.js";

function makeEnv({ assessment = "Potential buyer fit: high\nEvidence: The listing identifies an IT retailer.\nBuyer intent evidence: None supplied.\nMissing checks: purchasing interest, contact, volume.\nSuggested next step: Owner verification.", rows } = {}) {
  const writes = [];
  const queries = [];
  const prospects = rows || [{
    id: 17, title: "Bangkok Computer Retailer", url: "https://buyer.example",
    domain: "buyer.example.co.th", snippet: "Computer and IT products retailer",
    search_query: "computer retailer Bangkok", country: "Thailand", owner_notes: ""
  }];
  const db = {
    prepare(sql) {
      queries.push(sql);
      let params = [];
      const stmt = {
        bind(...values) { params = values; return stmt; },
        async run() { writes.push({ sql, params }); return { meta: { changes: 1 } }; },
        async all() {
          if (sql.includes("FROM external_prospects") && sql.includes("SELECT id,title")) {
            const limit = Number(sql.match(/LIMIT\s+(\d+)/i)?.[1] || prospects.length);
            return { results: prospects.slice(0, limit) };
          }
          return { results: [] };
        },
        async first() {
          if (sql.includes("COUNT(*) AS n")) {
            const screened = new Set(writes.filter(x => x.sql.includes("UPDATE external_prospects SET owner_notes")).map(x => x.params[1]));
            return { n: Math.max(0, prospects.length - screened.size) };
          }
          return null;
        }
      };
      return stmt;
    }
  };
  return {
    env: { DB: db, AI: { async run() { return { response: assessment }; } } },
    writes,
    queries
  };
}

test("buyer AI screening adds a review hint only and never creates a Buyer record", async () => {
  const ctx = makeEnv();
  const result = await runAIBuyerProspectScreening(ctx.env);
  assert.equal(result.ok, true);
  assert.equal(result.processed, 1);
  assert.equal(result.high_fit, 1);
  assert.equal(result.awaiting_verification, 0);
  const update = ctx.writes.find(x => x.sql.includes("UPDATE external_prospects SET owner_notes"));
  assert.ok(update);
  assert.match(update.params[0], /AI_BUYER_SCREENED:/);
  assert.equal(ctx.writes.some(x => /INSERT INTO buyers|INSERT INTO buyer_requirements|INSERT INTO opportunities/.test(x.sql)), false);
  assert.ok(ctx.queries.some(sql => sql.includes("SELECT id,title") && sql.includes("prospect_type='buyer'")));
});

test("medium buyer fit remains an unverified hint and does not create a buyer", async () => {
  const ctx = makeEnv({ assessment: "Potential buyer fit: medium\nEvidence: Technology is mentioned but buyer role is unclear.\nBuyer intent evidence: None.\nMissing checks: company activity and demand.\nSuggested next step: manual review." });
  const result = await runAIBuyerProspectScreening(ctx.env);
  assert.equal(result.ok, true);
  assert.equal(result.high_fit, 0);
  assert.equal(result.awaiting_verification, 1);
  assert.equal(ctx.writes.some(x => x.sql.includes("INSERT INTO buyers")), false);
});

test("map-only listings cannot be classified as high fit even if the model says high", async () => {
  const ctx = makeEnv({ rows: [{
    id: 28, title: "Cubic Creative PlayCube", url: "https://www.openstreetmap.org/node/1706581663",
    domain: "openstreetmap.org", snippet: "", search_query: "computer electronics retailer Bangkok",
    country: "Thailand", owner_notes: ""
  }] });
  const result = await runAIBuyerProspectScreening(ctx.env);
  assert.equal(result.high_fit, 0);
  assert.equal(result.awaiting_verification, 1);
  const update = ctx.writes.find(x => x.sql.includes("UPDATE external_prospects SET owner_notes"));
  assert.match(update.params[0], /SCREENING_DISPOSITION: OWNER_VERIFICATION_REQUIRED/);
});

test("screening processes a bounded batch and persists progress for later scheduled runs", async () => {
  const rows = Array.from({ length: 8 }, (_, i) => ({
    id: i + 1, title: "Computer Retailer " + i, url: "https://retailer" + i + ".example",
    domain: "retailer" + i + ".example", snippet: "Computer hardware retailer",
    search_query: "computer retailer Bangkok", country: "Thailand", owner_notes: ""
  }));
  const ctx = makeEnv({ rows });
  const result = await runAIBuyerProspectScreening(ctx.env);
  assert.equal(result.processed, 4);
  assert.equal(result.remaining_unassessed, 4);
  assert.equal(result.status, "in_progress");
  assert.ok(ctx.writes.some(x => x.sql.includes("buyer_screening_last_status")));
});

test("unverified global domains cannot be marked as high-fit local buyers", async () => {
  const ctx = makeEnv({ rows: [{
    id: 44, title: "Computers & Tablets - Best Buy", url: "https://www.bestbuy.com",
    domain: "bestbuy.com", snippet: "Computer and electronics retailer",
    search_query: "computer retailer Bangkok Thailand", country: "",
    owner_notes: ""
  }] });
  const result = await runAIBuyerProspectScreening(ctx.env);
  assert.equal(result.high_fit, 0);
  assert.equal(result.awaiting_verification, 1);
});

test("download and support pages cannot be marked as high-fit buyers", async () => {
  const ctx = makeEnv({ rows: [{
    id: 45, title: "Downloads | TSC Printers", url: "https://apac.tscprinters.com",
    domain: "apac.tscprinters.com", snippet: "Printer drivers and manuals",
    search_query: "computer retailer Pyeongtaek South Korea", country: "South Korea",
    owner_notes: ""
  }] });
  const result = await runAIBuyerProspectScreening(ctx.env);
  assert.equal(result.high_fit, 0);
  assert.equal(result.awaiting_verification, 1);
});

test("buyer screening falls back when the primary model returns empty output", async () => {
  const ctx = makeEnv({ assessment: "" });
  const models = [];
  ctx.env.AI.run = async model => {
    models.push(model);
    return models.length === 1 ? { response: "" } : { response: "Potential buyer fit: high\nEvidence: IT reseller listing.\nBuyer intent evidence: Not provided.\nMissing checks: demand and contacts.\nSuggested next step: verify." };
  };
  const result = await runAIBuyerProspectScreening(ctx.env);
  assert.deepEqual(models, ["@cf/google/gemma-4-26b-a4b-it", "@cf/meta/llama-3.2-1b-instruct"]);
  assert.equal(result.ok, true);
  assert.equal(result.high_fit, 1);
});
