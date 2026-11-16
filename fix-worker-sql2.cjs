const fs=require('fs');const p='D:/pakthai/PakThai-Tech-AI-Sourcing-FINAL/src/worker.js';let s=fs.readFileSync(p,'utf8');
s=s.replace('env.DB.prepare("SELECT value FROM settings WHERE key="prospect_discovery_cursor"").first()','env.DB.prepare("SELECT value FROM settings WHERE key=?").bind("prospect_discovery_cursor").first()');
s=s.replace('env.DB.prepare("INSERT INTO settings(key,value) VALUES("prospect_discovery_last_status",?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(result))','env.DB.prepare("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind("prospect_discovery_last_status",JSON.stringify(result))');
fs.writeFileSync(p,s,'utf8');console.log('fixed cursor/status SQL');
