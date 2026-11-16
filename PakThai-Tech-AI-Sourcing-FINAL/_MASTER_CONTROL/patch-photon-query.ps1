$ErrorActionPreference = 'Stop'
$path = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\src\buyer-discovery.js'
$s = [System.IO.File]::ReadAllText($path)
$old = 'photonUrl.searchParams.set("q", phrase + " " + city + " Pakistan");'
$new = 'photonUrl.searchParams.set("q", phrase + " " + city);'
if (-not $s.Contains($old)) { throw 'Photon query patch target not found.' }
[System.IO.File]::Copy($path, "$path.pre-photon-query-20261010.bak", $true)
$s = $s.Replace($old, $new)
# Relax relevance: OSM Photon tags can be incomplete; retain named computer/electronics-related shops and businesses.
$old2 = 'const relevant = (key === "shop" && /^(computer|electronics|computer_parts|yes)$/.test(value)) || /computer|computing|it solutions|technology|technologies|laptop/.test(searchable);'
$new2 = 'const relevant = (key === "shop" && /^(computer|electronics|computer_parts|yes|hardware)$/.test(value)) || /computer|computing|it solutions|technology|technologies|laptop|electronic|hardware/.test(searchable);'
if (-not $s.Contains($old2)) { throw 'Photon filter patch target not found.' }
$s = $s.Replace($old2, $new2)
[System.IO.File]::WriteAllText($path, $s, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Broadened Photon search and hardware relevance.'
