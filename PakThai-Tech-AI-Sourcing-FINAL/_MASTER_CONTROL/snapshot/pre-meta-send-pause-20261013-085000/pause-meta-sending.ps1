$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js'
$s = [IO.File]::ReadAllText($p)

function Replace-Block([string]$source, [string]$startMarker, [string]$endMarker, [string]$replacement) {
  $start = $source.IndexOf($startMarker)
  if ($start -lt 0) { throw "Start marker not found: $startMarker" }
  $end = $source.IndexOf($endMarker, $start + $startMarker.Length)
  if ($end -lt 0) { throw "End marker not found: $endMarker" }
  return $source.Substring(0,$start) + $replacement + $source.Substring($end)
}

$s = Replace-Block $s "async function sendWhatsAppCloudMessage(env, recipient, message) {" "async function ensureWhatsAppStatusTable(db) {" @'
 // Legacy Meta Graph API outbound sender removed during the Owner-approved provider migration.
 // Historical delivery status and inbound webhook records remain readable.

'@

$s = Replace-Block $s "  if (path === '/api/notifications/whatsapp-webhook-subscribe' && method === 'POST') {" "  if (path === '/api/notifications/whatsapp-diagnostics' && method === 'GET') {" @'
  if (path === '/api/notifications/whatsapp-webhook-subscribe' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,paused:true,error:'Automated Meta WhatsApp setup is paused per Owner provider-migration decision. No Meta API request was made.'},410);
  }
'@

$s = Replace-Block $s "  if (path === '/api/notifications/whatsapp-diagnostics' && method === 'GET') {" "  if (path === '/api/notifications/whatsapp-template-test' && method === 'POST') {" @'
  if (path === '/api/notifications/whatsapp-diagnostics' && method === 'GET') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,paused:true,message:'Automated WhatsApp sending is paused during provider migration. No Meta API request was made.'});
  }
'@

$s = Replace-Block $s "  if (path === '/api/notifications/whatsapp-template-test' && method === 'POST') {" "  if (path === '/api/notifications/whatsapp-inbox' && method === 'GET') {" @'
  if (path === '/api/notifications/whatsapp-template-test' && method === 'POST') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,paused:true,sent:false,error:'Meta WhatsApp template tests are paused during provider migration. No message was sent.'},410);
  }
'@

$s = Replace-Block $s "  if (path === '/api/notifications/whatsapp-send' && method === 'POST') {" "  // BLOCK 17" @'
  if (path === '/api/notifications/whatsapp-send' && method === 'POST') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,paused:true,sent:false,error:'Automated Meta WhatsApp sending is paused during provider migration. No message was sent.'},410);
  }

'@

$old = "UPDATE notifications SET status='approved' WHERE id=? AND status='prepared' AND channel IN ('email','whatsapp') AND NOT"
$new = "UPDATE notifications SET status='approved' WHERE id=? AND status='prepared' AND channel='email' AND NOT"
if (-not $s.Contains($old)) { throw 'Notification approval channel guard not found' }
$s = $s.Replace($old,$new)
$s = $s.Replace('Prepared email/WhatsApp notification not found or already reviewed.','Prepared email notification not found or already reviewed.')

$old = @'
<h3>WhatsApp Test — South Korea</h3><p>Owner-only: send one approved, variable-free Meta template to M. Nadeem (+82 10-6887-9265). Free-form business-initiated text may not deliver outside the 24-hour service window. Verify delivery on the recipient phone.</p><button id=whatsappTestBtn onclick="sendNadeemWhatsAppTest()">Send Approved Template Test</button><p id=whatsappTestResult aria-live=polite>API accepted the last test message; recipient delivery is not yet confirmed.</p><p style="font-size:13px;color:#7c2d12">Previous test: Meta accepted the request, but the delivery-status webhook was not active then. The exact reason for non-delivery cannot be recovered from API acceptance alone; this monitor will capture future status/error events after Meta webhook setup.</p>
'@
$new = @'
<h3>WhatsApp API sending paused</h3><p>Automated WhatsApp/Meta sending is paused while the provider migration is underway. No new Meta messages or template tests will be sent. Historical records remain available below; API acceptance is not delivery proof. The Store manual WhatsApp contact link is separate.</p><p id=whatsappTestResult aria-live=polite>Automated WhatsApp sending paused; no message sent.</p><p style="font-size:13px;color:#7c2d12">Legacy Meta delivery setup is intentionally paused. Do not repeat webhook/template setup until the Owner explicitly reopens that channel.</p>
'@
if (-not $s.Contains($old)) { throw 'Dashboard WhatsApp test panel anchor not found' }
$s = $s.Replace($old,$new)

$old = 'const diagnosticHtml=diag.ok?'
$new = 'const diagnosticHtml=diag.paused?''<div style="padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:12px"><b>Automated WhatsApp sending paused</b><p>''+esc(diag.message||''No Meta API calls will be made.'')+''</p></div>'':diag.ok?'
if (-not $s.Contains($old)) { throw 'Dashboard diagnosticHtml anchor not found' }
$s = $s.Replace($old,$new)

$old = "if(!Number.isInteger(Number(id))||!['email','whatsapp'].includes(channel))return;"
$new = "if(!Number.isInteger(Number(id))||channel!=='email')return;"
if (-not $s.Contains($old)) { throw 'Outbound queue channel guard not found' }
$s = $s.Replace($old,$new)

$old = @'
+(pending?'<button onclick="approveAndSendNotification('+Number(n.id)+',&quot;'+esc(n.channel)+'&quot;)">Approve &amp; Send</button> ':'')+'<button class="alt" onclick="archiveNotificationRecord('+Number(n.id)+')">Remove record</button>
'@
$new = @'
+(pending&&n.channel==='email'?'<button onclick="approveAndSendNotification('+Number(n.id)+',&quot;'+esc(n.channel)+'&quot;)">Approve &amp; Send</button> ':pending&&n.channel==='whatsapp'?'<span style="color:#92400e">Paused — provider migration</span> ':'')+'<button class="alt" onclick="archiveNotificationRecord('+Number(n.id)+')">Remove record</button>
'@
if (-not $s.Contains($old)) { throw 'Outbound queue action anchor not found' }
$s = $s.Replace($old.TrimEnd([char]13,[char]10),$new.TrimEnd([char]13,[char]10))

$old = "if(box)box.textContent=(channel==='whatsapp'?'WhatsApp API accepted message ID: ':'Gmail accepted message ID: ')+(sent.message_id||'not returned')+'. Provider acceptance is not recipient read confirmation.';"
$new = "if(box)box.textContent='Email provider accepted message ID: '+(sent.message_id||'not returned')+'. Provider acceptance is not recipient delivery confirmation.';"
if (-not $s.Contains($old)) { throw 'Outbound status wording anchor not found' }
$s = $s.Replace($old,$new)

$old = "async function sendNadeemWhatsAppTest(){"
if ($s.Contains($old)) {
  $s = Replace-Block $s $old "async function initPakThaiAuth(){" @'
async function sendNadeemWhatsAppTest(){
 const out=document.getElementById('whatsappTestResult');
 if(out)out.textContent='Automated WhatsApp sending is paused during provider migration. No message was sent.';
}
'@
}

[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))

$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\tools\audit\security-hardening.test.mjs'
$s = [IO.File]::ReadAllText($p)
$old = @'
test("WhatsApp provider send is reachable only through an approved notification", () => {
  const worker = read("src/worker.js");
  const sendCalls = worker.match(/await sendWhatsAppCloudMessage\(env/g) || [];
  assert.equal(sendCalls.length, 1);
  assert.match(worker, /VALUES\(\?,\?,\?,\?,\?,'prepared'\)/);
  assert.match(worker, /status='approved' LIMIT 1/);
  assert.match(worker, /Owner approval required: approve a prepared WhatsApp notification first/);
});
'@
$new = @'
test("automated Meta WhatsApp sending is paused during provider migration", () => {
  const worker = read("src/worker.js");
  const sendCalls = worker.match(/await sendWhatsAppCloudMessage\(env/g) || [];
  assert.equal(sendCalls.length, 0);
  assert.match(worker, /Automated Meta WhatsApp sending is paused during provider migration/);
  assert.match(worker, /Meta WhatsApp template tests are paused during provider migration/);
  assert.match(worker, /Automated WhatsApp sending is paused during provider migration/);
  assert.match(worker, /channel='email' AND NOT/);
});
'@
if (-not $s.Contains($old)) { throw 'WhatsApp security test anchor not found' }
$s = $s.Replace($old,$new)
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
Write-Output 'Paused Meta WhatsApp outbound/setup routes and updated dashboard + regression test.'
