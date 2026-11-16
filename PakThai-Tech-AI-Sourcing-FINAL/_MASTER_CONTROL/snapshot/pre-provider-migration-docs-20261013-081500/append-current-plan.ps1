$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\MASTER_PLAN_VOICE_REVIEW.md'
$s = [IO.File]::ReadAllText($p)
$s = $s.Replace('Last updated: 2026-10-12 (Pakistan time)', 'Last updated: 2026-10-13 (Pakistan time)')
$s += @'

## 2026-10-13 — Owner provider-independence decision (current priority)
This decision supersedes the older "Remaining work" WhatsApp setup steps above. The Owner wants the master plan followed, the real sender paths audited, and Google/Meta dependencies removed where possible before further setup loops. Do not repeat Meta/Google configuration attempts as the primary route.
- Keep Cloudflare hosting for now because production health, catalog and AI support are working. Migrate hosting only if evidence shows Cloudflare is the cause; free alternatives have material limitations (Vercel Hobby is non-commercial; Render Free sleeps; Supabase Free can pause).
- Latest active Worker version: 7a28cad7-1647-4e73-97b0-5ecbfab6a077. Support chat uses Z.ai GLM-4.7-Flash through Workers AI; live greeting and catalog-query tests return HTTP 200 mode=ai. Full tests 75/75 and Wrangler dry-run pass.
- WhatsApp outbound still uses Meta Graph API; Gmail inbox/sending still uses Google OAuth/API. Neither migration is complete. Historical WhatsApp statuses do not prove delivery. Do not send external messages until the alternative is configured and one controlled test is separately approved.
- Candidate free-first channels: Telegram Bot API for internal/partner alerts after recipients start the bot; Resend free tier for outbound email after sender/domain verification; a non-Google inbox/forwarding destination after a custom domain is confirmed. Telegram is not WhatsApp; if leaving Meta entirely, partner alerts must use another channel.
- Cloudflare Email Routing supports inbound/forwarding on Free, but arbitrary-recipient outbound Cloudflare Email Service requires Workers Paid. No paid plan, billing method, extra Cron or external message was enabled.
- Immediate next work: provider-neutral adapter; capture full bounce diagnostics from existing Gmail failure messages; configure and verify email sender/domain plus Telegram bot/chat IDs; controlled delivery test with Owner-approved recipient; only then retire Gmail/Meta routes. Remove-record cleanup remains lower priority.
'@
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))

$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\NEXT_CHAT_HANDOVER.md'
$s = [IO.File]::ReadAllText($p)
$s += @'

## 2026-10-13 — latest owner decision and verified release
- Follow the latest section in FINAL_SOURCE_OF_TRUTH.md and RELEASE_LOG.md. The owner wants Google/Meta messaging dependencies removed where possible; do not repeat Meta/Google setup loops as the primary plan.
- Latest Worker version: 7a28cad7-1647-4e73-97b0-5ecbfab6a077. Z.ai GLM-4.7-Flash is the support model through Cloudflare Workers AI; live greeting and RTX 4060 catalog test returned HTTP 200 mode=ai. Full suite 75/75 PASS; Wrangler dry-run PASS; health 200; catalog 388.
- Email sender/inbox still uses Gmail API/OAuth; WhatsApp sender still calls Meta Graph API. Both are migration-pending, not delivered/verified. No external messages were sent during this release.
- Keep Cloudflare hosting for now; it is working and no evidence ties it to messaging delivery failures. Don't switch the full hosting stack without a tested, free, commercial-appropriate replacement.
- Candidate channel design: Telegram Bot API for opted-in partner/owner alerts (recipients must start the bot) and Resend free tier for email only after domain/sender verification. If no custom domain is available, outbound email migration is blocked; do not invent credentials or enable billing.
- First inspect actual sender functions/config, then prepare provider-neutral adapter. Get full bounce diagnostics from existing Gmail messages; do not send more test emails/WhatsApp messages until a controlled recipient is explicitly approved. Remove-record cleanup is lower priority.
- Current backups: _MASTER_CONTROL/snapshot/pre-provider-audit-20261013-073200/, pre-glm-response-shape-20261013-074300/, pre-glm-diagnostic-20261013-080000/, pre-provider-migration-docs-20261013-081500/.
'@
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
Write-Output 'Updated master plan and handover with latest owner priority.'
