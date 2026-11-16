Start-Process 'msedge.exe' 'https://chatgpt.com/'
Start-Sleep -Seconds 3
$ws=New-Object -ComObject WScript.Shell
$activated=$ws.AppActivate('ChatGPT')
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class MouseMover { [DllImport("user32.dll")] public static extern bool SetCursorPos(int X,int Y); }
'@
[MouseMover]::SetCursorPos(960,540) | Out-Null
Write-Output ('CHATGPT_APP_ACTIVATE='+$activated+'; CURSOR_CENTER_REQUESTED=960,540')
