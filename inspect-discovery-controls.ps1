Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
if(-not $win){Write-Output 'OWNER_WINDOW_NOT_FOUND';exit 1}
function FindName($scope,$name){$scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
$nav=FindName $win 'Buyer Discovery';if($nav){try{$nav.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}catch{};Start-Sleep -Seconds 2}
$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($e in $all){$n=$e.Current.Name;if($n -and -not $e.Current.IsOffscreen -and ($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -or $e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -or $e.Current.ControlType -eq [System.Windows.Automation.ControlType]::ComboBox -or $n -match 'Discovery|search|buyer|seller|Thailand|Korea|Pakistan')){Write-Output ($e.Current.ControlType.ProgrammaticName+' | '+$n)}}
