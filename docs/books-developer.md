# Books developer notes

The adapter uses exact-reference lookup, stable idempotency keys and an installation-wide database lease. `tests/api/books.test.mjs` covers real Pier/Pantry HTTP and D1. `tests/api/books-landed.test.mjs` covers landed cost and return closure. `PANTRY_SOURCE` selects an explicit sibling checkout for development.

Cloudflare uses `global_fetch_strictly_public` so sibling public Worker routes remain reachable. See [Worker fetch](https://developers.cloudflare.com/workers/runtime-apis/fetch/).


## QuickBooks company journey

The owner connects through `book.qboConnect`; `book.sync` performs the provider work under the installation-wide lease. Mappings are explicit, source versions are admitted at the provider edge, and authorization and native invoice originals remain separate from mutable ledger readback. QBO-backed jobs and mappings are owner-only. Native returned-line credits supersede legacy return credit proposals, so they cannot both post the same revenue correction.

`tests/api/books.test.mjs` — “QuickBooks company authorization posts mapped business documents once and exposes external conflicts and expiry” proves owner admission, refused non-owner access, mapped bills, two partial invoices, retained prepay, linked customer credit application, cash readback, replay, unpaid void, paid-void refusal, exact inventory and cost-of-goods comparisons, external-edit refusal, closed-period refusal, expired authorization and disconnect through authenticated HTTP with a fake only at the QBO network edge. `tests/api/books-fixtures.mjs` additionally exercises the documented credit, cash-payment and void protocol shapes. `tests/browser/qbo.spec.ts` exercises the real settings and Books pages with realistic stock data at 1440 and 390, including refused mapping and recovery without retaining credentials.

The optional live journey is `node scripts/journeys/qbo-sandbox.mjs`, run only with the held sandbox consent through the approved injector. It requires named `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REFRESH_TOKEN`, `QBO_REALM_ID` and `QBO_ROTATION_INGEST`. The last variable points to the approved owner-environment ingestion tool. Every successful token exchange immediately stores its rotated refresh token through that tool before proceeding. The journey creates isolated sandbox accounts and mapped records, then uses Pier's public commands; it prints only safe transaction outcomes. It never prints credential values, company identifiers or raw provider bodies. It does not establish Shopify settlements, Avalara, live period closure or live authorization revocation.
