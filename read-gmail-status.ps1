Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
function FindName($scope,$name){$scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
$nav=FindName $win 'Voice Assistant';if($nav){try{$nav.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}catch{};Start-Sleep -Milliseconds 500}
$edit=FindName $win 'e.g. system status / catalog sync status / pending approvals / Gmail status'
$run=FindName $win 'Run Command'
if($edit -and $run){$edit.SetFocus();[System.Windows.Forms.SendKeys]::SendWait('^a');[System.Windows.Forms.SendKeys]::SendWait('Gmail status');$run.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Seconds 2}
$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($e in $all){$n=$e.Current.Name;if($n -and $n -match 'Gmail authorized|Sending ready|NOT VERIFIED|AUTHORIZED|Gmail status|Owner Approval'){Write-Output $n}}
