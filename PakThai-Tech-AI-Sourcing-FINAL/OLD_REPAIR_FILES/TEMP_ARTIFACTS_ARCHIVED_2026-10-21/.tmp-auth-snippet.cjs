const fs=require('fs');const s=fs.readFileSync('src/worker.js','utf8');const lines=s.split(/\r?\n/);for(let i=1860;i<1912;i++)console.log((i+1)+': '+lines[i]);
