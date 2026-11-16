const json = (data, status = 200) => new Response(JSON.stringify(data), {status,headers:{"content-type":"application/json; charset=utf-8"}});
const hex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function validSignature(raw, signature, secret) {
  if (!secret || !signature?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const expected = "sha256="+hex(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)));
  return expected.length===signature.length && [...expected].every((c,i)=>c===signature[i]);
}
async function send(env,to,body) {
  const id=String(env.WHATSAPP_PHONE_NUMBER_ID||"1359558747244650").trim();
  const token=String(env.WHATSAPP_ACCESS_TOKEN||"").trim();
  if(!token) throw new Error("WhatsApp Cloud API token missing");
  const version=String(env.WHATSAPP_GRAPH_API_VERSION||"v26.0").trim();
  const r=await fetch("https://graph.facebook.com/"+version+"/"+id+"/messages",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify({messaging_product:"whatsapp",to,type:"text",text:{preview_url:false,body}})});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j?.error?.message||"WhatsApp send failed HTTP "+r.status);
  return j?.messages?.[0]?.id||null;
}
async function replyFor(env, text) {
  const q=String(text||"").trim().toLowerCase();
  if(/catalog|catalogue|product|price|قیمت|کیٹلاگ/.test(q)) {
    const rows=await env.DB.prepare("SELECT title,price_pkr,available FROM products WHERE title IS NOT NULL AND TRIM(title)<>'' ORDER BY available DESC,title COLLATE NOCASE LIMIT 8").all();
    const items=(rows.results||[]).map(p=>"- "+p.title+" — PKR "+Number(p.price_pkr||0).toLocaleString("en-PK")+(Number(p.available)===1?" (available)":"")).join("\n");
    return "PAKTHAI TECH — Product catalogue\n"+(items||"Please tell us the product name you need.")+"\n\nFull catalogue: https://pakthai-tech-store.pages.dev/\nTell us the product and quantity for a quote. Final price and sourcing require owner confirmation.";
  }
  if(/order|buy|purchase|quote|quotation|خرید|آرڈر/.test(q)) return "Thank you for contacting PAKTHAI TECH. Please send the product name, quantity, your city, and target budget. Our sourcing team will check availability and confirm the quote. No order or payment is confirmed until owner approval. Catalogue: https://pakthai-tech-store.pages.dev/";
  return "Assalam-o-Alaikum! Welcome to PAKTHAI TECH. I can help with product catalogue, prices, availability, and sourcing. Please send a product name or type CATALOG. https://pakthai-tech-store.pages.dev/";
}
export async function handleWhatsAppWebhook(request,env) {
  const url=new URL(request.url);
  if(url.pathname!=="/api/whatsapp/webhook") return null;
  if(request.method==="GET") {
    const mode=url.searchParams.get("hub.mode");
    const token=url.searchParams.get("hub.verify_token");
    const challenge=url.searchParams.get("hub.challenge");
    if(mode==="subscribe" && env.WHATSAPP_VERIFY_TOKEN && token===env.WHATSAPP_VERIFY_TOKEN) return new Response(challenge||"",{status:200,headers:{"content-type":"text/plain"}});
    return new Response("Webhook verification failed",{status:403});
  }
  if(request.method!=="POST") return new Response("Method not allowed",{status:405});
  const raw=await request.text();
  if(!await validSignature(raw,request.headers.get("x-hub-signature-256"),env.WHATSAPP_APP_SECRET)) return json({ok:false,error:"Invalid webhook signature"},401);
  let payload;
  try{payload=JSON.parse(raw)}catch{return json({ok:false,error:"Invalid JSON"},400)}
  if(payload.object!=="whatsapp_business_account") return json({ok:true,ignored:true});
  const messages=[];
  for(const entry of payload.entry||[]) for(const change of entry.changes||[]) for(const message of change.value?.messages||[]) {
    if(message.type==="text" && message.from && message.id) messages.push({id:String(message.id),from:String(message.from).replace(/[^0-9]/g,""),text:String(message.text?.body||"").slice(0,4000)});
  }
  for(const m of messages) {
    await env.DB.prepare("CREATE TABLE IF NOT EXISTS whatsapp_inbound (message_id TEXT PRIMARY KEY, sender TEXT NOT NULL, body TEXT, received_at TEXT DEFAULT CURRENT_TIMESTAMP, reply_message_id TEXT, status TEXT NOT NULL DEFAULT 'received', error TEXT)").run();
    const inserted=await env.DB.prepare("INSERT OR IGNORE INTO whatsapp_inbound(message_id,sender,body,status) VALUES(?,?,?,'received')").bind(m.id,m.from,m.text).run();
    if(!Number(inserted.meta?.changes||0)) continue;
    try {
      const answer=await replyFor(env,m.text);
      const replyId=await send(env,m.from,answer);
      await env.DB.prepare("UPDATE whatsapp_inbound SET status='replied',reply_message_id=? WHERE message_id=?").bind(replyId,m.id).run();
    } catch(e) {
      await env.DB.prepare("UPDATE whatsapp_inbound SET status='failed',error=? WHERE message_id=?").bind(String(e?.message||e).slice(0,500),m.id).run();
    }
  }
  return json({ok:true,processed:messages.length});
}
