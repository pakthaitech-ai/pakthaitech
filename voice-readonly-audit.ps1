Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
$root=[System.Windows.Automation.AutomationElement]::RootElement
$wins=$root.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
$win=$null;foreach($w in $wins){if($w.Current.Name -like '*PAKTHAI TECH - AI Sourcing Engine*'){$win=$w;break}}
function FindByName($scope,$name){return $scope.FindFirst([System.Windows.Automation.TreeScope]::Descendants,(New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty,$name)))}
$voice=FindByName $win 'Voice Assistant';$voice.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Milliseconds 500
$input=FindByName $win 'e.g. system status / catalog sync status / pending approvals / Gmail status'
$run=FindByName $win 'Run Command'
foreach($cmd in @('system status','catalog sync status','pending approvals','Gmail status','buyer seller summary')){
 try{$input.SetFocus();[System.Windows.Forms.SendKeys]::SendWait('^a');[System.Windows.Forms.SendKeys]::SendWait($cmd);$run.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke();Start-Sleep -Milliseconds 1300;$all=$win.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.Condition]::TrueCondition);Write-Output ('=== '+$cmd+' ===');foreach($e in $all){if($e.Current.Name -match '^(System:|Catalog sync:|Pending approvals:|Gmail authorized:|Products \d+; sellers)' -and -not $e.Current.IsOffscreen){Write-Output ('RESULT: '+$e.Current.Name)}}}catch{Write-Output ($cmd+' => ERROR '+$_.Exception.Message)}
}
