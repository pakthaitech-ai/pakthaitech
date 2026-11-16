$ErrorActionPreference='Stop'
$p='D:\Horse 2\PakThai-Store-DEPLOY\manifest.webmanifest'
$b=[System.IO.File]::ReadAllBytes($p)
if($b.Length -ge 3 -and $b[0] -eq 239 -and $b[1] -eq 187 -and $b[2] -eq 191){
  Copy-Item $p ($p+'.pre-bom-fix-20261010.bak') -Force
  [System.IO.File]::WriteAllBytes($p,$b[3..($b.Length-1)])
  Write-Output 'Removed UTF-8 BOM from manifest; backup created.'
}else{Write-Output 'No UTF-8 BOM found; no edit needed.'}
