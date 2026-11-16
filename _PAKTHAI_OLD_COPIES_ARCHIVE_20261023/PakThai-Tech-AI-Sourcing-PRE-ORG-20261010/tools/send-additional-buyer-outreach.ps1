# Additional Pakistan buyer outreach â€” sends only with -Send
param([switch]$Send)
$ErrorActionPreference='Stop'
$root='D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL'
$base='https://pakthai-ai-sourcing.pakthaitech.workers.dev'
$token=[Environment]::GetEnvironmentVariable('PAKTHAI_EMAIL_SEND_TOKEN','User')
if([string]::IsNullOrWhiteSpace($token)){throw 'Owner token missing; no email sent.'}
$contacts=@(
 @{City='Pakistan-wide';Business='TechGlobe';Email='info@techglobe.pk';Website='https://www.techglobe.pk/wholesale-corporate'},
 @{City='Karachi';Business='JAYCO Tech';Email='sales@jaycotech.pk';Website='https://jaycotech.pk/contact'},
 @{City='Lahore';Business='Pakistan Hardware';Email='pakistanhw@gmail.com';Website='https://pakistanhardware.pk/Contact.html'},
 @{City='Gujranwala';Business='AS Hardware PK';Email='support@ashardwarepk.com';Website='https://ashardwarepk.com/contact'}
)
$subject='PAKTHAI TECH | Computer Hardware & Dealer Supply in Pakistan'
$existing=Invoke-RestMethod -Uri ($base+'/api/notifications') -TimeoutSec 20
$results=[System.Collections.Generic.List[object]]::new()
foreach($c in $contacts){
 if(@($existing.notifications|Where-Object{$_.channel -eq 'email' -and $_.recipient -ieq $c.Email -and $_.status -eq 'sent'}).Count -gt 0){
  Write-Output ('SKIP already sent: '+$c.Email)
  $results.Add([pscustomobject]@{City=$c.City;Business=$c.Business;Email=$c.Email;Status='skipped_duplicate';Website=$c.Website})
  continue
 }
 $message=@"
Hello $($c.Business) team,

I'm reaching out from PAKTHAI TECH, a Pakistan-focused IT hardware sourcing and supply business serving computer shops, resellers, and retailers.

Browse our online catalogue and listed products:
https://pakthai-tech-store.pages.dev/

If your business buys or resells computer components, laptops, SSDs, RAM, power supplies, gaming hardware, or related IT products, reply with the items, quantities, your city, and target dealer price. We can check availability and prepare a quotation before any commitment.

This is a one-time business introduction. If it is not relevant, reply "unsubscribe" and we will not contact you again.

Regards,
PAKTHAI TECH
AI Sourcing & Procurement
pakthaitech@gmail.com
"@
 if(-not $Send){Write-Output ('READY '+$c.Email);continue}
 try{
  $body=@{type='external';channel='email';recipient=$c.Email;subject=$subject;message=$message;related_type='buyer_outreach';status='approved'}|ConvertTo-Json -Depth 4
  $created=Invoke-RestMethod -Uri ($base+'/api/notifications') -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 20
  $headers=@{Authorization=('Bearer '+$token)}
  $sendResponse=Invoke-RestMethod -Uri ($base+'/api/notifications/gmail-send') -Method POST -Headers $headers -ContentType 'application/json' -Body (@{notification_id=[int]$created.notification_id}|ConvertTo-Json) -TimeoutSec 25
  if(-not $sendResponse.sent){throw 'Gmail API did not confirm send'}
  Write-Output ('SENT '+$c.City+' | '+$c.Business+' | notification #'+$created.notification_id)
  $results.Add([pscustomobject]@{City=$c.City;Business=$c.Business;Email=$c.Email;Status='sent';NotificationId=$created.notification_id;Website=$c.Website})
  Start-Sleep -Milliseconds 1200
 }catch{
  Write-Output ('FAILED '+$c.Business+' | '+$_.Exception.Message)
  $results.Add([pscustomobject]@{City=$c.City;Business=$c.Business;Email=$c.Email;Status='failed';Website=$c.Website})
 }
}
$stamp=Get-Date -Format 'yyyyMMdd-HHmmss'
$log=Join-Path $root ('OLD_REPORTS\pakistan-buyer-outreach-additional-'+$stamp+'.csv')
$results|Export-Csv -Path $log -NoTypeInformation -Encoding UTF8
Write-Output ('LOG: '+$log)
Write-Output ('SENT COUNT: '+@($results|Where-Object Status -eq 'sent').Count)

