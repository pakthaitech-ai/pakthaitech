import { readFileSync } from "node:fs";

const snapshotPath = new URL("../../_MASTER_CONTROL/reports/d1-handles-readonly-20261010.json", import.meta.url);
const d1Payload = JSON.parse(readFileSync(snapshotPath, "utf8"));
const d1 = new Set((d1Payload[0]?.results || []).map(row => String(row.handle || "")).filter(Boolean));
const upstream = new Set();
for (let page = 1; page <= 5; page++) {
  const response = await fetch(`https://sakoonsay.com/products.json?limit=250&page=${page}`, {
    headers: { Accept: "application/json", "User-Agent": "PakThaiTechReadOnlyCatalogAudit/1.0" },
    signal: AbortSignal.timeout(12000)
  });
  if (!response.ok) throw new Error(`Upstream HTTP ${response.status} on page ${page}`);
  const body = await response.json();
  const products = Array.isArray(body.products) ? body.products : [];
  for (const product of products) if (product.handle) upstream.add(String(product.handle));
  if (products.length < 250) break;
}
const missingInD1 = [...upstream].filter(handle => !d1.has(handle)).sort();
const staleInD1 = [...d1].filter(handle => !upstream.has(handle)).sort();
console.log(`D1 unique handles: ${d1.size}`);
console.log(`Upstream unique handles: ${upstream.size}`);
console.log(`Missing in D1: ${missingInD1.length}`);
console.log(`Stale in D1: ${staleInD1.length}`);
if (missingInD1.length) console.log("MISSING_IN_D1=" + missingInD1.join(" | "));
if (staleInD1.length) console.log("STALE_IN_D1=" + staleInD1.join(" | "));
