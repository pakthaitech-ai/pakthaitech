$ErrorActionPreference = 'Stop'
$root = 'D:\Horse 2\PakThai-Store-DEPLOY'
Add-Type -AssemblyName System.Drawing
function New-PakThaiIcon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap($size,$size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(7,25,49))
  $rect = New-Object System.Drawing.Rectangle(3,3,($size-6),($size-6))
  $gold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255,196,66))
  $navy = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(7,25,49))
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255,221,126),[single]([Math]::Max(2,$size*0.025)))
  $g.FillEllipse($gold,$rect)
  $inset = [int]($size*0.105)
  $g.FillEllipse($navy,$inset,$inset,($size-2*$inset),($size-2*$inset))
  $font = New-Object System.Drawing.Font('Arial',[single]($size*0.31),[System.Drawing.FontStyle]::Bold,[System.Drawing.GraphicsUnit]::Pixel)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $g.DrawString('PT',$font,$white,(New-Object System.Drawing.RectangleF(0,0,$size,$size)),$sf)
  $g.DrawEllipse($pen,$inset,$inset,($size-2*$inset),($size-2*$inset))
  $bmp.Save($path,[System.Drawing.Imaging.ImageFormat]::Png)
  $font.Dispose();$pen.Dispose();$gold.Dispose();$navy.Dispose();$white.Dispose();$sf.Dispose();$g.Dispose();$bmp.Dispose()
}
New-PakThaiIcon 192 (Join-Path $root 'icons\icon-192.png')
New-PakThaiIcon 512 (Join-Path $root 'icons\icon-512.png')
$svg = @'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="110" fill="#071931"/>
<circle cx="256" cy="256" r="220" fill="#ffc442"/>
<circle cx="256" cy="256" r="184" fill="#071931" stroke="#ffdd7e" stroke-width="10"/>
<text x="256" y="294" font-family="Arial,Helvetica,sans-serif" font-size="160" font-weight="900" text-anchor="middle" fill="#ffffff">PT</text>
<path d="M115 356 Q256 430 397 356" fill="none" stroke="#ffc442" stroke-width="12" stroke-linecap="round"/>
</svg>
'@
Set-Content -Path (Join-Path $root 'icon.svg') -Value $svg -Encoding utf8
$manifestPath = Join-Path $root 'manifest.webmanifest'
$m = Get-Content $manifestPath -Raw
$m = $m -replace 'icon-192\.png\?v=\d+','icon-192.png?v=6' -replace 'icon-512\.png\?v=\d+','icon-512.png?v=6'
$m = $m -replace 'icon\.svg\?v=\d+','icon.svg?v=6'
Set-Content $manifestPath $m -Encoding utf8
$htmlPath = Join-Path $root 'index.html'
$html = Get-Content $htmlPath -Raw
$html = $html -replace 'icon-192\.png\?v=\d+','icon-192.png?v=6' -replace 'icon-512\.png\?v=\d+','icon-512.png?v=6'
$html = $html -replace 'icon\.svg\?v=\d+','icon.svg?v=6'
$html = $html -replace '(<link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png\?v=6">)', ('$1' + [Environment]::NewLine + '<link rel="shortcut icon" href="/icon.svg?v=6">')
Set-Content $htmlPath $html -Encoding utf8
Write-Output 'Updated high-contrast PakThai icons and cache version v6.'
