$ErrorActionPreference = 'Continue'
$worker = 'https://pakthai-ai-sourcing.pakthaitech.workers.dev'
$store = 'https://pakthai-tech-store.pages.dev/'
$results = [System.Collections.Generic.List[object]]::new()
function Add-Result($name,$status,$detail) { $results.Add([pscustomobject]@{Test=$name;Status=$status;Detail=$detail}) }
foreach ($item in @(@{Name='Store website';Url=$store},@{Name='Worker homepage';Url=$worker+'/'},@{Name='Worker health';Url=$worker+'/api/health'},@{Name='Dashboard';Url=$worker+'/api/dashboard'},@{Name='AI controls';Url=$worker+'/api/controls'},@{Name='Products';Url=$worker+'/api/products'},@{Name='Seller leads';Url=$worker+'/api/sellers'},@{Name='Buyers';Url=$worker+'/api/buyers'},@{Name='Buyer requirements';Url=$worker+'/api/buyer-requirements'},@{Name='Buyer matches';Url=$worker+'/api/buyer-matches'},@{Name='Opportunities';Url=$worker+'/api/opportunities'},@{Name='Settings';Url=$worker+'/api/settings'},@{Name='Customer request form';Url=$worker+'/customer-request'},@{Name='Customer request inbox';Url=$worker+'/api/customer-requests'})) {
  try {
    $r = Invoke-WebRequest -Uri $item.Url -TimeoutSec 15 -UseBasicParsing
    $detail = 'HTTP '+[int]$r.StatusCode
    if ($item.Name -eq 'Products') { $j=$r.Content|ConvertFrom-Json; $detail += '; count='+@($j).Count }
    elseif ($item.Name -eq 'Seller leads') { $j=$r.Content|ConvertFrom-Json; $detail += '; count='+@($j).Count }
    elseif ($item.Name -eq 'Buyers') { $j=$r.Content|ConvertFrom-Json; $detail += '; count='+@($j.buyers).Count }
    elseif ($item.Name -eq 'Buyer requirements') { $j=$r.Content|ConvertFrom-Json; $detail += '; count='+@($j.requirements).Count }
    elseif ($item.Name -eq 'Buyer matches') { $j=$r.Content|ConvertFrom-Json; $detail += '; count='+@($j.matches).Count }
    elseif ($item.Name -eq 'Opportunities') { $j=$r.Content|ConvertFrom-Json; $detail += '; count='+@($j).Count }
    elseif ($item.Name -eq 'Dashboard') { $j=$r.Content|ConvertFrom-Json; $detail += '; summary='+($j.summary|ConvertTo-Json -Compress) }
    elseif ($item.Name -eq 'AI controls') { $j=$r.Content|ConvertFrom-Json; $detail += '; masterAI='+$j.controls.master_ai_mode+'; autoSearch='+$j.controls.auto_search_enabled+'; sellerMatch='+$j.controls.seller_matching_enabled+'; ownerApproval='+$j.controls.owner_approval_required }
    elseif ($item.Name -eq 'Customer request form') { $detail += '; form='+($r.Content -match '<form')+'; submit='+($r.Content -match 'Submit Request') }
    elseif ($item.Name -eq 'Store website') { $detail += '; WhatsApp links='+([regex]::Matches($r.Content,'wa\.me/')).Count+'; Crisp='+($r.Content -match 'crisp') }
    elseif ($item.Name -eq 'Worker health') { $j=$r.Content|ConvertFrom-Json; $detail += '; ok='+$j.ok+'; service='+$j.service }
    Add-Result $item.Name 'PASS' $detail
  } catch {
    $code = 0
    try { $code = [int]$_.Exception.Response.StatusCode } catch {}
    $protected = @('Dashboard','AI controls','Products','Seller leads','Buyers','Buyer requirements','Buyer matches','Opportunities','Settings','Customer request inbox')
    if ($code -eq 401 -and $item.Name -in $protected) { Add-Result $item.Name 'AUTH-GUARDED' 'HTTP 401 without Owner session (expected; authenticated flow not tested)' }
    else { Add-Result $item.Name 'FAIL' $_.Exception.Message }
  }
}
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cfg = Join-Path $root 'wrangler.jsonc'
$src = Join-Path $root 'src\worker.js'
if ((Get-Content $cfg -Raw) -match '"0 \* \* \* \*"' -and (Get-Content $cfg -Raw) -match '"0 2 \* \* \*"') { Add-Result 'Cron configuration' 'PASS' 'Hourly workflow + daily 02:00 UTC catalog sync configured' } else { Add-Result 'Cron configuration' 'FAIL' 'Review wrangler.jsonc cron entries' }
$workerText = Get-Content $src -Raw
if ($workerText -match 'prepared_only' -and $workerText -match 'sendResult\.sent') { Add-Result 'Messaging honesty guard' 'PASS' 'Code distinguishes actual send from prepared_only' } else { Add-Result 'Messaging honesty guard' 'CHECK' 'Review send status logic' }
$results | Format-Table -AutoSize -Wrap
