param([switch]$Send)
$ErrorActionPreference = 'Stop'
$root = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL'
$base = 'https://pakthai-ai-sourcing.pakthaitech.workers.dev'
$token = [Environment]::GetEnvironmentVariable('PAKTHAI_EMAIL_SEND_TOKEN','User')
if ([string]::IsNullOrWhiteSpace($token)) { throw 'Local owner-send token is not available. No emails sent.' }
$contacts = @(
  @{City='Lahore'; Business='Awais International'; Email='info@awaisinternational.com'; Website='https://awaisinternational.com/'},
  @{City='Lahore'; Business='ComputerZone.pk'; Email='info@computerzone.pk'; Website='https://computerzone.pk/pages/contact'},
  @{City='Gujranwala'; Business='Creative Computer GRW'; Email='info@creativecomputergrw.com'; Website='https://creativecomputergrw.com/contact'},
  @{City='Lahore'; Business='Laptop Parts Store'; Email='leo7617@gmail.com'; Website='https://laptoppartsstore.pk/contact-us'},
  @{City='Lahore'; Business='Mustafa Computers'; Email='sales@mustafacomputers.pk'; Website='https://mustafacomputers.pk/pages/wholesale-inquiry'},
  @{City='Faisalabad'; Business='Micro Computer Systems'; Email='mcsrex@hotmail.com'; Website='https://rexcity.com.pk/micro-computer-systems'},
  @{City='Islamabad'; Business='Electroline'; Email='info@electroline.pk'; Website='https://www.electroline.pk/'},
  @{City='Sialkot'; Business='Haider Computer Services'; Email='hcsbusiness@hotmail.com'; Website='https://b2bpakistan.com/11/-haider_computer_services-162825.html'},
  @{City='Rawalpindi'; Business='Intag Laptop Store'; Email='info@intaglaptops.com'; Website='https://intaglaptops.com/pages/contact-us'},
  @{City='Peshawar'; Business='IT Chasers'; Email='info@itchasers.com'; Website='https://www.itchasers.com/store/pages/Contact-Us:-%252b92-03135969299.html'},
  @{City='Rawalpindi'; Business='AR Tech'; Email='artech07laptops@gmail.com'; Website='https://www.artech.pk/contact'},
  @{City='Peshawar'; Business='Pako Computers'; Email='info@pakocomputers.com.pk'; Website='https://pakocomputers.com.pk/contact'}
)
$subject = 'PAKTHAI TECH | Computer Hardware & Dealer Supply in Pakistan'
$results = [System.Collections.Generic.List[object]]::new()
$gmail = Invoke-RestMethod -Uri ($base + '/api/gmail/status') -TimeoutSec 15
if (-not $gmail.actual_sending_ready) { throw 'Gmail sending is not authorized/ready. No emails sent.' }
$existing = Invoke-RestMethod -Uri ($base + '/api/notifications') -TimeoutSec 20
foreach ($c in $contacts) {
  $alreadySent = @($existing.notifications | Where-Object { $_.channel -eq 'email' -and $_.recipient -ieq $c.Email -and $_.status -eq 'sent' }).Count -gt 0
  if ($alreadySent) {
    Write-Output ('SKIP duplicate already sent: ' + $c.Email)
    $results.Add([pscustomobject]@{City=$c.City;Business=$c.Business;Email=$c.Email;Status='skipped_duplicate';NotificationId='';Website=$c.Website})
    continue
  }
  $message = @"
Hello $($c.Business) team,

I'm reaching out from PAKTHAI TECH, a Pakistan-focused IT hardware sourcing and supply business serving computer shops, resellers, and retailers.

You can browse our online catalogue and listed products here:
https://pakthai-tech-store.pages.dev/

If your shop purchases or resells computer components, laptops, SSDs, RAM, power supplies, gaming hardware, or related IT products, reply with the items, quantities, your city, and target dealer price. We can check availability and prepare a quotation before any commitment.

This is a one-time business introduction. If it is not relevant, reply "unsubscribe" and we will not contact you again.

Regards,
PAKTHAI TECH
AI Sourcing & Procurement
pakthaitech@gmail.com
"@
  if (-not $Send) {
    Write-Output ('READY ' + $c.City + ' | ' + $c.Business + ' | ' + $c.Email)
    $results.Add([pscustomobject]@{City=$c.City;Business=$c.Business;Email=$c.Email;Status='ready_not_sent';NotificationId='';Website=$c.Website})
    continue
  }
  try {
    $body = @{type='external';channel='email';recipient=$c.Email;subject=$subject;message=$message;related_type='buyer_outreach';status='approved'} | ConvertTo-Json -Depth 4
    $created = Invoke-RestMethod -Uri ($base + '/api/notifications') -Method POST -ContentType 'application/json' -Body $body -TimeoutSec 20
    $nid = [int]$created.notification_id
    if (-not $nid) { throw 'Notification queue did not return an ID.' }
    $headers = @{Authorization=('Bearer ' + $token)}
    $sendBody = @{notification_id=$nid} | ConvertTo-Json
    $sent = Invoke-RestMethod -Uri ($base + '/api/notifications/gmail-send') -Method POST -Headers $headers -ContentType 'application/json' -Body $sendBody -TimeoutSec 25
    if (-not $sent.sent) { throw 'Gmail API did not confirm send.' }
    Write-Output ('SENT ' + $c.City + ' | ' + $c.Business + ' | notification #' + $nid)
    $results.Add([pscustomobject]@{City=$c.City;Business=$c.Business;Email=$c.Email;Status='sent';NotificationId=$nid;Website=$c.Website})
    Start-Sleep -Milliseconds 1200
  } catch {
    Write-Output ('FAILED ' + $c.City + ' | ' + $c.Business + ' | ' + $_.Exception.Message)
    $results.Add([pscustomobject]@{City=$c.City;Business=$c.Business;Email=$c.Email;Status='failed';NotificationId='';Website=$c.Website})
    if ($_.Exception.Message -match '401|Unauthorized|owner authorization') { break }
  }
}
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$log = Join-Path $root ('OLD_REPORTS\pakistan-buyer-outreach-results-' + $stamp + '.csv')
$results | Export-Csv -Path $log -NoTypeInformation -Encoding UTF8
Write-Output ('LOG: ' + $log)
Write-Output ('SENT COUNT: ' + @($results | Where-Object Status -eq 'sent').Count)
Write-Output ('READY/UNSENT COUNT: ' + @($results | Where-Object Status -eq 'ready_not_sent').Count)
Write-Output ('FAILED COUNT: ' + @($results | Where-Object Status -eq 'failed').Count)
