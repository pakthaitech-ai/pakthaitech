const fs=require('fs');
const root='D:/pakthai/PakThai-Tech-AI-Sourcing-FINAL';
const p=root+'/src/worker.js'; let s=fs.readFileSync(p,'utf8');
const begin=s.indexOf('    // Keep the original three free-plan cron triggers.');
const end=s.indexOf('\n  },\n\n  async fetch(request, env)',begin);
if(begin<0||end<0)throw new Error('scheduled handler boundaries missing');
const cron=[
'    // Keep the existing three free-plan cron triggers. Run one real discovery job per hour',
'    // so all five markets rotate every five hours without parallel public-map bursts.',
'    const cron = String(event?.cron || "").trim();',
'    if (cron === "0 * * * *") {',
'      ctx.waitUntil(runGmailAutoReply(env));',
'      ctx.waitUntil(runScheduledProspectDiscovery(env));',
'      ctx.waitUntil(runScheduledPhase2(env));',
'      return;',
'    }',
'    if (cron === "0 4 * * *") {',
'      ctx.waitUntil(runScheduledOutreach(env));',
'      return;',
'    }',
'    if (cron === "0 2 * * *") {',
'      ctx.waitUntil(runScheduledCatalogSync(env));',
'    }'
].join('\n');
s=s.slice(0,begin)+cron+s.slice(end);
const anchor='async function runScheduledPhase2(env) {';
const helper=[
'async function runScheduledProspectDiscovery(env) {',
'  await initDb(env.DB);',
'  const settings = await getSettings(env.DB);',
'  const now = new Date().toISOString();',
'  if (masterMode(settings) !== "on" || !settingBool(settings, "auto_search_enabled", true)) {',
'    const paused = { ok:true, paused:true, reason: masterMode(settings) !== "on" ? "Master AI is OFF." : "Auto Search is OFF.", ran_at:now };',
'    await env.DB.prepare("INSERT INTO settings(key,value) VALUES("prospect_discovery_last_status",?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(paused)).run();',
'    return paused;',
'  }',
'  const jobs = [',
'    { key:"pakistan_buyers", run:() => runScheduledBuyerDiscovery(env.DB) },',
'    { key:"thailand_sellers", run:() => runScheduledSellerDiscovery(env.DB) },',
'    { key:"korea_sellers", run:() => runKoreaSellerDiscovery(env.DB, { scheduled:true }) },',
'    { key:"thailand_buyers", run:() => runMarketBuyerDiscovery(env.DB, "Thailand") },',
'    { key:"korea_buyers", run:() => runMarketBuyerDiscovery(env.DB, "South Korea") }',
'  ];',
'  const cursorRow = await env.DB.prepare("SELECT value FROM settings WHERE key="prospect_discovery_cursor"").first();',
'  const cursor = Math.max(0, Math.floor(Number(cursorRow?.value || 0))) % jobs.length;',
'  const job = jobs[cursor];',
'  try {',
'    const discovery = await job.run();',
'    const screening = discovery?.ok !== false && env.AI?.run ? await runAIProspectScreening(env) : null;',
'    const result = { ok:discovery?.ok !== false && (!screening || screening.ok), paused:false, job:job.key, cursor, next_cursor:(cursor+1)%jobs.length, discovery:discovery||null, screening:screening||null, ran_at:new Date().toISOString() };',
'    await env.DB.batch([',
'      env.DB.prepare("INSERT INTO settings(key,value) VALUES("prospect_discovery_cursor",?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String((cursor+1)%jobs.length)),',
'      env.DB.prepare("INSERT INTO settings(key,value) VALUES("prospect_discovery_last_status",?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result))',
'    ]);',
'    return result;',
'  } catch (error) {',
'    const result = { ok:false, paused:false, job:job.key, cursor, error:String(error?.message||error).slice(0,250), ran_at:new Date().toISOString() };',
'    await env.DB.prepare("INSERT INTO settings(key,value) VALUES("prospect_discovery_last_status",?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result)).run();',
'    await env.DB.prepare("INSERT INTO settings(key,value) VALUES("prospect_discovery_cursor",?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(String((cursor+1)%jobs.length)).run();',
'    return result;',
'  }',
'}',
''
].join('\n');
if(!s.includes(anchor))throw new Error('phase2 anchor missing');
s=s.replace(anchor,helper+anchor);
fs.writeFileSync(p,s,'utf8');
const w=root+'/wrangler.jsonc';let cfg=fs.readFileSync(w,'utf8');
if(!cfg.includes('"OUTBOUND_EMAIL_PROVIDER": "gmail"'))throw new Error('gmail config anchor missing');
if(!cfg.includes('"EMAIL_AUTO_REPLY_ENABLED"'))cfg=cfg.replace('"OUTBOUND_EMAIL_PROVIDER": "gmail",','"OUTBOUND_EMAIL_PROVIDER": "gmail",\n    "EMAIL_AUTO_REPLY_ENABLED": "true",');
fs.writeFileSync(w,cfg,'utf8');
const out=root+'/src/outreach-scheduler.js';let o=fs.readFileSync(out,'utf8');
const seedStart=o.indexOf('const SEEDS = [');const seedEnd=o.indexOf('\n];',seedStart);
if(seedStart<0||seedEnd<0)throw new Error('seed list missing');
const recipients=['info@noresto.com','sale@supreme.co.th','sales.dept@cps.co.th','salesteam@wcdt.co.th','sales@greenwillsolution.com','sales@techglobal.com.pk','laraib@doublemvgapalace.pk','kashif@newtechpk.com'];
o=o.slice(0,seedStart)+'const LEGACY_SEED_RECIPIENTS = '+JSON.stringify(recipients)+';'+o.slice(seedEnd+3);
const loopStart=o.indexOf('  for (const seed of SEEDS) {');const loopEnd=o.indexOf('\n  }',loopStart)+4;
if(loopStart<0||loopEnd<4)throw new Error('seed insertion loop missing');
const pause=[
'  // Pause old hard-coded contacts; preserve their history, but never auto-create cold outreach.',
'  const placeholders = LEGACY_SEED_RECIPIENTS.map(() => "?").join(",");',
'  await db.prepare("UPDATE outreach_campaigns SET status="paused_unverified_seed",next_action_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE LOWER(recipient) IN ("+placeholders+") AND status IN ("queued","followup_due") AND touch_count=0")',
'    .bind(...LEGACY_SEED_RECIPIENTS).run();'
].join('\n');
o=o.slice(0,loopStart)+pause+o.slice(loopEnd);
fs.writeFileSync(out,o,'utf8');
console.log('PATCHED hourly rotating discovery, Gmail draft-only inbox handling, paused hard-coded outreach seeds.');
