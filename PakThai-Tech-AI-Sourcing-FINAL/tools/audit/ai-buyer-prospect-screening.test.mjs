import test from "node:test";
import assert from "node:assert/strict";
import { runAIBuyerProspectScreening } from "../../src/ai-buyer-prospect-screening.js";

function makeEnv({ assessment = "Potential buyer fit: high\nEvidence: The listing identifies an IT retailer.\nBuyer intent evidence: None supplied.\nMissing checks: purchasing interest, contact, volume.\nSuggested next step: Owner verification.", rows } = {}) {
  const writes = [];
  const queries = [];
  const prospects = rows || [{
    id: 17, title: "Bangkok Computer Retailer", url: "https://buyer.example",
    domain: "buyer.example", snippet: "Computer and IT products retailer",
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
          if (sql.includes("FROM external_prospects") && sql.includes("SELECT id,title")) return { results: prospects };
          return { results: [] };
        },
        async first() {
          if (sql.includes("COUNT(*) AS n")) return { n: 0 };
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
