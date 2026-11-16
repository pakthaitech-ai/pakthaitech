$root = 'D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL'
$exclude = '\\(node_modules|\.wrangler)\\'
$files = @(Get-ChildItem -LiteralPath $root -Recurse -File -Force | Where-Object { $_.FullName -notmatch $exclude })
$dups = @($files | Get-FileHash -Algorithm SHA256 | Group-Object Hash | Where-Object { $_.Count -gt 1 })
"FILES=$($files.Count)"
"DUPLICATE_HASH_GROUPS=$($dups.Count)"
foreach ($g in $dups) {
  "--- DUPLICATE SHA256 $($g.Name)"
  foreach ($x in $g.Group) { $x.Path }
}
"--- ZERO_BYTE_FILES"
$files | Where-Object { $_.Length -eq 0 } | ForEach-Object { $_.FullName }
"--- ROOT MARKDOWN/CONFIG"
Get-ChildItem -LiteralPath $root -File | Where-Object { $_.Extension -in '.md','.txt','.jsonc','.json','.mjs' } | Select-Object Name,Length | Format-Table -AutoSize
