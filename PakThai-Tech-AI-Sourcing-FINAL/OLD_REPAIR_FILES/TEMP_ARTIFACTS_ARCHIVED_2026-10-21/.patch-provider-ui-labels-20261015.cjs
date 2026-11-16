const fs=require('fs'); const p='src/worker.js'; let s=fs.readFileSync(p,'utf8');
const pairs=[
['This route does not require Meta/WhatsApp phone verification. Automated WhatsApp/Meta API sending is paused and is not used by this delivery route. Historical WhatsBox records are retained; this panel will not call Meta diagnostics or request verification codes.','This active route is independent of the retired WhatsApp setup. Automated WhatsApp sending is paused. Historical WhatsBox records are retained; this panel will not run legacy-provider diagnostics or request verification codes.'],
['Legacy WhatsApp inbox is paused during provider migration. No Meta API diagnostics are run from this dashboard. Use the Owner-approved partner email queue; historical records remain stored.','Legacy WhatsBox inbox is paused during provider migration. No legacy-provider diagnostics or verification requests are run from this dashboard. Use the Owner-approved partner email queue; historical records remain stored.'],
['Meta/WhatsApp automated delivery is paused; use the active email queue instead.','Automated WhatsApp delivery is paused; use the active email queue instead.'],
['No Meta diagnostics are requested from this panel.','No legacy-provider diagnostics are requested from this panel.'],
['Historical WhatsApp delivery records are retained but not refreshed from Meta.','Historical WhatsApp delivery records are retained but not refreshed from the retired provider.']
];
for(const [a,b] of pairs){if(!s.includes(a)) throw new Error('Expected text missing: '+a.slice(0,70)); s=s.replace(a,b);}
const re=/<summary style="cursor:pointer;font-weight:700">WhatsBox.*?WhatsApp Conversations<\/summary>/s;
if(!re.test(s)) throw new Error('WhatsBox summary label not found');
s=s.replace(re,'<summary style="cursor:pointer;font-weight:700">Legacy WhatsBox — paused</summary>');
fs.writeFileSync(p,s,'utf8'); console.log('PATCH_OK: removed stale verification instructions and renamed legacy inbox.');
