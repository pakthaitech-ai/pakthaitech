// Safe template-based Gmail auto-reply. Disabled unless EMAIL_AUTO_REPLY_ENABLED=true.
function decodeGmailText(value) {
  if (!value) return "";
  try {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const binary = atob(padded);
    return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0)));
  } catch { return ""; }
}
function header(headers, name) {
  return (headers || []).find(h => String(h.name || "").toLowerCase() === name.toLowerCase())?.value || "";
}
function plainText(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeGmailText(payload.body.data);
  for (const part of (payload.parts || [])) { const text = plainText(part); if (text) return text; }
  return "";
}
function classify(subject, snippet, body) {
  const text = [subject || "", snippet || "", body || ""].join("\n").toLowerCase();
  if (/\bunsubscribe\b|\bstop emailing\b|\bremove me\b|\bdo not contact\b/.test(text)) return "unsubscribe";
  if (/\b(price|pricing|cost|quote|quotation|dealer rate|wholesale rate|budget)\b/.test(text)) return "pricing";
  if (/\b(delivery|shipping|freight|courier|ship to|deliver to)\b/.test(text)) return "delivery";
  if (/\b(catalog|catalogue|product list|product range|available products)\b/.test(text)) return "catalog";
  if (/\b(stock|available|availability|in stock)\b/.test(text)) return "availability";
  return "general";
}
function answer(kind, name) {
  const greeting = name ? "Hello " + name + "," : "Hello,";
  const store = "https://pakthai-tech-store.pages.dev/";
  const common = greeting + "\n\nThank you for contacting PAKTHAI TECH. We have received your message.";
  if (kind === "pricing") return common + "\n\nPlease share the exact product/model, quantity, your city, and target dealer price. Our owner will confirm availability and the final quotation before any commitment.\n\nCatalogue: " + store + "\n\nRegards,\nPAKTHAI TECH\npakthaitech@gmail.com";
  if (kind === "delivery") return common + "\n\nPlease tell us the product/model, quantity, and delivery city. Delivery options, charges, and timing will be confirmed after review; we do not promise a date before confirmation.\n\nCatalogue: " + store + "\n\nRegards,\nPAKTHAI TECH\npakthaitech@gmail.com";
  if (kind === "catalog") return common + "\n\nBrowse our current listed products here: " + store + "\n\nFor a quotation, reply with the product/model, quantity, and city. Availability and pricing will be confirmed by our team.\n\nRegards,\nPAKTHAI TECH\npakthaitech@gmail.com";
  if (kind === "availability") return common + "\n\nPlease reply with the exact product/model, required quantity, and your city. Our team will check availability and have the owner confirm the result before any order commitment.\n\nCatalogue: " + store + "\n\nRegards,\nPAKTHAI TECH\npakthaitech@gmail.com";
  return common + "\n\nPlease share the product/model or service you are asking about, required quantity (if applicable), and your city. Our team will review your request. Prices, stock, delivery dates, orders, and payments are never confirmed automatically; the owner will approve any business commitment.\n\nCatalogue: " + store + "\n\nRegards,\nPAKTHAI TECH\npakthaitech@gmail.com";
}
function encodeMime(to, subject, body, messageId, references) {
  const safe = s => String(s || "").replace(/[\r\n]+/g, " ").trim();
  const lines = ["From: pakthaitech@gmail.com", "To: " + safe(to), "Subject: " + safe(subject)];
  if (messageId) lines.push("In-Reply-To: " + safe(messageId));
  if (references) lines.push("References: " + safe(references));
  lines.push("MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "", body || "");
  const bytes = new TextEncoder().encode(lines.join("\r\n"));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
async function accessToken(env) {
  const auth = await env.DB.prepare("SELECT refresh_token FROM gmail_oauth WHERE id=1").first();
  if (!auth?.refresh_token) throw new Error("Gmail is not authorized.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: {"content-type":"application/x-www-form-urlencoded"},
    body: new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:auth.refresh_token,grant_type:"refresh_token"})
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw new Error("Gmail token refresh failed; re-authorization may be needed.");
  return token.access_token;
}
export async function runGmailAutoReply(env) {
  if (String(env.EMAIL_AUTO_REPLY_ENABLED || "").toLowerCase() !== "true") return {ok:true,enabled:false,sent:0,reason:"owner_toggle_off"};
  if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return {ok:false,enabled:true,reason:"gmail_configuration_missing"};
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS gmail_auto_reply_processed (message_id TEXT PRIMARY KEY, thread_id TEXT, sender TEXT, subject TEXT, status TEXT NOT NULL, reason TEXT, processed_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS gmail_auto_reply_suppressions (sender TEXT PRIMARY KEY, created_at TEXT DEFAULT CURRENT_TIMESTAMP)").run();
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS gmail_auto_reply_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)").run();
  try {
    const token = await accessToken(env);
    const listResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages?q="+encodeURIComponent("in:inbox newer_than:14d -from:me")+"&maxResults=25",{headers:{Authorization:"Bearer "+token}});
    const list = await listResponse.json();
    if (!listResponse.ok) throw new Error(list?.error?.message || "Inbox read failed; Gmail read permission may need approval.");
    const nowMs = Date.now();
    const cursor = await env.DB.prepare("SELECT value FROM gmail_auto_reply_state WHERE key='last_poll_ms'").first();
    if (!cursor) {
      await env.DB.prepare("INSERT INTO gmail_auto_reply_state(key,value) VALUES('last_poll_ms',?)").bind(String(nowMs)).run();
      return {ok:true,enabled:true,initialized:true,checked:(list.messages||[]).length,sent:0,reason:"baseline_saved_no_old_mail_replied"};
    }
    const lastPollMs = Number(cursor.value) || 0;
    let sent=0, skipped=0, processed=0;
    for (const item of (list.messages || [])) {
      if (await env.DB.prepare("SELECT message_id FROM gmail_auto_reply_processed WHERE message_id=?").bind(item.id).first()) { skipped++; continue; }
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/"+encodeURIComponent(item.id)+"?format=full",{headers:{Authorization:"Bearer "+token}});
      const msg = await response.json();
      if (!response.ok) { skipped++; continue; }
      if (Number(msg.internalDate || 0) <= lastPollMs) { skipped++; continue; }
      const hs = msg.payload?.headers || [];
      const from = header(hs,"From");
      const sender = (from.match(/<([^>]+)>/)?.[1] || from).trim().toLowerCase();
      const originalSubject = header(hs,"Subject") || "Your PAKTHAI TECH enquiry";
      const subject = originalSubject.replace(/^\s*(re|fwd?)\s*:\s*/i,"").trim() || "Your PAKTHAI TECH enquiry";
      const auto = header(hs,"Auto-Submitted").toLowerCase();
      const precedence = header(hs,"Precedence").toLowerCase();
      if (!sender || sender.includes("pakthaitech@gmail.com") || /no.?reply|mailer-daemon|postmaster|bounce/.test(sender) || (auto && auto !== "no") || /bulk|junk|list/.test(precedence) || header(hs,"List-Id")) {
        await env.DB.prepare("INSERT OR IGNORE INTO gmail_auto_reply_processed(message_id,thread_id,sender,subject,status,reason) VALUES(?,?,?,?,?,?)").bind(item.id,msg.threadId||"",sender,subject,"skipped","automated_or_bulk_sender").run();
        skipped++; processed++; continue;
      }
      if (await env.DB.prepare("SELECT sender FROM gmail_auto_reply_suppressions WHERE sender=?").bind(sender).first()) {
        await env.DB.prepare("INSERT OR IGNORE INTO gmail_auto_reply_processed(message_id,thread_id,sender,subject,status,reason) VALUES(?,?,?,?,?,?)").bind(item.id,msg.threadId||"",sender,subject,"skipped","sender_unsubscribed").run();
        skipped++; processed++; continue;
      }
      const kind = classify(originalSubject,msg.snippet,plainText(msg.payload).slice(0,10000));
      if (kind === "unsubscribe") {
        await env.DB.prepare("INSERT OR IGNORE INTO gmail_auto_reply_suppressions(sender) VALUES(?)").bind(sender).run();
        await env.DB.prepare("INSERT OR IGNORE INTO gmail_auto_reply_processed(message_id,thread_id,sender,subject,status,reason) VALUES(?,?,?,?,?,?)").bind(item.id,msg.threadId||"",sender,subject,"suppressed","unsubscribe_request").run();
        skipped++; processed++; continue;
      }
      const senderName = from.includes("<") ? from.split("<")[0].replace(/["']/g,"").trim().split(/\s+/).slice(0,2).join(" ") : "";
      const originalId = header(hs,"Message-ID");
      const refs = [header(hs,"References"),originalId].filter(Boolean).join(" ");
      const replySubject = /^re:/i.test(originalSubject) ? originalSubject : "Re: " + originalSubject;
      const raw = encodeMime(sender,replySubject,answer(kind,senderName),originalId,refs);
      const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{
        method:"POST",headers:{Authorization:"Bearer "+token,"content-type":"application/json"},
        body:JSON.stringify({raw,threadId:msg.threadId})
      });
      const result = await sendResponse.json().catch(()=>({}));
      if (!sendResponse.ok) {
        await env.DB.prepare("INSERT OR IGNORE INTO gmail_auto_reply_processed(message_id,thread_id,sender,subject,status,reason) VALUES(?,?,?,?,?,?)").bind(item.id,msg.threadId||"",sender,subject,"failed",String(result?.error?.message||"send_failed").slice(0,200)).run();
        skipped++; processed++; continue;
      }
      await env.DB.prepare("INSERT OR IGNORE INTO gmail_auto_reply_processed(message_id,thread_id,sender,subject,status,reason) VALUES(?,?,?,?,?,?)").bind(item.id,msg.threadId||"",sender,subject,"sent","safe_template_"+kind).run();
      sent++; processed++;
    }
    await env.DB.prepare("UPDATE gmail_auto_reply_state SET value=? WHERE key='last_poll_ms'").bind(String(nowMs)).run();
    return {ok:true,enabled:true,checked:(list.messages||[]).length,processed,sent,skipped};
  } catch (error) {
    return {ok:false,enabled:true,reason:String(error?.message||error).slice(0,300),sent:0};
  }
}
