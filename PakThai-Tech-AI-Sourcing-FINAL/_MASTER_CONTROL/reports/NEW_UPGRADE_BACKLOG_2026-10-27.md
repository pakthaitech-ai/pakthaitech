# PakThai Tech â€” New Upgrade Backlog
Updated: 2026-10-27 (Asia/Karachi)
Status: Proposal register plus first implementation record. This document does not mark unbuilt features as delivered.

## Existing capabilities â€” do not rebuild
- Product catalogue, customer request intake, support chat, AI buyer/seller discovery, AI prospect screening, small-lot calculator, supplier-offer viability gates, landed-cost settings, quote/order/purchase/delivery records, Gmail negotiation, sourcing partners, browser push and Owner approvals already exist in some form.
- Their presence in source is not proof of end-to-end operation. Verify actual Owner-session workflow and live provider delivery separately.
- Latest baseline recorded 2026-10-27: 467 catalog products; sellers/buyers/requirements/offers/opportunities and Gmail delivery need fresh authenticated reconciliation before commercial readiness is claimed.

## New upgrade proposals
### U1 â€” Engine Health & Automation Monitor (P1)
Goal: one Owner dashboard panel for latest catalog sync, AI screening, Pakistan buyer discovery, market discovery and sourcing phase-2 run status, timestamps, bounded errors, plus real business-record counts.
Acceptance: read-only; Owner-only API; no secrets or customer contact data; missing runs say NOT RUN; no workflow is described as end-to-end verified based only on a status marker.
Implementation: DEPLOYED 2026-10-27 in Worker version `5be874e7-9e3a-4796-a247-302eca4cd7a9`. Deployment suite 134/134 PASS; final post-release suite 135/135 PASS after adding the Engine Monitor regression test; inline validation, syntax check and Wrangler dry-run PASS; live health/catalog/dashboard smoke checks PASS. Owner-authenticated live monitor payload remains NOT TESTED.

### U2 â€” Buyer/Seller Lead Quality Score (P1)
Goal: explainable score from computer/IT relevance, source quality, verified website/contact, location confidence, duplicate confidence and data freshness.
Acceptance: score is a prioritization aid only; source evidence and unknown fields remain visible; no auto-promotion to verified buyer/seller; test city/country attribution and duplicate cases.

### U3 â€” Store Analytics & Sales Funnel (P1)
Goal: measure product views, search use, inquiry starts/submissions and request-to-approved-opportunity funnel.
Acceptance: privacy-conscious, no secrets or unnecessary PII, opt-in/configuration clear, count events separately from completed sales. Cloudflare Pages Web Analytics was recorded NOT ENABLED in the 2026-10-27 audit and requires dashboard enablement or a separately reviewed free-first implementation.

### U4 â€” Product Search & Comparison (P2)
Goal: filters for category/brand/model/price/availability and comparable specifications across CPU, GPU, RAM, storage and related computer parts.
Acceptance: only source-backed fields; stale/missing stock and price clearly labelled; accessible mobile-friendly UI; tests for empty results and untrusted catalogue text.

### U5 â€” Quote Builder with auditable cost breakdown (P1)
Goal: generate a draft using real supplier offer, currency, owner-verified exchange rates and configured freight/duty/local cost inputs.
Acceptance: incomplete FX/cost inputs block margin/viability; quote is labelled draft; no auto-send, discount, stock or delivery promise; final price and commitment remain Owner-approved. Existing quote/order modules should be extended, not duplicated.

### U6 â€” Lead-to-Order CRM timeline (P2)
Goal: connect inquiry, review, qualified lead, requirement, matched offer, draft quote, approval, order, purchase and delivery history.
Acceptance: stable record references, audit timestamps, idempotent updates, clear pending/failed states; never create fake leads/offers/orders.

## Free-first sequencing
1. Finish and deploy U1 after tests, inline validation, syntax checks, Wrangler dry-run and post-deploy read-only smoke check.
2. Reconcile current real records and repair verified blockers (Gmail OAuth/delivery, landed-cost inputs, authenticated discovery counts) before adding more automation.
3. Improve U2 lead quality and source confidence.
4. Enable/implement U3 analytics without paid services or collecting unnecessary PII.
5. Build U4 product comparison; then extend U5/U6 against existing records.
6. Re-evaluate scope and usage before any paid service, billing or provider-setting changes.

## Global safety / release gates
- Back up files before source edits; focused tests, full suite, syntax check, dashboard inline validation, Wrangler dry-run, diff review, deploy and read-only live smoke check.
- Keep existing Cron schedules unchanged unless separately approved.
- Do not send real messages, contact prospects, create production test records, alter Meta/Gmail/WhatsApp settings, change billing, or create commercial commitments as part of a smoke test.
- Use VERIFIED / PARTIAL / NOT CONFIGURED / FAILED / NOT TESTED and state what evidence supports the label.
