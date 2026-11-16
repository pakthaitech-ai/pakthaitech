const fs=require('fs'); const p='src/worker.js'; let s=fs.readFileSync(p,'utf8');
const marker=String.raw`  }  if (path === '/api/notifications/whatsapp-template-test' && method === 'POST') {`;
const route=String.raw`  }
  if (path === '/api/notifications/whatsapp-template-submit' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    if(body.confirm!==true)return json({ok:false,error:'Explicit Owner confirmation is required to submit the partner-alert template for Meta review.'},400);
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    if(!token||!wabaId)return json({ok:false,error:'WhatsApp access token or WABA ID is missing.'},409);
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    const url='https://graph.facebook.com/'+version+'/'+encodeURIComponent(wabaId)+'/message_templates';
    const name='pakthai_partner_lead_alert';
    try{
      const existingRes=await fetch(url+'?fields=id,name,status,language,category&limit=100',{headers:{Authorization:'Bearer '+token}});
      const existingData=await existingRes.json().catch(()=>({}));
      if(!existingRes.ok)return json({ok:false,error:existingData?.error?.message||('Meta template lookup HTTP '+existingRes.status),meta_error_code:existingData?.error?.code||null},502);
      const existing=(existingData.data||[]).find(t=>t.name===name&&t.language==='en_US');
      if(existing)return json({ok:true,already_exists:true,template:{id:existing.id,name:existing.name,status:existing.status,language:existing.language,category:existing.category},note:'No message was sent.'});
      const template={name,language:'en_US',category:'UTILITY',components:[{type:'BODY',text:'PakThai Tech has a new sourcing request for partner review.\nProduct: {{1}}\nQuantity: {{2}}\nDestination: {{3}}\nRequest reference: {{4}}\nPlease review details with the Owner before making any commitment.',example:{body_text:[['gaming laptop','50 units','Pakistan','PT-12345']]}}]};
      const r=await fetch(url,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(template)});
      const data=await r.json().catch(()=>({}));
      if(!r.ok)return json({ok:false,error:data?.error?.message||('Meta template submission HTTP '+r.status),meta_error_code:data?.error?.code||null,meta_error_subcode:data?.error?.error_subcode||null},502);
      return json({ok:true,submitted:true,template:{id:data.id||null,name,status:data.status||'PENDING',language:'en_US',category:'UTILITY'},note:'Submitted for Meta review only. This does not send a WhatsApp message. Sending remains disabled until Meta approves the template and the phone number is ready.'},201);
    }catch(e){return json({ok:false,error:'Meta template submission failed: '+String(e?.message||e).slice(0,220)},502)}
  }
  if (path === '/api/notifications/whatsapp-template-test' && method === 'POST') {`;
if(!s.includes(marker)) throw new Error('Template-test route marker not found; no changes made.'); s=s.replace(marker,route); fs.writeFileSync(p,s); console.log('Added Owner-confirmed, idempotent partner template submission route. No WhatsApp messages sent.');
