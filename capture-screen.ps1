Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$img=New-Object System.Drawing.Bitmap($b.Width,$b.Height)
$g=[System.Drawing.Graphics]::FromImage($img)
$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)
$img.Save('D:\pakthai\current-screen.png',[System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$img.Dispose()
Write-Output 'SCREEN_CAPTURED'
