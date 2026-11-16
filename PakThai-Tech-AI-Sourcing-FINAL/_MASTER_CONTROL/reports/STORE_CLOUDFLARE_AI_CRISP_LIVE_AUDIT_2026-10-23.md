# PakThai Tech Store — Cloudflare AI + Crisp live smoke audit (2026-10-23)

## Checks performed
- Opened the public Store in Microsoft Edge and read live published HTML and JavaScript from the deployed Pages URL.
- Store homepage: HTTP 200, 31,607 bytes, title: PakThai Tech — Gaming Hardware & PC Store.
- Store app JavaScript: HTTP 200, 22,526 bytes.
- Worker health: HTTP 200, ok=true, service PAKTHAI TECH AI Sourcing Engine.
- Live catalog endpoint: HTTP 200, 455 products returned.
- Generic support AI POST to /api/support/chat: HTTP 200; ok=true, mode=ai; a relevant product/sourcing support answer returned. No customer data was submitted and no human was contacted.
- Existing Crisp direct chat embed URL: HTTP 200 (Chat page returned).
- Live Store source confirms the chat modal defaults to PakThai AI Support and calls the Cloudflare Worker /api/support/chat. A separate Existing Live Chat (Crisp) tab remains and lazily loads the existing Crisp workspace embed. Cloudflare AI is the default; Crisp remains an optional fallback.
- No order, quote, purchase, outbound human chat message or Crisp test message was created/sent.

## Result / deployment decision
- Store, catalog API, Cloudflare AI support endpoint and Crisp embed passed the HTTP smoke checks.
- No Store or Cloudflare configuration update/deployment was necessary: the live Store already points primary AI Support to the Cloudflare Worker and retains Crisp as a separately selectable option.
- No Crisp workspace setting, Cloudflare secret, billing setting, DNS or deployment was changed.
- Limit: HTTP 200 from Crisp proves the embed page is reachable, not that a human message reaches the correct Crisp Inbox or that an AI agent replies inside Crisp. No visitor test message was sent. Full visual/mobile click-through and authenticated Crisp Inbox receipt remain unverified.
