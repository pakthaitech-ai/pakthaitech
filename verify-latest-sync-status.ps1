Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
function ByName($scope,$name){$scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
$b=ByName $win 'Voice Assistant';$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Milliseconds 300
$input=ByName $win 'e.g. system status / catalog sync status / pending approvals / Gmail status';$run=ByName $win 'Run Command'
$input.SetFocus();[System.Windows.Forms.SendKeys]::SendWait('^a');[System.Windows.Forms.SendKeys]::SendWait('catalog sync status');$run.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Milliseconds 1200
$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($e in $all){if($e.Current.Name -like 'Catalog sync:*'){Write-Output ('CATALOG_STATUS='+$e.Current.Name)}}
