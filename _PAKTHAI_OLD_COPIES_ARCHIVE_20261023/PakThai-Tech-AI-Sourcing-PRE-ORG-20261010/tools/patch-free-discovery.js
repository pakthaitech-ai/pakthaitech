const fs = require("fs");
const p = "D:/Horse 2/PakThai-Tech-AI-Sourcing-FINAL/src/worker.js";
let s = fs.readFileSync(p, "utf8");
const a = "import { handleBuyerDiscoveryRequest } from './buyer-discovery.js';";
const b = "const buyerDiscoveryResponse = await handleBuyerDiscoveryRequest(request, env); if (buyerDiscoveryResponse) return buyerDiscoveryResponse;";
if (!s.includes(a) || !s.includes(b)) throw new Error("Expected worker integration points were not found; no changes made.");
if (!s.includes("handleExternalDiscoveryRequest")) {
  s = s.replace(a, a + "\nimport { handleExternalDiscoveryRequest } from './external-discovery.js';");
  s = s.replace(b, b + "\n      const externalDiscoveryResponse = await handleExternalDiscoveryRequest(request, env); if (externalDiscoveryResponse) return externalDiscoveryResponse;");
  fs.writeFileSync(p, s, "utf8");
}
console.log("External discovery import and route:", s.includes("handleExternalDiscoveryRequest") ? "present" : "missing");
