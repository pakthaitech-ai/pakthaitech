
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
