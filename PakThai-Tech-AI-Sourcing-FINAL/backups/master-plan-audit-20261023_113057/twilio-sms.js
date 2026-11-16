import { getSession } from "./auth-session.js";

const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const response = (body, status = 200) => Response.json(body, { status, headers });
const RECIPIENTS = {
  owner: { label: "Owner", number: "+923007982289" },
  nadeem: { label: "M. Nadeem — South Korea", number: "+821068879265" }
};
const configured = env => Boolean(String(env.TWILIO_ACCOUNT_SID || "").trim() && String(env.TWILIO_AUTH_TOKEN || "").trim() && String(env.TWILIO_FROM_NUMBER || "").trim());

export async function handleTwilioSms(request, env) {
  const url = new URL(request.url);
  if (!["/api/notifications/sms-status", "/api/notifications/sms-test"].includes(url.pathname)) return null;
  const session = await getSession(request, env);
  if (session?.role !== "owner" || !session?.nonce) return response({ ok:false, error:"Owner login required." }, 401);

  if (url.pathname === "/api/notifications/sms-status" && request.method === "GET") {
    return response({
      ok:true, provider:"twilio-sms",
      account_sid_configured:Boolean(String(env.TWILIO_ACCOUNT_SID || "").trim()),
      auth_token_configured:Boolean(String(env.TWILIO_AUTH_TOKEN || "").trim()),
      sender_configured:Boolean(String(env.TWILIO_FROM_NUMBER || "").trim()),
      callback_configured:Boolean(String(env.TWILIO_STATUS_CALLBACK_URL || "").trim()),
      ready:configured(env),
      recipients:Object.entries(RECIPIENTS).map(([key, item])=>({key,label:item.label,number:item.number,status:"Pending"})),
      note:configured(env) ? "Credentials are present. Run an explicitly confirmed test; provider acceptance is not delivery proof." : "SMS sending disabled until Twilio credentials and an SMS-capable sender are configured."
    });
  }
  if (request.method !== "POST") return response({ok:false,error:"Method not allowed."},405);
  let body = {};
  try { body = await request.json(); } catch {}
  if (body.owner_confirmed !== true) return response({ok:false,error:"Explicit Owner confirmation is required before sending an SMS."},400);
  const recipientKey = String(body.recipient || "");
  const recipient = RECIPIENTS[recipientKey];
  if (!recipient) return response({ok:false,error:"Recipient must be the preconfigured Owner or M. Nadeem test contact."},400);
  const message = String(body.message || "").trim();
  if (!message || message.length > 320) return response({ok:false,error:"SMS text must contain 1–320 characters."},400);
  if (!configured(env)) return response({ok:false,provider:"twilio-sms",status:"Pending",recipient:recipient.label,error:"Twilio is not configured. No SMS was sent.",required_secrets:["TWILIO_ACCOUNT_SID","TWILIO_AUTH_TOKEN","TWILIO_FROM_NUMBER"]},503);

  const form = new URLSearchParams({ To:recipient.number, From:String(env.TWILIO_FROM_NUMBER).trim(), Body:message });
  const callback = String(env.TWILIO_STATUS_CALLBACK_URL || "").trim();
  if (callback) form.set("StatusCallback",callback);
  const sid = String(env.TWILIO_ACCOUNT_SID).trim();
  const token = String(env.TWILIO_AUTH_TOKEN).trim();
  const auth = btoa(sid + ":" + token);
  let providerResponse, result;
  try {
    providerResponse = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + encodeURIComponent(sid) + "/Messages.json", {
      method:"POST", headers:{ "authorization":"Basic " + auth, "content-type":"application/x-www-form-urlencoded" }, body:form.toString()
    });
    result = await providerResponse.json().catch(()=>({}));
  } catch {
    return response({ok:false,provider:"twilio-sms",status:"Failed",recipient:recipient.label,error:"Twilio request failed before a provider result was received. Check Worker logs."},502);
  }
  if (!providerResponse.ok || !result.sid) {
    const detail = String(result?.message || result?.detail || "Twilio rejected the request.").replace(/[\r\n\t]+/g," ").slice(0,220);
    return response({ok:false,provider:"twilio-sms",status:"Failed",recipient:recipient.label,provider_code:result?.code || null,error:detail},502);
  }
  const rawStatus = String(result.status || "accepted").toLowerCase();
  const status = ["queued","accepted","scheduled","sending"].includes(rawStatus) ? "Sent" :
    rawStatus === "delivered" ? "Delivered" :
    rawStatus === "read" ? "Read" :
    ["failed","undelivered","canceled"].includes(rawStatus) ? "Failed" : "Sent";
  return response({
    ok:true,provider:"twilio-sms",accepted:true,status,recipient:recipient.label,
    message_sid:String(result.sid),provider_status:rawStatus,
    error_code:result.error_code || null,
    note:status === "Delivered" ? "Twilio reports delivered." : "Provider accepted/queued the SMS; this is not proof of delivery. Configure the status callback to track final delivery."
  },200);
}
