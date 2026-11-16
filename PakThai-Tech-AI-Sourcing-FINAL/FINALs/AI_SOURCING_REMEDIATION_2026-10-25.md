# AI Sourcing Remediation — 2026-10-25 (LOCAL, NOT DEPLOYED)

## Scope
Focused repair of landed-cost safety and opportunity creation. No Gmail, microphone, WhatsApp, provider settings, schedules, secrets, or production D1 rows were changed.

## Faults fixed in local source
- Block 9 previously marked a buyer/seller match viable using margin/budget alone, even when enabled landed-cost rates were zero/unconfigured. It now returns `pending_costs`, marks the calculation `Incomplete Cost Inputs`, and refuses to create the opportunity until required enabled rates are configured.
- Block 9 now rejects seller offers with a zero/missing asking price instead of calculating against an unusable offer.
- The Small-Lot Calculator's `POST /api/opportunities` path previously inserted a calculated opportunity without enforcing `pending_costs`. It now returns HTTP 409 and lists missing cost rates; it also requires a positive supplier asking price and a positive retail reference.
- The dashboard previously reused a previous successful calculation if the Owner changed inputs or a subsequent calculation failed. It now clears the old result and recalculates with current inputs before every create attempt, and blocks creation when cost inputs are incomplete.
- Added regression assertions to `tools/audit/security-hardening.test.mjs`.

## Validation
- Backup created before edits: `_MASTER_CONTROL/snapshot/pre-block9-cost-completeness-20261025_143937/`
- `node --check src/worker.js`: PASS
- `node --check tools/audit/security-hardening.test.mjs`: PASS
- `npm.cmd test`: PASS, 131/131; dashboard inline validation PASS (2 scripts)
- `npm.cmd run dry-run`: PASS; Wrangler bundle 560.59 KiB (124.44 KiB gzip); D1/AI bindings present
- No live discovery, production D1 write, email, WhatsApp, quote, purchase, order, or production deployment was performed.

## Remaining blockers
- Actual pickup, packing, freight, duty, payment, Pakistan transport and contingency rates still need verified real values. Do not invent them. Until set, the affected opportunity creation paths now fail closed.
- Seller offers, real buyer requirements, seller matching, and end-to-end opportunity creation still need real verified inputs.
- WhatsApp stays paused pending Meta VERIFIED. Push receipt and auto-reply live execution need separate proof.
- This is a local source fix only. Production remains on the previous deployed version until Owner explicitly approves deployment.
