# Plan: sx-pier-ci-land-1

1. Initialize fleet identity, launcher credentials, Git helper, push guard and commit hooks. Read launcher and Pier rules. Keep reports outside the product tree.
2. Shallow filtered clone current main. Fetch source branch and confirm exact head 4835f6daef6512ad0c3ddb6a87e7e24d06f5cdad. Apply its two workflow commits without committing, preserving current main.
3. Confirm the resulting workflow equals the approved source; audit every verify:app command, API file, browser selection, connector selection, production Worker/hydration check, aggregate gate and timeout. Limit matrix to eight shards. Run actionlint, contract-docs check and source-lock check; regenerate sources.lock.json last.
4. Create one fleet-authored product commit containing only verify.yml and sources.lock.json. Inspect all candidate identities/messages/trailers, then push the named branch once through cloud-push.py.
5. Observe only this candidate's exact-SHA Verify through REST within ten GitHub inspection calls, at least 300 seconds between observations. No dispatch, rerun, main push or PR bypass. Record actual CI receipts.
6. Publish the explicitly selected non-secret report packet on evidence/sx-pier-ci-land-1 separately from product custody. Return the candidate SHA, CI run, unchanged clause counts, evidence receipt and sx inbox handoff. READY requires this candidate's Verify success.
