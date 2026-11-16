$ErrorActionPreference = 'Stop'
$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\FINAL_SOURCE_OF_TRUTH.md'
$s = [IO.File]::ReadAllText($p)
$s = $s.Replace('Last verified/updated: 2026-10-12 (Pakistan time)', 'Last verified/updated: 2026-10-13 (Pakistan time)')
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))

$p = 'D:\Horse 2\PakThai-Tech-AI-Sourcing-FINAL\MASTER_PLAN_VOICE_REVIEW.md'
$s = [IO.File]::ReadAllText($p)
$s = $s.Replace('Last updated: 2026-10-12 (Pakistan time)', 'Last updated: 2026-10-13 (Pakistan time)')
$pattern = '(?s)## Remaining work — start here.*?(?=## Standard of proof)'
$replacement = @'
## Remaining work — start here (current owner priority, 2026-10-13)
1. Continue the free-first provider-independence audit. Do not repeat Meta/Google setup loops as the primary path. Do not claim any external delivery until a real receipt is available.
2. Keep Cloudflare hosting for now because health, catalog and AI support are live; assess alternatives only if there is evidence Cloudflare caused a failure. Do not migrate the whole app just to change messaging providers.
3. Add a provider-neutral outbound notification adapter with explicit provider selection and safe failure states. Candidate channels: Telegram Bot API for opted-in internal/partner alerts; a non-Google email sender such as Resend after sender/domain verification. Never expose tokens. Do not retire Gmail/Meta paths until replacements are configured and verified.
4. Obtain full technical DSN/bounce details from the existing Gmail failure messages. Do not send new emails just to test, and do not assume every bounce is caused by Gmail.
5. Configure a verified custom email domain/sender and a non-Google inbox/forwarding destination if available. Telegram recipients must start the bot before it can message them. WhatsApp itself is Meta-controlled; if the goal is to stop using Meta, partner automation must use another channel.
6. Keep prospect outreach paused. Do not send external messages until the Owner approves a specific recipient and controlled test. Keep Owner approval for quotes, pricing, orders, purchases, payments and delivery commitments.
7. Verify a real active Korea partner and production customer-request/Owner-approval workflow without fake production rows. No partner contact details may be invented.
8. After delivery path is stable, return to WhatsBox historical status cleanup and Remove Record click testing. This is lower priority than a working, verifiable notification route.
9. Preserve the existing three Cron schedules and free-first constraint. Do not enable paid billing or add a payment method without explicit approval.
'@
if (-not [regex]::IsMatch($s, $pattern)) { throw 'Remaining work section anchor not found' }
$s = [regex]::Replace($s, $pattern, $replacement)
$s += @'

## 2026-10-13 — Owner provider-independence decision
The current owner priority supersedes older Meta setup tasks: first correct the working AI/support code and audit real sender paths; then migrate automated notifications away from Google and Meta where possible. Current live Worker is 7a28cad7-1647-4e73-97b0-5ecbfab6a077; full test suite 75/75 PASS; live support chat is verified with Z.ai GLM-4.7-Flash through Workers AI. WhatsApp is still Meta-based and Gmail is still Google-based; those messaging migrations are not complete. No external message or paid service was enabled. The current source of truth and release log contain the latest evidence and migration prerequisites.
'@
[IO.File]::WriteAllText($p, $s, [Text.UTF8Encoding]::new($false))
Write-Output 'Updated source-of-truth date and replaced the master plan next-work section with current owner priority.'
