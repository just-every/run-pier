# sx-pier-c-f81 — native CAD quote completion

Product repository: just-every/run-pier. Product branch: cloud/sx-pier-c-f81. Candidate: `406ba8284a5fc1e54327eed15d0c2c82bda8a0a2`. Baseline main: `5d7ffdd81f3b3c86da7252525a93dccaa5e7572f`.

SALES-006 remains **PARTIAL → PARTIAL**. The selected native CAD work is complete; full clause acceptance still needs the held provider and accounting work. Counts remain **30 done, 57 partial, 11 missing, 98 total**. No acceptance sentence, other clause status, homepage, logo, Base pin, workflow or migration changed. No permanent test registration was added, removed, skipped or narrowed.

The work plan is retained in PLAN.txt. The only planner row changed for the lane is SALES-006: remove native CAD quoting from its implementation gap and retain the full external and wider-policy remainder. TAX-001 has no remaining supplied native point in these files beyond its implemented table path; its Avalara and Shopify obligations remain held.

## Result

Current owners create CAD quotes using explicit CAD base-unit prices and a positive reviewed USD value for one CAD. A missing CAD price cannot reuse a USD customer price tier. Quote and line currency mismatches, unsupported currencies, missing, zero, negative, malformed and over-precision rates refuse atomically.

The quote retains its currency, rate, review provenance and USD value. Revisions preserve historical versions, clear approval and acceptance, and require fresh exact-version review. This includes revising a previously accepted but unshipped CAD quote. Accepted currency, line prices, exchange rate and accepted quote version flow into actual partial-shipment invoices. A draft refuses replacement prices or a different rate or currency. Existing reviewed conversion of a USD order into a CAD invoice remains supported.

Linked credits keep the invoice currency and rate. Customer balances remain separated by currency. Shipment revenue and kit-return revenue convert through the retained rate before comparison with USD physical cost. Line margin displays use that same USD basis. Quote and invoice PDFs retain source versions, native amounts, exchange rates and USD values; old PDF bytes survive revisions, later credits and restart.

The UI adds currency and rate fields to the existing forms, shows CAD price labels and correct amount tooltips, inherits the selected CAD order's rate in the invoice form and offers visible mismatch recovery. Revision now keeps ZIP optional, matching creation. Existing operator price visibility does not expose CAD commercial terms: current state and command results use the existing bounded physical projection, while current-owner creation, revision, approval and acceptance remain enforced. USD role behavior is preserved.

Tax uses the existing owner-maintained estimate with a valid reviewed resale reference. Native CAD tests assert `providerCommit=not-configured` and zero outgoing provider requests. No provider tax, delivery, legal qualification, refund or external posting is claimed.

## Public-door proof map

| Selected outcome | Real authenticated public door and assertions |
| --- | --- |
| Explicit CAD prices and positive rate, without USD tier reuse | `tests/api/costing.test.mjs:369`, inside “native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids”: creates a USD tier, refuses a missing CAD price, invalid rates and currency mismatches, then reads the exact CAD snapshot. |
| Exact accepted source, two partial shipments, freight and native USD values | Same journey at lines 391–418: accepted-quote rate revision invalidates approval; stale acceptance and invoice review refuse; actual dispatches of two and one units produce source-version-linked CAD invoices. Expected quantities, amounts, rate and physical costs are calculated independently from public exports. |
| Original-currency credit and separate balances | Same journey at lines 419–433: returns one actually shipped unit, refuses a USD credit against the CAD invoice and authorizes its linked CAD credit. Balances reconcile independently without changing USD receivables. |
| Restart, replay and current authority | Same journey at lines 434–465: repeated creation, acceptance, invoice drafting and credit authorization recover their durable results with no second effect. Operator reads and results omit CAD financial fields while retaining permitted physical quantities. Operator creation, revision and approval refuse, including a delegated USD quote-approval policy. Revoked-owner approval and recovered-result admission refuse with unchanged business state. |
| Retained documents | `tests/api/packing-documents.test.mjs:83`, inside “business PDFs retain every live document kind, Unicode, aliases, packs and edited template versions”: opens actual generated CAD quote, partial invoice and credit PDF bytes, reads native and USD values and exact partial quantities, checks document source versions and compares retained bytes after revision and restart. |
| Operated UI and recovery | `tests/browser/journey.spec.ts:1926`, “native tax rules show owner configuration, review recovery and retained quote and invoice calculations”, CAD continuation at line 1978: operates creation, invalid-rate refusal, missing-price refusal, revision, renewed review, acceptance, actual partial dispatches, inherited CAD invoicing, rate-mismatch recovery, authorization, PDF generation, second partial invoice and reload. Assertions operate at 1440; changed screens are captured at 1440 and 390. |
| Existing authority boundary | `tests/api/security-import.test.mjs`, “scoped warehouse receipts, picks, packs, slips and dispatch retain physical authority after revocation” and “commercial role reads, downloads and recovered results enforce current cost and price restrictions” retain their existing assertions. |

These API journeys are in Verify's existing API glob. The browser journey is already invoked by the existing `verify:app` command's native-tax selector. No workflow or command selector was changed.

PROBE SALES-006 explicit-CAD: quote.create with a USD tier but no CAD price -> CAD_PRICE and no business change; explicit CAD 12.34 at USD rate 0.75 for three units -> CAD 37.02 and USD 27.77.
PROBE SALES-006 material-revision: accept the CAD quote, revise rate to 0.8 -> approval and acceptance cleared, original accepted history retained; stale and unapproved acceptance refuse; renewed review and acceptance succeed.
PROBE SALES-006 partial-invoices: dispatch two and one units; invoice.draft inherits CAD 12.34 and rate 0.8 -> CAD 25.79 with freight 1.11, and CAD 12.89 with freight 0.55; USD 20.63 and 10.31. Mismatched currency, rate and replacement prices refuse atomically.
PROBE SALES-006 credit-and-balances: return one original dispatched unit, authorize linked credit -> CAD 12.34 and USD 9.87; total CAD receivables 39.30 including the retained baseline CAD invoice, while USD receivables remain 25.76.
PROBE SALES-006 physical-cost-and-margin: public exported receipt cost is USD 2.25 per unit -> two-unit cost 4.50 and one-unit cost 2.25; USD revenue 19.744 and 9.872, with USD margin 15.244 and 7.622.
PROBE SALES-006 documents-and-recovery: retained PDF downloads show CAD, source price, rate and USD value; exact bytes remain equal after quote revision and restart; command replay produces no duplicate business effect.
PROBE SALES-006 authority: an operator's permitted physical quote has quantity one but no CAD price, total, rate or USD total; operator mutation and delegated approval refuse; a revoked reviewing owner's acceptance and recovered result refuse. Native CAD provider request count is zero.

## Checks and custody

Final command receipts and complete non-secret outputs are published alongside this report. Earlier receipts at `1c63b4a60176c145d448194b9678a5ce335a7a22` are retained as prior work, not substituted for final-head proof. That earlier head passed the full 13 tests in the two touched API files. The final-head targeted API proof also reruns the financial and document paths plus the two affected authority regressions.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock, then check exit=0; views=node src/base/contract-docs.mjs write, then check, then restore origin/main's generated views exit=0; ledger=none exit=0.

Local contract generation succeeds. ACCEPTANCE.md and docs/CLAIMS.md are restored from origin/main and are absent from the product diff. The source lock was generated last after the final changes and checked. Every commit retains every parent Status row; total table-row count stays 289. All three candidate commits use the fleet author and committer, with no trailers. Every product push used the cloud push guard; all succeeded on the first attempt. Main was fetched and merged before the final candidate; it had not moved. No PR is needed because branch push starts Verify.

Final Verify **42221995815**, event push, exact head `406ba8284a5fc1e54327eed15d0c2c82bda8a0a2`, completed with conclusion failure. Its only root failing step is job **127906123023**, step 7, `node src/base/contract-docs.mjs check`: “ACCEPTANCE.md: generated content differs; run contract-docs write.” Aggregate job **127906242854** fails because its required job failed. Both failed-job archives were read successfully once; relevant logs are retained with routine environment blocks omitted. No transport failure or real assertion failure was observed.

This is precisely the supplied generated-view exception. The native contract write and check pass locally, then the views are restored for the lander. The expected stale-view check also reproduces exit 1 on the exact candidate. No generated file was committed, no Verify rerun was dispatched and no workflow guard was weakened. The cloud handoff uses the permitted exception; downstream CI assertions skipped after that step are not called green.

On the final head, **8 targeted financial and PDF API journeys, 2 existing authority API regressions and 1 browser journey pass**. Production build, typecheck, first-party check, fresh source lock check and local generated-view write and check also pass. The final browser command took 98.69 seconds including its fresh installation; its Playwright journey took 39.5 seconds. Final receipts bind each command to the full SHA.

Baseline main had successful Verify 41903655513 and Run site 41903655525. Nightly acceptance 42087384894 failed; this predates the change and is not a main push failure. An initial lookup of the stale contract provenance SHA returned old Verify 40855319738; it is not evidence for this candidate. Prior branch candidate Verify 42221386661 belongs to `1c63b4a60176c145d448194b9678a5ce335a7a22` and is not substituted for the final head.

Publication scan and guarded landing remain with the maintained Mac lander. No cloud scan result, main equality, final Run site result or completed landing is claimed. The product branch is the only product ref pushed. Evidence is published separately to evidence/sx-pier-c-f81.

## DONE-RIDERS and self-check

No DONE claim or judge request is made. The following records the applicable boundary rather than representing external acceptance as complete.

| Rider | Result and evidence |
| --- | --- |
| 1 | Native CAD outcomes reached through the named public-door journeys. Full-clause provider outcomes remain unproved; status remains PARTIAL. |
| 2 | Pass for the native slice: real seeded business data, independent export calculations, successful money paths and atomic unsafe refusals in the costing journey. |
| 3 | The proofs are loaded by existing Verify commands. Exact final workflow status is recorded above; the generated-view exception does not claim that skipped downstream assertions ran in CI. |
| 4 | Final-head receipts identify their actual SHA. Final screenshots come from the final-head browser run. Earlier receipts are explicitly labeled. |
| 5 | Existing requirement names foreign-currency sales and retained USD value. No inherited Base duty is newly claimed; the unprovided Base-ID hold remains unchanged. |
| 6 | PARTIAL Gap retains all provider, broader-currency, policy and delegation work. Evidence is updated; write and check succeed locally; generated views are deliberately restored for the lander. No stale DONE count or judgment is introduced. |
| 7 | Pass: no acceptance-point edit, split, rewrite or status promotion. All parent rows remain. |
| 8 | Pass for the native slice: current-owner admission, denied operator commercial views and mutations, revoked reviewing-owner refusal, stale-version refusal and unchanged business snapshots. Existing credit, immutable-original and paid-void assertions remain. |
| 9 | Pass boundary: provider tax and ledger posting stay pending, no live provider receipt or legal or delivery acceptance is claimed. |
| 10 | Existing conservative owner-only boundary is retained, consistent with RL-101; broader engineering remains a Gap. No new delegation or automatic outbound authority is added. |
| 11 | Pending guarded landing: main equality, publication scan and final Run site belong to the lander. No landed or DONE count is claimed. |

The selected user-visible outcomes have money and authority assertions that fail when the observed result is wrong. Existing assertions were preserved. The existing native-tax journey retains its erased-customer capture-replay proof; this work adds no new personal input or external transmission. New CAD tests cover revoked owners and durable replay. New controls use the existing labeled fields and buttons, with no new icon-only controls; changed screens use the existing typography and complete field borders. Configuration remains in Settings. Added text was inspected for new email-shaped strings and accidental repository-like prose tokens; unrelated existing fixture text was preserved.

During local work, the first CAD browser run exposed an optional-create versus required-revision ZIP mismatch and timed out waiting for a submit that native validation prevented. Revision was fixed to preserve the optional ZIP. A subsequent browser run passed in 41.5 seconds before the exact final-head rerun. This was a local functional fix, not a CI repair or a weakened assertion.

Full SALES-006 completion remains held by Avalara sandbox access and the Shopify store, plus the separate unlanded QBO slice. QBO invoice and credit posting and reversals, Avalara commits and voids, taxable or foreign-currency external posting, wider currencies and price lists, broader customer and order-type policies, connected charged-tax and payment and refund and payout closure, actual document delivery, wider commercial and typed-field delegation, shared MCP, reference-install, device and Base holds remain unchanged.

The disposable product clone is removed after successful report publication and remote custody verification. The packet remains outside the clone.
