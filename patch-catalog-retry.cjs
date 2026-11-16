const fs=require('fs');
const root='D:/pakthai/PakThai-Tech-AI-Sourcing-FINAL';
const p=root+'/src/worker.js';let s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const anchor='async function discoverSourceHandles() {';
const helper=[
'function catalogRetryDelayMs(retryAfter, attempt, baseMs = 2000) {',
'  const raw = String(retryAfter || "").trim();','  let requestedMs = 0;','  if (raw) {','    const seconds = Number(raw);',
'    if (Number.isFinite(seconds) && seconds > 0) requestedMs = seconds * 1000;','    else {','      const dateMs = Date.parse(raw);',
'      if (Number.isFinite(dateMs)) requestedMs = dateMs - Date.now();','    }','  }',
'  if (requestedMs > 0) return Math.min(15000, Math.max(1000, requestedMs));',
'  return Math.min(15000, baseMs * (2 ** Math.max(0, attempt - 1)));','}',''
].join('\n');
const listingOld=['if (attempt < 6) {','        const retryAfter = Number(r?.headers?.get("retry-after") || 0);','        const waitMs = Math.min(15000, retryAfter > 0 ? retryAfter * 1000 : 1000 * (2 ** attempt));','        await new Promise(resolve => setTimeout(resolve, waitMs));','      }'].join('\n');
const listingNew=['if (attempt < 4) {','        const waitMs = catalogRetryDelayMs(r?.headers?.get("retry-after"), attempt + 1, 1000);','        await new Promise(resolve => setTimeout(resolve, waitMs));','      }'].join('\n');
if(!s.includes(anchor)||!s.includes(listingOld)||!s.includes('for (let attempt = 1; attempt <= 3; attempt++) {'))throw new Error('Source anchors missing; no patch applied');
s=s.replace(anchor,helper+anchor).replace(listingOld,listingNew).replace('for (let attempt = 1; attempt <= 3; attempt++) {','for (let attempt = 1; attempt <= 5; attempt++) {');
const start=s.indexOf('if (attempt < 3) { const retryAfterMatch = lastError.match(');
if(start<0)throw new Error('Product retry-delay line missing');
const end=s.indexOf('\n',start);
s=s.slice(0,start)+'if (attempt < 5) { const retryAfterMatch = lastError.match(/retry-after=([^;]*)/i); const waitMs = catalogRetryDelayMs(retryAfterMatch?.[1], attempt, 2000); await new Promise(resolve => setTimeout(resolve, waitMs)); }'+s.slice(end);
s=s.replace('failed after 6 attempts.','failed after retry policy (up to 5 attempts per product).');
fs.writeFileSync(p,s,'utf8');
const pkg=root+'/package.json';const j=JSON.parse(fs.readFileSync(pkg,'utf8'));const old='node --test --test-concurrency=1 auth-session.test.mjs';
if(!j.scripts.test.includes(old))throw new Error('test script anchor missing');
j.scripts.test=j.scripts.test.replace(old,'node --test --test-concurrency=1 tools/audit/catalog-sync-retry.test.mjs auth-session.test.mjs');fs.writeFileSync(pkg,JSON.stringify(j,null,2)+'\n','utf8');
const test=[
'import test from "node:test";','import assert from "node:assert/strict";','import { readFile } from "node:fs/promises";',
'const worker = await readFile(new URL("../../src/worker.js", import.meta.url), "utf8");',
'test("catalog listing retries transient errors with capped backoff and Retry-After support", () => {',
'  assert.match(worker, /function catalogRetryDelayMs\\(retryAfter, attempt, baseMs = 2000\\)/);',
'  assert.match(worker, /const dateMs = Date\\.parse\\(raw\\)/);',
'  assert.match(worker, /if \\(attempt < 4\\) \\{\\s*const waitMs = catalogRetryDelayMs\\(r\\?\\.headers\\?\\.get\\("retry-after"\\), attempt \\+ 1, 1000\\)/);',
'  assert.match(worker, /for \\(let attempt = 0; attempt < 5; attempt\\+\\+\\)/);','});',
'test("product detail retries up to five times and honors Retry-After before retrying 429", () => {',
'  assert.match(worker, /for \\(let attempt = 1; attempt <= 5; attempt\\+\\+\\)/);',
'  assert.match(worker, /catalogRetryDelayMs\\(retryAfterMatch\\?\\.\\[1\\], attempt, 2000\\)/);',
'  assert.match(worker, /failed after retry policy \\(up to 5 attempts per product\\)\\./);','});',''
].join('\n');
fs.writeFileSync(root+'/tools/audit/catalog-sync-retry.test.mjs',test,'utf8');
console.log('PATCHED worker.js, package.json, added catalog-sync-retry.test.mjs');
