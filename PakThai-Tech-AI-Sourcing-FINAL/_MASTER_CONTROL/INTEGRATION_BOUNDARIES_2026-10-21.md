# PakThai Tech — Integration Boundaries and Free-First Plan
Updated: 2026-10-21 (Asia/Karachi)

## Goal
Use each service only for the job it is designed to do. Keep a single source of truth for customer requests and avoid duplicate providers, forced integrations, paid plans, and unverified message delivery.

## System boundaries

| Component | Owns | Must not do |
|---|---|---|
| Cloudflare Pages storefront | Store UI, public catalog display, product/build UX, AI-chat UI, Order/Quote form, PWA assets | Pretend a request is an approved order or quote; store private customer records in browser-only state |
| Cloudflare Worker + Workers AI + D1 | AI support API, public-safe catalog API, customer-request intake, idempotency, partner routing, Owner approval, internal records, webhook endpoints | Invent availability, binding prices, delivery commitments, or send unapproved outreach |
| Crisp Free | Human live-chat widget and human handoff only | Replace Cloudflare AI API, act as source of truth for orders, or require paid AI credits |
| Meta WhatsApp Cloud API | Receive WhatsApp webhooks; process inbound partner START/STOP and eligible service-window replies when sender/opt-in gates pass | Bypass phone verification, send unapproved template campaigns, or treat HTTP acceptance as delivery confirmation |
| Telegram Bot API (free) | Optional private Owner alerts for new requests, only to configured Owner chat; alerts exclude customer phone/email | Customer/partner outreach, quote approval, order processing, or acting as the customer WhatsApp channel |
| Gmail (existing authorized account) | Owner-approved partner lead email when existing provider path and recipient are valid | General mass outreach, unapproved campaigns, or claims of inbox delivery from API acceptance alone |
| Manual WhatsApp draft (wa.me) | Free human-reviewed fallback to a known recipient | Automatic delivery, consent bypass, or marking a draft as sent |
| Twilio / Resend | Not selected for this free-first release | No activation or paid provider setup without verified need and explicit billing approval |

## Message flow
1. Customer uses Cloudflare AI chat; Worker reads relevant public catalog facts and returns a bounded answer.
2. Customer submits an Order/Quote request; Worker validates and saves it idempotently in D1. Dashboard remains the source of truth and Owner approval is mandatory.
3. A best-effort Telegram alert goes only to the configured Owner chat and contains request reference, product and quantity—not customer contact details. If Telegram is not configured, request intake still succeeds. If delivery fails, the dashboard gets an internal warning.
4. A country-matched partner notification is prepared for Owner review. Existing free-first routing prefers validated partner email when available; WhatsApp draft remains a manual alternative. No customer/partner message is automatically sent through Telegram.
5. WhatsApp inbound arrives at the Worker /webhooks/whatsapp endpoint and is signature-validated. Partner START/STOP and service-window handling remain subject to opt-in and sender-status checks.
6. Human support stays on Crisp until the Owner confirms a tested replacement. Do not remove Crisp just because Cloudflare AI chat exists; AI chat and human live chat have different jobs.

## Current safety status
- Cloudflare AI support and public-safe catalog APIs: implemented; automated tests pass.
- Customer request D1 intake/idempotency and Owner approval: implemented; successful live customer submission is not used as a smoke test because it creates a real production record.
- Crisp human live chat: retain as the dedicated human-support channel; verify its live delivery in the customer browser.
- Meta inbound webhook: route exists; real inbound event delivery is NOT VERIFIED in this pass.
- Meta sender: previously CONNECTED but code_verification_status=NOT_VERIFIED. Automated outbound remains blocked. Do not request another code, register, disconnect, reset, or migrate the production number without Meta-supported resolution.
- Telegram Owner alert: integration is added behind configured bot token and Owner chat ID; mocked tests verify payload/privacy. Actual live delivery remains NOT VERIFIED until an authenticated Owner status/test confirms it.
- Partner email: prepared/Owner-approved path exists; real delivery remains separately verified.
- WhatsApp, Gmail, Telegram and browser push must each report their own status. One provider's success never proves another provider's delivery.

## Free-first operating rules
- No paid plan, billing method, new Cron trigger, or third-party WhatsApp/SMS provider added.
- No test customer request or partner message created/sent for validation.
- No customer phone/email included in Telegram Owner alert.
- No automatic WhatsApp template send while Meta sender verification is unresolved.
- Keep backups and run tests, syntax checks, Wrangler dry-run and diff review before Worker deployment.
- After deployment, verify only safe read-only endpoints; do not claim end-to-end message delivery without a delivery receipt or Owner-confirmed recipient check.