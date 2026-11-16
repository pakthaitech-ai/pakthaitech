const tabs = await (await fetch('http://127.0.0.1:9222/json')).json();
const t = tabs.find(x => x.url.includes('console.cloud.google.com/welcome') && x.type === 'page');
if (!t) { console.log('NO_GCLOUD_TAB'); process.exit(0); }
const ws = new WebSocket(t.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{ ws.onopen=resolve; ws.onerror=reject; });
let id=0; const pending=new Map(); ws.onmessage=e=>{ try { const m=JSON.parse(e.data); if(m.id && pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);} } catch {} };
const send=(method,params={})=>new Promise(resolve=>{const n=++id;pending.set(n,resolve);ws.send(JSON.stringify({id:n,method,params}));setTimeout(()=>{if(pending.has(n)){pending.delete(n);resolve({timeout:true});}},1800);});
const r=await send('Runtime.evaluate',{expression:"({title:document.title,url:location.href,text:(document.body?.innerText||'').slice(-5000),buttons:[...document.querySelectorAll('button')].map(b=>({text:(b.innerText||b.getAttribute('aria-label')||'').trim(),aria:b.getAttribute('aria-label')})).filter(b=>/shell|terminal|activate|launch/i.test(b.text+' '+b.aria)).slice(0,20)})",returnByValue:true});
console.log(JSON.stringify(r.result?.result?.value||r,null,2)); ws.close();
