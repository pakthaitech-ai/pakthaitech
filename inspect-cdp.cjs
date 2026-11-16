const http=require('http'); const WebSocket=globalThis.WebSocket;
http.get('http://127.0.0.1:9222/json/list',r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>{
const t=JSON.parse(s).find(x=>x.type==='page'&&x.url.includes('pakthai-ai-sourcing'));
if(!t){console.log('NO_PAGE');process.exit(2)}
const ws=new WebSocket(t.webSocketDebuggerUrl);
ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:'JSON.stringify({title:document.title,url:location.href,ready:document.readyState,body:(document.body?.innerText||"").slice(0,18000),links:[...document.querySelectorAll("a")].map(a=>({text:(a.innerText||a.getAttribute("aria-label")||"").trim(),href:a.href})).filter(x=>x.text).slice(0,100),buttons:[...document.querySelectorAll("button,[role=tab],nav")].map(a=>({tag:a.tagName,role:a.getAttribute("role"),text:(a.innerText||a.getAttribute("aria-label")||"").trim()})).filter(x=>x.text).slice(0,120)})',returnByValue:true}}));
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){console.log(m.result?.result?.value||JSON.stringify(m));ws.close();}};
ws.onerror=e=>{console.log('WS_ERROR',String(e));process.exit(3)};
});});
