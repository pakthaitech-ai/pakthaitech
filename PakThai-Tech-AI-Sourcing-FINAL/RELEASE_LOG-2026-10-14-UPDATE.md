# PakThai Tech — 2026-10-14 release update

- Deployed Worker version `b8912fc0-7a56-4cac-8c71-cd2b11685238`: scheduled catalog sync batch cap reduced from 50 to 10 to avoid Cloudflare Worker subrequest-limit failures.
- Deployed Worker version `4ed9c5db-6ec9-4456-b1d4-373ce95535d5`: Owner-only read-only Meta diagnostics now include phone `status` and `platform_type`.
- Validation before both deploys: full `npm.cmd test` passed 97/97; `npx.cmd wrangler deploy --dry-run` passed.
- Live manual catalog sync processed/saved 388 source handles, 0 failed. `catalog_sync_last_status=complete`, cursor 0. Worker health HTTP 200, catalog API HTTP 200 with 388 products, storefront HTTP 200.
- Fresh discovery: Pakistan buyer search 3 found/saved/refreshed (11 total prospects); South Korea seller search 1 saved/refreshed (11 total). Existing Thailand seller/buyer counts 18/78 and Korea seller/buyer counts 11/84. Latest Thailand seller, Thailand buyer and Korea buyer searches returned no usable/named public results; no fake leads or outreach.
- Gmail status authorized, actual_sending_ready true; inbox read returned 15 messages. Four previously reviewed recipient DSNs were SMTP 4.4.1 remote-server connection timeouts; no retries or outbound email sent.
- Meta: phone `CONNECTED`, `CLOUD_API`, quality `GREEN`, but `code_verification_status=NOT_VERIFIED`; WABA subscription/callback present; `pakthai_partner_lead_alert` still `PENDING`/MARKETING. Automated WhatsApp route remains paused and returns HTTP 410; no partner/customer messages sent.
- Partner notifications remain owner-approved drafts; no real customer requests exist to exercise the partner delivery path. Telegram unchanged.
- Final Owner API check: sourcing-partner directory contains only 1 active partner (South Korea, lead type `all`); no additional partner records or contacts are available to route to. Customer requests = 0; partner-lead notification rows = 0; 6 prepared external drafts remain unapproved. Do not fabricate requests or send any of the drafts.

- Deployed Worker version `0606b7c2-abd4-4ada-993f-700ec81ca51c` after improving Thailand seller discovery: tolerant Bing result parsing and sequential retries across six free public Overpass mirrors. Full test suite 97/97 passed and Wrangler dry-run passed before deployment. Post-deploy discovery still needs live confirmation.

## WhatsApp verification work — 2026-10-14 follow-up
- Deployed owner-only phone verification panel and routes for Meta request_code / verify_code; no OTP is logged or persisted by the UI, and no partner/customer messages are sent by these routes.
- Latest confirmed deployed Worker version: f3d977d4-7996-4891-8669-8815f3766e88.
- Owner diagnostics still show phone CONNECTED / CLOUD_API / GREEN, but code_verification_status=NOT_VERIFIED. Partner template pakthai_partner_lead_alert remains PENDING; WABA app subscription count is 1.
- A verification-code request was attempted from the authenticated owner dashboard. Meta rejected it with "Request code error"; no code was confirmed delivered. A parameter check showed Meta requires language; deployed route sends language=en_US. The request still returned Meta’s generic error, so do not claim phone verification is complete and do not retry repeatedly.
- WhatsApp sending remains hard-paused (HTTP 410); no partner/customer messages were sent. Next diagnostic is to inspect Meta error code/permissions and finish verification through the official Meta flow before considering any owner-approved partner message.
- Tests: 97/97 passed before the final small UI diagnostic-only edit; Wrangler dry-run passed before deployment f3d977d4.
