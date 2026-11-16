$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\gmail-oauth.js'
$s=[IO.File]::ReadAllText($p)
$old=@'
function gmailPlainBody(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeGmailBody(payload.body.data);
  for (const part of (payload.parts || [])) { const found=gmailPlainBody(part); if (found) return found; }
  return "";
}
'@
$new=@'
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
'@
if(-not $s.Contains($old)){throw 'Gmail body parser anchor not found'}
$s=$s.Replace($old,$new)
[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))

$p='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\tools\audit\email-provider.test.mjs'
$s=[IO.File]::ReadAllText($p)
$s=$s.Replace('import { handleGmailOAuth, sendAccountSecurityEmail } from "../../src/gmail-oauth.js";','import { gmailPlainBody, handleGmailOAuth, sendAccountSecurityEmail } from "../../src/gmail-oauth.js";')
$s += @'

test("Gmail multipart delivery failures preserve the full SMTP diagnostic part", () => {
  const encode = value => Buffer.from(value, "utf8").toString("base64url");
  const body = gmailPlainBody({
    mimeType: "multipart/report",
    parts: [
      { mimeType: "text/plain", body: { data: encode("Message not delivered. The response was: see diagnostic details below.") } },
      { mimeType: "message/delivery-status", body: { data: encode("Final-Recipient: rfc822; buyer@example.test\nAction: failed\nStatus: 5.1.1\nDiagnostic-Code: smtp; 550 5.1.1 User unknown") } },
      { mimeType: "text/html", body: { data: encode("<p>HTML summary that should not replace the diagnostic.</p>") } }
    ]
  });
  assert.match(body, /message\/delivery-status/);
  assert.match(body, /Final-Recipient: rfc822; buyer@example\.test/);
  assert.match(body, /550 5\.1\.1 User unknown/);
  assert.match(body, /Message not delivered/);
  assert.doesNotMatch(body, /HTML summary/);
});
'@
[IO.File]::WriteAllText($p,$s,[Text.UTF8Encoding]::new($false))
Write-Output 'Updated Gmail multipart parser to retain delivery-status diagnostics and added a regression test.'
