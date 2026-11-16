$root='D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL'
$files=@('src\worker.js','src\outreach-scheduler.js','src\gmail-oauth.js','src\external-discovery.js','src\buyer-discovery.js','src\seller-discovery.js','src\market-discovery.js','src\korea-seller-discovery.js','wrangler.jsonc')
$patterns='scheduled|scheduled|runScheduled|runAIProspect|cron|schedule|gmail|auto.reply|fetch\(|search|runScheduledOutreach|outreach|AI_SCREEN|ai_screening_last_status|waitUntil|ctx\.waitUntil|scheduled\('
foreach($f in $files){$p=Join-Path $root $f;if(Test-Path $p){Write-Output "=== $f ===";Select-String -Path $p -Pattern $patterns | ForEach-Object {Write-Output ($_.LineNumber.ToString()+': '+$_.Line.Trim().Substring(0,[Math]::Min(260,$_.Line.Trim().Length)))}}}
