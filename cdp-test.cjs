const http=require('http');
http.get('http://127.0.0.1:9222/json/list',r=>{let s='';r.on('data',d=>s+=d);r.on('end',()=>{
const t=JSON.parse(s).find(x=>x.type==='page'&&x.url.includes('pakthai-ai-sourcing'));
const ws=new WebSocket(t.webSocketDebuggerUrl);let seq=0;
ws.onopen=()=>{console.log('OPEN');ws.send(JSON.stringify({id:++seq,method:'Runtime.enable'}));setTimeout(()=>{console.log('SEND_EVAL');ws.send(JSON.stringify({id:++seq,method:'Runtime.evaluate',params:{expression:'document.title',returnByValue:true}}));},300);setTimeout(()=>{console.log('STILL_OPEN',ws.readyState);ws.close()},4000)};
ws.onmessage=e=>console.log('FRAME',String(e.data).slice(0,3000));
ws.onerror=e=>console.log('ERROR',String(e.message||e));
ws.onclose=e=>console.log('CLOSE',e.code,e.reason);
});});
