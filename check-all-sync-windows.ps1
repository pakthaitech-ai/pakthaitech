Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){if($w.Current.Name -match 'PAKTHAI|says|Edge'){Write-Output ('WINDOW: '+$w.Current.Name);$all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);foreach($e in $all){if($e.Current.Name -match 'Catalog sync|Syncing catalog|Sync Source Catalog|Syncing\.\.\.|Saved/updated|failed after|PARTIAL|COMPLETE|OK$'){Write-Output ('  '+$e.Current.IsOffscreen+' | '+$e.Current.IsEnabled+' | '+$e.Current.Name)}}}}
