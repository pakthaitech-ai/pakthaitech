import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";
import worker from "../../src/worker.js";
import { onRequestGet } from "../../../PakThai-Store-DEPLOY/functions/catalog.js";

const storeRoot = new URL("../../../PakThai-Store-DEPLOY/", import.meta.url);

const sourceRow = {
  id: 7,
  title: "PakThai Test GPU",
  category: "GPU",
  price_pkr: 25000,
  available: 1,
  image_url: "https://example.test/gpu.png",
  source_url: "https://private-source.example/item",
  sourcing_enabled: 1,
  priority: "high"
};

function makeEnv() {
  return {
    SESSION_SIGNING_SECRET: "test-secret-for-catalog-route-only-32-chars",
    DB: {
      prepare(sql) {
        return {
          async all() {
            if (sql.includes("FROM products")) return { results: [sourceRow] };
            return { results: [] };
          },
          async first() { return null; },
          async run() { return { meta: { changes: 0 } }; },
          bind() { return this; }
        };
      }
    }
  };
}

test("public /api/catalog returns only storefront-safe fields", async () => {
  const response = await worker.fetch(new Request("https://worker.test/api/catalog"), makeEnv());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.products.length, 1);
  assert.equal(body.products[0].title, "PakThai Test GPU");
  assert.equal(body.products[0].available, true);
  assert.equal(body.products[0].price_pkr, 25000);
  assert.equal("source_url" in body.products[0], false);
  assert.equal("sourcing_enabled" in body.products[0], false);
  assert.equal("priority" in body.products[0], false);
});

test("authenticated sourcing products endpoint remains protected", async () => {
  const response = await worker.fetch(new Request("https://worker.test/api/products"), makeEnv());
  assert.equal(response.status, 401);
});

test("Pages catalog adapter converts public catalog to store format", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.equal(String(url), "https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog");
    return Response.json({ ok: true, products: [sourceRow] });
  };
  try {
    const response = await onRequestGet();
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.products.length, 1);
    assert.equal(body.products[0].vendor, "PakThai Tech");
    assert.equal(body.products[0].price, 25000);
    assert.equal(body.products[0].available, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Pages catalog adapter returns retryable 503 instead of 502/500", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("unauthorized", { status: 401 });
  try {
    const response = await onRequestGet();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("retry-after"), "60");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("store logo, PWA assets, floating contact icons and external app JavaScript are valid", () => {
  const html = readFileSync(new URL("index.html", storeRoot), "utf8");
  for (const asset of ["icon.svg", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"]) {
    assert.equal(existsSync(new URL(asset, storeRoot)), true, `missing store asset: ${asset}`);
  }
  const manifest = JSON.parse(readFileSync(new URL("manifest.webmanifest", storeRoot), "utf8"));
  assert.equal(manifest.name, "PakThai Tech");
  assert.ok(/href="\/(?:icon\.svg|icons\/icon-192\.png)(?:\?v=\d+)?"/.test(html));
  assert.ok(html.includes('src="/assets/pakthai-tech-brand-cover.png"'));
  assert.ok(html.includes('id="pakthaiSupportDock"'));
  assert.ok(html.includes("https://wa.me/923007982289"));
  const app = readFileSync(new URL("app.js", storeRoot), "utf8");
  assert.ok(app.includes("CRISP_DIRECT_CHAT"));
  assert.match(html, /<script src="\/app\.js(?:\?[^\"]*)?" defer><\/script>/, "expected the external storefront app script, optionally cache-busted");
  assert.equal((html.match(/onclick\s*=/gi) || []).length, 0, "inline event handlers must be removed");
  const inlineScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => !/\bsrc\s*=/.test(match[1]) && match[2].trim());
  assert.equal(inlineScripts.length, 0, "inline script blocks must be removed for CSP");
  new vm.Script(app, { filename: "app.js" });
});
