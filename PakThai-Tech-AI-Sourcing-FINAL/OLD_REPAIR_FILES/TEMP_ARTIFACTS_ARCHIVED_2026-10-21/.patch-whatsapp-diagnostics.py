from pathlib import Path
p=Path('src/worker.js')
s=p.read_text(encoding='utf-8')
old="""  }  if (path === '/api/notifications/whatsapp-diagnostics' && method === 'GET') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,paused:true,message:'Automated WhatsApp sending is paused during provider migration. No Meta API request was made.'});
  }"""
new="""  }
  if (path === '/api/notifications/whatsapp-diagnostics' && method === 'GET') {
    const owner = await getSession(request, env);
    if (owner?.role !== 'owner' || !owner?.nonce) return json({ok:false,error:'Owner login required'},401);
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const phoneId=String(env.WHATSAPP_PHONE_NUMBER_ID||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    const checked_at=new Date().toISOString();
    const configured={access_token:Boolean(token),phone_number_id:Boolean(phoneId),waba_id:Boolean(wabaId),app_secret:Boolean(env.WHATSAPP_APP_SECRET),webhook_verify_token:Boolean(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET||env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)};
    if(!token||!phoneId||!wabaId) return json({ok:false,checked_at,configured,phone:{ok:false,error:{message:'Missing WhatsApp Cloud API configuration.'}},accounts_ok:false,accounts_error:{message:'Check WhatsApp Business account ID configuration.'},wabas:[]});
    const getMeta=async(path)=>{try{const r=await fetch('https://graph.facebook.com/'+version+'/'+path,{headers:{Authorization:'Bearer '+token}});let data={};try{data=await r.json()}catch{};if(!r.ok)return {ok:false,error:{message:data?.error?.message||('Meta Graph API HTTP '+r.status),code:data?.error?.code||null,subcode:data?.error?.error_subcode||null}};return {ok:true,data};}catch(e){return {ok:false,error:{message:String(e?.message||e).slice(0,240)}}}};
    const [phone,waba,subs,templates]=await Promise.all([getMeta(encodeURIComponent(phoneId)+'?fields=id,display_phone_number,verified_name,quality_rating,code_verification_status'),getMeta(encodeURIComponent(wabaId)+'?fields=id,name'),getMeta(encodeURIComponent(wabaId)+'/subscribed_apps'),getMeta(encodeURIComponent(wabaId)+'/message_templates?fields=name,status,language,category,components&limit=100')]);
    return json({ok:true,checked_at,configured,phone:{ok:phone.ok,...(phone.ok?phone.data:{error:phone.error})},accounts_ok:waba.ok,accounts_error:waba.ok?null:waba.error,wabas:[{id:waba.ok?waba.data.id:wabaId,name:waba.ok?waba.data.name:null,subscribed_apps_ok:subs.ok,subscribed_apps:subs.ok?(subs.data.data||[]):[],subscription_error:subs.ok?null:subs.error,templates_ok:templates.ok,templates:templates.ok?(templates.data.data||[]):[],templates_error:templates.ok?null:templates.error}]});
  }"""
if old not in s:
    raise SystemExit('Target diagnostic block not found; no changes made.')
p.write_text(s.replace(old,new,1),encoding='utf-8')
print('Re-enabled owner-only read-only Meta diagnostics. Sending and webhook-subscription routes remain disabled.')
