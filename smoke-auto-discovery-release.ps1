$checks=@(
 @{name='health';url='https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/health'},
 @{name='catalog';url='https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog'},
 @{name='dashboard';url='https://pakthai-ai-sourcing.pakthaitech.workers.dev/'},
 @{name='store';url='https://pakthai-tech-store.pages.dev/'}
)
foreach($c in $checks){try{$r=Invoke-WebRequest -Uri $c.url -TimeoutSec 20 -UseBasicParsing;$extra='';if($c.name -eq 'health'){$extra=' '+$r.Content};if($c.name -eq 'catalog'){$j=$r.Content|ConvertFrom-Json;$extra=' products='+$j.products.Count};if($c.name -eq 'dashboard'){$extra=' hasHourlyDiscovery='+([string]$r.Content).Contains('runScheduledProspectDiscovery')};Write-Output ($c.name+' HTTP '+[int]$r.StatusCode+$extra)}catch{Write-Output ($c.name+' ERROR '+$_.Exception.Message)}}
