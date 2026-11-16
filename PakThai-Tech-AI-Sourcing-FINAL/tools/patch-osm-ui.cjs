const fs=require('fs');
const p='src/worker.js';
let s=fs.readFileSync(p,'utf8');
s=s.replace('Ready: Google Places API key is configured. Searches run only when you press Search Potential Buyers; no outreach is sent.','Ready: Free OpenStreetMap search. No Google API key or billing required. Leads are unverified; no outreach is sent.');
s=s.replace('Setup needed: Google Places API key is not configured. Add Worker secret GOOGLE_PLACES_API_KEY after enabling Places API (New) and billing. Search is safely disabled until then.','Free OpenStreetMap discovery is enabled. Search runs only when you press the button; no paid API key is required.');
s=s.replace('No prospects found yet. Configure Google Places, then run a search.','No prospects found yet. Run a free OpenStreetMap search.');
s=s.replace("box.textContent='Searching Google Places. This may use your Google API billing.';","box.textContent='Searching free OpenStreetMap business data. No Google billing is used.';");
s=s.replace("box.textContent='Search complete. Queries: '+r.queries_run+'; results seen: '+r.results_seen+'; Place IDs saved/refreshed: '+r.place_ids_saved_or_refreshed+'. No outreach was sent.';","box.textContent='Search complete (OpenStreetMap). Queries: '+r.queries_run+'; businesses found: '+r.results_seen+'; leads saved/refreshed: '+r.saved_or_refreshed+'. No outreach was sent.';");
fs.writeFileSync(p,s);
