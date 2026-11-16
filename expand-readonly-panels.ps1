Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like 'PAKTHAI TECH - AI Sourcing Engine - Personal*'){$win=$w;break}}
$names=@('Partner Delivery & Provider Status','Owner Browser Push Backup','Inbox Center','Mailbox - Gmail Inbox','WhatsApp Inbox - opt-in and delivery history','Outgoing Message Queue - WhatsApp opt-in / Email Owner Approval')
foreach($n in $names){$b=$win.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$n)));if($b){try{$p=$b.GetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern);if($p.Current.ExpandCollapseState -eq [System.Windows.Automation.ExpandCollapseState]::Collapsed){$p.Expand();Write-Output ('EXPANDED '+$n)}}catch{try{$b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Write-Output ('CLICKED '+$n)}catch{Write-Output ('NO_PATTERN '+$n)}};Start-Sleep -Milliseconds 250}}
Start-Sleep -Seconds 1
$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition)
foreach($e in $all){$n=$e.Current.Name;if($n -and ($n -match 'Gmail|Whats|outbound|queue|notification|partner|Meta|template|verified|status|inbox|message|draft|loading|error|No messages|authorized|sender|opt-in|pending|AI Automation|Global Cost|Country Sourcing|Master AI|Auto Search|Seller Matching|Negotiation|Auto Follow-up|Opportunity Creation|Travel|Pickup|Packing|Freight|Duties|Payment|Pakistan Transport|Contingency|ON|OFF|push|subscription|sent|failed')){Write-Output ($e.Current.ControlType.ProgrammaticName+' | offscreen='+$e.Current.IsOffscreen+' | '+$n)}}
