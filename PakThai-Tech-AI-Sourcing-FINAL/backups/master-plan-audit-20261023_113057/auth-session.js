import { sendAccountSecurityEmail } from "./gmail-oauth.js";

const enc = new TextEncoder();
const COOKIE = "pakthai_session";
const SESSION_SECONDS = 8 * 60 * 60;
const OWNER_EMAIL = "pakthaitech@gmail.com";
const TOKEN_SECONDS = 15 * 60;

function b64url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function fromB64url(s) {
  const base = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base + "=".repeat((4 - base.length % 4) % 4));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function sha256(value) {
  return b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(value))));
}
async function signature(data, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
async function hashPassword(password, salt = b64url(crypto.getRandomValues(new Uint8Array(16)))) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({name:"PBKDF2",salt:enc.encode(salt),iterations:100000,hash:"SHA-256"},key,256);
  return salt + "." + b64url(new Uint8Array(bits));
}
async function verifyPassword(password, stored) {
  if (!stored || !stored.includes(".")) return false;
  return (await hashPassword(password, stored.split(".")[0])) === stored;
}
function cookieValue(request) {
  const raw = request.headers.get("Cookie") || "";
  const pair = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return pair ? decodeURIComponent(pair.slice(COOKIE.length + 1)) : "";
}
async function ensureAuthTables(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS auth_staff (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', password_hash TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, approved_at TEXT, last_login_at TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY, purpose TEXT NOT NULL, email TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS auth_owner_password (id INTEGER PRIMARY KEY CHECK(id=1), password_hash TEXT NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS auth_rate_limits (rate_key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)")
  ]);
}
async function issueToken(db, purpose, email) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = b64url(bytes);
  await db.prepare("INSERT INTO auth_tokens(token_hash,purpose,email,expires_at) VALUES(?,?,?,?)")
    .bind(await sha256(token), purpose, email, Date.now() + TOKEN_SECONDS * 1000).run();
  return token;
}
async function consumeToken(db, token, purpose) {
  if (!token || token.length > 200) return null;
  const hash = await sha256(token);
  const row = await db.prepare("SELECT token_hash,email FROM auth_tokens WHERE token_hash=? AND purpose=? AND expires_at>? AND used_at IS NULL")
    .bind(hash, purpose, Date.now()).first();
  if (!row) return null;
  const update = await db.prepare("UPDATE auth_tokens SET used_at=? WHERE token_hash=? AND used_at IS NULL AND expires_at>?")
    .bind(Date.now(), hash, Date.now()).run();
  if (!update.meta?.changes) return null;
  return row;
}
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
};
function response(data, status = 200, headers = {}) {
  return Response.json(data, {status, headers:{"Cache-Control":"no-store", ...SECURITY_HEADERS, ...headers}});
}
function validPassword(password) {
  return typeof password === "string" && password.length >= 12 && password.length <= 200;
}
async function ownerSession(request, env) {
  const s = await getSession(request, env);
  return s?.role === "owner" ? s : null;
}
async function rateLimited(request, db, path) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const ip = String(request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
  const key = await sha256(ip + "|" + path);
  const row = await db.prepare(`INSERT INTO auth_rate_limits(rate_key,window_start,attempts) VALUES(?,?,1)
    ON CONFLICT(rate_key) DO UPDATE SET
      attempts=CASE WHEN auth_rate_limits.window_start + ? <= excluded.window_start THEN 1 ELSE auth_rate_limits.attempts+1 END,
      window_start=CASE WHEN auth_rate_limits.window_start + ? <= excluded.window_start THEN excluded.window_start ELSE auth_rate_limits.window_start END
    RETURNING attempts`).bind(key,now,windowMs,windowMs).first();
  const limit = path.endsWith("/login") ? 8 : path.includes("recovery") || path.includes("setup-request") ? 3 : 5;
  return Number(row?.attempts || 0) > limit;
}

export async function handleAuthRoute(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/auth/")) return null;
  if (!env.DB) return response({ok:false,error:"Authentication database is unavailable."},503);
  await ensureAuthTables(env.DB);

  if (path === "/api/auth/login" && request.method === "POST") {
    if (await rateLimited(request, env.DB, path)) return response({ok:false,error:"Too many login attempts. Try again in 15 minutes."},429,{"Retry-After":"900"});
    if (!env.SESSION_SIGNING_SECRET || String(env.SESSION_SIGNING_SECRET).length < 32) {
      return response({ok:false,error:"Login security is not configured."},503);
    }
    const body = await request.json().catch(() => ({}));
    const role = body.role === "staff" ? "staff" : "owner";
    const supplied = String(body.password || "");
    let valid = false;
    let staffId = null;
    if (role === "owner") {
      const stored = await env.DB.prepare("SELECT password_hash FROM auth_owner_password WHERE id=1").first();
      valid = stored ? await verifyPassword(supplied, stored.password_hash) : Boolean(env.OWNER_LOGIN_PASSWORD && supplied && supplied === env.OWNER_LOGIN_PASSWORD);
    } else {
      const email = String(body.email || "").trim().toLowerCase();
      const staff = email ? await env.DB.prepare("SELECT id,password_hash,status FROM auth_staff WHERE email=? LIMIT 1").bind(email).first() : null;
      valid = Boolean(staff && staff.status === "approved" && await verifyPassword(supplied, staff.password_hash));
      if (valid) staffId = Number(staff.id);
    }
    if (!valid) return response({ok:false,error:"Invalid login or account is not approved."},401);
    const now = Math.floor(Date.now()/1000);
    const payload = b64url(enc.encode(JSON.stringify({role,staffId,iat:now,exp:now+SESSION_SECONDS,nonce:crypto.randomUUID()})));
    const sig = await signature(payload, env.SESSION_SIGNING_SECRET);
    const cookie = COOKIE + "=" + encodeURIComponent(payload + "." + sig) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + SESSION_SECONDS;
    if (staffId) await env.DB.prepare("UPDATE auth_staff SET last_login_at=CURRENT_TIMESTAMP WHERE id=?").bind(staffId).run();
    return response({ok:true,role,expires_at:now+SESSION_SECONDS},200,{"Set-Cookie":cookie});
  }
  if (path === "/api/auth/logout" && request.method === "POST") {
    return response({ok:true},200,{"Set-Cookie":COOKIE+"=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"});
  }
  if (path === "/api/auth/me" && request.method === "GET") {
    const session = await getSession(request, env);
    return response({ok:!!session,role:session?.role||null,expires_at:session?.exp||null});
  }
  if (path === "/api/auth/staff/register" && request.method === "POST") {
    if (await rateLimited(request, env.DB, path)) return response({ok:false,error:"Too many registration requests. Try again in 15 minutes."},429,{"Retry-After":"900"});
    const body = await request.json().catch(() => ({}));
    const name = String(body.name || "").trim().slice(0,100);
    const email = String(body.email || "").trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return response({ok:false,error:"Valid name and email are required."},400);
    const exists = await env.DB.prepare("SELECT id,status FROM auth_staff WHERE email=?").bind(email).first();
    if (exists) return response({ok:false,error:exists.status === "approved" ? "This staff email is already registered." : "A request for this email already exists."},409);
    await env.DB.prepare("INSERT INTO auth_staff(name,email,status) VALUES(?,?,'pending')").bind(name,email).run();
    return response({ok:true,status:"pending",message:"Request submitted. Owner approval is required before setting a password."},201);
  }
  if (path === "/api/auth/staff/list" && request.method === "GET") {
    if (!await ownerSession(request, env)) return response({ok:false,error:"Owner login required."},403);
    const rows = await env.DB.prepare("SELECT id,name,email,status,created_at,approved_at,last_login_at FROM auth_staff ORDER BY id DESC LIMIT 100").all();
    return response({ok:true,staff:rows.results||[]});
  }
  if (path === "/api/auth/staff/approve" && request.method === "POST") {
    if (!await ownerSession(request, env)) return response({ok:false,error:"Owner login required."},403);
    const body = await request.json().catch(() => ({}));
    const staff = await env.DB.prepare("SELECT id,name,email,status FROM auth_staff WHERE id=?").bind(Math.floor(Number(body.staff_id)||0)).first();
    if (!staff || staff.status !== "pending") return response({ok:false,error:"Pending staff request not found."},404);
    const token = await issueToken(env.DB,"staff_password",staff.email);
    try {
      await sendAccountSecurityEmail(env,staff.email,"PAKTHAI TECH staff account approved",
        "Hello "+staff.name+",\n\nYour PAKTHAI TECH staff access request has been approved by the Owner. Set your password within 15 minutes using this one-time link:\n"+url.origin+"/?staff_setup_token="+encodeURIComponent(token)+"\n\nIf you did not request access, ignore this email.");
    } catch (e) {
      await env.DB.prepare("DELETE FROM auth_tokens WHERE token_hash=?").bind(await sha256(token)).run();
      return response({ok:false,error:"Approval saved only after email succeeds; security email failed. Check Gmail connection."},503);
    }
    await env.DB.prepare("UPDATE auth_staff SET status='approved',approved_at=CURRENT_TIMESTAMP WHERE id=?").bind(staff.id).run();
    return response({ok:true,message:"Staff approved; one-time password setup email sent."});
  }
  if (path === "/api/auth/staff/set-password" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!validPassword(body.password)) return response({ok:false,error:"Use a password of at least 12 characters."},400);
    const row = await consumeToken(env.DB,String(body.token||""),"staff_password");
    if (!row) return response({ok:false,error:"Setup link is invalid, expired, or already used."},400);
    const hash = await hashPassword(body.password);
    const r = await env.DB.prepare("UPDATE auth_staff SET password_hash=? WHERE email=? AND status='approved'").bind(hash,row.email).run();
    if (!r.meta?.changes) return response({ok:false,error:"Approved staff account not found."},404);
    return response({ok:true,message:"Password created. Staff can now sign in with their email and password."});
  }
  if ((path === "/api/auth/owner/recovery-request" || path === "/api/auth/owner/setup-request") && request.method === "POST") {
    if (await rateLimited(request, env.DB, path)) return response({ok:true,message:"If the account is eligible, a security email will be sent."},200,{"Retry-After":"900"});
    let purpose = path.endsWith("setup-request") ? "owner_setup" : "owner_recovery";
    const body = await request.json().catch(() => ({}));
    if (String(body.email||"").trim().toLowerCase() !== OWNER_EMAIL) return response({ok:true,message:"If the account is eligible, a security email will be sent."});
    const ownerPasswordExists = await env.DB.prepare("SELECT id FROM auth_owner_password WHERE id=1").first();
    if (!ownerPasswordExists) purpose = "owner_setup";
    if (purpose === "owner_setup" && ownerPasswordExists) return response({ok:true,message:"If the account is eligible, a security email will be sent."});
    const token = await issueToken(env.DB,purpose,OWNER_EMAIL);
    try {
      const action = purpose === "owner_setup" ? "set your initial Owner password" : "reset your Owner password";
      await sendAccountSecurityEmail(env,OWNER_EMAIL,"PAKTHAI TECH Owner password security",
        "A request was made to "+action+". This one-time link expires in 15 minutes and works once only:\n"+url.origin+"/?owner_password_token="+encodeURIComponent(token)+(purpose === "owner_recovery" ? "&owner_password_purpose=owner_recovery" : "")+"\n\nIf you did not request this, ignore this email. Do not share this link.");
    } catch {
      await env.DB.prepare("DELETE FROM auth_tokens WHERE token_hash=?").bind(await sha256(token)).run();
      return response({ok:false,error:"Gmail security email could not be sent. Check Gmail authorization."},503);
    }
    return response({ok:true,message:"If the account is eligible, a security email will be sent."});
  }
  if (path === "/api/auth/owner/set-password" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    if (!validPassword(body.password)) return response({ok:false,error:"Use a password of at least 12 characters."},400);
    const purpose = String(body.purpose||"") === "owner_setup" ? "owner_setup" : "owner_recovery";
    const row = await consumeToken(env.DB,String(body.token||""),purpose);
    if (!row || row.email !== OWNER_EMAIL) return response({ok:false,error:"Security link is invalid, expired, or already used."},400);
    const existing = await env.DB.prepare("SELECT id FROM auth_owner_password WHERE id=1").first();
    if (purpose === "owner_setup" && existing) return response({ok:false,error:"Initial Owner setup is already complete."},409);
    if (purpose === "owner_recovery" && !existing) return response({ok:false,error:"Owner password setup is not complete yet."},409);
    const hash = await hashPassword(body.password);
    await env.DB.prepare("INSERT INTO auth_owner_password(id,password_hash,updated_at) VALUES(1,?,CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET password_hash=excluded.password_hash,updated_at=CURRENT_TIMESTAMP").bind(hash).run();
    return response({ok:true,message:"Owner password updated. Please sign in again."});
  }
  return response({ok:false,error:"Not found"},404);
}

export async function getSession(request, env) {
  if (!env.SESSION_SIGNING_SECRET || String(env.SESSION_SIGNING_SECRET).length < 32) return null;
  const token = cookieValue(request);
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = await signature(parts[0], env.SESSION_SIGNING_SECRET);
  if (expected !== parts[1]) return null;
  try {
    const data = JSON.parse(new TextDecoder().decode(fromB64url(parts[0])));
    if (!["owner","staff"].includes(data.role) || !Number.isFinite(data.exp) || data.exp <= Math.floor(Date.now()/1000)) return null;
    if (data.role === "staff") {
      const staff = await env.DB.prepare("SELECT status FROM auth_staff WHERE id=?").bind(Number(data.staffId)||0).first();
      if (!staff || staff.status !== "approved") return null;
    }
    return data;
  } catch { return null; }
}
export async function authorizeRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/")) return {allowed:true,session:null};
  if (path.startsWith("/api/auth/")) return {allowed:true,session:null};
  if (path === "/api/health" && request.method === "GET") return {allowed:true,session:null};
  if (path === "/api/notifications/gmail-send") return {allowed:true,session:null};
  if (path === "/api/customer-requests" && request.method === "POST") return {allowed:true,session:null};
  const session = await getSession(request, env);
  if (!session) return {allowed:false,status:401,error:"Login required. Please sign in to PakThai Tech."};
  if (session.role === "staff" && request.method !== "GET" && request.method !== "HEAD") {
    return {allowed:false,status:403,error:"Staff access is read-only. Ask the Owner for permission to perform this action."};
  }
  return {allowed:true,session};
}
