import assert from "node:assert/strict";
import test from "node:test";
import { generateNegotiationReply } from "../../src/gmail-negotiation.js";

function harness(aiResult) {
  const rows=new Map();
  const notifications=[];
  const products=[{id:7,title:"Lenovo ThinkPad T14 Laptop",category:"Laptops",price_pkr:185000,available:1,handle:"lenovo-thinkpad-t14"}];
  const db={
    prepare(sql) {
      let p=[];
      return {
        bind(...v){p=v;return this;},
        async first(){
          if(sql.includes("SELECT * FROM gmail_negotiation_threads")) return rows.get(p[0])||null;
          return null;
        },
        async all(){
          if(sql.includes("FROM products WHERE lower(title)")) return {results:products.filter(x=>x.title.toLowerCase().includes(String(p[0]).replace(/%/g,""))||x.category.toLowerCase().includes(String(p[1]).replace(/%/g,"")))};
          return {results:[]};
        },
        async run(){
          if(sql.includes("INSERT INTO gmail_negotiation_threads")) rows.set(p[0],{thread_id:p[0],sender:p[1],subject:p[2],transcript_json:p[3],turn_count:p[4],status:p[5],owner_reported:0});
          if(sql.includes("UPDATE gmail_negotiation_threads SET owner_reported=1")) {const x=rows.get(p[0]);if(x)x.owner_reported=1;}
          if(sql.includes("INSERT INTO notifications")) notifications.push({subject:p[0],message:p[1],status:"pending"});
          return {meta:{changes:1}};
        }
      };
    }
  };
  const env={DB:db,AI:{run:async()=>({response:JSON.stringify(aiResult)})}};
  return {env,rows,notifications};
}
test("catalog-grounded negotiation stores a multi-turn transcript and reports commercial pricing to Owner",async()=>{
  const h=harness({reply:"Thanks. The Store lists the ThinkPad T14 at PKR 185,000 as an indicative listing. Please confirm the quantity and delivery city; our Owner will confirm the final dealer price and availability.",negotiation_status:"needs_owner_review",summary:"Customer asks about ThinkPad pricing; quantity and destination are missing.",missing_info:["quantity","delivery city"],matched_product_ids:[7]});
  const r=await generateNegotiationReply(h.env,{threadId:"thread-1",sender:"buyer@example.com",subject:"ThinkPad T14 pricing",body:"Please quote ThinkPad T14 for wholesale.",senderName:"Buyer"});
  assert.equal(r.status,"needs_owner_review");
  assert.equal(r.ai_used,true);
  assert.equal(r.catalog_matches,1);
  assert.match(r.reply,/Owner will confirm/);
  assert.equal(h.notifications.length,1);
  assert.match(h.notifications[0].message,/Owner review required/);
  const stored=h.rows.get("thread-1");
  assert.equal(stored.turn_count,1);
  assert.equal(stored.status,"needs_owner_review");
  assert.equal(JSON.parse(stored.transcript_json).length,2);
});
test("AI outage falls back safely and does not invent a price",async()=>{
  const h=harness({});
  h.env.AI.run=async()=>{throw new Error("AI unavailable");};
  const r=await generateNegotiationReply(h.env,{threadId:"thread-2",sender:"buyer@example.com",subject:"pricing",body:"Need a price",senderName:"Buyer"});
  assert.equal(r.ai_used,false);
  assert.match(r.reply,/Owner must confirm final dealer pricing/);
  assert.doesNotMatch(r.reply,/PKR\s*\d/);
  assert.equal(h.notifications.length,1);
});
