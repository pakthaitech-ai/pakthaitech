Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){if($w.Current.Name -like '*and 5 more pages*'){$all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);foreach($e in $all){if($e.Current.Name -eq 'OK'){try{$e.SetFocus();[System.Windows.Forms.SendKeys]::SendWait('{ENTER}');Write-Output 'Sent Enter to modal OK';break}catch{Write-Output $_.Exception.Message}}}}}
Start-Sleep -Milliseconds 500
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){if($w.Current.Name -like '*and 5 more pages*'){$all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);Write-Output ('WINDOW '+$w.Current.Name);foreach($e in $all){if($e.Current.Name -and -not $e.Current.IsOffscreen -and ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Text -or $e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -or $e.Current.ControlType -eq [System.Windows.Automation.ControlType]::TabItem)){Write-Output ($e.Current.ControlType.ProgrammaticName+' | '+$e.Current.Name)}}}}
