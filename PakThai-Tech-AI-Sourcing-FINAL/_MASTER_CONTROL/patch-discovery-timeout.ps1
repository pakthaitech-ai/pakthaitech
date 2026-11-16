$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\buyer-discovery.js'
$s = Get-Content -Raw -LiteralPath $p
$s = $s.Replace("'[out:json][timeout:20];'", "'[out:json][timeout:10];'")
$old = @'
        body: "data=" + encodeURIComponent(query)
      });
'@
$new = @'
        body: "data=" + encodeURIComponent(query),
        signal: AbortSignal.timeout(9000)
      });
'@
if (-not $s.Contains($old)) { throw 'Could not find Overpass fetch block; no patch applied.' }
$s = $s.Replace($old, $new)
Set-Content -LiteralPath $p -Value $s -Encoding utf8
Write-Output 'Patched Overpass request timeout to 9 seconds and query timeout to 10 seconds.'