# sx-pier-f81fix1-pc1

Repository: just-every/run-pier
Branch: cloud/sx-pier-f81fix1-pc1
Candidate: 5a95af2c0899ca5af1342275b69b7337bad2c903
Published continuation preserved: 2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1
Main fetched before the candidate: 5d7ffdd81f3b3c86da7252525a93dccaa5e7572f

## Scope and result

BLOCKING A is fixed by the saved continuation, which this run preserves. A USD quote changing to CAD cannot inherit the USD rate. It must supply a positive, valid CAD conversion. This run adds five lines to the existing HTTP money journey and regenerates its source-lock entry. No production source, interface, policy, acceptance sentence, Status cell, Gap cell, Evidence cell, workflow or dependency pin was changed in this continuation. No follow-up work was taken.

The independent public-door probe on the exact candidate creates, approves and accepts a USD quote. Revising it to CAD with no usdRate returns HTTP 409 with DECIMAL and changes no observed orders, invoices, credits, shipments, returns, movements, reservations, documents, price lists, positions or successful command results. Retrying with 0.75 succeeds, retains the historical USD rate 1, reports USD 9.26 for CAD 12.34, and clears approval and acceptance. No external request occurred.

The committed journey additionally refuses null, empty, zero, negative, malformed and over-precision rates with identical business-state comparisons; checks the rate review's actor; and proves unchanged CAD pricing can retain its previously reviewed 0.75 rate. Existing assertions were preserved. No test registration was added or removed.

SALES-006 remains PARTIAL. Counts before and after: 30 done, 57 partial, 11 missing, 98 total. Plan rows changed: none. The campaign target row remains PARTIAL. Full provider-backed completion was outside this gate-fix assignment and is not claimed.

## Plan and completed work

1. Refresh fleet setup, install the credential helper and commit hook, clone full history, and check out the declared continuation branch at its saved head.
2. Inspect the failed run and current code; run the existing CAD money journey on the saved head before adding any assertions.
3. Extend that existing public-door journey for the same missing-rate finding, including unsafe refusal and valid recovery. Preserve all published history.
4. Run the touched journey and typecheck with Node 22.20.0, first-party checks, generator write and check, generated-view restoration, source-lock generation and its check.
5. Fetch main and merge it without rewriting the saved branch. Inspect all five candidate commits, including their author, committer and trailers. Commit through the active fleet hook and push the named branch through cloud-push.py.
6. Bind the independent HTTP probe and committed journey to the exact candidate, observe its push Verify through one budgeted watcher, publish this complete explicit packet through the separate evidence ref, and remove the product clone after transfer.

## Frozen finding rubric

| Item | Public door and evidence | Result |
| --- | --- | --- |
| A: missing CAD conversion must refuse when revising USD to CAD | `tests/api/costing.test.mjs` line 381 creates an accepted USD quote; lines 385 to 388 attempt unsafe currency changes using the snapshot helper at lines 378 to 380; lines 389 to 395 prove explicit-rate recovery and same-currency retention. Test: native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids. Independent `probe.mjs` and `probe.log` run against the exact candidate. | PASS locally; exact-SHA Verify recorded separately below. |

## Acceptance mapping, with existing boundaries retained

These rows identify what the one touched money journey demonstrates. They do not widen this fix round or claim provider proof.

| SALES-006 point | Evidence in `tests/api/costing.test.mjs`, test native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids | Result |
| --- | --- | --- |
| 1: two partial shipments with separate freight | Lines 326 to 348; independently checks distinct quantities, charges and totals | Native PASS |
| 2: prepay before shipment without second charge | Lines 356 to 360 | Native PASS |
| 3: Net 30 dates from invoice dates | Lines 339 and 345; CAD dates also checked at line 431 | Native PASS |
| 4: returned-line linked credit | Lines 346 to 351; original-currency CAD credit at lines 434 to 438 | Native PASS |
| 5: once-only QBO posting and customer balance | Native invoice, credit, payment and balance assertions exist; QBO sandbox and connected posting are not supplied | PARTIAL, provider boundary unchanged |
| 6: immutable authorized invoice and retained CAD rate with USD value | Lines 343 to 344, 363 to 364, 381 to 438; unsafe rate refusal and explicit recovery covered through HTTP | Native PASS |
| 7: unpaid void, ledger and tax reversal, retained reason, uninvoiced quantities and paid refusal | Native void and quantity reuse at lines 351 to 355; connected QBO and Avalara reversals remain unproved | PARTIAL, provider boundary unchanged |

The requirement names TAX-001, ACCOUNT-001, ACCOUNT-002, CHANNEL-002, PAY-001 and SALES-002 receiving duties. No inherited connected-provider duty is newly claimed. Tax remains an owner-maintained estimate and external posting statuses remain pending.

## DONE-RIDERS review

No DONE claim is made. Rows below explain the boundary on this candidate.

| Row | Result | Evidence or remaining condition |
| --- | --- | --- |
| 1 | PARTIAL for full clause; PASS for finding A | Exact-candidate public HTTP journey and probe reach unsafe refusal and supported recovery. Connected provider outcomes remain unproved. |
| 2 | PASS for finding A | Populated accepted USD quote, unchanged business snapshots after each refusal, then valid CAD recovery. |
| 3 | PENDING CI observation | Push Verify 42273553863 is bound to the full candidate SHA. The journey is in the existing API test glob run by Verify. No CI conclusion is inferred from local proof. |
| 4 | PASS local | `costing-candidate.log` and `probe.log` were run after the final commit. |
| 5 | INSPECTED | Existing receiving duties stay as written; no inheritance or contract change. |
| 6 | PASS mechanical | Generator write and check both exit 0. Views restored from origin/main and uncommitted. Status and evidence diff against main is empty. |
| 7 | PASS | No acceptance or ruling edits. |
| 8 | PASS for finding A | Owner's supported correction completes; unsafe rate changes refuse atomically. Existing current-owner and revoked-owner paths remain in the passing journey. |
| 9 | PASS boundary | No provider posting, tax settlement, legal or physical acceptance is claimed. |
| 10 | NOT APPLICABLE | No new policy default was adopted. |
| 11 | PENDING guarded lander | Main equality, full-history publication scan and exact-main Run site are not cloud receipts. |

## Pre-ready self-check

1. Finding A has an HTTP money journey with unsafe refusal and valid recovery; the exact-SHA CI conclusion is recorded below.
2. No existing assertion was removed, narrowed, skipped or moved behind a condition. The test count is unchanged.
3. Current-owner and revoked-owner checks remain in the passing native journey. This run introduces no erasure, capture, egress or authority path.
4. No screen or interface control changed; no new browser proof is claimed or required for this test-only continuation.
5. Source lock, typecheck, first-party and contract generation pass. Added text has no email-shaped or bare repository-shaped prose token. A cloud publication scan was not run, as authorized by the cloud adaptation. Its exact-SHA complete and findings values remain unestablished pending the guarded lander; no zero-findings result is invented.

## Checks and custody

- `node --test --test-name-pattern='native shipment and prepay invoices' tests/api/costing.test.mjs`: PASS on the saved head, after the assertions, and on the exact final candidate; one existing journey, no failures.
- `pnpm run typecheck`: exit 0 with Node 22.20.0.
- `pnpm exec rer check --profile first-party`: exit 0.
- `node src/base/contract-docs.mjs write` then `check`: exit 0. Restoration of both generated views: exit 0.
- `node scripts/edition-authoring/cli.mjs lock` then `check`: exit 0. Regeneration after the commit produced a clean tree.
- Migration ledger: not applicable; no migration changed.
- `git fetch origin main` then `git merge origin/main`: already up to date. Published ancestry retained, no rebase or force push.
- All five candidate author and committer identities are fleet; no trailers. Contract diff against main is empty. See `identity-and-scope.json`.
- Product push succeeded on the first attempt, through the fleet guard; see `push.log`. No PR was needed: Verify has a branch push entry point.

MECHANICAL lock=node scripts/edition-authoring/cli.mjs lock and check exit=0; views=node src/base/contract-docs.mjs write and check exit=0; ledger=none exit=0

## Previous Verify failure

Run 42228367126 at 2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1: plan succeeded; rer-verify job 127927604863 was cancelled; aggregate verify job 127949866256 failed. There was no reported failed assertion in rer-verify. The required failed-log command for each cited job returned exit 0 with zero bytes; one full cancelled-job archive read also returned zero bytes. No blocked blob URL was retried.

On the failed SHA in a detached worktree, the exact aggregate shell command was run with its observed needs values: PLAN=success, SKIP=false, RESULTS='success cancelled'. It exits 1 because the cancelled prerequisite is not success. That is the reproduced infrastructure aggregation failure, not a fabricated product test failure. See `verify-reproduction.json`. No workflow edit or product repair was guessed. The original CAD regression passes at that SHA. A new real test-extension commit starts a fresh candidate Verify.

The initial independent probe expected HTTP 400, but Pier's public command API maps business refusals to HTTP 409. It received 409; the probe was corrected to assert the established public API status, then verified DECIMAL and unchanged business effects. Both actual logs are retained. No committed assertion was weakened.

## Claim and probe

CLAIM SALES-006 PARTIAL points=1,2,3,4,6 tests=tests/api/costing.test.mjs#native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids
GAP SALES-006: Existing QBO and Avalara posting and reversal proof, wider currencies, order-type policy and connected-channel closure remain outside this single-finding repair; no status promotion is claimed.
PROBE SALES-006 A: POST /api/pier/commands quote.revise USD to CAD with usdRate omitted -> HTTP 409 DECIMAL; business state and successful command results unchanged; explicit 0.75 -> HTTP 200 CAD with USD 9.26, historical USD rate 1 and renewed approval required; outbound=0

## Exact-SHA workflow observation

Verify run 42273553863, event push, full SHA 5a95af2c0899ca5af1342275b69b7337bad2c903 was in progress at 2026-11-06T18:50:35Z. Workflow URL: https://github.com/just-every/run-pier/actions/runs/42273553863. No branch CI conclusion, main equality, publication scan or Run site result is inferred from the saved parent run. The final observation is recorded in ci-latest.json and RESULTS.json.

## Terminal result

PUSHED branch=cloud/sx-pier-f81fix1-pc1 head=5a95af2c0899ca5af1342275b69b7337bad2c903

At 2026-11-06T19:00:35Z, exact-SHA push Verify run 42273553863 remained in_progress with no conclusion. Eight GitHub calls have been used: prior job metadata; two failed-job archive reads; one cancelled-job full archive read; exact-SHA discovery; and three status observations spaced five minutes apart. The final two-call allowance is reserved for job metadata and one failed-job diagnostic if a failure is observed. The cloud adaptation permits PUSHED when Verify is still running as the call budget runs short. No further CI polling or dispatch is started. There is no known real product failure and no BLOCKED claim.

This packet is a report transfer, not product acceptance or landing. The maintained fleet still owns exact-SHA Verify completion, the complete full-history publication scan and main landing. Publication scan fields are commit=5a95af2c0899ca5af1342275b69b7337bad2c903, complete=unestablished, historyScanned=unestablished, findings=unestablished. Main equality is false: this is branch-only work. Run site has no run id for this candidate because this cloud never pushes main.

The local focused money journey, typecheck, first-party checks, generator write and check, view restoration, source-lock generation and freshness check all pass. Status remains PARTIAL; counts stay 30 done, 57 partial and 11 missing. No new policy default, provider proof, PR, deployment or status promotion was introduced. After evidence transfer and remote-ref confirmation, the clone and dependencies are removed; the actual packet remains outside the clone.
