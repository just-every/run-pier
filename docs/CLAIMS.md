# Pier homepage: every capability claim and what backs it

Branch `br/style` of just-every/run-pier (17 Oct 2026). The copy is the desk's, owner-accepted, kept word for word (one spelling changed: "recognise" → "recognize"). Each claim the homepage makes (headline copy and every drawn card) is mapped to the code on this branch.

Status:
- **backed**: the code does it today (path given).
- **partly**: the code does part of it; the rest is named.
- **contract, not yet in code**: a target in CONTRACT.md (the new connected-wholesale contract on main, 16–17 Oct 2026); nothing in the code does it yet.

Command names are the `type` strings Pier's command door accepts (`POST /api/pier/commands`, `src/pier/api.ts:258`).

Updated 17 October 2026 for pricing, costing and native reports. New costing evidence is `tests/api/costing.test.mjs`; the broad clause statuses and outstanding integrations remain in CONTRACT.md. Updated again 17 October 2026 for the warehouse floor (rows 9, 12, 14, 15, 18 and 29): scan-to-receive, pick waves with a scan check per line and overflow bins, the pack step and the daily dispatch summary; evidence `tests/api/floor.test.mjs`.

Updated 17 October 2026 for channels (rows 2, 19–22 and 46): live Stall/WooCommerce, Shopify/Amazon documented API adapters with synthetic recorded network fixtures, listing matching, source holds and accepted stock publication. Broader CHANNEL-001 remains partial; see [Sales channels](channels.md).

Updated 17 October 2026 for books (rows 4, 35, 36 and 41): real Pantry financial HTTP/D1 flow, one queue and accountant exports; QBO/Xero remain fixture-only and the Pantry catalogue boundary remains explicit. Updated again 17 October 2026: Pantry connects with its scoped integration credential and native bill readiness; Stall connects with a Pier-issued key; rows 19, 20 and 38 corrected to partly. The second books round adds three-way supplier invoice matching, standalone settings, final-receipt readiness evidence on the existing payable and supplier payment closure. Rows 4, 35 and 41 remain partly because scoped Pantry financial credentials/native readiness and real QBO/Xero account acceptance remain external boundaries.

Updated 18 October 2026 (rows 4, 19 and 36): with freight and duty on a receipt, cost of goods, return cost, the freight-and-duty journal and inventory valuation post to Pantry in whole cents and Pantry's inventory equals Pier's valuation (`tests/api/books-landed.test.mjs`); an unknown outcome Pantry never received is re-sent with its idempotency keys on Check Pantry; Stall connects to Pier from Stall's own Settings page with Pier's address and key. Row 44 also covers native rows in USD or another ISO currency at a recorded rate (`tests/api/security-import.test.mjs`).

Updated 18 October 2026 (rows 4 and 19): a Stall order carries each line's unit price and currency, so the sales order is priced and its shipment invoice posts to Pantry beside cost of goods; a reservation made before Stall sent prices takes Stall's charged price when it links, and any unpriced order is priced once from its order page (`tests/api/channels.test.mjs`).

Updated 17 October 2026 for EDI (rows 7, 23–25): the X12 core flow and SSCC labels are implemented with synthetic network-edge fixtures; retailer transport/certification and physical printer acceptance remain pending. [Retail EDI](edi.md) names the owner setup and Managed egress boundary.

Updated 18 October 2026 for page-alone channel setup, explicit EDI network boundaries, dated inventory comparison and Stripe-paid Stall invoice allocations. See `tests/api/channels.test.mjs`, `tests/api/books-shop.test.mjs` and `tests/api/books-landed.test.mjs`; live external provider acceptance remains separate.

## Totals

| Status | Claims |
|---|---|
| backed | 43 |
| partly | 12 |
| contract, not yet in code | 0 |
| **all claims** | **55** |

## Hero

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 1 | "Pier tracks stock across your warehouses" | backed | Warehouses and bins: `location.save` (`src/pier/catalogue.ts:44,83`); stock per item, warehouse and bin with on hand, reserved, available, quarantine, expected: `src/pier/model.ts` availability, `src/ui/stock.tsx:23-25` |
| 2 | "runs orders from channel to carrier" | partly | Channel orders reserve through `src/pier/channels/commands.ts`; Stall links its paid checkout reservation and WooCommerce imports processing orders. Dispatch is native; carrier integration remains SHIP-001. |
| 3 | "reorders before you run out" | backed | Buyer-applied learned points, stock-position netting, case packs/MOQs and automatic unapproved drafts: `src/pier/replenishment.ts`, Purchasing. Native shipment history only; broader connected planning remains partial. |
| 4 | "and keeps the books in step" | partly | Pantry matched supplier-invoice payables, shipment invoices/COGS, payment readback and inventory balance reconciliation: `src/pier/books/`, `tests/api/books.test.mjs`. Buyer-reviewed supplier invoices now match PO/receipt quantities and prices with explicit tolerances and hold/approve; payments close the payable. Freight and duty spread over a receipt post as a whole-cent journal into inventory, and COGS, return cost and valuation post in whole cents: `tests/api/books-landed.test.mjs`. Stripe-confirmed Stall payments are allocated per shipped invoice to the owner-picked Pantry bank account, and inventory compares through the latest source date (`tests/api/books-shop.test.mjs`; `src/pier/books/shop-payment.ts`). Books settings connects with a revocable Pantry integration credential and accounts picked from Pantry's chart; there is no direct QuickBooks Online or Xero connection (adapters exist with protocol fixtures only, awaiting owner apps). |
| 5 | "100% free, open source alternative to Cin7, inFlow and Fishbowl" | backed | MIT licence: `LICENSE`, `package.json` `license`. (Feature parity with those products is the contract; the free/open-source claim is true today) |
| 6 | Tag "PO-1048 · 480 of 500 received · 20 short" | backed | Partial receipts into bins, the rest stays expected: `receipt.create` `src/pier/purchasing.ts:121` |
| 7 | Tag "EDI 856 sent · Target DC 0593" | partly | X12 856 generation from closed packs, retained SSCC cartons and bridge send records: `src/pier/edi/`, `tests/api/edi.test.mjs`. No live retailer transport or Target certification; the DC 0593 fixture is synthetic. |
| 8 | Tag "Count mismatch · A-14 · recounted" | backed | Counts capture a bin's movement frontier, show drift and ask for a recount when stock moved: `count.capture/count.record/count.recount` `src/pier/warehouse.ts:119-147`, `src/ui/stock.tsx:18-19` |
| 9 | Tag "Picked 38 orders · 6:40 am" | backed | A pick wave records each line's picker and time and reads "Picked N orders · time" when its last line is picked: `wave.release`, `pick.scan` `src/pier/floor/waves.ts`, Floor → Pick `src/ui/floor/pick.tsx`. The count of 38 is a story figure |
| 10 | Tag "Bin A-14 · 212 units" | backed | Stock by bin: `src/ui/stock.tsx:24-25` |
| 11 | Tag "Reorder suggested · Blue Mug 12oz · 600" | backed | Purchasing shows computed item/warehouse suggestions, rounding, draft coverage and expected landed cost; bounded policy drafts automatically when the position crosses its point. `src/pier/replenishment.ts`. |

## Warehouse floor (page 2)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 12 | "Receive … from any phone or scanner" | backed | Scan-to-receive against a committed PO: `receiving.start/scan/post` `src/pier/floor/receiving.ts`, Floor → Receive `src/ui/floor/receive.tsx`, at 390px. A USB/Bluetooth scanner or a handheld's built-in scanner types into the scan box (keyboard wedge); a phone camera reads through the browser's barcode detection (`src/ui/floor/scanner.tsx`; Chrome on Android, not iPhone Safari, which types the code or uses a paired Bluetooth scanner). Unit and case barcodes (`item.save` `caseBarcode`); a bin label moves put-away; over and short lines are kept on the receipt |
| 13 | "put away" | backed | A receipt names the destination bin for each line: `src/ui/purchasing.tsx:23` |
| 14 | "pick" | backed | Pick waves in bin sequence into numbered totes, each line confirmed by its bin and item scans: `src/pier/floor/waves.ts`, `src/ui/floor/pick.tsx` |
| 15 | "pack" | backed | Picked units are scanned into numbered cartons, each weighed and measured by hand (lb, in), the order marked packed, then dispatched: `pack.scan/carton/measure/close/dispatch` `src/pier/floor/packing.ts`, Floor → Pack `src/ui/floor/pack.tsx`. Packing slips and carton labels are not printed (CONTRACT.md PRINT-001, SCAN-001) |
| 16 | "and count" | backed | As claim 8 |
| 17 | "Every bin knows exactly what it holds" | backed | Append-only movements per bin: `src/pier/model.ts`, `src/ui/activity.tsx:16-17` |
| 18 | Pick list "Wave 14 · Dock A", scan check per line, "B-03 empty · picked from overflow B-09" | backed | Waves per carrier pickup and dock (`carrier.save`, `wave.release`); a wrong bin or wrong item is refused with the reason and nothing is picked (`pick.scan`); "Bin empty or short" moves only that line's reservation to the next bin with unreserved stock and opens a count of the reported bin (`pick.short`): `src/pier/floor/waves.ts`, `src/ui/floor/pick.tsx`, `tests/api/floor.test.mjs` |

## Channels (page 2)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 19 | "Shopify, WooCommerce, Amazon and Stall orders land in Pier" | partly | `src/pier/channels/adapters/` and `commands.ts`: Stall and local WooCommerce exercised live; Shopify GraphQL and Amazon SP-API order intake exercised with synthetic recorded API fixtures in `tests/api/channels.test.mjs`. Setup pages include official account/menu instructions, a Shopify location lookup and Amazon country selection (`src/ui/channels/setup-guides.tsx`; `src/pier/channels/setup.ts`). Only Stall and WooCommerce orders have landed from real stores; Shopify and Amazon have no live account connection yet, and the Channels page states this. Stall connects with a Pier-issued key (`src/pier/channels/stall-link.ts`) that the owner pastes into Stall's Settings → Provider connections, with Pier's address; no files or restart. Stall orders arrive priced at the unit prices Stall charged, so their invoices post to Pantry; an order that arrived unpriced is priced once from its order page. |
| 20 | "stock flows back to each one within a minute" | partly | `src/pier/channels/sync.ts`: background publication after committed changes, one-minute reconciliation, accepted quantities and lag. Core-flow test covers all four adapters; live Stall/WooCommerce read-backs observed within a minute. Shopify and Amazon publication is exercised only against recorded fixtures; production percentile and Amazon processing-time acceptance remain separate. |
| 21 | Card: one available count per channel, "100 held for FBA transfer" | backed | `channel.hold/channel.release` allocate unreserved bin stock; `model.ts` excludes it from every new reservation and channel publication. Channels shows net availability, per-connection buffers and hold reasons. This is an FBA-style source hold, not Amazon inbound shipment management. |
| 22 | Toast "Order #4471 … reserved 9:12 am" | backed | Channel source identities link to one native order and reservation timestamp in Channels; `tests/api/channels.test.mjs` verifies duplicate notifications reserve once. Stall and WooCommerce live orders inspected; Shopify account acceptance still requires the owner account. |

## Retail EDI and shipping (page 3)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 23 | "Take EDI purchase orders from Target, Walmart and Home Depot" | partly | 850 intake with BP/UPC and exact unit mapping, named unresolved lines, fixed-warehouse sales orders and 997: `src/pier/edi/intake.ts`, `src/ui/edi/`. Actual Target/Walmart/Home Depot guides, network account and certification remain pending; see [Retail EDI](edi.md). |
| 24 | "send the acknowledgment, ship notice and invoice on time" (855/856/810 card) | partly | Reviewed accept/change/reject 855, pickup/arrival-window 856 from packs, and shipped-value 810; required/sent/late compliance and retained 997 outcomes: `tests/api/edi.test.mjs`. Sends proven at the synthetic bridge edge only; RER Managed delivery is unavailable. |
| 25 | "Carton 7 label reprinted · GS1-128" | partly | GS1-128 SSCC SVG, 4×6 browser print sheet and Zebra ZPL match the ASN; print/reprint actor and reason retain the same carton serial and contents: `src/pier/edi/sscc.ts`, `src/pier/edi-labels.ts`. Physical printer/scanner and retailer artwork certification remain pending. |
| 26 | "Pier compares UPS, FedEx and USPS through ShipStation or EasyPost" | partly | EasyPost v2 adapter compares returned UPS/FedEx/USPS rates from measured pack cartons, with cheapest/fastest markers. `src/pier/shipping/`, `src/ui/shipping/`, `tests/api/shipping.test.mjs`. Documented synthetic network recordings only; no owner EasyPost account yet. [Shipping](shipping.md). |
| 27 | "prints the label and sends tracking to your customer" | partly | Per-carton label purchase/reconciliation, authenticated PDF/ZPL downloads, stored shipment tracking, install-mail submission and signed canonical tracking updates. `tests/api/shipping.test.mjs`; synthetic 4×6 carrier files at the network edge. Real tracking mail was received and standalone hosted setup exercised; live carrier postage, physical printers and Managed egress remain pending. [Shipping](shipping.md). |
| 28 | "Address corrected" | partly | Delivery verification blocks undeliverable addresses; original and standardized street/ZIP+4/residential flag are shown for explicit accept or keep, retained on the order. `src/pier/shipping/commands.ts`, `tests/api/shipping.test.mjs`. Provider responses are documented synthetic recordings pending an EasyPost account. [Shipping](shipping.md). |

## Interlude (page 4)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 29 | "All 214 orders out by 4 pm" | backed | Floor → Dispatch day shows the day's orders, shipments and units shipped by carrier and dock against each cut-off, with exceptions, headed "All N orders out by time" when every due order left on time; closing the day keeps it and emails the owner through the installation's mail: `src/pier/floor/summary.ts`, `src/pier/floor/mail.ts`, `src/ui/floor/dispatch.tsx`. On RER Managed the email is not available yet (no egress relay); the day's count is a story figure |

## Replenishment and accounting (page 5)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 30 | "Reorder points learn from what actually sells" | backed | 30/90/365-day native shipment sell-through proposes points and quantities from lead demand plus editable safety stock. A buyer applies exact current parameters. `src/pier/replenishment-demand.ts`, `src/ui/replenishment.tsx`. |
| 31 | "Pier drafts the purchase order" | backed | `draftReplenishment()` groups low-position lines by supplier and warehouse, nets existing drafts and retains expected freight/duty. Human exact-version approval and commitment remain required. `src/pier/replenishment.ts`. |
| 32 | "with landed cost" (card: "$4.82 per unit · freight and duty included") | backed | `src/pier/landed-cost.ts`; `receipt.create` allocates freight and duty by received value or quantity, retains exact landed line totals and unit cost; `tests/api/costing.test.mjs`. |
| 33 | "backorders get a real date" | backed | Quantity-limited inbound supply is allocated in promise/order priority. Lines show confirmed dates or labeled lead-time estimates and source POs. `src/pier/backorders.ts`. |
| 34 | "Send PO-1052" (to the supplier) | backed | Buyer approves the exact committed PO, recipient and bounded reminders. The configured install mail submits it with durable provider outcomes. `src/pier/purchasing-workflow.ts`, `src/pier/correspondence-delivery.ts`. RER Managed email is not available yet. |
| 35 | "Two-way sync with QuickBooks Online and Xero: items, invoices, bills, cost of goods and inventory value" | partly | Shared Pantry/QBO/Xero adapter interface. Real Pantry three-way supplier invoice matching, payable posting, final-receipt evidence and payment closure core flow; QBO/Xero documented synthetic protocol fixtures only, pending owner apps. Items and valuation snapshots are Pantry evidence, not its native catalogue. See [Books](books.md). |
| 36 | "Anything off waits in one short queue" (review queue, bill 7731) | backed | Books has one review queue for provider refusals, missing source values, inventory differences and uncertain responses, with immediate missing-credential restore status, dated inventory comparison, source links and guarded retry/skip actions; Check Pantry re-sends a request Pantry has no record of under its original idempotency keys: `src/ui/books/`, `src/pier/books/sync.ts`. |

## Inventory agent and move in (page 6)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 37 | "The agent forecasts from real sell-through" | backed | Agents read native-shipment forecasts through the state API: observed windows, days of cover, projected stockout and learned parameters. `src/pier/replenishment-demand.ts`. Imported/channel history, seasonality, cash optimization and backtesting remain outside this round. |
| 38 | "sends the PO" | backed | An authenticated or scheduled inventory agent sends one exact committed PO under buyer authority: approved recipient, landed spend limit, expiry, reminders and stop control. Changed demand, terms, policy or destination stops it; live authority and durable provider outcomes prevent unapproved or duplicate sends. `src/pier/purchase-send.ts`, `tests/api/purchase-send.test.mjs`. Broader BUY-002/AGENT-002 targets and Managed email remain partial. |
| 39 | "chases the supplier" | backed | Buyer authorizes 0–5 confirmation chases at 1–30-day intervals; cron sends only while the initial PO was accepted, supply is open and no confirmation, policy revocation or material change intervened. Supplier replies/confirmed dates are recorded on the PO. `src/pier/scheduled.ts`, `src/pier/purchasing-workflow.ts`. |
| 40 | "re-promises affected orders" (and "customers emailed") | backed | A human approves a computed customer promise or an order-specific exact-recipient date-update policy. Confirmation/date changes recompute promises and submit customer emails; history and provider outcomes remain visible. `src/pier/backorders.ts`, `src/pier/purchasing-workflow.ts`. RER Managed email is not available yet. |
| 41 | "checks the receipt closes in the books" | backed | `src/pier/books/receipt-closure.ts`, `src/ui/books/receipt-closure.tsx` and `tests/api/books.test.mjs`: every receipt exposes unbilled units, its invoice review, missing goods, confirmed Pantry readiness and payment handoff. It closes only when its approved invoice allocations cover the goods, receipt journals post and Pantry confirms zero open payable balances. Payment reversals reopen it; revoked/missing credentials ask for reconnection. Real hosted Pier/Pantry receipt → invoice → final receipt → USD 115.68 payment completed at 1440px and 390px, including reversal/reopening. Broader QBO/Xero and agent planning targets remain partial. |
| 42 | Agent log as a whole (an agent working the item's record) | backed | Stock → item → Work this item checks open demand/POs, posted receipt cost and native sell-through; exact human apply/reject/undo with logged source versions. Standalone AI setup stores the install's encrypted OpenAI key; deterministic checks need no key. `src/pier/item-agent/`, `src/ui/item-agent/`, `tests/api/item-agent.test.mjs`; [Item checks](item-agent.md). Live paid OpenAI account acceptance remains separate. |
| 43 | "Move from Cin7, inFlow or Fishbowl" ("Importing from Cin7 Core") | backed | Explicit Cin7 Core, inFlow and Fishbowl export mappings, untouched originals, named unmapped columns/rows, independent per-bin unit/USD controls, frozen atomic apply, duplicate-free replay and one-step dependency-guarded undo. `src/pier/import-incumbent.ts`, `src/ui/import-movein.tsx`, `tests/api/movein.test.mjs`; documented synthetic vendor layouts in [Move in](move-in.md). Owner exports, historic/tracked stock and source FIFO layer dates remain unaccepted. |
| 44 | "with your items, bins, stock on hand, customers, suppliers and open orders" | backed | The native kinds `items`, `locations`, `parties`, `positions`, `orders`, `purchaseOrders`, plus `reservations` (`IMPORT.md`, `src/pier/imports.ts`) |
| 45 | "Stock on hand … matched" (reconciliation at import) | backed | The reconciled and shadow review stages check totals before the frozen cutover: `import.review` `src/pier/imports.ts:317` |
| 46 | "Channels reconnect to the same listings" (and "Amazon · 2 listings awaiting SKU match") | backed | Existing listing/variant IDs are retained, exact SKUs auto-match, and unknown listings wait for owner `channel.match` without publishing. A real WooCommerce legacy listing was matched in the UI without creating or relisting it; reconnect reads keep the mapping. |

## Ownership (page 7)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 47 | "Run Pier on your own computer or server" | backed | Local `rer dev` and own-account `rer deploy` (`deploy.json`, [Put Pier online](hosting.md)). On 18 October, a disposable Cloudflare install retained its owner and stock across redeployment; real owner sign-in mail arrived, and the owner entered and partially received USD 57.84 POs at 1440px and 390px. Channel artwork uses build-time asset imports (`src/ui/channels/brand.tsx`), so hosted app rendering completes without React 419. Full OPS-001 diagnostics, scale and fresh-machine targets remain partial. |
| 48 | "keep every item, order and supplier. Export everything, any time" (and "Your stock, your data", "Export any time") | backed | `GET /api/pier/export` and `/api/pier/native-export` (`src/pier/api.ts:189-200`), the full archive `rer export` (`docs/backup-and-restore.md`, `tests/portable.mjs`) |
| 49 | The Ownership terminal's one-line start `npx -y @runeditrun/rer dev just-every/run-pier` (live 17 Oct, main 1c0f1c6) | backed | rer 0.2.38's `dev <repo>` clones, installs, sets up a local owner and starts; the output lines are rer's own |

## The quiet details (page 8)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 50 | "FIFO or average cost. Valuation your accountant will recognize." | backed | `costing.method`, `src/pier/valuation-ledger.ts`, `/api/pier/reports`: FIFO or moving average per install, dated prospective owner changes, remaining layers and receipt/shipment reconciliation. Operational USD valuation; ledger posting, FX and period locks remain COST-001 work. |
| 51 | "Transfers. Move stock between warehouses with a full trail." | backed | `transfer.send/transfer.receive` through a visible transit location: `src/pier/warehouse.ts:51,95` |
| 52 | "Returns. Back on the shelf or written off in one scan." | backed | Floor → Returns resolves order/shipment labels or item/case scans; records reason and condition; authorized sellable restock, damaged quarantine or mapped write-off; exact returned value, native Pantry credit and COGS/write-off journals. Receivers without inspection authority leave quarantine. `src/pier/returns.ts`, `src/ui/floor/returns.tsx`, `tests/api/returns.test.mjs`; [Returns](returns.md). Physical camera/scanner acceptance and direct QBO/Xero credits remain separate. |
| 53 | "Dead stock. Slow movers flagged before they cost you." | backed | Reports → Slow-mover warnings: scheduled native SKU/bin checks before the saved dead-stock threshold, owner-approved recipient/content and UTC quiet hours, value/last movement/days left, one warning and email per episode, actual sale/transfer closure or documented buyer decision. Buyers can flag an assortment concern early. New stock ages before becoming dead stock. `src/pier/slow-stock.ts`, `src/pier/stock-inactivity.ts`, `src/ui/slow-stock.tsx`, `tests/api/slow-stock.test.mjs`. Imported history and kits remain broader contract gaps. |
| 54 | "Margin by SKU. Profit by item, channel and customer." | backed | Saved USD order prices/customer quantity tiers and shipment-consumed costs produce date-range margin by SKU, channel and customer (`src/pier/pricing.ts`, `orders.ts`, `reports.ts`). Operational shipment margin; invoice credits/ledger reconciliation remain REPORT-002 work. |
| 55 | "Activity log. Every scan, edit and sync, recorded." | backed | Every movement with its document, person, reason and command identity: `src/ui/activity.tsx:16-17`, `src/pier/storage.ts:67-80` (there are no scans or syncs to record yet; every edit that exists is recorded) |

## Closing (page 9)

"Open source inventory and order management for wholesalers and distributors" and "Free and open source, MIT licensed" restate claims 1, 2 and 5. The tags "Bin A-14 · 212 units" and "Shipped" restate claims 10 and 29.

## Links

- "Run Pier →" opens /run (Base's two-line Run page, rer 0.2.38).
- "Try the demo" opens the hosted demo, https://demo.run-pier.com/ (DEMO.md; answered 200 on 17 Oct 2026).
- "Read the docs" opens /docs.

The 17 October replenishment round backs rows 3, 11, 30, 31, 33, 34 and 37–40 for native shipments and self-hosted install mail. The core Worker/D1 test is `tests/api/replenishment.test.mjs`; Purchasing and Sales expose the same calculations and approval paths at desktop and phone widths. “Backed” here describes the narrow homepage behavior; full connected planning, optimization, routing and financial closure targets remain partial in CONTRACT.md.

Updated 18 October 2026 for receipt accounting follow-through (row 41) and owned hosting (row 47). These two remaining account-free claims have hosted product evidence. Carrier, Shopify/Amazon, QBO/Xero, EDI and physical-printer acceptance remain the boundaries on the twelve partial claims.
