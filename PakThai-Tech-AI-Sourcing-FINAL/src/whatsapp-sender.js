import { ensureWhatsAppFreeWindowTables } from "./whatsapp-free-window.js";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};
const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", ...CORS }
});
const digits = value => String(value || "").replace(/\D/g, "");

export async function handleWhatsAppSend(request, env, body, getSession, ensureWhatsAppStatusTable) {
  const owner = await getSession(request, env);
  if (owner?.role !== "owner" || !owner?.nonce) return json({ok:false,error:"Owner login required"},401);
  // Outbound sending is additionally blocked by WHATSAPP_AUTOMATION_ENABLED until the Owner confirms Meta verification.
  if (String(env.WHATSAPP_AUTOMATION_ENABLED || "").toLowerCase() !== "true") return json({ok:false,sent:false,error:"WhatsApp automation is disabled pending Owner confirmation of Meta phone verification. No message was sent."},423);
  const id = Math.floor(Number(body?.notification_id)||0);
  if (!id) return json({ok:false,error:"notification_id is required"},400);
  const item = await env.DB.prepare("SELECT id,type,channel,recipient,message,related_type,related_id,status FROM notifications WHERE id=? LIMIT 1").bind(id).first();
  if (!item) return json({ok:false,error:"Notification not found."},404);
  if (item.channel !== "whatsapp" || item.type !== "external") return json({ok:false,error:"Only external WhatsApp queue records can be sent."},409);
  if (!["prepared","approved"].includes(String(item.status||""))) return json({ok:false,error:"Notification is not eligible for sending."},409);
  if (item.related_type !== "partner_lead" || !item.related_id) return json({ok:false,error:"Only a saved partner-lead notification can use the approved partner-alert template."},409);

  const token = String(env.WHATSAPP_ACCESS_TOKEN||"").trim();
  const phoneId = String(env.WHATSAPP_PHONE_NUMBER_ID||"").trim();
  const wabaId = String(env.WHATSAPP_WABA_ID||"").trim();
  const version = String(env.WHATSAPP_GRAPH_API_VERSION||"v26.0").trim();
  if (!token || !phoneId || !wabaId) return json({ok:false,error:"WhatsApp Cloud API credentials are incomplete."},409);

  const getMeta = async path => {
    const r = await fetch("https://graph.facebook.com/"+version+"/"+path,{headers:{Authorization:"Bearer "+token}});
    return {ok:r.ok,status:r.status,data:await r.json().catch(()=>({}))};
  };
  let phoneCheck, wabaPhones, templates;
  try {
    [phoneCheck,wabaPhones,templates] = await Promise.all([
      getMeta(encodeURIComponent(phoneId)+"?fields=id,display_phone_number,code_verification_status,status,platform_type"),
      getMeta(encodeURIComponent(wabaId)+"/phone_numbers?fields=id,display_phone_number&limit=100"),
      getMeta(encodeURIComponent(wabaId)+"/message_templates?fields=name,status,language&limit=100")
    ]);
  } catch (e) {
    return json({ok:false,error:"Could not verify live Meta readiness; no message was sent.",detail:String(e?.message||e).slice(0,180)},502);
  }
  if (!phoneCheck.ok || !wabaPhones.ok || !templates.ok) {
    const failed = [phoneCheck,wabaPhones,templates].find(x=>!x.ok);
    return json({ok:false,error:failed?.data?.error?.message||"Meta readiness lookup failed; no message was sent.",meta_error_code:failed?.data?.error?.code||null},502);
  }
  const phone = phoneCheck.data;
  const senderDigits = String(phone.display_phone_number||"").replace(/\D/g,"");
  const linked = (wabaPhones.data.data||[]).some(x=>String(x.id)===phoneId && String(x.display_phone_number||"").replace(/\D/g,"")===senderDigits);
  if (!linked || senderDigits !== "923007982289" || phone.platform_type !== "CLOUD_API") return json({ok:false,error:"Safety stop: configured sender is not the PakThai Tech Pakistan Cloud API number. No message was sent."},409);
  if (String(phone.code_verification_status||"").toUpperCase() !== "VERIFIED") return json({ok:false,error:"Meta phone ownership verification is still incomplete. No message was sent."},409);
  if (String(phone.status||"").toUpperCase() !== "CONNECTED") return json({ok:false,error:"Meta phone status is not CONNECTED. No message was sent."},409);

  const template = (templates.data.data||[]).find(x=>x.name==="pakthai_partner_lead_alert" && x.language==="en_US");
  if (!template || String(template.status||"").toUpperCase() !== "APPROVED") return json({ok:false,error:"Meta partner-alert template is not APPROVED yet. No message was sent.",template_status:template?.status||"MISSING"},409);
  const recipient = digits(item.recipient);
  if (recipient.length<8 || recipient.length>20) return json({ok:false,error:"Partner recipient phone number is invalid."},400);

  // Consent is checked here as well as in the free-window dispatcher so this manual/template route cannot bypass it.
  try {
    await ensureWhatsAppFreeWindowTables(env.DB);
    const partners = await env.DB.prepare("SELECT id,name,contact FROM sourcing_partners WHERE active=1 AND contact IS NOT NULL").all();
    const partner = (partners.results || []).find(p => digits(p.contact) === recipient);
    if (!partner) return json({ok:false,sent:false,error:"Safety stop: recipient is not the contact number of a currently active sourcing partner. No message was sent."},409);
    const optin = await env.DB.prepare("SELECT o.phone,o.partner_id,o.active FROM whatsapp_partner_optins o JOIN sourcing_partners p ON p.id=o.partner_id WHERE o.phone=? AND o.partner_id=? AND o.active=1 AND p.active=1 LIMIT 1").bind(recipient,partner.id).first();
    if (!optin) return json({ok:false,sent:false,error:"Safety stop: this active partner has no recorded WhatsApp opt-in. Ask the partner to send START first. No message was sent."},409);
  } catch (e) {
    return json({ok:false,sent:false,error:"Could not verify partner consent safely; no message was sent.",detail:String(e?.message||e).slice(0,160)},502);
  }

  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE channel='whatsapp' AND status IN ('sent','delivered','read') AND created_at >= datetime('now','-1 day')").first();
  if (Number(recent?.n||0)>=10) return json({ok:false,error:"WhatsApp outbound safety cap reached (10 per rolling 24 hours)."},429);
  const duplicate = await env.DB.prepare("SELECT id FROM notifications WHERE channel='whatsapp' AND lower(recipient)=lower(?) AND status IN ('sent','delivered','read') AND created_at >= datetime('now','-1 day') AND id<>? LIMIT 1").bind(recipient,id).first();
  if (duplicate) return json({ok:false,error:"This recipient already received a WhatsApp message within the last 24 hours."},429);

  const pick = (label,fallback="Not specified") => {
    const match = String(item.message||"").match(new RegExp("^"+label+":\\s*(.+)$","im"));
    return String(match?.[1]||fallback).trim().slice(0,240);
  };
  const product = pick("Product \\/ requirement",pick("Product"));
  const quantity = pick("Quantity","1").slice(0,80);
  const city = pick("Destination city","Pakistan");
  const country = pick("Country","Pakistan");
  const destination = [city,country].filter((v,i,a)=>v&&a.indexOf(v)===i).join(", ").slice(0,240);
  const payload = {messaging_product:"whatsapp",recipient_type:"individual",to:recipient,type:"template",template:{name:"pakthai_partner_lead_alert",language:{code:"en_US"},components:[{type:"body",parameters:[{type:"text",text:product},{type:"text",text:quantity},{type:"text",text:destination},{type:"text",text:"PT-"+String(item.related_id)}]}]}};

  const claimed = await env.DB.prepare("UPDATE notifications SET status='sending' WHERE id=? AND status IN ('prepared','approved')").bind(id).run();
  if (!claimed.meta?.changes) return json({ok:false,error:"This notification is no longer approved for sending. Refresh the queue before retrying."},409);
  try {
    const r = await fetch("https://graph.facebook.com/"+version+"/"+encodeURIComponent(phoneId)+"/messages",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data = await r.json().catch(()=>({}));
    if (!r.ok) {
      await env.DB.prepare("UPDATE notifications SET status='approved' WHERE id=? AND status='sending'").bind(id).run();
      return json({ok:false,sent:false,error:data?.error?.message||("Meta message send failed (HTTP "+r.status+")."),meta_error_code:data?.error?.code||null,meta_error_subcode:data?.error?.error_subcode||null},502);
    }
    const messageId = data?.messages?.[0]?.id||null;
    await env.DB.prepare("UPDATE notifications SET status='sent' WHERE id=? AND status='sending'").bind(id).run();
    if (messageId) {
      try {
        await ensureWhatsAppStatusTable(env.DB);
        await env.DB.prepare("INSERT OR REPLACE INTO whatsapp_message_status(message_id,recipient,status,status_timestamp,notification_id,updated_at) VALUES(?,?,'sent',?,?,CURRENT_TIMESTAMP)").bind(messageId,recipient,String(Math.floor(Date.now()/1000)),id).run();
      } catch (_) {}
    }
    return json({ok:true,sent:true,status:"sent",notification_id:id,message_id:messageId,delivery_confirmed:false,note:"Meta accepted the message; recipient delivery is not yet confirmed."});
  } catch (e) {
    await env.DB.prepare("UPDATE notifications SET status='unconfirmed' WHERE id=? AND status='sending'").bind(id).run().catch(()=>{});
    return json({ok:false,sent:false,unconfirmed:true,error:"Meta send outcome could not be confirmed. Check WhatsApp delivery status before retrying.",detail:String(e?.message||e).slice(0,180)},502);
  }
}
