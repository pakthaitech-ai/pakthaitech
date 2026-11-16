const fs=require('fs'); const p='src/worker.js'; let s=fs.readFileSync(p,'utf8');
const old=String.raw`    const call=async(method)=>{try{const r=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:'{}'}:{})});let data={};try{data=await r.json()}catch{};return {ok:r.ok,data,error:r.ok?null:{message:data?.error?.message||('Meta Graph API HTTP '+r.status),code:data?.error?.code||null,subcode:data?.error?.error_subcode||null}}}catch(e){return {ok:false,data:{},error:{message:String(e?.message||e).slice(0,240)}}}};
    const before=await call('GET');
    if(!before.ok)return json({ok:false,error:'Could not inspect existing Meta subscription: '+before.error.message,meta_error_code:before.error.code||null},502);
    const existing=Array.isArray(before.data?.data)?before.data.data:[];
    let action='already_subscribed';
    if(!existing.length){const subscribed=await call('POST');if(!subscribed.ok)return json({ok:false,error:'Meta rejected app subscription: '+subscribed.error.message,meta_error_code:subscribed.error.code||null},502);action='subscription_requested';}
    const after=await call('GET');
    if(!after.ok)return json({ok:false,action,verified:false,error:'Subscription request completed but verification lookup failed: '+after.error.message},502);
    const apps=Array.isArray(after.data?.data)?after.data.data:[];
    return json({ok:apps.length>0,action,verified:apps.length>0,subscribed_apps_count:apps.length,callback_url:new URL(request.url).origin+'/webhooks/whatsapp',note:'This links the WhatsApp Business Account to the Meta app. Confirm the callback URL and messages webhook field in the Meta App Dashboard separately; no message was sent.'},apps.length?200:502);`;
const replacement=String.raw`    const call=async(method,payload=null)=>{try{const r=await fetch(endpoint,{method,headers:{Authorization:'Bearer '+token,...(method==='POST'?{'Content-Type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify(payload||{})}:{})});let data={};try{data=await r.json()}catch{};return {ok:r.ok,data,error:r.ok?null:{message:data?.error?.message||('Meta Graph API HTTP '+r.status),code:data?.error?.code||null,subcode:data?.error?.error_subcode||null}}}catch(e){return {ok:false,data:{},error:{message:String(e?.message||e).slice(0,240)}}}};
    const before=await call('GET');
    if(!before.ok)return json({ok:false,error:'Could not inspect existing Meta subscription: '+before.error.message,meta_error_code:before.error.code||null},502);
    const existing=Array.isArray(before.data?.data)?before.data.data:[];
    let action='already_subscribed';
    if(!existing.length){const subscribed=await call('POST');if(!subscribed.ok)return json({ok:false,error:'Meta rejected app subscription: '+subscribed.error.message,meta_error_code:subscribed.error.code||null},502);action='subscription_requested';}
    const callbackUrl=new URL(request.url).origin+'/webhooks/whatsapp';
    const override=await call('POST',{override_callback_uri:callbackUrl,verify_token:verifyToken});
    if(!override.ok)return json({ok:false,action,waba_subscription_verified:true,callback_url:callbackUrl,callback_verified:false,error:'WABA app subscription is active, but Meta did not accept/verify the callback override: '+override.error.message,meta_error_code:override.error.code||null,note:'No message was sent.'},502);
    const after=await call('GET');
    if(!after.ok)return json({ok:false,action,waba_subscription_verified:true,callback_url:callbackUrl,callback_verified:false,error:'Meta accepted callback setup but final lookup failed: '+after.error.message},502);
    const apps=Array.isArray(after.data?.data)?after.data.data:[];
    const app=apps.find(a=>String(a.whatsapp_business_api_data?.id||'')===String((existing[0]?.whatsapp_business_api_data?.id)||apps[0]?.whatsapp_business_api_data?.id||''))||apps[0];
    const callbackVerified=String(app?.override_callback_uri||'')===callbackUrl;
    return json({ok:apps.length>0&&callbackVerified,action,waba_subscription_verified:apps.length>0,callback_url:callbackUrl,callback_verified:callbackVerified,subscribed_apps_count:apps.length,note:callbackVerified?'WABA subscription and callback override verified. No message was sent.':'WABA is subscribed, but the expected callback override is not visible in Meta readback.'},apps.length&&callbackVerified?200:502);`;
if(!s.includes(old)) throw new Error('Expected subscription function body not found; no changes made.'); s=s.replace(old,replacement); fs.writeFileSync(p,s); console.log('Added owner-only WABA callback override with read-back verification. No messages sent.');
