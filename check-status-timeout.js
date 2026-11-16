const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/C03B0A8FC9ADDCE697362F1287DF8212');
ws.onopen=()=>ws.send(JSON.stringify({id:101,method:'Runtime.evaluate',params:{expression:"(async()=>{const x=await Promise.race([fetch('/api/outreach/status',{credentials:'same-origin',cache:'no-store'}).then(async r=>({http:r.status,data:await r.json()})),new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),8000))]);return JSON.stringify(x)})()",awaitPromise:true,returnByValue:true}}));
ws.onmessage=e=>{console.log(e.data);ws.close()};
