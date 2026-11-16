import assert from "node:assert/strict";
import test from "node:test";
import worker from "../../src/worker.js";

function makeEnv({ attempts = 1, products = [], aiReply = "Hello from PakThai support.", aiResult = null } = {}) {
  const calls = { ai: 0, sql: [], bindings: [], writes: 0, aiSystem: "" };
  const DB = {
    prepare(sql) {
      calls.sql.push(sql);
      return {
        bind(...args) { this.args = args; calls.bindings.push(args); return this; },
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
    assert.equal(model, "@cf/zai-org/glm-4.7-flash");
    const system = input.messages.find(m => m.role === "system");
    assert.ok(system?.content.includes("Never invent products"));
    calls.aiSystem = system?.content || "";
    assert.equal(input.reasoning_effort, "low");
    assert.equal(input.chat_template_kwargs?.enable_thinking, false);
    return aiResult || { response: aiReply };
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
  const response = await worker.fetch(post({ message: "How do I request a quote for hardware?" }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.mode, "ai");
  assert.equal(body.products_used, 1);
  assert.equal(body.reply, "Hello from PakThai support.");
  assert.equal(calls.ai, 1);
  assert.ok(calls.sql.some(s => /FROM products/.test(s)));
});

test("support chat expands generic GPU searches and ignores conversational/country words", async () => {
  const { env, calls } = makeEnv({
    products: [
      { title: "100K Budget Intel Gaming PC Build i5 GTX 1060", category: "Gaming PC", price_pkr: 100000, available: 1 },
      { title: "140K Budget Gaming PC Build Ryzen 5 RTX 2060", category: "Gaming PC", price_pkr: 140000, available: 1 },
      { title: "ASUS PRIME GeForce RTX 5060 OC 8GB GDDR7", category: "Graphics Cards", price_pkr: 125000, available: 1 },
      { title: "128GB M.2 SSD Desktop Storage Drive", category: "Storage", price_pkr: 4500, available: 1 },
      { title: "AMD RADEON HD 8490 1GB DDR3", category: "AMD GPUs", price_pkr: 1750, available: 1 },
      { title: "Used Laptop with GTX 960M", category: "Used Gaming Laptop", price_pkr: 65000, available: 1 }
    ]
  });
  const response = await worker.fetch(post({ message: "Please help me find a GPU price in Pakistan", source_country_code: "PK" }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "catalog-match");
  assert.equal(body.products_used, 4);
  assert.ok(body.reply.includes("ASUS PRIME GeForce RTX 5060"));
  assert.ok(body.reply.includes("AMD RADEON HD 8490"));
  assert.ok(!body.reply.includes("128GB M.2 SSD"));
  const exact = await worker.fetch(post({ message: "Do you have ASUS PRIME GeForce RTX 5060 OC 8GB GDDR7?", source_country_code: "PK" }), env);
  const exactBody = await exact.json();
  assert.equal(exactBody.mode, "catalog-match");
  assert.match(exactBody.reply, /\u2022 ASUS PRIME GeForce RTX 5060/);
  assert.equal(calls.ai, 0);
  const productQuery = calls.sql.find(s => /FROM products/.test(s));
  assert.ok(productQuery);
  assert.ok((productQuery.match(/LOWER\(title\) LIKE/g) || []).length >= 5);
  const bindings = calls.bindings.flat();
  assert.ok(bindings.includes("%graphics%"));
  assert.ok(bindings.includes("%rtx%"));
  assert.ok(!bindings.includes("%pakistan%"));
});

test("support chat reads OpenAI-compatible choices output from the alternative model", async () => {
  const { env } = makeEnv({ aiResult: { choices: [{ message: { content: "GLM model reply." } }] } });
  const response = await worker.fetch(post({ message: "Hello" }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.mode, "ai");
  assert.equal(body.reply, "GLM model reply.");
});
test("support chat falls back safely if Cloudflare AI is unavailable", async () => {
  const { env } = makeEnv({ products: [{ title: "Ryzen 5 5600", category: "CPU", price_pkr: 25000, available: 1 }] });
  delete env.AI;
  const response = await worker.fetch(post({ message: "How do I request help for hardware?" }), env);
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
