Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
foreach($w in $wins){if($w.Current.Name -like '*PAKTHAI TECH - AI Sourcing Engine*'){$all=$w.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);foreach($e in $all){$n=$e.Current.Name;if($n -match 'Gmail|Whats|Outgoing|Mailbox|Notification|Queue|Catalog|Buyer|Seller|Opportunity|Sync|Voice|Status|Error|failed|Loading|Connected|authorized|verification|pending'){Write-Output (($e.Current.ControlType.ProgrammaticName)+' | offscreen='+$e.Current.IsOffscreen+' | '+$n)}}}}
