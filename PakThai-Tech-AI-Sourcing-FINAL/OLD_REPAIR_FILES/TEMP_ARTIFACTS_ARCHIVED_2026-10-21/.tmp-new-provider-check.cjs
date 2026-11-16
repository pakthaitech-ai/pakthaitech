const WebSocket = require('ws');
(async()=>{
 const tabs=await (await fetch('http://127.0.0.1:9222/json')).json();
 const tab=tabs.find(x=>x.type==='page'&&x.url==='https://pakthai-ai-sourcing.pakthaitech.workers.dev/');
 if(!tab) throw new Error('Worker dashboard tab not found');
 const ws=new WebSocket(tab.webSocketDebuggerUrl); await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});
 let next=0; const pending=new Map(); ws.on('message',raw=>{try{const m=JSON.parse(String(raw));if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}}catch{}});
 const send=(method,params={})=>new Promise(resolve=>{const id=++next;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}))});
 await send('Runtime.enable');
 const expression=`(async()=>{const out={url:location.href,loggedIn:!!document.querySelector('#dashboard'),providerText:(document.body.innerText.match(/(Gmail|Resend|provider)[^\\n]{0,90}/ig)||[]).slice(0,8)}; for(const p of ['/api/gmail/status','/api/notifications']){try{const r=await fetch(p);const j=await r.json();out[p]={http:r.status,ok:j.ok??null};if(p.includes('gmail')){out[p].provider=j.outbound_email_provider||j.provider||null;out[p].connected=j.connected??j.authorized??null;out[p].actual_sending_ready=j.actual_sending_ready??null;out[p].error=j.error||null;}else{const a=j.notifications||[];out[p].count=a.length;out[p].channels=[...new Set(a.map(x=>x.channel))];out[p].statuses=[...new Set(a.map(x=>x.status))];}}catch(e){out[p]={error:String(e).slice(0,100)}}}return out})()`;
 const result=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 console.log(JSON.stringify(result.result?.result?.value||{cdp_error:result.error||result.result?.exceptionDetails?.text||'No result'},null,2)); ws.close();
})().catch(e=>{console.error(e.message);process.exitCode=1});
