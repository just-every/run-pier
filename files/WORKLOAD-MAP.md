# Exact assertion workload map

| Before serial rer-verify | After | Coverage |
| --- | --- | --- |
| contract-docs check | build-checks | same command |
| rer check --profile first-party | build-checks | same command |
| verify:app: pnpm run build | build-checks | production artifact built once; email/hosted/hydration share it |
| verify:app: pnpm run typecheck | build-checks | same command, follows route generation by build |
| verify:app: pnpm run test:site | build-checks | all site tests, including refusal and setup recovery |
| verify:app: node tests/email-link.mjs | build-checks | same emitted Worker email-link assertions |
| verify:app: test:api, concurrency 1 | api-1..4 | all 33 files exactly once, concurrency 1 within each isolated runner |
| verify:app: node tests/portable.mjs | portability | complete original script, unchanged |
| verify:app: 16 browser invocations | browser-1..3 | full union of existing selectors, unchanged bodies and widths |
| connector STOCK-001, BUY-003, WMS-003 | browser-1..3 | same test identities and screens |
| connector spend-authority plus verify:app spend-authority | one browser shard | same assertion once; removed duplicate execution only |
| rer verify post-app checkHostedOutput | build-checks | identical installed implementation, same adapter deploy declaration |
| rer verify post-app checkHydration | build-checks | identical installed implementation, same adapter public pages and declaration |
| rer build --site --no-queue | build-checks | retained explicit final site build |
| screenshots upload, always | each browser shard | unique artifacts, always, 7-day retention |
| plan reuse/concurrency; aggregate verify gate | unchanged plan/concurrency; aggregate needs plan, build-checks and all shards | no success if a required job fails/cancels/skips unexpectedly |

Browser executions: 22 -> 21; distinct identities: 21 -> 21; missing 0; extra 0; duplicate after 0.
Browser fresh setup/dev runtimes: 20 -> 3. Each group keeps the same real setup/dev fixture; production builds inside these fresh installations remain part of the existing public-command proof, not duplicate builds of the shared artifact.
API files: 33 -> 33; parallel assertion jobs: 1 -> 8 (4 API, 3 browser, 1 portability), plus build-checks, plan and final gate.

## Every selected browser assertion

### browser-1
- `dispatch.spec.ts:8` — WMS-003: warehouse dispatch states, reviewed ship-by schedule, close download and overdue report at 1440 and 390
- `journey.spec.ts:1232` — receipt FX, weight allocation, late bills and mapped write-off settings remain reviewable at 1440 and 390
- `journey.spec.ts:1536` — Managed supplier mail shows approved text, PDF refusal and retained uncertainty
- `journey.spec.ts:1768` — native authenticator enrollment, required sessions and owner recovery are usable
- `journey.spec.ts:1851` — buyers compare reviewed replenishment scenarios and follow selected receipts to current ledger evidence
- `journey.spec.ts:1926` — native tax rules show owner configuration, review recovery and retained quote and invoice calculations
- `journey.spec.ts:455` — routing, shortage policies and audited refusals at 1440px
- `journey.spec.ts:455` — routing, shortage policies and audited refusals at 390px
- `stock.spec.ts:115` — KIT-001: define, assemble, pick, pack, print and inspect kits at 1440 and 390

### browser-2
- `catalogue.spec.ts:119` — owner typed-field controls define, edit, import and filter every record type with custody refusal at 1440 and 390
- `journey.spec.ts:39` — owner completes real UI journeys at 1440px
- `journey.spec.ts:1621` — two distinct agents share one draft while current human authority alone approves and commits it
- `stock.spec.ts:8` — STOCK-001: stock totals, empty items and warehouse filters with connector recovery
- `supplier-substitutes.spec.ts:7` — owners inspect supplier substitute evidence, refuse stale review and retain recommendation decisions
- `webhooks.spec.ts:10` — owners preview, rotate, reconcile and revoke signed order webhooks

### browser-3
- `integration-health.spec.ts:8` — SYNC-001: owners inspect native stock checkpoints and recover denied health at desktop and phone widths
- `journey.spec.ts:1440` — purchase approval names spend authority and exposes supplier re-approval at 1440 and 390
- `operational-exceptions.spec.ts:6` — owners assign overdue cases, see premature closure refusal and retain documented cancellation
- `reorder-list.spec.ts:7` — BUY-005: buyer selects suppliers and quantities, saves SKU defaults, changes planning scope and reads matching reports at 1440 and 390
- `stock.spec.ts:272` — TRACE-001: receive dated lots and serials, transfer, split ship, trace, quarantine and return at 1440 and 390
- `supplier-returns.spec.ts:8` — BUY-003: staff quarantine, authorize, dispatch and reconcile supplier evidence with connector recovery

## API file assignments

### api-1
- tests/api/security-import.test.mjs
- tests/api/purchase-send.test.mjs
- tests/api/books-landed.test.mjs
- tests/api/catalogue.test.mjs
- tests/api/stock.test.mjs
- tests/api/supplier-performance.test.mjs
- tests/api/movein.test.mjs
- tests/api/books-shop.test.mjs
- tests/api/dependency-custody.test.mjs

### api-2
- tests/api/flows.test.mjs
- tests/api/books.test.mjs
- tests/api/item-agent.test.mjs
- tests/api/packing-documents.test.mjs
- tests/api/slotting.test.mjs
- tests/api/shipping.test.mjs
- tests/api/operational-exceptions.test.mjs
- tests/api/managed-mail.test.mjs

### api-3
- tests/api/costing.test.mjs
- tests/api/replenishment.test.mjs
- tests/api/returns.test.mjs
- tests/api/reorder-list.test.mjs
- tests/api/supplier-substitutes.test.mjs
- tests/api/warehouse-waves.test.mjs
- tests/api/dispatch.test.mjs
- tests/api/open.test.mjs

### api-4
- tests/api/channels.test.mjs
- tests/api/floor.test.mjs
- tests/api/supplier-returns.test.mjs
- tests/api/webhooks.test.mjs
- tests/api/edi.test.mjs
- tests/api/native-exit.test.mjs
- tests/api/supplier-bill-documents.test.mjs
- tests/api/slow-stock.test.mjs
