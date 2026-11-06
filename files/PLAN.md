# sx-pier-f81fix1 plan and completion

Scope: fix only gate finding A against the stacked SALES-006 candidate. No wider campaign work.

1. Reproduce an accepted USD quote revised to CAD without an explicit USD conversion rate through the authenticated command route. Completed: the extended existing costing journey failed against 406ba828 because the command incorrectly returned success.
2. Stop inheriting the previous currency rate when the quote currency changes. Extend the same journey to prove atomic refusal and explicit positive-rate recovery, preserving retained USD history and requiring renewed approval. Completed.
3. Run touched costing tests, typecheck, first-party checks, contract generation and source-lock checks. Rebase against current main, preserve its contract judgments and restore generated views. Completed; no new test registration or UI edit.
4. Commit and push cloud/sx-pier-f81fix1 through the fleet guard, inspect exact-head Verify, publish actual non-secret reports and receipts to the separate evidence ref, and hand custody to the guarded lander. Product push complete. Evidence publication and final CI state are recorded in the terminal report.

No plan source file or queue file was changed. The lane should record only this gate-fix result against SALES-006. Status and counts remain unchanged.
