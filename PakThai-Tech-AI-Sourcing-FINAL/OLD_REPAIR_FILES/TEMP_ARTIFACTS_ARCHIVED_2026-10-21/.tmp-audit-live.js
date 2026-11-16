const http = require('http');
(async()=>{
 const targets=await new Promise((resolve,reject)=>http.get('http://127.0.0.1:9222/json',r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>resolve(JSON.parse(d)));}).on('error',reject));
 const t=targets.find(x=>x.type==='page'&&x.url==='https://pakthai-ai-sourcing.pakthaitech.workers.dev/');
 if(!t) throw Error('Authenticated dashboard tab not found');
 if(typeof WebSocket==='undefined') throw Error('Node global WebSocket unavailable');
 const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 let seq=0; const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);p(m)}};
 function cdp(method,params={}){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,m=>m.error?reject(Error(m.error.message)):resolve(m.result));ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout'))}},90000)})}
 async function ev(expression){const r=await cdp('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text||'eval failed');return r.result?.value}
 const result=await ev('(async()=>{const paths=[["partners","/api/sourcing-partners"],["marketStatus","/api/market-prospects/status"],["buyerStatus","/api/buyer-prospects/status"],["buyerRows","/api/buyer-prospects"],["health","/api/health"]];const out={};for(const [k,p] of paths){try{const r=await fetch(p,{credentials:"same-origin",cache:"no-store"});let j=await r.json();if(k==="partners"&&j.partners)j={ok:j.ok,partners:j.partners.map(x=>({id:x.id,name:x.name,country_code:x.country_code,country_name:x.country_name,contact_present:!!x.contact,email_present:!!x.email,lead_types:x.lead_types,active:x.active}))};if(k==="buyerRows")j={ok:j.ok,count:(j.prospects||[]).length,byCity:(j.prospects||[]).reduce((a,x)=>(a[x.discovery_city||"unknown"]=(a[x.discovery_city||"unknown"]||0)+1,a),{}),sample:(j.prospects||[]).slice(0,8).map(x=>({name:x.business_name,city:x.discovery_city,website:!!x.website,phone:!!x.phone,status:x.review_status}))};out[k]={status:r.status,data:j}}catch(e){out[k]={error:String(e)}}}return out})()');
 console.log(JSON.stringify(result,null,2)); ws.close();
})().catch(e=>{console.error('AUDIT_ERROR',e.message);process.exitCode=1});