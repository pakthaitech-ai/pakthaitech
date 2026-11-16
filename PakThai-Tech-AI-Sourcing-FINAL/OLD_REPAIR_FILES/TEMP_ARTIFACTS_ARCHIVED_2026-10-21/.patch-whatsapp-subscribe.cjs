const fs=require('fs'); const p='src/worker.js'; let s=fs.readFileSync(p,'utf8');
const old=String.raw`  if (path === '/api/notifications/whatsapp-webhook-subscribe' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    return json({ok:false,paused:true,error:'Automated Meta WhatsApp setup is paused per Owner provider-migration decision. No Meta API request was made.'},410);
  }`;
const replacement=String.raw`  if (path === '/api/notifications/whatsapp-webhook-subscribe' && method === 'POST') {
    const owner=await getSession(request,env);
    if(owner?.role!=='owner'||!owner?.nonce)return json({ok:false,error:'Owner login required'},401);
    const token=String(env.WHATSAPP_ACCESS_TOKEN||'').trim();
    const wabaId=String(env.WHATSAPP_WABA_ID||'').trim();
    const verifyToken=String(env.WHATSAPP_WEBHOOK_VERIFY_TOKEN_SECRET||env.WHATSAPP_WEBHOOK_VERIFY_TOKEN||'').trim();
    if(!token||!wabaId||!env.WHATSAPP_APP_SECRET||!verifyToken) return json({ok:false,error:'Missing access token, WABA ID, app secret, or webhook verify token. No Meta API request made.'},409);
    const version=String(env.WHATSAPP_GRAPH_API_VERSION||'v26.0').trim();
    const endpoint='https://graph.facebook.com/'+version+'/'+encodeURIComponent(wabaId)+'/subscribed_apps';
    const call=async(method)=>{try{const r=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});let data={};try{data=await r.json()}catch{};return {ok:r.ok,data,error:r.ok?null:{message:data?.error?.message||('Meta Graph API HTTP '+r.status),code:data?.error?.code||null,subcode:data?.error?.error_subcode||null}}}catch(e){return {ok:false,data:{},error:{message:String(e?.message||e).slice(0,240)}}}};
    const before=await call('GET');
    if(!before.ok)return json({ok:false,error:'Could not inspect existing Meta subscription: '+before.error.message,meta_error_code:before.error.code||null},502);
    const existing=Array.isArray(before.data?.data)?before.data.data:[];
    let action='already_subscribed';
    if(!existing.length){const subscribed=await call('POST');if(!subscribed.ok)return json({ok:false,error:'Meta rejected app subscription: '+subscribed.error.message,meta_error_code:subscribed.error.code||null},502);action='subscription_requested';}
    const after=await call('GET');
    if(!after.ok)return json({ok:false,action,verified:false,error:'Subscription request completed but verification lookup failed: '+after.error.message},502);
    const apps=Array.isArray(after.data?.data)?after.data.data:[];
    return json({ok:apps.length>0,action,verified:apps.length>0,subscribed_apps_count:apps.length,callback_url:new URL(request.url).origin+'/webhooks/whatsapp',note:'This links the WhatsApp Business Account to the Meta app. Confirm the callback URL and messages webhook field in the Meta App Dashboard separately; no message was sent.'},apps.length?200:502);
  }`;
if(!s.includes(old)) throw new Error('Subscribe route not found exactly; no changes made.'); s=s.replace(old,replacement); fs.writeFileSync(p,s); console.log('Patched owner-only idempotent WABA subscription route. It sends no messages.');
