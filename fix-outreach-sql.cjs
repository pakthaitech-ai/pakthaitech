const fs=require('fs');const p='D:/pakthai/PakThai-Tech-AI-Sourcing-FINAL/src/outreach-scheduler.js';let s=fs.readFileSync(p,'utf8');
const bad='  await db.prepare("UPDATE outreach_campaigns SET status="paused_unverified_seed",next_action_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE LOWER(recipient) IN ("+placeholders+") AND status IN ("queued","followup_due") AND touch_count=0")\n    .bind(...LEGACY_SEED_RECIPIENTS).run();';
const good='  await db.prepare("UPDATE outreach_campaigns SET status=?,next_action_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE LOWER(recipient) IN ("+placeholders+") AND status IN (?,?) AND touch_count=0")\n    .bind("paused_unverified_seed",...LEGACY_SEED_RECIPIENTS,"queued","followup_due").run();';
if(!s.includes(bad))throw new Error('bad seed update line not found');
s=s.replace(bad,good);fs.writeFileSync(p,s,'utf8');console.log('fixed outreach SQL placeholders');
