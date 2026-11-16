import test from "node:test";
import assert from "node:assert/strict";
import { runAIProspectScreening } from "../../src/ai-prospect-screening.js";

function makeEnv({ assessment, country = "Thailand", title = "Bangkok Computer Parts Distributor" } = {}) {
  const writes = [];
  let linkedSellerId = null;
  const row = { id: 9, title, url: "https://supplier.example", domain: "supplier.example", snippet: "Computer components distributor", search_query: "IT supplier Bangkok", country, owner_notes: "", linked_seller_id: null };
  const db = {
    prepare(sql) {
      let params = [];
      const stmt = {
        bind(...values) { params = values; return stmt; },
        async run() {
          writes.push({ sql, params });
          if (sql.includes("INSERT INTO sellers")) return { meta: { changes: 1, last_row_id: 41 } };
          if (sql.includes("UPDATE external_prospects SET linked_seller_id")) linkedSellerId = params[0];
          return { meta: { changes: 1 } };
        },
        async first() {
          if (sql.includes("SELECT id FROM sellers")) return null;
          if (sql.includes("COUNT(*) AS n")) return { n: 0 };
          return null;
        },
        async all() {
          if (sql.includes("FROM external_prospects") && sql.includes("SELECT id,title")) return { results: [{ ...row, linked_seller_id: linkedSellerId }] };
          return { results: [] };
        }
      };
      return stmt;
    },
    async batch(stmts) { return Promise.all(stmts.map(s => s.run())); }
  };
  return {
    env: { DB: db, AI: { async run() { return { response: assessment }; } } },
    writes,
    get linkedSellerId() { return linkedSellerId; }
  };
}

test("AI high relevance creates only an idempotently linked pending seller candidate", async () => {
  const ctx = makeEnv({ assessment: "Relevance: high\nEvidence: The listing says computer parts distributor.\nMissing checks: identity, stock, price, export terms.\nSuggested next step: verify supplier details." });
  const result = await runAIProspectScreening(ctx.env);
  assert.equal(result.ok, true);
  assert.equal(result.processed, 1);
  assert.equal(result.pending_sellers_created, 1);
  const insert = ctx.writes.find(x => x.sql.includes("INSERT INTO sellers"));
  assert.ok(insert);
  assert.ok(insert.sql.includes("'pending'"));
  assert.equal(insert.params[0], "Bangkok Computer Parts Distributor");
  assert.equal(ctx.linkedSellerId, 41);
  assert.ok(insert.params.at(-1).includes("NOT a verified supplier"));
});

test("medium/low relevance does not create a seller record", async () => {
  const ctx = makeEnv({ assessment: "Relevance: medium\nEvidence: The name mentions technology but listing is unclear.\nMissing checks: supplier activity.\nSuggested next step: review source." });
  const result = await runAIProspectScreening(ctx.env);
  assert.equal(result.ok, true);
  assert.equal(result.pending_sellers_created, 0);
  assert.equal(ctx.writes.some(x => x.sql.includes("INSERT INTO sellers")), false);
});

test("high relevance with unsupported or missing country does not create a seller record", async () => {
  const ctx = makeEnv({ country: "", assessment: "Relevance: high\nEvidence: IT distributor.\nMissing checks: country, stock, prices.\nSuggested next step: establish country." });
  const result = await runAIProspectScreening(ctx.env);
  assert.equal(result.ok, true);
  assert.equal(result.pending_sellers_created, 0);
  assert.equal(ctx.writes.some(x => x.sql.includes("INSERT INTO sellers")), false);
});

test("deprecated/empty primary response falls back to the supported Llama 3.2 model", async () => {
  const ctx = makeEnv({ assessment: "" });
  const models = [];
  ctx.env.AI.run = async (model) => {
    models.push(model);
    if (models.length === 1) return { response: "" };
    return { response: "Relevance: high\nEvidence: Computer parts distributor.\nMissing checks: identity, stock, price, export terms.\nSuggested next step: verify supplier details." };
  };
  const result = await runAIProspectScreening(ctx.env);
  assert.deepEqual(models, ["@cf/google/gemma-4-26b-a4b-it", "@cf/meta/llama-3.2-1b-instruct"]);
  assert.equal(result.ok, true);
  assert.equal(result.pending_sellers_created, 1);
});
