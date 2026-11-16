$ErrorActionPreference = 'Continue'
$health = Invoke-WebRequest -UseBasicParsing 'https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/health' -TimeoutSec 20
Write-Output ('HEALTH_STATUS=' + [int]$health.StatusCode + ' BODY=' + $health.Content)
$catalog = Invoke-WebRequest -UseBasicParsing 'https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog' -TimeoutSec 30
$j = $catalog.Content | ConvertFrom-Json
$count = 0
if ($j.products) { $count = @($j.products).Count } elseif ($j.items) { $count = @($j.items).Count }
Write-Output ('CATALOG_STATUS=' + [int]$catalog.StatusCode + ' PRODUCT_COUNT=' + $count)
$store = Invoke-WebRequest -UseBasicParsing 'https://pakthai-tech-store.pages.dev/' -TimeoutSec 20
Write-Output ('STORE_STATUS=' + [int]$store.StatusCode + ' BYTES=' + $store.RawContentLength)
$dash = Invoke-WebRequest -UseBasicParsing 'https://pakthai-ai-sourcing.pakthaitech.workers.dev/' -TimeoutSec 20
Write-Output ('DASHBOARD_STATUS=' + [int]$dash.StatusCode + ' BYTES=' + $dash.RawContentLength + ' DISCOVERY_PANEL=' + $dash.Content.Contains('discoverycenter'))
