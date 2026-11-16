$b='https://pakthai-ai-sourcing.pakthaitech.workers.dev'
foreach($p in @('/api/settings','/api/controls','/api/negotiations')){
 try{$r=Invoke-WebRequest -Uri ($b+$p) -UseBasicParsing -TimeoutSec 15;$j=$r.Content|ConvertFrom-Json;Write-Output ('---'+$p+'---')
 if($p -eq '/api/settings'){foreach($k in @('phase2_last_run_at','phase2_last_status','catalog_sync_last_run_at','catalog_sync_last_saved','catalog_sync_last_status','catalog_sync_cursor','negotiation_followup_delay_hours','negotiation_max_attempts')){$x=@($j|Where-Object {$_.key -eq $k}|Select-Object -First 1);if($x.Count){Write-Output ($k+'='+$x[0].value)}}}
 elseif($p -eq '/api/controls'){Write-Output $r.Content.Substring(0,[Math]::Min(2200,$r.Content.Length))}
 else {Write-Output ('negotiations='+$j.negotiations.Count);$j.negotiations|Select-Object -First 5 id,seller_name,seller_country,status,attempt_count,next_followup_at|ConvertTo-Json -Compress}
 }catch{Write-Output ($p+' ERROR '+$_.Exception.Message)}
}