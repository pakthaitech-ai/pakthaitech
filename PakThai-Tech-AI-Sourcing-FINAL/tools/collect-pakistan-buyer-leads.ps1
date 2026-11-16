# PAKTHAI TECH â€” Free public business lead discovery (no emails are sent)
$ErrorActionPreference = 'Continue'
$root = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL'
$exe = Join-Path $root 'tools\openserp\openserp.exe'
$out = Join-Path $root 'OLD_REPORTS\pakistan-public-buyer-leads-20261009.csv'
$queries = @(
  @{city='Karachi'; q='computer hardware wholesaler retailer Karachi Pakistan contact email'},
  @{city='Lahore'; q='computer parts wholesale shop Lahore Pakistan contact email'},
  @{city='Faisalabad'; q='computer hardware shop wholesaler Faisalabad Pakistan contact email'},
  @{city='Islamabad'; q='computer hardware distributor shop Islamabad Pakistan contact email'},
  @{city='Rawalpindi'; q='computer parts wholesale retailer Rawalpindi Pakistan contact email'},
  @{city='Peshawar'; q='computer hardware shop wholesaler Peshawar Pakistan contact email'},
  @{city='Multan'; q='computer parts retailer wholesaler Multan Pakistan contact email'},
  @{city='Gujranwala'; q='computer hardware shop Gujranwala Pakistan contact email'},
  @{city='Sialkot'; q='computer parts wholesaler Sialkot Pakistan contact email'}
)
$candidates = [System.Collections.Generic.List[object]]::new()
foreach ($item in $queries) {
  Write-Output ("SEARCH: " + $item.city)
  try {
    $raw = (& $exe search bing $item.q --limit 6 --search-timeout 15 --format json --timeout 20 2>$null | Out-String).Trim()
    $jsonStart = $raw.IndexOf('{')
    if ($jsonStart -lt 0) { Write-Output '  no JSON results'; continue }
    $data = $raw.Substring($jsonStart) | ConvertFrom-Json
    foreach ($res in @($data.results)) {
      if (-not $res.url -or -not $res.title) { continue }
      $candidates.Add([pscustomobject]@{
        City=$item.city; Title=[string]$res.title; Url=[string]$res.url
        Domain=[string]$res.domain; Snippet=[string]$res.snippet; Query=$item.q
      })
    }
    Write-Output ("  results: " + @($data.results).Count)
  } catch { Write-Output ("  search failed: " + $_.Exception.Message) }
}
$unique = @($candidates | Sort-Object Url -Unique | Where-Object {
  $_.Url -match '^https?://' -and
  $_.Title -match '(?i)computer|hardware|laptop|pc parts|technology|IT hardware|gaming|wholesale|distribut' -and
  $_.Url -notmatch '(?i)facebook|instagram|youtube|linkedin|wikipedia|urdupoint.com/business/directory'
} | Select-Object -First 25)
Write-Output ("UNIQUE BUSINESS CANDIDATES: " + $unique.Count)
$rows = [System.Collections.Generic.List[object]]::new()
$index = 0
foreach ($lead in $unique) {
  $index++
  Write-Output ("CHECK {0}/{1}: {2}" -f $index,$unique.Count,$lead.Domain)
  $emails = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  $pages = @([string]$lead.Url)
  try {
    $u = [uri]$lead.Url
    $pages += @(
      ($u.GetLeftPart([System.UriPartial]::Authority) + '/contact'),
      ($u.GetLeftPart([System.UriPartial]::Authority) + '/contact-us'),
      ($u.GetLeftPart([System.UriPartial]::Authority) + '/pages/contact')
    )
  } catch {}
  foreach ($page in @($pages | Select-Object -Unique | Select-Object -First 2)) {
    try {
      $resp = Invoke-WebRequest -Uri $page -TimeoutSec 4 -MaximumRedirection 3 -UseBasicParsing -Headers @{'User-Agent'='Mozilla/5.0 (compatible; PakThaiTechBusinessContact/1.0)'} -ErrorAction Stop
      $html = [string]$resp.Content
      foreach ($match in [regex]::Matches($html, '(?i)[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}')) {
        $email = $match.Value.Trim().TrimEnd('.',',',';',':',')',']','}')
        if ($email -notmatch '(?i)example\.com|\.png$|\.jpg$|\.webp$|sentry|wixpress|cloudflare|\.svg$|\.css$|\.js$|noreply|no-reply') {
          [void]$emails.Add($email)
        }
      }
      if ($emails.Count -gt 0) { break }
    } catch {}
  }
  $emailText = (@($emails | Sort-Object) -join '; ')
  $rows.Add([pscustomobject]@{
    City=$lead.City; Business=$lead.Title; PublicEmail=$emailText
    Website=$lead.Url; Domain=$lead.Domain; EmailFound=([bool]$emails.Count)
    Verification='Review business fit and contact page before outreach'
    Source='OpenSERP/DuckDuckGo public web results'; SearchQuery=$lead.Query; Snippet=$lead.Snippet
  })
}
$dir = Split-Path $out -Parent
New-Item -ItemType Directory -Path $dir -Force | Out-Null
$rows | Export-Csv -Path $out -NoTypeInformation -Encoding UTF8
Write-Output ("SAVED: " + $out)
Write-Output ("TOTAL CANDIDATES: " + $rows.Count)
Write-Output ("PUBLIC EMAIL FOUND: " + @($rows | Where-Object EmailFound).Count)
Write-Output ("NO EMAIL FOUND: " + @($rows | Where-Object { -not $_.EmailFound }).Count)
$rows | Where-Object EmailFound | Select-Object City,Business,PublicEmail,Website | Format-Table -Wrap -AutoSize | Out-String -Width 220

