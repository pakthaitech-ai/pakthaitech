# AI Sourcing Autonomous Discovery + Gmail Handling — 2026-10-23

## Root cause
The previous scheduled handler ran only one of five public-prospect discovery jobs per day (selected by day index). That meant all markets were not refreshed until a multi-day rotation completed. AI screening ran only after that one daily job. Hourly automation already ran Gmail auto-reply handler and buyer/seller matching, but the Gmail handler was fail-closed behind its existing EMAIL_AUTO_REPLY_ENABLED setting.

## Authenticated live discovery actions
Using the signed-in Owner dashboard, searches were triggered; these only saved/refreshed public unverified prospect rows and did not create buyer accounts, seller offers, requirements, opportunities or messages:
- Thailand sellers: 6 results, 6 saved/refreshed.
- Thailand buyers: 5 results, 5 saved/refreshed.
- South Korea sellers: 1 result, 1 saved/refreshed.
- South Korea buyers: 4 results, 4 saved/refreshed.
- Pakistan buyer search was triggered from the Owner UI; a reliable completion count was not captured in this pass, so do not report a count for it.
All are candidates only; country, business fit, contacts, buying intent, stock, export ability and terms still require verification. AI screening only creates pending seller candidates for high-relevance public listing evidence, supported country and valid source.

## Source changes
1. Added runScheduledProspectDiscovery(env), which checks Master AI and Auto Search switches, runs one discovery job per hourly cron, advances a persisted cursor across five jobs (Pakistan buyers, Thailand sellers, Korea sellers, Thailand buyers, Korea buyers), invokes AI screening after successful discovery, and records per-job status/error. A failed public endpoint advances to the next job so one outage does not starve other markets.
2. Existing three Cron expressions remain unchanged: 0 2 * * *, 0 4 * * *, 0 * * * *. The daily 02:00 UTC trigger now runs catalog sync; the hourly trigger runs Gmail handler, rotating discovery/AI screening, and phase-2 matching.
3. Removed hard-coded outreach seed insertion from the scheduler. Existing rows matching those legacy hard-coded addresses are changed to paused_unverified_seed on the next outreach scheduler run; rows/history are preserved. The scheduler remains capped at three draft preparations per run and does not send email.
4. Gmail auto-reply handler remains hourly but only creates owner-review notification drafts; it contains no Gmail send call. Live Owner Voice status reported Gmail authorized TRUE and sending ready TRUE, but a real inbound/reply test remains NOT VERIFIED. The existing remote EMAIL_AUTO_REPLY_ENABLED secret was deliberately left untouched after Wrangler warned a local variable would replace it. Do not claim automatic Gmail drafting is enabled until the existing secret's state and an authenticated run status are verified.

## Validation and deployment
- Full test suite: 128/128 PASS.
- Dashboard inline validation PASS.
- Worker and outreach scheduler syntax checks PASS.
- Wrangler dry-run PASS, 535.15 KiB upload / 117.68 KiB gzip.
- Deployed Worker version: ab8421f4-226f-4813-b70f-faefe8805219.
- Post-deploy smoke: health HTTP 200; catalog HTTP 200 with 455 products; dashboard HTTP 200; Store HTTP 200.
- Existing three Cron schedules were preserved.
- No Gmail/Meta/Crisp/Telegram/Store settings or secrets were changed; no external messages were sent; no fake buyer/seller/opportunity data was created.

## Current operating schedule (UTC; Pakistan time UTC+5)
- Every hour at minute 00: Gmail inbox handling (only if existing remote enablement flag is true; draft-only), one public discovery job plus AI screening, and phase-2 matching.
- Daily at 02:00 UTC / 07:00 PKT: catalog sync.
- Daily at 04:00 UTC / 09:00 PKT: outreach scheduler, capped at 3 draft preparations; no sending. Legacy seed contacts are paused when this job next runs.
- Five discovery jobs rotate hourly, so each market is attempted about every five hours. Public provider rate limits/timeouts can yield zero results; last status records the actual outcome.
