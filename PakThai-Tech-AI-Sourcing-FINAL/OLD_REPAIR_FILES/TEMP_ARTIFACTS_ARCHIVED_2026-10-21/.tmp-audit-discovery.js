const http=require('http');
(async()=>{
const ts=await new Promise((ok,no)=>http.get('http://127.0.0.1:9222/json',r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>ok(JSON.parse(d)))}).on('error',no));
const t=ts.find(x=>x.type==='page'&&x.url==='https://pakthai-ai-sourcing.pakthaitech.workers.dev/');
const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise((ok,no)=>{ws.onopen=ok;ws.onerror=no});
let n=0;const p=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&p.has(m.id)){const f=p.get(m.id);p.delete(m.id);f(m)}};
const call=(method,params={})=>new Promise((ok,no)=>{const id=++n;p.set(id,m=>m.error?no(Error(m.error.message)):ok(m.result));ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(p.has(id)){p.delete(id);no(Error('timeout'))}},150000)});
const result=await call('Runtime.evaluate',{expression:'(async()=>{const tasks=[{name:"Pakistan buyers Faisalabad",url:"/api/buyer-prospects/discover",body:{cities:["Faisalabad"],searches:["computer hardware retailer"]}},{name:"Korea buyers",url:"/api/market-prospects/discover-buyers",body:{country:"South Korea"}}];const out=[];for(const x of tasks){try{const r=await fetch(x.url,{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(x.body),cache:"no-store"});let data;try{data=await r.json()}catch(e){data={parse_error:String(e)}};out.push({task:x.name,http:r.status,data})}catch(e){out.push({task:x.name,error:String(e)})}}return out})()',awaitPromise:true,returnByValue:true});
if(result.exceptionDetails)throw Error(result.exceptionDetails.text);console.log(JSON.stringify(result.result.value,null,2));ws.close();
})().catch(e=>{console.error('DISCOVERY_ERROR',e.message);process.exitCode=1});