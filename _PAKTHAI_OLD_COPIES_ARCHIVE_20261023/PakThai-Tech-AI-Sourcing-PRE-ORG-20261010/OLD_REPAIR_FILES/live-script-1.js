
async function api(p,o){return fetch(p,o).then(r=>r.json())}
async function refresh(){
 const [p,s,z,o]=await Promise.all([api('/api/products'),api('/api/sellers'),api('/api/zones'),api('/api/opportunities')]);
 cachedProducts=p; cachedSellers=s;
 products.textContent=p.length;sellers.textContent=s.length;zones.textContent=z.length;opps.textContent=o.length;
 renderSellers(s);renderHistory();populateOpportunitySelectors();
}
function show(id){for(const x of ['dashboard','seller','opportunity','opportunities','history'])document.getElementById(x).style.display=x===id?'block':'none'}
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
      ? '<button onclick="decideOpportunity('+Number(x.id)+','approved')">Approve</button> <button class="alt" onclick="decideOpportunity('+Number(x.id)+','rejected')">Reject</button>'
      : esc(status);
    return '<tr><td>'+Number(x.id)+'</td><td>'+esc(x.product_title||'â€”')+'</td><td>'+esc(x.seller_name||'â€”')+'</td><td>'+fmt(x.quantity)+'</td><td>PKR '+fmt(x.asking_price)+'</td><td>PKR '+fmt(x.landed_cost)+'</td><td>PKR '+fmt(x.expected_profit)+'</td><td>'+fmt(x.expected_margin_pct)+'%</td><td>'+esc(status)+'</td><td>'+actions+'</td></tr>';
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
 const b={name:sname.value,contact:scontact.value,country:scountry.value,city:scity.value,platform:splatform.value,seller_type:stype.value};
 if(!b.name)return alert('Seller name is required');
 await api('/api/sellers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 sname.value='';scontact.value='';refresh();
}
function renderSellers(a){sellerList.innerHTML='<table><tr><th>Name</th><th>Location</th><th>Platform</th><th>Type</th><th>Status</th></tr>'+a.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc((x.city||'')+', '+(x.country||''))+'</td><td>'+esc(x.platform||'')+'</td><td>'+esc(x.seller_type||'')+'</td><td>'+esc(x.status||'')+'</td></tr>').join('')+'</table>'}
async function renderHistory(){const a=await api('/api/seller-history');historyList.innerHTML='<table><tr><th>Seller</th><th>Product</th><th>Qty</th><th>Asking</th><th>Agreed</th><th>Outcome</th></tr>'+a.map(x=>'<tr><td>'+esc(x.seller_name)+'</td><td>'+esc(x.product_title||'')+'</td><td>'+x.quantity+'</td><td>'+x.asking_price+'</td><td>'+x.agreed_price+'</td><td>'+esc(x.outcome||'')+'</td></tr>').join('')+'</table>'}
let lastAutomaticCalculation=null;
let cachedProducts=[],cachedSellers=[];
function populateOpportunitySelectors(){
 productSelect.innerHTML=cachedProducts.map(x=>'<option value="'+x.id+'" data-price="'+(x.price_pkr||0)+'">'+esc(x.title)+' Ã¢â‚¬â€ PKR '+fmt(x.price_pkr)+'</option>').join('')||'<option value="">No products</option>';
 sellerSelect.innerHTML=cachedSellers.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' Ã¢â‚¬â€ '+esc((x.city||'')+', '+(x.country||''))+'</option>').join('')||'<option value="">No sellers</option>';
 updateRetailFromProduct();
}
function updateRetailFromProduct(){const o=productSelect.options[productSelect.selectedIndex]; retail.value=o?Number(o.dataset.price||0):0;}
productSelect.addEventListener('change',updateRetailFromProduct);
async function calculateAuto(){
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById(costTravel).checked,pickup:document.getElementById(costPickup).checked,packing:document.getElementById(costPacking).checked,freight:document.getElementById(costFreight).checked,duties:document.getElementById(costDuties).checked,payment:document.getElementById(costPayment).checked,pakistan_transport:document.getElementById(costPakistan).checked,contingency:document.getElementById(costContingency).checked}};
 if(!b.product_id||!b.seller_id)return alert('Product aur Seller select karein.');
 const x=await api('/api/opportunities/calculate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(x.error)return alert(x.error);
 lastAutomaticCalculation=x; margin.value=x.target_margin_pct; retail.value=x.retail_price_pkr;
 const c=x.cost_breakdown||{};
 calcResult.innerHTML='<div class="card"><b>'+esc(x.classification)+'</b><p>Product: '+esc(x.product_title)+'</p><p>Seller: '+esc(x.seller_name)+'</p><p>Auto costs: Travel '+fmt(c.travel)+' | Pickup '+fmt(c.pickup)+' | Packing '+fmt(c.packing)+' | Freight '+fmt(c.freight)+' | Duties '+fmt(c.duties)+' | Payment '+fmt(c.payment)+' | Pakistan transport '+fmt(c.pakistan_transport)+' | Contingency '+fmt(c.contingency)+'</p><p>Landed total: PKR '+fmt(x.landed_total)+'</p><p>Landed/unit: PKR '+fmt(x.landed_per_unit)+'</p><p>Max buy/unit for target margin: PKR '+fmt(x.max_buy_per_unit)+'</p><p>Expected profit: PKR '+fmt(x.expected_profit)+'</p><p>Expected margin: '+fmt(x.expected_margin_pct)+'%</p><p>Approval: Pending Owner Approval</p>'+(x.warnings&&x.warnings.length?'<p><b>Settings note:</b> '+esc(x.warnings.join(', '))+'</p>':'')+'</div>';
}
async function createOpportunity(){
 if(!lastAutomaticCalculation) await calculateAuto();
 if(!lastAutomaticCalculation)return;
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById(costTravel).checked,pickup:document.getElementById(costPickup).checked,packing:document.getElementById(costPacking).checked,freight:document.getElementById(costFreight).checked,duties:document.getElementById(costDuties).checked,payment:document.getElementById(costPayment).checked,pakistan_transport:document.getElementById(costPakistan).checked,contingency:document.getElementById(costContingency).checked}};
 const r=await api('/api/opportunities',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(r.error)return alert(r.error);
 alert('Opportunity #'+r.id+' created. Owner approval is pending.'); refresh();
}
async function sync(){
 let start=0,done=false,total=0;
 while(!done){const r=await api('/api/sync/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({start})});total+=r.saved;done=r.complete;start=r.next_start;if(!r.processed)break}
 alert('Sync complete. Saved/updated '+total+' products in this run.');
 refresh();
}
function fmt(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
refresh();

