import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
const p='src/buyer-discovery.js'; let s=readFileSync(p,'utf8');
const backup='src/buyer-discovery.js.before-buyer-quality-filter-20261027.bak';
const anchor='const OVERPASS_ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://lz4.overpass-api.de/api/interpreter", "https://z.overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.osm.jp/api/interpreter"];';
if(!s.includes(anchor)) throw new Error('Expected endpoint anchor missing');
if(s.includes('function isPakistanBuyerWebsite(')) throw new Error('Quality helper already exists; refusing duplicate patch');
const helper=`
const PAKISTAN_IT_WEBSITE_HOSTS = new Set(["ilink.com.pk","umercomputers.com","pcbank.com.pk","zahcomputers.pk","galaxy.pk","czone.com.pk","techtronics.pk","electrotraders.com.pk","newtechpk.com","khanbrothers.net","mustafacomputers.pk","asifcomputers.com","pcstore.pk"]);
function isPakistanBuyerWebsite(host, title, description = "") {
  const domain = String(host || "").toLowerCase().replace(/^www\\./, "");
  const searchable = String(title || "") + " " + String(description || "") + " " + domain;
  if (!domain.endsWith(".pk") && !PAKISTAN_IT_WEBSITE_HOSTS.has(domain)) return false;
  if (/what is a computer|computer definition|history of computers|computerhope|geeksforgeeks|britannica|olx|lowyat|amazon|best buy|dell usa|newegg|gigacomputer|incomputer\\.cz|masonic|swords for sale|ikiosek|zive\\.cz|educational|definition|how to download/i.test(searchable)) return false;
  return /computer|electronics?|laptop|pc parts|it solution|technology|printer|server|wholesale|retailer|distributor|hardware/i.test(searchable);
}
`;
s=s.replace(anchor,anchor+helper);
const old1='if (!row.title || !["http:", "https:"].includes(target.protocol) || /(^|\\.)(bing\\.com|microsoft\\.com|duckduckgo\\.com|google\\.[a-z.]+|facebook\\.com|instagram\\.com|youtube\\.com|wikipedia\\.org)$/i.test(host)) continue;';
const new1='if (!row.title || !["http:", "https:"].includes(target.protocol) || /(^|\\.)(bing\\.com|microsoft\\.com|duckduckgo\\.com|google\\.[a-z.]+|facebook\\.com|instagram\\.com|youtube\\.com|wikipedia\\.org)$/i.test(host) || !isPakistanBuyerWebsite(host, row.title, row.description)) continue;';
if(!s.includes(old1)) throw new Error('First web fallback filter not found'); s=s.replace(old1,new1);
const old2='if (!title || !/^https?:$/.test(target.protocol) || /(^|\\.)(bing\\.com|microsoft\\.com|google\\.com|facebook\\.com|instagram\\.com|youtube\\.com|wikipedia\\.org)$/i.test(target.hostname)) continue;';
const new2='if (!title || !/^https?:$/.test(target.protocol) || /(^|\\.)(bing\\.com|microsoft\\.com|google\\.com|facebook\\.com|instagram\\.com|youtube\\.com|wikipedia\\.org)$/i.test(target.hostname) || !isPakistanBuyerWebsite(target.hostname, title, description)) continue;';
if(!s.includes(old2)) throw new Error('Second web fallback filter not found'); s=s.replace(old2,new2);
const old3='if (!title || !["http:","https:"].includes(target.protocol) || /(^|\\.)(bing\\.com|microsoft\\.com|google\\.[a-z.]+|facebook\\.com|instagram\\.com|youtube\\.com|wikipedia\\.org)$/i.test(host) || !/computer|electronics?|hardware|laptop|technology|printer|server|wholesale|retailer|distributor/.test(searchable) || seenHosts.has(host)) continue;';
const new3='if (!title || !["http:","https:"].includes(target.protocol) || /(^|\\.)(bing\\.com|microsoft\\.com|google\\.[a-z.]+|facebook\\.com|instagram\\.com|youtube\\.com|wikipedia\\.org)$/i.test(host) || !/computer|electronics?|hardware|laptop|technology|printer|server|wholesale|retailer|distributor/.test(searchable) || !isPakistanBuyerWebsite(host, title, desc) || seenHosts.has(host)) continue;';
if(!s.includes(old3)) throw new Error('Third web fallback filter not found'); s=s.replace(old3,new3);
s=s.replace('place_id: "web:" + host + ":" + encodeURIComponent(row.title.toLowerCase().slice(0,100))','place_id: "web:" + host');
s=s.replace('place_id:"web:"+host+":"+encodeURIComponent(title.toLowerCase().slice(0,100))','place_id:"web:"+host');
copyFileSync(p,backup); writeFileSync(p,s); console.log('quality filter patched; backup created');
