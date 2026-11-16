Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
$b=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,'Dashboard')));$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Milliseconds 500
$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($e in $all){if($e.Current.Name -match 'Partner Delivery|Owner Browser Push|Inbox Center|Mailbox — Gmail|WhatsApp Inbox|Outgoing Message Queue|Customer Requests|AI Automation Controls|Global Cost Controls|Country Sourcing Controls|Browser push|verification status|WhatsApp|Gmail'){Write-Output ($e.Current.ControlType.ProgrammaticName+' | offscreen='+$e.Current.IsOffscreen+' | '+$e.Current.Name)}}
