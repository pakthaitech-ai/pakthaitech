const fs=require('fs');const p='src/worker.js';let s=fs.readFileSync(p,'utf8');
const replacements=[
[/<h3>WhatsApp Cloud API[^<]*<\/h3>/,'<h3>WhatsApp Cloud API — live diagnostics</h3>'],
[/Current Meta status: partner-alert template submitted for review; phone verification still required\. Refresh WhatsBox for live status\. No outbound message is sent automatically\./,'Live Meta readiness is shown by the diagnostics below. A valid phone lookup, approved template, and app subscription do not alone prove delivery; send only after Owner approval and confirm the delivery receipt. No outbound message is sent automatically.'],
[/Catalog sync: PARTIAL[^']*some products failed/,'Catalog sync: PARTIAL — cycle incomplete or products failed']
];
for(const [re,repl] of replacements){const m=s.match(re);if(!m){console.error('Pattern not found:',String(re));process.exit(2)}console.log('Replacing:',m[0].slice(0,120));s=s.replace(re,repl)}
fs.copyFileSync(p,p+'.bak-final-audit-20261015');fs.writeFileSync(p,s,'utf8');console.log('Patched 3 dashboard status strings; backup saved.');
