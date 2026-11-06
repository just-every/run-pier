# sx-pier-c-f82 — missing CAD rate revision refusal

Repository: just-every/run-pier. Product branch: cloud/sx-pier-c-f82. Product head: 545d6788800fea081d486e52754c53f311a3b60f. Parent candidate: 406ba8284a5fc1e54327eed15d0c2c82bda8a0a2. Main integrated: 5d7ffdd81f3b3c86da7252525a93dccaa5e7572f. No PR is required by this repository's branch Verify entry point, and none was opened. One product push succeeded on its first attempt.

The FIX-round override limits this run to blocking A. The full working plan is retained in PLAN.md. No other acceptance point, clause, policy, visual design or follow-up was added.

## Result and cause

Blocking A is repaired. Previously, revision inherited the original USD quote's rate of one before applying the requested CAD currency. That inherited value passed the positive-rate validator and became a purportedly reviewed CAD rate. Now a quote inherits its prior rate only while the currency stays the same. Changing from USD to CAD without an explicit positive rate reaches the existing DECIMAL refusal. A review within CAD can retain its existing reviewed rate.

The production change is ./src/pier/orders.ts lines 170–172. The existing native invoice journey was extended in ./tests/api/costing.test.mjs lines 385–399. It creates, approves and accepts a USD quote; attempts revision into CAD with the rate omitted, null, empty, zero, negative and invalid; compares complete relevant public business state and successful command results across each refusal; then proves explicit conversion, cleared approval and acceptance, retained historical USD approval and acceptance, and same-currency CAD rate retention. There are no new test registrations or removed assertions.

The regression assertion failed against the original base code: body.ok was true where false was required. The same assertion passes after the production change. This was a local regression reproduction, not a repair of a failed CI run.

PROBE SALES-006 A: authenticated POST ./api/pier/commands, quote.revise on an accepted USD quote with explicit CAD line price and omitted usdRate -> HTTP 409, DECIMAL, unchanged orders, invoices, credits, shipments, returns, movements, reservations, retained documents, price lists, positions and successful commands. An explicit 0.75 rate then succeeds, clears approval and acceptance and preserves the original USD rate of one in history. Actual output is probe.json and the executed probe is probe.mjs.

## Checks and custody

Four affected sanity journeys in ./tests/api/costing.test.mjs passed:

- versioned case quotes retain discounted tax PDFs, exact approval and once-only acceptance
- quote approver role defaults to Owner and policy or live role changes revoke open approvals
- native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids
- native tax rules retain per-line destination and origin estimates, refuse unsafe exemptions and recover after restart

Typecheck passed. The native invoice journey preserves the zero-provider-request assertion. All checks execute through the real authenticated Worker and D1 public doors. The fixed clock is 2026-11-06T12:00:00.000Z for the extended journey and separate probe. Logs and command exits are retained in the explicitly selected packet files and receipt.json.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock then check exit=0; views=node src/base/contract-docs.mjs write then check exit=0; ledger=none exit=0.

The contract generator wrote zero documents. Generated ACCEPTANCE.md and ./docs/CLAIMS.md were restored from main and are absent from the product diff. The source lock was regenerated after all product edits, and its final check passed after the no-op rebase. The first-party rer check passed. The existing Node runtime is v24.19.0; the supplied toolchain kept it because it exceeds the minimum pin 22.20.0. pnpm is the pinned 10.12.4. Typecheck emitted only the Node engine warning.

The f81 parent had changed SALES-006's Evidence and Gap cells. CONTRACT.md was restored whole from current main to retain the authoritative judgments, rather than authoring replacement judgments. This restoration appears in the fix commit relative to its parent; the aggregate candidate diff against main contains no CONTRACT.md change. The f81 product commits remain as ancestors and no published history was rewritten. The requirement and acceptance sentences are unchanged. No other writer's product commits were removed.

Every one of the four candidate commits, including all reachable side parents, was checked before the product push. Author and committer are the fleet identity, with no co-author trailers. The cleanup hook remained active and repository hooks were preserved. Added product and test text contains no new email-shaped string or bare repository-shaped prose token. Fleet reports and receipts are outside the product tree and go only to the separate evidence ref.

## Clause accounting and retained boundaries

SALES-006 remains PARTIAL -> PARTIAL. Current source counts are unchanged: 30 done, 57 partial, 11 missing, 98 total. The historical plan extract's counts were not used as live counts. No plan row is rewritten in cloud; relay the SALES-006 row as "blocking A repaired; missing-rate USD-to-CAD revision refuses atomically; existing external remainder unchanged."

The passing native invoice journey reaches acceptance points 1, 2, 3, 4 and 6. This fix closes the gate's missing-rate defect in the currency requirement; it adds no new whole-clause DONE claim. Point 5's live QBO posting and point 7's QBO and Avalara reversals remain unproved. Wider currencies and price lists, broader customer and order-type policies, commercial delegation, connected-channel tax and money closure and actual delivery remain outside this fix. Missing QBO and Avalara account authorization and the Shopify store prerequisite remain named external boundaries. All Base, device, reference-install and other plan holds are unchanged.

CLAIM SALES-006 PARTIAL points=1,2,3,4,6 tests=tests/api/costing.test.mjs#native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids
GAP SALES-006: Live QBO invoice and credit posting and reversals, Avalara commits and reversals, connected Shopify charged-tax acceptance and the previously held wider-scope obligations remain unproved; no provider qualification is claimed.

## Rider and pre-handoff assessment

No DONE claim is made. The rider assessment records the scope honestly:

| Rider | Result | Evidence or boundary |
| --- | --- | --- |
| 1 | PARTIAL globally; fixed outcome passes locally | Existing native journey reaches native outcomes; live ledger and tax outcomes remain held. |
| 2 | PASS for blocking A | Existing journey lines 385–399 and separate HTTP probe exercise both refusal and explicit-rate success with unchanged business effects on refusal. |
| 3 | Exact-SHA CI recorded separately | Push Verify 42227810733 invokes the extended costing journey through the existing API test glob. |
| 4 | PASS for local proof binding | receipt.json records the committed code and test hashes; no relevant byte changed after the passing checks. |
| 5 | Unchanged | No inherited duty, requirement or acceptance sentence changed. |
| 6 | PASS mechanically | Main's CONTRACT.md retained whole; contract write and check pass; generated views excluded. Source counts remain unchanged. |
| 7 | PASS | No acceptance rewrite or new test registration. |
| 8 | Preserved | Existing current-owner CAD and revoked-approval refusals remain in the passing native invoice journey; approval policy journey passes. |
| 9 | PASS in reporting | No provider, legal, tax or live delivery boundary is claimed as proven. |
| 10 | No new default | No policy decision or new authority was introduced. |
| 11 | Pending guarded landing | Main publication, final scan and exact-main Run site remain the maintained Mac lander's responsibility. |

Pre-handoff self-check: (1) the new refusal assertion demonstrably fails against the original code and passes against the candidate tree; exact-SHA CI is reported separately; (2) no assertion was removed, weakened, skipped or moved behind a width condition; (3) existing authority and replay checks remain passing, with no new erasure or disclosure door; (4) this fix touches no screen or control, so it adds no browser or tooltip work; (5) source lock and local checks pass, while publication scan and main Run site remain explicit landing gates. No deployment, outbound business message or provider request was authorized by this fix.

## CI and publication status

Main's exact SHA 5d7ffdd81f3b3c86da7252525a93dccaa5e7572f has successful Verify 41903655513 and Run site 41903655525. Scheduled Nightly acceptance 42087384894 is red; it is an older scheduled result and was not treated as a red main push or as an unrelated repair assignment.

Candidate push Verify: 42227810733, event push, head 545d6788800fea081d486e52754c53f311a3b60f. The initial observation is retained in candidate-ci.json and subsequent bounded REST observations in ci-observations.json. No dispatch, rerun or PR was created. One watcher observes each run at intervals longer than 300 seconds. The final receipt records the observed pending state without claiming a different SHA's success.

Publication scan receipt: commit=545d6788800fea081d486e52754c53f311a3b60f; complete=unestablished; historyScanned=unestablished; findings=unestablished. The cloud adaptation delegates this scan to the guarded Mac lander. This report does not claim READY from the scan or evidence transport. The product branch and evidence ref are separate custody records.

## Terminal handoff

At 2026-11-06T14:15:07.318745+00:00, exact-SHA push Verify 42227810733 remained in_progress with no conclusion. Eight GitHub API calls were used: one main discovery, one candidate discovery and six observations spaced more than 300 seconds apart; two calls remain reserved for any completed-failure diagnostic. The bounded watcher has exited. No completed failing candidate check was observed. No READY or green-CI claim is made: terminal custody is PUSHED, with the exact product SHA already verified on the remote branch. The guarded lander must observe the final Verify result and run its publication and landing gates.

PUSHED branch=cloud/sx-pier-c-f82 head=545d6788800fea081d486e52754c53f311a3b60f
