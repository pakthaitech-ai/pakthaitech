$base='https://pakthai-ai-sourcing.pakthaitech.workers.dev'
$routes=@('/api/dashboard','/api/sellers','/api/opportunities','/api/external-prospects','/api/sourcing-partners','/api/gmail/status','/api/notifications/whatsapp-diagnostics')
foreach($route in $routes){ try { $resp=Invoke-WebRequest -UseBasicParsing -Uri ($base+$route) -TimeoutSec 15; $code=[int]$resp.StatusCode } catch { if ($_.Exception.Response) { $code=[int]$_.Exception.Response.StatusCode } else { $code='NETWORK_ERROR' } }; Write-Output ($route+' => '+$code) }
