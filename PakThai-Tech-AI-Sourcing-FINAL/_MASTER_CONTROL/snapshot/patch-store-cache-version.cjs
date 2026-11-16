const fs=require('node:fs');
const root='D:/pakthai/PakThai-Store-DEPLOY';
const hp=root+'/index.html'; let h=fs.readFileSync(hp,'utf8');
if(!h.includes('/app.js?v=20261028-store-analytics-1')) throw new Error('index script version not found');
h=h.replace('/app.js?v=20261028-store-analytics-1','/app.js?v=20261028-product-compare-1'); fs.writeFileSync(hp,h,'utf8');
const sp=root+'/sw.js'; let sw=fs.readFileSync(sp,'utf8');
if(!sw.includes('pakthai-store-shell-v2')||!sw.includes('/app.js?v=20261014-audit-fix-1')) throw new Error('service worker cache markers not found');
sw=sw.replace('pakthai-store-shell-v2','pakthai-store-shell-v3').replace('/app.js?v=20261014-audit-fix-1','/app.js?v=20261028-product-compare-1'); fs.writeFileSync(sp,sw,'utf8');
console.log('Updated Store app asset version and service-worker cache version.');
