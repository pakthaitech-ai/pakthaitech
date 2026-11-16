const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/C03B0A8FC9ADDCE697362F1287DF8212');
ws.onopen=()=>ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:"JSON.stringify({url:location.href,title:document.title,body:document.body.innerText.slice(0,1800),buttons:[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean).slice(0,60)})",returnByValue:true}}));
ws.onmessage=e=>{console.log(e.data);ws.close()};
