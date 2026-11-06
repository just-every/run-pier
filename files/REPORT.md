# sx-pier-f81fix1: gate finding A fixed

Repository: just-every/run-pier
Branch: cloud/sx-pier-f81fix1
Full candidate: 2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1
Stacked base: 406ba8284a5fc1e54327eed15d0c2c82bda8a0a2
Main integrated before publication: 5d7ffdd81f3b3c86da7252525a93dccaa5e7572f

The owner can no longer revise an accepted USD quote to CAD without entering a conversion rate. The authenticated command returns HTTP 409 with DECIMAL and leaves orders, historical terms, approval, acceptance, invoices, credits, shipments, returns, stock movements, reservations, retained sales documents, price lists, stock positions and successful command results unchanged. Explicit rate 0.75 succeeds, records CAD 12.34 as USD 9.26, retains the prior USD version and clears approval and acceptance. A subsequent revision within CAD retains the reviewed CAD rate.

Only gate finding A was repaired. In ./src/pier/orders.ts, lines 170 and 171, the prior rate is inherited only when currency is unchanged. The existing journey in ./tests/api/costing.test.mjs, lines 378 through 390, now performs the unsafe currency change and supported explicit-rate recovery through the real authenticated Worker and D1 route. No existing assertion was removed, narrowed, skipped or conditionally hidden. No new test registration was added: the touched file remains at ten tests. No UI, homepage, logo, provider adapter or workflow was changed by this fix.

## Plan and execution

The complete four-step plan and its completion are in PLAN.md. The sequence was: reproduce the missing-rate acceptance; repair the currency-aware default and extend the existing journey; run touched tests, typecheck and mechanical checks; commit and push the exact candidate and publish report custody separately. No queue, lane plan or inbox file was accessed or changed. The only plan-row update to relay is SALES-006 gate finding A fixed; clause status stays PARTIAL.

The inherited stacked base carried an outdated SALES-006 Evidence and Gap row. CONTRACT.md was restored from current main whole to preserve the main writer's judgments; the normalization patch is included in this packet. It changes no acceptance text or status and drops no row. The final diff from origin/main to the candidate has no CONTRACT.md changes. This normalization appears in the fix commit relative to its stacked parent; it was necessary to satisfy the required main contract equality. Generated ACCEPTANCE.md and ./docs/CLAIMS.md were restored from main after generation and are not committed. The source lock was regenerated last with the documented command. Rebase onto origin/main reported the named branch already current. No published branch was rebased or force pushed.

## Proof

- Before repair, the new regression failed on the stacked base with exit 1: AssertionError, true !== false, because quote.revise accepted the missing CAD rate. See regression-before.txt.
- After repair, all ten tests in ./tests/api/costing.test.mjs passed. See costing-after.txt. No relevant source or test bytes changed between this run and the candidate.
- The affected invoice journey passed again on exact candidate 2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1. See exact-head-test.txt.
- Typecheck and first-party checks passed. See typecheck.txt and first-party.txt.
- The standalone authenticated HTTP probe passed again on the exact candidate, with the refused and allowed cases and same-currency retention. See probe-A.mjs and probe-A.txt.
- Contract write and check both exited zero; the views were restored whole from main afterward. The restored candidate's contract check also passed. The source lock check passed on the clean committed candidate. No migration changed, so no migration-ledger check was applicable.
- All four candidate commits, including the stacked parents, had the fleet author and committer and no trailers. The fleet push guard published the named product branch on its first attempt. See product-push.txt.
- New source and test additions contain no email-shaped strings or bare prose slash tokens. Existing public fixtures were preserved. No private credentials, environment dumps or private gate materials are in this packet.

PROBE SALES-006 A: POST /api/pier/commands quote.revise, accepted USD quote to CAD with usdRate omitted -> HTTP 409 DECIMAL, unchanged business effects; explicit 0.75 -> CAD with retained rate and USD 9.26, prior approval cleared.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check, restore main views exit=0; ledger=none exit=0.

## Clause proof and remaining boundaries

CLAIM SALES-006 PARTIAL points=1,2,3,4,6 tests=tests/api/costing.test.mjs#native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids

Acceptance 1: actual partial shipments have separate quantities and freight, asserted at lines 329 through 348.
Acceptance 2: prepay before shipment refuses a second charge, lines 355 through 360.
Acceptance 3: Net 30 dates are exact, lines 338 and 348, plus native CAD invoices at lines 423 through 426.
Acceptance 4: linked returned-line credit, lines 349 through 354, plus original-currency credit at lines 428 through 433.
Acceptance 5: PARTIAL. Native customer balance and replay are exercised, but actual QBO posting is not established.
Acceptance 6: immutable authorized originals and retained CAD rate and USD value, lines 340 through 343, 381 through 407 and 423 through 426. Finding A's missing-rate refusal and unchanged-state assertions are at lines 378 through 390.
Acceptance 7: PARTIAL. Native void history and shipment reuse are exercised at lines 355 onward in the USD section, but QBO and Avalara reversals are not established.

GAP SALES-006: Authorized QBO and Avalara accounts and actual posting and reversal proof remain unavailable; broader currency, commercial delegation, connected channel settlement and document delivery obligations remain outside this finding-only fix. Native proof supplies no provider or legal qualification.

No new policy default was adopted. Counts before and after: 30 done, 57 partial, 11 missing, 98 total. SALES-006 remains PARTIAL; no clause was promoted or demoted.

## DONE riders and self-check

1. PARTIAL overall: the existing journey reaches native outcomes; QBO and Avalara outcomes remain explicitly unproved. Finding A is proved at lines 378 through 390.
2. PASS for the fix: unsafe missing-rate revision is refused atomically; explicit-rate recovery succeeds with independent expected USD 9.26.
3. Recorded push Verify 42228367126 is bound to the exact full candidate; final observation is recorded below. No inherited green result is substituted.
4. PASS for local proof: the affected journey, HTTP probe, typecheck and lock check ran on the exact candidate; the complete costing-file run has identical source and test bytes.
5. INSPECTED: no new inherited duty or clause text changed.
6. PASS mechanically: generation and check succeed; main's status judgments and generated views are retained.
7. PASS: no acceptance text or policy ruling changed.
8. PASS for existing native authority coverage: the same costing journey still refuses non-owner CAD creation, revision and acceptance and revoked-owner access; this fix adds no permission.
9. PARTIAL overall: real external accounting and tax boundaries remain named and unclaimed.
10. PASS: no new custody, consent, spending or authority default.
11. PENDING guarded lander: this cloud publishes only its named branch. Main equality, Run site and publication scan are not claimed.

Pre-ready self-check: the new unsafe path failed before repair and passes afterward; all existing assertions remain. Revocation and replay assertions in the touched journey passed unchanged. No erasure path changed. No screen changed in this fix, so no new browser capture was needed for finding A; the base's screen evidence was not rerun or represented as new exact-head proof. Source lock is fresh. No actual external money movement or document delivery is claimed.

Publication scan text: commit=2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1 complete=NOT_RUN historyScanned=NOT_RUN findings=UNKNOWN. Cloud publication scanning is not available or required; the maintained Mac lander must require COMPLETE and zero findings before landing. Main equals candidate: false. Run site candidate run id: none; main was not pushed. No PR was required or created because Verify runs on push.

## CI and custody

Initial exact-head discovery at 2026-11-06T13:48:04Z: push Verify run 42228367126 in_progress, conclusion null. URL: https://github.com/just-every/run-pier/actions/runs/42228367126. The initial query mistakenly used an abbreviated SHA and returned no runs; it is not evidence. Subsequent observations use the full candidate SHA and respect the five-minute per-run polling interval. Final observation and handoff status are appended before evidence publication.

The product push is separate from evidence publication. Only the product, contract normalization and source lock are on the product branch. All report files are explicitly selected for the evidence-only ref. No main push, default-branch update, provider action or manual landing occurred. The guarded fleet owns final scanning, exact-head Verify, integration and Run site. Finished work is already pushed; there is no unpushed product work.

Final permitted CI observation at 2026-11-06T13:53:05Z: push Verify 42228367126 remains in_progress with conclusion null on exact head 2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1. Three GitHub calls were used, including the initial abbreviated-SHA query that returned no runs. No workflow was dispatched or rerun. Product status is PUSHED, not a claim of green Verify or product landing. There is no known failing check or product blocker in this fix. The maintained fleet must finish exact-head CI and scanning before landing.

The clone is removed only after successful evidence publication. The complete packet remains at $HOME/rer-consolidation/work/sx-pier-f81fix1/packet/ outside the product clone. No unfinished local command or server is retained.
