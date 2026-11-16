const fs = require('fs');
const path = require('path');
const file = path.join('src','worker.js');
if (!fs.existsSync(file)) {
  console.error('ERROR: src\\worker.js not found. Run this BAT from the PakThai-Tech-AI-Sourcing-FINAL folder.');
  process.exit(1);
}
let s = fs.readFileSync(file,'utf8');
const htmlAnchor = `</div>
</section>

<script>
async function openBuyerCenter(){`;
const htmlInsert = `</div>

<div class="card" style="margin-top:20px">
<h3>Buyer Matches</h3>
<p>Products matched to Pakistan buyer requirements. Seller selection and owner approval remain separate steps.</p>
<div id="buyerMatchesList">Loading...</div>
</div>
</section>

<script>
async function openBuyerCenter(){`;
if (!s.includes('id="buyerMatchesList"')) {
  if (s.split(htmlAnchor).length !== 2) {
    console.error('ERROR: Buyer Center HTML anchor was not unique. No changes made.');
    process.exit(1);
  }
  s = s.replace(htmlAnchor, htmlInsert);
}
const reqAnchor = `    if(rl){
      rl.innerHTML=req.length
        ? req.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.buyer_name||'Buyer')+'</b> Ã¢â‚¬â€ '+esc(x.product_keyword||'')+' Ã¢â‚¬â€ Qty '+x.quantity+' Ã¢â‚¬â€ Budget PKR '+fmt(x.max_budget_pkr||0)+'</div>';
          }).join('')
        : '<p>No buyer requirements yet.</p>';
    }
`;
const matchCode = `    if(rl){
      rl.innerHTML=req.length
        ? req.map(function(x){
            return '<div style="padding:8px 0;border-bottom:1px solid #ddd"><b>'+esc(x.buyer_name||'Buyer')+'</b> Ã¢â‚¬â€ '+esc(x.product_keyword||'')+' Ã¢â‚¬â€ Qty '+x.quantity+' Ã¢â‚¬â€ Budget PKR '+fmt(x.max_budget_pkr||0)+'</div>';
          }).join('')
        : '<p>No buyer requirements yet.</p>';
    }

    var mr=await api('/api/buyer-matches');
    var matches=mr.matches||[];
    var ml=document.getElementById('buyerMatchesList');
    if(ml){
      ml.innerHTML=matches.length
        ? matches.map(function(x){
            var status=String(x.status||x.match_status||'matched').replace(/_/g,' ');
            var product=x.product_title||x.product_name||x.title||'Product';
            var buyer=x.buyer_name||'Buyer';
            var seller=x.seller_name||'Seller pending';
            var price=x.landed_unit_pkr||x.price_pkr||x.retail_price_pkr||x.retail_price||0;
            var extra=x.landed_total_pkr ? ' | Landed total PKR '+fmt(x.landed_total_pkr) : '';
            var margin=(x.margin_percent!==undefined && x.margin_percent!==null) ? ' | Margin '+fmt(x.margin_percent)+'%' : '';
            return '<div style="padding:10px 0;border-bottom:1px solid #ddd">'
              +'<b>'+esc(product)+'</b><br>'
              +'Buyer: '+esc(buyer)+' | Seller: '+esc(seller)+'<br>'
              +'Status: '+esc(status)+' | Price PKR '+fmt(price)+extra+margin
              +(x.note ? '<br><small>'+esc(x.note)+'</small>' : '')
              +'</div>';
          }).join('')
        : '<p>No buyer matches yet. Run Buyer Matching to create matches.</p>';
    }
`;
if (!s.includes('var ml=document.getElementById(\'buyerMatchesList\')')) {
  if (s.split(reqAnchor).length !== 2) {
    console.error('ERROR: Requirements rendering anchor was not unique. No changes made.');
    process.exit(1);
  }
  s=s.replace(reqAnchor,matchCode);
}
const backup=file+'.before-buyer-matches-ui';
if (!fs.existsSync(backup)) fs.copyFileSync(file,backup);
fs.writeFileSync(file,s,'utf8');
console.log('PATCHED: Buyer Matches panel added to Buyer Center.');
