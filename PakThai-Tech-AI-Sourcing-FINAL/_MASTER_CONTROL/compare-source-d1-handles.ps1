$ErrorActionPreference='Stop'
Set-Location 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL'
$sourceHandles=@()
for($page=1;$page -le 100;$page++){
  $u="https://sakoonsay.com/products.json?limit=250&page=$page"
  $r=Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
  $j=$r.Content|ConvertFrom-Json
  $rows=@($j.products)
  $sourceHandles += @($rows | ForEach-Object { [string]$_.handle } | Where-Object { $_ })
  if($rows.Count -lt 250){break}
}
$sourceHandles=@($sourceHandles | Sort-Object -Unique)
$raw = & .\node_modules\.bin\wrangler.cmd d1 execute pakthai-sourcing-db --remote --config wrangler.jsonc --json --command "SELECT handle FROM products WHERE handle IS NOT NULL AND TRIM(handle)<>'' ORDER BY handle;"
if($LASTEXITCODE -ne 0){throw 'Read-only D1 query failed.'}
$data=($raw -join [Environment]::NewLine) | ConvertFrom-Json
$dbHandles=@($data[0].results | ForEach-Object { [string]$_.handle } | Where-Object { $_ } | Sort-Object -Unique)
$diff=@(Compare-Object -ReferenceObject $sourceHandles -DifferenceObject $dbHandles)
$missing=@($diff | Where-Object { $_.SideIndicator -eq '<=' } | Select-Object -ExpandProperty InputObject)
$extra=@($diff | Where-Object { $_.SideIndicator -eq '=>' } | Select-Object -ExpandProperty InputObject)
Write-Output ("SOURCE_UNIQUE_HANDLES="+$sourceHandles.Count)
Write-Output ("D1_UNIQUE_HANDLES="+$dbHandles.Count)
Write-Output ("MISSING_IN_D1="+$missing.Count)
$missing | ForEach-Object { Write-Output ("MISSING: "+$_) }
Write-Output ("D1_NOT_IN_SOURCE="+$extra.Count)
$extra | Select-Object -First 20 | ForEach-Object { Write-Output ("EXTRA: "+$_) }
