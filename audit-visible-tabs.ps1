Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$ErrorActionPreference='SilentlyContinue'
$root=[System.Windows.Automation.AutomationElement]::RootElement
$win=$root.FindFirst([System.Windows.Automation.TreeScope]::Children,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'PAKTHAI TECH - AI Sourcing Engine - Personal - Microsoft? Edge')))
if(-not $win){$all=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition);foreach($x in $all){if($x.Current.Name -like '*PAKTHAI TECH - AI Sourcing Engine*'){$win=$x;break}}}
$doc=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Document)))
$tabs=@('Dashboard','Seller Database','Small-Lot Calculator','Seller History','Sourcing Opportunities','Pakistan Buyer Center','Buyer Discovery','Sourcing Partners','Voice Assistant')
foreach($tab in $tabs){
 $b=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$tab)))
 if($b){try{$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Milliseconds 500}catch{}}
 $els=$doc.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
 $lines=@()
 foreach($e in $els){$nm=$e.Current.Name;if($nm -and -not $e.Current.IsOffscreen -and $lines.Count -lt 100){$lines+=($e.Current.ControlType.ProgrammaticName.Replace('ControlType.','')+': '+$nm)}}
 Write-Output ("=== TAB: "+$tab+" | button="+[bool]$b+" ===")
 Write-Output ($lines -join " | ")
}
