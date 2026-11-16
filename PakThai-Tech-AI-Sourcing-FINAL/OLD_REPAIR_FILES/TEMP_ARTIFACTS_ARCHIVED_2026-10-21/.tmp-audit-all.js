const http=require('http');
(async()=>{
 const tabs=await new Promise((resolve,reject)=>http.get('http://127.0.0.1:9222/json',r=>{let s='';r.on('data',x=>s+=x);r.on('end',()=>resolve(JSON.parse(s)))}).on('error',reject));
 const tab=tabs.find(x=>x.type==='page'&&x.url==='https://pakthai-ai-sourcing.pakthaitech.workers.dev/');
 if(!tab)throw Error('Owner dashboard tab not found');
 const ws=new WebSocket(tab.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
 const expression='(async()=>{const tasks=[{name:"Pakistan buyers Faisalabad",url:"/api/buyer-prospects/discover",body:{cities:["Faisalabad"],searches:["computer hardware retailer"]}},{name:"Thailand sellers",url:"/api/seller-prospects/discover",body:{}},{name:"South Korea buyers",url:"/api/market-prospects/discover-buyers",body:{country:"South Korea"}}];const out=[];for(const t of tasks){try{const r=await fetch(t.url,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(t.body),cache:"no-store"});let data;try{data=await r.json()}catch(e){data={parse_error:String(e)}}out.push({task:t.name,http:r.status,data})}catch(e){out.push({task:t.name,error:String(e)})}}return out})()';
 const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 if(result.exceptionDetails)throw Error(result.exceptionDetails.text);
 console.log(JSON.stringify(result.result.value,null,2));ws.close();
})().catch(e=>{console.error('LIVE_DISCOVERY_AUDIT_ERROR',e.message);process.exitCode=1});