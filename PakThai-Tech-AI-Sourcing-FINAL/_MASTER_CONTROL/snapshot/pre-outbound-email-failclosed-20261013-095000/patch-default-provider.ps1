$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\gmail-oauth.js'
$s=[IO.File]::ReadAllText($p)
$routeMarker='if (path === "/api/notifications/gmail-send" && request.method === "POST") {'
$routeStart=$s.IndexOf($routeMarker)
if($routeStart -lt 0){throw 'Approved outbound email route not found'}
$old='const emailProvider = String(env.OUTBOUND_EMAIL_PROVIDER || "gmail").trim().toLowerCase();'
$at=$s.IndexOf($old,$routeStart)
if($at -lt 0){throw 'Email provider default not found in outbound route'}
$newProvider='const emailProvider = String(env.OUTBOUND_EMAIL_PROVIDER || "disabled").trim().toLowerCase();'
$s=$s.Substring(0,$at)+$newProvider+$s.Substring($at+$old.Length)
$s=$s.Replace('// Gmail OAuth + approved notification sending.','// Gmail inbox OAuth plus provider-selectable approved notification sending.')
[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))

$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\tools\audit\email-provider.test.mjs'
$s=[IO.File]::ReadAllText($p)
$s += @'

test("approved outbound email fails closed when no non-Google provider is selected", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => { callCount++; throw new Error("External fetch must not run"); };
  try {
    const env = {
      DB: makeDb(),
      EMAIL_SEND_TOKEN: "test-send-token",
      GOOGLE_CLIENT_ID: "legacy-client",
      GOOGLE_CLIENT_SECRET: "legacy-secret"
    };
    const request = new Request("https://worker.example.test/api/notifications/gmail-send", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer test-send-token"
      },
      body: JSON.stringify({ notification_id: 42 })
    });
    const response = await handleGmailOAuth(request, env);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.match(body.error, /Unsupported outbound email provider/);
    assert.equal(callCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
'@
[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))
Write-Output 'Outbound notifications now fail closed instead of silently falling back to Gmail; account-security email remains legacy until Resend is configured.'
