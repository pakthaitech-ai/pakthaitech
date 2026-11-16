
async function api(p,o){return fetch(p,o).then(r=>r.json())}
async function refresh(){
 const [p,s,z,o]=await Promise.all([api('/api/products'),api('/api/sellers'),api('/api/zones'),api('/api/opportunities')]);
 cachedProducts=p; cachedSellers=s;
 products.textContent=p.length;sellers.textContent=s.length;zones.textContent=z.length;opps.textContent=o.length;
 renderSellers(s);renderHistory();populateOpportunitySelectors();loadCustomerRequestsApproval();loadWhatsAppStatus();updateCatalogSyncIndicator();
}
async function loadCustomerRequestsApproval(){
  const box=document.getElementById('customerRequestsApproval'); if(!box)return;
  try{
    const r=await api('/api/customer-approvals'); const a=r.requests||[];
    if(!a.length){box.innerHTML='<p>No customer requests yet.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>ID</th><th>Customer</th><th>Request</th><th>Qty</th><th>Budget</th><th>Status</th><th>Owner Action</th></tr>'+a.map(x=>{
      const st=String(x.status||'new'); const pending=!['approved','rejected'].includes(st);
      const action=pending?'<button onclick="setCustomerApproval('+Number(x.id)+',&#39;approved&#39;)">Approve</button> <button class="alt" onclick="setCustomerApproval('+Number(x.id)+',&#39;rejected&#39;)">Reject</button>':esc(st);
      return '<tr><td>#'+x.id+'</td><td>'+esc(x.customer_name||'')+'<br><small>'+esc(x.city||'')+'</small></td><td>'+esc(x.product_title||'')+'<br><small>'+esc(x.customer_note||'')+'</small></td><td>'+x.quantity+'</td><td>PKR '+fmt(x.max_budget_pkr||0)+'</td><td>'+esc(st)+'</td><td>'+action+'</td></tr>';
    }).join('')+'</table></div>';
  }catch(e){box.innerHTML='<p style="color:red">'+esc(e.message||String(e))+'</p>';}
}
async function setCustomerApproval(id,decision){
  if(!id || !['approved','rejected'].includes(decision))return;
  const r=await api('/api/customer-approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_request_id:id,decision:decision,approved_by:'Owner'})});
  if(r.error){alert(r.error);return;}
  await loadCustomerRequestsApproval(); await refresh();
}
function show(id){for(const x of ['dashboard','seller','opportunity','history','opportunitiesPage','buyercenter','voicecenter']){const el=document.getElementById(x);if(el)el.style.display=x===id?'block':'none'} if(id==='opportunitiesPage')loadOpportunitiesPage();if(id==='buyercenter')loadBuyerCenter();if(id==='voicecenter')checkVoiceSupport();}

function checkVoiceSupport(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 const el=document.getElementById('voiceSupport');
 if(el)el.textContent=SR?'Voice input available in this browser. Typed commands also work.':'Voice input is not supported here; use the typed command box.';
}
function startVoiceInput(){
 const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!SR){checkVoiceSupport();return;}
 const rec=new SR();rec.lang='en-PK';rec.interimResults=false;rec.maxAlternatives=1;
 const el=document.getElementById('voiceResult');
 el.textContent='Listening… please speak a short status command.';
 rec.onresult=e=>{const heard=e.results?.[0]?.[0]?.transcript||'';document.getElementById('voiceCommand').value=heard;runVoiceCommand(heard);};
 rec.onerror=e=>{el.textContent='Voice input error: '+String(e.error||'unknown')+'. You can type the command instead.';};
 rec.onend=()=>checkVoiceSupport();
 try{rec.start();}catch(e){el.textContent='Could not start microphone. Check browser permission or type a command.';}
}
async function runVoiceCommand(raw){
 const cmd=String(raw||'').trim().toLowerCase();
 const out=document.getElementById('voiceResult');
 if(!cmd){out.textContent='Please type or speak a command.';return;}
 out.textContent='Checking…';
 try{
  if(/system status|status system|سسٹم اسٹیٹس|حالت نظام/.test(cmd)){
   const [h,d,c]=await Promise.all([api('/api/health'),api('/api/dashboard'),api('/api/controls')]);
   out.textContent='System: '+(h.ok?'ONLINE':'CHECK REQUIRED')+'; products '+(d.summary?.products??'?')+', sellers '+(d.summary?.sellers??'?')+', buyers '+(d.summary?.buyers??'?')+', opportunities '+(d.summary?.opportunities??'?')+'. Owner approval: '+(c.controls?.owner_approval_required?'REQUIRED':'CHECK REQUIRED')+'.';
  }else if(/catalog|sync status|catalog sync|کیٹلاگ|سنک/.test(cmd)){
   const c=await api('/api/controls');const s=c.controls?.catalog_sync||{};
   out.textContent='Catalog sync: '+String(s.last_status||'NOT REPORTED').toUpperCase()+'. Cursor '+(s.cursor??'?')+', last saved '+(s.last_saved??'?')+', last run '+(s.last_run_at||'not recorded')+'. A PARTIAL status means sync is not confirmed complete.';
  }else if(/pending approvals|approvals|منظوری|pending approval/.test(cmd)){
   const d=await api('/api/dashboard');
   out.textContent='Pending approvals: '+(d.summary?.pending_approval??'not reported')+'. Pending notifications: '+(d.summary?.pending_notifications??'not reported')+'. This command only reads status; it does not approve anything.';
  }else if(/gmail|email|ای میل|جی میل/.test(cmd)){
   const g=await api('/api/gmail/status');
   out.textContent='Gmail authorized: '+String(!!g.authorized).toUpperCase()+'. Sending ready: '+String(!!g.actual_sending_ready).toUpperCase()+'. Real inbound/reply test: NOT VERIFIED.';
  }else if(/whatsapp|واٹس ایپ/.test(cmd)){
   out.textContent='WhatsApp end-to-end status: NOT VERIFIED. Do not treat the outgoing helper as proof that inbound and replies work.';
  }else if(/buyer|seller|opportunity|buyers|sellers|خریدار|سیلر/.test(cmd)){
   const d=await api('/api/dashboard');const s=d.summary||{};
   out.textContent='Products '+(s.products??'?')+'; sellers '+(s.sellers??'?')+'; buyers '+(s.buyers??'?')+'; active requirements '+(s.active_requirements??'?')+'; matches '+(s.buyer_matches??'?')+'; opportunities '+(s.opportunities??'?')+'.';
  }else{
   out.textContent='Command not recognized. Try: system status, catalog sync status, pending approvals, Gmail status, WhatsApp status, or buyer/seller summary.';
  }
 }catch(e){out.textContent='Could not read status: '+String(e.message||e)+'. Please try again.';}
}
async function addSeller(){
 const b={name:sname.value,contact:scontact.value,country:scountry.value,city:scity.value,platform:splatform.value,seller_type:stype.value};
 if(!b.name)return alert('Seller name is required');
 await api('/api/sellers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 sname.value='';scontact.value='';refresh();
}
function renderSellers(a){sellerList.innerHTML='<table><tr><th>Name</th><th>Location</th><th>Platform</th><th>Type</th><th>Status</th></tr>'+a.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+esc((x.city||'')+', '+(x.country||''))+'</td><td>'+esc(x.platform||'')+'</td><td>'+esc(x.seller_type||'')+'</td><td>'+esc(x.status||'')+'</td></tr>').join('')+'</table>'}
async function renderHistory(){const a=await api('/api/seller-history');historyList.innerHTML='<table><tr><th>Seller</th><th>Product</th><th>Qty</th><th>Asking</th><th>Agreed</th><th>Outcome</th></tr>'+a.map(x=>'<tr><td>'+esc(x.seller_name)+'</td><td>'+esc(x.product_title||'')+'</td><td>'+x.quantity+'</td><td>'+x.asking_price+'</td><td>'+x.agreed_price+'</td><td>'+esc(x.outcome||'')+'</td></tr>').join('')+'</table>'}
async function loadOpportunitiesPage(){
  const box=document.getElementById('opportunitiesList');
  if(!box)return;
  box.textContent='Loading...';
  try{
    const a=await api('/api/opportunities');
    if(!a.length){box.innerHTML='<p>No sourcing opportunities have been created yet.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>ID</th><th>Product</th><th>Seller</th><th>Qty</th><th>Asking / Unit</th><th>Landed Cost / Total</th><th>Retail / Unit</th><th>Expected Profit / Total</th><th>Margin</th><th>Status</th><th>Approval</th><th>Owner Action</th></tr>'+a.map(x=>{const ap=String(x.approval_status||'pending').toLowerCase(); const action=ap==='pending'?'<button onclick="setOpportunityApproval('+Number(x.id)+',&#39;approved&#39;)">Approve</button> <button class="alt" onclick="setOpportunityApproval('+Number(x.id)+',&#39;rejected&#39;)">Reject</button>':esc(ap); return '<tr><td>#'+x.id+'</td><td>'+esc(x.product_title||'')+'</td><td>'+esc(x.seller_name||'')+'</td><td>'+x.quantity+'</td><td>PKR '+fmt(x.asking_price)+'</td><td>PKR '+fmt(x.landed_cost)+'</td><td>PKR '+fmt(x.retail_price_pkr)+'</td><td>PKR '+fmt(x.expected_profit)+'</td><td>'+fmt(x.expected_margin_pct)+'%</td><td>'+esc(x.status||'')+'</td><td>'+esc(ap)+'</td><td>'+action+'</td></tr>';}).join('')+'</table></div>';
  }catch(e){box.innerHTML='<p style="color:red">'+esc(e.message||String(e))+'</p>';}
}
let lastAutomaticCalculation=null;
let cachedProducts=[],cachedSellers=[];
function populateOpportunitySelectors(){
 productSelect.innerHTML=cachedProducts.map(x=>'<option value="'+x.id+'" data-price="'+(x.price_pkr||0)+'">'+esc(x.title)+' â€” PKR '+fmt(x.price_pkr)+'</option>').join('')||'<option value="">No products</option>';
 sellerSelect.innerHTML=cachedSellers.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' â€” '+esc((x.city||'')+', '+(x.country||''))+'</option>').join('')||'<option value="">No sellers</option>';
 updateRetailFromProduct();
}
function updateRetailFromProduct(){const o=productSelect.options[productSelect.selectedIndex]; retail.value=o?Number(o.dataset.price||0):0;}
productSelect.addEventListener('change',updateRetailFromProduct);
async function setOpportunityApproval(id,decision){
  if(!id || !['approved','rejected'].includes(decision)) return;
  const label=decision==='approved'?'approve':'reject';
  if(!confirm('Are you sure you want to '+label+' Opportunity #'+id+'?')) return;
  const r=await api('/api/approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({opportunity_id:id,decision:decision,approved_by:'Owner'})});
  if(r.error){alert(r.error);return;}
  alert('Opportunity #'+id+' is now '+decision+'.');
  await refresh();
  await loadOpportunitiesPage();
}

async function calculateAuto(){
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById("costTravel").checked,pickup:document.getElementById("costPickup").checked,packing:document.getElementById("costPacking").checked,freight:document.getElementById("costFreight").checked,duties:document.getElementById("costDuties").checked,payment:document.getElementById("costPayment").checked,pakistan_transport:document.getElementById("costPakistan").checked,contingency:document.getElementById("costContingency").checked}};
 if(!b.product_id||!b.seller_id)return alert('Product aur Seller select karein.');
 const x=await api('/api/opportunities/calculate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(x.error)return alert(x.error);
 lastAutomaticCalculation=x; margin.value=x.target_margin_pct; retail.value=x.retail_price_pkr;
 const c=x.cost_breakdown||{};
 calcResult.innerHTML='<div class="card"><b>'+esc(x.classification)+'</b><p>Product: '+esc(x.product_title)+'</p><p>Seller: '+esc(x.seller_name)+'</p><p>Auto costs: Travel '+fmt(c.travel)+' | Pickup '+fmt(c.pickup)+' | Packing '+fmt(c.packing)+' | Freight '+fmt(c.freight)+' | Duties '+fmt(c.duties)+' | Payment '+fmt(c.payment)+' | Pakistan transport '+fmt(c.pakistan_transport)+' | Contingency '+fmt(c.contingency)+'</p><p>Landed cost / total: PKR '+fmt(x.landed_total)+'</p><p>Landed cost / unit: PKR '+fmt(x.landed_per_unit)+'</p><p>Max buy/unit for target margin: PKR '+fmt(x.max_buy_per_unit)+'</p><p>Expected profit: PKR '+fmt(x.expected_profit)+'</p><p>Expected margin: '+fmt(x.expected_margin_pct)+'%</p><p>Approval: Pending Owner Approval</p>'+(x.warnings&&x.warnings.length?'<p><b>Settings note:</b> '+esc(x.warnings.join(', '))+'</p>':'')+'</div>';
}
async function createOpportunity(){
 if(!lastAutomaticCalculation) await calculateAuto();
 if(!lastAutomaticCalculation)return;
 const b={product_id:productSelect.value,seller_id:sellerSelect.value,quantity:q.value,asking_price:ask.value,distance_km:distance.value,cost_enabled:{travel:document.getElementById("costTravel").checked,pickup:document.getElementById("costPickup").checked,packing:document.getElementById("costPacking").checked,freight:document.getElementById("costFreight").checked,duties:document.getElementById("costDuties").checked,payment:document.getElementById("costPayment").checked,pakistan_transport:document.getElementById("costPakistan").checked,contingency:document.getElementById("costContingency").checked}};
 const r=await api('/api/opportunities',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});
 if(r.error)return alert(r.error);
 alert('Opportunity #'+r.id+' created. Owner approval is pending.'); refresh();
}
let catalogSyncActive=false;
function paintCatalogSync(status,label,active){
 const dot=document.getElementById('catalogSyncDot'),txt=document.getElementById('catalogSyncLabel');
 if(!dot||!txt)return;
 dot.className=active?'sync-spin':'';
 dot.style.background=active?'transparent':(status==='complete'?'#22c55e':(['partial','failed','empty_source'].includes(status)?'#f59e0b':status==='running'?'#3b82f6':'#9ca3af'));
 txt.textContent=label;
}
async function updateCatalogSyncIndicator(){
 try{
  const r=await api('/api/controls');const s=r.controls?.catalog_sync||{};const st=String(s.last_status||'not_run').toLowerCase();
  if(catalogSyncActive)return;
  const label=st==='complete'?'Catalog sync: COMPLETE':st==='partial'?'Catalog sync: PARTIAL — some products failed':st==='failed'?'Catalog sync: FAILED':st==='empty_source'?'Catalog sync: source empty':st==='running'?'Catalog sync: RUNNING / possibly interrupted':'Catalog sync: NOT RUN YET';
  paintCatalogSync(st,label,false);
 }catch(e){paintCatalogSync('unknown','Catalog sync: status unavailable',false);}
}
async function loadWhatsAppStatus(){
 const summary=document.getElementById('whatsappDeliverySummary'),list=document.getElementById('whatsappDeliveryList');
 if(!summary||!list)return;
 try{
  const r=await api('/api/notifications/whatsapp-status');
  const messages=r.messages||[];
  const setup=document.getElementById('whatsappWebhookSetup');
  if(setup){setup.textContent=r.webhook_configured?'Webhook configuration: READY — Meta status callbacks can be received.':'Webhook configuration: INCOMPLETE — '+(!r.webhook_verify_configured?'WHATSAPP_WEBHOOK_VERIFY_TOKEN missing. ':'')+(!r.app_secret_configured?'WHATSAPP_APP_SECRET missing. ':'')+' Callback URL: '+(r.callback_url||'/webhooks/whatsapp');setup.style.color=r.webhook_configured?'#166534':'#9a3412';}
  const names={accepted:'API accepted — delivery unconfirmed',sent:'Sent by WhatsApp server',delivered:'DELIVERED to recipient device',read:'READ by recipient',failed:'FAILED — see Meta error details'};
  if(!messages.length){summary.textContent='No WhatsApp status callbacks recorded yet. Meta API acceptance alone does not prove delivery.';list.innerHTML='';return;}
  const latest=messages[0];
  summary.textContent='Latest status: '+(names[latest.status]||String(latest.status).toUpperCase())+(latest.status_timestamp?' · '+new Date(latest.status_timestamp).toLocaleString():'')+(latest.error_code?' · Error '+latest.error_code:'')+(latest.error_message?' · '+latest.error_message:'')+(latest.status==='accepted'?' · Historical delivery reason unavailable: webhook was not configured when this message was sent.':'');
  list.innerHTML='<div style="overflow:auto"><table><tr><th>Status</th><th>Recipient</th><th>Message ID</th><th>Details</th></tr>'+messages.slice(0,10).map(m=>'<tr><td><b>'+esc(names[m.status]||m.status)+'</b></td><td>'+esc(m.recipient||'')+'</td><td style="max-width:220px;word-break:break-all">'+esc(m.message_id||'')+'</td><td>'+esc([m.error_title,m.error_code,m.error_message].filter(Boolean).join(' — ')||(m.status==='accepted'?'Historical failure reason not captured; awaiting webhook for future messages.':m.status_timestamp||'Waiting for webhook status'))+'</td></tr>').join('')+'</table></div>';
 }catch(e){summary.textContent='Could not load delivery status: '+String(e.message||e);}
}
async function sync(){
 if(catalogSyncActive)return;
 catalogSyncActive=true;
 const btn=document.getElementById('catalogSyncBtn');
 if(btn){btn.disabled=true;btn.textContent='Syncing…';}
 paintCatalogSync('running','Catalog sync: WORKING…',true);
 let start=0,done=false,total=0,failed=0,failedHandles=[],sourceWarnings=[];
 try{
  while(!done){
   paintCatalogSync('running','Syncing catalog… saved '+total+' product(s)',true);
   const r=await api('/api/sync/source',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({start,batch_size:10})});
   if(!r||r.error)throw new Error(r?.error||'No sync response');
   total+=Number(r.saved)||0;failed+=Number(r.failed)||0;
   if(Array.isArray(r.failed_handles))failedHandles.push(...r.failed_handles.map(x=>x.handle+": "+(x.error||"unknown error")));
   if(r.source_discovery_warning&&!sourceWarnings.includes(r.source_discovery_warning))sourceWarnings.push(r.source_discovery_warning);
   done=!!r.complete;start=Number(r.next_start)||start;
   if(!r.processed)break;
  }
  if(failed||sourceWarnings.length){paintCatalogSync('partial','Catalog sync: PARTIAL',false);alert('Catalog sync finished PARTIAL. Saved/updated '+total+' products; '+failed+' product(s) failed after 6 attempts.'+(sourceWarnings.length?' Source warning: '+sourceWarnings.join(' | '):'')+(failedHandles.length?' First product failures: '+failedHandles.slice(0,5).join(', '):''));}
  else{paintCatalogSync('complete','Catalog sync: COMPLETE',false);alert('Catalog sync complete. Saved/updated '+total+' products.');}
  await refresh();
 }catch(e){
  paintCatalogSync('failed','Catalog sync: FAILED',false);
  alert('Catalog sync stopped: '+String(e?.message||e)+'. Check login and sync status before retrying.');
  await refresh();
 }finally{
  catalogSyncActive=false;
  if(btn){btn.disabled=false;btn.textContent='Sync Source Catalog';}
  await updateCatalogSyncIndicator();
 }
}
function setControlButton(b,on){
if(!b)return;
b.textContent=on?"ON":"OFF";
b.style.background=on?"#198754":"#777";
b.style.color="white";
b.style.fontWeight="700";
}
async function loadControlPanel(){
try{
const r=await api("/api/controls");
const c=r.controls||{};
const vals={master_ai_mode:String(c.master_ai_mode||"on").toLowerCase()==="on",auto_search_enabled:!!c.auto_search_enabled,seller_matching_enabled:!!c.seller_matching_enabled,negotiation_mode:String(c.negotiation_mode||"on").toLowerCase()==="on",auto_followup_enabled:!!c.auto_followup_enabled,opportunity_creation_enabled:!!c.opportunity_creation_enabled,travel_enabled:!!c.cost_controls?.travel,pickup_enabled:!!c.cost_controls?.pickup,packing_enabled:!!c.cost_controls?.packing,freight_enabled:!!c.cost_controls?.freight,duty_enabled:!!c.cost_controls?.duties,payment_fee_enabled:!!c.cost_controls?.payment,pakistan_transport_enabled:!!c.cost_controls?.pakistan_transport,contingency_enabled:!!c.cost_controls?.contingency};
document.querySelectorAll("button[data-key]").forEach(b=>{if(Object.prototype.hasOwnProperty.call(vals,b.dataset.key))setControlButton(b,vals[b.dataset.key]);});
}catch(e){console.error(e)}}
async function toggleControl(b){
if(!b||!b.dataset.key)return;
const wasOn=b.textContent==="ON";
const key=b.dataset.key;
const value=b.dataset.type==="mode"?(wasOn?"off":"on"):(!wasOn);
try{b.disabled=true;const r=await api("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({[key]:value})});if(!r.ok)throw new Error(r.error||"Update failed");await loadControlPanel();}catch(e){alert(e.message||"Could not update setting");await loadControlPanel();}finally{b.disabled=false}}
async function loadCountryControls(){
 try{
  const r=await api("/api/settings");
  const settings=Array.isArray(r)?Object.fromEntries(r.map(x=>[x.key,x.value])):(r.settings||r);
  document.querySelectorAll("button[data-key^=country_]").forEach(b=>{
   const key=b.dataset.key;
   setControlButton(b,["1","true","yes","on","enabled"].includes(String(settings[key]??"false").toLowerCase()));
  });
 }catch(e){console.error(e)}
}
async function toggleCountry(b){
 if(!b||!b.dataset.key)return;
 const wasOn=b.textContent==="ON",key=b.dataset.key;
 try{
  b.disabled=true;
  const r=await api("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({[key]:!wasOn})});
  if(!r.ok)throw new Error(r.error||"Country setting update failed");
  await loadCountryControls();
 }catch(e){alert(e.message||"Could not update country setting");await loadCountryControls();}
 finally{b.disabled=false}
}
function fmt(n){return Number(n||0).toLocaleString(undefined,{maximumFractionDigits:2})}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
loadControlPanel();
loadCountryControls();
refresh();
