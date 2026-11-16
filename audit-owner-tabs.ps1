Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
function ByName($scope,$name){$scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like '*and 5 more pages*'){$win=$w;break}}
$doc=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Document)))
$tabs=@('Dashboard','Seller Database','Small-Lot Calculator','Seller History','Sourcing Opportunities','Pakistan Buyer Center','Buyer Discovery','Sourcing Partners','Voice Assistant')
foreach($tab in $tabs){
 $b=ByName $win $tab
 if($b){try{$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()}catch{};Start-Sleep -Milliseconds 900}
 $els=$doc.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
 $lines=@()
 foreach($e in $els){$nm=$e.Current.Name;if($nm -and -not $e.Current.IsOffscreen){$v='';if($e.Current.ControlType -eq [System.Windows.Automation.ControlType]::Edit){try{$v=$e.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).Current.Value}catch{}};$line=$e.Current.ControlType.ProgrammaticName.Replace('ControlType.','')+': '+$nm;if($v){$line+=' VALUE='+$v};if($lines.Count -lt 100){$lines+= $line}}}
 Write-Output ("=== TAB: "+$tab+" | FOUND="+[bool]$b+" ===")
 Write-Output ($lines -join " | ")
}
