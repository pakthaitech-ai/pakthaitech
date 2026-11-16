# PakThai AI Source — Current Handoff

Updated: 2026-10-19 (Asia/Karachi)
Purpose: Continue the current WhatsApp verification and free partner-alert task from this exact state. Read this file before repeating checks. Do not restart completed setup.

## Project
- Project root: `D:\pakthai\PakThai-Tech-AI-Sourcing-FINAL`
- AI Source Worker: `https://pakthai-ai-sourcing.pakthaitech.workers.dev/`
- Worker service: `pakthai-ai-sourcing`
- Cloudflare D1 binding: `pakthai-sourcing-db`
- Canonical Worker source: `src\worker.js`
- Free WhatsApp handler: `src\whatsapp-free-window.js`
- Project operating rules: `FINAL_SOURCE_OF_TRUTH.md`
- Prior general handover: `NEXT_CHAT_HANDOVER.md`
- Release history: `RELEASE_LOG.md`
- Do not print or copy secret values, tokens, passwords, OAuth credentials, or verification codes into chat or handoff files.

## User's goal
Use AI Source to deliver WhatsApp service-window replies/partner lead details without paid WhatsApp sends. UAE number `+971562355960` belongs to the Owner and is the self-test recipient. Korea contact `+821068879265` is M Nadeem; do not send further tests to him unless the Owner specifically reconfirms. Saved partners must opt in with START. Quote, price, order, purchase, and commitment decisions remain Owner-approved.

## Current WhatsApp facts
- PakThai sender: `+92 300 7982289`; Meta phone-number ID `1426391470555242`; WABA ID `2330969974304488`; Meta app ID `2689904551425462`.
- Meta WhatsApp Manager last showed the sender as Connected / High quality. The authenticated Graph diagnostics reported `status=CONNECTED`, `platform_type=CLOUD_API`, but `code_verification_status=NOT_VERIFIED`.
- AI Source code deliberately fails closed for automatic sends unless the configured sender is confirmed to be the connected, verified PakThai Cloud API number. Thus an incoming START does not by itself prove the auto-reply or outbound delivery works.
- The Owner's UAE partner entry is active (`ahmad`, UAE). An inbound `START` from `971562355960` was received and saved on 2026-10-19 (`2026-10-19T07:08:01Z`); webhook/inbound path has evidence. That inbound does not prove an outgoing reply was delivered.
- Historical outgoing WhatsApp entries for UAE/Korea show `Sent · no delivery receipt`; do not report those as delivered.
- The Owner selected Voice call in the AI Source verification panel and clicked **Request verification code**. Meta returned: `Request code error (Meta code 136024)`. No verification code/call was issued, and no code was entered. Earlier, pressing Verify with an empty field only displayed `Enter the code from Meta privately first.`
- Do not remove/re-add or re-register the existing Connected number. Do not keep retrying SMS/voice requests immediately; Meta's exact reason for 136024 is not known from the displayed main code alone.
- Meta notifications showed the app switched to Live and `hello_world` was approved. However, the Meta Message Templates page screenshot had `Test WhatsApp Business Account` selected. Production approval of that template under the `Pakthai` WABA is therefore not confirmed. The live/template notices are separate from phone-number code verification.
- The Meta Postman page is official read-only examples, not connected to the user's production credentials. It showed `No Environment`; no Postman request was run. The docs describe phone ownership verification before registration and a separate registration step. Because the current sender is already Connected, do not attempt registration/deregistration as a workaround.
- The `messages` webhook subscription and callback were previously configured; the latest evidence is actual UAE inbound START in the AI Source inbox.

## Latest code change and deployment
- Updated the Owner dashboard and verification-request API in `src\worker.js` after the screenshot showed only Meta code 136024. The API now passes through bounded `error_data.details`, user-facing title/message, subcode, type, transient flag, and trace ID when Meta supplies them. The dashboard renders those fields and explains that 136024 means no code/call was issued; it advises against an immediate retry.
- Backup: `_MASTER_CONTROL\snapshot\pre-meta-136024-diagnostics-20261019-141025\` (Worker, release log, and this handoff).
- Latest deployment: Worker version `d263cd99-4880-4edb-bdfd-26fabb4a727f`; schedules unchanged (`0 2 * * *`, `0 4 * * *`, `0 * * * *`).
- Post-deploy checks: Worker root HTTP 200; `/api/health` HTTP 200 with `ok:true`; live root contains extended diagnostic fields and 136024 guidance.
- Validation: `node --check src\worker.js` passed; Wrangler `deploy --dry-run` passed. Full suite still has the two previously known stale WhatsApp wording assertion failures: manual-draft subject expectation and retired paused-provider dashboard wording. These do not exercise the verification diagnostic change.
- No Meta API request, WhatsApp send, code entry, D1 write, or Meta setting change was made. The underlying 136024 rejection remains unresolved at Meta; automatic sends remain fail-closed until `code_verification_status=VERIFIED`.
- Details are recorded in `RELEASE_LOG.md` under `2026-10-19 — Meta phone-code error diagnostics`.

## Recent screenshot / usage note
Owner shared a usage notification reading `10% usage remaining`, resets monthly, next reset `Nov 17 at 10:29 AM`. Treat that as a screenshot observation; verify if needed because the screenshot did not identify the usage meter or timezone.

## Meta error research (2026-10-19)
- Reviewed Meta's official WhatsApp Cloud API Postman collection. It describes the normal phone-ownership code request/verification workflow and registration, but the public collection does not explain code `136024` or prescribe a retry interval. Therefore, do not assert that this is definitely a rate limit, invalid number, or account ban based on the main code alone.
- The error payload from the first refusal was not persisted with its subcode/trace ID. The updated dashboard now surfaces these fields on a future response, if Meta returns them.
- If escalating, use Meta's logged-in developer/business support option available from the app/dashboard; availability can depend on the business account. A concise case description: `WhatsApp Cloud API phone-number ownership verification: POST /{phone-number-id}/request_code with code_method=VOICE returned error 136024 (“Request code error”). WhatsApp Manager currently shows the number Connected and High quality, while Graph phone diagnostics report code_verification_status=NOT_VERIFIED and platform_type=CLOUD_API. No verification code was received and no code was submitted. Please confirm the exact error/subcode and the supported remediation for this existing number. We have not deregistered or re-added it.` Provide phone/WABA/app IDs and any fresh trace ID only in Meta's authenticated support form, never in public posts.
- Meta support may be opened from [Business Support Home](https://business.facebook.com/business-support-home/) or [Meta for Developers Support](https://developers.facebook.com/support/), depending on which support option is available to the signed-in business. No case was submitted in this task.

## Continue from here
1. Do not repeat code requests until there is a reason to try again; the latest voice request just returned Meta 136024.
2. The existing verification form is under **Partner Delivery & Provider Status** in AI Source. Do not request another code immediately after 136024. If a later, deliberate retry is appropriate, choose Voice call and press Request verification code once; inspect all diagnostic fields now shown. If Meta accepts it, the Owner enters the code privately in that form; never ask the Owner to send the code in chat.
3. If Meta again refuses, use the exact subcode/error type/transient flag/trace ID from the updated UI for a Meta support case rather than repeatedly requesting codes. Do not invent an error cause.
4. Once diagnostics report `code_verification_status=VERIFIED` while status is still CONNECTED and platform is CLOUD_API, recheck the WABA and perform one Owner-authorized UAE self-test; wait for a real Meta `delivered` status receipt before claiming delivery.
5. In WhatsApp Manager templates, select production WABA `Pakthai` (not `Test WhatsApp Business Account`) before concluding whether an approved template exists there. The free service-window path itself is a session text message; no paid/template send should be attempted for this test.
6. Do not test Nadeem/Korea again without the Owner's fresh confirmation. Preserve Owner approval requirements for quotes, prices, purchases, and commitments.

## Useful source references
- Meta's official Postman Cloud API collection (read-only docs): `https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api?entity=folder-066d0881-3f31-4f0c-accc-d0fa2e4b2ed9`
- Latest live AI Source: `https://pakthai-ai-sourcing.pakthaitech.workers.dev/`

## 2026-10-19 — Cloud API registration PIN control
- Business Portfolio details were completed and the WhatsApp Business Account review now shows Approved in Meta Business Settings. The production number remains Connected / High.
- Meta's official Register API documentation confirms that a 6-digit `pin` is required by `POST /PHONE_NUMBER_ID/register`; when the business phone does not already have its own two-step verification PIN, this call sets a new one. The personal Facebook/Meta Account two-factor screen is separate and is not used for this PIN.
- Added an Owner-only, password-masked dashboard control to submit a newly created 6-digit Cloud API PIN directly to Meta. It performs a read-before-write check requiring the configured number to report Connected + Cloud API, does not store/log/display the PIN, then refreshes phone diagnostics. Its confirmation dialog must be accepted by the Owner at action time.
- Backup: `_MASTER_CONTROL/snapshot/pre-whatsapp-register-pin-ui-20261019-170000/`.
- Validation before deployment: `node --check src/worker.js` PASS; focused route authorization test PASS (40/40, including unauthenticated registration route denial); Wrangler dry-run PASS.
- Deployed Worker version `c327c3f2-545c-4776-aa11-16397d3e6250` at 100% traffic. Post-deploy public root and `/api/health` both returned HTTP 200; live dashboard HTML contains the masked registration PIN control. No PIN, Meta registration request, SMS/voice request, WhatsApp send, or D1 write was made during deployment.

## 2026-10-19 — Cloud API PIN form browser-validation repair
- The first deployed registration form rejected a valid-looking PIN before opening the confirmation dialog because the browser-side regular-expression backslashes were consumed by the Worker HTML template literal.
- Escaped the browser-side whitespace and six-digit expressions correctly. The Worker-side request validation remains unchanged and still accepts only six ASCII digits.
- Validation: `node --check src/worker.js` PASS; focused route authorization PASS (40/40); local rendered-dashboard PIN regex check PASS; Wrangler dry-run PASS; live root HTTP 200 and confirms the corrected rendered browser regex.
- Deployed Worker version `5aab1cff-f219-47a8-8301-f7ef28043184` at 100% traffic. No PIN, Meta registration request, WhatsApp send, or D1 write occurred during this repair.

## 2026-10-19 — Superseding update: SMB registration endpoint rejected
- Meta Business Portfolio review is Approved. The WhatsApp production number remains Connected / High in WhatsApp Manager, but Graph diagnostics still have not established `code_verification_status=VERIFIED`.
- The Owner explicitly confirmed one browser submission of a newly created Cloud API PIN. Meta rejected it with `Register endpoint is not available for SMB businesses.` (code `100`, type `OAuthException`, trace `AVRN9nHusHeMRDgy2lddEoP`). The PIN must never be recorded or requested in chat. No further `/register` or verification-code request is permitted without a new Meta-supported remedy.
- The PIN registration UI/route was immediately removed from production to prevent another unsupported call. Active Worker version: `a90e2266-528c-41a8-9799-ea183c0ac710` (100% traffic). Existing schedules unchanged. Root and `/api/health` are HTTP 200.
- Meta support case already exists: `29002498606053019`. Send this update through that case when browser access is available:
  `Business Portfolio review is Approved, but the documented Register API is unavailable for this business type. On the existing Connected production number, POST /1426391470555242/register returned: “Register endpoint is not available for SMB businesses.” Meta code 100, type OAuthException, trace AVRN9nHusHeMRDgy2lddEoP. Graph API still reports code_verification_status=NOT_VERIFIED. Please identify the supported SMB-specific action to synchronize this existing Connected number to VERIFIED without requesting another code, registering, or disconnecting it.`
- Do not claim WhatsApp outbound sending or automatic replies are verified/delivered until Meta provides the SMB-specific remedy and Graph diagnostics show VERIFIED. Do not contact UAE/Korea test numbers until then.
## 2026-10-20 — Current Meta state and deployed dashboard safeguard
- Live account details now show the PakThai WhatsApp profile name `Pakthai Tech`, phone `CONNECTED` / quality `GREEN`, subscribed app/webhook callback, and an approved partner-alert template. Graph still reports `code_verification_status=NOT_VERIFIED`; profile review and phone-code verification are separate.
- Meta refused the earlier code request (136024, no code issued) and rejected `/register` for SMB (code 100). Do not retry either operation, disconnect, or re-register. The supported SMB resolution is pending in Meta support case `29002498606053019`.
- Dashboard now uses a read-only refresh to show live phone status instead of offering a code request or code submission. Both Owner-only endpoints return 410 until Meta support supplies a supported remedy. Deployed Worker version `cc32f157-5ef8-4b22-b23a-61cc3b2d7126`.
- Validation: full suite 114/114, route authorization 41/41, Worker/test syntax and Wrangler dry-run pass. Live root and `/api/health` return HTTP 200; live root no longer contains the old code-request action.
- No Meta mutation, verification attempt, WhatsApp message, D1 business-data write, or manual catalog sync was made. Automatic WhatsApp remains blocked until Graph status is `VERIFIED`.
- Separate observation: live catalog status showed 10 HTTP 429 product-detail failures in the latest batch; recheck the next scheduled run before changing catalog-sync behavior.

## 2026-10-20 — Live site and Meta support follow-up
- Read-only browser check: the public PakThai Tech Store reported “Live catalog connected,” 455 products and 299 in stock. Product cards and prices rendered. This is a UI observation, not a fresh source-to-store parity audit.
- AI Sourcing loaded with Owner signed in and database connected, but its sync indicator, counters, automation/cost/country controls and requests stayed at “checking/loading.” A safe reload then showed the secure login form; no credentials were entered, no controls changed, and no manual sync ran. Current dashboard data is therefore unverified; owner re-login may be needed.
- Meta Business Support Home showed 0 Active cases and two Resolved/Completed cases: “Connected production number remains NOT_VERIFIED; SMB registration rejected” (20 Oct 2026) and “WhatsApp Cloud API sender verification fails with error 136024” (19 Oct 2026). Case details/resolution text were not recovered. Opening the linked Support Inbox produced a blank/loading page.
- Meta AI business assistant asserted that the personal Facebook account has a Community Standards restriction dated 15 Sep 2026, but it did not show an Account Status item, case message, or other evidence. Treat this as unverified. Its error-100 explanations also changed between replies (business-verification sync vs. SMB app / Enterprise-only registration); do not act on either explanation as policy.
- The assistant cited case IDs 958077544049329 and 1491493939487318, which were not shown in the Support Home case list and differ from the previously recorded case 29002498606053019. Verify identifiers and the closure notes directly in Support Inbox or with a human Meta agent.
- Meta-authored Cloud API Postman documentation describes the general phone-number `/register` request; it does not explain the SMB-specific code-100 rejection observed on this account. No further code request, register, disconnect, migration, or WhatsApp send was performed. Keep automated WhatsApp fail-closed until Meta provides an account-specific supported remedy and Graph reports `VERIFIED`.
- Meta AI later named case `958077544049329` for the matching Support Home title and said it was Closed; it could not retrieve the closure note. The UI list itself exposes only the matching title/status/date, not the ID. Treat the AI-supplied ID as unverified until a human case view confirms it.
- Meta AI then asserted an account-level Community Standards posting limit dated 15 Sep 2026, but supplied no visible Account Status record or source. Its suggested Support Inbox URL returned “That page doesn't exist”; `facebook.com/support` remained blank/loading. No human support request was submitted and no case was reopened.
- With the Owner's action-time approval, the Help tray's Beta/AI/privacy terms were accepted and the support draft was advanced. Selecting the PAKTHAI TECH Business Manager asset routed it to “We couldn't find restrictions for this asset”; no human-contact option or case-submission control appeared. No new human case was created and no existing case was reopened.
