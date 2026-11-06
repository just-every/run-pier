# sx-pier-ci-land-1

Repository: just-every/run-pier.
Candidate: cloud/sx-pier-ci-land-1 at 7b86541d9be978a633a4f3903a8c55389263bf8f.
Base: current main at clone time, 5d7ffdd81f3b3c86da7252525a93dccaa5e7572f.
Source: cloud/sx-pier-ci-critical-path-1 at verified exact head 4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad.

The two source commits (274d44c3fe994507dad29a6d9d78dd12c2cd7549 and 4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad) were applied without committing onto current main, followed by normal source-lock regeneration and one new fleet-authored commit. No conflicts occurred. The resulting workflow is byte-for-byte identical to the source branch. The product branch was pushed once through the required fleet guard; no main push, history rewrite, empty commit, dispatch or rerun occurred. No PR is required by the repository instructions, and none was created.

Changed files: .github/workflows/verify.yml and sources.lock.json only. There are no product, test, contract, migration or generated acceptance-view edits. The lock changes only the workflow hash.

The workflow splits the former single 45-minute job into build-checks and an eight-entry shard matrix: four API shards, three browser shards and one portability shard. All 33 API files are assigned exactly once. All 16 verify:app browser selections and three additional connector selections remain. The original connector step's spend-authority invocation is covered by the existing broader verify:app selection and is consolidated; its assertion still executes. Each browser selection retains its separate installation/runtime boundary. The hosted-output and hydration checks run from a file-backed module to preserve Miniflare's worker behavior. Build, typecheck, site tests, email-link tests, first-party source checks and public site build remain. The original plan reuse conditions and final aggregate assertions are unchanged. No timeout, threshold or retry was increased. The eight shard jobs have fail-fast disabled; final Verify requires plan, build-checks and all shards.

Local validation passed: actionlint 1.7.7 (shellcheck integration disabled because it is unavailable), execution and coverage audit of the actual workflow's matrix generator, unchanged plan/aggregate assertions and timeout audit, contract-docs check, source lock regeneration and check, source workflow equivalence and git diff --check. The source lock was regenerated last. The VM's /usr/bin/go is not the Go compiler, so the actionlint binary was obtained from its official 1.7.7 release. No application setup was needed for this workflow-only change. Toolchain setup selected pnpm 10.12.4 and the existing Node 24.19.0; CI retains Node 22.20.0.

The first audit comparison reported a difference because one spend-authority command names journey.spec.ts and verify:app uses its broader grep without a file argument. Inspection confirmed that the only matching test is in journey.spec.ts; the corrected audit verifies this coverage explicitly. No product change was made to resolve the audit comparison.

Full plan: PLAN.md. Detailed local checks: local-receipt.json, source-check.json, contract-check.txt and actionlint.txt. Workload selections: workload-audit.json; the executable audit is audit-workloads.py. Actual product push and commit provenance: product-push.txt, candidate-commits.txt and identity-check.txt. Exact-SHA observations: ci-observations.json. CI terminal receipt will be recorded after completion.

Clause changes: none. Counts remain Core 30 done / 57 partial / 4 missing (91 total), Agent surface 0 / 0 / 7, Later 0 / 0 / 0, Full target 30 / 57 / 11 (98 total). No acceptance promotion is claimed by this CI change.

Product custody and report publication are independent. Evidence publication is report-only and does not signal acceptance or landing. The fleet's Mac must perform its publication scan and land the product branch. No private gate material or secrets are included in this packet.

## Terminal CI result

Verify run [42263968880](https://github.com/just-every/run-pier/actions/runs/42263968880) completed with success on exact candidate SHA 7b86541d9be978a633a4f3903a8c55389263bf8f. This task used three REST inspection calls: discovery and two polls, spaced ten minutes apart. No workflow was dispatched or rerun. CI receipt: ci-receipt.json. No blockers remain. The candidate is READY for the fleet publication scan and landing.
