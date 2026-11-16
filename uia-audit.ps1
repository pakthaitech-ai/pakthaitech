Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){if($w.Current.Name -like '*PAKTHAI TECH - AI Sourcing Engine*'){$c=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);Write-Output ("WINDOW "+$w.Current.Name);$i=0;foreach($e in $c){if($e.Current.Name -and $i -lt 350){Write-Output ($e.Current.ControlType.ProgrammaticName+" | "+$e.Current.Name);$i++}}}}
