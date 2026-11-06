# Local check receipt

- actionlint 1.7.7: original and final workflow PASS (expression/syntax validation; shellcheck unavailable).
- YAML parse: PASS; jobs plan, build-checks, shards and verify.
- Actual workflow partitioner executed: PASS, exactly eight nonempty shards.
- Playwright list-only comparison: original selectors vs final original-command shard selections PASS, 21 distinct registrations before and after, 22 -> 21 executions because one duplicate spend-authority execution is removed. No test bodies executed locally.
- API glob/file partitions: PASS, 33 files exactly once, no omissions or duplicates.
- Focused rer build: PASS with CI=true, cloud_run, source checkout unchanged.
- Typecheck: PASS after production build generated ignored src/routeTree.gen.ts.
- Initial typecheck was attempted before route generation and failed on that missing generated module. Initial build lacked CI=true for --no-queue and was refused. Both prerequisites were corrected without source edits.
- Focused direct hosted-output/hydration command: NO ASSERTION RECEIPT. It did not finish within about four minutes in this VM; stopped only recorded Node PID 2078 and workerd PID 2103, then SIGKILL for Node 2078 and its esbuild child 2163 after SIGTERM did not close the parent. System /usr/bin/chromium with --no-sandbox was selected for local hydration if reached. Candidate CI executes the actual installed checks on its production artifact; no local pass inferred.
- Contract generator write/check: PASS; generated views restored whole from origin/main and not committed.
- Edition source-lock regeneration/check: PASS; workflow hash only.
- No full local suite or rer verify was run. No external provider, release or deploy was invoked.

Final diagnosis/fix: the stdin --input-type=module entry propagated an invalid flag into Miniflare synchronous RPC file workers. Normal .mjs file entry fixes the stall. Final hosted-output and hydration checks PASS locally (76 assets, matching deploy identity, one page/load); test assertions unchanged. Local browser resolved via checkoutPlaywright and used /usr/bin/chromium --no-sandbox. X_LOCAL_EXPLORER=false mirrors rer main.
