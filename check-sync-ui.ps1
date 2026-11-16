Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){if($w.Current.Name -like '*PAKTHAI TECH - AI Sourcing Engine*'){$all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);Write-Output ('WINDOW='+$w.Current.Name);foreach($e in $all){if($e.Current.Name -match 'Catalog sync:|Syncing catalog|Sync Source Catalog|Syncing\.\.\.|Catalog sync finished|PARTIAL|COMPLETE'){Write-Output ($e.Current.IsOffscreen.ToString()+' | '+$e.Current.IsEnabled.ToString()+' | '+$e.Current.Name)}}}}
