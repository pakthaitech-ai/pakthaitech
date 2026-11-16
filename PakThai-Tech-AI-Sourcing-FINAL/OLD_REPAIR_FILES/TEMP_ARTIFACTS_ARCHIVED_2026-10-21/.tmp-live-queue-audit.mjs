const tabs=await(await fetch('http://127.0.0.1:9222/json')).json();
const t=tabs.find(x=>x.type==='page'&&x.url==='https://pakthai-ai-sourcing.pakthaitech.workers.dev/');
const ws=new WebSocket(t.webSocketDebuggerUrl);
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){console.log(JSON.stringify(m.result?.result?.value||m.result?.exceptionDetails||m));ws.close()}};
ws.onopen=()=>{
 const expression = `(async()=>{
 const out={};
 for(const p of ['/api/notifications','/api/outreach/status','/api/gmail/status']){
  try {const r=await fetch(p,{credentials:'same-origin'});const j=await r.json();
   if(p==='/api/notifications') out.queue={http:r.status,items:(j.notifications||[]).map(n=>({id:n.id,channel:n.channel,status:n.status,recipient:n.recipient,subject:n.subject,created_at:n.created_at,related_type:n.related_type,related_id:n.related_id})).filter(n=>['prepared','approved','pending'].includes(n.status))};
   else if(p==='/api/outreach/status') out.outreach={http:r.status,ok:j.ok,campaigns:(j.campaigns||[]).map(c=>({id:c.id,company_name:c.company_name,recipient:c.recipient,status:c.status,market:c.market,touch_count:c.touch_count,next_action_at:c.next_action_at,last_error:c.last_error})),last_run:j.last_run};
   else out.gmail={http:r.status,ok:j.ok,authorized:j.authorized,actual_sending_ready:j.actual_sending_ready,provider:j.outbound_email_provider};
  }catch(e){out[p]={error:String(e)}}
 }
 return out;
})()`;
 ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));
};
