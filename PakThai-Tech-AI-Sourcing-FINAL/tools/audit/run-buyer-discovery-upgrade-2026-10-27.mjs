import { writeFileSync } from "node:fs";
import { searchOsmBusinesses } from "../../src/buyer-discovery.js";
const cities=["Faisalabad","Lahore","Karachi","Islamabad","Rawalpindi","Peshawar","Multan","Gujranwala","Sialkot"];
const phrases=["computer parts wholesaler","IT equipment supplier"];
const unique=new Map(),errors=[];
for(const city of cities){for(const phrase of phrases){try{const rows=await searchOsmBusinesses(city,phrase);for(const x of rows){if(!unique.has(x.place_id))unique.set(x.place_id,x);}console.log(JSON.stringify({city,phrase,results:rows.length,unique:unique.size}));}catch(e){errors.push({city,phrase,error:String(e?.message||e).slice(0,200)});console.log(JSON.stringify({city,phrase,error:String(e?.message||e).slice(0,200)}));}}}
const vals=v=>"'"+String(v??"").replace(/[\u0000-\u001f]/g," ").replace(/'/g,"''")+"'";
const leads=[...unique.values()];
const sql=leads.map(x=>"INSERT INTO buyer_prospects (place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,business_name,address,website,phone,osm_type,osm_id) VALUES ("+[x.place_id,x.discovery_query,x.discovery_city,"unreviewed"].map(vals).join(",")+",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,"+[x.business_name,x.address,x.website,x.phone,x.osm_type,x.osm_id].map(vals).join(",")+") ON CONFLICT(place_id) DO UPDATE SET discovery_query=excluded.discovery_query,discovery_city=excluded.discovery_city,last_seen_at=CURRENT_TIMESTAMP,business_name=excluded.business_name,address=excluded.address,website=excluded.website,phone=excluded.phone;").join("\n");
writeFileSync("./tools/audit/buyer-discovery-upgrade-2026-10-27.sql",sql);
writeFileSync("./tools/audit/buyer-discovery-upgrade-2026-10-27.json",JSON.stringify({ran_at:new Date().toISOString(),source:"OpenStreetMap public business data; unverified prospects only",cities,phrases,results_unique:leads.length,errors,prospects:leads},null,2));
console.log(JSON.stringify({DONE:true,cities: cities.length,phrases:phrases.length,results_unique:leads.length,errors:errors.length,sql_bytes:sql.length}));
