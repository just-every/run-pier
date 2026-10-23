# Pier homepage: every capability claim and what backs it

Branch `br/page` of just-every/run-pier (19 October 2026). The homepage now follows the owner-approved structure (page-s1, 17 October 2026): one purchase order, PO-1048 for 500 Blue Mug 12oz, followed from the reorder to the books. Its copy is the design desk's, accepted by the owner. Each claim the page makes, in its copy and in every drawn card, is mapped here to the code on this branch. The page may show the product being built toward; a claim the code does not make yet says so.

Status:
- **backed**: the code does it today (path given).
- **partly**: the code does part of it; the rest is named.
- **contract, not yet in code**: a target in CONTRACT.md; nothing in the code does it yet.

Command names are the `type` strings Pier's command door accepts (`POST /api/pier/commands`, `src/pier/api.ts`). The sample figures (dates, quantities, money) are the story's, in `src/site/landing/story.ts`; they are internally consistent but are not read from an installation.

## Totals

| Status | Claims |
|---|---|
| backed | 26 |
| partly | 17 |
| contract, not yet in code | 3 |
| **all claims** | **46** |

## 01 Hero (unchanged)

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 1 | "Pier tracks stock across your warehouses" | backed | Warehouses and bins: `location.save` (`src/pier/catalogue.ts`); on hand, reserved, available, quarantine and expected per item, warehouse and bin: `src/pier/model.ts`, `src/ui/stock.tsx`; `tests/api/stock.test.mjs` |
| 2 | "runs orders from channel to carrier" | partly | Channel orders reserve through `src/pier/channels/commands.ts` (Stall and WooCommerce live; Shopify and Amazon on recorded fixtures); dispatch is native (`src/pier/floor/`); carrier rates and labels through EasyPost on synthetic recordings (`src/pier/shipping/`). |
| 3 | "reorders before you run out" | backed | Learned reorder points, stock-position netting and automatic unapproved drafts: `src/pier/replenishment.ts`, `src/pier/replenishment-demand.ts`; `tests/api/replenishment.test.mjs` |
| 4 | "and keeps the books in step" | partly | Supplier-invoice matching, receipt and COGS journals, landed cost and valuation post to Pantry (`src/pier/books/`, `tests/api/books.test.mjs`, `tests/api/books-landed.test.mjs`); QuickBooks Online and Xero adapters run on protocol fixtures only, awaiting owner apps. |
| 5 | "100% free, open source alternative to Cin7, inFlow and Fishbowl" | backed | MIT `LICENSE`; no licensing gates (`tests/api/open.test.mjs`). Feature parity with those products is the contract. |
| 6 | The six hero tags (PO-1048 480 of 500 · 20 short; EDI 856 sent · Target DC 0593; Count mismatch · A-14 recounted; Picked 38 orders · 6:40 am; Bin A-14 · 212 units; Reorder suggested · 600) | partly | Each returns below as a stage and carries that stage's status: rows 9, 16, 15, 21, 13 and 8. The EDI 856 tag is partly (row 21); the others are backed. |

## 02 Oct 6 · Reorder, "Ordered before it runs out." / Oct 21 · Ship notice, "Twenty short. Already sorted."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 7 | "The inventory agent reads sell-through across your channels, sees the gap" (card: 660 on hand · selling 16 a day; runs out Nov 16 · lead time 28 days) | partly | Agents read native demand, days of cover and projected stockout through the state API: `src/pier/replenishment-demand.ts`. Mapped channel orders contribute once at first Pier capture, net of native cancellations; linked shipments are excluded from the shipment contribution. Historical provider backfill, incumbent history and the wider optimization remain AGENT-002 work. |
| 8 | "Order 500 by Oct 7 · 12 days safety" (order-by date from lead time plus safety stock) | backed | Lead demand plus editable safety stock sets the point and quantity: `src/pier/replenishment-demand.ts`, `src/ui/replenishment.tsx` |
| 9 | "… and sends the purchase order" (PO-1048 · 500 × $4.20 · sent Oct 7 · confirmed Oct 8, ships Oct 21) | backed | An inventory agent sends one exact committed PO under buyer authority, with reminders and recorded supplier confirmations: `src/pier/purchase-send.ts`, `src/pier/purchasing-workflow.ts`; `tests/api/purchase-send.test.mjs`. RER Managed email is not available yet. |
| 10 | "The supplier's ship notice drops to 480" (EDI 856 · Ship notice card from the supplier) | contract, not yet in code | Pier sends retail 856s (`src/pier/edi/outbound.ts`); taking a supplier's inbound ship notice against a PO is BUY-002/EDI-001 work. A changed supplier confirmation can be recorded on the PO today. |
| 11 | "20 follow on PO-1048-B · due Nov 12" | partly | A partial receipt keeps the remainder expected on the PO with its date (`receipt.create`, `src/pier/purchasing.ts`); splitting the remainder onto a numbered follow-on PO is not automatic. |
| 12 | "The agent checks each open order against stock, and no promise moves" (Fernwood Market SO-2318 · 40 ship Nov 5 from stock · promise kept; open orders checked · none late; no customer date moved) | partly | Supply changes recompute backorder promises and flag changed dates for review: `src/pier/backorders.ts`, `src/pier/purchasing-workflow.ts`. The agent-run check across all open orders is AGENT-003 work. |

## 03 Nov 3 · Receiving, "Checked in at the door."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 13 | "Each carton is scanned against the PO as it comes off the truck" (Receiving · PO-1048 · Carton 24 of 24 scanned; Dock 2) | backed | Scan-to-receive against a committed PO with unit and case barcodes: `receiving.start/scan/post`, `src/pier/floor/receiving.ts`, `src/ui/floor/receive.tsx`; `tests/api/floor.test.mjs` |
| 14 | "480 of 500 received · 20 short" | backed | Partial receipts post into bins and keep short lines on the receipt: `receipt.create`, `src/pier/purchasing.ts` |

## 04 Nov 3–4 · Put away and count, "Right bin, right count."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 15 | "Scan the bin, scan the carton" (put away: A-14 212 → 452, A-15 overflow 0 → 240; 480 put away) on a rugged handheld | backed | A bin label moves put-away; a receipt names each line's bin; a handheld's built-in scanner types into the scan box: `src/pier/floor/receiving.ts`, `src/ui/floor/scanner.tsx`, `src/ui/purchasing.tsx` |
| 16 | "A count that disagrees gets a recount" (Cycle count CC-0412 · expected 452 · counted 432; Recount · 452 · adjustment none) | backed | Counts capture the bin's movement frontier, show the difference and ask for a recount: `count.capture/count.record/count.recount`, `src/pier/warehouse.ts` |
| 17 | "… before anything moves" ("Nothing moves from A-14 until a second count") | partly | No adjustment posts until a count is recorded and reviewed (`src/pier/warehouse.ts`); holding the bin against picks during the recount is COUNT-001 work. |

## 05 Nov 4 · Orders, "Every channel, one count."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 18 | "Orders from your stores, marketplaces and EDI land in one queue" (Shopify, Amazon, Target EDI 850, Stall, Wholesale SO-2318) | partly | Stall and WooCommerce live, Shopify and Amazon on recorded API fixtures (`src/pier/channels/adapters/`, `tests/api/channels.test.mjs`); EDI 850 intake makes sales orders (`src/pier/edi/intake.ts`); native wholesale sales orders (`src/pier/orders.ts`). Reviewed customer CSV/XLSX intake and source routing are in `src/pier/sales-imports.ts` and `src/pier/routing.ts`; Faire remains row 19. |
| 19 | Faire 7KQ2M9 · 24 among the orders, and Faire among the channels stock goes out to | contract, not yet in code | CHANNEL-001 names Faire; no Faire adapter exists yet. |
| 20 | One count: 571 available, 692 on hand, 121 reserved for these 6 orders | backed | Hard reservations against on-hand stock give one available count: `src/pier/model.ts`; `tests/api/stock.test.mjs` |
| 21 | "855 acknowledged to Target · 9:41 am" (and the hero's and ship day's "EDI 856 sent · Target DC 0593") | partly | Reviewed 855 and 856 from closed packs: `src/pier/edi/`, `tests/api/edi.test.mjs`. Sends proven at the synthetic bridge edge; no Target certification or live transport. |
| 22 | "Stock goes back out to every channel" (571 to Shopify, Amazon, Faire, Stall) | partly | Publication after each committed change with one-minute reconciliation: `src/pier/channels/sync.ts`. Live read-backs for Stall and WooCommerce; Shopify and Amazon on fixtures; Faire is row 19. |

## 06 Nov 5 · Ship day, "All out by 4 pm."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 23 | "Pick by wave" (6:40 am · Wave 14 picked · 38 orders) | backed | Pick waves with a scan per line, "Picked N orders · time": `wave.release`, `pick.scan`, `src/pier/floor/waves.ts`, `src/ui/floor/pick.tsx`; `tests/api/warehouse-waves.test.mjs` and `tests/browser/warehouse-waves.spec.ts` prove ten-order tote isolation, overflow and zone merge at desktop/phone widths. |
| 24 | "pack" (9:15 am · Packed · 61 cartons) | backed | Cartons packed, weighed and measured: `pack.scan/carton/measure/close`, `src/pier/floor/packing.ts`; exact current-pack slips: `src/pier/floor/pack-documents.ts`, `tests/api/packing-documents.test.mjs` and the desktop/phone print journeys in `tests/browser/warehouse-waves.spec.ts`. Versioned retained business PDFs and current-pack printing: `src/pier/print/`, `tests/api/packing-documents.test.mjs` and `tests/browser/journey.spec.ts` (“business document templates preserve invoice reprints and retained pack-station PDFs at 1440 and 390”). |
| 25 | "send the ship notice" (11:20 am · EDI 856 sent) | partly | As row 21. |
| 26 | "rate-shop" (Rate shop · SO-2291 · UPS $38.12, FedEx $36.40 chosen, USPS $44.90) | partly | EasyPost rates from measured cartons with cheapest and fastest markers: `src/pier/shipping/`, `tests/api/shipping.test.mjs`. Synthetic recordings until an owner EasyPost account; ShipStation is SHIP-001 work. |
| 27 | 1:05 pm · Address corrected · 1420 E Main St | partly | SHIP-001 names address verification (the critic's gap predates that clause text). Code shows the standardized address beside the original for accept or keep: `src/pier/shipping/commands.ts`, on synthetic provider recordings. |
| 28 | "print the label" (2:10 pm · UPS label failed · weight missing; 2:14 pm · re-weighed · label printed) | partly | A refused or uncertain label request is kept and reconciled before a second purchase; cartons are re-measured on the pack: `src/pier/shipping/`, `src/pier/floor/packing.ts`. Live postage and physical printers remain pending. |
| 29 | "Tracking goes to each customer" | partly | Stored tracking and install-mail tracking messages: `src/pier/shipping/`, `tests/api/shipping.test.mjs`. RER Managed email is not available yet. |
| 30 | 3:55 pm · 214 orders out (and the closing's "214 orders out") | backed | Floor → Dispatch day: the day's orders by state against each cut-off, "All N orders out by time" when every due order left: `src/pier/floor/summary.ts`, `src/ui/floor/dispatch.tsx`; `tests/api/dispatch.test.mjs`. The count is a story figure. |

## 07 Nov 6 · The books, "Billed for 500. Paid for 480."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 31 | "Pier matches each bill to its PO and receipt, holds the difference" (Three-way match · Bill 7731: PO-1048 500 × $4.20, received 480, bill 500 · $2,100.00; 20 units not received · $84.00 held) | backed | Supplier invoices match PO and receipt quantities, prices, freight and tax with tolerances and hold or approve: `src/pier/books/supplier-bills.ts`; `tests/api/books.test.mjs`; `tests/api/supplier-bill-documents.test.mjs` |
| 32 | "Agent requested a credit · Nov 6" | contract, not yet in code | Supplier credits for short goods are BUY-003; an agent asking for one is AGENT-003. Nothing sends the request yet. |
| 33 | "Credit memo CM-311 · $84.00" and "Paid $2,016.00 for 480" | partly | Payments close the matched payable (`src/pier/books/receipt-closure.ts`, `tests/api/books.test.mjs`); recording a supplier credit memo against the bill is BUY-003 work. |
| 34 | "posts landed cost" ("Landed cost $4.38 a unit · freight $86.00 included") | backed | Freight and duty allocated over a receipt to exact landed unit cost, posted as a whole-cent journal: `src/pier/landed-cost.ts`; `tests/api/costing.test.mjs`, `tests/api/books-landed.test.mjs` |
| 35 | "… to QuickBooks Online or Xero" ("Posted to QuickBooks Online") | partly | Posts reach Pantry today; QuickBooks Online and Xero adapters run on protocol fixtures only, awaiting owner apps (`src/pier/books/adapters/`). |

## 08 Oct 6 – Nov 16 · Stock card, "Six weeks, one card."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 36 | "Each scan, sale, count and bill writes a line" (the stock card's movements with references) | partly | Append-only movements plus durable accepted and refused scan resolution, item before and after edits and admitted connector outcomes appear in Activity and export (`src/pier/audit.ts`, `tests/api/floor.test.mjs`, `tests/browser/journey.spec.ts`). Atomic native import publication and undo, removed-item corrections and grant images are also retained (`tests/api/security-import.test.mjs`). Complete provider attempts, sensitive edit images and erasure accountability remain AUDIT-001 work; this row follows its partial clause. |
| 37 | "Value moves with it" (FIFO · USD values per line, landed cost applied Nov 9) | backed | FIFO or moving average per install with remaining layers: `src/pier/valuation-ledger.ts`, `/api/pier/reports`; `tests/api/costing.test.mjs` |
| 38 | Reorder row: "Reorder suggested · 571 available = 36 days; 40 needed (28 lead + 12 safety) · PO-1061 +600 on order" | backed | Suggestions with days of cover, lead time and safety stock, and the PO they draft: `src/pier/replenishment.ts`, `src/pier/replenishment-demand.ts` |

## 09 Move in, "Bring your warehouse with you."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 39 | "Items, bins, stock on hand, customers, suppliers and open orders come across from Cin7, inFlow or Fishbowl" ("Importing from Cin7 Core": items 4,812, bins 1,206, stock on hand 318,440 units · matched, open sales orders 187, open purchase orders 37) | backed | Cin7 Core, inFlow and Fishbowl export mappings with reconciled review and frozen apply: `src/pier/import-incumbent.ts`, `src/pier/imports.ts`, `src/ui/import-movein.tsx`; `tests/api/movein.test.mjs` |
| 40 | "Channels reconnect to the same listings" ("Amazon · 2 listings awaiting SKU match") | backed | Listing IDs carried over, exact SKUs auto-match, unknown listings wait for `channel.match` without publishing: `src/pier/channels/` |
| 41 | The one-line start `npx -y @runeditrun/rer dev just-every/run-pier` and what it does ("# clones, installs and starts Pier on your computer") | backed | rer 0.2.63's `dev <repo>` clones, installs and starts (`global/cli/repo-command.mjs`, `global/launch/prepare.mjs`, `global/launch/render.mjs`). The homepage shows the command and a comment, not rer's output, so it carries no `RER_` line or loopback address. |
| 42 | "Runs on your own computer or server" | backed | Local `rer dev` and own-account `rer deploy` (`deploy.json`, [Put Pier online](hosting.md)). |
| 43 | "Where Pier stops. Manufacturing work orders, point of sale and 3PL client billing." | backed | CONTRACT.md, "Product separation and US operating boundary": Larder owns manufacturing and production orders; Stall owns the storefront and checkout, with Square or Stripe for payments; Pier integrates third-party warehouses rather than operating one. A boundary, not a capability. |

## 10 Closing, "Every shelf, counted."

| # | Claim | Status | Code path / note |
|---|---|---|---|
| 44 | "Open source inventory and order management for wholesalers and distributors" | backed | Restates rows 1, 2 and 5. |
| 45 | Tag "PO-1061 sent · 600 Blue Mug 12oz" | backed | As rows 9 and 38: the suggestion of Nov 4, sent. |
| 46 | "Free and open source, MIT licensed" | backed | `LICENSE`, `package.json` `license`. |

## Links

- "Run Pier →" opens /run (Base's Run page).
- "Try the demo" opens the hosted demo, https://demo.run-pier.com/ (DEMO.md).
- "Read the docs" opens /docs; "Read the contract →" opens /contract; "Runs on your own computer or server." opens /run.

Earlier versions of this table, for the homepage built on the shared twelve-section skeleton (rows 1–55), are in the repository's history.
