import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../src/worker.js";

function makeEnv({ attempts = 1, products = [], aiReply = "Hello from PakThai support." } = {}) {
  const calls = { ai: 0, sql: [], writes: 0 };
  const DB = {
    prepare(sql) {
      calls.sql.push(sql);
      return {
        bind(...args) { this.args = args; return this; },
        async run() { calls.writes++; return { meta: { changes: 1 } }; },
        async first() { return { attempts }; },
        async all() {
          if (/FROM products/.test(sql)) return { results: products };
          return { results: [] };
        }
      };
    },
    async batch() { return []; }
  };
  const AI = { async run(model, input) {
    calls.ai++;
    assert.equal(model, "@cf/meta/llama-3.1-8b-instruct-fast");
    assert.ok(input.messages.some(m => m.role === "system" && m.content.includes("Never invent products")));
    return { response: aiReply };
  }};
  return { env: { DB, AI }, calls };
}

const post = (body, ip = "203.0.113.8") => new Request("https://worker.test/api/support/chat", {
  method: "POST",
  headers: { "content-type": "application/json", "CF-Connecting-IP": ip },
  body: typeof body === "string" ? body : JSON.stringify(body)
});

test("support chat is intentionally public but only accepts POST", async () => {
  const { env } = makeEnv();
  const response = await worker.fetch(new Request("https://worker.test/api/support/chat"), env);
  assert.equal(response.status, 405);
});

test("support chat validates malformed, empty and oversized input before AI", async () => {
  const { env, calls } = makeEnv();
  assert.equal((await worker.fetch(post("{bad"), env)).status, 400);
  assert.equal((await worker.fetch(post({ message: " " }), env)).status, 400);
  const tooLarge = await worker.fetch(post({ message: "x".repeat(7000) }), env);
  assert.equal(tooLarge.status, 413);
  assert.equal(calls.ai, 0);
});

test("support chat returns a bounded AI response using only matching catalog facts", async () => {
  const { env, calls } = makeEnv({
    products: [{ title: "NVIDIA RTX 4060", category: "GPU", price_pkr: 98000, available: 1 }]
  });
  const response = await worker.fetch(post({ message: "Do you have RTX 4060?" }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "ai");
  assert.equal(body.products_used, 1);
  assert.equal(body.reply, "Hello from PakThai support.");
  assert.equal(calls.ai, 1);
  assert.ok(calls.sql.some(s => /FROM products/.test(s)));
});

test("support chat falls back safely if Cloudflare AI is unavailable", async () => {
  const { env } = makeEnv({ products: [{ title: "Ryzen 5 5600", category: "CPU", price_pkr: 25000, available: 1 }] });
  delete env.AI;
  const response = await worker.fetch(post({ message: "Ryzen 5600 price?" }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "catalog-fallback");
  assert.match(body.reply, /PKR 25,000/);
  assert.match(body.reply, /must confirm final price/);
});

test("support chat rate limits before AI and returns 429", async () => {
  const { env, calls } = makeEnv({ attempts: 13 });
  const response = await worker.fetch(post({ message: "Help me source a product" }), env);
  assert.equal(response.status, 429);
  assert.equal(calls.ai, 0);
});

test("support chat does not persist transcripts or expose customer records", async () => {
  const { env, calls } = makeEnv();
  const response = await worker.fetch(post({ message: "Hello" }), env);
  assert.equal(response.status, 200);
  assert.ok(calls.sql.every(s => !/INSERT INTO (customer_requests|buyers|buyer_requirements|support_chat_messages)/i.test(s)));
});
