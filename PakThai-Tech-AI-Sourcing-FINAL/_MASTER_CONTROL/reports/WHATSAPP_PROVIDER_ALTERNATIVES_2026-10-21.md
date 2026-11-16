# WhatsApp Provider Alternatives Review — 2026-10-21

## Goal
Deliver partner lead/source notifications to UAE and Korea while preserving the production WhatsApp number +92 300 7982289 and avoiding destructive migration/reset.

## Confirmed current project facts
- Cloudflare Worker is the application host and can call external APIs with `fetch()`; Cloudflare is not itself a WhatsApp carrier/BSP or a WhatsApp message-credit wallet.
- Current production Meta phone number ID: 1426391470555242; WABA ID: 2330969974304488.
- Previously observed sender state: CLOUD_API / CONNECTED / quality GREEN, but code_verification_status=NOT_VERIFIED.
- Meta `POST /register` returned code 100 “Register endpoint is not available for SMB businesses”; voice request-code returned 136024.
- Current source deliberately pauses paid-template sending (HTTP 409) pending explicit approval for paid messaging. Free-window sender requires CONNECTED + VERIFIED and a fresh inbound event inside 24 hours.
- UAE/Korea last inbound windows had expired in the prior audit.
- Cloudflare secret inventory contains TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN, but no TWILIO_FROM_NUMBER. Secret values were not read or exposed.

## Provider research
1. **Twilio WhatsApp** can provide API access, but it is still the WhatsApp Business Platform and still relies on Meta assets/onboarding. Twilio documents that Meta must verify ownership of the phone number via SMS/voice OTP. Switching provider is not a way to bypass the current Meta verification issue. Twilio pricing page (reviewed 2026-10-21) states $0.005 per message handling fee plus Meta template fees; destination/category rates vary. Sources:
   - https://www.twilio.com/docs/whatsapp/api
   - https://www.twilio.com/docs/whatsapp/self-sign-up
   - https://www.twilio.com/en-us/whatsapp/pricing
2. **360dialog** also onboards through Meta Embedded Signup and requires phone ownership verification. Its migration checklist includes an approved WABA/display name, valid payment method, Meta business verification, and 2FA steps. A migration would be a production change and should not be attempted until the provider and Meta requirements are confirmed. Sources:
   - https://docs.360dialog.com/docs/hub/embedded-signup
   - https://docs.360dialog.com/partner/partner-hub/migrating-phone-numbers/migrating-existing-waba
3. **Cloudflare Workers** can securely call a third-party API and store its credentials as Worker secrets; Cloudflare does not replace Meta/Twilio/another WhatsApp BSP. Sources:
   - https://developers.cloudflare.com/workers/configuration/integrations/apis/
   - https://developers.cloudflare.com/workers/configuration/secrets/

## Recommendation
- Do NOT remove Meta or migrate the production number now. It would not bypass Meta verification and may interrupt the current sender.
- Keep the existing sender guard in place. Do not send paid templates until the owner has acknowledged the provider/Meta charges and a payment method is configured.
- If the immediate goal is to alert UAE/Korea partners, a separate SMS/email/Telegram fallback can be evaluated, but SMS requires a configured sending number. TWILIO_FROM_NUMBER is currently absent. SMS is not WhatsApp and must only be enabled after confirming sender, costs, consent, and delivery handling.
- First obtain Meta's supported account-specific remedy for NOT_VERIFIED, or deliberately approve a separate non-WhatsApp fallback with its sender and budget.
- No production source/config change and no deployment were made during this review because no safe, verified provider switch is available from the current evidence. No partner messages were sent and no production DB writes were made.

## Verification and next actions
- Confirm whether the existing Twilio account is active and has balance in Twilio Console (read-only; do not expose SID/token).
- If choosing Twilio WhatsApp, obtain Twilio support confirmation that the existing Meta/WABA/number can be onboarded without first deregistering the current production sender; do not start migration until that is written.
- If choosing SMS fallback, configure an SMS-capable sender and set TWILIO_FROM_NUMBER as a Cloudflare secret; test first with owner-controlled destination, then only with opted-in partner recipients.
- Keep the browser on ChatGPT when finished.
