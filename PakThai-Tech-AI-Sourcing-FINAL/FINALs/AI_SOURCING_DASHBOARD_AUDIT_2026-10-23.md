# AI SOURCING DASHBOARD + NOTIFICATION AUDIT — 2026-10-23

## Scope and limits
Reviewed the live Worker dashboard HTML (HTTP 200; 101,614-byte response), canonical Worker source, notification sender modules, partner notification helper, free-window opt-in handling, and focused tests. No browser GUI/CDP interface was available through the authorized remote tools, so individual dashboard buttons could not be physically clicked in the existing Edge session. No Owner session was bypassed. The public HTML response does not prove Owner login, live D1 values, Gmail inbox contents, Meta diagnostics, or successful provider delivery.

## Feature-by-feature source review
- Dashboard/system status: present; calls /api/health, /api/dashboard and /api/controls. Some static explanatory text is stale/over-broad (says partner alerts remain Owner-review drafts and labels Owner approval ALWAYS ON even though routine WhatsApp has an automatic free-window path).
- Seller Database: panel and save action present. Runtime data not inspected because authenticated Owner dashboard access could not be exercised through GUI tools.
- Small-Lot Calculator (the requested “Smart Calculator”): panel and calculate/create actions present. Calculation output warns that landed cost inputs may be incomplete and labels opportunity as pending Owner approval. Do not remove this approval gate.
- Seller History: panel present; runtime rows not inspected.
- Sourcing Opportunities: panel present; page states approval is pending. This protects quotes/orders and should remain.
- Pakistan Buyer Center: panel and loading function present; live private data not inspected.
- Buyer Discovery: panel and search/refresh controls present; live search not triggered, to avoid production D1 writes and unreviewed external discovery.
- Sourcing Partners: Owner-only management panel; contact/country/lead type fields present. Partner records and consent were not read from production.
- Voice Assistant: read-only typed status commands and browser SpeechRecognition support; no settings changes, approvals, or outbound messages from voice. Microphone support depends on browser permissions.
- Gmail Mailbox: collapsed until opened/refreshed; uses Owner-protected Gmail routes. Inbox content and OAuth connection status were not inspected due no authenticated GUI session.
- WhatsBox: inbox/status/diagnostic UI and receipt-history functions present. Fresh Meta diagnostic was not retrieved from signed-in Owner view in this pass.
- Outgoing Queue: shows prepared/approved/sent/failed messages and WhatsApp delivery receipts. The rendered rows currently offer record archiving, not a visible approve/send action; a helper function for approve/send exists but is not referenced by a rendered button. Routine WhatsApp delivery is attempted automatically at lead creation only if the partner has an active opt-in and an open 24-hour service window. The fallback email is prepared as a draft and is not auto-sent. This can leave notifications queued.

## Confirmed notification workflow
1. New customer request is stored and internal Owner notification is created.
2. A country-matched active partner is assigned only when routing is unambiguous.
3. Partner alert is queued as WhatsApp primary when enabled, otherwise email draft.
4. The Worker attempts the free-window WhatsApp path immediately, but requires active partner opt-in, active partner record, open 24-hour service window, correct connected/verified production sender, and configured credentials. Monthly free-message cap is 1,000.
5. If those gates do not pass, the prepared WhatsApp notification remains queued. Email fallback is currently only a draft; it does not auto-send.
6. Template sender code can send a prepared partner lead after live Meta readiness checks, but current intake does not automatically invoke that template path when the free service window is closed.
7. Last saved Meta diagnostic remains CONNECTED / CLOUD_API / GREEN with code_verification_status NOT_VERIFIED. Do not bypass this or send any test while not verified.

## Important finding / next fix
The user's desired behavior is “no Owner click for routine, consented partner alerts.” Existing free-window dispatch already does that within the open 24-hour window, but it does not automatically fall back to an approved WhatsApp template outside that window, and the email fallback stays draft-only. The safe implementation is to add a server-side automatic template fallback for routine partner_lead notifications only, gated by:
- current active sourcing-partner record and matching phone,
- explicit active WhatsApp START opt-in,
- exact production sender/WABA linkage and code_verification_status VERIFIED,
- CONNECTED/CLOUD_API sender and APPROVED partner template,
- duplicate/idempotency claim, rate caps, and delivery callback tracking.
Do not use the manual test route or send to any arbitrary recipient. Do not auto-send customer quotations, pricing, purchase/order/payment commitments, stock commitments, or delivery promises. Keep those Owner-approved.
The existing template sender must itself verify active opt-in before being used by an automatic dispatcher. No such new dispatcher was added in this audit, because it requires focused implementation and tests, and Meta is still recorded NOT_VERIFIED.

## Live public checks
- Worker dashboard endpoint HTTP 200.
- Previously post-deploy in this session: Worker health HTTP 200 with ok=true; catalog HTTP 200 with 455 products.
- Store homepage and /catalog HTTP 200.
- Public Owner-only diagnostics returning 401 without Owner session is expected; it does not indicate a Meta failure.

## No-change record
No Meta settings, number registration, secrets, D1 production rows, partner contacts, Gmail, Telegram, Crisp, or Store settings were changed. No message, email, purchase, or order was sent. No additional deployment was made during this dashboard inspection; current Worker version remains e534903c-9583-484a-9570-f2600dd3b3aa.
