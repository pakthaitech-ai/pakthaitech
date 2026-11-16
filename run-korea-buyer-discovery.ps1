Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
function FindName($scope,$name){$scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
$nav=FindName $win 'Buyer Discovery';if($nav){try{$nav.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}catch{};Start-Sleep -Seconds 1}
$btn=FindName $win 'Find Korea Buyers'
if(-not $btn){Write-Output 'KOREA_BUYER_BUTTON_NOT_FOUND';exit 1}
try{$btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Write-Output 'KOREA_BUYER_SEARCH_STARTED'}catch{Write-Output ('CLICK_ERROR '+$_.Exception.Message);exit 1}
Start-Sleep -Seconds 15
$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($e in $all){$n=$e.Current.Name;if($n -and -not $e.Current.IsOffscreen -and ($n -match 'South Korea buyer search|Korea buyer search|Buyer search failed|results:|Results:|leads saved|No prospects found|HTTP')){Write-Output $n}}
