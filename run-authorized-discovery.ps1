Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
if(-not $win){Write-Output 'OWNER_WINDOW_NOT_FOUND';exit 1}
function FindName($scope,$name){$scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
$tasks=@(
 @{nav='Buyer Discovery';button='Search Pakistan Buyers';result='Search complete'},
 @{nav='Buyer Discovery';button='Find Thailand Sellers';result='Thailand search complete'},
 @{nav='Buyer Discovery';button='Find Thailand Buyers';result='Thailand buyer search complete'},
 @{nav='Buyer Discovery';button='Find Korea Sellers';result='Korea search complete'},
 @{nav='Buyer Discovery';button='Find Korea Buyers';result='South Korea buyer search complete'}
)
foreach($t in $tasks){
 $nav=FindName $win $t.nav;if($nav){try{$nav.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}catch{};Start-Sleep -Milliseconds 700}
 $btn=FindName $win $t.button
 if(-not $btn){Write-Output ('NOT_FOUND: '+$t.button);continue}
 try{$btn.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Write-Output ('STARTED: '+$t.button)}catch{Write-Output ('CLICK_FAILED: '+$t.button+' '+$_.Exception.Message);continue}
 $deadline=(Get-Date).AddSeconds(25);$found=$false
 while((Get-Date)-lt $deadline){Start-Sleep -Seconds 2
   $els=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
   foreach($e in $els){$n=$e.Current.Name;if($n -and ($n -match 'search complete|search failed|buyer search complete|returned no|Could not|failed:|Results:|leads saved|HTTP 429|rate limit|OpenStreetMap')){if(-not $e.Current.IsOffscreen){Write-Output ('STATUS: '+$n);$found=$true}}}
   if($found){break}
 }
 if(-not $found){Write-Output ('STATUS_TIMEOUT: '+$t.button)}
}
