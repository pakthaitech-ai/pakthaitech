Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
$b=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Sourcing Partners')))
$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Seconds 3
$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($e in $all){$n=$e.Current.Name;if($n -and ($n -match 'Gmail|Whats|outbound|queue|notification|partner|Meta|template|verified|status|inbox|message|draft|loading|error|No messages|authorized|sender|opt-in|pending')){Write-Output ($e.Current.ControlType.ProgrammaticName+' | offscreen='+$e.Current.IsOffscreen+' | '+$n)}}
