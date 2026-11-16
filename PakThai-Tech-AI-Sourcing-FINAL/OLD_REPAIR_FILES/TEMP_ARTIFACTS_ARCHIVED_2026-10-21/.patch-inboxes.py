from pathlib import Path

def rep(src, old, new, label):
    n=src.count(old)
    if n != 1: raise RuntimeError(f'{label}: expected 1 match, got {n}')
    return src.replace(old,new,1)

wp=Path('src/worker.js'); gp=Path('src/gmail-oauth.js')
w=wp.read_text(encoding='utf-8'); g=gp.read_text(encoding='utf-8')
# Gmail mailbox helpers
g=rep(g, '''function mimeB64(text) {
  const bytes = new TextEncoder().encode(text);
  return b64url(bytes);
}
''', r'''function mimeB64(text) {
  const bytes = new TextEncoder().encode(text);
  return b64url(bytes);
}
function decodeGmailBody(value) {
  if (!value) return "";
  try { const normalized=String(value).replace(/-/g,"+").replace(/_/g,"/"); const padded=normalized+"=".repeat((4-normalized.length%4)%4); const bin=atob(padded); return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))); } catch { return ""; }
}
function gmailPlainBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeGmailBody(payload.body.data);
  for (const part of (payload.parts || [])) { const found=gmailPlainBody(part); if (found) return found; }
  return "";
}
''','Gmail helpers')
g=rep(g, 'if (!["/auth/google/start", "/auth/google/callback", "/api/gmail/status", "/api/notifications/gmail-send"].includes(path)) return null;', 'if (!["/auth/google/start", "/auth/google/callback", "/api/gmail/status", "/api/gmail/inbox", "/api/notifications/gmail-send"].includes(path)) return null;', 'Gmail allowlist')
g=rep(g, '  const redirectUri = url.origin + "/auth/google/callback";', r'''  if (path === "/api/gmail/inbox" && request.method === "GET") {
    const owner = await getSession(request,env);
    if (owner?.role !== "owner" || !owner?.nonce) return new Response(JSON.stringify({ok:false,error:"Owner login required"}),{status:401,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return new Response(JSON.stringify({ok:false,error:"Gmail OAuth secrets are not configured"}),{status:503,headers:{"content-type":"application/json"}});
    const auth = await env.DB.prepare("SELECT refresh_token FROM gmail_oauth WHERE id=1").first();
    if (!auth?.refresh_token) return new Response(JSON.stringify({ok:false,error:"Gmail is not authorized"}),{status:409,headers:{"content-type":"application/json"}});
    const tokenResp = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:auth.refresh_token,grant_type:"refresh_token"})});
    const token = await tokenResp.json();
    if (!tokenResp.ok || !token.access_token) return new Response(JSON.stringify({ok:false,error:"Gmail token refresh failed; reconnect Gmail"}),{status:502,headers:{"content-type":"application/json"}});
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages"); listUrl.searchParams.set("q","in:inbox"); listUrl.searchParams.set("maxResults","15");
    const listedResp = await fetch(listUrl.toString(),{headers:{Authorization:"Bearer "+token.access_token}}); const listed = await listedResp.json().catch(()=>({}));
    if (!listedResp.ok) return new Response(JSON.stringify({ok:false,error:listed?.error?.message||"Gmail inbox read failed"}),{status:502,headers:{"content-type":"application/json"}});
    const messages = await Promise.all((listed.messages||[]).slice(0,15).map(async item=>{
      const resp=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(item.id)+"?format=full",{headers:{Authorization:"Bearer "+token.access_token}}); const m=await resp.json().catch(()=>({}));
      if(!resp.ok)return {id:item.id,subject:"Message details unavailable",snippet:"Could not read this message"};
      const hs=m.payload?.headers||[]; const getHeader=name=>hs.find(h=>String(h.name||"").toLowerCase()===name.toLowerCase())?.value||"";
      return {id:m.id,threadId:m.threadId,from:getHeader("From"),to:getHeader("To"),subject:getHeader("Subject")||"(no subject)",date:getHeader("Date"),snippet:String(m.snippet||""),body:gmailPlainBody(m.payload).slice(0,8000),unread:(m.labelIds||[]).includes("UNREAD")};
    }));
    return new Response(JSON.stringify({ok:true,count:messages.length,messages}),{headers:{"content-type":"application/json","Cache-Control":"no-store"}});
  }

  const redirectUri = url.origin + "/auth/google/callback";''','Gmail inbox route')
# WhatsApp inbox storage
w=rep(w, 'async function ensureWhatsAppStatusTable(db) {\n  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_message_status (', 'async function ensureWhatsAppStatusTable(db) {\n  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_inbox_messages (message_id TEXT PRIMARY KEY, sender TEXT NOT NULL, sender_name TEXT, message_type TEXT, message_text TEXT, message_timestamp TEXT, received_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run();\n  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_message_status (','WhatsApp inbox table')
w=rep(w, '  let updates = 0;\n  for (const entry of payload.entry || []) {', '  let updates = 0;\n  let inboundMessages = 0;\n  for (const entry of payload.entry || []) {','Webhook counters')
w=rep(w, '      const value = change.value || {};\n      for (const item of value.statuses || []) {', r'''      const value = change.value || {};
      const contactNames = new Map((value.contacts || []).map(c => [String(c.wa_id || ""), String(c.profile?.name || "")]));
      for (const incoming of value.messages || []) {
        if (!incoming.id || !incoming.from) continue;
        const type = String(incoming.type || "unknown");
        const textBody = type === "text" ? String(incoming.text?.body || "") : ["image","document","video"].includes(type) ? String(incoming[type]?.caption || "[" + type + " message]") : "[" + type + " message]";
        const timestamp = incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000).toISOString() : new Date().toISOString();
        await env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_inbox_messages(message_id,sender,sender_name,message_type,message_text,message_timestamp) VALUES(?,?,?,?,?,?)`).bind(String(incoming.id),String(incoming.from),contactNames.get(String(incoming.from)) || "",type,textBody.slice(0,8000),timestamp).run();
        inboundMessages++;
      }
      for (const item of value.statuses || []) {''','Webhook inbound messages')
w=rep(w, '  return json({ ok: true, status_updates_processed: updates });', '  return json({ ok: true, status_updates_processed: updates, inbound_messages_processed: inboundMessages });','Webhook result')
w=rep(w, "  if (path === '/api/notifications/whatsapp-status' && method === 'GET') {", "  if (path === '/api/notifications/whatsapp-inbox' && method === 'GET') {\n    await ensureWhatsAppStatusTable(env.DB);\n    const r = await env.DB.prepare(`SELECT message_id,sender,sender_name,message_type,message_text,message_timestamp,received_at FROM whatsapp_inbox_messages ORDER BY COALESCE(message_timestamp,received_at) DESC LIMIT 100`).all();\n    return json({ ok:true, messages:r.results||[] });\n  }\n  if (path === '/api/notifications/whatsapp-status' && method === 'GET') {",'WhatsApp inbox API')
w=rep(w, "url.pathname === '/api/notifications/whatsapp-status' || url.pathname === '/api/notifications/approve'", "url.pathname === '/api/notifications/whatsapp-status' || url.pathname === '/api/notifications/whatsapp-inbox' || url.pathname === '/api/notifications/approve'",'Protected dispatch')
# Collapsible panels and client rendering
w=rep(w, '<div class=card style=margin-top:16px><h3>AI Outbound Message Queue</h3>', r'''<div class=card style=margin-top:16px><h3>Inbox Center</h3><p>Mailbox and WhatsBox stay collapsed until you open them. Select any message to read its content.</p><details style="border:1px solid #d7dee8;border-radius:10px;padding:12px;margin:10px 0"><summary style="cursor:pointer;font-weight:700">Mailbox — Gmail Inbox</summary><p><button onclick="loadGmailMailbox()">Refresh Mailbox</button></p><div id="gmailMailbox" aria-live="polite">Open and refresh to load recent Gmail messages.</div></details><details style="border:1px solid #d7dee8;border-radius:10px;padding:12px;margin:10px 0"><summary style="cursor:pointer;font-weight:700">WhatsBox — WhatsApp Conversations</summary><p><button onclick="loadWhatsAppMailbox()">Refresh WhatsBox</button></p><div id="whatsAppMailbox" aria-live="polite">Open and refresh to load inbound WhatsApp messages and outgoing status.</div></details></div><div class=card style=margin-top:16px><h3>AI Outbound Message Queue</h3>''','Inbox UI panels')
w=rep(w, '}async function loadOutboundQueue(){', r''' }async function loadGmailMailbox(){
 const box=document.getElementById('gmailMailbox');if(!box)return;box.textContent='Loading Gmail inbox...';
 try{const r=await api('/api/gmail/inbox');const msgs=r.messages||[];if(!msgs.length){box.textContent='No messages found in Gmail Inbox.';return;}box.innerHTML=msgs.map(m=>'<details style="border-top:1px solid #e5e7eb;padding:9px 0"><summary style="cursor:pointer"><b>'+esc(m.unread?'● ':'')+esc(m.subject||'(no subject)')+'</b><div style="font-size:12px;color:#64748b">'+esc(m.from||'')+' · '+esc(m.date||'')+'</div><div style="font-size:13px">'+esc(m.snippet||'')+'</div></summary><div style="padding:10px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.body||m.snippet||'(No plain-text body available)')+'</div></details>').join('');}
 catch(e){box.textContent='Mailbox error: '+String(e.message||e)+'. Confirm Gmail is connected and Owner session is active.';}
}
async function loadWhatsAppMailbox(){
 const box=document.getElementById('whatsAppMailbox');if(!box)return;box.textContent='Loading WhatsApp messages and delivery status...';
 try{const [inbox,notes,status]=await Promise.all([api('/api/notifications/whatsapp-inbox'),api('/api/notifications'),api('/api/notifications/whatsapp-status')]);const rows=[];for(const m of inbox.messages||[])rows.push({time:m.message_timestamp||m.received_at||'',direction:'INCOMING',peer:m.sender_name?m.sender_name+' · '+m.sender:m.sender,body:m.message_text||'['+(m.message_type||'message')+']',status:'Received',id:m.message_id});const sm=new Map((status.messages||[]).filter(m=>m.notification_id).map(m=>[Number(m.notification_id),m]));for(const n of notes.notifications||[]){if(n.channel!=='whatsapp'||!['sent','failed','approved','prepared'].includes(String(n.status)))continue;const d=sm.get(Number(n.id));const st=d?({accepted:'API accepted — delivery unconfirmed',sent:'Sent',delivered:'Delivered',read:'Read',failed:'Failed'}[String(d.status).toLowerCase()]||d.status):n.status==='sent'?'Sent — no WhatsApp receipt':'Not sent';rows.push({time:n.sent_at||n.created_at||'',direction:'OUTGOING',peer:n.recipient||'',body:n.message||n.subject||'',status:st,id:d?.message_id||('notification '+n.id),error:d?.error_message||''});}rows.sort((a,b)=>String(b.time).localeCompare(String(a.time)));if(!rows.length){box.textContent='No WhatsApp conversations or outbound messages found yet.';return;}box.innerHTML=rows.slice(0,50).map(m=>'<details style="border-top:1px solid #e5e7eb;padding:9px 0"><summary style="cursor:pointer"><b>'+esc(m.direction)+' · '+esc(m.peer)+'</b><div style="font-size:12px;color:#64748b">'+esc(m.time)+' · '+esc(m.status)+'</div><div style="font-size:13px">'+esc(String(m.body||'').slice(0,180))+'</div></summary><div style="padding:10px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.body||'')+'\n\nStatus: '+esc(m.status)+'\nMessage ID: '+esc(m.id||'')+(m.error?'\nError: '+esc(m.error):'')+'</div></details>').join('');}
 catch(e){box.textContent='WhatsBox error: '+String(e.message||e)+'. Refresh after Owner login.';}
}
async function loadOutboundQueue(){''','Inbox UI functions')
wp.write_text(w,encoding='utf-8'); gp.write_text(g,encoding='utf-8')
print('PATCH_OK: Gmail inbox endpoint; WhatsApp inbound webhook storage/API; collapsible Mailbox/WhatsBox UI.')
