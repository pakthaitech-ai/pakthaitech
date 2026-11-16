
async function api(p,o){return fetch(p,o).then(r=>r.json())}
async function refresh(){
 const [p,s,z,o]=await Promise.all([api('/api/products'),api('/api/sellers'),api('/api/zones'),api('/api/opportunities')]);
 cachedProducts=p; cachedSellers=s;
 products.textContent=p.length;sellers.textContent=s.length;zones.textContent=z.length;opps.textContent=o.length;
 renderSellers(s);renderHistory();populateOpportunitySelectors();loadCustomerRequestsApproval();loadOutboundQueue();loadWhatsAppStatus();updateCatalogSyncIndicator();
}
async function loadCustomerRequestsApproval(){
  const box=document.getElementById('customerRequestsApproval'); if(!box)return;
  try{
    const r=await api('/api/customer-approvals'); const a=r.requests||[];
    if(!a.length){box.innerHTML='<p>No customer requests yet.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>ID</th><th>Customer</th><th>Contact</th><th>Country</th><th>Request</th><th>Qty</th><th>Budget</th><th>Assigned Partner</th><th>Status</th><th>Owner Action</th></tr>'+a.map(x=>{
      const st=String(x.status||'new'); const pending=!['approved','rejected'].includes(st);
      const action=pending?'<button onclick="setCustomerApproval('+Number(x.id)+',&#39;approved&#39;)">Approve</button> <button class="alt" onclick="setCustomerApproval('+Number(x.id)+',&#39;rejected&#39;)">Reject</button>':esc(st);
      const contact=[x.phone,x.whatsapp,x.email].filter(Boolean).map(esc).join('<br>')||'Not provided';
      const partner=x.assigned_partner_name?esc(x.assigned_partner_name):'Owner review — no active country partner';
      const budget=x.max_budget_pkr?('PKR '+fmt(x.max_budget_pkr)):'Not provided';
      return '<tr><td>#'+Number(x.id)+'</td><td>'+esc(x.customer_name||'')+'<br><small>'+esc(x.city||'')+'</small></td><td>'+contact+'</td><td>'+esc(x.country_code||'Not specified')+'</td><td>'+esc(x.product_title||'')+'<br><small>'+esc(x.request_type||'order_request')+' · '+esc(x.customer_note||'')+'</small></td><td>'+Number(x.quantity||1)+'</td><td>'+budget+'</td><td>'+partner+'</td><td>'+esc(st)+'</td><td>'+action+'</td></tr>';
    }).join('')+'</table></div>';
  }catch(e){box.innerHTML='<p style="color:red">'+esc(e.message||String(e))+'</p>';}
}
async function setCustomerApproval(id,decision){
  if(!id || !['approved','rejected'].includes(decision))return;
  const r=await api('/api/customer-approvals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({customer_request_id:id,decision:decision,approved_by:'Owner'})});
  if(r.error){alert(r.error);return;}
  await loadCustomerRequestsApproval(); await refresh();
}
function show(id){for(const x of ['dashboard','seller','opportunity','history','opportunitiesPage','buyercenter','voicecenter','partnersPage']){const el=document.getElementById(x);if(el)el.style.display=x===id?'block':'none'} if(id==='opportunitiesPage')loadOpportunitiesPage();if(id==='buyercenter')loadBuyerCenter();if(id==='voicecenter')checkVoiceSupport();}

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
 el.textContent='Listeningâ€¦ please speak a short status command.';
 rec.onresult=e=>{const heard=e.results?.[0]?.[0]?.transcript||'';document.getElementById('voiceCommand').value=heard;runVoiceCommand(heard);};
 rec.onerror=e=>{el.textContent='Voice input error: '+String(e.error||'unknown')+'. You can type the command instead.';};
 rec.onend=()=>checkVoiceSupport();
 try{rec.start();}catch(e){el.textContent='Could not start microphone. Check browser permission or type a command.';}
}
async function runVoiceCommand(raw){
 const cmd=String(raw||'').trim().toLowerCase();
 const out=document.getElementById('voiceResult');
 if(!cmd){out.textContent='Please type or speak a command.';return;}
 out.textContent='Checkingâ€¦';
 try{
  if(/system status|status system|Ø³Ø³Ù¹Ù… Ø§Ø³Ù¹ÛŒÙ¹Ø³|Ø­Ø§Ù„Øª Ù†Ø¸Ø§Ù…/.test(cmd)){
   const [h,d,c]=await Promise.all([api('/api/health'),api('/api/dashboard'),api('/api/controls')]);
   out.textContent='System: '+(h.ok?'ONLINE':'CHECK REQUIRED')+'; products '+(d.summary?.products??'?')+', sellers '+(d.summary?.sellers??'?')+', buyers '+(d.summary?.buyers??'?')+', opportunities '+(d.summary?.opportunities??'?')+'. Owner approval: '+(c.controls?.owner_approval_required?'REQUIRED':'CHECK REQUIRED')+'.';
  }else if(/catalog|sync status|catalog sync|Ú©ÛŒÙ¹Ù„Ø§Ú¯|Ø³Ù†Ú©/.test(cmd)){
   const c=await api('/api/controls');const s=c.controls?.catalog_sync||{};
   out.textContent='Catalog sync: '+String(s.last_status||'NOT REPORTED').toUpperCase()+'. Cursor '+(s.cursor??'?')+', last saved '+(s.last_saved??'?')+', last run '+(s.last_run_at||'not recorded')+'. A PARTIAL status means sync is not confirmed complete.';
  }else if(/pending approvals|approvals|Ù…Ù†Ø¸ÙˆØ±ÛŒ|pending approval/.test(cmd)){
   const d=await api('/api/dashboard');
   out.textContent='Pending approvals: '+(d.summary?.pending_approval??'not reported')+'. Pending notifications: '+(d.summary?.pending_notifications??'not reported')+'. This command only reads status; it does not approve anything.';
  }else if(/gmail|email|Ø§ÛŒ Ù…ÛŒÙ„|Ø¬ÛŒ Ù…ÛŒÙ„/.test(cmd)){
   const g=await api('/api/gmail/status');
   out.textContent='Gmail authorized: '+String(!!g.authorized).toUpperCase()+'. Sending ready: '+String(!!g.actual_sending_ready).toUpperCase()+'. Real inbound/reply test: NOT VERIFIED.';
  }else if(/whatsapp|ÙˆØ§Ù¹Ø³ Ø§ÛŒÙ¾/.test(cmd)){
   out.textContent='WhatsApp end-to-end status: NOT VERIFIED. Do not treat the outgoing helper as proof that inbound and replies work.';
  }else if(/buyer|seller|opportunity|buyers|sellers|Ø®Ø±ÛŒØ¯Ø§Ø±|Ø³ÛŒÙ„Ø±/.test(cmd)){
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
 productSelect.innerHTML=cachedProducts.map(x=>'<option value="'+x.id+'" data-price="'+(x.price_pkr||0)+'">'+esc(x.title)+' Ã¢â‚¬â€ PKR '+fmt(x.price_pkr)+'</option>').join('')||'<option value="">No products</option>';
 sellerSelect.innerHTML=cachedSellers.map(x=>'<option value="'+x.id+'">'+esc(x.name)+' Ã¢â‚¬â€ '+esc((x.city||'')+', '+(x.country||''))+'</option>').join('')||'<option value="">No sellers</option>';
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
  const label=st==='complete'?'Catalog sync: COMPLETE':st==='partial'?'Catalog sync: PARTIAL â€” some products failed':st==='failed'?'Catalog sync: FAILED':st==='empty_source'?'Catalog sync: source empty':st==='running'?'Catalog sync: RUNNING / possibly interrupted':'Catalog sync: NOT RUN YET';
  paintCatalogSync(st,label,false);
 }catch(e){paintCatalogSync('unknown','Catalog sync: status unavailable',false);}
}
async function prepareOutreachDraftsNow(){
 const box=document.getElementById('outboundQueue');if(box)box.textContent='Preparing safe outreach drafts; no messages will be sent...';
 try{
  const r=await api('/api/outreach/prepare',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
  if(!r.ok)throw new Error(r.reason||r.error||'Draft preparation failed');
  if(box)box.textContent='Draft preparation complete: '+Number(r.prepared||0)+' prepared; '+Number(r.skipped||0)+' skipped. No external messages were sent.';
  await loadOutboundQueue();
 }catch(e){if(box)box.textContent='Could not prepare outreach drafts: '+String(e.message||e);}
}async function loadGmailMailbox(){
 const box=document.getElementById('gmailMailbox');if(!box)return;box.textContent='Loading Gmail inbox...';
 try{const r=await api('/api/gmail/inbox');const msgs=r.messages||[];if(!msgs.length){box.textContent='No messages found in Gmail Inbox.';return;}box.innerHTML=msgs.map(m=>'<details style="border-top:1px solid #e5e7eb;padding:9px 0"><summary style="cursor:pointer"><b>'+esc(m.unread?'● ':'')+esc(m.subject||'(no subject)')+'</b><div style="font-size:12px;color:#64748b">'+esc(m.from||'')+' · '+esc(m.date||'')+'</div><div style="font-size:13px">'+esc(m.snippet||'')+'</div></summary><div style="padding:10px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.body||m.snippet||'(No plain-text body available)')+'</div></details>').join('');}
 catch(e){box.textContent='Mailbox error: '+String(e.message||e)+'. Confirm Gmail is connected and Owner session is active.';}
}
async function subscribeWhatsAppWebhook(){const box=document.getElementById('whatsAppMailbox');if(!box)return;if(!confirm('Owner approval: subscribe the configured PakThai Tech app to its single owned WhatsApp Business Account so Meta can send delivery-status callbacks? No message will be sent by this action.'))return;box.textContent='Fixing Meta webhook subscription...';try{const r=await fetch('/api/notifications/whatsapp-webhook-subscribe',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||'Meta subscription failed');box.textContent='Meta app subscription request completed. Verified: '+String(j.verified)+'. Refreshing diagnostics...';await loadWhatsAppMailbox();}catch(e){box.textContent='Could not fix Meta webhook subscription: '+String(e.message||e);}}
async function sendWhatsAppTemplateTest(){
 const box=document.getElementById('whatsAppMailbox');
 if(box)box.textContent='Automated WhatsApp sending is paused during provider migration. No message was sent.';
}async function archiveNotificationRecord(id){
 const notificationId=Number(id);if(!Number.isSafeInteger(notificationId)||notificationId<1)return;
 if(!confirm('Hide this message record from the dashboard? This does not recall a message already delivered.'))return;
 const box=document.getElementById('whatsAppMailbox');
 try{const r=await fetch('/api/notifications/archive',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:notificationId})});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));await loadWhatsAppMailbox();await loadOutboundQueue();await loadWhatsAppStatus();}
 catch(e){if(box)box.textContent='Could not hide record: '+String(e.message||e);}
}
async function loadWhatsAppMailbox(){
 const selectedStatus=document.getElementById('whatsAppStatusFilter')?.value||'all';const box=document.getElementById('whatsAppMailbox');if(!box)return;box.textContent='Loading WhatsApp messages and delivery status...';
 try{const [inbox,notes,status,diag]=await Promise.all([api('/api/notifications/whatsapp-inbox'),api('/api/notifications'),api('/api/notifications/whatsapp-status'),api('/api/notifications/whatsapp-diagnostics').catch(e=>({ok:false,error:e.message||String(e)}))]);const rows=[];for(const m of inbox.messages||[])rows.push({time:m.message_timestamp||m.received_at||'',direction:'INCOMING',peer:m.sender_name?m.sender_name+' · '+m.sender:m.sender,body:m.message_text||'['+(m.message_type||'message')+']',status:'Received',statusKey:'received',id:m.message_id});const sm=new Map((status.messages||[]).filter(m=>m.notification_id).map(m=>[Number(m.notification_id),m]));for(const n of notes.notifications||[]){if(n.channel!=='whatsapp'||!['sent','failed','approved','prepared'].includes(String(n.status))||String(n.status)==='archived')continue;const d=sm.get(Number(n.id));const st=d?({accepted:'API accepted — delivery unconfirmed',sent:'Sent',delivered:'Delivered',read:'Read',failed:'Failed'}[String(d.status).toLowerCase()]||d.status):n.status==='failed'?'Rejected / Failed':n.status==='sent'?'Sent — no WhatsApp receipt':'Pending';const rawStatus=String(d?.status||'').toLowerCase();const statusKey=rawStatus==='delivered'?'delivered':rawStatus==='read'?'read':rawStatus==='failed'||n.status==='failed'?'rejected':rawStatus==='sent'?'sent':'pending';rows.push({time:n.sent_at||n.created_at||'',direction:'OUTGOING',peer:n.recipient||'',body:n.message||n.subject||'',status:st,statusKey,notificationId:Number(n.id),id:d?.message_id||('notification '+n.id),error:d?.error_message||''});}rows.sort((a,b)=>String(b.time).localeCompare(String(a.time)));const templateChoices=diag.ok?(diag.wabas||[]).flatMap(a=>(a.templates||[]).filter(t=>String(t.status).toUpperCase()==='APPROVED'&&!JSON.stringify(t.components||[]).includes('{{')).map(t=>({name:t.name,language:t.language,body:(t.components||[]).filter(c=>c.type==='BODY').map(c=>c.text||'').join(' ')}))):[];const templateControl=templateChoices.length?'<div style="margin:10px 0;padding:10px;border:1px solid #cbd5e1;border-radius:8px"><b>Approved template test to Nadeem</b><p>Only approved templates without variables are offered. Review the template name before sending.</p><select id="whatsAppTemplateChoice">'+templateChoices.map(t=>'<option value="'+esc(t.name+'|'+t.language)+'">'+esc(t.name+' · '+t.language+' · '+t.body)+'</option>').join('')+'</select> <button onclick="sendWhatsAppTemplateTest()">Send One Template Test</button><p>After sending, verify the phone and wait for a Meta delivered status.</p></div>':'<p>No approved, variable-free template is available to safely test a business-initiated message.</p>';const diagnosticHtml=diag.paused?'<div style="padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:12px"><b>Automated WhatsApp sending paused</b><p>'+esc(diag.message||'No Meta API calls will be made.')+'</p></div>':diag.ok?'<div style="padding:10px;background:#f8fafc;border-radius:8px;margin-bottom:12px"><b>Meta setup check — '+esc(diag.checked_at||'')+'</b><p>Phone lookup: '+(diag.phone?.ok?'OK':'FAILED')+(diag.phone?.error?' — '+esc(diag.phone.error.message):'')+'</p><p>WhatsApp Business account lookup: '+(diag.accounts_ok?'OK':'FAILED')+(diag.accounts_error?' — '+esc(diag.accounts_error.message):'')+'</p>'+((diag.wabas||[]).map(a=>'<p><b>'+esc(a.name||a.id)+'</b> · webhook subscription: '+(a.subscribed_apps_ok?(a.subscribed_apps.length?'APP SUBSCRIBED':'NO APP SUBSCRIBED'):'CHECK FAILED')+(a.subscription_error?' — '+esc(a.subscription_error.message):'')+(a.subscribed_apps_ok&&!a.subscribed_apps.length?' <button onclick="subscribeWhatsAppWebhook()">Fix webhook subscription</button>':'')+' · approved templates: '+esc((a.templates||[]).filter(t=>String(t.status).toUpperCase()==='APPROVED').map(t=>t.name+' ('+t.language+')').join(', ')||'NONE FOUND')+(a.templates_error?' · '+esc(a.templates_error.message):'')+'</p>').join(''))+templateControl+'</div>':'<div style="padding:10px;background:#fff7ed;border-radius:8px;margin-bottom:12px"><b>Meta setup check unavailable:</b> '+esc(diag.error||'Check owner login and refresh')+'</div>';const filteredRows=selectedStatus==='all'?rows:rows.filter(m=>m.statusKey===selectedStatus);const statusFilter='<label>Message status <select id="whatsAppStatusFilter" onchange="loadWhatsAppMailbox()"><option value="all" '+(selectedStatus==='all'?'selected':'')+'>All</option><option value="pending" '+(selectedStatus==='pending'?'selected':'')+'>Pending</option><option value="sent" '+(selectedStatus==='sent'?'selected':'')+'>Sent</option><option value="delivered" '+(selectedStatus==='delivered'?'selected':'')+'>Delivered</option><option value="read" '+(selectedStatus==='read'?'selected':'')+'>Read</option><option value="rejected" '+(selectedStatus==='rejected'?'selected':'')+'>Rejected / Failed</option><option value="received" '+(selectedStatus==='received'?'selected':'')+'>Received</option></select></label>';box.innerHTML=statusFilter+diagnosticHtml+filteredRows.slice(0,50).map(m=>'<details style="border-top:1px solid #e5e7eb;padding:9px 0"><summary style="cursor:pointer"><b>'+esc(m.direction)+' · '+esc(m.peer)+'</b><div style="font-size:12px;color:#64748b">'+esc(m.time)+' · '+esc(m.status)+'</div><div style="font-size:13px">'+esc(String(m.body||'').slice(0,180))+'</div></summary><div style="padding:10px;white-space:pre-wrap;overflow-wrap:anywhere">'+esc(m.body||'')+'<hr><b>Status:</b> '+esc(m.status)+'<br><b>Message ID:</b> '+esc(m.id||'')+(m.error?'<br><b>Error:</b> '+esc(m.error):'')+(m.notificationId?'<p><button onclick="archiveNotificationRecord('+m.notificationId+')">Remove record</button></p>':'')+'</div></details>').join('');}
 catch(e){box.textContent='WhatsBox error: '+String(e.message||e)+'. Refresh after Owner login.';}
}
async function loadOutboundQueue(){
 const box=document.getElementById('outboundQueue');if(!box)return;
 box.textContent='Loading prepared messages...';
 try{
  const [r,ws]=await Promise.all([api('/api/notifications'),api('/api/notifications/whatsapp-status').catch(()=>({messages:[]}))]);const deliveryByNotification=new Map((ws.messages||[]).filter(m=>m.notification_id).map(m=>[Number(m.notification_id),m]));const rows=(r.notifications||[]).filter(n=>{const outbound=['email','whatsapp'].includes(String(n.channel||''))&&['prepared','approved','sent','failed'].includes(String(n.status||''))&&String(n.status)!=='archived';const diagnostic=/(test|diagnostic|verification|connection check|please ignore)/i.test(String(n.subject||'')+' '+String(n.message||''));const created=Date.parse(String(n.created_at||''));const stale=!Number.isFinite(created)||created<Date.now()-24*60*60*1000;return outbound&&!(diagnostic&&stale);});
  if(!rows.length){box.textContent='Inbox is clear. Prepared drafts and recent sent messages will appear here when available.';return;}
  const deliveryLabel=m=>!m?'Not sent / no WhatsApp receipt':({accepted:'API accepted — delivery unconfirmed',sent:'Sent by WhatsApp server',delivered:'Delivered to recipient device',read:'Read by recipient',failed:'Failed — see Meta error details'}[String(m.status||'').toLowerCase()]||String(m.status||'Unknown'));
  box.innerHTML='<div style="overflow:auto"><table><tr><th>Created</th><th>Channel</th><th>Recipient</th><th>Subject / Preview</th><th>Queue Status</th><th>Delivery Status</th><th>Owner Action</th></tr>'+rows.map(n=>{const d=n.channel==='whatsapp'?deliveryByNotification.get(Number(n.id)):null;const pending=['prepared','approved'].includes(String(n.status));return '<tr><td>'+esc(n.created_at||'')+'</td><td>'+esc(n.channel||'')+'</td><td style="max-width:190px;word-break:break-word">'+esc(n.recipient||'')+'</td><td><b>'+esc(n.subject||'')+'</b><div style="white-space:pre-wrap;max-width:420px;max-height:120px;overflow:auto">'+esc(String(n.message||'').slice(0,1200))+'</div></td><td>'+esc(n.status)+'</td><td>'+esc(n.channel==='whatsapp'?deliveryLabel(d):(n.status==='sent'?'Sent by Gmail provider':n.status==='failed'?'Failed':'Not sent'))+(d&&d.error_code?' — Error '+esc(d.error_code)+' '+esc(d.error_message||''):'')+'</td><td>'+(pending&&n.channel==='email'?'<button onclick="approveAndSendNotification('+Number(n.id)+',&quot;'+esc(n.channel)+'&quot;)">Approve &amp; Send</button> ':pending&&n.channel==='whatsapp'?'<span style="color:#92400e">Paused â€” provider migration</span> ':'')+'<button class="alt" onclick="archiveNotificationRecord('+Number(n.id)+')">Remove record</button></td></tr>';}).join('')+'</table></div>';
 }catch(e){box.textContent='Could not load message queue: '+String(e.message||e);}
}
async function approveAndSendNotification(id,channel){
 if(!Number.isInteger(Number(id))||channel!=='email')return;
 if(!confirm('Owner approval: send this '+channel.toUpperCase()+' message to the recipient shown in the queue? This action contacts an external recipient.'))return;
 const box=document.getElementById('outboundQueue');if(box)box.textContent='Sending approved message...';
 try{
  const getJson=async(path,options={})=>{const r=await fetch(path,options);const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||j.error||j.ok===false)throw new Error(j.error||('HTTP '+r.status));return j;};
  const current=await getJson('/api/notifications');const item=(current.notifications||[]).find(n=>Number(n.id)===Number(id));
  if(!item||item.channel!==channel||!['prepared','approved'].includes(String(item.status)))throw new Error('Notification is no longer pending. Refresh the queue.');
  if(item.status==='prepared')await getJson('/api/notifications/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:Number(id)})});
  const sent=channel==='whatsapp'
   ? await getJson('/api/notifications/whatsapp-send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:Number(id)})})
   : await getJson('/api/notifications/gmail-send',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({notification_id:Number(id)})});
  if(!sent.sent)throw new Error('Provider did not confirm acceptance. Check status before retrying.');
  if(box)box.textContent='Email provider accepted message ID: '+(sent.message_id||'not returned')+'. Provider acceptance is not recipient delivery confirmation.';
  await loadOutboundQueue();await loadWhatsAppStatus();
 }catch(e){if(box)box.textContent='Send failed or unconfirmed: '+String(e.message||e)+'. Refresh status before retrying to avoid duplicates.';}
}let whatsAppDeliveryFilter='all';
async function removeWhatsAppStatusRecord(messageId){
 const id=String(messageId||'').trim();if(!id)return;
 if(!confirm('Remove this WhatsApp delivery-status record from the dashboard history? This does not recall or delete a message from the recipient phone.'))return;
 const summary=document.getElementById('whatsappDeliverySummary');
 try{const r=await fetch('/api/notifications/whatsapp-status/remove',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message_id:id})});const j=await r.json().catch(()=>({error:'Invalid server response'}));if(!r.ok||!j.ok)throw new Error(j.error||('HTTP '+r.status));if(summary)summary.textContent='Status record removed. Refreshing list...';await loadWhatsAppStatus();await loadWhatsAppMailbox();await loadOutboundQueue();}
 catch(e){if(summary)summary.textContent='Could not remove status record: '+String(e.message||e);}
}
async function loadWhatsAppStatus(){
 const summary=document.getElementById('whatsappDeliverySummary'),list=document.getElementById('whatsappDeliveryList');
 if(!summary||!list)return;
 try{
  const r=await api('/api/notifications/whatsapp-status');
  const messages=r.messages||[];
  const setup=document.getElementById('whatsappWebhookSetup');
  const callbacksSeen=messages.some(m=>['sent','delivered','read','failed'].includes(String(m.status||'').toLowerCase()));
  if(setup){setup.textContent=r.webhook_configured?(callbacksSeen?'Webhook secrets configured; Meta status callback received.':'Webhook secrets configured, but Meta delivery callbacks are NOT YET CONFIRMED.'):'Webhook configuration: INCOMPLETE â€” '+(!r.webhook_verify_configured?'WHATSAPP_WEBHOOK_VERIFY_TOKEN missing. ':'')+(!r.app_secret_configured?'WHATSAPP_APP_SECRET missing. ':'')+' Callback URL: '+(r.callback_url||'/webhooks/whatsapp');setup.style.color=r.webhook_configured&&callbacksSeen?'#166534':'#9a3412';}
  const names={accepted:'API accepted â€” delivery unconfirmed',sent:'Sent by WhatsApp server',delivered:'DELIVERED to recipient device',read:'READ by recipient',failed:'FAILED â€” see Meta error details'};
  if(!messages.length){summary.textContent='No WhatsApp status callbacks recorded yet. Meta API acceptance alone does not prove delivery.';list.innerHTML='';return;}
  const latest=messages[0];
  summary.textContent='Latest status: '+(names[latest.status]||String(latest.status).toUpperCase())+(latest.status_timestamp?' Â· '+new Date(latest.status_timestamp).toLocaleString():'')+(latest.error_code?' Â· Error '+latest.error_code:'')+(latest.error_message?' Â· '+latest.error_message:'')+(latest.status==='accepted'?' Â· Historical delivery reason unavailable: webhook was not configured when this message was sent.':'');
  const visibleMessages=messages.filter(m=>whatsAppDeliveryFilter==='all'||(whatsAppDeliveryFilter==='pending'?String(m.status||'').toLowerCase()==='accepted':String(m.status||'').toLowerCase()===whatsAppDeliveryFilter));
  list.innerHTML='<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0"><label>Filter status <select id="whatsappDeliveryFilter" onchange="whatsAppDeliveryFilter=this.value;loadWhatsAppStatus()"><option value="all" '+(whatsAppDeliveryFilter==='all'?'selected':'')+'>All</option><option value="pending" '+(whatsAppDeliveryFilter==='pending'?'selected':'')+'>Pending / unconfirmed</option><option value="sent" '+(whatsAppDeliveryFilter==='sent'?'selected':'')+'>Sent</option><option value="delivered" '+(whatsAppDeliveryFilter==='delivered'?'selected':'')+'>Delivered</option><option value="read" '+(whatsAppDeliveryFilter==='read'?'selected':'')+'>Read</option><option value="failed" '+(whatsAppDeliveryFilter==='failed'?'selected':'')+'>Rejected / Failed</option></select></label><span>'+visibleMessages.length+' record(s)</span></div><div style="overflow:auto"><table><tr><th>Status</th><th>Recipient</th><th>Message ID</th><th>Details</th><th>Action</th></tr>'+visibleMessages.slice(0,50).map(m=>'<tr><td><b>'+esc(names[m.status]||m.status)+'</b></td><td>'+esc(m.recipient||'')+'</td><td style="max-width:220px;word-break:break-all">'+esc(m.message_id||'')+'</td><td>'+esc([m.error_title,m.error_code,m.error_message].filter(Boolean).join(' â€” ')||(m.status==='accepted'?'Historical failure reason not captured; awaiting webhook for future messages.':m.status_timestamp||'Waiting for webhook status'))+'</td><td>'+ '<button class="alt" data-message-id="'+esc(m.message_id||'')+'" onclick="removeWhatsAppStatusRecord(this.dataset.messageId)">Remove record</button>'+'</td></tr>').join('')+'</table></div>';
 }catch(e){summary.textContent='Could not load delivery status: '+String(e.message||e);}
}
async function sync(){
 if(catalogSyncActive)return;
 catalogSyncActive=true;
 const btn=document.getElementById('catalogSyncBtn');
 if(btn){btn.disabled=true;btn.textContent='Syncingâ€¦';}
 paintCatalogSync('running','Catalog sync: WORKINGâ€¦',true);
 let start=0,done=false,total=0,failed=0,failedHandles=[],sourceWarnings=[];
 try{
  while(!done){
   paintCatalogSync('running','Syncing catalogâ€¦ saved '+total+' product(s)',true);
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
async function loadSourcingPartners(){const box=document.getElementById('partnerList'),status=document.getElementById('partnerStatus');if(!box)return;box.textContent='Loading partners…';try{const r=await fetch('/api/sourcing-partners',{credentials:'same-origin'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not load partners');const rows=Array.isArray(j)?j:(j.partners||j.results||[]);box.innerHTML=rows.length?'<table><thead><tr><th>Name</th><th>Country</th><th>Lead type</th><th>Contact</th><th>Status</th><th>Action</th></tr></thead><tbody>'+rows.map(p=>'<tr><td>'+esc(p.name)+'</td><td>'+esc(p.country_name)+' ('+esc(p.country_code)+')</td><td>'+esc(p.lead_types||'all')+'</td><td>'+esc(p.contact||p.email||'—')+'</td><td>'+(Number(p.active)?'Active':'Inactive')+'</td><td><button type="button" onclick="editSourcingPartner('+Number(p.id)+')">Edit</button> <button type="button" onclick="toggleSourcingPartner('+Number(p.id)+','+(Number(p.active)?'false':'true')+')">'+(Number(p.active)?'Deactivate':'Activate')+'</button> <button type="button" class="alt" onclick="removeSourcingPartner('+Number(p.id)+','+Number(p.active)+')">Remove</button></td></tr>').join('')+'</tbody></table>':'No partners added yet.';if(status)status.textContent='';}catch(e){box.textContent=e.message||'Could not load partners';}}
async function addSourcingPartner(e){e.preventDefault();const status=document.getElementById('partnerStatus');status.textContent='Saving…';const body={name:document.getElementById('partnerName').value.trim(),country_code:document.getElementById('partnerCountryCode').value.trim().toUpperCase(),country_name:document.getElementById('partnerCountryName').value.trim(),contact:document.getElementById('partnerContact').value.trim(),email:document.getElementById('partnerEmail').value.trim(),lead_types:document.getElementById('partnerLeadType').value};try{const r=await fetch('/api/sourcing-partners',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not add partner');document.getElementById('partnerForm').reset();status.textContent='Partner added.';await loadSourcingPartners();}catch(err){status.textContent=err.message||'Could not add partner';}return false;}
async function toggleSourcingPartner(id,active){const status=document.getElementById('partnerStatus');status.textContent='Updating…';try{const r=await fetch('/api/sourcing-partners/'+id,{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({active})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not update partner');status.textContent='Partner status updated.';await loadSourcingPartners();}catch(e){status.textContent=e.message||'Could not update partner';}}
async function editSourcingPartner(id){const status=document.getElementById('partnerStatus');try{const resp=await fetch('/api/sourcing-partners',{credentials:'same-origin'}),data=await resp.json();if(!resp.ok)throw new Error(data.error||'Could not load partner');const p=(data.partners||[]).find(x=>Number(x.id)===Number(id));if(!p)throw new Error('Partner not found. Refresh the list.');const name=prompt('Partner name:',p.name||'');if(name===null)return;const countryCode=prompt('ISO country code (e.g. KR):',p.country_code||'');if(countryCode===null)return;const countryName=prompt('Country name:',p.country_name||'');if(countryName===null)return;const contact=prompt('Phone / contact (e.g. +821068879265):',p.contact||'');if(contact===null)return;const email=prompt('Email (optional):',p.email||'');if(email===null)return;const leadTypes=prompt('Lead type: all, buyer, or supplier',p.lead_types||'all');if(leadTypes===null)return;status.textContent='Saving partner changes…';const r=await fetch('/api/sourcing-partners/'+id,{method:'PATCH',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({name,country_code:countryCode,country_name:countryName,contact,email,lead_types:leadTypes})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not update partner');status.textContent='Partner details updated.';await loadSourcingPartners();}catch(e){status.textContent=e.message||'Could not edit partner';}}
async function removeSourcingPartner(id,active){const status=document.getElementById('partnerStatus');if(Number(active)===1){status.textContent='Deactivate this partner first, then Remove. Active partners cannot be deleted.';return;}if(!confirm('Remove this inactive partner record? If it is linked to customer request history, removal will be blocked to preserve history.'))return;status.textContent='Removing partner…';try{const r=await fetch('/api/sourcing-partners/'+id,{method:'DELETE',credentials:'same-origin'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Could not remove partner');status.textContent=j.message||'Partner removed.';await loadSourcingPartners();}catch(e){status.textContent=e.message||'Could not remove partner';}}
loadControlPanel();
loadCountryControls();
refresh();

;

async function openDiscoveryCenter(){
  document.querySelectorAll('.panel').forEach(function(x){x.style.display='none';});
  var el=document.getElementById('discoverycenter'); if(el) el.style.display='block';
  await loadBuyerDiscoveryStatus(); await loadBuyerProspects(); await loadSellerProspects(); await loadMarketDiscoveryStatus(); await loadMarketDeals(); await refreshMarketDealProspects();
}
async function loadBuyerDiscoveryStatus(){
  var box=document.getElementById('discoveryStatus'),btn=document.getElementById('discoveryRunBtn');
  try{var s=await api('/api/buyer-prospects/status');
    if(!s.ok) throw new Error(s.error||'Status unavailable');
    if(s.api_key_configured){box.textContent='Ready: Free OpenStreetMap search. No Google API key or billing required. Leads are unverified; no outreach is sent.';btn.disabled=false;}
    else{box.textContent='Free OpenStreetMap discovery is enabled. Search runs only when you press the button; no paid API key is required.';btn.disabled=true;}
  }catch(e){box.textContent='Could not verify discovery setup: '+(e.message||String(e));btn.disabled=true;}
}
async function loadBuyerProspects(){
  var box=document.getElementById('buyerProspectList'); if(!box)return; box.textContent='Loading prospects...';
  try{var r=await api('/api/buyer-prospects');var a=r.prospects||[];
    if(!a.length){box.innerHTML='<p>No prospects found yet. Run a free OpenStreetMap search.</p>';return;}
    box.innerHTML='<div style="overflow:auto"><table><tr><th>Business / Source ID</th><th>City</th><th>Search</th><th>Review status</th><th>Owner notes</th><th>Save</th></tr>'+a.map(function(x){return '<tr><td>'+esc((x.business_name||'Unnamed business')+' ('+x.place_id+')')+'</td><td>'+esc(x.discovery_city)+'</td><td>'+esc(x.discovery_query)+'</td><td><select id="prospectStatus'+Number(x.id)+'"><option value="unreviewed" '+(x.review_status==='unreviewed'?'selected':'')+'>Unreviewed</option><option value="contact_to_verify" '+(x.review_status==='contact_to_verify'?'selected':'')+'>Contact to verify</option><option value="qualified" '+(x.review_status==='qualified'?'selected':'')+'>Qualified</option><option value="not_a_fit" '+(x.review_status==='not_a_fit'?'selected':'')+'>Not a fit</option></select></td><td><input id="prospectNotes'+Number(x.id)+'" value="'+esc(x.owner_notes||'')+'" placeholder="Owner notes"></td><td><button onclick="saveBuyerProspectReview('+Number(x.id)+')">Save</button></td></tr>';}).join('')+'</table></div>';
  }catch(e){box.textContent='Could not load prospects: '+(e.message||String(e));}
}
async function loadSellerProspects(){
  await Promise.all([loadMarketProspects('Thailand'),loadMarketProspects('South Korea')]);
}
async function loadMarketDiscoveryStatus(){
  try{
    var r=await api('/api/market-prospects/status');if(!r.ok)throw new Error(r.error||'Status unavailable');
    function laneText(label,lane,count){if(!lane)return label+': no run recorded yet ('+count+' unverified lead(s)).';var at=lane.ran_at||lane.timestamp||'';var when=at?new Date(at).toLocaleString():'time unavailable';return label+': '+(lane.ok?'last run OK':'last run FAILED')+' â€” '+(Number(lane.results_seen)||0)+' found; '+count+' saved lead(s); '+when+(lane.error?' â€” '+lane.error:'');}
    var th=r.markets?.Thailand||{},kr=r.markets?.['South Korea']||{};
    document.getElementById('thaiMarketRunStatus').textContent=laneText('Thailand sellers',th.sellers,th.seller_count||0)+' '+laneText('Thailand buyers',th.buyers,th.buyer_count||0);
    document.getElementById('koreaMarketRunStatus').textContent=laneText('Korea sellers',kr.sellers,kr.seller_count||0)+' '+laneText('Korea buyers',kr.buyers,kr.buyer_count||0);
  }catch(e){var msg='Could not load owner-only search status: '+(e.message||String(e));document.getElementById('thaiMarketRunStatus').textContent=msg;document.getElementById('koreaMarketRunStatus').textContent=msg;}
}
async function loadMarketProspects(country){
  var slug=country==='Thailand'?'thai':'korea';
  for(var type of ['seller','buyer']){
    var box=document.getElementById(slug+(type==='seller'?'Seller':'Buyer')+'ProspectList');
    if(!box)continue; box.textContent='Loading '+type+' prospects...';
    try{
      var r=await api('/api/external-prospects?type='+type+'&country='+encodeURIComponent(country));var a=r.prospects||[];
      if(!a.length){box.innerHTML='<p>No '+type+' prospects found yet.</p>';continue;}
      box.innerHTML='<div style="overflow:auto;max-height:360px"><table><tr><th>Business</th><th>Source</th><th>Review</th><th>Notes</th><th>Save</th></tr>'+a.map(function(x){return '<tr><td>'+esc(x.title)+'</td><td>'+esc(x.snippet||'')+'<br><a href="'+esc(x.url)+'" target="_blank" rel="noopener noreferrer">'+esc(x.domain||x.url)+'</a></td><td><select id="marketProspectStatus'+Number(x.id)+'"><option value="unreviewed" '+(x.review_status==='unreviewed'?'selected':'')+'>Unreviewed</option><option value="contact_to_verify" '+(x.review_status==='contact_to_verify'?'selected':'')+'>Verify contact</option><option value="qualified" '+(x.review_status==='qualified'?'selected':'')+'>Qualified</option><option value="not_a_fit" '+(x.review_status==='not_a_fit'?'selected':'')+'>Not a fit</option></select></td><td><input id="marketProspectNotes'+Number(x.id)+'" value="'+esc(x.owner_notes||'')+'" placeholder="Owner notes"></td><td><button onclick="saveMarketProspectReview('+Number(x.id)+',&quot;'+esc(country)+'&quot;)">Save</button></td></tr>';}).join('')+'</table></div>';
    }catch(e){box.textContent='Could not load '+type+' prospects: '+(e.message||String(e));}
  }
  await refreshMarketDealProspects();
}
async function saveMarketProspectReview(id,country){
  var status=document.getElementById('marketProspectStatus'+id).value,notes=document.getElementById('marketProspectNotes'+id).value;
  try{var r=await api('/api/external-prospects/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,review_status:status,owner_notes:notes})});if(!r.ok)throw new Error(r.error||'Save failed');await loadMarketProspects(country);}
  catch(e){alert('Could not save prospect review: '+(e.message||String(e)));}
}
async function runSellerDiscovery(){
  var btn=document.getElementById('sellerDiscoveryRunBtn'),box=document.getElementById('sellerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching public listings around Bangkok. Leads are unverified.';
  try{var r=await api('/api/seller-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error(r.error||'Seller discovery failed');box.textContent='Thailand search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. No messages were sent.';await loadMarketProspects('Thailand');await loadMarketDiscoveryStatus();}
  catch(e){box.textContent='Thailand seller search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function runKoreaSellerDiscovery(){
  var btn=document.getElementById('koreaSellerDiscoveryRunBtn'),box=document.getElementById('koreaSellerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching free public listings within an initial 30 km of Pyeongtaek. Leads are unverified.';
  try{var r=await api('/api/korea-seller-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error(r.error||'Korea discovery failed');box.textContent=r.skipped?r.reason:'Korea search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. No messages were sent.';await loadMarketProspects('South Korea');await loadMarketDiscoveryStatus();}
  catch(e){box.textContent='Korea seller search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function runMarketBuyerDiscovery(country){
  var slug=country==='Thailand'?'thai':'korea',btn=document.getElementById(slug+'BuyerDiscoveryRunBtn'),box=document.getElementById(slug+'BuyerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching free public business listings. No outreach will be sent.';
  try{var r=await api('/api/market-prospects/discover-buyers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({country:country})});if(!r.ok)throw new Error(r.error||'Buyer search failed');box.textContent=r.skipped?r.reason:country+' buyer search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. Unverified leads only.';await loadMarketProspects(country);await loadMarketDiscoveryStatus();}
  catch(e){box.textContent=country+' buyer search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function refreshMarketDealProspects(){
  var country=document.getElementById('marketDealCountry')?.value||'Thailand',direction=document.getElementById('marketDealDirection')?.value||'sell_to_market',type=direction==='sell_to_market'?'buyer':'seller',box=document.getElementById('marketDealProspect');
  if(!box)return;
  try{var r=await api('/api/external-prospects?type='+type+'&country='+encodeURIComponent(country));var qualified=(r.prospects||[]).filter(function(x){return x.review_status==='qualified';});box.innerHTML=qualified.length?qualified.map(function(x){return '<option value="'+Number(x.id)+'">'+esc(x.title)+' â€” '+esc(country)+'</option>';}).join(''):'<option value="">No qualified '+type+' leads yet â€” review a prospect above first</option>';}
  catch(e){box.innerHTML='<option value="">Could not load qualified prospects</option>';}
}
async function createMarketDealDraft(){
  var box=document.getElementById('marketDealResult'),body={country:document.getElementById('marketDealCountry').value,direction:document.getElementById('marketDealDirection').value,prospect_id:Number(document.getElementById('marketDealProspect').value),item_description:document.getElementById('marketDealItem').value,quantity:Number(document.getElementById('marketDealQuantity').value),owner_notes:document.getElementById('marketDealNotes').value};
  try{var r=await api('/api/market-deals',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});if(!r.ok)throw new Error(r.error||'Could not create deal draft');box.textContent='Internal draft created for '+r.country+' ('+r.currency+'). Pricing/logistics need verification and owner approval; no quote or message was sent.';document.getElementById('marketDealItem').value='';await loadMarketDeals();}
  catch(e){box.textContent=e.message||String(e);}
}
async function loadMarketDeals(){
  var box=document.getElementById('marketDealsList');if(!box)return;box.textContent='Loading deal drafts...';
  try{var r=await api('/api/market-deals');var a=r.deals||[];if(!a.length){box.innerHTML='<p>No internal market deal drafts yet.</p>';return;}var stages=['lead_review','qualified','pricing_required','draft_quote','closed_won','closed_lost'];
    box.innerHTML='<div style="overflow:auto"><table><tr><th>Market</th><th>Direction</th><th>Lead</th><th>Product / need</th><th>Qty</th><th>Currency</th><th>Stage</th><th>Save</th></tr>'+a.map(function(x){return '<tr><td>'+esc(x.country)+'</td><td>'+esc(x.direction==='sell_to_market'?'Sell to market':'Source from market')+'</td><td>'+esc(x.prospect_name||'')+'</td><td>'+esc(x.item_description||'')+'</td><td>'+Number(x.quantity||1)+'</td><td>'+esc(x.currency)+'</td><td><select id="marketDealStage'+Number(x.id)+'">'+stages.map(function(s){return '<option value="'+s+'" '+(x.stage===s?'selected':'')+'>'+s.replace(/_/g,' ')+'</option>';}).join('')+'</select></td><td><button onclick="saveMarketDealStage('+Number(x.id)+')">Save</button></td></tr>';}).join('')+'</table></div>';
  }catch(e){box.textContent='Could not load deal drafts: '+(e.message||String(e));}
}
async function saveMarketDealStage(id){
  var stage=document.getElementById('marketDealStage'+id).value;
  try{var r=await api('/api/market-deals/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,stage:stage})});if(!r.ok)throw new Error(r.error||'Could not save deal stage');await loadMarketDeals();}
  catch(e){alert(e.message||String(e));}
}async function runBuyerDiscovery(){
  var btn=document.getElementById('discoveryRunBtn'),box=document.getElementById('discoveryResult');
  var cities=document.getElementById('discoveryCities').value.split(',').map(function(x){return x.trim();}).filter(Boolean);
  var search=document.getElementById('discoverySearch').value;
  if(!cities.length){box.textContent='Enter at least one city.';return;}
  btn.disabled=true;box.textContent='Searching free OpenStreetMap business data. No Google billing is used.';
  try{var r=await api('/api/buyer-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cities:cities,searches:[search]})});
    if(!r.ok) throw new Error(r.error||(Array.isArray(r.errors)&&r.errors.length?r.errors.map(function(x){return x.city+': '+x.error;}).join(' | '):'Discovery request failed'));
    box.textContent='Search complete (OpenStreetMap). Queries: '+r.queries_run+'; businesses found: '+r.results_seen+'; leads saved/refreshed: '+r.saved_or_refreshed+'. No outreach was sent.';
    await loadBuyerProspects();
  }catch(e){box.textContent='Discovery not completed: '+(e.message||String(e));await loadBuyerDiscoveryStatus();}
  finally{btn.disabled=!(document.getElementById('discoveryStatus').textContent.indexOf('Ready:')===0);}
}
async function saveBuyerProspectReview(id){
  var status=document.getElementById('prospectStatus'+id).value,notes=document.getElementById('prospectNotes'+id).value;
  try{var r=await api('/api/buyer-prospects/review',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:id,review_status:status,owner_notes:notes})});if(!r.ok)throw new Error(r.error||'Save failed');await loadBuyerProspects();}
  catch(e){alert('Could not save review: '+(e.message||String(e)));}
}
async function openBuyerCenter(){
  document.querySelectorAll('.panel').forEach(function(x){x.style.display='none';});
  var el=document.getElementById('buyercenter');
  if(el) el.style.display='block';
  await loadBuyerCenter();
}

async function loadBuyerCenter(){
  try{
    var b=await api('/api/buyers');
    var buyers=b.buyers||[];
    var sel=document.getElementById('requirementBuyer');
    if(sel){
      sel.innerHTML=buyers.length
        ? buyers.map(function(x){return '<option value="'+x.id+'">'+esc(x.name)+'</option>';}).join('')
        : '<option value="">Add a buyer first</option>';
    }

    var list=document.getElementById('buyerList');
    if(list){
      list.innerHTML=buyers.length
        ? buyers.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.name)+'</b> Ã¢â‚¬â€ '+esc(x.city||'Pakistan')+' Ã¢â‚¬â€ '+esc(x.phone||x.whatsapp||'')+'</div>';
          }).join('')
        : '<p>No Pakistan buyers yet.</p>';
    }

    var r=await api('/api/buyer-requirements');
    var req=r.requirements||[];
    var rl=document.getElementById('requirementList');
    if(rl){
      rl.innerHTML=req.length
        ? req.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.buyer_name||'Buyer')+'</b> Ã¢â‚¬â€ '+esc(x.product_keyword||'')+' Ã¢â‚¬â€ Qty '+x.quantity+' Ã¢â‚¬â€ Budget PKR '+fmt(x.max_budget_pkr||0)+'</div>';
          }).join('')
        : '<p>No buyer requirements yet.</p>';
    }
  }catch(e){
    alert(e.message||e);
  }
}

async function addPakistanBuyer(){
  var body={
    name:(document.getElementById('buyerName').value||'').trim(),
    phone:document.getElementById('buyerPhone').value,
    whatsapp:document.getElementById('buyerWhatsapp').value,
    email:document.getElementById('buyerEmail').value,
    city:document.getElementById('buyerCity').value||'Pakistan',
    country:'Pakistan',
    company:document.getElementById('buyerCompany').value,
    status:'active'
  };
  if(!body.name){alert('Buyer name is required.');return;}
  var r=await api('/api/buyers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(r.error){alert(r.error);return;}
  alert('Buyer saved successfully.');
  await loadBuyerCenter();
}

async function savePakistanRequirement(){
  var buyer=document.getElementById('requirementBuyer').value;
  if(!buyer){alert('Add a buyer first.');return;}
  var body={
    buyer_id:Number(buyer),
    product_keyword:document.getElementById('requirementKeyword').value,
    quantity:Number(document.getElementById('requirementQty').value||1),
    max_budget_pkr:Number(document.getElementById('requirementBudget').value||0),
    target_price_pkr:Number(document.getElementById('requirementTarget').value||0),
    notes:'',
    status:'active'
  };
  if(!body.product_keyword){alert('Product keyword is required.');return;}
  var r=await api('/api/buyer-requirements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(r.error){alert(r.error);return;}
  alert('Buyer requirement saved.');
  await loadBuyerCenter();
}

async function runPakistanMatching(){
  var box=document.getElementById('buyerMatchResult');
  box.innerHTML='Running automatic buyer matching...';
  try{
    var r=await api('/api/buyer-match/run',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});
    box.innerHTML='<b>Matching complete.</b> Created matches: '+(r.created||0);
    await loadBuyerCenter();
  }catch(e){
    box.innerHTML='<span style="color:red">'+esc(e.message||String(e))+'</span>';
  }
}
async function sendNadeemWhatsAppTest(){
 const out=document.getElementById('whatsappTestResult');
 if(out)out.textContent='Automated WhatsApp sending is paused during provider migration. No message was sent.';
}async function initPakThaiAuth(){
 const gate=document.getElementById('authGate');
 const form=document.getElementById('authForm');
 const msg=document.getElementById('authMessage');
 const authQuery=new URLSearchParams(location.search);
 const staffSetupToken=authQuery.get('staff_setup_token');
 const ownerPasswordToken=authQuery.get('owner_password_token');
 if(staffSetupToken||ownerPasswordToken){
  form.innerHTML='<h2>PAKTHAI TECH Password Setup</h2><p>One-time link, expires in 15 minutes.</p><label>New password (minimum 12 characters)</label><input id="newAuthPassword" type="password" minlength="12" required style="width:100%;padding:10px;margin:8px 0 14px;box-sizing:border-box"><button type="submit" style="width:100%">Save Password</button><p id="authMessage" role="status"></p>';
  form.addEventListener('submit',async e=>{e.preventDefault();document.getElementById('authMessage').textContent='Saving...';const staff=Boolean(staffSetupToken);const payload={token:staff?staffSetupToken:ownerPasswordToken,password:document.getElementById('newAuthPassword').value};if(!staff)payload.purpose=authQuery.get('owner_password_purpose')||'owner_setup';try{const r=await fetch(staff?'/api/auth/staff/set-password':'/api/auth/owner/set-password',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const j=await r.json();document.getElementById('authMessage').textContent=j.message||j.error||'Done';if(r.ok)setTimeout(()=>{location.href=location.pathname;},1200);}catch(e){document.getElementById('authMessage').textContent='Request failed.';}});
  return;
 }
 function signedIn(role){
  gate.style.display='none';
  const h=document.querySelector('header');
  if(h&&!document.getElementById('authStatus')){
   const box=document.createElement('div');box.id='authStatus';box.style.cssText='display:flex;gap:8px;align-items:center;flex-wrap:wrap';
   box.innerHTML='<span style="font-size:12px">Signed in: '+(role==='owner'?'Owner':'Staff (read-only)')+'</span><button class="alt" id="authLogout">Log Out</button>';
   h.appendChild(box);
   if(role==='owner'){const manage=document.createElement('button');manage.className='alt';manage.textContent='Staff Requests';manage.onclick=async()=>{try{const r=await fetch('/api/auth/staff/list');const j=await r.json();if(!r.ok){alert(j.error||'Could not load staff requests');return;}const rows=j.staff||[];alert(rows.length?rows.map(x=>'ID '+x.id+' | '+x.name+' | '+x.email+' | '+x.status).join(' | '):'No staff requests.');const id=prompt('Enter the ID of a PENDING staff request to approve, or Cancel:');if(!id)return;const a=await fetch('/api/auth/staff/approve',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({staff_id:Number(id)})});const result=await a.json();alert(result.message||result.error||'Done');}catch(e){alert('Staff management failed.');}};box.insertBefore(manage,box.firstChild);}
   document.getElementById('authLogout').onclick=async()=>{await fetch('/api/auth/logout',{method:'POST'});location.reload();};
  }
  if(role==='staff'){
   document.querySelectorAll('button').forEach(b=>{if(/approve|reject|save|create opportunity|sync source catalog|run buyer matching|calculate automatically/i.test(b.textContent||'')){b.title='Staff account is read-only. Ask the Owner to perform this action.';}});
  }
  Promise.all([refresh(),loadControlPanel(),loadCountryControls()]).catch(e=>console.error(e));
 }
 document.getElementById('staffRequestBtn').addEventListener('click',async()=>{const name=prompt('Staff member name:');if(!name)return;const email=prompt('Staff member email:');if(!email)return;msg.textContent='Submitting request...';try{const r=await fetch('/api/auth/staff/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,email})});const j=await r.json();msg.textContent=j.message||j.error||'Request submitted.';}catch(e){msg.textContent='Request failed.';}});
 document.getElementById('ownerRecoveryBtn').addEventListener('click',async()=>{const email=prompt('Enter Owner email: pakthaitech@gmail.com');if(!email)return;msg.textContent='Requesting secure email link...';try{const r=await fetch('/api/auth/owner/recovery-request',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email})});const j=await r.json();msg.textContent=j.message||j.error||'If eligible, an email will be sent.';}catch(e){msg.textContent='Recovery request failed.';}});
 form.addEventListener('submit',async e=>{
  e.preventDefault();msg.textContent='Signing in...';
  try{
   const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:document.getElementById('authRole').value,email:document.getElementById('authEmail').value,password:document.getElementById('authPassword').value})});
   const j=await r.json();
   if(!r.ok||!j.ok){msg.textContent=j.error||'Login failed';return;}
   document.getElementById('authPassword').value='';signedIn(j.role);
  }catch(err){msg.textContent='Login request failed. Check connection and try again.';}
 });
 try{const r=await fetch('/api/auth/me',{cache:'no-store'});const j=await r.json();if(j.ok&&j.role){signedIn(j.role);return;}
  const status=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({role:'owner',password:''})});
  if(status.status===503){const x=await status.json();msg.textContent=x.error||'Login secrets are not configured yet.';}
 }catch(e){msg.textContent='Secure login service could not be reached.';}
}
initPakThaiAuth();
