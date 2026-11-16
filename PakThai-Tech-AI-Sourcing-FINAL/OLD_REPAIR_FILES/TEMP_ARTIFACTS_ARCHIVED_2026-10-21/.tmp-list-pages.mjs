const tabs=await (await fetch('http://127.0.0.1:9222/json')).json();console.log(JSON.stringify(tabs.filter(t=>t.type==='page').map(t=>({title:t.title,url:t.url,id:t.id})),null,2));
