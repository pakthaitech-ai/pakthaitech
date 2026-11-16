const fs = require("fs");
const p = "D:/Horse 2/PakThai-Tech-AI-Sourcing-FINAL/src/external-discovery.js";
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf('  if (request.method !== "GET"');
const end = s.indexOf('\n\n  await ensureSchema(env.DB);', start);
if (start < 0 || end < 0) throw new Error("Expected auth block not found.");
s = s.slice(0, start) + '  if (!expected) return json({ ok:false, error: "EXTERNAL_DISCOVERY_TOKEN is not configured." }, 503);\n  if (!supplied || supplied !== expected) return json({ ok:false, error: "Owner authorization required." }, 401);' + s.slice(end);
fs.writeFileSync(p, s, "utf8");
console.log("All external prospect routes require owner token.");
