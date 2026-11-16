const fs=require('fs');const p='D:/pakthai/PakThai-Tech-AI-Sourcing-FINAL/tools/audit/security-hardening.test.mjs';let s=fs.readFileSync(p,'utf8');
const old='  assert.match(worker, /if \\(!settingBool\\(automationSettings,"auto_search_enabled",true\\)\\)/);';
const replacement='  assert.match(worker, /async function runScheduledProspectDiscovery\\(env\\)/);\n  assert.match(worker, /ctx\\.waitUntil\\(runScheduledProspectDiscovery\\(env\\)\\)/);\n  assert.match(worker, /prospect_discovery_cursor/);\n  assert.match(worker, /if \\(masterMode\\(settings\\) !== "on" \\|\\| !settingBool\\(settings, "auto_search_enabled", true\\)\\)/);';
if(!s.includes(old))throw new Error('test assertion anchor missing');
s=s.replace(old,replacement);fs.writeFileSync(p,s,'utf8');console.log('updated schedule regression assertion');
