function Replace-One($path,$old,$new,$label) {
  $p=Join-Path (Get-Location) $path; $s=[System.IO.File]::ReadAllText($p); $count=([regex]::Matches($s,[regex]::Escape($old))).Count
  if($count -ne 1){throw "$label expected one match, got $count"}; [System.IO.File]::WriteAllText($p,$s.Replace($old,$new),[System.Text.UTF8Encoding]::new($false)); Write-Output "PATCHED $label"
}
$p=Join-Path (Get-Location) 'src\worker.js'; $lines=[System.IO.File]::ReadAllLines($p); $i=[Array]::FindIndex($lines,[Predicate[string]]{param($x) $x.StartsWith('async function ensureWhatsAppStatusTable(db) {`n')}); if($i -lt 0){throw 'Broken WhatsApp table line not found'}; $lines[$i]='async function ensureWhatsAppStatusTable(db) {'; $list=[System.Collections.Generic.List[string]]::new(); for($j=0;$j -le $i;$j++){ $list.Add($lines[$j]) }; $list.Add('  await db.prepare(`CREATE TABLE IF NOT EXISTS whatsapp_inbox_messages (message_id TEXT PRIMARY KEY, sender TEXT NOT NULL, sender_name TEXT, message_type TEXT, message_text TEXT, message_timestamp TEXT, received_at TEXT DEFAULT CURRENT_TIMESTAMP)`).run(); for($j=$i+1;$j -lt $lines.Length;$j++){ $list.Add($lines[$j]) }; [System.IO.File]::WriteAllLines($p,$list,[System.Text.UTF8Encoding]::new($false)); Write-Output 'FIXED WhatsApp table line'
$old=@"
  let updates = 0;
  for (const entry of payload.entry || []) {
"@
$new=@"
  let updates = 0;
  let inboundMessages = 0;
  for (const entry of payload.entry || []) {
"@
Replace-One 'src\worker.js' $old $new 'Webhook inbound counter'
$old=@"
      const value = change.value || {};
      for (const item of value.statuses || []) {
"@
$new=@"
      const value = change.value || {};
      const contactNames = new Map((value.contacts || []).map(c => [String(c.wa_id || ""), String(c.profile?.name || "")]));
      for (const incoming of value.messages || []) {
        if (!incoming.id || !incoming.from) continue;
        const type = String(incoming.type || "unknown");
        const textBody = type === "text" ? String(incoming.text?.body || "") : ["image","document","video"].includes(type) ? String(incoming[type]?.caption || "[" + type + " message]") : "[" + type + " message]";
        const timestamp = incoming.timestamp ? new Date(Number(incoming.timestamp) * 1000).toISOString() : new Date().toISOString();
        await env.DB.prepare(`INSERT OR IGNORE INTO whatsapp_inbox_messages(message_id,sender,sender_name,message_type,message_text,message_timestamp) VALUES(?,?,?,?,?,?)`).bind(String(incoming.id),String(incoming.from),contactNames.get(String(incoming.from)) || "",type,textBody.slice(0,8000),timestamp).run();
        inboundMessages++;
      }
      for (const item of value.statuses || []) {
"@
Replace-One 'src\worker.js' $old $new 'Inbound WhatsApp webhook processing'
Replace-One 'src\worker.js' '  return json({ ok: true, status_updates_processed: updates });' '  return json({ ok: true, status_updates_processed: updates, inbound_messages_processed: inboundMessages });' 'Webhook counts'
