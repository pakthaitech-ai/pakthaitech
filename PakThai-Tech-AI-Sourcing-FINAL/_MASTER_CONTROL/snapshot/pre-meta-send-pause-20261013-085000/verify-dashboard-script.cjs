const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
(async () => {
  const response = await fetch("https://pakthai-ai-sourcing.pakthaitech.workers.dev/");
  const html = await response.text();
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim());
  const out = "D:\\Horse 2\\PakThai-Tech-AI-Sourcing-FINAL\\_MASTER_CONTROL\\snapshot\\pre-meta-send-pause-20261013-085000\\live-dashboard-inline.js";
  fs.writeFileSync(out, scripts.join("\n;\n"), "utf8");
  execFileSync(process.execPath, ["--check", out], { stdio: "inherit" });
  console.log("dashboard_http=" + response.status, "inline_scripts=" + scripts.length, "inline_js_syntax=PASS");
})().catch(error => { console.error(String(error)); process.exitCode = 1; });
