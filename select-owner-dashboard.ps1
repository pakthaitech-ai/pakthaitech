Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$main=$null;foreach($w in $wins){if($w.Current.Name -like '*and 5 more pages*'){$main=$w;break}}
if($main){$ok=$main.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'OK')));if($ok){try{$ok.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Write-Output 'Dismissed original Owner-window partial-sync alert';Start-Sleep -Milliseconds 400}catch{Write-Output ('OK invoke failed '+$_.Exception.Message)}}
$tabs=$main.FindAll([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem)))
foreach($t in $tabs){if($t.Current.Name -like '*PAKTHAI TECH - AI Sourcing Engine*'){try{$t.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select();Write-Output ('Selected dashboard tab: '+$t.Current.Name)}catch{Write-Output ('Select failed '+$_.Exception.Message)}}}
}
