PAKTHAI-RESUME-20261013-PROVIDER-INDEPENDENCE

Continue the existing PakThai Tech project. Do not restart from assumptions or ask the Owner to repeat documented checks.

Project root:
D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL

Before action, read:
1. FINAL_SOURCE_OF_TRUTH.md
2. NEXT_CHAT_HANDOVER.md
3. MASTER_PLAN_VOICE_REVIEW.md
4. RELEASE_LOG.md

Owner priority:
- Follow the master plan; correct code, verify real behavior, and migrate away from Google/Meta messaging dependencies where possible.
- Do not repeat Meta webhook/template or Google OAuth setup loops as the primary plan.
- Keep free-first. Never enable paid billing or add a payment method without explicit approval.
- Never send external email/WhatsApp/Telegram messages unless the provider is configured and the Owner separately approves one controlled recipient test.
- API acceptance and HTTP 200 are not recipient delivery proof.
- Keep Cloudflare hosting for now; production health, catalog and AI support work. Migrate hosting only if evidence shows Cloudflare caused a failure and a free, commercial-appropriate replacement is validated.

Latest active Worker:
bf8613fe-0594-4beb-a172-79f3b9f145a6

Verified after deploy:
- Tests 77/77 PASS; syntax checks PASS; Wrangler dry-run PASS.
- Health HTTP 200; catalog HTTP 200 / 388 products; support greeting HTTP 200 mode=ai.
- Support model is Z.ai GLM-4.7-Flash through Workers AI, not Meta Llama.
- Dashboard HTTP 200; inline JS syntax PASS; Meta WhatsApp pause banner present; old WhatsApp test button and hardcoded Nadeem test path absent.
- Existing Cron schedules unchanged: 0 2 * * *, 0 4 * * *, 0 * * * *.

Current migration state:
- Automated Meta WhatsApp send/setup/template-test endpoints are deliberately PAUSED. Historical WhatsBox status records remain available. Store manual WhatsApp contact link is unchanged.
- Resend adapter is implemented and mocked-tested for Owner-approved outbound notification emails and account-security emails. It is NOT active yet. Set OUTBOUND_EMAIL_PROVIDER=resend only after configuring RESEND_API_KEY and a verified RESEND_FROM_EMAIL.
- Gmail remains the default email provider and Gmail inbox/auto-reply polling still use Google. Do not claim Google is fully removed.
- Full technical bounce diagnostics from existing Gmail failure messages are still missing; no new emails were sent to test.
- No verified active South Korea partner is in the production directory. Telegram partner alerts require a bot token and each recipient to start the bot first.
- No external messages, customer test rows, orders, quotes, purchases, payments, paid billing, or extra Cron triggers were created.

Next steps:
1. Confirm the custom domain available for email sender authentication; do not invent a domain.
2. Configure Resend sender/domain and store API key only as a Worker secret; never put secrets in source or chat.
3. Set OUTBOUND_EMAIL_PROVIDER=resend and verify one controlled send only after separate Owner authorization.
4. Migrate inbox from Gmail to a non-Google mailbox/forwarding destination once domain and mailbox are available; extract complete bounce diagnostics before retiring Gmail.
5. Add Telegram support for opted-in owner/partner alerts; collect chat IDs only after recipients start the bot.
6. Verify delivery receipts and keep provider acceptance separate from delivered/read status.
7. After messaging is stable, return to Remove Record cleanup/click testing.

Backups:
_MASTER_CONTROL\snapshot\pre-provider-audit-20261013-073200\
_MASTER_CONTROL\snapshot\pre-glm-response-shape-20261013-074300\
_MASTER_CONTROL\snapshot\pre-glm-diagnostic-20261013-080000\
_MASTER_CONTROL\snapshot\pre-provider-migration-docs-20261013-081500\
_MASTER_CONTROL\snapshot\pre-resend-adapter-20261013-084000\
_MASTER_CONTROL\snapshot\pre-meta-send-pause-20261013-085000\
_MASTER_CONTROL\snapshot\pre-meta-test-helper-removal-20261013-090000\
_MASTER_CONTROL\snapshot\pre-meta-send-pause-docs-20261013-091500\

Make timestamped backups before edits, run focused/full tests, syntax checks, Wrangler dry-run and live smoke tests. Deploy only with explicit Owner approval. Never rewrite src\worker.js wholesale. Report evidence, not guesses, in concise Pakistani Urdu.
