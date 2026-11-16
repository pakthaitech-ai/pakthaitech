const http=require('http');
console.log('NODE',process.version,'WS',typeof WebSocket);
http.get('http://127.0.0.1:9222/json/list',r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>{
 console.log('HTTP',r.statusCode,s.slice(0,500));
 const t=JSON.parse(s).find(x=>x.type==='page'&&x.url.includes('pakthai-ai-sourcing'));
 if(!t){console.log('NO_TARGET');return}
 console.log('TARGET',t.title,t.webSocketDebuggerUrl);
 const ws=new WebSocket(t.webSocketDebuggerUrl);
 const timer=setTimeout(()=>{console.log('WS_TIMEOUT');try{ws.close()}catch{}},5000);
 ws.addEventListener('open',()=>{console.log('WS_OPEN');ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'JSON.stringify({title:document.title,url:location.href,body:(document.body.innerText||"").slice(0,9000),buttons:[...document.querySelectorAll("button,[role=tab]")].map(x=>(x.innerText||x.getAttribute("aria-label")||"").trim()).filter(Boolean)})',returnByValue:true}}))});
 ws.addEventListener('message',e=>{console.log('MESSAGE',String(e.data).slice(0,12000));clearTimeout(timer);ws.close()});
 ws.addEventListener('error',e=>console.log('WS_ERROR',String(e.message||e)));
});}).on('error',e=>console.log('HTTP_ERROR',e.message));
