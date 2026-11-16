const enc = new TextEncoder();
const COOKIE = "pakthai_session";
const SESSION_SECONDS = 8 * 60 * 60;

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
async function signature(data, secret) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), {name:"HMAC",hash:"SHA-256"}, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
function cookieValue(request) {
  const raw = request.headers.get("Cookie") || "";
  const pair = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return pair ? decodeURIComponent(pair.slice(COOKIE.length + 1)) : "";
}
export async function handleAuthRoute(request, env) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/auth/")) return null;
  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    if (!env.SESSION_SIGNING_SECRET || String(env.SESSION_SIGNING_SECRET).length < 32) {
      return Response.json({ok:false,error:"Login is not configured yet. Set SESSION_SIGNING_SECRET and login passwords in Cloudflare Worker secrets."},{status:503});
    }
    const body = await request.json().catch(() => ({}));
    const role = body.role === "staff" ? "staff" : "owner";
    const supplied = String(body.password || "");
    const expected = role === "owner" ? env.OWNER_LOGIN_PASSWORD : env.STAFF_LOGIN_PASSWORD;
    if (!expected) return Response.json({ok:false,error:role === "owner" ? "Owner login secret is not configured." : "Staff login is not configured."},{status:503});
    if (!supplied || supplied !== expected) return Response.json({ok:false,error:"Invalid login."},{status:401});
    const now = Math.floor(Date.now()/1000);
    const payload = b64url(enc.encode(JSON.stringify({role,iat:now,exp:now+SESSION_SECONDS,nonce:crypto.randomUUID()})));
    const sig = await signature(payload, env.SESSION_SIGNING_SECRET);
    const cookie = COOKIE + "=" + encodeURIComponent(payload + "." + sig) + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + SESSION_SECONDS;
    return Response.json({ok:true,role,expires_at:now+SESSION_SECONDS},{headers:{"Set-Cookie":cookie,"Cache-Control":"no-store"}});
  }
  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return Response.json({ok:true},{headers:{"Set-Cookie":COOKIE+"=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0","Cache-Control":"no-store"}});
  }
  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const session = await getSession(request, env);
    return Response.json({ok:!!session,role:session?.role||null,expires_at:session?.exp||null},{headers:{"Cache-Control":"no-store"}});
  }
  return Response.json({ok:false,error:"Not found"},{status:404});
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
    return data;
  } catch { return null; }
}
export async function authorizeRequest(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/api/")) return {allowed:true,session:null};
  if (path === "/api/auth/login" || path === "/api/auth/logout" || path === "/api/auth/me") return {allowed:true,session:null};
  // Public customer intake must remain available to the online store.
  if (path === "/api/customer-requests" && request.method === "POST") return {allowed:true,session:null};
  const session = await getSession(request, env);
  if (!session) return {allowed:false,status:401,error:"Login required. Please sign in to PakThai Tech."};
  // Staff may view the dashboard and records, but cannot change controls, approve,
  // negotiate/send messages, or create quotations/orders/purchases/deliveries.
  if (session.role === "staff" && request.method !== "GET" && request.method !== "HEAD") {
    const ownerOnly = path === "/api/settings" ||
      path === "/api/customer-approvals" ||
      ["/api/approvals","/api/quotations","/api/orders","/api/purchases","/api/deliveries",
       "/api/notifications/whatsapp","/api/negotiations/message","/api/negotiations/followups"].includes(path) ||
      path.startsWith("/api/landed-cost/") || path.startsWith("/api/controls");
    if (ownerOnly || path.startsWith("/api/")) {
      return {allowed:false,status:403,error:"Staff access is read-only. Ask the Owner for permission to perform this action."};
    }
  }
  return {allowed:true,session};
}
