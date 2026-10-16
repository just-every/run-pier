# Pier product contract

Target edition: **16 October 2026**, revised 17 October 2026 after buyer review round 1. US first buyer: the owner or operations manager of a small finished-goods wholesaler or distributor, operating in **USD**, usually keeping QuickBooks Online.

Pier is a connected inventory and order management system: know what can be promised, replenish in time, execute warehouse work accurately and carry every order through shipment and reconciled accounting. A buyer switching from **Cin7 Core, inFlow Inventory or Fishbowl Warehouse** must be able to run that whole job. Planning and automation extend beyond the inventory work represented by **Prediko and DOSS**, with actual operational closure rather than forecasts and alerts alone.

This is the product we are building toward, not a description of everything available today. The named clauses are requirements; their acceptance journeys are targets until supported by the status table and [ACCEPTANCE.md](ACCEPTANCE.md). The inspected code is `fe37107650b9a328b4e92945784039f255086b97`, the same commit as the 16 October inventory code audit. `done` means the stated current local behavior has implementation and exercising tests; it does not establish real provider, hosted, legal or physical-device acceptance. `partial` states the implemented subset; `missing` has no implementation of the promised behavior. Future journeys do not become evidence by being written here.

## Product separation and US operating boundary

Pier owns inventory, wholesale commercial rules, purchasing, warehouse execution, fulfilment and operational reconciliation. [Stall](https://github.com/just-every/run-stall) owns the Shopify-style public/private storefront, cart and checkout experience; Pier is its stock system, including the private trade-ordering connection in SALES-005. [Larder](https://github.com/just-every/run-larder) owns manufacturing/MRP, manufacturing BOMs, production orders and shop-floor work; Pier exchanges finished-goods demand, availability and receipts through reviewed integration. Kits and bundles assembled from stocked finished goods without transforming them (case assortments, display kits, gift sets) are inventory work that Pier owns under KIT-001, as Cin7 Core and inFlow treat them. Larder owns BOMs that transform materials through operations, routings, work in progress, scrap and yield, and a Larder-built SKU arrives in Pier as a reviewed finished-goods receipt. No manufacturing scope is absorbed from the older research’s Katana/production examples. Neither boundary cuts the connected inventory job.

US norms include USD operational valuation, US addresses and time zones, sales-tax/exemption evidence, ACH where used for payments, and explicit accounting period controls. Foreign-currency supplier purchases retain their source value and reviewed USD conversion; they do not change the US first-buyer focus. The current AUD-native defaults in IMPORT.md and the interface remain an implementation gap under COST-001 and MIGRATE-001.

Pier integrates carrier networks through ShipStation/EasyPost, EDI transport through SPS Commerce/Orderful and third-party warehouses through ShipHero/Extensiv; it does not operate those networks. QuickBooks Online/Xero remain the general ledger and accountant-approved books; Square/Stripe handle payment processing, and tax filing remains with the accountant/tax provider. Pier owns operational valuation, document exchange, reconciliation and unresolved exceptions, including partner onboarding and credentials required to make those workflows work. Ordinary lot traceability is included; regulated release/recall certification, customs brokerage and bonded-warehouse compliance use specialist partners with retained evidence. Background forecasting and document processing use bounded jobs/approved compute rather than unbounded request handlers.

“Pier” remains a working product name, not a legal name-clearance assertion. Hosted, provider, security-baseline, device/printer, owner-export, accessibility and physical-stock acceptance each require their own evidence; their difficulty does not remove a target clause. Existing owner-approved homepage, interface and behavior are unchanged by this document round.

## Existing twelve operator journeys

The original journey numbers 1–12 are retained in order as PIER-001–PIER-012. Their established native behavior remains part of the full product, with broader capabilities specified below. Existing local test evidence is preserved rather than relabeled as proof of new integrations.

### PIER-001 — Define stock.

An operator creates a SKU, unique barcode, base unit, exact pack conversion and warehouse/bin locations, with sellable and quarantine stock. Archiving a used SKU preserves its history. Once movements, counts, supplier terms, orders or purchase orders reference an item, its unit and pack conversion are immutable; a location’s bin/transit kind is immutable after movements or counts reference it.

**Acceptance evidence:** Journey 1: create fractional-pack stock and bin/transit locations through the UI and authenticated commands, reference them with counts and documents, then attempt unit/pack/kind edits and archive the item. Edits fail atomically and archived history remains readable.

### PIER-002 — Maintain counterparties and supplier terms.

Operators link suppliers and customers. Each supplier/item pair has one versioned terms record with supplier code, pack, price, minimum order and lead time. Purchase commitments and receipts retain their exact terms snapshot when the supplier later changes terms.

**Acceptance evidence:** Journey 2: create supplier terms, commit a PO, revise terms and read the original PO/receipt. The commitment retains its original quantities, price and source version; duplicate-pair creation cannot bypass the versioned record.

### PIER-003 — Review native opening inventory.

Owners stage native CSV items, locations, counterparties, opening positions and open documents; review mappings, originals and reconciliation; resolve ambiguous rows; and approve one cutover. Optional reservations preserve exact per-line/bin allocations, including explicit zero backorders. Without that file, the six-kind importer reserves available stock. Changed source rows require reviewed revision, and downstream dependencies constrain undo. Safe undo before downstream work restores exact before-images and removes only that import’s created graph/movements; retained immutable originals and import custody explain this narrow exception to append-only operational corrections. The current AUD native shape in IMPORT.md is implementation evidence, not fulfillment of the USD and incumbent adapters below.

**Acceptance evidence:** Journey 3: preview and freeze a native batch, commit once, repeat unchanged input, revise a changed opening and exercise safe versus dependency-blocked undo. Import a wholly backordered and a bin-allocated line with reservations.csv; no duplicate opening or silent reallocation appears.

### PIER-004 — Commit sales demand without overselling.

Sales staff enter customer order lines. Pier reserves sellable availability atomically and exposes shortages as backorders. It never creates stock, reserves the same unit twice or permits negative sellable stock. Quarantine, in-transit and expected receipts cannot satisfy a present-stock reservation.

**Acceptance evidence:** Journey 4: submit simultaneous orders for the last fractional units through authenticated HTTP and retry a lost response with the same command. Total reservations never exceed on-hand sellable stock and unmet demand remains visible.

### PIER-005 — Approve exact purchase commitments.

A buyer reviews shortages and expected receipts, drafts a supplier PO, approves its exact supplier, quantity, price and promise date, then commits it. Material changes invalidate approval. Ordered quantities remain expected until a real receipt posts; an agent may prepare evidence but cannot approve its own purchase.

**Acceptance evidence:** Journey 5: prepare a PO as an agent, attempt self-approval, obtain buyer approval, change a material term and attempt commit. Only a freshly approved version commits and it changes expected supply rather than on-hand stock.

### PIER-006 — Receive partial purchases atomically.

Warehouse staff receive some or all of a committed purchase into named bins, recording supplier reference and exact receipt cost. The remainder stays expected. Invalid or over-received lines cannot partially post an otherwise valid multi-line receipt.

**Acceptance evidence:** Journey 6: partially receive a multi-line PO, repeat the command, then submit one invalid line. The first receipt posts once, exact cost is retained, remaining expected quantities reconcile and the invalid receipt leaves every line unchanged.

### PIER-007 — Correct receipts with physical evidence.

Warehouse staff can reverse a receipt only when later work does not depend on it. With downstream movements, they capture and approve a physical count for a receipt bin; receipt.correct posts a linked compensating adjustment at that frontier. Originals remain and a stale count cannot overwrite later movement.

**Acceptance evidence:** Journey 7: reverse an unused receipt, attempt reversal after stock is reserved or dispatched, then correct against an approved physical count. Intervening movement invalidates the old count; successful correction retains the original and its compensating link.

### PIER-008 — Transfer through visible transit.

Warehouse staff dispatch available units through a real transit location and separately confirm destination receipt. Transit stock is unavailable to sales and transfers conserve quantity. Repeated commands cannot dispatch or receive twice.

**Acceptance evidence:** Journey 8: dispatch a transfer, try to sell its in-transit units, partially receive at the destination and retry. Source plus transit plus destination reconciles throughout and transit cannot be promised as current sellable stock.

### PIER-009 — Dispatch only owned reservations.

Warehouse staff partially dispatch an order against that order’s own reservations. Shipment identity links order lines and consumed reservations; undispatched demand remains outstanding. Another order’s allocation cannot be consumed and a retry never decrements stock twice.

**Acceptance evidence:** Journey 9: partially dispatch an order, attempt to use a foreign reservation and retry after response loss. Read the shipment and remaining order: exact consumed allocations and outstanding demand reconcile.

### PIER-010 — Cancel and inspect returns.

Staff cancel only unshipped demand and release only its remaining reservations. A return points to an actual dispatch line and cannot exceed dispatched units less prior returns. It enters quarantine and requires separately reviewed restock before becoming sellable.

**Acceptance evidence:** Journey 10: cancel the remainder of a partially shipped order, return shipped units, reject an excess return and review a partial restock. Shipment history survives and quarantined units cannot be sold before restock.

### PIER-011 — Count at a captured movement frontier.

Warehouse staff capture a movement frontier, record a physical count, inspect variance and approve an exact adjustment or recount. A movement after capture makes the review stale; a model estimate cannot replace a physical count.

**Acceptance evidence:** Journey 11: capture and count a bin, move stock, then attempt the old approval. It fails without changing stock; a new captured count can produce the exact approved compensating movement.

### PIER-012 — Investigate and leave with native data.

People trace balances to movements, source documents, actors, reasons, command identities and reversal/import provenance. They export business records and costs and restore the complete current installation archive into a fresh local installation without posting openings twice. Durable operator and approval identities are historical evidence rather than access grants; operation requires a fresh native session.

**Acceptance evidence:** Journey 12: investigate a corrected receipt and dispatch, export, restore into fresh local D1, compare business records and journal links, replay an unchanged import and execute a new authorized transaction after fresh sign-in.

## Complete connected wholesale operations

### CAT-001 — Wholesale catalogue and units.

The catalogue adds variant families, categories, supplier and customer item references, images, weights and dimensions, case-pack ordering and exact conversions to the stock definitions above. Bulk import/edit previews collisions and affected documents; used-unit invariants remain. Search and filters work across SKU, barcode, aliases and archived history without hiding duplicate matches. Owners define typed custom fields on items, customers, suppliers and orders; those fields appear in filters, imports, exports and PRINT-001 documents.

**Acceptance evidence:** Import variants with supplier/customer aliases, dimensions and fractional packs through catalogue import; preview a bulk change, reject duplicate barcodes and search by each alias. A case-pack quote, pick and label retain the same base-unit quantity. Add a custom field to items and orders, filter by it, print it on a packing slip and find it in export.

### KIT-001 — Kits and bundles from stocked components.

Owners define a kit SKU from stocked component SKUs with exact per-kit quantities and units, as Cin7 Core assembly kits and inFlow bundles do. A kit has its own price, barcode, documents and channel mapping but no independent physical stock unless pre-assembled. Selling a kit on a quote, sales order or channel order reserves every component atomically at one warehouse; a shortage of any component backorders or blocks the whole kit under the configured policy and never reserves a partial set. Published kit availability is the lowest whole-kit count buildable from each component’s sellable availability net of reservations and channel buffers, recalculated whenever a component moves. Pick lists and packing slips show the kit line with its component picks and bins; dispatch consumes each component reservation once; COGS is the sum of the component cost layers actually consumed, and margin is reported per kit. Owners may pre-assemble kits through a reviewed kitting task that consumes components and receives the kit SKU at a rolled-up cost, and disassemble them the same way. Kit returns are inspected per component. Kit definitions are versioned and an order keeps the version it reserved. Kitting changes no material, so it is inventory work in Pier, not Larder manufacturing.

**Acceptance evidence:** Define a two-component case-assortment kit and a three-component display kit from stocked SKUs. Sell the first on a sales order and through a connected channel concurrently: component reservations, published kit availability (the lowest buildable count across components), the pick list and COGS agree. Drain one component: kit availability drops to zero and a further kit order backorders as a whole kit. Pre-assemble five display kits, ship two, return one and inspect its components: rolled-up kit cost, component stock and kit margin reconcile, and no component is reserved twice.

### TRACE-001 — Serial, lot and expiry traceability.

Receiving, bin moves, allocations, picking, dispatch and returns retain serial/lot identity and expiry. Operators can quarantine a lot, choose FIFO/FEFO within approved policy and trace suppliers to affected customers and back. Duplicate serials, expired picks and wrong-lot scans are blocked or require an authorized recorded exception. Ordinary traceability does not certify regulated release or recall compliance.

**Acceptance evidence:** Receive two dated lots and serialized units through warehouse screens, transfer and split-dispatch them, quarantine one lot and return a serial. Trace the exact customers and receipts; a duplicate serial and expired/blocked lot cannot silently ship.

### SCAN-001 — Generate, scan and print warehouse barcodes.

Operators generate and validate item, bin, lot and shipment barcodes and print appropriate labels on Zebra and DYMO printers. USB/Bluetooth scanners, Zebra TC-series and comparable rugged Android handhelds whose built-in scanner works as a keyboard wedge, and iOS/Android cameras work through the warehouse workflow, with supported symbologies and label sizes stated. Unknown or ambiguous scans ask for resolution; print failure never marks physical work complete.

**Acceptance evidence:** At a warehouse device, print a real item/bin label, scan it by USB scanner, a Zebra TC-series keyboard-wedge handheld and phone camera and complete a receive-to-pick handoff. Duplicate/unknown scans, a disconnected printer and a mismatched label produce actionable errors without stock effects; retain device/printer acceptance separately from software tests.

### WMS-001 — Mobile receive, put away, pick, pack and count.

Warehouse staff use desktop, handheld and 390px phone screens for scan-driven receiving, directed bin put-away, pick lists, pick verification, packing, transfers and cycle counts. Picks show source bin, unit, lot, kit components and shortages; the pack step prints the PRINT-001 packing slip and carton labels; separate picked, packed and shipped states prevent a scan or label purchase from pretending goods shipped. Interrupted work resumes its exact task and command. Network loss is visible; queued work reconciles before committing against current availability.

**Acceptance evidence:** On phone and desktop, receive and put away a partial PO, follow a pick list across bins, scan a wrong SKU, split a pack and shipment, print its packing slip at the pack step, transfer and cycle-count. Interrupt connectivity mid-task and resume; no stale allocation or double movement posts.

### WMS-002 — Directed replenishment and slotting.

Location policies define capacity, pick faces, replenishment thresholds and permitted stock. Pier proposes put-away and reserve-to-pick replenishment, prioritizes tasks and explains ABC slotting recommendations using pick velocity, item size and travel data. Travel data is the walking distance between bins, taken from each location’s aisle, bay and pick-sequence coordinates, together with observed pick-task times. Supervisors approve location changes and physical staff confirm movement; recommendations never relocate inventory on their own.

**Acceptance evidence:** Configure pick-face minimums and bin capacity, receive an oversized item and run a replenishment/ABC plan. An operator completes the approved scan tasks; over-capacity placement is refused and slotting alone changes no stock.

### SALES-001 — Quote, price and convert orders.

Sales staff create versioned quotes, apply customer price lists, volume breaks, discounts and TAX-001 tax estimates and exemptions, send the PRINT-001 quote and order-confirmation documents by email and convert accepted quotes to sales orders without rekeying. Expired pricing and material edits require renewed acceptance. USD totals, units and rounding stay exact and margin/discount permissions are enforced.

**Acceptance evidence:** Quote a case-pack order at two customer tiers, apply an authorized discount, email the quote (its sent PDF kept on the record) and accept one version, then convert once, reserve it and send the order confirmation. A duplicate acceptance cannot create another order; changing price or quantity invalidates earlier approval.

### SALES-002 — Customer history, credit and financial returns.

Customer records show contacts, addresses, item references, order and shipment history, payment terms, outstanding balances, credit limits and overdue holds. Balances come from SALES-006 invoices and credit notes and PAY-001 payments; Pier produces customer statements and AR aging (current, 1–30, 31–60, 61–90, over 90 days) that reconcile to the ledger. Authorized sales staff review overrides with reasons. Dispatch-linked returns produce partial customer credits/refunds and restock or write-off decisions; physical disposition and financial credit remain separate and reconcile to the ledger.

**Acceptance evidence:** Place an order for a customer over its credit limit, approve an override, partially ship, return damaged and sellable units and issue the correct credit note. Customer balance, AR aging, the emailed statement, quarantine, refund and accounting reconciliation agree without restocking damaged units.

### SALES-003 — Available-to-promise and fulfilment routing.

Sales staff see present availability and dated available-to-promise by warehouse, accounting for committed demand, inbound confirmations, lead times, transit, safety stock and split deliveries. Routing policies weigh service dates, shipping cost and warehouse eligibility. Reprioritizing reservations or changing a customer promise requires authorized review and a customer communication; uncertain inbound supply is labeled rather than guaranteed. When stock arrives, Pier lists the backorders it can now fill, ranked by an owner-set priority rule (promise date, customer priority, order date), and proposes allocations from that receipt. An authorized user releases them in one action, or an AUTO-002 policy releases them within its bounds, without re-authorizing each order.

**Acceptance evidence:** Create competing orders with stock in two warehouses and a late inbound PO; compare split and later shipment options, approve one reallocation and changed promise. Another order cannot lose its allocation silently; stale supplier confirmation forces recalculation. Receive the late PO: the fill-backorders list ranks the waiting orders by the priority rule and one release allocates them without re-entering any order.

### SALES-004 — Recurring and dropship orders.

Authorized staff schedule recurring wholesale orders with explicit customer, price, cadence, stock/credit policy and pause/cancel controls. Dropship lines link sales demand to a supplier PO and direct-to-customer shipment, carrying confirmations, tracking, credits and cost without inventing a receipt in Pier’s own warehouse.

**Acceptance evidence:** Run a recurring order across a price change and credit hold, pause it and confirm no further order is created. Fulfil a dropship line from supplier confirmation to tracking and customer credit; local on-hand stock remains unchanged.

### SALES-005 — Private wholesale ordering through Stall.

Pier supplies authenticated trade-buyer catalogue availability, customer-specific prices, terms, credit rules, reorder history and order status to a private wholesale ordering experience through [Stall](https://github.com/just-every/run-stall) and the public integration API. Stall owns storefront design, carts and checkout; Pier owns stock, wholesale commercial rules and order execution. Abandoned wholesale carts may trigger owner-configured follow-up with consent and suppression, using Stall events; cart activity alone never reserves stock.

**Acceptance evidence:** A trade buyer signs into a Stall-connected private catalogue, sees only its approved prices, reorders and receives Pier order/tracking status. Another buyer cannot see those prices. An abandoned-cart event sends one authorized reminder, stops after purchase/unsubscribe and creates no stock reservation.

### SALES-006 — Customer invoices, charge lines and credit notes.

Pier creates the customer invoice. An invoicing policy set per customer or order type decides when: on shipment, once per partial shipment, or before shipment for prepay/proforma. A simple sale has one invoice. A split-shipped order is invoiced once per shipment for exactly the shipped quantities. A prepay order is invoiced on acceptance, and its later shipments reconcile against that invoice without a second charge. Invoices carry freight, handling, surcharge and discount charge lines, tax lines from TAX-001, the customer’s payment terms (due on receipt, Net 15/30/60, end of month, early-payment discount) and a due date derived from those terms and the invoice date. An invoice is drafted, reviewed and authorized. Once authorized it is immutable and is corrected only by a linked credit note or void. Credit notes apply against a named invoice for returns (PIER-010, SALES-002), price adjustments or freight refunds and are refunded through PAY-001 or kept as customer credit. Each authorized invoice and credit note posts once to the connected ledger (ACCOUNT-001/002) and drives the SALES-002 customer balance. Customers priced in CAD or another currency are quoted and invoiced in that currency; the exchange rate is retained and the USD value reported.

**Acceptance evidence:** Ship a Net 30 wholesale order in two partial shipments and invoice each shipment with its own freight line. Invoice a prepay order before shipment, then ship it without a second charge. Due dates follow Net 30 from each invoice date. Issue a credit note against the first invoice for a returned line. Each invoice and credit note posts to QBO exactly once (replay creates no duplicate), and the SALES-002 balance equals invoices less credits and payments. An edit to an authorized invoice is refused; a CAD invoice retains its rate and reports its USD value.

### TAX-001 — US sales tax on quotes, orders and invoices.

Owners configure one sales-tax source of truth per company: Avalara AvaTax, Stripe Tax, QuickBooks Online automated sales tax, or Pier’s owner-maintained rate table by jurisdiction. Tax is calculated per line from the ship-to address, product tax code and each state’s rule, including whether freight and handling are taxable; origin-based states follow the provider or table rule. Quotes and orders show an estimate labelled with its source; the invoice amount is final at authorization. With Avalara or Stripe Tax, the authorized invoice commits the transaction, and a credit note or void adjusts or voids that committed transaction. With QBO automated sales tax, Pier adopts the tax QBO returns on the posted invoice and flags any difference from the estimate. Resale and other exempt customers hold exemption certificates by state, with reason, number, expiry and document (DOC-001), linked to the customer’s Avalara exemptions where connected. A missing or expired certificate for the ship-to state stops the exemption and flags the order for review; Pier neither charges nor exempts silently. Marketplace orders whose marketplace collects and remits the tax record it as facilitator-collected. A provider timeout leaves the invoice pending rather than taxed at an invented rate. Nexus registration and filing remain with the accountant or tax provider.

**Acceptance evidence:** For each supported tax source, quote and invoice one taxable and one resale-exempt order to two US states, one that taxes freight and one that does not. Line and freight tax follow each state’s rule and the exempt order cites its certificate; expiring that certificate flags the next order. The authorized invoice’s tax equals the provider’s committed transaction and the QBO-posted invoice; a credit note adjusts the committed amount once; a provider timeout leaves the invoice pending with no invented tax.

### PRINT-001 — Printable and emailable business documents and templates.

Pier generates each business document from its live record: quote, sales order confirmation, proforma/prepay invoice, pick list, packing slip, invoice, credit note, customer statement, purchase order, supplier return authorization, transfer note and shipment/carton manifest. Each document has an owner-editable document template and email template, grouped by sales, purchasing and inventory. Templates carry the logo, company and remit-to details, terms and mail-merge fields, including customer/supplier item codes, case-pack and base-unit quantities, lot/serial, custom fields (CAT-001), tax and charge lines. Templates are versioned: a generated document records the template and record versions it rendered, and a reprint reproduces that document unless it is deliberately regenerated. Documents render to PDF and print at the pack station through browser printing or a configured network printer. Staff email them from the record through the owner’s authorized sending domain or Gmail/Microsoft 365 connection; the sent copy, recipients, time and delivery outcome stay on the record. A failed or bounced send stays visible and is never reported as sent.

**Acceptance evidence:** Generate each named document from a real order, PO, return and transfer, carrying the logo, terms, customer item codes and case-pack quantities. Edit the invoice template: the next invoice shows the change and an earlier invoice reprints unchanged. Print a packing slip at the pack step at 1440px and 390px. Email a quote and an invoice: the sent PDF, recipients and delivery outcome appear on each record, and a bounced send shows as failed.

### BUY-001 — Demand and lead-time replenishment.

Buyers configure location reorder points, safety stock, service levels, supplier lead times, MOQs and case packs. Scheduled planning combines real sales-channel sell-through, stockouts, backorders, seasonality, promotions, confirmed receipts and transfers to show dated shortages and explain recommended POs. Minimum/recommended/stretch and transfer alternatives show uncertainty and stockout-censored demand; review creates exact supplier-grouped PO drafts without changing on-hand stock.

**Acceptance evidence:** Plan a seasonal item with a stockout, MOQ, late receipt and cash ceiling from connected sales history. Compare quantity/date alternatives, create the selected PO and rerun after a new receipt; duplicate drafts and fictitious stock do not appear.

### BUY-002 — Purchase routing, supplier sends and acknowledgements.

Owners set approval limits by spend, supplier and exception type, with named approvers, delegation and escalation. Buyers approve an exact PO version and supplier recipient; Pier sends it as the PRINT-001 purchase-order document by email or as EDI, records acknowledgement and follows confirmation/ASN changes, partial supply and cancellations. A changed price, quantity, destination or promise invalidates approval. Automatic approvals are permitted only within explicit owner policy; agents cannot approve themselves or bypass spend limits.

**Acceptance evidence:** Route a threshold-crossing PO to the correct buyer, deny an agent’s approval, approve/send once and ingest a supplier price/date change. Re-approval is required and timeout/ambiguous send remains visible for reconciliation rather than blind duplicate sending.

### BUY-003 — Supplier returns and purchase credits.

Warehouse and purchasing staff create supplier return authorizations against receipts, quarantine rejected goods, dispatch approved returns and reconcile replacements or supplier credits. Quantities cannot exceed the received unreturned amount or remove stock committed elsewhere. Returning physical goods and correcting an erroneous receipt are distinct, linked actions.

**Acceptance evidence:** Partially reject a received PO, obtain authorization, dispatch the return and reconcile a supplier credit and replacement. A duplicate/excess return is refused; the original receipt, cost, remaining PO and physical-stock history survive.

### BUY-004 — Three-way matching and supplier performance.

Purchasing staff match POs, receipts, supplier invoices and bills of lading by item, unit, quantity, price, freight and tax. Tolerances route discrepancies for approval before accounting posting. Scorecards use actual confirmed versus received dates, fill rate, defects and price changes, retaining exclusions and source documents rather than model-invented ratings.

**Acceptance evidence:** Attach an invoice/BOL with a wrong pack and freight line, compare against a partial receipt and PO, resolve the discrepancy and post only the approved bill. Scorecards reproduce supplier on-time/fill measures from the same receipts.

### COST-001 — USD valuation, landed cost and cost of goods.

US first buyers operate in USD with US dates/addresses, named IANA time zones and explicit sales-tax treatment. Configure FIFO or moving-average costing and a controlled opening/cutover policy; allocate freight, duty, insurance and other landed costs by reviewed value, quantity or weight. Receipts, late landed-cost bills, transfers, returns, write-offs and partial shipments produce traceable valuation layers, COGS and margin without rewriting original physical events. Foreign-currency purchases and SALES-006 foreign-currency sales retain source currency/rate and USD value. Adjustments and write-offs outside a count carry an owner-maintained reason code mapped to a GL account, need approval above an owner-set value and post their valuation once.

**Acceptance evidence:** Import USD openings, receive two cost layers, allocate freight/duty, partially ship and return units, then receive a late freight bill and write off damaged units with a reason code that posts to its mapped GL account. Reconcile FIFO and average-cost scenarios, inventory value, COGS and order margin to exact approved accounting postings; rounding and period-lock differences enter review.

### REPORT-001 — Operational reports and saved analysis.

Owners save, filter, schedule and export stock valuation, movement/lot history, warehouse availability, sales, purchasing, gross margin, inventory aging, dead stock, low stock, turnover and overdue-order reports. Reports distinguish on-hand, committed, inbound, transit and quarantine, expose freshness and drill through to source documents. Warehouse, customer, channel, variant and date filters use permission-scoped data. The reporting capacity disclosed before admission is the SCALE-001 envelope measured on PIER-SCALE-1, shown alongside any activity-based prices, with export available.

**Acceptance evidence:** For a wholesaler with two warehouses, backorders, aged stock, landed costs and returns, save a filtered report on mobile and desktop, schedule it, export details and reconcile totals to ledger/source documents. A restricted user cannot infer another warehouse’s figures.

### CHANNEL-001 — Connected channel orders and stock.

Pier connects [Stall](https://github.com/just-every/run-stall), Faire, Shopify, WooCommerce, BigCommerce, Amazon, eBay and Etsy for item/variant/kit mapping, orders, cancellations, refunds, fulfilment status and stock publication. External IDs link source records to Pier; webhook intake and scheduled reconciliation handle duplicates, out-of-order changes and missed events. Channel buffers and sales-location policies publish sellable availability after reservations, never raw physical stock. Unmapped SKUs, lag and oversell risk enter a visible queue with an owner and repair action. Faire wholesale orders are accepted or declined within Faire’s window, lines can be backordered with a ship date, shipments and tracking return to Faire, retailer cancellations release reservations, and Faire payouts reconcile net of commission to the SALES-006 invoice and the ledger. Per channel, owners choose manual fulfilment or automatic pick, pack and ship when the channel, a 3PL or another system reports the shipment; automatic fulfilment dispatches the reservations once, on that shipment evidence.

**Acceptance evidence:** For each named channel, authorize a connection, import an order, reserve the last units across concurrent channels, partially ship and cancel/refund the remainder. Duplicate/reordered webhooks and a missed event yield one business effect; disconnect/reconnect catches up and reconciles published availability. For Faire: connect, import and accept an order, backorder one line, publish availability net of reservations, ship and send tracking back, handle a retailer cancellation and reconcile the payout and commission. An auto-fulfil channel dispatches once on its shipment report.

### EDI-001 — Retail EDI trading partners.

Pier exchanges EDI 850 purchase orders, 855 acknowledgements, 856 ASNs and 810 invoices through SPS Commerce or Orderful, preserving partner/item identifiers, pack rules, requested dates, SSCC/carton labels, acknowledgements and errors. Partner mapping, certification and chargeback-relevant exceptions are visible. Rejected or amended orders require authorized resolution; transport receipt does not prove retailer acceptance.

**Acceptance evidence:** Onboard a retailer through each supported transport, process an 850, return an 855, split shipment/carton ASN 856 and reconcile an 810. Duplicate controls, invalid pack/SSCC and a rejected acknowledgement produce traceable partner exceptions without duplicate orders or invoices.

### SHIP-001 — US rates, labels, tracking and notifications.

Warehouse staff compare UPS, FedEx and USPS services through ShipStation and EasyPost, using actual pack dimensions/weight, destination and promised date. They purchase/print/void labels, pack partial shipments and obtain tracking with delivery exceptions and customer notifications. Provider fees, acknowledgements, label purchase and physical dispatch remain distinct. A failed or uncertain label request is reconciled by its provider identity before a second purchase; shipment updates feed channels and accounting.

**Acceptance evidence:** For ShipStation and EasyPost, rate the three named carriers, buy/print a label, lose its response, recover the same label, void it and split-ship an order. Tracking/delivery exceptions notify the customer once and reconcile channel fulfilment; actual dispatch consumes reservations once.

### ACCOUNT-001 — Two-way QuickBooks Online reconciliation.

Connect QuickBooks Online using revocable least-privilege authorization. Map items, customers/vendors, tax/exemption codes, accounts and opening balances; exchange sales orders where supported, the SALES-006 invoices and credit notes Pier authorizes with their TAX-001 tax lines, purchase documents, bills, payments, COGS and inventory value with explicit supported-object mappings. Pier owns operational quantity and approved valuation; the ledger owns posted financial records and period locks. Two-way edits, rounding, deleted objects and closed periods create a visible reconciliation queue rather than silent overwrites or double posting.

**Acceptance evidence:** Connect a US QBO company, map a USD cutover and run purchase-to-receipt-to-bill plus quote-to-shipment-to-invoice/payment/credit. Compare inventory and COGS, then change a mapped object in QBO, close a period, expire authorization and replay events. Each difference is either reconciled or visibly assigned, with one posting per document.

### ACCOUNT-002 — Two-way Xero reconciliation.

Xero is a supported alternative ledger, with its own item/contact, invoice/credit, purchase/bill/payment, tax, account, inventory-value and COGS mappings. Unsupported ledger-native document types retain a linked Pier source and an explicit mapping rather than disappearing. Connection health, conflict policy, period locks, reconciliation and revocation meet ACCOUNT-001; switching ledgers requires a reviewed cutoff and cannot post old history twice.

**Acceptance evidence:** Connect a US Xero organization, run the same partial purchase, shipment, return and credit journey, reconcile inventory/COGS and exercise an edited contact, locked period and revoked token. A reviewed ledger switch exposes unmatched balances before enabling new posting.

### PAY-001 — Provider-backed customer payments.

Customers pay invoices through Square and a supported Stripe card/ACH connection; staff see authorized, settled, failed, refunded and disputed states and reconcile fees, deposits and partial payments to the ledger. Paid invoices are SALES-006 invoices whose tax comes from the TAX-001 source of truth. Pier retains provider references and financial status, never raw card or bank credentials; refunds require current authorized approval.

**Acceptance evidence:** Take a partial card payment and ACH payment, observe settlement/failure, refund part of a dispatch-linked return and replay provider events. Customer balance, provider settlement/fees, tax and ledger reconcile exactly; denied refunds and revoked connections have no financial effect.

### SYNC-001 — Visible integration health and safe recovery.

Every connector shows connection scope, last successful sync, lag, cursor, document mapping and pending/failed/uncertain effects. Authenticated signed events, durable external identities and reconciliation prevent duplicate stock, spend, labels or accounting postings. Bounded retries are allowed only when the effect is known safe; uncertain consequential sends wait for provider reconciliation or a human decision. Revocation stops future work, stale events cannot overwrite newer versions and operators can inspect/replay a resolved item with an audit trail.

**Acceptance evidence:** At the public integration door, send a bad signature, duplicate and stale event; interrupt after provider acceptance but before local receipt; revoke the connector and restart. The queue retains truthful state and reconciliation recovers one effect without leaking secrets or executing after revocation.

### THIRDPL-001 — 3PL fulfilment and daily stock reconciliation.

Connect ShipHero and Extensiv 3PL for warehouse item mapping, fulfilment requests, acknowledgements, shipment/return updates and daily stock snapshots. Distinguish provider-held, reserved, damaged, transit and available quantities. Variances become assigned cases linked to both histories; provider snapshots do not overwrite the stock ledger. Reviewed physical adjustments and channel corrections close only after subsequent snapshots and ledger sync reconcile.

**Acceptance evidence:** Send an order to each supported 3PL, receive partial tracking and a mismatched daily stock snapshot, investigate and approve a correction, then compare the next snapshot and channel/ledger totals. Duplicate and delayed updates never create stock or close an unresolved difference.

### API-001 — Documented authenticated stock commands.

Custom clients use a documented authenticated HTTP API for stock definitions, orders, purchasing, warehouse operations, proposal preparation and exports. The same current-role, exact-version, decimal and durable-command rules apply as in the UI; a custom client cannot bypass approvals by calling a lower-level command.

**Acceptance evidence:** Use API.md to authenticate, read state, create and reserve an order, repeat the command and attempt a stale/unauthorized mutation. Responses expose the durable result and public errors without duplicate business effects.

### API-002 — Webhooks and Zapier automation.

Owners subscribe permission-scoped signed webhooks and Zapier triggers/actions for stock, orders, shipments, PO exceptions and reconciliation outcomes. Versioned payloads retain event identity and source links; secrets rotate and connections revoke. Owners preview actions and choose allowed fields, destinations and spend/stock permissions. Delivery failures remain inspectable; a Zap cannot self-approve a purchase or impersonate a physical receipt.

**Acceptance evidence:** Create a Zapier low-stock workflow and signed order webhook, rotate the secret, duplicate an action and revoke the subscriber. One authorized draft is created, failures remain visible and a revoked or over-scoped action is refused.

### AUTO-001 — Follow exceptions until their work closes.

Scheduled low-stock, reorder, overdue PO, unconfirmed supplier, late customer order, tracking, count and integration checks create assigned exceptions with due dates, next actions and escalation. Email, Slack and WhatsApp notifications use owner-approved destinations, message content and quiet hours; scheduled reports and reminders deduplicate and stop on resolution. A report or provider acknowledgement alone does not close an exception: closure links the approved promise, actual receipt/shipment and reconciled ledger, or an authorized documented cancellation.

**Acceptance evidence:** Allow a PO confirmation and customer delivery to become overdue, deliver notifications through each named service, escalate an unanswered task and resolve the supply/shipment/ledger mismatch. Recurring checks neither spam nor hide unresolved work; closure and its evidence remain visible after restart.

### AUTO-002 — Controlled workflow rules.

Owners configure versioned rules for inventory checks, draft POs, allocation/routing, approvals, reminders and reports, with dry-run previews, budgets, warehouse scope, pause and kill controls. Automatic approval applies only to explicitly authorized bounded policies with separation of duties; policy changes cannot legitimize an already stale document. Each background job has durable pending/running/failed/uncertain/resolved outcomes, and exhaustion or worker loss escalates visibly.

**Acceptance evidence:** Preview a rule, enable a bounded replenishment policy, cross its budget/vendor limit, lose a worker and pause the rule. Within-policy work follows its authorized path once; excess/stale work waits for a human and no background failure disappears.

### DOC-001 — Evidence documents and order extraction.

Authorized staff attach supplier/customer PDFs, images, invoices, BOLs and correspondence to records; preserve originals, hashes, access and retention. Email/PDF extraction maps customer and supplier item codes, quantities, packs, dates and prices into a reviewable draft with source-page citations and ambiguity flags. Uploaded content is untrusted data and never instruction authority; no extracted order, payment or stock write commits without the required review.

**Acceptance evidence:** Upload and email a multi-page order containing ambiguous packs and hostile instructions, review cited extraction and approve the corrected draft. Duplicate documents are identified, unauthorized download and unsafe upload are refused, and no financial/stock effect occurs before approval.

### MIGRATE-001 — Switch from the named inventory systems.

Guided adapters import Cin7 Core, inFlow Inventory and Fishbowl Warehouse exports/API data, plus inventory/planning exports from Prediko and DOSS and the researched Katana inventory surface where a buyer uses it. Preserve source IDs and untouched artifacts; map variants, units, barcodes, warehouses/bins, parties, terms, prices, lots/serials, USD costs, opening stock/valuation, open sales/PO lines, exact allocations/backorders, expected dates, credits and relevant history. Every unsupported object/field is listed with a linked retained archive, never silently dropped. Manufacturing records are handed to Larder.

**Acceptance evidence:** For each named source, stage an authorized representative export, review row/field mappings and rejected/unmapped objects, and reconcile quantities by unit/bin/status, USD valuation and open documents against source totals and QBO/Xero. Freeze a cutoff, handle the final delta, approve once and replay without duplicate openings; keep the former system read-only until differences are accepted.

### ADMIN-001 — Role and warehouse permissions.

Owners invite, revoke and assign owner, purchasing, sales, warehouse, finance, viewer and scoped-agent authority, including warehouse/location, customer-sensitive pricing, cost visibility and approval limits. Current native session and current role/scope are checked on private reads, exports and every mutation at atomic admission. Role revocation takes effect on the next operation; invitations and restored audit identities do not confer active access.

**Acceptance evidence:** Invite staff for two warehouses, restrict cost visibility, attempt foreign warehouse reads/exports and stock writes, revoke a session/role while a command is prepared and retry. No forbidden data or partial stock/document/result write escapes admission.

### ADMIN-002 — SSO and strong authentication.

Organizations can require two-factor authentication and SSO through US-used identity providers such as Google Workspace and Microsoft Entra ID. Owners manage recovery, session/device revocation and deprovisioning without turning a provider outage into public access or granting imported identities authority. Service and agent credentials are separately scoped, rotated and revocable.

**Acceptance evidence:** Require 2FA, enroll staff, sign in through each supported SSO provider, deprovision a user and revoke a service credential. Existing and new private reads/writes fail after revocation; recovery requires an audited owner-controlled path.

### SEC-001 — Atomic stock authority and exact arithmetic.

Every consequential native write checks the active session, actor, current edition role and exact approved version within atomic SQL admission. Quantities and unit prices use decimal text within six fractional places and receipt totals retain twelve; invalid precision/range/conversion fails before mutation. Durable command identities recover identical requests and reject changed payload reuse. Operational movements are append-only and corrections link compensating entries. The narrowly scoped safe import undo in PIER-003 can remove its own unused import graph while retaining custody; no generic record edit or agent instruction bypasses admission.

**Acceptance evidence:** Through authenticated HTTP, reuse a command ID with changed content, submit invalid decimals, revoke a prepared actor and race a stale approval. Each refusal leaves no movement, reservation, document or successful command result; an identical retry returns its original outcome.

### SEC-002 — Private data, safe input and declared egress.

Private records, documents and exports require current authority; browser mutations enforce origin/session protections. Text stays literal, imports/attachments are bounded and validated, secrets stay server-side and encrypted under installation-local custody, and provider tokens never enter logs, exports or agent prompts. Owners explicitly authorize each external connection, field scope and model/document destination and can revoke it. Native stock work stays usable without a model, channel, author service or telemetry dependency.

**Acceptance evidence:** Run the native stock journey without external accounts, submit hostile text/CSV/attachments and cross-origin commands, inspect exported records/logs and deny unintended outbound requests. Then enable one connector/model under explicit scope and revoke it: only approved fields leave and secrets remain absent.

### DATA-001 — Complete portable archive and inactive restore.

Owners export all business definitions, movements, reservations, documents/cost layers, source originals, approvals, automation and integration histories, mappings, audit and erasure journal in a versioned integrity-checked archive. Empty-target transactional restore preserves historical identity but imports no active sessions, credentials, provider authority or pending external sends. Connectors/jobs restart paused until the receiving owner reauthorizes; no restored event replays a PO, label, refund or stock opening. CSV/native exit remains a separate reviewed cutover with explicitly listed omissions.

**Acceptance evidence:** Export a populated installation, corrupt a copy and attempt restore, then restore the valid archive into a fresh installation. Compare complete records/source bytes and history, establish fresh owner authority and reconnect deliberately; no outbound effect or duplicate opening occurs. Include new record classes as they ship.

### DATA-002 — Erasure, retention and legal holds.

Owners inspect retention and request deletion/anonymization of customer, supplier, operator and attachment data with dependency previews and legal/accounting holds. Erasure removes private originals, derived extraction, searchable copies, tokens and queued sends or explains a lawful retained minimum; permanent stock/accounting evidence is anonymized where required. Durable receipts record counts and completion without erased content. A later erasure journal fences older archives; offline copies and already delivered external messages are honestly reported as beyond local deletion.

**Acceptance evidence:** Request erasure of a customer with shipments, attachments and queued notifications, review holds, complete allowed deletion and inspect search, exports, audit and queued work. Restore an old archive with the later journal; erased private data must not reappear or trigger sends.

### AUDIT-001 — Durable human and automated accountability.

Authorized people trace every consequential decision, approval, destructive action and automated attempt/outcome to actor or rule, exact version, source evidence, command/provider identities and correction links. Audit is append-only, permission-scoped, exportable and separate from removable entity content; erased actors are anonymized without destroying stock provenance. Failed/uncertain external effects survive restart and cannot masquerade as success.

**Acceptance evidence:** Follow a changed purchase approval, failed label send, refund, count correction and erasure through Activity and export after restart. History retains who/what authorized each outcome and no deleted personal content or secret remains in the audit.

### UX-001 — Usable desktop and mobile operations.

All buyer journeys, reports, reviews and exceptions are usable at 1440px and 390px with realistic multi-warehouse data, keyboard access, labels, focus/error recovery and textual stock/status/freshness. Mobile staff can complete work, rather than merely view a desktop table. Network/provider failure preserves entered work and truthful pending/unknown states; busy actions prevent accidental duplicates. Search, saved filters, drill-through and pick lists meet the SCALE-001 bounds on the named PIER-SCALE-1 fixture, and the measured figures are recorded with this clause’s evidence.

**Acceptance evidence:** On PIER-SCALE-1, complete receive-to-ship, a stale approval, a return, an exception and report drill-through at both widths using keyboard and phone controls. Interrupt a request and refresh: the exact action is recoverable, errors persist and no color-only or invented stock state appears.

### SCALE-001 — Measured performance at wholesale volume.

Pier defines a named wholesale scale fixture, PIER-SCALE-1, built only through public commands and imports: 3 warehouses with 600 bins, 10,000 SKUs including 2,500 variants and 100 kits, 2,000 customers, 200 suppliers, 1,000 open sales orders with 6,000 open lines, 300 open POs with 1,500 lines, and 12 months of history holding 500,000 stock movements, 60,000 shipments and 50,000 invoices. On that fixture and the documented reference deployment, at the 95th percentile: SKU, barcode, alias and customer search returns in under 1 second; the first page of a filtered stock, sales or valuation report in under 3 seconds; drill-through from a report figure to its source documents in under 1 second; a 50-order pick list in under 2 seconds; and a scan-to-confirmation step in under 500 milliseconds. Full exports run as background jobs with visible progress. Pier sets no per-plan cap on orders, SKUs or users. The capacity disclosed in OPS-001 and REPORT-001 is the envelope measured on this fixture, republished when it changes. Work beyond the envelope is admitted with a stated slowdown and is never silently truncated.

**Acceptance evidence:** Generate PIER-SCALE-1 through public commands, then run search, three filtered reports with drill-through, a 50-order pick list, a scanned pick and a full movement export at 1440px and 390px. Record the fixture counts and measured p95 timings in the UX-001 evidence: each meets its stated bound, no result is truncated without notice, and the capacity shown in OPS-001 and REPORT-001 equals the figure measured on this fixture.

### OPS-001 — Owned operation, health and onboarding.

Installations start with empty real business state and use the published rer install/setup/dev/build/check/verify/export/import/reset/deploy command contract. Repeat setup preserves owner, business data and private settings. Health exposes actual dependency readiness, not invented balances; operators can diagnose provider failures, backup, restore and update with migrations intact. Onboarding names the next required connection/cutover action and unresolved differences, with documented recovery and support paths, bounded job/compute/storage limits, the SCALE-001 measured capacity and prices visible before commitment.

**Acceptance evidence:** Install and set up twice, enter real-shaped business data through public commands, restart, back up and restore; inspect health with a failed dependency and follow cutover/connector diagnostics. No demo stock, hidden reset, lost settings or false healthy state appears.

### BASE-001 — Keep Base guarantees and explicit replacements.

Pier retains inherited security, input safety, audit, portability, owner control and native operation guarantees. Its exact append-only stock model and domain commands replace a generic editable-record interface; agents use those same commands. Native CSV is not a replacement for complete archives. The current lack of arbitrary attachment uploads is a limitation until DOC-001 ships, not a permanent input-safety exemption. Any future Base replacement names the affected BASE clause, the narrower/equivalent behavior, acceptance evidence and dated owner decision; missing provider implementation does not create an exemption.

**Acceptance evidence:** Run the shared command/source checks and native stock/import/archive doors. Attempt a generic edit that would bypass stock admission and verify refusal. For each declared Base replacement, inspect its explicit mapping and run its named public-door proof; unimplemented guarantees remain partial.

## Push further: inventory agents that finish the job

Agents act on authorized real business evidence under explicit human control. Model output is never physical stock, financial settlement or a substitute for provider acknowledgement. Each action uses ordinary versioned commands, and execution stops visibly when required authority or evidence is missing.

### AGENT-001 — Evidence-backed preparation and human authority.

Agent access is a separately scoped role: it reads allowed sales, supplier, stock, count and import evidence and proposes replenishment, reallocation, count-drift or migration work with assumptions and exact input versions. Current humans approve each stock/purchase consequence through the same native commands. A model never creates on-hand stock, invents physical counts or self-approves; forecasts and proposals remain separate from actual inventory.

**Acceptance evidence:** As an agent, prepare each of the four proposal kinds and attempt stock writing, approval and stale-version application. Refusals leave business state unchanged; the appropriate buyer/operator/warehouse/owner can review evidence and execute only an exact current approved consequence.

### AGENT-002 — Optimize replenishment against cash and service.

The inventory agent forecasts from real channel sell-through, seasonality, promotions and stockout-censored demand, with uncertainty and backtesting. It combines MOQ/case packs, supplier reliability, confirmed receipts, actual margin and owner cash/service limits to compare executable PO/transfer options and draft the selected POs. An authorized buyer approves exact spend/terms and recipient before the agent sends through BUY-002. Policy/budget changes or new demand invalidate stale approval; the agent verifies arrival and accounting rather than stopping at draft creation.

**Acceptance evidence:** Provide connected sell-through with a censored stockout and unreliable supplier, compare a cash-constrained and service-maximizing plan, approve one PO/send and change a material input before a second. The second blocks; the first is followed through actual receipt, landed cost and reconciled ledger with forecast-versus-actual explanation.

### AGENT-003 — Close supplier confirmations and customer promises.

The agent reads approved POs, authorized Gmail/Microsoft 365 supplier correspondence, ASN/EDI events, actual receipt history and customer commitments. It chases missing confirmations, extracts changed dates/quantities with source citations, proposes reallocation/substitutes and re-promises affected orders, then follows receipts, shipments and financial reconciliation to closure. Buyers approve supplier sends, additional spend and changed customer promises; delegated message policies name recipient/content bounds and revoke immediately. An acknowledgement alone cannot close physical or ledger work.

**Acceptance evidence:** Leave a supplier confirmation overdue, authorize a chase, ingest a changed ASN and compare affected customer promises. Approve one change and decline another; only approved messages/actions occur. A partial late receipt keeps the case open until the remaining supply/customer outcome and ledger reconcile or a human authorizes cancellation.

### AGENT-004 — Repair channel oversell causes.

The agent correlates channel webhook/cursor history, mappings, reservations, 3PL snapshots and ledger differences to explain an oversell’s actual cause. It proposes connector repairs, substitutes, transfers and customer options, then carries approved corrections through channel, warehouse and accounting queues and verifies the next reconciliation. Operators approve cancellations, refunds, physical adjustments and promise changes; the agent cannot manufacture stock or treat an uncertain snapshot as a physical count.

**Acceptance evidence:** Create a missed channel event and stale 3PL snapshot that overstates availability. The agent cites the conflicting records, proposes repair and customer options and executes only approved changes. A denied refund is not sent; closure requires corrected channel availability, real fulfilment/count evidence and reconciled accounting.

### AGENT-005 — Prove cutover and reconciliation.

The agent maps incumbent exports and source artifacts to items, terms, opening stock/valuation and open documents, identifies duplicates and explains differences by unit, bin, source row and ledger account. It prepares a cutoff/delta plan and checks warehouse, customer/supplier and financial totals before and after cutover. Owners approve mappings, merges and unresolved balance treatments; source artifacts and corrections remain traceable and the agent cannot silently discard unsupported fields.

**Acceptance evidence:** Use a named-source cutover with a duplicate SKU, unit conflict, open backorder and accounting difference. Inspect source-cited proposed mappings and totals, reject a merge, approve corrected mappings and cut over once. Replay and final-delta reconciliation show no duplicate opening or unaccounted field/value.

### AGENT-006 — Live questions and reviewed bulk work.

People ask operational questions against permission-scoped live records: why stock is short, what is late, which orders lose margin and what changing supplier/date/allocation would do. Answers cite records, quantities, data freshness and uncertainty. Bulk proposals preview exact changed rows, cash/service impact and affected promises, enforce per-row authority and approval, and become ordinary commands; stale versions block the affected plan rather than improvising a fallback.

**Acceptance evidence:** Ask a restricted warehouse user why an order is short and propose bulk promise/PO changes. Answers cite allowed evidence without exposing forbidden costs; preview, edit and approve the plan, then mutate an input. The stale action refuses and the remaining authorized results retain ordinary command/audit links.

## Status by clause

Evidence paths are relative to this repository at the inspected commit. Existing test bodies support only their described native subset. Named target journeys in the clauses and acceptance record are still required for the remaining behavior.

| Clause | Status | Evidence path / remaining gap |
| --- | --- | --- |
| PIER-001 | done | `src/pier/catalogue.ts`; `tests/api/flows.test.mjs` (01); `tests/api/security-import.test.mjs`; `tests/browser/journey.spec.ts` |
| PIER-002 | done | `src/pier/catalogue.ts`; `src/pier/purchasing.ts`; `tests/api/flows.test.mjs` (02, 05) |
| PIER-003 | done | `src/pier/imports.ts`; `src/pier/native-export.ts`; `tests/api/security-import.test.mjs`; `tests/api/native-exit.test.mjs` |
| PIER-004 | done | `src/pier/orders.ts`; `tests/api/flows.test.mjs` (04) |
| PIER-005 | done | `src/pier/purchasing.ts`; `src/pier/proposals.ts`; `tests/api/flows.test.mjs` (05) |
| PIER-006 | done | `src/pier/purchasing.ts`; `tests/api/flows.test.mjs` (06) |
| PIER-007 | done | `src/pier/purchasing.ts`; `src/pier/warehouse.ts`; `tests/api/flows.test.mjs` (07) |
| PIER-008 | done | `src/pier/warehouse.ts`; `tests/api/flows.test.mjs` (08) |
| PIER-009 | done | `src/pier/orders.ts`; `tests/api/flows.test.mjs` (09); `tests/browser/journey.spec.ts` |
| PIER-010 | done | `src/pier/orders.ts`; `tests/api/flows.test.mjs` (10) |
| PIER-011 | done | `src/pier/warehouse.ts`; `tests/api/flows.test.mjs` (11) |
| PIER-012 | done | `src/pier/api.ts`; `src/pier/native-export.ts`; `tests/api/flows.test.mjs` (12); `tests/portable.mjs` |
| CAT-001 | partial | `src/pier/catalogue.ts`; `tests/api/flows.test.mjs` (01, 02): SKU, barcode and exact units only; variants, dimensions and customer aliases absent |
| KIT-001 | missing | No kit definition, component reservation, kit availability or kitting task exists; `src/pier/orders.ts` reserves single SKUs only. |
| TRACE-001 | missing | No lot/serial/expiry model or journey exists at the inspected commit. |
| SCAN-001 | partial | `src/pier/catalogue.ts`: stored unique barcodes; generation, printer adapters and scan flows absent |
| WMS-001 | partial | `src/ui/purchasing.tsx`; `src/ui/sales.tsx`; `src/ui/warehouse.tsx`; `tests/browser/journey.spec.ts`: responsive manual workflows, no scan/task pipeline |
| WMS-002 | missing | No directed put-away, replenishment task or slotting planner exists. |
| SALES-001 | missing | No quotes, price lists or volume-discount model exists. |
| SALES-002 | partial | `src/pier/catalogue.ts`; `src/pier/orders.ts`; `tests/api/flows.test.mjs` (10): customer-linked orders/physical returns only; credit and balances absent |
| SALES-003 | partial | `src/pier/orders.ts`; `src/pier/proposals.ts`; `tests/api/flows.test.mjs` (04, 09): bin allocation/backorders and reviewed reallocation only |
| SALES-004 | missing | No recurring-order or dropship workflow exists. |
| SALES-005 | missing | No Stall/private-portal adapter or cart follow-up exists; the inventory’s portal capability is fulfilled through the sibling boundary. |
| SALES-006 | missing | No invoice, charge-line, payment-term or credit-note model exists; `src/pier/orders.ts` records shipment references only. |
| TAX-001 | missing | No tax calculation, provider adapter or exemption-certificate record exists. |
| PRINT-001 | missing | No document generation, template, print or email-send path exists. |
| BUY-001 | partial | `src/pier/proposals.ts`; `src/pier/catalogue.ts`; `tests/api/flows.test.mjs` (05): observed shortages, MOQ/lead-time terms and PO drafts; no scheduled forecast/reorder policy |
| BUY-002 | partial | `src/pier/purchasing.ts`; `src/pier/api.ts`; `tests/api/flows.test.mjs` (05): exact human approval only; routing, outbound sends and supplier acknowledgement absent |
| BUY-003 | partial | `src/pier/purchasing.ts`; `tests/api/flows.test.mjs` (06, 07): partial receipts and corrections, no supplier-return documents |
| BUY-004 | partial | `src/pier/purchasing.ts`: PO-linked receipt/cost records only; invoice/BOL matching and scorecards absent |
| COST-001 | partial | `src/pier/model.ts`; `src/pier/purchasing.ts`; `src/pier/native-export.ts`: exact receipt costs only; current AUD defaults and lack of valuation/landed cost remain gaps |
| REPORT-001 | partial | `src/ui/activity.tsx`; `src/pier/native-export.ts`: position/document/cost views and export only; valuation and saved/scheduled reports absent |
| CHANNEL-001 | missing | No Stall, Faire, Shopify, WooCommerce, BigCommerce, Amazon, eBay or Etsy connector exists. |
| EDI-001 | missing | No retail EDI documents, mapping or transport adapter exists. |
| SHIP-001 | partial | `src/pier/orders.ts`; `tests/api/flows.test.mjs` (09): shipment references and partial dispatch only; no shipping adapters, labels or notifications |
| ACCOUNT-001 | missing | No QuickBooks Online adapter or financial reconciliation queue exists. |
| ACCOUNT-002 | missing | No Xero adapter exists. |
| PAY-001 | missing | No Square, Stripe payments/ACH or tax adapter exists. |
| SYNC-001 | partial | `src/pier/api.ts`; `src/pier/storage.ts`; `tests/api/flows.test.mjs` (04, 06, 09): durable native command recovery only; provider event/reconciliation machinery absent |
| THIRDPL-001 | missing | No ShipHero or Extensiv adapter exists. |
| API-001 | done | `API.md`; `src/pier/api.ts`; `tests/api/flows.test.mjs`; `tests/api/security-import.test.mjs` |
| API-002 | missing | No outbound business webhook or Zapier connector exists. |
| AUTO-001 | missing | No scheduler, business alert delivery or assigned follow-up cases exist. |
| AUTO-002 | missing | No workflow-rule or durable scheduled-job engine exists. |
| DOC-001 | partial | `src/pier/imports.ts`; `tests/api/security-import.test.mjs`: native CSV originals/custody only; arbitrary attachments, mailbox intake and extraction absent |
| MIGRATE-001 | partial | `src/pier/imports.ts`; `tests/api/native-exit.test.mjs`; `tests/api/security-import.test.mjs`: reviewed native cutover only; none of the named source adapters is verified |
| ADMIN-001 | partial | `src/pier/catalogue.ts`; `src/pier/api.ts`; `src/pier/storage.ts`; `tests/api/security-import.test.mjs`: current global roles/native sessions; no location grants or fine-grained read scopes |
| ADMIN-002 | missing | Native email-link/local authentication exists, but no SSO or two-factor flow is implemented. |
| SEC-001 | done | `src/pier/model.ts`; `src/pier/storage.ts`; `src/pier/api.ts`; `tests/api/flows.test.mjs`; `tests/api/security-import.test.mjs` |
| SEC-002 | partial | `src/pier/api.ts`; `src/pier/imports.ts`; `src/auth.server.ts`; `tests/api/security-import.test.mjs`: native authority/input gates; future connector custody/egress not implemented |
| DATA-001 | partial | `scripts/installer/local.mjs`; `src/pier/native-export.ts`; `tests/portable.mjs`: current installation round-trip proven; future connector/job/valuation classes and inactive reauthorization not implemented |
| DATA-002 | missing | No complete product erasure/retention/hold workflow or archive-erasure fence exists. |
| AUDIT-001 | partial | `src/pier/model.ts`; `src/ui/activity.tsx`; `src/pier/api.ts`; `tests/api/flows.test.mjs` (12): movement/review/command provenance; comprehensive external and erasure audit absent |
| UX-001 | partial | `src/ui/`; `tests/browser/journey.spec.ts`: existing twelve journeys at 1440/390; new connected/scan/report paths absent |
| SCALE-001 | missing | No named scale fixture or performance measurement exists; `src/pier/native-capacity.ts` bounds native import size only. |
| OPS-001 | partial | `OPERATIONS.json`; `scripts/installer/local.mjs`; `tests/runtime.mjs`; `tests/portable.mjs`: local lifecycle/archive evidence; connected diagnostics and scale/onboarding targets incomplete |
| BASE-001 | partial | `SEED-COMMAND-CONTRACT.md`; `src/pier/storage.ts`; `scripts/installer/local.mjs`; `tests/api/security-import.test.mjs`; `tests/portable.mjs`: stock/lifecycle guarantees, not full inherited-baseline acceptance |
| AGENT-001 | done | `src/pier/proposals.ts`; `src/pier/api.ts`; `tests/api/flows.test.mjs` (05, 11, 12); `tests/api/security-import.test.mjs` |
| AGENT-002 | partial | `src/pier/proposals.ts`; `src/pier/purchasing.ts`: shortage context and reviewed drafts; forecast, optimization, sends and closure absent |
| AGENT-003 | partial | `src/pier/purchasing.ts`; `src/pier/proposals.ts`: PO/receipt evidence and reviewed reallocations; Gmail/Microsoft 365 intake, chase sends, ASN extraction and closure absent |
| AGENT-004 | partial | `src/pier/orders.ts`; `src/pier/proposals.ts`: reservation evidence and reviewed reallocation only; connector correlation/repair and ledger closure absent |
| AGENT-005 | partial | `src/pier/imports.ts`; `src/pier/native-export.ts`; `tests/api/native-exit.test.mjs`: reviewed native reconciliation; incumbent and accounting mapping/closure absent |
| AGENT-006 | partial | `src/pier/proposals.ts`: scoped context/proposals; no embedded live question or bulk-plan interface |

**63 clauses: 15 done, 27 partial, 21 missing.**
