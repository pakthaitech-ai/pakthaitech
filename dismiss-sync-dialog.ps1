Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){if($w.Current.Name -like '*PAKTHAI TECH - AI Sourcing Engine*'){$btn=$w.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'OK')));if($btn){$btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Write-Output 'Dismissed catalog sync result dialog'}}}
