import { writeFileSync } from "node:fs";
import { searchOsmBusinesses } from "../../src/buyer-discovery.js";
const cities=["Faisalabad","Lahore","Karachi"];
const phrase="computer hardware retailer";
const prospects=[];
const errors=[];
for(const city of cities){
  try{const rows=await searchOsmBusinesses(city,phrase);prospects.push(...rows);}
  catch(e){errors.push({city,error:String(e?.message||e).slice(0,250)});}
}
const sqlValue=v=>"'"+String(v??"").replace(/[\u0000-\u001f]/g," ").replace(/'/g,"''")+"'";
const sql=prospects.map(x=>"INSERT INTO buyer_prospects (place_id,discovery_query,discovery_city,review_status,first_seen_at,last_seen_at,business_name,address,website,phone,osm_type,osm_id) VALUES ("+[x.place_id,x.discovery_query,x.discovery_city,"unreviewed"].map(sqlValue).join(",")+",CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,"+[x.business_name,x.address,x.website,x.phone,x.osm_type,x.osm_id].map(sqlValue).join(",")+") ON CONFLICT(place_id) DO UPDATE SET discovery_query=excluded.discovery_query,discovery_city=excluded.discovery_city,last_seen_at=CURRENT_TIMESTAMP,business_name=excluded.business_name,address=excluded.address,website=excluded.website,phone=excluded.phone;").join("\n");
const report={ran_at:new Date().toISOString(),source:"OpenStreetMap/Photon/Nominatim",search_phrase:phrase,cities,results_seen:prospects.length,errors,prospects};
writeFileSync(new URL("./buyer-prospects-live-2026-10-11.json",import.meta.url),JSON.stringify(report,null,2));
if(sql)writeFileSync(new URL("./buyer-prospects-live-2026-10-11.sql",import.meta.url),sql);
console.log(JSON.stringify(report,null,2));
