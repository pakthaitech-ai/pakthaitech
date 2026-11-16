export async function onRequestGet() {
 const r=await fetch('https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/products');
 if(!r.ok)return new Response(JSON.stringify({products:[]}),{status:502,headers:{'content-type':'application/json'}});
 const a=await r.json(); const rows=Array.isArray(a)?a:(a.products||[]);
 const products=rows.map(p=>({id:String(p.id),title:p.title||'Product',product_type:p.category||'Other',vendor:'PakThai Tech',price:Number(p.price_pkr||0),available:Boolean(p.available),variants:[{price:Number(p.price_pkr||0),available:Boolean(p.available)}],images:p.image_url?[{src:String(p.image_url).startsWith('//')?'https:'+p.image_url:p.image_url}]:[],featured_image:p.image_url?(String(p.image_url).startsWith('//')?'https:'+p.image_url:p.image_url):'',body_html:'PakThai Tech live catalog product.',tags:[p.category||'Other']}));
 return new Response(JSON.stringify({products}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public,max-age=60'}});
}
