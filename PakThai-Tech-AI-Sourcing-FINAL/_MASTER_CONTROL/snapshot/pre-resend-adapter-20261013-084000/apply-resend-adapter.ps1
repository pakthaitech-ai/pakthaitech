$ErrorActionPreference = 'Stop'
$root = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL'
$p = Join-Path $root 'src\gmail-oauth.js'
$s = [IO.File]::ReadAllText($p)

$anchor = 'export async function sendAccountSecurityEmail(env, to, subject, body) {'
$helper = @'
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

'@
if (-not $s.Contains($anchor)) { throw 'Security-email function anchor not found' }
$s = $s.Replace($anchor, $helper + $anchor)

$old = @'
export async function sendAccountSecurityEmail(env, to, subject, body) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Gmail is not configured.");
'@
$new = @'
export async function sendAccountSecurityEmail(env, to, subject, body) {
  const provider = String(env.OUTBOUND_EMAIL_PROVIDER || "gmail").trim().toLowerCase();
  if (provider === "resend") {
    await sendResendEmail(env, to, subject, body);
    return true;
  }
  if (provider !== "gmail") throw new Error("Outbound email provider is not supported or configured.");
  if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw new Error("Gmail is not configured.");
'@
if (-not $s.Contains($old)) { throw 'Security-email provider switch anchor not found' }
$s = $s.Replace($old, $new)

$old = '    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return new Response(JSON.stringify({error:"Gmail Worker secrets are not configured"}),{status:503,headers:{"content-type":"application/json"}});'
$new = @'
    const emailProvider = String(env.OUTBOUND_EMAIL_PROVIDER || "gmail").trim().toLowerCase();
    if (emailProvider === "resend" && (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL)) return new Response(JSON.stringify({error:"Resend API key and verified sender are not configured"}),{status:503,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    if (emailProvider === "gmail" && (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET)) return new Response(JSON.stringify({error:"Gmail Worker secrets are not configured"}),{status:503,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
    if (!["gmail","resend"].includes(emailProvider)) return new Response(JSON.stringify({error:"Unsupported outbound email provider"}),{status:503,headers:{"content-type":"application/json","Cache-Control":"no-store"}});
'@
if (-not $s.Contains($old)) { throw 'Gmail provider config guard anchor not found' }
$s = $s.Replace($old, $new.TrimEnd([char]13,[char]10))

$routeAnchor = 'if (path === "/api/notifications/gmail-send" && request.method === "POST") {'
$routeStart = $s.IndexOf($routeAnchor)
if ($routeStart -lt 0) { throw 'Approved email route anchor not found' }
$startMarker = '    const auth=await env.DB.prepare("SELECT refresh_token FROM gmail_oauth WHERE id=1").first();'
$start = $s.IndexOf($startMarker, $routeStart)
$endMarker = '    if (!sendResp.ok) return new Response(JSON.stringify({error:"Gmail send failed",details:sent}),{status:502,headers:{"content-type":"application/json"}});'
$endStart = $s.IndexOf($endMarker, $start)
if ($start -lt 0 -or $endStart -lt 0) { throw 'Gmail sending block boundaries not found' }
$end = $endStart + $endMarker.Length
$replacement = @'
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
      sent=await sendResp.json().catch(()=>({}));
      if (!sendResp.ok) return new Response(JSON.stringify({error:"Gmail send failed"}),{status:502,headers:{"content-type":"application/json"}});
    }
'@
$s = $s.Substring(0, $start) + $replacement.TrimEnd([char]13,[char]10) + $s.Substring($end)
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))

$p = Join-Path $root 'package.json'
$s = [IO.File]::ReadAllText($p)
$old = 'tools/audit/lead-routing.test.mjs'
$new = 'tools/audit/lead-routing.test.mjs tools/audit/email-provider.test.mjs'
if (-not $s.Contains($old)) { throw 'package test-script anchor not found' }
$s = $s.Replace($old, $new)
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
Write-Output 'Added provider-selectable Resend outbound email for approved notifications and account-security emails; Gmail remains the default until Owner configures Resend.'
