# sx-pier-ci-critical-path-1

Repository: just-every/run-pier
Branch: cloud/sx-pier-ci-critical-path-1
Final candidate: 4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad
Published save: 274d44c3fe994507dad29a6d9d78dd12c2cd7549
Base: 5d7ffdd81f3b3c86da7252525a93dccaa5e7572f
PR: none; repository instructions reserve guarded landing to the fleet.

## Result and exact workload map

Only .github/workflows/verify.yml and its generated sources.lock.json entry change. Product, tests, migrations, CONTRACT.md and generated views are unchanged. Clause status changes: none. Before/after counts: 30 done, 57 partial, 11 missing, 98 total. No product acceptance claim.

| Before: one serial rer-verify job | Final candidate destination |
| --- | --- |
| contract-docs check; rer check --profile first-party | build-checks, same commands |
| verify:app production build and typecheck | build-checks, same commands |
| verify:app site and emitted Worker email-link assertions | build-checks, same commands |
| verify:app API suite, concurrency 1 | api-1..4; every one of 33 files once; concurrency 1 inside each isolated runner |
| complete portable.mjs | portability, unchanged |
| 16 verify:app browser invocations | browser-1..3; original argument vectors and fresh real setup/dev installations |
| connector STOCK-001, BUY-003, WMS-003 | browser-1..3; original selectors, test bodies, screenshots and widths |
| spend-authority in both verify:app and connector step | one execution of the unchanged assertion |
| rer verify post-app hosted-output and hydration | build-checks; exact installed functions, same adapter declaration/public pages |
| explicit rer build --site --no-queue | build-checks, retained |
| always-upload screenshots | per browser shard, unique names, same seven-day retention |
| plan reuse/concurrency; final aggregate gate | reuse/concurrency unchanged; gate requires plan, build-checks and all shards |

Eight assertion shards total: four API, three browser, one portability. Browser groups contain 7 / 6 / 6 original invocations and select 9 / 6 / 6 registrations. API file groups have 9 / 8 / 8 / 8 files, balanced by source bytes as an initial heuristic. Build/checks run in parallel with those shards; the production artifact is built once and shared by email, hosted-output and hydration checks within build-checks. Fresh browser/portability installations still perform the real public lifecycle that their existing assertions require.

API files: 33 -> 33. Selected browser executions: 22 -> 21; distinct identities: 21 -> 21. Browser setup/dev invocation boundaries: 20 -> 19, removing only the duplicated spend-authority run. Test bodies/registrations/widths changed: zero. Omissions, extras and duplicate final identities: zero. No full duplicate suite, test deletion/skip/weakening, retries, mock/fallback, timeout relaxation or threshold increases were introduced. All original browser invocation boundaries are preserved, including existing multi-test selectors. Browser commands retain a 1200-second cap. Job/test limits are unchanged.

The workflow derives commands from current package verify:app and refuses unsupported command shapes instead of silently dropping new work. API discovery includes every current *.test.mjs. WORKLOAD-MAP-FINAL.md and assertion-final-map.json contain every exact browser identity, original argument vector and API file assignment.

## Custody and original product protection

Before edits, the latest 100 workflow runs showed no live run or newer CI-shape writer. The only matching CI-shape branch refs were sx-pier-cishape-1 and sx-pier-ready-cishape1, both e880b0ea3fd4bb2ecb968d0520697cb45618c5d9; shipped disposition says those rounds ended on 27 October. No INBOX/STATE or Mac work/log inputs were read.

Fetched cloud/sx-pier-f81fix1 and immutable 2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1; branch matched exact source. Its workflow matches main. No unlanded product repair or f82 stacked delta is carried in this branch. Original FIX1, original PASS WITH FOLLOW-UPS, all product holds and the exact-source product gate remain unchanged. When the repair is integrated by its owner, this workflow operates on that merged checkout's complete API files and original browser selectors (including its expanded native-tax/CAD assertions). This CI branch neither accepts nor lands the product.

## Actual diagnosis and timing

Baseline Verify 42228367126 on exact product repair 2e3a0301bd0b7bbe0a7be1c9cf0a363eeee3dff1 completed/cancelled. Job 127927604863 spent 40m05s in rer verify and 2s in explicit site build. Connector recovery then ran 4m38s before the 45-minute job boundary. This was a real critical path, not lost-runner evidence. Baseline jobs/step timestamps are in baseline-jobs.json. The single permitted gh run view --log-failed request for that cancelled job returned zero bytes; no per-test times are invented.

The target remains <=10 minutes with longest shard <=1.5 times mean. Final durations are UNMEASURED. Those goals cannot be claimed from file-size balancing or the local discovery map. No assertion was dropped to meet them; the lander must record the actual exact-final wall and any remaining imbalance.

## Local validation and implementation correction

Read launcher AGENTS.md, repository AGENTS.md, shipped RULES and the pinned rer 0.2.79 lifecycle. actionlint 1.7.7/YAML validation pass. Executed the actual final workflow partitioner: eight nonempty shards. Playwright --list --reporter=json proves every original browser identity is selected exactly once by final commands. API file partition coverage is exact. No test bodies or full suite ran locally.

Focused production build passes with CI=true through cloud_run; typecheck passes after it generates the ignored route tree. Earlier missing-route typecheck and --no-queue-without-CI refusals were corrected as command prerequisites, without product edits. The initial direct hosted-output/hydration command hung. Diagnosis proved Miniflare synchronous RPC deadlocks when its file-backed Worker inherits --input-type=module from a stdin entry. The final workflow writes an ignored .cache/ci/verify-production.mjs entry and runs it as an ordinary file; no assertions change. The same installed hosted-output and hydration checks now PASS locally: 76 assets, deploy health identity, 1 public page/load, with the check's original plain-HTML and /setup redirect dispositions. Headless local Chromium used /usr/bin/chromium with --no-sandbox. X_LOCAL_EXPLORER=false preserves the public CLI's environment. Owned stalled diagnostic processes were stopped by recorded PID; no providers or product settings were used.

The first published implementation unioned browser selectors into one installation per group. Source review of existing acceptance.mjs and the native-auth journey showed that security/routing policies and retained records require separate installation boundaries. The final substantive commit restores every original invocation boundary and uses a file-backed production-check entry, while retaining parallel jobs and duplicate elimination. This corrects test-state contamination; it is not a no-op or a request to rerun an unchanged SHA. The first workflow was never rerun or dispatched. Its whole-run conclusion has not been claimed.

Fetched/rebased fresh main before first commit/push. After the save, merged known origin/main (already up to date), without rewriting published history. Contract generator write/check passes; generated views restored from origin/main, never committed. Source lock generated/checks pass last; only the workflow file hash changes. All candidate author/committer identities are fleet, with no trailers. Product checkout is clean after final commit.

## Product publication and CI provenance

The fleet push guard published 274d44c3fe994507dad29a6d9d78dd12c2cd7549 successfully on attempt 1. Exact-SHA Verify discovery found run 42241249563 queued at https://github.com/just-every/run-pier/actions/runs/42241249563. The next status read failed; its refreshed-bundle retry returned HTTP 401 Bad credentials. Bounded recovery is recorded separately. Do not claim this run green, cancelled, failed or completed without restored account access.

Final candidate 4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad contains both source corrections and is the sole final candidate for exact-SHA Verify. Terminal push and evidence-transfer receipts below will name the actual result. No READY/acceptance/landing signal has been emitted.

## Plan and remaining responsibilities

PLAN.md contains the full plan. The cloud adaptation reserves COMPLETE full-history publication scan, exact-final executed Verify, main equality, guarded landing and main-only Run site to the Mac. The VM cannot run that scan. Original product holds and gate are independent and mandatory. No release, provider call, hold/state mutation, direct main push, force push or PR change was made.

If authentication recovery fails, preserve the verified Git bundle and this clone with its unpushed final commit. Refresh the same injected fleet account; never substitute another credential. Then fetch/merge fresh main, preserve all newer assertions, regenerate/check views and source lock, inspect all candidate identities/trailers, use the fleet push guard for the named branch and obtain exact-final Verify. Publish these actual public-safe reports through the evidence ref independently of product readiness.

Authentication recovery update: the same injected account succeeded on attempt 3/5 after bounded launcher refresh/backoff. Exact published-save run 42241249563 was in_progress; no conclusion inferred. Seven inspection calls consumed including the two 401 failures. No alternate credential was sought.

## Measured first-save diagnostic results and final correction

At the ninth permitted inspection call, first-save jobs showed all four API shards successful: job walls 2m49s / 2m10s / 2m57s / 2m38s; assertion steps 2m35s / 1m56s / 2m40s / 2m20s. Portability passed in 11m28s (assertion step 11m13s). Browser groups failed in 9m49s / 4m09s / 3m44s while sharing installation state; final commands restore the original independent installations. Job IDs are retained in candidate-first-jobs.json. The first-save build-checks job remained in the direct --input-type=module production check from 15:16:06Z; this was diagnosed locally as the Miniflare inherited-execArgv deadlock and corrected by a file entry. The narrowed file-backed production checks PASS without a full local suite.

The successful unchanged portability script alone measured 11m28s of job wall, so the ten-minute target remains unachieved in that measurement. Its assertions cannot be removed or split inside this CI-only scope. Final candidate wall and shard balance remain to be observed. No timing claim is based on failing browser groups. Full failed-job log archives were not read: the workflow was still in progress when its jobs were inspected and the ten-call account budget leaves only one observation for the final candidate. No failed assertion details are invented.

The final substantive fix is a new SHA, not a rerun or dispatch of the save. Existing branch concurrency may supersede the stalled save. Both product commits remain in branch history; no published commit was rewritten. The earlier unpublished correction was amended before its first push.

Final product push receipt: fleet guard pushed 4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad successfully on attempt 1. Last source fetch/merge found main unchanged. The final tree contains only verify.yml and the matching source-lock hash. Remaining GitHub inspection budget: one call, reserved for a late exact-SHA discovery of this final head.

## Terminal exact-SHA result and blocker

Final exact-SHA Verify **42245395705**, attempt **1**, on **4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad** is **completed/failure**: https://github.com/just-every/run-pier/actions/runs/42245395705. Created 2026-11-06T15:41:33Z, updated 2026-11-06T15:56:23Z; observed workflow elapsed created-to-updated is **14m50s** (890s), including scheduling/cleanup. The ten-minute goal is not met in this run. Final individual shard timings and failure cause are not available in the remaining budget. The tenth and final allowed inspection call was the exact-SHA discovery; no further GitHub job/log calls, reruns, dispatches or no-op commits were made. Do not infer that the final failure has the first save's cause. This is a real red Verify blocker, not missing receipt evidence or a contract-view-only exception.

**BLOCKED:** exact-SHA Verify is red, and the account's explicit ten-call inspection budget is exhausted before final failed-job diagnosis. A follow-up with a fresh inspection budget must read the final run's failed jobs and each failed job once using `gh run view 42245395705 --repo just-every/run-pier --job <FAILED_JOB_ID> --log-failed`, preserving every existing assertion and the original product holds. Do not rerun the same SHA blindly. If an attributable CI fix is found, change only the authorized scope, merge updated main, regenerate/check source lock and push a substantive new candidate through the fleet guard. No READY claim is made.

Final product custody is **PUSHED** on cloud/sx-pier-ci-critical-path-1 at 4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad; both commits are retained in its published history. Evidence publication is independent of this red product gate. Product FIX1/PASS WITH FOLLOW-UPS, original exact-source product gate and all fleet final guards remain mandatory.

Packet index: files without FINAL/final in their names include the initial-save diagnostics and superseded discovery/grouping maps; the authoritative final mapping is WORKLOAD-MAP-FINAL.md plus assertion-final-map.json. Full plan is PLAN.md. RECEIPT.json and final-ci-discovery.json bind this terminal blocker to the actual final source and run.
