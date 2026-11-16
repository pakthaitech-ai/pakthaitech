const fs=require('fs');const s=fs.readFileSync('src/worker.js','utf8');
for(const [a,b] of [[3029,3075],[4032,4180],[1160,1185],[1240,1275],[1900,1915]]){console.log('\n--- LINES '+a+'-'+b+' ---');console.log(s.split(/\r?\n/).slice(a-1,b).map((x,i)=>(a+i)+': '+x).join('\n'));}
