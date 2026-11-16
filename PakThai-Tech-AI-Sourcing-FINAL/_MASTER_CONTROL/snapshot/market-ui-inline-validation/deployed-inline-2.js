
async function openDiscoveryCenter(){
  document.querySelectorAll('.panel').forEach(function(x){x.style.display='none';});
  var el=document.getElementById('discoverycenter'); if(el) el.style.display='block';
  await loadBuyerDiscoveryStatus(); await loadBuyerProspects(); await loadSellerProspects(); await loadMarketDeals(); await refreshMarketDealProspects();
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
  try{var r=await api('/api/seller-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error(r.error||'Seller discovery failed');box.textContent='Thailand search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. No messages were sent.';await loadMarketProspects('Thailand');}
  catch(e){box.textContent='Thailand seller search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function runKoreaSellerDiscovery(){
  var btn=document.getElementById('koreaSellerDiscoveryRunBtn'),box=document.getElementById('koreaSellerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching free public listings near Pyeongtaek. Leads are unverified.';
  try{var r=await api('/api/korea-seller-prospects/discover',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});if(!r.ok)throw new Error(r.error||'Korea discovery failed');box.textContent=r.skipped?r.reason:'Korea search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. No messages were sent.';await loadMarketProspects('South Korea');}
  catch(e){box.textContent='Korea seller search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function runMarketBuyerDiscovery(country){
  var slug=country==='Thailand'?'thai':'korea',btn=document.getElementById(slug+'BuyerDiscoveryRunBtn'),box=document.getElementById(slug+'BuyerDiscoveryResult');
  btn.disabled=true;box.textContent='Searching free public business listings. No outreach will be sent.';
  try{var r=await api('/api/market-prospects/discover-buyers',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({country:country})});if(!r.ok)throw new Error(r.error||'Buyer search failed');box.textContent=r.skipped?r.reason:country+' buyer search complete. Results: '+(r.results_seen||0)+'; saved/refreshed: '+(r.saved_or_refreshed||0)+'. Unverified leads only.';await loadMarketProspects(country);}
  catch(e){box.textContent=country+' buyer search failed: '+(e.message||String(e));}
  finally{btn.disabled=false;}
}
async function refreshMarketDealProspects(){
  var country=document.getElementById('marketDealCountry')?.value||'Thailand',direction=document.getElementById('marketDealDirection')?.value||'sell_to_market',type=direction==='sell_to_market'?'buyer':'seller',box=document.getElementById('marketDealProspect');
  if(!box)return;
  try{var r=await api('/api/external-prospects?type='+type+'&country='+encodeURIComponent(country));var qualified=(r.prospects||[]).filter(function(x){return x.review_status==='qualified';});box.innerHTML=qualified.length?qualified.map(function(x){return '<option value="'+Number(x.id)+'">'+esc(x.title)+' — '+esc(country)+'</option>';}).join(''):'<option value="">No qualified '+type+' leads yet — review a prospect above first</option>';}
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
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.name)+'</b> â€” '+esc(x.city||'Pakistan')+' â€” '+esc(x.phone||x.whatsapp||'')+'</div>';
          }).join('')
        : '<p>No Pakistan buyers yet.</p>';
    }

    var r=await api('/api/buyer-requirements');
    var req=r.requirements||[];
    var rl=document.getElementById('requirementList');
    if(rl){
      rl.innerHTML=req.length
        ? req.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.buyer_name||'Buyer')+'</b> â€” '+esc(x.product_keyword||'')+' â€” Qty '+x.quantity+' â€” Budget PKR '+fmt(x.max_budget_pkr||0)+'</div>';
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
 const btn=document.getElementById('whatsappTestBtn');
 const out=document.getElementById('whatsappTestResult');
 if(!btn||!out)return;
 const auth=document.getElementById('authStatus');
 if(!auth||!auth.textContent.includes('Owner')){out.textContent='Blocked: sign in as Owner first.';return;}
 if(!confirm('Send exactly one Urdu WhatsApp test message to M. Nadeem at +82 10-6887-9265?'))return;
 btn.disabled=true;out.textContent='Sending test message…';
 try{
  const r=await fetch('/api/notifications/whatsapp',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({phone:'+821068879265',message:'السلام علیکم ندیم صاحب! میں PakThai AI Sourcing کا AI اسسٹنٹ ہوں۔ آئندہ میں PakThai AI Sourcing کی جانب سے آپ سے رابطہ کروں گا۔ یہ ایک ٹیسٹ پیغام ہے۔ براہِ کرم موصول ہونے کی تصدیق کر دیں۔'})});
  const j=await r.json().catch(()=>({error:'Invalid server response'}));
  if(!r.ok||j.error){out.textContent='FAILED: '+(j.error||('HTTP '+r.status));return;}
  if(j.actual_sending==='sent'&&j.whatsapp?.sent){out.textContent='API accepted the message. Message ID: '+(j.whatsapp.message_id||'not provided')+'. Ask Nadeem to confirm receipt on WhatsApp.';}
  else{out.textContent='NOT SENT: '+(j.whatsapp?.error||j.whatsapp?.reason||'Cloud API did not confirm sending')+(j.whatsapp?.error_code?' (code '+j.whatsapp.error_code+')':'')+'.';}
 }catch(e){out.textContent='Request failed: '+String(e.message||e);}
 finally{btn.disabled=false;}
}

async function initPakThaiAuth(){
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
