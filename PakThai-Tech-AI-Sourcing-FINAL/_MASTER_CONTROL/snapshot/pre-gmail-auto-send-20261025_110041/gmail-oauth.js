// Gmail inbox OAuth plus provider-selectable approved notification sending.
// Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET as Worker secrets.
import { getSession } from "./auth-session.js";
function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function mimeB64(text) {
  const bytes = new TextEncoder().encode(text);
  return b64url(bytes);
}
function decodeGmailBody(value) {
  if (!value) return "";
  try { const normalized=String(value).replace(/-/g,"+").replace(/_/g,"/"); const padded=normalized+"=".repeat((4-normalized.length%4)%4); const bin=atob(padded); return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0))); } catch { return ""; }
}
function collectGmailBodyParts(payload, out = []) {
  if (!payload) return out;
  const mimeType = String(payload.mimeType || "").toLowerCase();
  if (payload.body?.data && (mimeType.startsWith("text/") || mimeType === "message/delivery-status" || mimeType === "message/rfc822")) {
    const text = decodeGmailBody(payload.body.data);
    if (text.trim()) out.push({ mimeType, text });
  }
  for (const part of (payload.parts || [])) collectGmailBodyParts(part, out);
  return out;
}
export function gmailPlainBody(payload) {
  const allowed = new Set(["text/plain", "message/delivery-status", "text/rfc822-headers", "message/rfc822"]);
  const parts = collectGmailBodyParts(payload).filter(part => allowed.has(part.mimeType));
  const unique = parts.filter((part, index, all) => all.findIndex(other => other.mimeType === part.mimeType && other.text === part.text) === index);
  unique.sort((a, b) => {
    const priority = { "message/delivery-status": 0, "text/plain": 1, "text/rfc822-headers": 2, "message/rfc822": 3 };
    return (priority[a.mimeType] ?? 9) - (priority[b.mimeType] ?? 9);
  });
  if (!unique.length) return "";
  if (unique.length === 1) return unique[0].text;
  return unique.map(part => "--- " + part.mimeType + " ---\n" + part.text).join("\n\n");
}
function addBusinessDays(startValue, count) {
  const d = new Date(startValue);
  let added = 0;
  while (added < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0) added++;
  }
  return d.toISOString();
}
function makeMime(to, subject, body) {
  const safe = (s) => String(s || "").replace(/[\r\n]+/g, " ").trim();
  const raw = [
    "From: pakthaitech@gmail.com",
    "To: " + safe(to),
    "Subject: " + safe(subject),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    String(body || "")
  ].join("\r\n");
  return mimeB64(raw);
}

async function ensureTables(db) {
  await db.prepare("CREATE TABLE IF NOT EXISTS gmail_oauth (id INTEGER PRIMARY KEY CHECK(id=1), refresh_token TEXT, updated_at TEXT)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS gmail_oauth_state (state TEXT PRIMARY KEY, expires_at INTEGER, owner_session_nonce TEXT)").run();
  try { await db.prepare("ALTER TABLE gmail_oauth_state ADD COLUMN owner_session_nonce TEXT").run(); } catch {}
}

async function sendResendEmail(env, to, subject, body) {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const from = String(env.RESEND_FROM_EMAIL || "").trim();
  const recipient = String(to || "").trim();
  if (!apiKey || !from) throw new Error("Resend API key and verified sender are not configured.");
  if (!recipient || recipient.length > 254 || !recipient.includes("@")) throw new Error("A valid email recipient is required.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [recipient], subject: String(subject || "").slice(0, 998), text: String(body || "") })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.id) throw new Error("Resend email send failed (HTTP " + response.status + ").");
  return { id: String(data.id) };
}
export async function sendAccountSecurityEmail(env, to, subject, body) {
  const provider = String(env.OUTBOUND_EMAIL_PROVIDER || "gmail").trim().toLowerCase();
  if (provider === "resend") {
    await sendResendEmail(env, to, subject, body);
    return true;
  }
  if (provider !== "gmail") throw new Error("Outbound email provider is not supported or configured.");
  if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Gmail is not configured.");
  await ensureTables(env.DB);
  const auth = await env.DB.prepare("SELECT refresh_token FROM gmail_oauth WHERE id=1").first();
  if (!auth?.refresh_token) throw new Error("Gmail authorization is not connected.");
  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:auth.refresh_token,grant_type:"refresh_token"})
  });
  const token = await tokenResp.json();
  if (!tokenResp.ok || !token.access_token) throw new Error("Gmail token refresh failed.");
  const raw = makeMime(to, subject, body);
  const sent = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method:"POST", headers:{Authorization:"Bearer "+token.access_token,"content-type":"application/json"},
    body:JSON.stringify({raw})
  });
  if (!sent.ok) throw new Error("Security email could not be sent.");
  return true;
}

export async function handleGmailOAuth(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!["/auth/google/start", "/auth/google/callback", "/api/gmail/status", "/api/gmail/inbox", "/api/notifications/gmail-send"].includes(path)) return null;
  if (!env.DB) return new Response("Database binding missing", {status:500});
  await ensureTables(env.DB);

  if (path === "/api/gmail/status" && request.method === "GET") {
    const row = await env.DB.prepare("SELECT refresh_token,updated_at FROM gmail_oauth WHERE id=1").first();
    const provider = String(env.OUTBOUND_EMAIL_PROVIDER || "disabled").trim().toLowerCase();
    const gmailConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && row?.refresh_token);
    const sendingProviderConfigured = provider === "gmail"
      ? gmailConfigured
      : provider === "resend"
        ? Boolean(env.RESEND_API_KEY && env.RESEND_FROM_EMAIL)
        : false;
    return new Response(JSON.stringify({
      ok:true,
      client_id_configured:Boolean(env.GOOGLE_CLIENT_ID),
      client_secret_configured:Boolean(env.GOOGLE_CLIENT_SECRET),
      authorized:Boolean(row?.refresh_token),
      authorized_at:row?.updated_at || null,
      outbound_email_provider:provider,
      sending_provider_configured:sendingProviderConfigured,
      actual_sending_ready:sendingProviderConfigured,
      sending_note:sendingProviderConfigured
        ? "Provider configuration is present; each external email still requires Owner approval and provider acceptance does not prove recipient delivery."
        : "Outbound email provider is disabled or missing configuration; queued emails cannot be sent until it is configured."
    }), {headers:{"content-type":"application/json","Cache-Control":"no-store"}});
  }

  if (path === "/api/gmail/inbox" && request.method === "GET") {
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

  if (path === "/api/gmail/delete" && request.method === "POST") {
    const owner = await getSession(request,env);
    if (owner?.role !== "owner" || !owner?.nonce) return new Response(JSON.stringify({ok:false,error:"Owner login required"}),{status:401,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return new Response(JSON.stringify({ok:false,error:"Gmail OAuth secrets are not configured"}),{status:503,headers:{"content-type":"application/json"}});
    let body={}; try { body=await request.json(); } catch {}
    const messageId=String(body.message_id||"").trim();
    if (!messageId || messageId.length>300 || !/^[A-Za-z0-9_-]+$/.test(messageId)) return new Response(JSON.stringify({ok:false,error:"A valid Gmail message ID is required"}),{status:400,headers:{"content-type":"application/json"}});
    const auth = await env.DB.prepare("SELECT refresh_token FROM gmail_oauth WHERE id=1").first();
    if (!auth?.refresh_token) return new Response(JSON.stringify({ok:false,error:"Gmail is not authorized"}),{status:409,headers:{"content-type":"application/json"}});
    const tokenResp = await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:auth.refresh_token,grant_type:"refresh_token"})});
    const token = await tokenResp.json().catch(()=>({}));
    if (!tokenResp.ok || !token.access_token) return new Response(JSON.stringify({ok:false,error:"Gmail token refresh failed; reconnect Gmail and grant mailbox modification access"}),{status:502,headers:{"content-type":"application/json"}});
    const trashed=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(messageId)+"/trash",{method:"POST",headers:{Authorization:"Bearer "+token.access_token}});
    const result=await trashed.json().catch(()=>({}));
    if (!trashed.ok) return new Response(JSON.stringify({ok:false,error:result?.error?.message||"Gmail could not move this message to Trash",needs_reconnect:trashed.status===403}),{status:trashed.status===403?409:502,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({ok:true,deleted:true,message_id:messageId,action:"moved_to_trash"}),{headers:{"content-type":"application/json","Cache-Control":"no-store"}});
  }

  const redirectUri = url.origin + "/auth/google/callback";

  if (path === "/auth/google/start" && request.method === "GET") {
    const owner = await getSession(request,env);
    if (owner?.role !== "owner" || !owner?.nonce) return new Response("Owner login required to connect Gmail.",{status:403,headers:{"Cache-Control":"no-store"}});
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return new Response("Gmail OAuth is not configured yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET Worker secrets first.", {status:503});
    }
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const state = b64url(bytes);
    await env.DB.prepare("INSERT INTO gmail_oauth_state(state,expires_at,owner_session_nonce) VALUES(?,?,?)").bind(state,Date.now()+600000,String(owner.nonce)).run();
    await env.DB.prepare("DELETE FROM gmail_oauth_state WHERE expires_at<=?").bind(Date.now()).run();
    const q = new URLSearchParams({
      client_id:env.GOOGLE_CLIENT_ID,
      redirect_uri:redirectUri,
      response_type:"code",
      scope:"https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify",
      access_type:"offline",
      prompt:"consent",
      state
    });
    return Response.redirect("https://accounts.google.com/o/oauth2/v2/auth?"+q.toString(),302);
  }

  if (path === "/auth/google/callback" && request.method === "GET") {
    const owner = await getSession(request,env);
    if (owner?.role !== "owner" || !owner?.nonce) return new Response("Owner login required to finish Gmail connection.",{status:403,headers:{"Cache-Control":"no-store"}});
    const state=url.searchParams.get("state");
    const code=url.searchParams.get("code");
    if (!state || !code || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return new Response("OAuth parameters or Worker secrets missing",{status:400});
    }
    const saved=await env.DB.prepare("SELECT state,owner_session_nonce FROM gmail_oauth_state WHERE state=? AND expires_at>?").bind(state,Date.now()).first();
    if (!saved || saved.owner_session_nonce !== String(owner.nonce)) return new Response("Invalid, expired, or session-mismatched OAuth state. Start again as Owner.",{status:400,headers:{"Cache-Control":"no-store"}});
    const consumed=await env.DB.prepare("DELETE FROM gmail_oauth_state WHERE state=? AND expires_at>? AND owner_session_nonce=?").bind(state,Date.now(),String(owner.nonce)).run();
    if (!consumed.meta?.changes) return new Response("OAuth state has already been used.",{status:400,headers:{"Cache-Control":"no-store"}});
    const tokenResp=await fetch("https://oauth2.googleapis.com/token",{
      method:"POST",
      headers:{"content-type":"application/x-www-form-urlencoded"},
      body:new URLSearchParams({
        code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,
        redirect_uri:redirectUri,grant_type:"authorization_code"
      })
    });
    const tokens=await tokenResp.json();
    if (!tokenResp.ok) return new Response("Google token exchange failed: " + String(tokens.error || "unknown"),{status:502,headers:{"content-type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
    if (!tokens.refresh_token) return new Response("Google did not return a refresh token. Revoke app access and retry consent.",{status:502});
    await env.DB.prepare("INSERT INTO gmail_oauth(id,refresh_token,updated_at) VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET refresh_token=excluded.refresh_token,updated_at=excluded.updated_at").bind(tokens.refresh_token,new Date().toISOString()).run();
    return new Response("Gmail authorization connected. You can close this tab.",{headers:{"content-type":"text/plain; charset=utf-8"}});
  }

  if (path === "/api/notifications/gmail-send") {
    const expected = String(env.EMAIL_SEND_TOKEN || "").trim();
    const supplied = String(request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const owner = await getSession(request,env);
    const ownerSessionAuthorized = owner?.role === "owner" && Boolean(owner?.nonce);
    const tokenAuthorized = Boolean(expected && supplied && supplied === expected);
    if (!ownerSessionAuthorized && !tokenAuthorized) {
      return new Response(JSON.stringify({error:"Owner session or configured send token required"}), {status:401,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    }
  }

  if (path === "/api/notifications/gmail-send" && request.method === "POST") {
    let emailProvider = String(env.OUTBOUND_EMAIL_PROVIDER || "disabled").trim().toLowerCase();
    let body={};
    try { body=await request.json(); } catch {}
    const id=Math.floor(Number(body.notification_id)||0);
    if (!id) return new Response(JSON.stringify({error:"notification_id is required"}),{status:400,headers:{"content-type":"application/json"}});
    const n=await env.DB.prepare("SELECT * FROM notifications WHERE id=? LIMIT 1").bind(id).first();
    if (!n) return new Response(JSON.stringify({error:"Notification not found"}),{status:404,headers:{"content-type":"application/json"}});
    // Narrow free-first fallback: partner lead emails may use the already-authorized Gmail account
    // when no general outbound provider is selected. Other notifications remain fail-closed.
    if (emailProvider === "disabled" && String(n.related_type || "") === "partner_lead" && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
      emailProvider = "gmail";
    }
    if (emailProvider === "resend" && (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL)) return new Response(JSON.stringify({error:"Resend API key and verified sender are not configured"}),{status:503,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    if (emailProvider === "gmail" && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) return new Response(JSON.stringify({error:"Gmail Worker secrets are not configured"}),{status:503,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    if (!["gmail","resend"].includes(emailProvider)) return new Response(JSON.stringify({error:"Unsupported outbound email provider"}),{status:503,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    if(String(n.related_type||"")==="quotation"&&n.related_id){
      const quote=await env.DB.prepare("SELECT status FROM quotations WHERE id=? LIMIT 1").bind(n.related_id).first();
      if(!quote||String(quote.status)!=="approved") return new Response(JSON.stringify({error:"Quotation must be Owner-approved before external delivery."}),{status:409,headers:{"content-type":"application/json"}});
    }
    if (String(n.channel)!=="email" || String(n.status)!=="approved") {
      return new Response(JSON.stringify({error:"Owner approval required: notification must be email + approved before sending."}),{status:409,headers:{"content-type":"application/json"}});
    }
    const recipient = String(n.recipient || "").trim();
    if (recipient.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
      return new Response(JSON.stringify({error:"Recipient email address is invalid; nothing was sent."}),{status:400,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    }
    // Anti-spam guard: at most 10 outbound emails in any rolling 24 hours, and
    // never send to the same recipient more than once in that window.
    const sentWindow = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE channel='email' AND status='sent' AND sent_at >= datetime('now','-1 day')").first();
    const sentLast24h = Math.max(0, Number(sentWindow?.n || 0));
    if (sentLast24h >= 10) {
      return new Response(JSON.stringify({error:"24-hour email limit reached (10 total). Try again after earlier sends age out of the rolling 24-hour window.",limit:10,window_hours:24,sent_last_24h:sentLast24h}),{status:429,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    }
    const recipientWindow = await env.DB.prepare("SELECT COUNT(*) AS n FROM notifications WHERE channel='email' AND status='sent' AND lower(trim(recipient))=lower(trim(?)) AND sent_at >= datetime('now','-1 day')").bind(recipient).first();
    if (Number(recipientWindow?.n || 0) > 0) {
      return new Response(JSON.stringify({error:"This recipient has already received a PakThai Tech email within the last 24 hours. Duplicate outreach is blocked to reduce spam.",window_hours:24}),{status:429,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    }
    if (String(n.related_type || "") === "gmail_auto_reply") {
      return new Response(JSON.stringify({error:"Gmail auto-reply/security-message drafts cannot be sent through the outbound queue. Nothing was sent."}),{status:409,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    }
    let sent = {};
    if (emailProvider === "resend") {
      try { sent = await sendResendEmail(env, n.recipient, n.subject, n.message); }
      catch (e) { return new Response(JSON.stringify({error:e?.message || "Resend send failed"}),{status:502,headers:{"content-type":"application/json","Cache-Control":"no-store"}}); }
    } else {
      const auth=await env.DB.prepare("SELECT refresh_token FROM gmail_oauth WHERE id=1").first();
      if (!auth?.refresh_token) return new Response(JSON.stringify({error:"Gmail account is not authorized yet."}),{status:409,headers:{"content-type":"application/json"}});
      const tokenResp=await fetch("https://oauth2.googleapis.com/token",{
        method:"POST",
        headers:{"content-type":"application/x-www-form-urlencoded"},
        body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:auth.refresh_token,grant_type:"refresh_token"})
      });
      const token=await tokenResp.json();
      if (!tokenResp.ok || !token.access_token) return new Response(JSON.stringify({error:"Gmail access-token refresh failed."}),{status:502,headers:{"content-type":"application/json"}});
      const raw=makeMime(n.recipient,n.subject,n.message);
      const sendResp=await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
        method:"POST",
        headers:{Authorization:"Bearer "+token.access_token,"content-type":"application/json"},
        body:JSON.stringify({raw})
      });
      const providerResult=await sendResp.json().catch(()=>({}));
      if (!sendResp.ok) {
        const providerMessage=String(providerResult?.error?.message||providerResult?.error?.status||"Google API rejected the send request").slice(0,400);
        return new Response(JSON.stringify({error:"Gmail send failed; no successful send was recorded.",provider_status:sendResp.status,provider_error:providerMessage}),{status:502,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
      }
      if (!providerResult?.id) return new Response(JSON.stringify({error:"Gmail returned success without a message ID; send status is unconfirmed. Check Gmail Sent before retrying."}),{status:502,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
      sent=providerResult;
    }
    await env.DB.prepare("UPDATE notifications SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=? AND status='approved'").bind(id).run();
    if (String(n.related_type||"")==="outreach_campaign" && n.related_id) {
      const campaign = await env.DB.prepare("SELECT id,touch_count,first_sent_at FROM outreach_campaigns WHERE id=? LIMIT 1").bind(n.related_id).first();
      if (campaign) {
        const touches = Math.max(0,Number(campaign.touch_count||0)) + 1;
        const firstSentAt = campaign.first_sent_at || new Date().toISOString();
        const nextActionAt = touches === 1 ? addBusinessDays(firstSentAt,3) : touches === 2 ? addBusinessDays(firstSentAt,7) : null;
        const campaignStatus = touches >= 3 ? "completed" : "followup_due";
        await env.DB.prepare("UPDATE outreach_campaigns SET status=?,touch_count=?,first_sent_at=COALESCE(first_sent_at,?),last_sent_at=?,next_action_at=?,last_message_id=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(campaignStatus,touches,firstSentAt,new Date().toISOString(),nextActionAt,String(sent.id||''),n.related_id).run();
      }
    }
    if(String(n.related_type||"")==="quotation"&&n.related_id) await env.DB.prepare("UPDATE quotations SET status='sent' WHERE id=? AND status='approved'").bind(n.related_id).run();
    return new Response(JSON.stringify({ok:true,sent:true,notification_id:id,message_id:sent.id||null}),{headers:{"content-type":"application/json"}});
  }
  return null;
}


