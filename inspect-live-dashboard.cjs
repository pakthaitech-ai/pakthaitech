const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const url = 'https://pakthai-ai-sourcing.pakthaitech.workers.dev/';
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = 'D:\\pakthai\\edge-cdp-profile';
try { spawn(edge, ['--remote-debugging-port=9222', '--user-data-dir='+profile, '--no-first-run', '--no-default-browser-check', url], {detached:true,stdio:'ignore'}).unref(); } catch(e) {}
function get(u){return new Promise((resolve,reject)=>http.get(u,r=>{let d='';r.on('data',x=>d+=x);r.on('end',()=>resolve({status:r.statusCode,body:d}));}).on('error',reject));}
(async()=>{for(let i=0;i<30;i++){try{let x=await get('http://127.0.0.1:9222/json'); if(x.status===200){fs.writeFileSync('D:\\pakthai\\cdp-tabs.json',x.body); console.log(x.body); process.exit(0)}}catch(e){} await new Promise(r=>setTimeout(r,500));}console.log('CDP_NOT_AVAILABLE');process.exit(1)})()
