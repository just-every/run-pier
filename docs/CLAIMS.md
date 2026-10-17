# Pier homepage: every capability claim and what backs it

Branch `br/style` of just-every/run-pier (17 Oct 2026). The copy is the desk's, owner-accepted, kept word for word (one spelling changed: "recognise" → "recognize"). Each claim the homepage makes (headline copy and every drawn card) is mapped to the code on this branch.

Status:
- **backed**: the code does it today (path given).
- **partly**: the code does part of it; the rest is named.
- **contract, not yet in code**: a target in CONTRACT.md (the new connected-wholesale contract on main, 16–17 Oct 2026); nothing in the code does it yet.

Command names are the `type` strings Pier's command door accepts (`POST /api/pier/commands`, `src/pier/api.ts:258`).

Updated 17 October 2026 for pricing, costing and native reports. New costing evidence is `tests/api/costing.test.mjs`; the broad clause statuses and outstanding integrations remain in CONTRACT.md.

## Totals

| Status | Claims |
|---|---|
| backed | 17 |
| partly | 15 |
| contract, not yet in code | 23 |
| **all claims** | **55** |

## Hero

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 1 | "Pier tracks stock across your warehouses" | backed | Warehouses and bins: `location.save` (`src/pier/catalogue.ts:44,83`); stock per item, warehouse and bin with on hand, reserved, available, quarantine, expected: `src/pier/model.ts` availability, `src/ui/stock.tsx:23-25` |
| 2 | "runs orders from channel to carrier" | partly | Sales orders that reserve and dispatch: `order.create`, `dispatch.create` (`src/pier/orders.ts:79,113`). No sales-channel import and no carrier: CONTRACT.md channel and shipping clauses |
| 3 | "reorders before you run out" | partly | Reorder evidence (open demand, on hand, expected, supplier terms): `reorder()` `src/pier/proposals.ts:17`; buyer-approved POs `po.draft/po.approve/po.commit` `src/pier/purchasing.ts:69-108`. No automatic reorder point |
| 4 | "and keeps the books in step" | contract, not yet in code | No accounting integration; CONTRACT.md QuickBooks Online/Xero clauses |
| 5 | "100% free, open source alternative to Cin7, inFlow and Fishbowl" | backed | MIT licence: `LICENSE`, `package.json` `license`. (Feature parity with those products is the contract; the free/open-source claim is true today) |
| 6 | Tag "PO-1048 · 480 of 500 received · 20 short" | backed | Partial receipts into bins, the rest stays expected: `receipt.create` `src/pier/purchasing.ts:121` |
| 7 | Tag "EDI 856 sent · Target DC 0593" | contract, not yet in code | No EDI; CONTRACT.md EDI clause (SPS Commerce/Orderful) |
| 8 | Tag "Count mismatch · A-14 · recounted" | backed | Counts capture a bin's movement frontier, show drift and ask for a recount when stock moved: `count.capture/count.record/count.recount` `src/pier/warehouse.ts:119-147`, `src/ui/stock.tsx:18-19` |
| 9 | Tag "Picked 38 orders · 6:40 am" | partly | Dispatch picks from each order's reserved bins (`src/pier/orders.ts:113-160`, "Reserved sources for physical picking" `src/ui/sales.tsx`). No pick lists or waves |
| 10 | Tag "Bin A-14 · 212 units" | backed | Stock by bin: `src/ui/stock.tsx:24-25` |
| 11 | Tag "Reorder suggested · Blue Mug 12oz · 600" | partly | An agent or person prepares a replenishment proposal with minimum, recommended and stretch quantities for a person to approve: `proposal.prepare/proposal.approve` `src/pier/proposals.ts:57,100`. No automatic suggestion |

## Warehouse floor (page 2)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 12 | "Receive … from any phone or scanner" | partly | Receipts into bins: `receipt.create`; every view works at phone width (`src/ui/controls.tsx:21-28`). Items carry a barcode (`src/pier/catalogue.ts:52`), but there is no scan-driven receiving |
| 13 | "put away" | backed | A receipt names the destination bin for each line: `src/ui/purchasing.tsx:23` |
| 14 | "pick" | partly | As claim 9 |
| 15 | "pack" | contract, not yet in code | No packing step; CONTRACT.md warehouse execution clauses |
| 16 | "and count" | backed | As claim 8 |
| 17 | "Every bin knows exactly what it holds" | backed | Append-only movements per bin: `src/pier/model.ts`, `src/ui/activity.tsx:16-17` |
| 18 | Pick list "Wave 14 · Dock A", scan check per line, "B-03 empty · picked from overflow B-09" | contract, not yet in code | No waves, docks, scan confirmation or overflow suggestions |

## Channels (page 2)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 19 | "Shopify, WooCommerce, Amazon and Stall orders land in Pier" | contract, not yet in code | Orders are entered in Pier or imported from native CSV only |
| 20 | "stock flows back to each one within a minute" | contract, not yet in code | No channel sync |
| 21 | Card: one available count per channel, "100 held for FBA transfer" | contract, not yet in code | Available stock itself is backed (claim 1); per-channel holds are not |
| 22 | Toast "Order #4471 … reserved 9:12 am" | partly | An order reserves available stock the moment it is entered: `order.create` `src/pier/orders.ts:79-98`. The Shopify source is contract |

## Retail EDI and shipping (page 3)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 23 | "Take EDI purchase orders from Target, Walmart and Home Depot" | contract, not yet in code | CONTRACT.md EDI clause |
| 24 | "send the acknowledgment, ship notice and invoice on time" (855/856/810 card) | contract, not yet in code | No EDI documents or invoices; priced sales orders are covered by claim 54 |
| 25 | "Carton 7 label reprinted · GS1-128" | contract, not yet in code | No carton labels |
| 26 | "Pier compares UPS, FedEx and USPS through ShipStation or EasyPost" | contract, not yet in code | CONTRACT.md carrier clause |
| 27 | "prints the label and sends tracking to your customer" | contract, not yet in code | Dispatch records a shipment reference the person types (`src/pier/orders.ts:117`); no label or tracking |
| 28 | "Address corrected" | contract, not yet in code | No address validation |

## Interlude (page 4)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 29 | "All 214 orders out by 4 pm" | partly | Dispatch of reserved orders, in parts: `dispatch.create`. The day's count is a story figure; there is no daily dispatch summary |

## Replenishment and accounting (page 5)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 30 | "Reorder points learn from what actually sells" | contract, not yet in code | No reorder points or demand learning |
| 31 | "Pier drafts the purchase order" | partly | Purchase orders are drafted by a buyer or by an agent through the API (`po.draft`, `src/pier/purchasing.ts:69-87`, `API.md`) from reorder evidence; Pier does not draft them on its own |
| 32 | "with landed cost" (card: "$4.82 per unit · freight and duty included") | backed | `src/pier/landed-cost.ts`; `receipt.create` allocates freight and duty by received value or quantity, retains exact landed line totals and unit cost; `tests/api/costing.test.mjs`. |
| 33 | "backorders get a real date" | partly | Unmet demand shows as backorder (`src/pier/orders.ts:79-98`) and orders carry a promise date; no computed backorder date |
| 34 | "Send PO-1052" (to the supplier) | contract, not yet in code | No supplier messages (AGENTS.md: nothing sends supplier messages today) |
| 35 | "Two-way sync with QuickBooks Online and Xero: items, invoices, bills, cost of goods and inventory value" | contract, not yet in code | No accounting integration |
| 36 | "Anything off waits in one short queue" (review queue, bill 7731) | contract, not yet in code | No accounting review queue |

## Inventory agent and move in (page 6)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 37 | "The agent forecasts from real sell-through" | contract, not yet in code | No forecasting |
| 38 | "sends the PO" | contract, not yet in code | An agent may draft a PO but cannot approve it (`src/ui/purchasing.tsx:21` disables approval for `agent`) or send it. Note: the contract keeps human approval of exact versions, so the shipped behavior will be "the agent drafts, a buyer approves, Pier sends" |
| 39 | "chases the supplier" | contract, not yet in code | No supplier messages |
| 40 | "re-promises affected orders" (and "customers emailed") | contract, not yet in code | A shortage-reallocation proposal exists (`src/pier/proposals.ts:57`); no re-promising or customer mail |
| 41 | "checks the receipt closes in the books" | contract, not yet in code | No accounting |
| 42 | Agent log as a whole (an agent working the item's record) | partly | Agents act through the same commands with the `agent` role and prepare evidence-backed proposals a person approves: `src/pier/proposals.ts`, `src/ui/proposals.tsx`, `API.md` |
| 43 | "Move from Cin7, inFlow or Fishbowl" ("Importing from Cin7 Core") | partly | The native CSV importer with staged review, frozen cutover and undo: `import.stage`, `import.review`, `import.commit` and `import.undo` `src/pier/imports.ts:243-383`. No Cin7, inFlow or Fishbowl adapter; files are arranged in Pier's CSV shape (IMPORT.md) |
| 44 | "with your items, bins, stock on hand, customers, suppliers and open orders" | backed | The native kinds `items`, `locations`, `parties`, `positions`, `orders`, `purchaseOrders`, plus `reservations` (`IMPORT.md`, `src/pier/imports.ts`) |
| 45 | "Stock on hand … matched" (reconciliation at import) | backed | The reconciled and shadow review stages check totals before the frozen cutover: `import.review` `src/pier/imports.ts:317` |
| 46 | "Channels reconnect to the same listings" (and "Amazon · 2 listings awaiting SKU match") | contract, not yet in code | No channels |

## Ownership (page 7)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 47 | "Run Pier on your own computer or server" | partly | Your own computer: `rer dev` (README, /run). A server: `rer deploy` to the owner's own Cloudflare account (`deploy.json`, OPERATIONS.md); no hosted deployment is accepted yet |
| 48 | "keep every item, order and supplier. Export everything, any time" (and "Your stock, your data", "Export any time") | backed | `GET /api/pier/export` and `/api/pier/native-export` (`src/pier/api.ts:189-200`), the full archive `rer export` (`docs/backup-and-restore.md`, `tests/portable.mjs`) |
| 49 | The Ownership terminal's one-line start `npx -y @runeditrun/rer dev just-every/run-pier` (live 17 Oct, main 1c0f1c6) | backed | rer 0.2.38's `dev <repo>` clones, installs, sets up a local owner and starts; the output lines are rer's own |

## The quiet details (page 8)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 50 | "FIFO or average cost. Valuation your accountant will recognize." | backed | `costing.method`, `src/pier/valuation-ledger.ts`, `/api/pier/reports`: FIFO or moving average per install, dated prospective owner changes, remaining layers and receipt/shipment reconciliation. Operational USD valuation; ledger posting, FX and period locks remain COST-001 work. |
| 51 | "Transfers. Move stock between warehouses with a full trail." | backed | `transfer.send/transfer.receive` through a visible transit location: `src/pier/warehouse.ts:51,95` |
| 52 | "Returns. Back on the shelf or written off in one scan." | partly | Returns into quarantine, reviewed restock: `return.create/return.approve/return.restock` `src/pier/orders.ts:165,200`, `src/pier/api.ts:59`. No write-off and no scan |
| 53 | "Dead stock. Slow movers flagged before they cost you." | partly | `/api/pier/reports`, `src/ui/reports.tsx`: stock with no sale shipment or transfer out in N days, tied-up value and last movement. Scheduled warnings before the threshold (AUTO-001), kits and imported sales history remain unbuilt. |
| 54 | "Margin by SKU. Profit by item, channel and customer." | backed | Saved USD order prices/customer quantity tiers and shipment-consumed costs produce date-range margin by SKU, channel and customer (`src/pier/pricing.ts`, `orders.ts`, `reports.ts`). Operational shipment margin; invoice credits/ledger reconciliation remain REPORT-002 work. |
| 55 | "Activity log. Every scan, edit and sync, recorded." | backed | Every movement with its document, person, reason and command identity: `src/ui/activity.tsx:16-17`, `src/pier/storage.ts:67-80` (there are no scans or syncs to record yet; every edit that exists is recorded) |

## Closing (page 9)

"Open source inventory and order management for wholesalers and distributors" and "Free and open source, MIT licensed" restate claims 1, 2 and 5. The tags "Bin A-14 · 212 units" and "Shipped" restate claims 10 and 29.

## Links

- "Run Pier →" opens /run (Base's two-line Run page, rer 0.2.38).
- "Try the demo" opens the hosted demo, https://demo.run-pier.com/ (DEMO.md; answered 200 on 17 Oct 2026).
- "Read the docs" opens /docs.
