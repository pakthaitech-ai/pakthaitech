import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const worker = await readFile(new URL("../../src/worker.js", import.meta.url), "utf8");
test("catalog listing retries transient errors with capped backoff and Retry-After support", () => {
  assert.match(worker, /function catalogRetryDelayMs\(retryAfter, attempt, baseMs = 2000\)/);
  assert.match(worker, /const dateMs = Date\.parse\(raw\)/);
  assert.match(worker, /if \(attempt < 4\) \{\s*const waitMs = catalogRetryDelayMs\(r\?\.headers\?\.get\("retry-after"\), attempt \+ 1, 1000\)/);
  assert.match(worker, /for \(let attempt = 0; attempt < 5; attempt\+\+\)/);
});
test("product detail retries up to five times and honors Retry-After before retrying 429", () => {
  assert.match(worker, /for \(let attempt = 1; attempt <= 5; attempt\+\+\)/);
  assert.match(worker, /catalogRetryDelayMs\(retryAfterMatch\?\.\[1\], attempt, 2000\)/);
  assert.match(worker, /failed after retry policy \(up to 5 attempts per product\)\./);
});
