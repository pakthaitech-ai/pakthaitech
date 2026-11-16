Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){$all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);foreach($e in $all){if($e.Current.Name -eq 'OK' -and $e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button){try{$e.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Write-Output ('Dismissed result dialog in '+$w.Current.Name);Start-Sleep -Milliseconds 250}catch{}}}}
