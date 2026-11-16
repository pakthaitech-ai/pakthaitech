$ErrorActionPreference = "Stop"
$path = "D:\Horse 2\pak thai\PakThai-Tech-AI-Sourcing-FINAL\src\worker.js"
if (!(Test-Path -LiteralPath $path)) { throw "worker.js not found: $path" }

$content = Get-Content -LiteralPath $path -Raw
$backup = "$path.before_opportunities_page.bak"
Copy-Item -LiteralPath $path -Destination $backup -Force

$navOld = '<button onclick="show(''opportunity'')">Small-Lot Calculator</button>'
$navNew = $navOld + [Environment]::NewLine + '<button onclick="show(''opportunities'');loadOpportunities()">Opportunities</button>'
if ($content.Contains($navOld) -and !$content.Contains("show('opportunities')")) {
  $content = $content.Replace($navOld, $navNew)
} elseif (!$content.Contains("show('opportunities')")) {
  throw "Could not find the exact Calculator navigation button. No changes saved."
}

$sectionOld = '<section id="history" class="panel" style="display:none">'
$sectionNew = @'
<section id="opportunities" class="panel" style="display:none">
<h2>Opportunities</h2>
<p>Review sourcing opportunities. Purchases are not made automatically; owner approval is required.</p>
<div id="opportunityList">Loading opportunities...</div>
</section>
<section id="history" class="panel" style="display:none">
'@
if ($content.Contains($sectionOld) -and !$content.Contains('id="opportunities"')) {
  $content = $content.Replace($sectionOld, $sectionNew)
} elseif (!$content.Contains('id="opportunities"')) {
  throw "Could not find the History section insertion point. No changes saved."
}

$showOld = "function show(id){for(const x of ['dashboard','seller','opportunity','history'])document.getElementById(x).style.display=x===id?'block':'none'}"
$showNew = "function show(id){for(const x of ['dashboard','seller','opportunity','opportunities','history'])document.getElementById(x).style.display=x===id?'block':'none'}"
if ($content.Contains($showOld)) {
  $content = $content.Replace($showOld, $showNew)
} elseif (!$content.Contains("'opportunities','history'")) {
  throw "Could not find the exact show() function. No changes saved."
}

$anchor = "async function addSeller(){"
$functions = @'
async function loadOpportunities(){
 const box=document.getElementById('opportunityList');
 if(!box)return;
 box.textContent='Loading opportunities...';
 try{
  const r=await api('/api/approvals');
  if(r.error)throw new Error(r.error);
  const rows=Array.isArray(r.opportunities)?r.opportunities:[];
  if(!rows.length){box.textContent='No opportunities found yet.';return;}
  box.innerHTML='<div style="overflow-x:auto"><table><thead><tr><th>ID</th><th>Product</th><th>Seller</th><th>Qty</th><th>Asking/unit</th><th>Landed total</th><th>Expected profit</th><th>Margin</th><th>Approval</th><th>Action</th></tr></thead><tbody>'+
   rows.map(x=>{
    const status=String(x.approval_status||'pending').toLowerCase();
    const actions=status==='pending'
      ? '<button onclick="decideOpportunity('+Number(x.id)+',\'approved\')">Approve</button> <button class="alt" onclick="decideOpportunity('+Number(x.id)+',\'rejected\')">Reject</button>'
      : esc(status);
    return '<tr><td>'+Number(x.id)+'</td><td>'+esc(x.product_title||'—')+'</td><td>'+esc(x.seller_name||'—')+'</td><td>'+fmt(x.quantity)+'</td><td>PKR '+fmt(x.asking_price)+'</td><td>PKR '+fmt(x.landed_cost)+'</td><td>PKR '+fmt(x.expected_profit)+'</td><td>'+fmt(x.expected_margin_pct)+'%</td><td>'+esc(status)+'</td><td>'+actions+'</td></tr>';
   }).join('')+'</tbody></table></div>';
 }catch(e){box.textContent='Could not load opportunities: '+(e.message||String(e));}
}
async function decideOpportunity(id,decision){
 const label=decision==='approved'?'approve':'reject';
 if(!confirm('Are you sure you want to '+label+' Opportunity #'+id+'?'))return;
 try{
  const r=await api('/api/approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({opportunity_id:id,decision})});
  if(r.error)throw new Error(r.error);
  alert('Opportunity #'+id+' '+decision+'.');
  await loadOpportunities();
  refresh();
 }catch(e){alert('Approval action failed: '+(e.message||String(e)));}
}
async function addSeller(){
'@
if ($content.Contains($anchor) -and !$content.Contains("async function loadOpportunities()")) {
  $content = $content.Replace($anchor, $functions)
} elseif (!$content.Contains("async function loadOpportunities()")) {
  throw "Could not find addSeller() insertion point. No changes saved."
}

Set-Content -LiteralPath $path -Value $content -Encoding UTF8
Write-Host "SUCCESS: Opportunities page added." -ForegroundColor Green
Write-Host "Backup saved to: $backup"
Write-Host "Next: inspect the diff/verification before deploying."
