# PAKTHAI TECH — Real Buyer Prospect Discovery (Google Places)

## What is prepared
- `src/buyer-discovery.js` contains a Google Places API (New) Text Search adapter.
- `src/worker.js` imports the adapter and routes `/api/buyer-prospects/*` to it.
- Results are classified as **prospects only**. The adapter never creates a confirmed buyer, requirement, quotation, order, or sends outreach.
- Only Google Place IDs and PakThai owner review metadata are stored in D1. Google business details are not copied into our database.
- The endpoints require a separate `BUYER_DISCOVERY_ADMIN_TOKEN` so public visitors cannot trigger billable searches.

## Required Google Cloud setup
Google Places API cannot be enabled or billed using the existing Gmail OAuth client. In Google Cloud Console, select project `pakthai-tech`, ensure billing is linked, enable **Places API (New)**, and create a dedicated API key restricted to Places API (New). Do not use the Gmail OAuth client ID/secret as a Places key.

Official setup: https://developers.google.com/maps/documentation/places/web-service/get-api-key
Billing and field-mask guidance: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing

## Configure Worker secrets (PowerShell, from this project folder)
1. Add the Google key without putting it in source code:
   `npx.cmd wrangler secret put GOOGLE_PLACES_API_KEY`
   Paste the key only into the hidden/interactive prompt.
2. Create a strong random owner token locally:
   `$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($bytes); $ownerToken = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')`
3. Save it as a Worker secret:
   `npx.cmd wrangler secret put BUYER_DISCOVERY_ADMIN_TOKEN`
   Paste the value of `$ownerToken` at the prompt.
4. Keep `$ownerToken` in the current PowerShell session only; do not paste it into chat, source files, screenshots, or public pages.
5. Deploy:
   `npx.cmd wrangler deploy`

## First bounded test (cost-aware)
Run no more than a few queries initially. Use a private PowerShell session where `$ownerToken` remains available:

```powershell
$headers = @{ Authorization = "Bearer $ownerToken"; "Content-Type" = "application/json" }
$body = @{ cities = @("Faisalabad"); searches = @("computer parts wholesaler") } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/buyer-prospects/discover" -Headers $headers -Body $body
Invoke-RestMethod -Method Get -Uri "https://pakthai-ai-sourcing.pakthaitech.workers.dev/api/buyer-prospects" -Headers $headers
```

The first search creates only unreviewed prospects. Check each business and its actual buying interest before creating a buyer record or requirement. This module does not collect email addresses (Places Text Search does not reliably provide them) and does not send Gmail/WhatsApp outreach.

## Routes
- `POST /api/buyer-prospects/discover` — owner-authenticated Places search; accepts up to 5 cities × 2 search phrases per call.
- `GET /api/buyer-prospects` — owner-authenticated list of saved Place IDs/review metadata.
- `POST /api/buyer-prospects/review` — owner-authenticated review update; `review_status` is one of `unreviewed`, `contact_to_verify`, `qualified`, `not_a_fit`.

## Safety and completion boundary
- No API key or billing setup can be assumed from Gmail OAuth credentials.
- Automatic scheduled searches are intentionally not enabled until the Places key works and the owner confirms the billing/quota cap.
- Google Places has usage and storage restrictions; this integration stores only Place IDs, not cached business profile fields.
- A discovered business is a prospect, not a confirmed buyer.
