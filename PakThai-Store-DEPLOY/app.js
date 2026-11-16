
const SOURCE='https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/catalog';
const ANALYTICS='https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/store-analytics';
function trackStoreEvent(event){try{if(!['page_view','product_search','category_filter','product_view','inquiry_start','inquiry_submit','inquiry_failure','chat_open','builder_quote'].includes(event))return;fetch(ANALYTICS,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event}),keepalive:true,mode:'cors'}).catch(()=>{});}catch(_){}}
const state={products:[],category:'All',compareIds:[]};
let activeOrderRequestKey=null,activeOrderRequestFingerprint=null,orderSubmissionInFlight=false;
const money=n=>'PKR '+Number(n||0).toLocaleString('en-PK');
function brandSafe(s){return String(s||'').replace(/sakoonsay\s+gaming\s+store/gi,'PakThai Tech').replace(/sakoonsay\.com/gi,'PakThai Tech').replace(/sakoonsay/gi,'PakThai Tech')} function cleanHtml(s){const d=document.createElement('div');d.innerHTML=s||'';return brandSafe(d.textContent||'')}
function imgOf(p){return p.images?.[0]?.src || p.featured_image || ''}
document.addEventListener('error',function(e){const img=e.target;if(!(img instanceof HTMLImageElement)||!img.closest('#grid,#modalBody,#categoryTiles'))return;img.style.display='none';const box=document.createElement('div');box.className='image-fallback';box.textContent='PakThai Tech — image temporarily unavailable';img.parentElement?.appendChild(box);},{capture:true});
function priceOf(p){const v=p.variants?.[0]?.price ?? p.price ?? 0; return Number(v)}
function catOf(p){const t=(p.product_type||'').toLowerCase(); const tags=(p.tags||[]).join(' ').toLowerCase(); const x=t+' '+tags+' '+(p.title||'').toLowerCase(); if(/gaming pc|gaming computer|gaming desktop|budget gaming/.test(x))return'Gaming PC';if(/gpu|graphics|rtx|gtx|radeon/.test(x))return'GPU';if(/processor|cpu|ryzen|intel core/.test(x))return'CPU';if(/motherboard|b450|b550|h61|z790/.test(x))return'Motherboard';if(/ram|memory|ddr3|ddr4|ddr5/.test(x))return'RAM';if(/nvme|ssd|storage|hard drive|hdd/.test(x))return'Storage';if(/case|casing/.test(x))return'Case';if(/psu|power supply/.test(x))return'PSU';if(/cooler|cooling|fan/.test(x))return'Cooling';if(/laptop/.test(x))return'Laptop';if(/desktop/.test(x))return'Gaming PC';return p.product_type||'Other'}
function availableOf(p){return Boolean(p.available || (p.variants||[]).some(v=>v.available));}
function stockLabel(p){return availableOf(p)?'In Stock':'Out of Stock'}
function card(p){const im=imgOf(p),price=priceOf(p),inStock=availableOf(p),id=String(p.id),chosen=state.compareIds.includes(id);return `<article class="card rounded-2xl overflow-hidden flex flex-col"><button type="button" data-product-id="${escapeHtml(id)}" class="text-left flex flex-col flex-1 group" aria-label="View ${escapeAttr(brandSafe(p.title))}"><div class="aspect-[4/3] bg-[#f4f8fd] grid place-items-center relative overflow-hidden">${im?`<img src="${escapeHtml(im)}" alt="${escapeHtml(brandSafe(p.title))}" class="w-full h-full object-contain p-3 group-hover:scale-[1.02] transition-transform" loading="lazy">`:'<div class="muted">No image</div>'}<span class="absolute top-3 right-3 ${inStock?'bg-emerald-500/90':'bg-slate-700/90'} text-slate-950 text-[10px] font-black px-2 py-1 rounded">${stockLabel(p)}</span></div><div class="p-4 flex flex-col flex-1"><div class="text-xs gold font-bold">${escapeHtml(catOf(p))}</div><h3 class="font-bold mt-2 line-clamp-2 group-hover:text-amber-400">${escapeHtml(brandSafe(p.title))}</h3><div class="text-xl font-black mt-3">${money(price)}</div><div class="mt-auto pt-4 text-sm font-bold gold">View details →</div></div></button><div class="px-4 pb-4 space-y-2"><button type="button" data-quote-product-id="${escapeHtml(id)}" class="btn rounded-lg px-3 py-2 text-sm w-full">Order / Quote</button><button type="button" data-compare-product-id="${escapeHtml(id)}" class="pill rounded-lg px-3 py-2 text-sm w-full">${chosen?'Remove from comparison':'Compare'}</button></div></article>`}
function escapeHtml(s){return String(s||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function escapeAttr(s){return escapeHtml(s).replace(/`/g,'')}
function relatedProducts(p){const c=catOf(p), words=(p.title||'').toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2); return state.products.filter(x=>String(x.id)!==String(p.id)&&catOf(x)===c).map(x=>{let score=0; const xt=(x.title||'').toLowerCase(); words.forEach(w=>{if(xt.includes(w))score+=1}); return {x,score}}).sort((a,b)=>b.score-a.score||String(a.x.title).localeCompare(String(b.x.title))).map(o=>o.x)}
const CRISP_DIRECT_CHAT = "https://go.crisp.chat/chat/embed/?website_id=5787d483-b0e3-4627-b50d-5e6c9ae5b86b&locale=en";
const SUPPORT_API = "https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/support/chat";
const supportHistory = [];
function showChatMode(mode){
  const ai=mode==='ai';
  document.getElementById('aiChatPane')?.classList.toggle('hidden',!ai);
  document.getElementById('crispPane')?.classList.toggle('hidden',ai);
  document.getElementById('aiChatTab')?.classList.toggle('btn',ai);
  document.getElementById('aiChatTab')?.classList.toggle('pill',!ai);
  document.getElementById('crispChatTab')?.classList.toggle('btn',!ai);
  document.getElementById('crispChatTab')?.classList.toggle('pill',ai);
  if(!ai){
    const frame=document.getElementById('crispFrame');
    if(frame&&!frame.src)frame.src=CRISP_DIRECT_CHAT;
  }
}
function openChat(){
  trackStoreEvent('chat_open');
  const modal=document.getElementById('crispModal');
  if(!modal)return;
  showChatMode('ai');
  modal.classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
  document.getElementById('supportChatInput')?.focus();
}
function closeChat(){
  const modal=document.getElementById('crispModal');
  if(!modal)return;
  modal.classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}
function addSupportMessage(role,content){
  const wrap=document.getElementById('supportChatMessages');
  if(!wrap)return;
  const bubble=document.createElement('div');
  bubble.className=(role==='user'?'ml-auto bg-amber-500/15 border border-amber-400/30':'mr-auto bg-slate-800')+' max-w-[92%] rounded-2xl p-3 text-sm whitespace-pre-wrap break-words';
  bubble.textContent=content;
  wrap.appendChild(bubble);
  wrap.scrollTop=wrap.scrollHeight;
}
document.getElementById('supportChatForm')?.addEventListener('submit',async e=>{
  e.preventDefault();
  const input=document.getElementById('supportChatInput');
  const send=document.getElementById('supportChatSend');
  const message=String(input?.value||'').trim();
  if(message.length<2)return;
  input.value='';
  addSupportMessage('user',message);
  supportHistory.push({role:'user',content:message});
  send.disabled=true;send.textContent='…';
  try{
    const response=await fetch(SUPPORT_API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message,history:supportHistory.slice(0,-1).slice(-6),source_country_code:document.getElementById('supportSourceCountry')?.value||''})});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'Support is temporarily unavailable.');
    const reply=String(data.reply||'Please contact our team for help.');
    addSupportMessage('assistant',reply);
    supportHistory.push({role:'assistant',content:reply});
    if(supportHistory.length>8)supportHistory.splice(0,supportHistory.length-8);
  }catch(error){
    addSupportMessage('assistant',String(error.message||'Support is temporarily unavailable. Please retry or choose Prepare Order / Quote Request; no request has been submitted.'));
  }finally{
    send.disabled=false;send.textContent='Send';input.focus();
  }
});
function openProduct(id){const p=state.products.find(x=>String(x.id)===String(id));if(!p)return;trackStoreEvent('product_view');const im=imgOf(p), price=priceOf(p), inStock=availableOf(p);const desc=cleanHtml(p.body_html||p.description||'Product details available on request.');const tags=Array.isArray(p.tags)?p.tags:[];document.getElementById('modalBody').innerHTML=`<div class="grid md:grid-cols-2 gap-7"><div><div class="aspect-square bg-[#f4f8fd] rounded-2xl grid place-items-center overflow-hidden">${im?`<img src="${escapeHtml(im)}" alt="${escapeHtml(p.title)}" class="w-full h-full object-contain p-4">`:'<div class="muted">No image</div>'}</div></div><div><div class="text-xs gold font-bold uppercase tracking-wider">${escapeHtml(catOf(p))}</div><h2 id="modalTitle" class="text-2xl md:text-3xl font-black mt-2">${escapeHtml(brandSafe(p.title))}</h2><div class="text-2xl font-black gold mt-4">${money(price)}</div><div class="mt-3 inline-flex ${inStock?'bg-emerald-500/15 text-emerald-300 border-emerald-500/30':'bg-slate-700/40 text-slate-300 border-slate-600'} border rounded-lg px-3 py-1 text-xs font-bold">${stockLabel(p)}</div><div class="mt-6 text-sm muted leading-7">${escapeHtml(desc).replace(/\n/g,'<br>')}</div>${tags.length?`<div class="mt-5 flex flex-wrap gap-2">${tags.slice(0,12).map(t=>`<span class="pill rounded-full px-3 py-1 text-xs">${escapeHtml(t)}</span>`).join('')}</div>`:''}<div class="mt-7 flex gap-3 flex-wrap"><button type="button" data-quote-product-id="${escapeHtml(String(p.id))}" class="btn rounded-xl px-5 py-3">Order / Quote</button><button data-action="open-chat" class="pill rounded-xl px-5 py-3">Live Chat</button><button data-action="close-product" class="pill rounded-xl px-5 py-3">Back to Products</button></div></div></div><div class="mt-8 border-t line pt-6"><h3 class="text-xl font-black">Related Products / More Options</h3><p class="muted text-sm mt-1">All available products in this category, including older and newer generations, variants and nearby choices from the live catalog.</p><div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4 max-h-[70vh] overflow-y-auto pr-1">${relatedProducts(p).map(x=>`<button type="button" data-product-id="${escapeHtml(String(x.id))}" class="card rounded-2xl p-4 text-left hover:border-amber-400 transition"><div class="text-xs gold font-bold">${escapeHtml(catOf(x))}</div><div class="font-bold mt-1 line-clamp-2">${escapeHtml(x.title)}</div><div class="gold font-black mt-2">${money(priceOf(x))}</div><div class="text-xs muted mt-1">${stockLabel(x)}</div></button>`).join('')}</div></div>`;document.getElementById('productModal').classList.remove('hidden');document.body.classList.add('overflow-hidden');history.replaceState(null,'',location.pathname+'#product-'+encodeURIComponent(String(p.handle||p.id)));}
function closeProduct(){document.getElementById('productModal').classList.add('hidden');document.body.classList.remove('overflow-hidden');history.replaceState(null,'',location.pathname+location.search);}

function renderComparison(){const box=document.getElementById('comparePanel');if(!box)return;const selected=state.compareIds.map(id=>state.products.find(p=>String(p.id)===id)).filter(Boolean);box.classList.toggle('hidden',selected.length===0);if(!selected.length){box.innerHTML='';return;}const fields=[['Category',p=>catOf(p)],['Price',p=>money(priceOf(p))],['Availability',p=>stockLabel(p)],['Brand / vendor',p=>p.vendor||p.brand||'Not listed'],['Description',p=>cleanHtml(p.body_html||p.description||'Not provided').slice(0,220)||'Not provided']];box.innerHTML='<div class="flex items-center justify-between gap-3 flex-wrap mb-3"><h3 class="text-xl font-black">Product comparison ('+selected.length+'/4)</h3><button type="button" data-clear-compare class="pill rounded-lg px-3 py-2 text-sm">Clear comparison</button></div><div class="overflow-x-auto"><table class="w-full text-sm" style="border-collapse:collapse;min-width:520px"><thead><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #334155">Field</th>'+selected.map(p=>'<th style="text-align:left;padding:10px;border-bottom:1px solid #334155;min-width:160px">'+escapeHtml(brandSafe(p.title))+'</th>').join('')+'</tr></thead><tbody>'+fields.map(([label,get])=>'<tr><th style="text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #334155">'+escapeHtml(label)+'</th>'+selected.map(p=>'<td style="vertical-align:top;padding:10px;border-bottom:1px solid #334155;max-width:280px;overflow-wrap:anywhere">'+escapeHtml(String(get(p)))+'</td>').join('')+'</tr>').join('')+'</tbody></table></div><p class="muted text-xs mt-3">Comparison uses catalog fields only. Missing technical specifications are not inferred.</p>'; }
function render(){const q=document.getElementById('search').value.toLowerCase();let arr=state.products.filter(p=>(state.category==='All'||catOf(p)===state.category)&&((p.title||'').toLowerCase().includes(q)||(p.vendor||'').toLowerCase().includes(q)));document.getElementById('grid').innerHTML=arr.map(card).join('');document.getElementById('empty').classList.toggle('hidden',arr.length>0);renderComparison();}
function cats(){const names=['All',...new Set(state.products.map(catOf))];document.getElementById('cats').innerHTML=names.map(x=>`<button type="button" data-category="${escapeHtml(x)}" class="pill rounded-full px-4 py-2 text-sm whitespace-nowrap ${x===state.category?'active':''}">${escapeHtml(x)}</button>`).join('');renderCategoryTiles(names)}
function renderCategoryTiles(names){const symbols={'All':'ALL','GPU':'GPU','CPU':'CPU','Motherboard':'MB','RAM':'RAM','Storage':'SSD','PSU':'PSU','Cooling':'COOL','Case':'CASE','Gaming PC':'PC','Laptop':'LAP','Monitor':'MON','Keyboard':'KEY','Mouse':'MOUSE','Other':'+'};const tiles=document.getElementById('categoryTiles');if(!tiles)return;tiles.innerHTML=names.map(name=>{const matches=name==='All'?state.products:state.products.filter(p=>catOf(p)===name);const count=matches.length;const image=matches.map(imgOf).find(Boolean);return `<button type="button" data-category="${escapeHtml(name)}" data-scroll-products="true" class="category-tile rounded-2xl p-3 flex items-center gap-3 text-left transition"><span class="category-thumb">${image?`<img src="${escapeHtml(image)}" alt="" loading="lazy" decoding="async">`:`<span class="category-symbol">${symbols[name]||'✦'}</span>`}</span><span class="min-w-0 flex-1"><strong class="block text-sm md:text-base">${escapeHtml(name==='All'?'All Products':name)}</strong><span class="category-count block mt-1">${count} ${count===1?'item':'items'}</span></span><span class="gold font-bold">›</span></button>`}).join('')}
function setCat(x){trackStoreEvent('category_filter');state.category=x;cats();render()}
document.addEventListener('click',function(e){
  const actionButton=e.target.closest('[data-action]');
  if(actionButton){const action=actionButton.dataset.action;if(action==='open-chat')openChat();else if(action==='close-chat')closeChat();else if(action==='show-ai-chat')showChatMode('ai');else if(action==='show-crisp-chat')showChatMode('crisp');else if(action==='close-product')closeProduct();else if(action==='close-order')closeOrder();else if(action==='prepare-chat-request')prepareChatRequest();return;}
  const compareButton=e.target.closest('[data-compare-product-id]');
  if(compareButton){const id=String(compareButton.dataset.compareProductId);if(state.compareIds.includes(id))state.compareIds=state.compareIds.filter(x=>x!==id);else if(state.compareIds.length>=4){alert('Compare up to four products at a time.');return;}else state.compareIds.push(id);render();return;}
  const clearCompare=e.target.closest('[data-clear-compare]');if(clearCompare){state.compareIds=[];render();return;}
  const productButton=e.target.closest('[data-product-id]');
  if(productButton){openProduct(productButton.dataset.productId);return;}
  const quoteButton=e.target.closest('[data-quote-product-id]');
  if(quoteButton){const p=state.products.find(x=>String(x.id)===quoteButton.dataset.quoteProductId);if(p)quoteProduct(p.title,priceOf(p));return;}
  const categoryButton=e.target.closest('[data-category]');
  if(categoryButton){setCat(categoryButton.dataset.category);if(categoryButton.dataset.scrollProducts==='true')document.getElementById('products').scrollIntoView({behavior:'smooth',block:'start'});}
});
let currentOrder=null;
function quoteProduct(name,price){
  trackStoreEvent('inquiry_start');
  const safeName=brandSafe(name);
  currentOrder={name:safeName,price};
  document.getElementById('orderTitle').textContent=safeName;
  document.getElementById('orderPrice').textContent=money(price);
  const p=state.products.find(x=>x.title===name);
  document.getElementById('orderStock').textContent=p?stockLabel(p):'';
  document.getElementById('orderResult').classList.add('hidden');
  activeOrderRequestKey=null;activeOrderRequestFingerprint=null;
  document.getElementById('orderForm').reset();
  document.getElementById('orderQty').value='1';
  document.getElementById('orderModal').classList.remove('hidden');
  document.body.classList.add('overflow-hidden');
}
function prepareChatRequest(){
  const messages=supportHistory.filter(item=>item.role==='user').slice(-6).map(item=>item.content);
  if(!messages.length){addSupportMessage('assistant','Please describe what you need first, then choose this option to prepare a request.');return;}
  const source=document.getElementById('supportSourceCountry')?.value||'';
  const names={TH:'Thailand',KR:'South Korea',PK:'Pakistan',MY:'Malaysia',SG:'Singapore',VN:'Vietnam',AU:'Australia'};
  quoteProduct('Sourcing request from chat',0);
  document.getElementById('orderNote').value=(source?'Requested sourcing market: '+(names[source]||source)+'\n':'')+'Customer chat summary:\n'+messages.join('\n');
}
function closeOrder(){
  document.getElementById('orderModal').classList.add('hidden');
  document.body.classList.remove('overflow-hidden');
}
document.getElementById('orderForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(orderSubmissionInFlight)return;
  orderSubmissionInFlight=true;
  const result=document.getElementById('orderResult');
  const qty=Number(document.getElementById('orderQty').value||1);
  const name=document.getElementById('orderName').value.trim();
  const contact=document.getElementById('orderContact').value.trim();
  const note=document.getElementById('orderNote').value.trim();
  const msg='Hello PakThai Tech! I would like to order/quote\n\nProduct: '+currentOrder.name+'\nPrice: '+money(currentOrder.price)+'\nQuantity: '+qty+'\nName: '+name+'\nContact: '+contact+'\nNote: '+note;
  result.innerHTML='<span>Sending request to PakThai Tech...</span>';
  result.classList.remove('hidden');
  try{
    const payload={website:document.getElementById('orderWebsite')?.value||'',customer_name:name,phone:contact,whatsapp:contact,country_code:document.getElementById('orderCountry')?.value||'',product_title:currentOrder.name,quantity:qty,requested_price_pkr:Number(currentOrder.price)||null,request_type:'order_request',customer_note:note};
    const fingerprint=JSON.stringify(payload);
    if(!activeOrderRequestKey||activeOrderRequestFingerprint!==fingerprint){activeOrderRequestKey=(globalThis.crypto&&typeof crypto.randomUUID==='function')?crypto.randomUUID():'order-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);activeOrderRequestFingerprint=fingerprint;}
    payload.idempotency_key=activeOrderRequestKey;
    const r=await fetch('https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/customer-requests',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.error||'Request failed');
    activeOrderRequestKey=null;activeOrderRequestFingerprint=null;
    trackStoreEvent('inquiry_submit');
    result.innerHTML='<strong>Request received.</strong><br>Owner approval has been requested.<br><a class="inline-block btn rounded-lg px-4 py-2 mt-3" target="_blank" rel="noopener" href="https://wa.me/923007982289?text='+encodeURIComponent(msg)+'">Continue on WhatsApp</a>';
  }catch(err){
    trackStoreEvent('inquiry_failure');
    result.innerHTML='<strong>Request not recorded.</strong><br><span class="muted">We could not save this request, and no message was sent. Please try submitting again or email <a href="mailto:pakthaitech@gmail.com">pakthaitech@gmail.com</a>. Your form details are still here.</span>';
  }finally{
    orderSubmissionInFlight=false;
  }
});
function builder(){const groups=['CPU','GPU','Motherboard','RAM','Storage','PSU','Case','Cooling'];const wrap=document.getElementById('builderFields');wrap.innerHTML=groups.map(g=>`<label class="block"><span class="text-sm muted">${g}</span><select data-group="${g}" class="w-full mt-2 bg-[#111827] border line rounded-xl px-3 py-3"><option value="">Select ${g}</option>${state.products.filter(p=>catOf(p)===g).map(p=>`<option value="${escapeAttr(p.id)}">${escapeHtml(p.title)} — ${money(priceOf(p))}</option>`).join('')}</select></label>`).join('');wrap.querySelectorAll('select').forEach(s=>s.addEventListener('change',calc));}
function calc(){let total=0;document.querySelectorAll('#builderFields select').forEach(s=>{const p=state.products.find(x=>String(x.id)===s.value);if(p)total+=priceOf(p)});document.getElementById('total').textContent=money(total)}
async function load(){try{const r=await fetch(SOURCE,{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();const rows=Array.isArray(data)?data:(Array.isArray(data.products)?data.products:[]);state.products=rows.map(p=>{const image=p.image_url?String(p.image_url).startsWith('//')?'https:'+String(p.image_url):String(p.image_url):(p.images?.[0]?.src||p.featured_image||'');const price=Number(p.price_pkr??p.price??p.variants?.[0]?.price??0);const available=p.available===true||p.available===1||p.available==='1'||(Array.isArray(p.variants)&&p.variants.some(v=>v.available));return {...p,product_type:p.category||p.product_type||'Other',price,available,variants:Array.isArray(p.variants)&&p.variants.length?p.variants:[{price,available}],images:Array.isArray(p.images)&&p.images.length?p.images:(image?[{src:image}]:[]),featured_image:image,tags:Array.isArray(p.tags)&&p.tags.length?p.tags:[p.category||p.product_type||'Other']};});if(!state.products.length)throw Error('Empty catalog');document.getElementById('status').textContent='Live catalog connected';document.getElementById('status').className='mt-2 text-xl font-bold text-emerald-400';document.getElementById('count').textContent=state.products.length;document.getElementById('stock').textContent=state.products.filter(availableOf).length;cats();render();builder();const requestedQuote=new URLSearchParams(location.search).get('quote');if(requestedQuote){const requestedProduct=state.products.find(p=>String(p.id)===String(requestedQuote));if(requestedProduct)quoteProduct(requestedProduct.title,priceOf(requestedProduct));}}catch(e){console.error('PakThai catalog load failed:',e);document.getElementById('status').textContent='Live catalog temporarily unavailable';document.getElementById('status').className='mt-2 text-xl font-bold text-rose-400';document.getElementById('grid').innerHTML='<div class="card rounded-2xl p-6 text-sm muted col-span-full">The live catalog is temporarily unavailable. Please refresh shortly.</div>';}}

document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeOrder();closeProduct();}});
document.getElementById('productModal').addEventListener('click',e=>{if(e.target.id==='productModal')closeProduct();});
let deferredInstallPrompt=null;
const installButtons=[document.getElementById('installBtn'),document.getElementById('heroInstallBtn'),document.getElementById('installMainBtn')].filter(Boolean);
function isIos(){return /iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function showInstallHelp(){
  if(isStandalone()){alert('PakThai Tech پہلے ہی آپ کے ڈیوائس پر ایپ کی طرح انسٹال ہے۔');return;}
  if(deferredInstallPrompt){deferredInstallPrompt.prompt();deferredInstallPrompt.userChoice.finally(()=>{deferredInstallPrompt=null;installButtons.forEach(b=>b.classList.add('hidden'));});return;}
  if(isIos()){alert('On iPhone or iPad, open this page in Safari, tap Share, then choose \"Add to Home Screen\".');return;}
  alert('To install PakThai Tech, use your browser menu and choose \"Install PakThai Tech\" or \"Add to Home Screen\".');
}
installButtons.forEach(b=>b.addEventListener('click',showInstallHelp));
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;installButtons.forEach(b=>b.classList.remove('hidden'));});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;installButtons.forEach(b=>b.classList.add('hidden'));});
let analyticsSearchTimer=null;document.getElementById('search').addEventListener('input',()=>{render();clearTimeout(analyticsSearchTimer);if(document.getElementById('search').value.trim().length>=2)analyticsSearchTimer=setTimeout(()=>trackStoreEvent('product_search'),900);});document.getElementById('quote').addEventListener('click',()=>{trackStoreEvent('builder_quote');trackStoreEvent('inquiry_start');});trackStoreEvent('page_view');if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});document.getElementById('quote').addEventListener('click',()=>{activeOrderRequestKey=null;activeOrderRequestFingerprint=null;currentOrder={name:'Custom PC Build',price:Number(document.getElementById('total').textContent.replace(/[^0-9.]/g,''))||0};document.getElementById('orderTitle').textContent='Custom PC Build';document.getElementById('orderPrice').textContent=document.getElementById('total').textContent;document.getElementById('orderStock').textContent='Build request';document.getElementById('orderResult').classList.add('hidden');document.getElementById('orderForm').reset();document.getElementById('orderQty').value='1';document.getElementById('orderModal').classList.remove('hidden');document.body.classList.add('overflow-hidden');});load();
