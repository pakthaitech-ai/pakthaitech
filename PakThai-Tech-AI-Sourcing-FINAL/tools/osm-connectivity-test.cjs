async function main(){
 const q='[out:json][timeout:10];node["shop"]["name"](around:1000,31.418,73.079);out tags 3;';
 for(const endpoint of ["https://overpass.nchc.org.tw/api/interpreter","https://overpass-api.de/api/interpreter","https://overpass.private.coffee/api/interpreter"]){
  try { const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8","User-Agent":"PakThaiTechBuyerDiscovery/1.0"},body:"data="+encodeURIComponent(q)});const t=await r.text();console.log(endpoint,r.status,t.slice(0,70).replace(/\s+/g," "));if(r.ok){const d=JSON.parse(t);console.log("ELEMENTS",d.elements?.length||0);break;} } catch(e){console.log(endpoint,e.message);}
 }
}
main();
