$ErrorActionPreference='Continue'
$checks=@(
 @{name='worker-health';url='https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/health'},
 @{name='public-catalog';url='https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog'},
 @{name='dashboard-html';url='https://pakthai-ai-sourcing.pakthaitech.workers.dev/'},
 @{name='store-home';url='https://pakthai-tech-store.pages.dev/'}
)
foreach($c in $checks){try{$r=Invoke-WebRequest -Uri $c.url -Method Get -TimeoutSec 20 -UseBasicParsing;$bytes=[Text.Encoding]::UTF8.GetByteCount([string]$r.Content);$extra='';if($c.name -eq 'worker-health'){$extra=' body='+$r.Content};if($c.name -eq 'public-catalog'){$j=$r.Content|ConvertFrom-Json;$n=if($j.products){$j.products.Count}else{0};$extra=' products='+$n};if($c.name -eq 'dashboard-html'){$extra=' hasCatalogRetryText='+([string]$r.Content).Contains('up to 5 attempts per product')};Write-Output ($c.name+' HTTP '+[int]$r.StatusCode+' bytes='+$bytes+$extra)}catch{Write-Output ($c.name+' ERROR '+$_.Exception.Message)}}
