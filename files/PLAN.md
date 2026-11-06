# sx-pier-c-f82 fix plan

Scope: fix only blocking A from the refused f81 candidate. A current owner must supply a positive reviewed USD-per-CAD rate when revising a USD quote to CAD; omission must refuse atomically. Existing CAD revisions may retain a rate reviewed in the same currency.

1. Reproduce the ordinary authenticated quote revision against the real Worker and D1 by extending the existing native invoice journey. Cover an accepted USD quote, missing and invalid conversion rates, unchanged public business state after refusal, explicit reviewed conversion and historical USD approval retention.
2. Restrict inherited quote rates to revisions within their original currency. Preserve existing decimal validation and authority checks.
3. Run the touched journey, costing tests and typecheck; regenerate contract views for a check, restore main's generated views, regenerate and check the source lock. Leave contract judgments and acceptance text unchanged.
4. Integrate current main without rewriting published history, verify all candidate identities and trailers, push only cloud/sx-pier-c-f82, and inspect exact-SHA Verify through REST.
5. Publish the actual non-secret report and receipts only to the separate evidence ref. The guarded Mac lander owns publication scanning, generated landing views and main publication.

No UI or policy change is planned. SALES-006 stays PARTIAL, with external ledger and tax qualification, wider currencies and delegation held as specified in the brief. No other clause or plan row is changed.
