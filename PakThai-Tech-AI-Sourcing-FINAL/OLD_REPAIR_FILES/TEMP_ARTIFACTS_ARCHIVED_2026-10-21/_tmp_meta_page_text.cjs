const tabs=await (await fetch('http://127.0.0.1:9222/json/list')).json();
const targets=tabs.filter(t=>t.type==='page'&&(t.url.includes('developers.facebook.com/apps/2689904551425462/settings/basic')||t.url.includes('business.facebook.com/latest/settings/whatsapp_account')));
for(const tab of targets){
 const ws=new WebSocket(tab.webSocketDebuggerUrl); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
 const result=await new Promise(resolve=>{const id=1;ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===id)resolve(m)};ws.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression:'document.body.innerText.slice(0,9000)',returnByValue:true}}));setTimeout(()=>resolve({error:'timeout'}),8000)});
 console.log('--- '+tab.title+' ---\n'+(result.result?.result?.value||JSON.stringify(result).slice(0,1000)));
 ws.close();
}