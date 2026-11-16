// PAKTHAI TECH — low-volume B2B email outreach.
// Sends at most 3 eligible messages per run and 10 total emails per rolling 24 hours.
// Follow-ups stop on any reply/opt-out. Never quotes binding prices, promises stock, or commits to orders.
import { getSession } from "./auth-session.js";

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
});
const STORE = "https://pakthai-tech-store.pages.dev/";
const MAX_SENDS_PER_RUN = 3;

const LEGACY_SEED_RECIPIENTS = ["info@noresto.com","sale@supreme.co.th","sales.dept@cps.co.th","salesteam@wcdt.co.th","sales@greenwillsolution.com","sales@techglobal.com.pk","laraib@doublemvgapalace.pk","kashif@newtechpk.com"];

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS outreach_campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    prospect_type TEXT NOT NULL,
    recipient TEXT NOT NULL UNIQUE,
    source_url TEXT NOT NULL,
    market TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    touch_count INTEGER NOT NULL DEFAULT 0,
    first_sent_at TEXT,
    last_sent_at TEXT,
    next_action_at TEXT,
    last_message_id TEXT,
    replied_at TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS outreach_suppressions (
    email TEXT PRIMARY KEY,
    reason TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  // Pause old hard-coded contacts; preserve their history, but never auto-create cold outreach.
  const placeholders = LEGACY_SEED_RECIPIENTS.map(() => "?").join(",");
  await db.prepare("UPDATE outreach_campaigns SET status=?,next_action_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE LOWER(recipient) IN ("+placeholders+") AND status IN (?,?) AND touch_count=0")
    .bind("paused_unverified_seed",...LEGACY_SEED_RECIPIENTS,"queued","followup_due").run();
}

function addBusinessDays(startValue, count) {
  const d = new Date(startValue);
  let added = 0;
  while (added < count) {
    d.setUTCDate(d.getUTCDate() + 1);
    // Sunday is skipped; Monday–Saturday are considered business days.
    if (d.getUTCDay() !== 0) added++;
  }
  return d.toISOString();
}

function encodeMime(to, subject, body) {
  const safe = s => String(s || "").replace(/[\r\n]+/g, " ").trim();
  const bytes = new TextEncoder().encode([
    "From: pakthaitech@gmail.com",
    "To: " + safe(to),
    "Subject: " + safe(subject),
    "Reply-To: pakthaitech@gmail.com",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body
  ].join("\r\n"));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getAccessToken(env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Gmail Worker secrets are missing.");
  const auth = await env.DB.prepare("SELECT refresh_token FROM gmail_oauth WHERE id=1").first();
  if (!auth?.refresh_token) throw new Error("Gmail OAuth is not connected.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:auth.refresh_token,grant_type:"refresh_token"})
  });
  const token = await response.json();
  if (!response.ok || !token.access_token) throw new Error("Gmail access token refresh failed.");
  return token.access_token;
}

function messageFor(row, followup) {
  if (row.prospect_type === "seller") {
    if (followup === 0) return {
      subject: "B2B sourcing inquiry from PAKTHAI TECH — IT hardware",
      body: `Hello ${row.company_name} team,

I’m contacting you on behalf of PAKTHAI TECH in Pakistan. We are developing a B2B sourcing channel for computer components, peripherals and IT hardware, and are exploring potential supplier relationships in Thailand.

Could you please share:
• Your current product catalogue and wholesale/dealer price list
• Minimum order quantities and stock/lead times
• Warranty and return terms
• Whether you support export or shipment to Pakistan, and the available shipping/payment terms

At this stage we are only assessing fit and collecting supplier information; no purchase or order is being committed. If relevant, please reply with your catalogue or the right sales contact.

PAKTHAI TECH
pakthaitech@gmail.com
Store: ${STORE}

If this inquiry is not relevant or you prefer no further follow-up, reply STOP and we will remove this address from our outreach list.`
    };
    return {
      subject: followup === 1 ? "Follow-up: PAKTHAI TECH B2B hardware sourcing" : "Final follow-up: PAKTHAI TECH supplier inquiry",
      body: `Hello ${row.company_name} team,

I’m following up on my earlier B2B inquiry about computer components, peripherals and IT hardware supply to Pakistan. If this is within your scope, could you point me to your catalogue, wholesale terms or export contact?

No order or purchase is being committed. If this is not relevant, reply STOP and we will not follow up again.

Regards,
PAKTHAI TECH
pakthaitech@gmail.com
`
    };
  }
  if (followup === 0) return {
    subject: "Pakistan B2B channel inquiry — PAKTHAI TECH",
    body: `Hello ${row.company_name} team,

I’m contacting you on behalf of PAKTHAI TECH. We are exploring B2B channel relationships in Pakistan for computer components, peripherals and IT hardware, including potential sourcing options from Thailand.

Could you let us know which product categories you actively buy or distribute, and whether you are open to reviewing supplier options when a matching product and landed cost are available? If there is a purchasing or category manager, please share the best contact.

We are not claiming current stock or a confirmed price, and this message does not commit either party to an order.

Regards,
PAKTHAI TECH
pakthaitech@gmail.com
Store: ${STORE}

If this is not relevant or you prefer no further follow-up, reply STOP and we will remove this address from our outreach list.`
  };
  return {
    subject: followup === 1 ? "Follow-up: PAKTHAI TECH channel inquiry" : "Final follow-up: PAKTHAI TECH channel inquiry",
    body: `Hello ${row.company_name} team,

A brief follow-up to ask whether your team would be open to reviewing potential B2B supply options for computer components and IT hardware. If not relevant, no action is needed; reply STOP if you prefer no further contact.

Regards,
PAKTHAI TECH
pakthaitech@gmail.com
`
  };
}

async function findReply(env, token, row) {
  if (!row.first_sent_at) return null;
  const after = Math.max(0, Math.floor(new Date(row.first_sent_at).getTime() / 1000) - 1);
  const q = "in:inbox from:" + row.recipient + " after:" + after;
  const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
  url.searchParams.set("q", q);
  url.searchParams.set("maxResults", "5");
  const response = await fetch(url.toString(), { headers:{Authorization:"Bearer " + token} });
  const list = await response.json();
  if (!response.ok) throw new Error("Gmail reply check failed.");
  const items = list.messages || [];
  if (!items.length) return null;
  const item = items[0];
  const fullResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/" + encodeURIComponent(item.id) + "?format=full", {headers:{Authorization:"Bearer " + token}});
  const full = await fullResponse.json();
  if (!fullResponse.ok) return { message_id:item.id, text:String(item.snippet || "") };
  const headers = full.payload?.headers || [];
  const from = headers.find(h => String(h.name).toLowerCase() === "from")?.value || "";
  const snippet = String(full.snippet || "");
  return { message_id:item.id, text:snippet + " " + from };
}

export async function runScheduledOutreach(env) {
  const now = new Date();
  const nowIso = now.toISOString();
  const summary = {ok:true,paused:false,ran_at:nowIso,prepared:0,sent:0,checked:0,skipped:0,reason:"No eligible outreach was sent."};
  try {
    await ensureSchema(env.DB);
    const due = await env.DB.prepare(`
      SELECT c.* FROM outreach_campaigns c
      LEFT JOIN outreach_suppressions s ON LOWER(s.email)=LOWER(c.recipient)
      WHERE c.status IN ('queued','followup_due')
        AND c.next_action_at IS NOT NULL AND c.next_action_at <= ?
        AND s.email IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM notifications n
          WHERE n.related_type='outreach_campaign' AND n.related_id=c.id
            AND n.status IN ('prepared','approved')
        )
        AND NOT EXISTS (
          SELECT 1 FROM notifications recent
          WHERE recent.channel='email' AND recent.status='sent'
            AND LOWER(recent.recipient)=LOWER(c.recipient)
            AND recent.created_at >= datetime('now','-24 hours')
        )
      ORDER BY c.next_action_at ASC,c.id ASC LIMIT ?
    `).bind(nowIso, MAX_SENDS_PER_RUN).all();
    const rows = due.results || [];
    let token = null;
    for (const row of rows) {
      summary.checked++;
      const touch = Math.max(0, Math.min(2, Number(row.touch_count || 0)));
      try {
        if (!token) token = await getAccessToken(env);
        const sentInWindow = await env.DB.prepare("SELECT COUNT(*) AS total FROM notifications WHERE channel='email' AND status='sent' AND created_at >= datetime('now','-24 hours')").first();
        if (Number(sentInWindow?.total || 0) >= 10) { summary.skipped++; summary.reason="Rolling 24-hour email limit reached."; break; }
        if (touch > 0) {
          const reply = await findReply(env, token, row);
          if (reply) {
            const text = String(reply.text || '');
            const stop = /\b(stop|unsubscribe|remove me|do not contact)\b/i.test(text);
            if (stop) await env.DB.prepare("INSERT OR IGNORE INTO outreach_suppressions(email,reason) VALUES(?,?)").bind(String(row.recipient).toLowerCase(),"recipient_opt_out").run();
            await env.DB.prepare("UPDATE outreach_campaigns SET status=?,replied_at=?,next_action_at=NULL,last_message_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?")
              .bind(stop ? "suppressed" : "replied",nowIso,String(reply.message_id||''),row.id).run();
            summary.skipped++;
            continue;
          }
        }
        const draft = messageFor(row,touch);
        const raw = encodeMime(row.recipient,draft.subject,draft.body);
        const sendResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send",{method:"POST",headers:{Authorization:"Bearer "+token,"content-type":"application/json"},body:JSON.stringify({raw})});
        const sendResult = await sendResponse.json();
        if (!sendResponse.ok || !sendResult.id) throw new Error(String(sendResult?.error?.message || "Gmail send failed.").slice(0,200));
        await env.DB.prepare("INSERT INTO notifications(type,channel,recipient,subject,message,related_type,related_id,status) VALUES('external','email',?,?,?,'outreach_campaign',?,'sent')").bind(row.recipient,draft.subject,draft.body,row.id).run();
        const nextTouch = touch + 1;
        const nextAt = nextTouch === 1 ? addBusinessDays(nowIso,3) : nextTouch === 2 ? addBusinessDays(row.first_sent_at || nowIso,7) : null;
        await env.DB.prepare("UPDATE outreach_campaigns SET status=?,touch_count=?,first_sent_at=COALESCE(first_sent_at,?),last_sent_at=?,next_action_at=?,last_message_id=?,last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?")
          .bind(nextTouch < 3 ? "followup_due" : "sent_complete",nextTouch,nowIso,nowIso,nextAt,String(sendResult.id),row.id).run();
        summary.sent++;
      } catch (e) {
        await env.DB.prepare("UPDATE outreach_campaigns SET last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(String(e?.message||e).slice(0,300),row.id).run();
        summary.skipped++;
      }
    }
    if (!summary.sent && !summary.skipped) summary.reason="No outreach messages are due.";
    else if (summary.sent) summary.reason="Eligible outreach sent; replies and opt-outs are checked before follow-ups.";
  } catch (e) {
    summary.ok=false;
    summary.reason=String(e?.message||e).slice(0,300);
  }
  await env.DB.prepare("INSERT INTO settings(key,value) VALUES('outreach_last_status',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
    .bind(JSON.stringify(summary)).run();
  return summary;
}

export async function handleOutreachRequest(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/outreach")) return null;
  if (request.method === "OPTIONS") return new Response(null,{headers:{"Access-Control-Allow-Methods":"GET,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization"}});
  const session = await getSession(request,env);
  if (session?.role !== "owner") return json({ok:false,error:"Owner login required for outreach status."},403);
  await ensureSchema(env.DB);
  if (url.pathname === "/api/outreach/prepare" && request.method === "POST") {
    return json(await runScheduledOutreach(env));
  }
  if (url.pathname === "/api/outreach/status" && request.method === "GET") {
    const enabled = true;
    const [rows,last] = await Promise.all([
      env.DB.prepare("SELECT id,company_name,prospect_type,recipient,market,status,touch_count,first_sent_at,last_sent_at,next_action_at,replied_at,last_error FROM outreach_campaigns ORDER BY id").all(),
      env.DB.prepare("SELECT value FROM settings WHERE key='outreach_last_status'").first()
    ]);
    return json({ok:true,schedule:enabled?"Daily at 09:00 Pakistan time, Monday–Saturday (automatic low-volume email; 3 per run, 10 per rolling 24 hours)":"Paused",max_new_or_followup_drafts_per_run:enabled?MAX_SENDS_PER_RUN:0,followups_business_days:enabled?[3,7]:[],campaigns:rows.results||[],last_run:last?.value ? JSON.parse(last.value) : null});
  }
  return json({ok:false,error:"Route not found."},404);
}
