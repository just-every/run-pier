# Pier target product contract

Pier is a connected inventory and order management system: know what can be promised, replenish in time, execute warehouse work accurately and carry every order through shipment and reconciled accounting. A buyer switching from **a supported source inventory system** must be able to run that whole job. Planning and automation extend beyond the inventory work represented by source planning systems, with actual operational closure rather than forecasts and alerts alone.

## Product target

| | |
| --- | --- |
| Category | Inventory and order management for wholesalers and distributors |
| Incumbents a buyer switches from | Cin7 Core, inFlow Inventory, Fishbowl Warehouse |
| Up-and-comers it must also beat | Supported inventory and planning systems |
| First buyer | The owner or operations manager of a small US finished-goods wholesaler or distributor, operating in USD and usually keeping QuickBooks Online, who must be able to run stock, orders, warehouse work, channels, shipping, replenishment and reconciled books in Pier |

The primary journey: an owner moves stock, parties and open orders in from the incumbent, the inventory agent reorders before an item runs out, receiving scans each carton against its purchase order, put-away and counts keep every bin right, orders from every channel reserve one shared count, the warehouse picks, packs and ships before the carrier cut-off, and each supplier bill is matched to its order and receipt and posted to the books.

## How to read this contract

- This follows the RER contract standard. This is the product we are building toward, not a description of everything available today; the named clauses are requirements, and their acceptance points are targets until the Status table records them done.
- Core is what a buyer switching from the named incumbents uses in the first week, plus the push-further agent work; the Agent surface and Later are reported on their own lines. Later is empty today.
- Done means every acceptance point passes through Pier's own doors in a recorded Verify run. `partial` states the implemented subset and names the gap; `missing` has no implementation of the promised behavior. Hosted, provider, security-baseline, device/printer, owner-export, accessibility and physical-stock acceptance each require their own evidence; their difficulty does not remove a target clause.
- Real-world proof Pier cannot produce in its own repository (physical devices, retailer certification, vendor identity tenants, a human screen-reader pass, a live receiving domain) is in the Field proof register; it never blocks done.
- ACCEPTANCE.md and docs/CLAIMS.md are generated from this file. Rulings are in RULINGS.md, history in CHANGELOG.md, and mechanism in docs/.

## Door rules

- **D-1.** Screens. A clause's browser journeys run at 1440 and 390 CSS pixels on realistic multi-warehouse records, and phone staff complete the work rather than merely viewing a desktop table.
- **D-2.** Physical truth. On-hand stock changes only through recorded physical movements: receipts, transfers, dispatches, returns, counts and their linked compensating corrections. Model output is never physical stock, financial settlement or a substitute for provider acknowledgment, and a forecast, proposal, report or provider snapshot never becomes a count.
- **D-3.** Separate outcomes and uncertain effects. Provider acceptance, partner acknowledgment, label purchase, physical dispatch, delivery and ledger posting are separate facts; a transport receipt, a report or a provider acknowledgment alone does not establish a later fact or close the physical or ledger work it reports on. A failed or uncertain external effect stays visible and is reconciled by its durable provider identity before any second attempt; it is never blindly resent.
- **D-4.** Provider edges. Acceptance journeys use Pier's own routes, documented API and import doors. Provider-edge fixtures are allowed only in tests, sit at the external network edge and follow the provider's official request, event and error schema, or use the provider's sandbox; they do not establish real account, carrier, printer or warehouse acceptance.

## Shared duties (Base)

| Base duty | Duty | Delta clauses | Base journey |
| --- | --- | --- | --- |
| BASE-ACCESS-001 | Sign-in | ADMIN-002 | not run |
| BASE-ACCESS-002 | Sessions | ADMIN-001, ADMIN-003 | not run |
| BASE-ACCESS-003 | Public endpoints | none | not run |
| BASE-ACCESS-004 | Server-side authorisation | SEC-001 | not run |
| BASE-INPUT-001 | Validation | SEC-001 | not run |
| BASE-INPUT-002 | HTML | SEC-002 | not run |
| BASE-INPUT-003 | Uploads | DOC-001 | not run |
| BASE-SECRET-001 | No leakage | SEC-002 | not run |
| BASE-SECRET-002 | Startup | none | not run |
| BASE-DATA-001 | Export and import | DATA-001 | not run |
| BASE-DATA-002 | Retention | DATA-002 | not run |
| BASE-DATA-003 | Erasure | DATA-002, CAT-003 | not run |
| BASE-DATA-004 | Outbound flows | SEC-002 | not run |
| BASE-DATA-005 | Independence | SEC-002, OPEN-001 | not run |
| BASE-DATA-006 | Erasure respects retention and legal hold | DATA-002 | not run |
| BASE-PUBLIC-001 | Privacy | none | not run |
| BASE-PUBLIC-002 | Origins | none | not run |
| BASE-PUBLIC-003 | Accessibility | UX-001 | not run |
| BASE-OPS-001 | Health | OPS-001 | not run |
| BASE-OPS-002 | Migrations | OPS-001 | not run |
| BASE-OPS-003 | Idempotency | SYNC-001 | not run |
| BASE-OPS-004 | Failure is visible | SYNC-001, AUTO-002 | not run |
| BASE-OPS-005 | Audit | AUDIT-001 | not run |
| BASE-ROLE-001 | Roles through every door | ADMIN-001 | not run |
| BASE-AUDIT-001 | Searchable, durable audit | AUDIT-001 | not run |
| BASE-BACKUP-001 | Independent backup, restore and rollback | OPS-001, DATA-001 | not run |
| BASE-SIGNIN-001 | Standards-based SSO and lifecycle | ADMIN-002 | not run |
| BASE-SIGNIN-002 | Native multi-factor authentication | ADMIN-003 | not run |
| BASE-INSTALL-001 | Free self-host and removal | OPS-001, OPEN-001 | not run |
| BASE-MAIL-001 | Truthful mail outcomes | PRINT-001 | not run |
| BASE-ACCESSIBILITY-001 | One accessibility bar | UX-001 | not run |
| BASE-DOCS-001 | On-site docs from one contract | none | not run |
| BASE-AGENT-001 | One MCP door per seed | SURFACE-001 | not run |
| BASE-AGENT-002 | The seed's jobs are tools | SURFACE-001 | not run |
| BASE-AGENT-003 | Records are resources | SURFACE-001 | not run |
| BASE-AGENT-004 | Business identity and short-lived tokens | ADMIN-002 | not run |
| BASE-AGENT-005 | An agent acts as a person in a role | AGENT-001 | not run |
| BASE-AGENT-006 | Every action declares its risk class | SURFACE-002, SURFACE-003, SURFACE-004, SURFACE-005, SURFACE-006 | not run |
| BASE-AGENT-007 | The company's policy decides | SURFACE-002, SURFACE-007 | not run |
| BASE-AGENT-008 | Truthful attribution | PIER-005, AGENT-001, SURFACE-003 | not run |
| BASE-AGENT-009 | Every agent action is audited | SURFACE-007 | not run |
| BASE-AGENT-010 | Agents can follow changes | SURFACE-001 | not run |
| BASE-AGENT-011 | Limits are policy, and Pause stops everything | SURFACE-007 | not run |
| BASE-AGENT-012 | Writes are idempotent and conflict-safe | SURFACE-001 | not run |
| BASE-AGENT-013 | Manifest, docs and the conformance journey | SURFACE-001, SURFACE-007 | not run |


## Published clauses

- `PIER-001`: *Tier:* Core
- `PIER-002`: *Tier:* Core
- `PIER-003`: *Tier:* Core
- `PIER-004`: *Tier:* Core
- `PIER-005`: *Tier:* Core · *Cites:* BASE-AGENT-008
- `PIER-006`: *Tier:* Core
- `PIER-007`: *Tier:* Core
- `PIER-008`: *Tier:* Core · *Register:* R-6
- `PIER-009`: *Tier:* Core
- `PIER-010`: *Tier:* Core · *Register:* R-6
- `PIER-011`: *Tier:* Core
- `PIER-012`: *Tier:* Core

### Existing twelve operator journeys

#### PIER-001 — Define stock

**Requirement.** An operator creates a SKU, unique barcode, base unit, exact pack conversion and warehouse/bin locations, with sellable and quarantine stock. Archiving a used SKU preserves its history. Once movements, counts, supplier terms, orders or purchase orders reference an item, its unit and pack conversion are immutable; a location’s bin/transit kind is immutable after movements or counts reference it.

**Acceptance.**
1. Journey 1: create fractional-pack stock and bin/transit locations through the UI and authenticated commands, reference them with counts and documents, then attempt unit/pack/kind edits and archive the item.
2. Edits fail atomically and archived history remains readable.

#### PIER-002 — Maintain counterparties and supplier terms

**Requirement.** Operators link suppliers and customers. Each supplier/item pair has one versioned terms record with supplier code, pack, price, minimum order and lead time. Purchase commitments and receipts retain their exact terms snapshot when the supplier later changes terms.

**Acceptance.**
1. Journey 2: create supplier terms, commit a PO, revise terms and read the original PO/receipt.
2. The commitment retains its original quantities, price and source version; duplicate-pair creation cannot bypass the versioned record.

#### PIER-003 — Review native opening inventory

**Requirement.** Owners stage native CSV items, locations, counterparties, opening positions and open documents; review mappings, originals and reconciliation; resolve ambiguous rows; and approve one cutover. Optional reservations preserve exact per-line and bin allocations, including explicit zero backorders. Without that file, the six-kind importer reserves available stock. Changed source rows require reviewed revision, and downstream dependencies constrain undo. Safe undo before downstream work restores exact before-images and removes only that import’s created graph and movements; retained immutable originals and import custody explain this narrow exception to append-only operational corrections. Native CSV openings, open documents and counterparty prices carry an ISO 4217 currency per file or row. USD is the default for a US install: a row with no currency is read as USD and the preview shows it as USD, and an unknown currency code is refused with the row named. A non-USD opening, for example an AUD or CAD supplier cost as the supported source inventory systems allow, keeps its source amount and currency and is valued in USD only through a conversion rate the owner reviews and the batch records, never a silent or guessed rate, consistent with COST-001.

**Acceptance.**
1. Journey 3: preview and freeze a native batch, commit once, repeat unchanged input, revise a changed opening and exercise safe versus dependency-blocked undo.
2. Import a wholly backordered and a bin-allocated line with reservations.csv; no duplicate opening or silent reallocation appears.
3. Import a USD native opening batch and read USD unit costs and valuation in COST-001’s ledger.
4. Import a mixed batch with AUD rows and review its USD conversion rate before commit; the committed batch records that rate beside the source amounts and currency.
5. A row with no currency on a US install is read as USD and shown so in the preview.
6. An unknown currency code is refused with the row named.

#### PIER-004 — Commit sales demand without overselling

**Requirement.** Sales staff enter customer order lines. Pier reserves sellable availability atomically and exposes shortages as backorders. It never creates stock, reserves the same unit twice or permits negative sellable stock. Quarantine, in-transit and expected receipts cannot satisfy a present-stock reservation.

**Acceptance.**
1. Journey 4: submit simultaneous orders for the last fractional units through authenticated HTTP and retry a lost response with the same command.
2. Total reservations never exceed on-hand sellable stock and unmet demand remains visible.

#### PIER-005 — Approve exact purchase commitments

**Requirement.** A buyer reviews shortages and expected receipts, drafts a supplier PO, approves its exact supplier, quantity, price and promise date, then commits it. Material changes invalidate approval. Ordered quantities remain expected until a real receipt posts. An agent may prepare the PO and its evidence; an agent's commit carries the money class, which the company's policy decides, and an agent never records a person's approval of its own purchase.

**Acceptance.**
1. Journey 5: prepare a PO as an agent, attempt approval with the agent's own credential, obtain the buyer's approval, change a material term and attempt commit.
2. Only a freshly approved version commits and it changes expected supply rather than on-hand stock.

#### PIER-006 — Receive partial purchases atomically

**Requirement.** Warehouse staff receive some or all of a committed purchase into named bins, recording supplier reference and exact receipt cost. The remainder stays expected. Invalid or over-received lines cannot partially post an otherwise valid multi-line receipt.

**Acceptance.**
1. Journey 6: partially receive a multi-line PO, repeat the command, then submit one invalid line.
2. The first receipt posts once, exact cost is retained, remaining expected quantities reconcile and the invalid receipt leaves every line unchanged.

#### PIER-007 — Correct receipts with physical evidence

**Requirement.** Warehouse staff can reverse a receipt only when later work does not depend on it. With downstream movements, they capture and approve a physical count for a receipt bin; the receipt correction posts a linked compensating adjustment at that frontier. Originals remain and a stale count cannot overwrite later movement.

**Acceptance.**
1. Journey 7: reverse an unused receipt, attempt reversal after stock is reserved or dispatched, then correct against an approved physical count.
2. Intervening movement invalidates the old count; successful correction retains the original and its compensating link.

#### PIER-008 — Transfer through visible transit

**Requirement.** Warehouse staff dispatch available units through a real transit location and separately confirm destination receipt. Transit stock is unavailable to sales and transfers conserve quantity. Repeated commands cannot dispatch or receive twice.

**Acceptance.**
1. Journey 8: dispatch a transfer, try to sell its in-transit units, partially receive at the destination and retry.
2. Source plus transit plus destination reconciles throughout and transit cannot be promised as current sellable stock.

#### PIER-009 — Dispatch only owned reservations

**Requirement.** Warehouse staff partially dispatch an order against that order’s own reservations. Shipment identity links order lines and consumed reservations; undispatched demand remains outstanding. Another order’s allocation cannot be consumed and a retry never decrements stock twice.

**Acceptance.**
1. Journey 9: partially dispatch an order, attempt to use a foreign reservation and retry after response loss.
2. Read the shipment and remaining order: exact consumed allocations and outstanding demand reconcile.

#### PIER-010 — Cancel and inspect returns

**Requirement.** Staff cancel only unshipped demand and release only its remaining reservations. A return points to an actual dispatch line and cannot exceed dispatched units less prior returns. It enters quarantine and requires separately reviewed restock before becoming sellable.

**Acceptance.**
1. Journey 10: cancel the remainder of a partially shipped order, return shipped units, reject an excess return and review a partial restock.
2. Shipment history survives and quarantined units cannot be sold before restock.

#### PIER-011 — Count at a captured movement frontier

**Requirement.** Warehouse staff capture a movement frontier, record a physical count, inspect variance and approve an exact adjustment or recount. A movement after capture makes the review stale; a model estimate cannot replace a physical count.

**Acceptance.**
1. Journey 11: capture and count a bin, move stock, then attempt the old approval.
2. It fails without changing stock; a new captured count can produce the exact approved compensating movement.

#### PIER-012 — Investigate and leave with native data

**Requirement.** People trace balances to movements, source documents, actors, reasons, command identities and reversal/import provenance. They export business records and costs and restore the complete current installation archive into a fresh local installation without posting openings twice. Durable operator and approval identities are historical evidence rather than access grants; operation requires a fresh native session.

**Acceptance.**
1. Journey 12: investigate a corrected receipt and dispatch, export, restore into fresh local D1, compare business records and journal links, replay an unchanged import and execute a new authorized transaction after fresh sign-in.


## Target clauses

### Stock, catalog and traceability

#### STOCK-001 — Stock position across warehouses and bins

*Tier:* Core · *Rules:* D-1

**Requirement.** For every item, Pier shows its stock at each warehouse and bin: on hand (sellable), reserved, available (sellable less reservations), quarantine, in transit and expected (unreceived quantities on committed PO lines destined for that warehouse), with totals per warehouse and across the company. Expected supply from a committed PO with no destination warehouse (a legacy PO) appears in an explicit “Unassigned receiving warehouse” bucket: it counts in company-wide expected supply and is never attributed to any real warehouse until a destination is set. Protected channel holds (CHANNEL-001) reduce availability: Stock’s Reserved figure includes them, with an explicit explanation that it does, so warehouse and company totals reconcile with bin availability and held stock is never promiseable; the raw reservation and hold records stay separately exported. Figures are computed from the append-only movements, current reservations, protected holds and open PO lines, never stored as editable balances, so each bin’s figure equals the sum of its movements (PIER-012). For TRACE-001 stock, expired or blocked identities are also excluded from availability; their physical status and raw movement/reservation history remain, and the bin view names the excluded quantity. Warehouse and company availability sum those eligible bin figures. Staff search by SKU, barcode or name and filter by warehouse, bin and status on desktop and at 390px; an item with no positions says so rather than showing invented zeros per bin.

**Acceptance.**
1. Through public commands, define one item at two warehouses with two bins each, receive a partial PO into a bin at each, reserve an order, transfer units through transit, return units to quarantine and commit a second PO to the second warehouse.
2. The Stock view and the state API show, per warehouse and bin, on hand, reserved, available, quarantine, transit and expected, each equal to an independent sum of the exported movements, reservations and open PO lines by destination; the warehouse and company totals add up; filters by warehouse, bin and status and search by SKU and barcode return exactly the matching rows at 1440px and 390px.
3. Place a protected channel hold on a bin: Reserved includes the held units with its explanation, available falls by them, an order cannot reserve them, the warehouse and company totals still equal the bin sums, and the export lists the reservation and hold records separately.
4. A committed legacy PO with no destination warehouse shows its unreceived quantity in the Unassigned receiving warehouse bucket and in company-wide expected supply, and in no real warehouse’s expected figure.

#### CAT-001 — Wholesale catalog, units and barcodes

*Tier:* Core

**Requirement.** The catalog adds variant families, categories, supplier and customer item references, images, weights and dimensions, case-pack ordering and exact conversions to the stock definitions above. Bulk import and edit previews collisions and affected documents; used-unit invariants remain. Each SKU holds several barcodes (its own code, the manufacturer’s unit UPC and EAN, inner and case GTIN-14 and ITF-14 codes, and supplier- or customer-specific codes), each bound to a unit of measure or pack quantity in base units; uniqueness is enforced across every barcode of every SKU and every bin, lot and SSCC code, so a scan resolves to exactly one SKU and quantity (SCAN-002). Operator-entered shipment and bill-of-lading references are aliases, not globally unique codes, because a consolidated pickup shares one BOL across orders: a reference may not collide with an item, bin or SSCC code, but several shipments may share one, and a returns lookup by a shared reference returns every shipment carrying it and asks the operator to choose. A dispatch refused for its reservations reports that error before any reference collision, and every refusal is atomic. Each new native shipment receives a dedicated unique Pier-allocated barcode, distinct from shared operator references; earlier shipments retain their original identities. Search and filters work across SKU, every barcode, aliases and archived history without hiding duplicate matches.

**Acceptance.**
1. Import variants with supplier/customer aliases, dimensions and fractional packs through catalog import; preview a bulk change, give one SKU a unit UPC and a 12-unit case barcode, reject the same UPC on a second SKU (both owners named) and search by each alias and barcode.
2. Dispatch two orders with one shared BOL reference: both dispatches post, a returns lookup by that reference returns both shipments for the operator to choose, and an item barcode equal to it is refused.
3. A case-pack quote, pick and label retain the same base-unit quantity.

#### CAT-002 — Typed custom fields

*Tier:* Core · *From:* CAT-001

**Requirement.** Owners define typed custom fields on items, customers, suppliers and orders; those fields appear in filters, imports, exports and PRINT-001 documents.

**Acceptance.**
1. Add a custom field to items and orders, filter by it, print it on a packing slip and find it in export.
2. Through public authenticated doors, the current owner defines, edits, imports, filters and exports exact typed values for items, customers, suppliers and orders and generates and retrieves field-bearing documents.

#### CAT-003 — Owner-only custody of typed-field content

*Tier:* Core · *From:* CAT-001 · *Cites:* BASE-DATA-003 · *Rules:* D-1

**Requirement.** Only the current owner may define, read, create, change, filter, import or export arbitrary custom-field content on items, customers, suppliers and orders, and only the current owner may generate, retrieve, download, reprint or export documents containing that content or retrieve retained native originals containing it. Current authority applies to direct requests, private projections, retained documents and recovered command results; non-owner responses omit protected content and retained originals. Owner authority alone does not authorize external disclosure: existing destination, field-scope, document and model consent requirements still apply. Arbitrary field content may contain personal data. Pier retains field content, field-bearing documents and native originals under governed custody; it performs no automatic deletion and makes no complete subject-erasure claim for unsupported attribution or dependencies. An unsupported erasure request refuses visibly, identifies the blocking custody classes and the owner setup it needs without echoing field values, and records refusal rather than completion. Safe cutover undo retains its existing dependency checks and may remove only the eligible imported live graph. Removing live custom-field definitions or values does not remove retained originals, import custody, historical field-bearing documents or their owner-only restrictions, and does not bypass unsupported-erasure refusal. Custody detection must not depend solely on live definitions. Restore preserves applicable definitions, values, documents, originals, custody restrictions and erasure journal, including custody surviving undo; it retains the existing older-archive fence, requires fresh owner authority and restores no active external authority or pending sends. For typed-field operations, audit records actor, current authority, time, operation, opaque record and field identifiers, relevant versions, command and source-custody identities, counts, outcome and refusal reason. It never records arbitrary field values, before or after field content, or field-bearing document and original bodies. This is the typed-field qualification to AUDIT-001’s general record-edit images; protected business content remains separately governed. The custody rule is RULINGS.md RL-1.

**Acceptance.**
1. Non-owner direct reads, filters, imports, writes, exports, original downloads, retained document retrieval, reprints and recovered-result requests disclose no protected content; revocation takes effect on the next operation.
2. Unsupported subject erasure visibly names the missing subject-attribution and governed-erasure setup, records refusal and deletes no content.
3. Exercise the same refusal after safe cutover undo removes all imported live definitions while retained originals remain, after restart and after a valid archive restore.
4. Verify retained custody independently of live definitions, exact archive preservation, fresh owner authority, paused external authority and older-archive refusal with the later journal.
5. Inspect Activity and exported audit for durable operation and refusal metadata and absence of field values.
6. Every changed field-control, document, original-custody, erasure-refusal or Activity screen is exercised at 1440px and 390px, including owner success, denied access, errors and recovery.

#### KIT-001 — Kits and bundles from stocked components

*Tier:* Core

**Requirement.** Owners define a kit SKU from stocked component SKUs with exact per-kit quantities and units, as Cin7 Core assembly kits and inFlow bundles do. A kit has its own price, barcode, documents and channel mapping but no independent physical stock unless pre-assembled. Selling a kit on a quote, sales order or channel order reserves every component atomically at one warehouse; a shortage of any component backorders or blocks the whole kit under the configured policy and never reserves a partial set. Published kit availability is the lowest whole-kit count buildable from each component’s sellable availability net of reservations and channel buffers, recalculated whenever a component moves. Pick lists and packing slips show the kit line with its component picks and bins; dispatch consumes each component reservation once; COGS is the sum of the component cost layers actually consumed, and margin is reported per kit. Owners may pre-assemble kits through a reviewed kitting task that consumes components and receives the kit SKU at a rolled-up cost, and disassemble them the same way. Kit returns are inspected per component. Kit definitions are versioned and an order keeps the version it reserved. Kitting changes no material, so it is inventory work in Pier, not Larder manufacturing.

**Acceptance.**
1. Define a two-component case-assortment kit and a three-component display kit from stocked SKUs.
2. Sell the first on a sales order and through a connected channel concurrently: component reservations, published kit availability (the lowest buildable count across components), the pick list and COGS agree.
3. Drain one component: kit availability drops to zero and a further kit order backorders as a whole kit.
4. Pre-assemble five display kits, ship two, return one and inspect its components: rolled-up kit cost, component stock and kit margin reconcile, and no component is reserved twice.

#### TRACE-001 — Serial, lot and expiry traceability

*Tier:* Core

**Requirement.** Receiving, bin moves, allocations, picking, dispatch and returns retain serial/lot identity and expiry. Lot, serial and expiry can be entered by hand or filled from a scanned GS1 barcode (SCAN-002). Operators can quarantine a lot, choose FIFO/FEFO within approved policy and trace suppliers to affected customers and back. Duplicate serials, expired picks and wrong-lot scans are blocked or require an authorized recorded exception. Ordinary traceability does not certify regulated release or recall compliance. KIT-001 and WMS-002 use those same identities for their existing kitting and movement tasks; later SCAN-001/002 device and label work and COUNT-001 tracked counts inherit the identity history when they ship.

**Acceptance.**
1. Receive two dated lots and serialized units through warehouse screens, transfer and split-dispatch them, quarantine one lot and return a serial.
2. Trace the exact customers and receipts; a duplicate serial and expired/blocked lot cannot silently ship.
3. For the current tracked-stock doors, the owner approves FIFO or FEFO, with expiry valid through its UTC calendar day.
4. FIFO uses first receipt time and retained arrival order within that receipt; FEFO orders by expiry, with undated identities last, then FIFO.
5. Serial identities and allocated trace codes share the stock-code namespace; supplier lot references are exact per-SKU metadata.
6. Quarantine follows retained component parents into assembled kits.


### Warehouse floor, barcodes and counts

#### SCAN-001 — Generate, scan and print warehouse barcodes

*Tier:* Core · *Register:* R-1

**Requirement.** Operators generate and validate item, bin, lot and shipment barcodes and print appropriate labels on Zebra and DYMO printers. USB/Bluetooth scanners, Zebra TC-series and comparable rugged Android handhelds whose built-in scanner works as a keyboard wedge, and iOS/Android cameras work through the warehouse workflow. Pier reads UPC-A, UPC-E, EAN-13, EAN-8, Code 128, GS1-128 (including SSCC (00) and GTIN-14 (01) with lot (10), expiry (17), production date (11), serial (21) and count (30/37) application identifiers), ITF-14, Code 39, QR Code and Data Matrix including GS1 DataMatrix. Pier prints Code 128 and GS1-128 (item, bin, lot and SSCC carton labels), QR Code (bin and task labels), UPC-A/EAN-13 for owner-assigned GTINs and ITF-14 case labels, on Zebra ZPL labels of 4×6 in (shipping and SSCC), 2×1 in and 2.25×1.25 in (item and bin), DYMO 30252 and 30334 labels, and Letter label sheets (Avery 5160 layout) through browser printing. Unknown or ambiguous scans ask for resolution; print failure never marks physical work complete. Supplier and case barcodes in receiving, picking and packing follow SCAN-002. Reprinting a carton or pallet label reproduces the same SSCC and contents rather than issuing a new serial, records who reprinted it and why on the shipment, and a reprint after the EDI-001 856 was sent changes no ASN data. The physical device and printer matrix is register row R-1.

**Acceptance.**
1. Print an item and bin label, enter its code through keyboard-wedge scan input and a phone-camera decode, and complete a receive-to-pick handoff.
2. Scan a reference sheet carrying every named read symbology: each resolves to its encoded value (GS1 application identifiers parsed into fields).
3. Produce every named label size and symbology and decode the produced result back.
4. Duplicate/unknown scans, a disconnected printer and a mismatched label produce actionable errors without stock effects.
5. Reprint the GS1-128 label of carton 7 of a shipment whose 856 was sent: the reprint carries the same SSCC, scans back to the same carton contents and appears on the shipment record with its reason, and the sent 856 is unchanged.

#### SCAN-002 — Supplier unit, case and GS1 barcodes in warehouse work

*Tier:* Core · *Register:* R-1

**Requirement.** Receivers, pickers and packers scan whatever barcode is on the goods: Pier’s own labels, the manufacturer’s UPC-A/EAN-13 on each unit, the GTIN-14/ITF-14 case code on the carton or a GS1-128 SSCC on a retail-ready carton or pallet. Each barcode resolves through CAT-001 to one SKU and the unit or pack quantity it is bound to, always converted to base units. On a PO receipt line a unit barcode receives one unit; a case barcode receives the case quantity, and the received and remaining quantities convert (one 4-unit case scanned on a 10-unit line receives 4 and leaves 6). A case that would over-receive the line asks for an authorized over-receipt or a partial-case count rather than posting. A GS1-128 or GS1 DataMatrix carrying lot (10), expiry (17), production date (11) or serial (21) fills those TRACE-001 fields on the receipt from the barcode, and an expired or blocked lot is refused under TRACE-001. An inbound SSCC linked to an EDI-001 856 ASN or a supplier advance notice receives every line on that carton or pallet in one confirmed scan; outbound cartons get their own SSCC labels for EDI-001. At pick, a unit scan counts one unit and a case scan counts the case quantity against the pick line’s base-unit quantity; a different SKU, wrong lot or unknown code is refused with no stock effect. At pack, scanning a case barcode when fewer units of that SKU were picked warns and does not post the pack until resolved. An authorized user can link an unknown supplier barcode to a SKU and pack quantity at the scan, with the link audited (AUDIT-001) and unique under CAT-001. Running the journey on a USB scanner, a Zebra TC-series handheld and a phone camera is register row R-1.

**Acceptance.**
1. Import a SKU with a UPC-A unit barcode, an ITF-14 4-unit case barcode and a supplier code.
2. On a 10-unit PO line, scan the case barcode once and the unit UPC twice: received shows 6 and remaining 4, in base units; a third case scan asks for over-receipt authority instead of posting.
3. Scan a GS1-128 carrying GTIN, lot and expiry: the receipt’s lot and expiry equal the barcode’s, and an expired-lot barcode is refused.
4. Receive a pallet by its SSCC against an 856 ASN in one confirmed scan.
5. At pick, a unit UPC scan counts one unit; at pack, scan the case barcode when two units were picked: a warning appears and nothing posts.
6. A supervisor links an unknown barcode to a SKU and pack quantity, the link appears in audit, and linking the same code to a second SKU is refused.

#### WMS-001 — Mobile receive, put away, pick, pack and count

*Tier:* Core · *Rules:* D-1

**Requirement.** Warehouse staff use desktop, handheld and 390px phone screens for scan-driven receiving, directed bin put-away, pick lists, pick verification, packing, transfers and cycle counts. Pickers work one order at a time, a multi-order batch (wave) picked in one bin-sequenced walk with sort-to-order into numbered totes or at the pack station, or zone picks in which each zone picks its part and the parts merge by order at pack. Every picked unit is attributed to its own order’s reservation, so a batch never consumes another order’s allocation, and a short pick in a batch leaves only the affected order short. Picks show source bin, unit, lot, kit components and shortages; the pack step prints the PRINT-001 packing slip and carton labels; separate picked, packed and shipped states prevent a scan or label purchase from pretending goods shipped. Interrupted work resumes its exact task and command. Network loss is visible; queued work reconciles before committing against current availability. SCAN-001/002 retain their physical device and label matrix, PRINT-001 its editable business templates, and SHIP-001 its live postage/provider-label obligations.

**Acceptance.**
1. On phone and desktop, receive and put away a partial PO, follow a pick list across bins, scan a wrong SKU, split a pack and shipment, print its packing slip at the pack step, transfer and cycle-count.
2. Batch-pick ten orders in one walk with one line short, sort them to totes and pack each: every order’s shipment consumes only its own reservations and only the short order stays open.
3. Zone-pick one order across two zones and merge it at pack.
4. Interrupt connectivity mid-task and resume; no stale allocation or double movement posts.
5. Current warehouse work retains bin zones on released wave lines and each order’s tote; closing its pack records the completed zone contributions.
6. Interrupted scan intent stays in the same tab and reconnecting sends no write automatically.
7. Explicit recovery first reloads current records, recovers an already-recorded command by its exact identity, and refuses an unrecorded intent if warehouse stock or task evidence changed.

#### WMS-004 — Wave release, line scans and short-bin redirection

*Tier:* Core · *From:* WMS-001

**Requirement.** A batch is a named wave assigned to a pack station or dock door, and its pick list shows the wave and dock. Each pick line confirms only after its bin and item are scanned (SCAN-002). When a picker reports a pick bin empty or short, Pier proposes the next bin in pick sequence holding sellable, unreserved stock of the same SKU (and lot where tracked); confirming it moves only that line’s reservation to the new bin atomically, directs the picker there and opens a PIER-011 count for the reported bin. No other order’s reservation is taken, and with no such bin the line is picked short.

**Acceptance.**
1. Release wave 14 to Dock A: the pick list shows the wave and dock, and each line confirms only after its bin and item scans.
2. Report bin B-03 empty on one line: Pier directs the picker to overflow bin B-09, moves only that line’s reservation, opens a count for B-03 and leaves every other order’s reservations unchanged.

#### WMS-005 — Returns bench one-scan restock and write-off

*Tier:* Core · *From:* WMS-001

**Requirement.** At the returns bench, scanning a returned unit or its return label opens its PIER-010 return line; an inspector the owner has authorized to approve restock records inspection, approval and restock to a scanned bin in one scan, or a write-off with a COST-001 reason code, while a scan by anyone else leaves the unit in quarantine awaiting the separate PIER-010 review. Existing owner/warehouse inspection authority controls one-scan restock and write-off; an operator’s intake stays quarantined.

**Acceptance.**
1. At the returns bench, an authorized inspector scans a returned sellable unit and a bin and the unit is on hand there after that one scan.
2. Scanning a damaged unit with a write-off reason posts the write-off to its mapped account.
3. The same scans by an unauthorized user leave the units in quarantine awaiting review.

#### WMS-002 — Directed replenishment and slotting

*Tier:* Core

**Requirement.** Location policies define capacity, pick faces, replenishment thresholds and permitted stock. Pier proposes put-away and reserve-to-pick replenishment, prioritizes tasks and explains ABC slotting recommendations using pick velocity, item size and travel data. Travel data is the walking distance between bins, taken from each location’s aisle, bay and pick-sequence coordinates, together with observed pick-task times. Supervisors approve location changes and physical staff confirm movement; recommendations never relocate inventory on their own. Unknown dimensions, an oversized item or excess occupied volume refuse placement atomically through receiving, transfer, count and import doors, and unconfigured bins keep their established behavior. Item dimensions, capacity and travel evidence remain inspectable, and recommendations alone change no policy or stock. Until a supervisor role exists, the owner approves policies and exact plans; warehouse staff confirm physical movement with source-bin, destination-bin and item scans, the exact approved base quantity and device. Changed bin/item definitions, revoked approval authority, unavailable reserved stock or a newly full destination refuse without partial effects. Every completed task retains its approval and confirmation in business export, preserves cost layers and cannot replay a movement. KIT-001 and TRACE-001 must extend permitted-stock, capacity and task identity for their new stock kinds before shipping. Units, priorities and ABC rules are in [the contract mechanism notes](docs/contract/mechanism.md#wms-002).

**Acceptance.**
1. Configure pick-face minimums and bin capacity, receive an oversized item and run a replenishment/ABC plan.
2. An operator completes the approved scan tasks; over-capacity placement is refused and slotting alone changes no stock.

#### WMS-003 — Daily dispatch board and carrier cut-offs

*Tier:* Core

**Requirement.** Each warehouse has a dispatch board for the working day in its time zone: the orders due to ship that day, each carrier’s actual pickup cut-off time and time zone, and counts and lists by state: to pick, picking, picked, packed, labeled and shipped (WMS-001 states; shipped only when PIER-009 dispatch posts). An order is due by its promise date, or by the earlier explicit carrier-service ship-by date a person reviewed and recorded when its pickup was assigned; that date is validated by the public carrier-assignment command and visible in the pickup assignment field. Pier never infers a ship-by date and never claims an earlier shipment than the recorded dates; rate and service planning stay with SHIP-001. Without pick, pack and label handling-time estimates, the board conservatively flags every unfinished due order before its pickup with its remaining-work reason (short, unpicked, unpacked or unlabeled), labels that conservative basis on the board, and clears the flag only when the order’s dispatch posts; it never invents a calculated cannot-make time. At day close the board records the number of orders and units shipped, the time the last one left and every due order that did not ship with its reason; the record is kept, exportable and feeds the REPORT-002 overdue-orders report.

**Acceptance.**
1. At one warehouse with a 4 pm carrier cut-off, create 20 orders due today and pick, pack, label and ship 18 through public commands, leaving one short and one unpicked.
2. One of the 20 has a later promise date and is due today only through the reviewed carrier-service ship-by date recorded with its pickup; an invalid ship-by date is refused by the carrier-assignment command.
3. The board shows the carrier’s 4 pm cut-off with its time zone and its counts equal the orders’ states throughout; before 4 pm every unfinished due order is flagged with its remaining-work reason under the labeled conservative basis, including the short and unpicked orders, and each flag clears only when that order’s dispatch posts.
4. The day-close record shows 18 orders shipped, the last shipment’s time and the two missed orders with reasons, each equal to an independent count of the day’s dispatches.

#### COUNT-001 — Full-warehouse stocktake

*Tier:* Core

**Requirement.** Owners start a wall-to-wall stocktake of a whole location or chosen zones, as accountants require at year-end. Pier captures one movement frontier for every bin in scope as the stocktake snapshot. The owner either freezes the scope, so receipts, picks, transfers and adjustments there are refused with a visible notice while work elsewhere continues, or keeps it live, with each bin checked against its frontier as in PIER-011. Count tasks are assigned by zone on desktop, handheld and phone (WMS-001, SCAN-002); blind counting hides expected quantities, and lots and serials are counted per TRACE-001. Before approval the owner chooses, per zone, what happens to SKU-bin positions nobody counted: leave them unchanged or set them to zero; the preview shows every affected position and its value impact. Variances above owner-set quantity or value thresholds require a recount. Approval posts one set of compensating adjustments at the captured frontier, with reason codes mapped to GL accounts (COST-001) and valuation posted to the ledger once, then lifts the freeze. The completed stocktake is a retained, exportable record of counted, uncounted, variance and value figures. DATA-001 and AUDIT-001 inherit these retained stocktake records and commands.

**Acceptance.**
1. Start a frozen stocktake of one 20-bin warehouse: a pick there is refused with the freeze notice and a pick in the other warehouse succeeds.
2. Blind-count 18 bins by scan and leave 2 uncounted; choose “zero uncounted” for one zone and “leave unchanged” for the other; recount a variance above threshold; approve.
3. Adjustments equal counted minus frontier quantities, uncounted positions follow each zone’s rule, the valuation change posts to QBO once, the freeze lifts and the stocktake record reproduces every figure.
4. Repeat without freezing: a bin that moves after capture becomes stale and must be recounted before approval.
5. Stocktake thresholds compare absolute base-unit variance and absolute retained USD cost-layer impact; equality is within threshold.
6. Above-threshold or unknown-value adjustments require two matching physical submissions at the current frontier.
7. A live recount captures a new frontier and keeps earlier attempts; it never reuses a stale observation.


### Sales, routing, tax and documents

#### SALES-001 — Quote, price and convert orders

*Tier:* Core

**Requirement.** Sales staff create versioned quotes, apply customer price lists, volume breaks, discounts and TAX-001 tax estimates and exemptions, send the PRINT-001 quote and order-confirmation documents by email and convert accepted quotes to sales orders without rekeying. Expired pricing and material edits require renewed acceptance. USD totals, units and rounding stay exact and margin/discount permissions are enforced. PRINT-001 and SALES-006 inherit the same retained-version and honest-delivery obligations for future document kinds.

**Acceptance.**
1. Quote a case-pack order at two customer tiers, apply an authorized discount, email the quote (its sent PDF kept on the record) and accept one version, then convert once, reserve it and send the order confirmation.
2. A duplicate acceptance cannot create another order; changing price or quantity invalidates earlier approval.
3. Exact-version quote price/discount/margin approval uses a configurable human approver role defaulting to Owner; the owner may explicitly designate Sales operator or Buyer, with a retained reason.
4. Each retained PDF recipient list still requires explicit owner consent.
5. A material revision invalidates approval and acceptance; acceptance converts the same reserved quote identity once, retaining earlier versions.
6. Tax estimates name the owner table version, use USD cents with half-away-from-zero rounding and stop for unresolved exemption evidence.
7. Changing the approver policy invalidates open approvals; acceptance and quote sending recheck the approver’s current role.

#### SALES-008 — Customer order files

*Tier:* Core · *From:* SALES-001

**Requirement.** Staff also import new sales orders from a CSV or spreadsheet file a customer sends: one row per line with customer, PO reference, item by SKU, barcode or customer item code (CAT-001 aliases), quantity and unit, optional price, ship-to and requested date. The preview resolves each row, applies the customer’s price list where no price is given, shows every row error and the SALES-007 warehouse each order would route to, and creates nothing until approved. Approval creates each order once, and re-importing the same file or the same customer PO reference is flagged as a duplicate rather than creating a second order.

**Acceptance.**
1. Import a 40-line order file for three customers that uses customer item codes, leaves some prices blank and contains one unknown code: the preview prices blank lines from each customer’s price list, names the unknown row and its routed warehouse, and approving creates three orders once; importing the same file again creates none.

#### SALES-002 — Customer history, credit and financial returns

*Tier:* Core

**Requirement.** Customer records show contacts, addresses, item references, order and shipment history (including MIGRATE-002 imported history), payment terms, outstanding balances, credit limits and overdue holds. Each customer has an assigned sales rep, either a Pier user or an outside rep record without sign-in. The rep defaults onto the customer’s quotes, orders and invoices and can be changed per document by authorized staff with the change audited; REPORT-002 reports sales and margin by rep. Balances come from SALES-006 invoices and credit notes and PAY-001 payments; Pier produces customer statements and AR aging (current, 1–30, 31–60, 61–90, over 90 days) that reconcile to the ledger. Authorized sales staff review overrides with reasons. Dispatch-linked returns produce partial customer credits/refunds and restock or write-off decisions; physical disposition and financial credit remain separate and reconcile to the ledger. Who may read and change customer profiles, contacts, addresses, terms, representatives and receivables follows ADMIN-001's commercial custody boundary (RL-101): owner-only until scoped sales and accountant delegation ships, and existing owner-only proof never satisfies broader roles.

**Acceptance.**
1. Place an order for a customer over its credit limit, approve an override, partially ship, return damaged and sellable units and issue the correct credit note.
2. Customer balance, AR aging, the emailed statement, quarantine, refund and accounting reconciliation agree without restocking damaged units.
3. Assign an outside rep to the customer: the order and invoice carry that rep, reassigning one order is audited, and REPORT-002 sales and margin by rep credit each invoice to the rep on it.

#### SALES-003 — Available-to-promise and fulfillment routing

*Tier:* Core

**Requirement.** Sales staff see present availability and dated available-to-promise by warehouse, accounting for committed demand, inbound confirmations, lead times, transit, safety stock and split deliveries. Which warehouse each new order reserves at, and what happens when that warehouse is short, is decided by the owner’s SALES-007 routing rules; this clause covers what staff do with orders after routing. For an order already routed, staff compare the routed outcome with split or later-shipment options from other eligible warehouses, showing each option’s ship date and carrier cost from SHIP-001. Reprioritizing reservations or changing a customer promise requires authorized review and a customer communication; uncertain inbound supply is labeled rather than guaranteed. When stock arrives, Pier lists the backorders it can now fill, ranked by an owner-set priority rule (promise date, customer priority, order date), and proposes allocations from that receipt. An authorized user releases them in one action, or an AUTO-002 policy releases them within its bounds, without re-authorizing each order. Each backordered line shows an expected fill date: the confirmed date of the earliest inbound supply (PO line or transfer) to its routed warehouse not already allocated to higher-priority backorders under the priority rule, or, with no confirmed supply, today plus the default supplier’s lead time, labeled as an estimate. The date recalculates whenever supply, a confirmation or priority changes, and a changed date flags the order for a customer promise under the review above.

**Acceptance.**
1. Create competing orders with stock in two warehouses and a late inbound PO; compare split and later shipment options, approve one reallocation and changed promise.
2. Another order cannot lose its allocation silently; stale supplier confirmation forces recalculation.
3. Receive the late PO: the fill-backorders list ranks the waiting orders by the priority rule and one release allocates them without re-entering any order.
4. Backorder three orders at one warehouse against a PO confirmed for a date 14 days out with units for two of them, and a second, unconfirmed PO from a supplier with a 21-day lead time: the two higher-priority orders show the confirmed date, the third shows today plus 21 days labeled as an estimate, and confirming the second PO for 20 days out changes the third order’s date to that day and flags it for re-promise.

#### SALES-004 — Recurring and dropship orders

*Tier:* Core · *From:* SALES-004, SALES-001

**Requirement.** Authorized staff schedule recurring wholesale orders with explicit customer, price, cadence, stock and credit policy and pause or cancel controls. Dropship lines link sales demand to a supplier PO and direct-to-customer shipment, carrying confirmations, tracking, credits and cost without inventing a receipt in Pier’s own warehouse. Recurring policy approval is owner-only, explicitly enabled and bounded by exact customer, UTC due day and cadence, stock rule, price ceiling and a separately reviewed expiring credit allowance. A scheduler pass creates at most one occurrence for each policy, never sends mail or ships, and pause or cancel prevents later occurrences. Restoring under fresh installation signing settings requires renewed owner approval. A direct supplier shipment creates no warehouse receipt or stock movement. Its retained customer credit stays unposted until an explicit owner action authorizes a Pantry shipment invoice and its linked customer credit note; durable request identities and readback prevent duplicate posting after response loss. This is a credit note, not a cash refund. ACCOUNT-001 and ACCOUNT-002 inherit the same identity and readback obligations before offering these postings through another ledger.

**Acceptance.**
1. Run a recurring order across a price change and credit hold, pause it and confirm no further order is created.
2. Fulfill a dropship line from supplier confirmation to tracking and customer credit; local on-hand stock remains unchanged.

#### SALES-005 — Private wholesale ordering through Stall

*Tier:* Core

**Requirement.** Pier supplies authenticated trade-buyer catalog availability, customer-specific prices, terms, credit rules, reorder history and order status to a private wholesale ordering experience through [Stall](https://github.com/just-every/run-stall) and the public integration API. Stall owns storefront design, carts and checkout; Pier owns stock, wholesale commercial rules and order execution. Trade orders arriving from Stall route to a warehouse under SALES-007, and the buyer’s catalog availability follows the same routing. Reorder history includes MIGRATE-002 imported history. The current owner explicitly approves each trade buyer’s customer, item scope and routing destination (RL-2). The integrating server retains the buyer credential; Pier stores its domain-separated hash.

**Acceptance.**
1. A trade buyer signs into a Stall-connected private catalog, sees only its approved prices, reorders and receives Pier order/tracking status.
2. Another buyer cannot see those prices.
3. A grant takes effect only after the current owner approves its customer, item scope and routing destination, and it authorizes only its named operations and current scope.
4. Customer and item restrictions apply consistently to catalog, prices, history, status and tracking projections; customer-wide history disclosure requires explicit reviewed authority and cannot arise accidentally from a narrower catalog grant.

#### SALES-009 — Abandoned-cart follow-up with consent and suppression

*Tier:* Core · *From:* SALES-005

**Requirement.** Abandoned wholesale carts may trigger owner-configured follow-up with consent and suppression, using Stall events; cart activity alone never reserves stock. Cart events obtain buyer and customer scope from the authenticated grant, and supplied recipient addresses, customer identities, cart bodies and provider instructions confer no authority. Follow-up consent is never inferred from cart activity, purchase and unsubscribe stop reminders permanently, and restoring an archive never revives a credential, consent or reminder.

**Acceptance.**
1. An abandoned-cart event sends one authorized reminder, stops after purchase/unsubscribe and creates no stock reservation.
2. Cart events obtain buyer and customer scope from the authenticated grant; supplied recipient addresses, customer identities, cart bodies and provider instructions confer no authority.
3. Abandonment alone creates no stock reservation, order, financial posting or outbound action.
4. Follow-up consent records the relevant recipient and purpose, source, capture time and approving owner; it is never inferred from cart activity.
5. Purchase permanently stops reminders for that cart, and unsubscribe permanently suppresses that buyer’s follow-up across existing and later carts, delayed events and replay.
6. Re-grant, credential rotation, connection re-enablement and archive restoration do not clear suppression; restoration revokes buyer credentials and active consent and requires fresh current-owner authorization.
7. Usable owner-configured reminder controls send one authorized reminder with exact recipient and content authority, current consent and suppression checks immediately before submission, a retained outcome and no blind resend of uncertainty.

#### SALES-006 — Customer invoices, charge lines and credit notes

*Tier:* Core

**Requirement.** Pier creates the customer invoice. An invoicing policy set per customer or order type decides when: on shipment, once per partial shipment, or before shipment for prepay/proforma. A simple sale has one invoice. A split-shipped order is invoiced once per shipment for exactly the shipped quantities. A prepay order is invoiced on acceptance, and its later shipments reconcile against that invoice without a second charge. Invoices carry freight, handling, surcharge and discount charge lines, tax lines from TAX-001, the customer’s payment terms (due on receipt, Net 15/30/60, end of month, early-payment discount) and a due date derived from those terms and the invoice date. An invoice is drafted, reviewed and authorized. Once authorized it is immutable and is corrected only by a linked credit note or void. Credit notes apply against a named invoice for returns (PIER-010, SALES-002), price adjustments or freight refunds and are refunded through PAY-001 or kept as customer credit. Each authorized invoice and credit note posts once to the connected ledger (ACCOUNT-001/002) and drives the SALES-002 customer balance. Customers priced in CAD or another currency are quoted and invoiced in that currency; the exchange rate is retained and the USD value reported. A paid channel order is one SALES-006 invoice carrying the channel’s charged tax, charge lines and payment under CHANNEL-002, never an unpaid invoice. Voiding an authorized invoice that has no payment applied reverses its ledger posting once, voids any committed TAX-001 transaction, keeps the voided document and reason on the record, and returns its shipped quantities to uninvoiced; an invoice with a payment applied must be credited instead.

**Acceptance.**
1. Ship a Net 30 wholesale order in two partial shipments and invoice each shipment with its own freight line.
2. Invoice a prepay order before shipment, then ship it without a second charge.
3. Due dates follow Net 30 from each invoice date.
4. Issue a credit note against the first invoice for a returned line.
5. Each invoice and credit note posts to QBO exactly once (replay creates no duplicate), and the SALES-002 balance equals invoices less credits and payments.
6. An edit to an authorized invoice is refused; a CAD invoice retains its rate and reports its USD value.
7. Void an unpaid authorized invoice with a reason: its QBO posting and Avalara transaction are reversed once, the voided document stays readable, its shipment is uninvoiced again, and an attempt to void a paid invoice is refused in favor of a credit note.

#### SALES-007 — Warehouse routing for incoming orders

*Tier:* Core · *From:* SALES-007

**Requirement.** Every order reaches one warehouse before it reserves, as Cin7 Core’s channel locations and Order Routing do; existing source doors use versioned routing before reservation. For each order source (each CHANNEL-001 connection, each EDI-001 trading partner, SALES-005 Stall trade orders, SALES-004 recurring orders, SALES-001 manual and file-imported orders and DOC-001 extracted orders) the owner chooses one of three routing modes. **Fixed warehouse** routes every order from that source to one named warehouse. **Channel location** maps each channel-side location (for example each Shopify location) to a Pier warehouse and follows the location the channel assigned. **Rule-based** routes by ship-to zone. A zone is a list of 3-digit or 5-digit ZIP prefixes, a list of US states, or a country. Each zone maps to an ordered eligibility list of warehouses, and the first warehouse on the list is the routed warehouse. The most specific matching zone wins (5-digit ZIP, then 3-digit ZIP, then state, then country, then the source’s default zone). Overlapping zones at the same level are refused when saved, so every address matches exactly one zone. Under rule-based routing, Pier’s rule takes precedence over the fulfillment location a channel assigned; the channel’s location is kept on the order for reference. Warehouses absent from the eligibility list are ineligible for that order. The Amazon FBA location and 3PL warehouses are eligible only for the sources and zones the owner lists them on. The tie-break is always eligibility-list order; Pier never picks a warehouse by any criterion the owner did not configure. Reservation follows PIER-004 at the chosen warehouse’s bins only. No order reserves at an ineligible warehouse. The order shows its routed warehouse and the rule that chose it (source, mode, zone and shortage rule). An order whose address matches no zone, when its source has no default, waits unreserved in the CHANNEL-001 queue with that reason. Backorders wait at the warehouse that holds them for the SALES-003 fill list, and BUY-005 counts them against that warehouse. A ship-to change before picking reroutes the order under the same rules. SALES-007 owns routing, reroute and split semantics once, with its parts SALES-010 and SALES-011 (RL-103); SALES-005 and DOC-001 inherit this obligation before their new trade/extraction doors ship.

**Acceptance.**
1. With East and West warehouses and a third FBA location, set Shopify to rule-based routing: one zone covers ZIP prefixes 900–961 and the states WA, OR, NV and AZ and maps to West then East; the default zone maps to East then West.
2. Set Faire to a fixed East warehouse and an EDI 850 partner to rule-based routing.
3. Import a Shopify order to ZIP 94107 and one to ZIP 10001, a Faire order to ZIP 98101 and an EDI 850 to a distribution center in Oregon.
4. The orders reserve at West, East, East and West respectively, each showing the rule that chose it.
5. An order with no matching zone and no default waits unreserved in the queue.

#### SALES-010 — Shortage rules, split permission and reroutes

*Tier:* Core · *From:* SALES-007

**Requirement.** Each source also has a **shortage rule** for when the routed warehouse cannot fill every line, from the table below. Splitting applies only under the customer’s explicit current split policy, recorded by the owner; otherwise the documented next-eligible fallback applies. Only the current owner reroutes unpicked work, with a reason, and only to another eligible warehouse: Pier releases the old reservations and creates the new ones atomically, and AUDIT-001 records the change; rerouting to an ineligible warehouse is refused (RL-103).

| Shortage rule | What happens |
| --- | --- |
| **Hold at routed warehouse** | Reserve what that warehouse has and backorder the rest there. |
| **Next eligible warehouse with full stock** | Move the whole order to the first warehouse on the eligibility list that can fill every line. If none can, hold at the routed warehouse. |
| **Split by line** | Reserve each line at the routed warehouse first and the remainder at the following eligible warehouses in list order, creating one shipment per warehouse. This applies only when the customer’s split-shipment policy allows it; otherwise the order falls back to the next-eligible rule. |

**Acceptance.**
1. A 5-unit Shopify order to ZIP 94107 arrives when West has 2 units and East has 10.
2. Under hold-at-routed, 2 reserve at West and 3 backorder at West.
3. Under next-eligible, all 5 reserve at East.
4. Under split-by-line, 2 reserve at West and 3 at East as two shipments; for a no-split customer the order goes to East whole.
5. The FBA stock is never reserved by any of them.
6. A manual reroute from West to East is audited, and a reroute to the FBA location is refused.

#### SALES-011 — Routed channel availability and rule dry runs

*Tier:* Core · *From:* SALES-007

**Requirement.** Published channel availability follows the same routing rules (CHANNEL-001): a fixed source publishes its warehouse’s availability; a channel-location source publishes each mapped warehouse to its channel location; a rule-based source publishes the warehouses on its eligibility lists, net of reservations and buffers. Routing rules are versioned and dry-run against recent orders before they take effect.

**Acceptance.**
1. Shopify’s published availability equals West plus East net of reservations and buffer, and Faire’s equals East only.
2. A dry run of a changed rule over the last 30 days of orders lists every order whose warehouse would change.

#### TAX-001 — US sales tax on quotes, orders and invoices

*Tier:* Core

**Requirement.** Owners configure one sales-tax source of truth per company: Avalara AvaTax, Stripe Tax, QuickBooks Online automated sales tax, or Pier’s owner-maintained rate table by jurisdiction. Tax is calculated per line from the ship-to address, product tax code and each state’s rule, including whether freight and handling are taxable; origin-based states follow the provider or table rule. Quotes and orders show an estimate labeled with its source; the invoice amount is final at authorization. With Avalara or Stripe Tax, the authorized invoice commits the transaction, and a credit note or void adjusts or voids that committed transaction. With QBO automated sales tax, Pier adopts the tax QBO returns on the posted invoice and flags any difference from the estimate. Resale and other exempt customers hold exemption certificates by state, with reason, number, expiry and document (DOC-001), linked to the customer’s Avalara exemptions where connected. A missing or expired certificate for the ship-to state stops the exemption and flags the order for review; Pier neither charges nor exempts silently. Orders imported from a store channel (Stall, Shopify, WooCommerce, BigCommerce, eBay, Etsy, Faire) keep the tax the channel charged the customer, per line and on shipping, as channel-collected tax mapped through the channel’s tax rules (CHANNEL-002); the company’s tax source never recalculates them, and a difference from its estimate is reported rather than applied. Marketplace orders whose marketplace collects and remits the tax record it as facilitator-collected. A provider timeout leaves the invoice pending rather than taxed at an invented rate. Nexus registration and filing remain with the accountant or tax provider.

**Acceptance.**
1. For each supported tax source, quote and invoice one taxable and one resale-exempt order to two US states, one that taxes freight and one that does not.
2. Line and freight tax follow each state’s rule and the exempt order cites its certificate; expiring that certificate flags the next order.
3. The authorized invoice’s tax equals the provider’s committed transaction and the QBO-posted invoice; a credit note adjusts the committed amount once; a provider timeout leaves the invoice pending with no invented tax.
4. A Shopify order whose charged tax differs from the configured source’s estimate is invoiced at the charged tax with the difference reported.

#### PRINT-001 — Printable and emailable business documents and templates

*Tier:* Core · *Cites:* BASE-MAIL-001 · *Rules:* D-1

**Requirement.** Pier generates each business document from its live record: quote, sales order confirmation, proforma/prepay invoice, pick list, packing slip, invoice, credit note, customer statement, purchase order, supplier return authorization, transfer note, shipment/carton manifest and the SHIP-001 straight bill of lading (VICS format) for LTL and pallet freight. Each document has an owner-editable document template and email template, grouped by sales, purchasing and inventory. Templates carry the logo, company and remit-to details, terms and mail-merge fields, including customer/supplier item codes, case-pack and base-unit quantities, lot/serial, custom fields (CAT-001), tax and charge lines. Templates are versioned: a generated document records the template and record versions it rendered, and a reprint reproduces that document unless it is deliberately regenerated. Documents render to PDF and print at the pack station through browser printing or a configured network printer. Staff email them from the record through the owner’s authorized sending domain or Gmail/Microsoft 365 connection; the sent copy, recipients, time and delivery outcome stay on the record. An emailed invoice or statement carries a PAY-001 pay-now link for the open balance by card or ACH; the link is specific to that invoice, expires when the invoice is paid, credited or voided, and never exposes another customer’s documents.

**Acceptance.**
1. Generate each named document from a real order, PO, return and transfer, carrying the logo, terms, customer item codes and case-pack quantities.
2. Edit the invoice template: the next invoice shows the change and an earlier invoice reprints unchanged.
3. Print a packing slip at the pack step at 1440px and 390px.
4. Email a quote and an invoice: the sent PDF, recipients and delivery outcome appear on each record, and a bounced send shows as failed.
5. Pay the emailed invoice through its pay-now link by ACH: the payment applies to that invoice once, and the link then shows the invoice as paid.


### Purchasing and replenishment

#### BUY-001 — Demand and lead-time replenishment

*Tier:* Core

**Requirement.** Buyers configure location reorder points, safety stock, service levels, supplier lead times, MOQs and case packs. Day-to-day reorder-point replenishment (the trigger, suggested quantity, netting, rounding and default supplier) is BUY-005. This clause adds demand-driven planning on the same supply position. Scheduled planning combines real sales-channel sell-through, stockouts, backorders, seasonality, promotions, confirmed receipts and transfers to show dated shortages and explain recommended POs. Sales history means live Pier shipments together with MIGRATE-002 imported incumbent history and CHANNEL-001 backfill, so planning works on cutover day. For each SKU-location, Pier shows average daily sales over owner-chosen windows (default 30, 90 and 365 days), days of cover and the projected stockout date. It can propose reorder points and quantities from lead-time demand plus safety stock at the chosen service level; a buyer reviews and applies them, and they never change on their own. Minimum/recommended/stretch and transfer alternatives show uncertainty and stockout-censored demand. Their quantities net the same BUY-005 position and round by the same case-pack and MOQ rules, and review creates exact supplier-grouped PO drafts without changing on-hand stock. How native channel observations are counted today is in [the contract mechanism notes](docs/contract/mechanism.md#buy-001).

**Acceptance.**
1. Plan a seasonal item with a stockout, MOQ, late receipt and cash ceiling from connected sales history.
2. Compare quantity/date alternatives, create the selected PO and rerun after a new receipt; duplicate drafts and fictitious stock do not appear.
3. On cutover day, with only MIGRATE-002 imported history, average daily sales, days of cover, projected stockout dates and proposed reorder points for three SKUs equal an independent calculation from the same history, and applying the proposed points needs a buyer’s approval.

#### BUY-002 — Purchase approval limits and spend routing

*Tier:* Core

**Requirement.** Owners set approval limits by spend, supplier and exception type, with named approvers, delegation and escalation. A workflow rule never approves or sends a purchase (RL-5). An agent never records a person’s approval; an agent’s commit carries the money class, which the company’s policy decides. ADMIN-001 and AUTO-002 inherit these limits before adding roles, exception kinds or approval doors.

**Acceptance.**
1. Route a threshold-crossing PO to the correct buyer, and refuse an approval recorded with an agent’s credential.
2. Current native routing uses owner-saved named human approvers.
3. Spend includes goods, freight, duty and supplier tax at exact decimal precision; ceilings are inclusive.
4. A supplier-specific scope takes precedence over the general scope, then an exact exception type over `any`; the smallest covering ceiling in that scope wins, and uncovered spend is refused.
5. Current exception types are `standard` and `minimum-order` (the supplier minimum order value is unmet).
6. Delegates must be current unrestricted owners or buyers and have an explicit UTC expiry; escalation is an explicit audited owner action to the named escalation approver.
7. Policy edits invalidate existing approval and pending send authority.

#### BUY-006 — Exact-version supplier sends and acknowledgments

*Tier:* Core · *From:* BUY-002 · *Rules:* D-3

**Requirement.** Buyers approve an exact PO version and supplier recipient; Pier sends it as the PRINT-001 purchase-order document by email or as EDI and records acknowledgment. Purchase sending and the purchase PDF send door share one correspondence identity and durable provider claim, and supported install mail attaches the retained PRINT-001 PDF as exact bytes.

**Acceptance.**
1. Approve and send a PO once.
2. A timeout or ambiguous send remains visible for reconciliation rather than blind duplicate sending.
3. Both purchase sending and the purchase PDF send door share one correspondence identity and durable provider claim.
4. Supported install mail attaches the retained PRINT-001 PDF as exact bytes.
5. The pinned Managed relay retains its explicit text-only message with a visible attachment-unavailable notice and refuses purchase PDF sends; uncertain claims remain visible and are never automatically retried.

#### BUY-007 — Supplier changes, re-approval and cancellations

*Tier:* Core · *From:* BUY-002

**Requirement.** Pier follows supplier confirmation and ASN changes, partial supply and cancellations against the committed purchase. A changed price, quantity, destination or promise invalidates approval; live network certification remains EDI-001.

**Acceptance.**
1. Ingest a supplier price/date change: re-approval is required.
2. Supplier change intake retains its source and proposed lines without changing the committed purchase.
3. It stops sends and chases; explicit review of the current version applies the changed price, quantity, destination or promise under the current spend route.
4. Received goods cannot be cancelled.
5. Original-file X12 004010 856 notices use the existing reviewed receiving door.

#### BUY-003 — Supplier returns and purchase credits

*Tier:* Core

**Requirement.** Warehouse and purchasing staff create supplier return authorizations against receipts, quarantine rejected goods, dispatch approved returns and reconcile replacements or supplier credits. Quantities cannot exceed the received unreturned amount or remove stock committed elsewhere. Returning physical goods and correcting an erroneous receipt are distinct, linked actions. COST-001 and ACCOUNT-001 and ACCOUNT-002 inherit this retained valuation and once-only posting obligation for future cost and ledger doors.

**Acceptance.**
1. Partially reject a received PO, obtain authorization, dispatch the return and reconcile a supplier credit and replacement.
2. A duplicate or excess return is refused; the original receipt, cost, remaining PO and physical-stock history survive.
3. Supplier-return dispatch journals debit the mapped Cost of goods expense account as return clearing and credit Inventory at the exact dispatched cost layers.
4. Explicit owner-authorized supplier credits reverse that clearing expense and allocate once to the selected matched payable; insufficient open balance or a mismatched readback stays in review.
5. Replacements debit Inventory and clear the same expense using the original receipt's retained unit cost and cumulative whole-cent freight and duty shares, without another payable or reopening the PO.
6. A remaining clearing expense states a non-credited cost, never an invented supplier refund.

#### BUY-004 — Three-way matching and supplier performance

*Tier:* Core

**Requirement.** Purchasing staff match POs, receipts, supplier invoices and bills of lading by item, unit, quantity, price, freight and tax. Tolerances route discrepancies for approval before accounting posting. Scorecards use actual confirmed versus received dates, fill rate, defects and price changes, retaining exclusions and source documents rather than model-invented ratings. Scorecard measures, source matching and freight and tax accounting are defined in [the contract mechanism notes](docs/contract/mechanism.md#buy-004).

**Acceptance.**
1. Attach an invoice/BOL with a wrong pack and freight line, compare against a partial receipt and PO, resolve the discrepancy and post only the approved bill.
2. Scorecards reproduce supplier on-time, fill, defect and price-change measures from the same receipts and inspections.

#### BUY-005 — Reorder-point list and suggested quantities

*Tier:* Core

**Requirement.** Most weeks a buyer replenishes from the reorder list, as Cin7 Core’s low-stock reorder does. Parameters are kept per SKU and location: the reorder point (minimum before reorder), safety stock, and a replenishment method, either a **fixed reorder quantity** or an **order-up-to maximum**. A SKU-level default fills any location without its own values. Each supplier-SKU term (PIER-002) adds the supplier’s case pack, minimum order quantity, optional minimum order value, lead time and an optional supplier reorder quantity. Each SKU has one default supplier, with an optional per-location override. The trigger, position and suggested quantity are defined below; the company-mode and supplier-switch details are in [the contract mechanism notes](docs/contract/mechanism.md#buy-005).

| Term | Definition |
| --- | --- |
| **Trigger** | An owner setting chooses per-location or company-wide replenishment. Per location (the default), a SKU-location is listed when its position is at or below that location’s reorder point. Company-wide, a SKU is listed when its total position across the warehouses included in planning is at or below its company reorder point (by default the sum of the location points), and the PO goes to the owner’s default receiving warehouse. |
| **Position** | The position nets everything that will change the location’s stock: sellable on-hand, less reservations, less unfilled backorders routed to that location (SALES-007), plus unreceived quantities on committed PO lines destined there, plus inbound transfers in transit or committed to it, less committed outbound transfers. Quarantine stock and unconfirmed forecasts never count. Kit demand counts against the kit’s components (KIT-001); a kit without pre-assembled stock is not itself listed. |
| **Suggested quantity** | With a fixed reorder quantity, the suggestion is reorder quantity + reorder point − position, using the first reorder quantity found in this order: the default supplier’s, then the SKU-location’s, then the SKU default. With an order-up-to maximum, the suggestion is maximum − position. It is rounded up to whole supplier case packs. If it is still below the supplier’s minimum order quantity, it is raised to that minimum and rounded up to the case pack again. A supplier minimum order value is checked per PO draft and shown as unmet; it is never padded silently. |

**Acceptance.**
1. Build a seeded scenario with East and West warehouses through public commands.
2. SKU A at East has reorder point 20, fixed reorder quantity 40, 8 on hand, an open PO line for 6 and supplier S1 (case pack 12, minimum 24): the list suggests 48.
3. SKU B at West has reorder point 10, order-up-to maximum 60, 30 on hand of which 25 are reserved, and a 7-unit unfilled backorder; its default supplier is S2 (case pack 6), with S3 as an alternative: the list suggests 66 from S2.
4. SKU C at East has reorder point 5, 4 on hand, a location reorder quantity of 8 and an S1 supplier reorder quantity of 3 (case pack 1, minimum 10): the supplier quantity applies and the minimum lifts the suggestion to 10.
5. SKU D at West has reorder point 10 and 6 on hand, with 8 in transit from East: it is not listed.
6. SKU E has 2 on hand at East (reorder point 5, reorder quantity 10, supplier S1) and 40 at West: per location it is listed at East for 13.
7. The list shows exactly A, B, C and E with those quantities and every calculation term.

#### BUY-008 — Reorder drafts, coverage and one low-stock definition

*Tier:* Core · *From:* BUY-005

**Requirement.** Each reorder line shows the SKU, location, supplier, lead time and every term of the calculation: on-hand, reserved, backorders, on order, inbound transfers, position, reorder point, method, unrounded need, rounding applied and the final quantity. When sales history exists, the line also shows BUY-001 days of cover and the projected stockout date. The buyer ticks lines and may edit a quantity or switch to another supplier; a supplier switch recalculates rounding with that supplier’s terms. One action creates one PO draft per supplier and destination warehouse. The drafts go through PIER-005 and BUY-002 approval, and on-hand stock does not change. A SKU-location already covered by an uncommitted PO draft or approved PO stays on the list, marked with that document, and its remaining suggestion is the suggested quantity less the quantity on that document, never below zero. A rerun therefore suggests nothing twice, and deleting a draft restores the full suggestion. A line leaves the list when committed supply or a receipt lifts its position above the reorder point. This trigger and position are the single definition used by the AUTO-001 low-stock check and the REPORT-002 low-stock report, so all three list the same SKU-locations. AUTO-002 may create the drafts on a schedule within a bounded policy; it never approves them.

**Acceptance.**
1. In the BUY-005 scenario, one action creates exactly two drafts: S1 to East with A 48, C 10 and E 13, and S2 to West with B 66.
2. A rerun shows the same four lines, each marked with its draft and a remaining suggestion of zero.
3. Deleting the S2 draft restores B’s suggestion of 66 and nothing else.
4. Committing B’s PO removes B from the list.
5. Switching to company-wide replenishment removes E, because West covers it.
6. The AUTO-001 low-stock exceptions and the REPORT-002 low-stock report list the same SKU-locations as the reorder list in each setting.
7. An independent calculator in the test computes every expected quantity from the exported stock, orders, POs, transfers and terms.


### Costing and reports

#### COST-001 — USD valuation, landed cost and cost of goods

*Tier:* Core

**Requirement.** US first buyers operate in USD with US dates/addresses, named IANA time zones and explicit sales-tax treatment. Configure FIFO or moving-average costing and a controlled opening/cutover policy; allocate freight, duty, insurance and other landed costs by reviewed value, quantity or weight. Receipts, late landed-cost bills, transfers, returns, write-offs and partial shipments produce traceable valuation layers, COGS and margin without rewriting original physical events. Foreign-currency purchases and SALES-006 foreign-currency sales retain source currency/rate and USD value. ACCOUNT-001, ACCOUNT-002, COUNT-001 and REPORT-002 inherit these valuation and once-only reconciliation semantics as their additional doors ship.

**Acceptance.**
1. Import USD openings, receive two cost layers, allocate freight/duty, partially ship and return units, then receive a late freight bill.
2. Reconcile FIFO and average-cost scenarios, inventory value, COGS and order margin to exact approved accounting postings; rounding and period-lock differences enter review.
3. Receipt conversions retain source currency, amounts and the reviewed rate; the USD unit cost uses six decimal places and cost layers round to whole cents.
4. Reviewed weight allocation captures pounds per base unit on the receipt.
5. Freight, duty, insurance and other charges split by largest remainder.
6. A late bill retains supplemental shares rather than replacing physical events; its current-date payable and delta journal reconcile inventory, net COGS and the retained accounts of removed stock.
7. Original journals keep their baseline amounts.
8. Unbuilt baseline documents, unmapped prior adjustments, fractional-cent payables and provider period-lock refusals remain explicit review, with no guessed account or changed accounting date.

#### COST-002 — Write-off reason codes and approval limits

*Tier:* Core · *From:* COST-001

**Requirement.** Adjustments and write-offs outside a count carry an owner-maintained reason code mapped to a GL account, need approval above an owner-set value and post their valuation once.

**Acceptance.**
1. Write off damaged units with a reason code that posts to its mapped GL account.
2. Existing write-off doors require a reason mapping; one mapped code is the default, the initial code is `damaged`, the default approval limit is zero USD, equality is within the limit and amounts above it need explicit owner approval of the exact return.

#### REPORT-001 — Operational reports and saved analysis

*Tier:* Core

**Requirement.** Owners save, filter, schedule and export stock valuation, movement/lot history, warehouse availability, sales, purchasing, gross margin, inventory aging, dead stock, low stock, turnover and overdue-order reports, each computed to its REPORT-002 definition and runnable as of a past date. Reports distinguish on-hand, committed, inbound, transit and quarantine, expose freshness and drill through to source documents. Warehouse, customer, channel, variant and date filters use permission-scoped data. The reporting capacity disclosed before admission is the SCALE-001 envelope measured on PIER-SCALE-1, shown alongside any activity-based prices, with export available.

**Acceptance.**
1. For a wholesaler with two warehouses, backorders, aged stock, landed costs and returns, save a filtered report on mobile and desktop, schedule it, export details and reconcile totals to ledger/source documents.
2. A restricted user cannot infer another warehouse’s figures.
3. Each named report’s figures meet the REPORT-002 acceptance.

#### REPORT-002 — Report definitions and independent reconciliation

*Tier:* Core

**Requirement.** Each REPORT-001 report states its definition in the report and computes to it, as the table below defines. Owner-set parameters (buckets, thresholds, period, inbound treatment) are saved with the report and shown on its output and export.

| Report | Definition |
| --- | --- |
| **Stock valuation** | Quantity times the remaining cost of each open COST-001 layer (FIFO) or the moving-average unit cost, by SKU, location and lot; the total equals the COST-001 inventory value and the ledger inventory-asset balance at the same date, with any difference listed. |
| **Movement/lot history** | Every movement with its source document, actor, lot/serial and before/after quantity. |
| **Warehouse availability** | Per location, on-hand, committed, available (on-hand sellable less reservations), inbound (open PO lines with their confirmed date), transit and quarantine. |
| **Sales** | Net sales from SALES-006 invoices less credit notes, and units shipped, by customer, channel, SKU, sales rep (SALES-002) and period. |
| **Purchasing** | Ordered, received, billed and open quantities and values by supplier and SKU, with BUY-004 on-time and fill rates. |
| **Gross margin** | Net sales less COGS from the cost layers actually consumed (including landed cost and kit components), per invoice line, by customer, channel, SKU and sales rep; totals equal ledger revenue less COGS. |
| **Inventory aging** | On-hand quantity and value of each cost layer by that layer’s receipt date (a pre-assembled kit by its assembly date; a transfer keeps the original receipt date), in owner-set buckets (default 0–30, 31–60, 61–90, 91–180 and over 180 days; any intervals from 1 to over 360 days), shown by quantity and by value. |
| **Dead stock** | SKU-locations with stock on hand and no sale shipment, kit consumption or transfer out within an owner-set number of days (default 180), with value and last-movement date. |
| **Low stock** | Exactly the SKU-locations (or SKUs, under company-wide replenishment) that the BUY-005 trigger lists, with the same position terms and reorder point. Available stock without inbound supply is shown alongside, with safety stock, and stock below safety stock is flagged critical. The report, the BUY-005 reorder list and the AUTO-001 low-stock check never disagree on which SKUs are low. |
| **Turnover** | COGS for the selected period divided by average inventory value over that period (the mean of daily closing values), with days of inventory equal to period days divided by turnover. |
| **Overdue orders** | Sales order lines not shipped by their customer promise date (the requested date when no promise was given) and PO lines not received by their supplier-confirmed date (the expected date when unconfirmed), measured in each location’s time zone. |

**Acceptance.**
1. Build a seeded scenario through public commands: two warehouses, FIFO layers received 10, 45, 100 and 200 days ago, a kit assembled 20 days ago, a transfer, sales and a return, landed cost, a write-off, a late PO and a late customer promise.
2. Run every named report on it and on PIER-SCALE-1.
3. An independent calculator in the test computes the expected figures from the same exported movements and cost layers, and every report figure matches it exactly.
4. Aging places each layer by its receipt date (transferred stock keeps its original date, the kit uses its assembly date), and changing the buckets to 30/90/360 re-buckets the same layers.
5. Dead stock with a 90-day threshold lists exactly the expected SKUs.
6. Low stock lists exactly the SKU-locations of the BUY-005 reorder list in the same scenario.
7. Sales and margin by rep credit each invoice to its rep.
8. Turnover equals COGS over average inventory, and overdue lists the late PO by its confirmed date and the late order by its promise date.

#### REPORT-003 — Reports across cutover, as-of dates and ledger tie-out

*Tier:* Core · *From:* REPORT-002

**Requirement.** Sales, gross margin, dead stock, turnover and purchasing include MIGRATE-002 imported history and CHANNEL-001 backfill for periods before cutover, so a SKU sold shortly before cutover is not dead stock on cutover day. A period that spans cutover combines imported and native figures, and the report labels each figure’s source. Turnover for pre-cutover periods averages the imported month-end inventory values, a method the report states, rather than daily closing values. Every report runs as of a past date, reconstructing quantities, cost layers and values from movements and layers at the end of that day in the location’s time zone. Valuation and aging as of a closed accounting period equal the figures captured at its close.

**Acceptance.**
1. In the REPORT-002 scenario, valuation, aging-by-value and margin totals equal COST-001 and the QBO inventory-asset, COGS and revenue balances.
2. Valuation and aging run as of a past month-end equal the figures captured at that date.


### Channels, EDI, shipping, books and payments

#### CHANNEL-001 — Connected channel orders, mapping and lifecycle

*Tier:* Core · *Rules:* D-4

**Requirement.** Pier connects [Stall](https://github.com/just-every/run-stall), Faire, Shopify, WooCommerce, BigCommerce, Amazon, eBay and Etsy for item/variant/kit mapping, orders, cancellations, refunds, fulfillment status and stock publication. External IDs link source records to Pier; webhook intake and scheduled reconciliation handle duplicates, out-of-order changes and missed events. Each imported order routes to one warehouse under its channel’s SALES-007 rule and reserves there. Orders still open at connection import as live orders after review. Unmapped SKUs, lag and oversell risk enter a visible queue with an owner and repair action. Per channel, owners choose manual fulfillment or automatic pick, pack and ship when the channel, a 3PL or another system reports the shipment; automatic fulfillment dispatches the reservations once, on that shipment evidence. How each channel order’s tax, payment, refunds and payouts reach the ledger is CHANNEL-002. On connection, including reconnection after a MIGRATE-001 cutover, Pier links each existing channel listing to its SKU by the listing or variant ID carried from the incumbent, then by SKU or barcode, without creating, relisting or changing any listing; a listing it cannot match waits in the queue awaiting SKU match and publishes no quantity until mapped, and mapping it links it once.

**Acceptance.**
1. After a source inventory cutover, connect Amazon with two listings whose IDs and SKUs do not match: every other listing links to its SKU with no listing created or changed, and the two wait as awaiting SKU match, publishing nothing until mapped.
2. For each named channel, authorize a connection, import an order, reserve the last units across concurrent channels, partially ship and cancel or refund the remainder.
3. Duplicate and reordered webhooks and a missed event yield one business effect; disconnect and reconnect catches up and reconciles published availability.
4. An auto-fulfill channel dispatches once on its shipment report.

#### CHANNEL-003 — Channel stock publication and protected holds

*Tier:* Core · *From:* CHANNEL-001

**Requirement.** Channel buffers and the same SALES-007 rules decide which warehouses’ sellable availability each channel publishes, after reservations, never raw physical stock. Stock publication follows each change: after a movement or reservation changes a SKU’s published availability, Pier sends the new quantity to every connected channel and has it accepted by the channel’s API within 60 seconds at the 95th percentile, within each channel’s rate limits; an update not accepted within that time shows as lag in the queue (SYNC-001), and the channel’s own processing time after acceptance is reported per channel, not hidden. An approved Amazon FBA inbound plan holds its units at the source warehouse from approval until they leave for transit: held units are available to no channel, and each channel’s availability view shows the hold and its plan (for example “100 held for FBA transfer”).

**Acceptance.**
1. With Shopify, WooCommerce, Amazon and Stall connected, make 100 availability changes in Pier, including reserving a SKU’s last units: each channel’s API accepts every new quantity within 60 seconds of its commit at the 95th percentile, an update held past that shows as lag, and each channel’s read-back quantity is recorded with its processing time.
2. Approve an FBA inbound plan for 100 units: every channel’s published availability drops by 100 and shows the hold until the shipment leaves for transit.

#### CHANNEL-004 — Faire wholesale orders

*Tier:* Core · *From:* CHANNEL-001

**Requirement.** Faire wholesale orders are accepted or declined within Faire’s window, lines can be backordered with a ship date, shipments and tracking return to Faire, retailer cancellations release reservations, and Faire payouts reconcile net of commission to the SALES-006 invoice and the ledger.

**Acceptance.**
1. For Faire: connect, import and accept an order, backorder one line, publish availability net of reservations, ship and send tracking back, handle a retailer cancellation and reconcile the payout and commission.

#### CHANNEL-005 — Amazon FBA location

*Tier:* Core · *From:* CHANNEL-001 · *Rules:* D-2

**Requirement.** Amazon FBA inventory is its own Pier location: inbound shipment plans move stock into it through transit, FBA inventory reports reconcile it like a THIRDPL-001 snapshot without overwriting the ledger, FBA orders consume it, and FBA fees and reimbursements reconcile through the CHANNEL-002 settlement.

**Acceptance.**
1. Send an FBA inbound shipment from a warehouse through transit, receive Amazon’s inventory report with one unit fewer than sent, sell two units as FBA orders and reconcile: the shortfall becomes an assigned case and the FBA location equals Amazon’s report once resolved.

#### CHANNEL-006 — Channel order history backfill

*Tier:* Core · *From:* CHANNEL-001

**Requirement.** On connection, each store channel backfills at least 12 months of past orders (longer when the owner asks and the channel’s API provides it) as MIGRATE-002 history. Backfilled orders are deduplicated against imported incumbent history by channel order ID, and they create no reservation, invoice, ledger posting, tax transaction or customer message.

**Acceptance.**
1. Connect Shopify after a source inventory history import that already holds some of the same Shopify orders: the 12-month backfill adds only the orders not already imported, creates no reservation, invoice or QBO posting, and a reconnect adds nothing twice.

#### CHANNEL-002 — Channel order money: tax as charged, payments, clearing accounts and payouts

*Tier:* Core

**Requirement.** Every order from Stall, Faire, Shopify, WooCommerce, BigCommerce, Amazon, eBay and Etsy reaches the ledger as the money the channel actually took, as Cin7 Core does with its tax-rule and payment mappings. Before a channel’s orders import, owners map each channel tax rule (jurisdiction and rate name) to a Pier tax code and ledger tax account; each channel payment method or gateway (for example Shopify Payments, PayPal, Shop Pay Installments, gift card, manual payment, Amazon, eBay and Etsy managed payments, Faire and Stripe for Stall) to its own clearing account; and shipping, discount, gift-card, tip and fee lines to charge lines and accounts. An imported paid order becomes one SALES-006 invoice whose tax lines carry the tax the channel charged, per line and on shipping, to the cent and labeled channel-collected; TAX-001 does not recalculate it. Shipping and discounts are charge lines, with order-level discounts allocated to lines for margin. The channel payment applies to that invoice through its mapped clearing account, so the invoice posts once to QBO or Xero as paid, and SALES-002 balances and AR aging never count it as owed. Orders the channel has not yet captured (Faire net terms, pending payment, authorized but not captured) stay open invoices until the channel reports capture. A channel edit before authorization revises the draft invoice; after authorization it produces a credit note or an additional invoice. A full or partial refund on the channel produces one SALES-006 credit note for the refunded lines, shipping and tax and one refund out of the same clearing account; physical restock follows PIER-010 inspection. Each channel payout or settlement (Shopify Payments payouts, Amazon settlement reports including FBA fees, eBay and Etsy payouts, Faire payouts, Stripe payouts for Stall) imports with its orders, refunds, fees, chargebacks, reserves and adjustments: fees post to their mapped expense accounts, the net deposit posts to the bank account and matches the bank feed in the ledger, and the clearing account returns to zero for that payout, with any residue an assigned reconciliation case. Marketplace-facilitator orders record their tax as facilitator-collected and post no tax liability. An order with an unmapped tax rule, payment method, charge type or currency waits in the CHANNEL-001 queue with its reason and never posts with a guessed account, rate or zero tax; mapping it releases it once.

**Acceptance.**
1. For each named channel, map its tax rules and payment methods, then import a paid order with tax on lines and shipping, a shipping charge and a discount code.
2. It becomes one SALES-006 invoice whose tax equals the channel’s charged tax to the cent (not recalculated by the TAX-001 source), with shipping and discount as charge lines, paid through the mapped clearing account, and posts to QBO once as paid; replaying the webhook posts nothing more.
3. Partially refund one line on the channel: one credit note and one refund appear and each posts once.
4. Import the payout containing that order, the refund and the channel fees: fees post to their expense account, the net deposit equals the bank deposit and the clearing account returns to zero.
5. Import one order with an unmapped tax rule and one with an unmapped payment method: both wait in the CHANNEL-001 queue and nothing posts; mapping each releases exactly one invoice.
6. SALES-002 balance and AR aging exclude the paid orders throughout, and a Faire net-terms order stays open until Faire reports payment.

#### EDI-001 — Retail EDI trading partners

*Tier:* Core · *Rules:* D-3, D-4 · *Register:* R-2

**Requirement.** Pier exchanges EDI 850 purchase orders, 855 acknowledgments, 856 ASNs and 810 invoices through SPS Commerce or Orderful, preserving partner/item identifiers, pack rules, requested dates, SSCC/carton labels, acknowledgments and errors. Partner mapping, certification and chargeback-relevant exceptions are visible. Rejected or amended orders require authorized resolution. Each 850 routes to a warehouse under the partner’s SALES-007 rule, using the ship-to distribution center or store address, and reserves there. Target, Walmart and The Home Depot are the first named trading partners, each onboarded from its own specification for the 850, 855, 856 and 810 and its carton-label (GS1-128 SSCC) rules. Each partner’s document deadlines are configured from that specification: the 855 acknowledgment within the partner’s window after the 850 arrives, the 856 ship notice within its window around pickup or before arrival, and the 810 invoice after shipment. A document at risk of missing its window raises an AUTO-001 exception before the deadline, and each sent document records its transmission time, the partner’s 997 functional acknowledgment and whether it met the window. Each retailer’s own certification of Pier as a trading partner is register row R-2.

**Acceptance.**
1. Onboard a retailer through each supported transport, process an 850, return an 855, split shipment/carton ASN 856 and reconcile an 810.
2. Duplicate controls, invalid pack/SSCC and a rejected acknowledgment produce traceable partner exceptions without duplicate orders or invoices.
3. Onboard Target, Walmart and The Home Depot with their configured windows: for each, an 850 produces an 855 inside its window, the 856 for a two-carton shipment carries both cartons’ SSCCs and is sent inside its window, and the 810 equals the shipped quantities and prices.
4. Holding one 855 back raises one exception before its deadline, and each document’s record shows its sent time, 997 and on-time result.

#### SHIP-001 — US rates, labels, tracking and notifications

*Tier:* Core · *Rules:* D-3, D-4

**Requirement.** Warehouse staff compare UPS, FedEx and USPS services through ShipStation and EasyPost, using actual pack dimensions/weight, destination and promised date. They purchase/print/void labels, pack partial shipments and obtain tracking with delivery exceptions and customer notifications. Before rating, Pier validates the ship-to address through the connected provider’s address verification; a corrected address (standardized street, ZIP+4 and the residential or commercial flag rating uses) is shown beside the original, applied by an authorized user or by owner policy, and both stay on the order, while an undeliverable address blocks label purchase until resolved. When a label is bought, the customer receives the tracking number and link once, through the PRINT-001 sending path or, for a channel order, the channel’s own fulfillment notification. Shipment updates feed channels and accounting.

**Acceptance.**
1. For ShipStation and EasyPost, rate the three named carriers, buy/print a label, lose its response, recover the same label, void it and split-ship an order.
2. Tracking/delivery exceptions notify the customer once and reconcile channel fulfillment; actual dispatch consumes reservations once.
3. Rate an order whose ship-to has a misspelled street and no ZIP+4: the provider’s corrected address appears beside the original, approving it keeps both on the order, and the label prints to the corrected address; an undeliverable address blocks label purchase.
4. Buying the label sends the customer exactly one tracking message.

#### SHIP-002 — Pallet and LTL freight

*Tier:* Core · *From:* SHIP-001

**Requirement.** Pallet and less-than-truckload freight is part of the same job. Staff build a pallet manifest from packed cartons, with pallet count, weight, dimensions, NMFC freight class and accessorials (liftgate, residential, appointment, inside delivery). They request LTL quotes through a connected freight platform (Freightview or Freightquote by C.H. Robinson) or enter a carrier’s quote by hand, book the chosen carrier, print the PRINT-001 VICS bill of lading and pallet SSCC labels, and record the PRO number, pickup date and tracking. Retail-routed shipments keep the retailer’s routing instructions and the EDI-001 856 carton and pallet structure. Booking or BOL printing does not mark goods shipped; dispatch posts when pickup is confirmed. The freight invoice reconciles against the quote through BUY-004 and allocates as landed or outbound freight cost.

**Acceptance.**
1. Build a two-pallet LTL shipment with freight class and liftgate, take quotes through each named freight platform, book one, print the BOL and pallet labels and record the PRO number.
2. The order is not shipped until pickup is confirmed, dispatch then posts once, tracking updates reach the customer, and a freight invoice above the quote enters review.

#### ACCOUNT-001 — Two-way QuickBooks Online reconciliation

*Tier:* Core

**Requirement.** Connect QuickBooks Online using revocable least-privilege authorization. Map items, customers/vendors, tax/exemption codes, accounts and opening balances; exchange sales orders where supported, the SALES-006 invoices and credit notes Pier authorizes with their TAX-001 tax lines, purchase documents, bills, payments, COGS and inventory value with explicit supported-object mappings. Channel orders post as paid invoices through a payment clearing account per channel payment method, and channel payouts post fees and the net deposit that clear it (CHANNEL-002). Pier owns operational quantity and approved valuation; the ledger owns posted financial records and period locks. Two-way edits, rounding, deleted objects and closed periods create a visible reconciliation queue rather than silent overwrites or double posting.

**Acceptance.**
1. Connect a US QBO company, map a USD cutover and run purchase-to-receipt-to-bill plus quote-to-shipment-to-invoice/payment/credit, and a paid Shopify order through its clearing account to its payout deposit.
2. Compare inventory and COGS, then change a mapped object in QBO, close a period, expire authorization and replay events.
3. Each difference is either reconciled or visibly assigned, with one posting per document.

#### ACCOUNT-002 — Two-way Xero reconciliation

*Tier:* Core

**Requirement.** Xero is a supported alternative ledger, with its own item/contact, invoice/credit, purchase/bill/payment, tax, account, inventory-value and COGS mappings. Unsupported ledger-native document types retain a linked Pier source and an explicit mapping rather than disappearing. Connection health, conflict policy, period locks, reconciliation and revocation meet ACCOUNT-001; switching ledgers requires a reviewed cutoff and cannot post old history twice.

**Acceptance.**
1. Connect a US Xero organization, run the same partial purchase, shipment, return and credit journey, reconcile inventory/COGS and exercise an edited contact, locked period and revoked token.
2. A reviewed ledger switch exposes unmatched balances before enabling new posting.

#### PAY-001 — Provider-backed customer payments

*Tier:* Core

**Requirement.** Customers pay invoices through Square and a supported Stripe card/ACH connection; staff see authorized, settled, failed, refunded and disputed states and reconcile fees, deposits and partial payments to the ledger. Paid invoices are SALES-006 invoices whose tax comes from the TAX-001 source of truth. Every emailed invoice and statement carries a pay-now link (PRINT-001) for card or ACH. Payments taken by sales channels are not PAY-001 payments: they reach invoices through the channel payment-method clearing accounts and payouts in CHANNEL-002. Pier retains provider references and financial status, never raw card or bank credentials; refunds require current authorized approval.

**Acceptance.**
1. Take a partial card payment and ACH payment, observe settlement/failure, refund part of a dispatch-linked return and replay provider events.
2. Customer balance, provider settlement/fees, tax and ledger reconcile exactly; denied refunds and revoked connections have no financial effect.
3. Pay one invoice through its emailed pay-now link: the payment applies to that invoice once and the link stops accepting payment.

#### SYNC-001 — Visible integration health and safe recovery

*Tier:* Core · *Cites:* BASE-OPS-003, BASE-OPS-004 · *Rules:* D-3

**Requirement.** Every connector shows connection scope, last successful sync, lag, cursor, document mapping and pending/failed/uncertain effects. Authenticated signed events, durable external identities and reconciliation prevent duplicate stock, spend, labels or accounting postings. Bounded retries are allowed only when the effect is known safe; uncertain consequential sends wait for provider reconciliation or a human decision. Revocation stops future work, stale events cannot overwrite newer versions and operators can inspect/replay a resolved item with an audit trail.

**Acceptance.**
1. At the public integration door, send a bad signature, duplicate and stale event; interrupt after provider acceptance but before local receipt; revoke the connector and restart.
2. The queue retains truthful state and reconciliation recovers one effect without leaking secrets or executing after revocation.

#### THIRDPL-001 — 3PL fulfillment and daily stock reconciliation

*Tier:* Core · *Rules:* D-2

**Requirement.** Connect ShipHero and Extensiv 3PL for warehouse item mapping, fulfillment requests, acknowledgments, shipment/return updates and daily stock snapshots. Distinguish provider-held, reserved, damaged, transit and available quantities. Variances become assigned cases linked to both histories; provider snapshots do not overwrite the stock ledger. Reviewed physical adjustments and channel corrections close only after subsequent snapshots and ledger sync reconcile.

**Acceptance.**
1. Send an order to each supported 3PL, receive partial tracking and a mismatched daily stock snapshot, investigate and approve a correction, then compare the next snapshot and channel/ledger totals.
2. Duplicate and delayed updates never create stock or close an unresolved difference.


### API, automation and documents

#### API-001 — Documented authenticated stock commands

*Tier:* Core

**Requirement.** Custom clients use a documented authenticated HTTP API for stock definitions, orders, purchasing, warehouse operations, proposal preparation and exports. The same current-role, exact-version, decimal and durable-command rules apply as in the UI; a custom client cannot bypass approvals by calling a lower-level command. The incremental stock source and its checkpoint rules are in [the contract mechanism notes](docs/contract/mechanism.md#api-001).

**Acceptance.**
1. Use API.md to authenticate, read state, create and reserve an order, repeat the command and attempt a stale/unauthorized mutation.
2. Responses expose the durable result and public errors without duplicate business effects.

#### API-002 — Webhooks and Zapier automation

*Tier:* Core

**Requirement.** Owners subscribe permission-scoped signed webhooks and Zapier triggers/actions for stock, orders, shipments, PO exceptions and reconciliation outcomes. Versioned payloads retain event identity and source links; secrets rotate and connections revoke. Owners preview actions and choose allowed fields, destinations and spend/stock permissions. Delivery failures remain inspectable; a Zap never records a person’s approval of a purchase or impersonates a physical receipt.

**Acceptance.**
1. Create a Zapier low-stock workflow and signed order webhook, rotate the secret, duplicate an action and revoke the subscriber.
2. One authorized draft is created, failures remain visible and a revoked or over-scoped action is refused.

#### AUTO-001 — Follow exceptions until their work closes

*Tier:* Core · *Rules:* D-3 · *Register:* R-7

**Requirement.** Scheduled low-stock, reorder, overdue PO, unconfirmed supplier, late customer order, tracking, count and integration checks create assigned exceptions with due dates, next actions and escalation. Email, Slack and WhatsApp notifications use owner-approved destinations, message content and quiet hours; scheduled reports and reminders deduplicate and stop on resolution. Closure links the approved promise, actual receipt/shipment and reconciled ledger, or an authorized documented cancellation. The low-stock check uses the BUY-005 trigger and position. It raises one exception per SKU-location the reorder list shows, linked to the reorder line and to any PO draft created from it. The exception stays open while the only cover is an uncommitted PO draft, and it closes when committed supply or a receipt lifts the position above the reorder point (the moment the line leaves the reorder list), or when a buyer documents a decision not to reorder. A slow-mover check flags, before the REPORT-002 dead-stock threshold is reached, each SKU-location with stock on hand and no sale shipment, kit consumption or transfer out within an owner-set warning period (default 90 days): one exception showing on-hand value, last-movement date and days left until it becomes dead stock, closing when the stock sells or moves or a buyer records a decision. A live WhatsApp Business sender is register row R-7.

**Acceptance.**
1. Allow a PO confirmation and customer delivery to become overdue, deliver notifications through each named service, escalate an unanswered task and resolve the supply/shipment/ledger mismatch.
2. Recurring checks neither spam nor hide unresolved work; closure and its evidence remain visible after restart.
3. In the BUY-005 scenario, the low-stock check raises exactly one exception for each of A, B, C and E at its location and none for D; a rerun raises no duplicates; committing B’s PO closes B’s exception, and A’s stays open while its PO is still a draft.
4. In the REPORT-002 scenario with a 90-day warning and the 180-day dead-stock threshold, the slow-mover check raises exactly one exception for each SKU-location with no qualifying movement in 90 days, with its value and last-movement date and none for any other, a rerun adds none, and a sale of one closes its exception.

#### AUTO-002 — Controlled workflow rules

*Tier:* Core · *Cites:* BASE-OPS-004

**Requirement.** Owners configure versioned rules for inventory checks, draft POs, allocation/routing, approvals, reminders and reports, with dry-run previews, budgets, warehouse scope, pause and kill controls. Automatic approval applies only to explicitly authorized bounded policies with separation of duties; policy changes cannot legitimize an already stale document. Each background job has durable pending/running/failed/uncertain/resolved outcomes, and exhaustion or worker loss escalates visibly. Rule revisions are pinned, an edit pauses the rule, generated POs retain the rule identity and a draft mark, and a draft rule grants no purchase approval or outbound send (RL-5).

**Acceptance.**
1. Preview a rule, enable a bounded replenishment policy, cross its budget/vendor limit, lose a worker and pause the rule.
2. Within-policy work follows its authorized path once; excess/stale work waits for a human and no background failure disappears.

#### DOC-001 — Evidence documents and order extraction

*Tier:* Core · *Cites:* BASE-INPUT-003 · *Register:* R-8

**Requirement.** Authorized staff attach supplier/customer PDFs, images, invoices, BOLs and correspondence to records; preserve originals, hashes, access and retention. Email/PDF extraction maps customer and supplier item codes, quantities, packs, dates and prices into a reviewable draft with source-page citations and ambiguity flags. Uploaded content is untrusted data and never instruction authority. Extraction only prepares a cited draft and never commits an order, payment or stock write itself; a draft becomes an order only through the ordinary order command, and an agent’s call to that command carries its class under the company’s policy. Only the owner retains and downloads originals and reviews inbox mail. Each extraction separately consents to sending the entire original, per original or per batch, to the fixed OpenAI Responses destination and selected exact model, and consent can be revoked. Signed inbound mail never grants identity, is never associated with a record automatically and never starts a business action; originals remain retained until DATA-001/002 supplies its governed archive/erasure doors, and SEC-002 inherits the wider attachment/egress obligation (RL-7). A live receiving-domain receipt is register row R-8.

**Acceptance.**
1. Upload and email a multi-page order containing ambiguous packs and hostile instructions, review cited extraction and approve the corrected draft.
2. Duplicate documents are identified, unauthorized download and unsafe upload are refused, and no financial/stock effect occurs before approval.

### Move-in and history

#### MIGRATE-001 — Switch from supported inventory systems

*Tier:* Core

**Requirement.** Guided adapters import exports and API data from supported inventory systems, plus inventory and planning exports from supported planning systems and researched inventory surfaces where a buyer uses them. Preserve source IDs and untouched artifacts; map variants, units, barcodes, warehouses and bins, parties, terms, prices, lots and serials, USD costs, opening stock and valuation, open sales and PO lines, exact allocations and backorders, expected dates, credits, reorder parameters (reorder points, reorder quantities or maximums, default suppliers) for BUY-005, channel and routing settings for SALES-007, sales reps, and the sales, purchase and consumption history defined in MIGRATE-002. Opening FIFO cost layers keep the incumbent’s original receipt date and unit cost per layer where the source exports them including FIFO cost layers and FIFO receipts. Otherwise the opening layer is dated at cutover and labeled as such. REPORT-002 aging therefore reflects true stock age from day one wherever the source allows it. Every unsupported object or field is listed with a linked retained archive, never silently dropped. Manufacturing records are handed to Larder.

**Acceptance.**
1. For each supported source, stage an authorized representative export, review row and field mappings and rejected and unmapped objects, and reconcile quantities by unit/bin/status, USD valuation and open documents against source totals and QBO or Xero.
2. Freeze a cutoff, handle the final delta, approve once and replay without duplicate openings; keep the former system read-only until differences are accepted.
3. Opening layers from a source inventory export with FIFO layers received 20, 100 and 400 days before cutover age in REPORT-002 by those dates, and a source without layer dates shows the cutover date with its label.
4. Reorder parameters imported from the source produce the same reorder list on cutover day as the incumbent’s, or each difference is listed with its cause.

#### MIGRATE-002 — Sales, purchase and consumption history at cutover

*Tier:* Core

**Requirement.** A switching buyer keeps the history their planning and reports depend on, including historical sales imports and channel backfill. From each supported source, Pier imports at least the 24 months before cutover (all available history when the owner asks), using the source’s API or exports: sale and purchase lists, the Sale Tasks CSV and stock movement history; sales and purchase order history; inventory history; and sales-history exports from supported planning systems. The history covers shipped sales lines with order and invoice number, customer, channel and channel order ID, ship-from location, ship date, SKU, quantity in base units, net unit price after discounts, currency, unit cost (COGS) and sales rep; customer credit notes and returns, as negative lines linked to their sale; purchase receipts with supplier, location, PO number, ordered, promised and received dates, SKU, quantity and unit cost; kit and assembly consumption of components, and transfers out; and month-end inventory quantity and value by SKU and location. Every record keeps its source ID and is marked imported. History is reporting and planning data only: it creates no stock movement, reservation, cost layer, invoice, payment, tax transaction, ledger posting, supplier message or customer message. History lines map through the MIGRATE-001 mappings. A discontinued SKU or departed customer comes across as an archived record. Lines that cannot be mapped are listed and retained with their source rows, never dropped. Imports are idempotent by source ID, so a replay or a final-delta import adds only new records. CHANNEL-001 backfill deduplicates against this history by channel order ID, and where the incumbent did not keep that ID, by channel, date, customer and total, with uncertain matches sent to review. On cutover day the history feeds BUY-001 and AGENT-002 velocity and forecasting, BUY-005 days of cover, REPORT-002 sales, margin, dead stock, turnover and purchasing, SALES-002 customer history, SALES-005 reorder history and BUY-004 supplier scorecards.

**Acceptance.**
1. From a representative source inventory export holding 24 months of sales (with credit notes and some Shopify orders), purchase receipts, kit assembly and month-end valuation, import the history and connect Shopify for its 12-month backfill.
2. On cutover day, BUY-001 average daily sales, days of cover and velocity-based suggestions for named SKUs equal an independent calculation from the same history.
3. For the prior 12 months, REPORT-002 dead stock (90 days), sales by customer and by SKU, gross margin and turnover match the incumbent’s own reports for the same period, or list each difference with its cause.
4. A SKU last sold 30 days before cutover is not dead stock.
5. BUY-004 on-time rates reproduce from the imported receipts.
6. Stock positions, reservations, cost layers and the QBO company are unchanged by the import, and no customer or supplier receives a message.
7. The Shopify backfill adds no order already imported from the source inventory system, and replaying the history import adds nothing.
8. Repeat with representative exports from every supported source inventory system.


### Authority, security, data and operation

#### ADMIN-001 — Role and warehouse permissions

*Tier:* Core · *Cites:* BASE-ROLE-001, BASE-ACCESS-002

**Requirement.** Owners invite, revoke and assign owner, purchasing, sales, warehouse, finance, viewer and scoped-agent authority, including warehouse and location, customer-sensitive pricing, cost visibility and approval limits. Invitations and restored audit identities do not confer active access. Warehouse grants name permitted warehouses and optionally exact locations, are audited, may expire at an explicit UTC instant, and can be revoked immediately. A scoped physical reader receives no costs, prices or customer data; an empty warehouse grant permits no physical operation. ADMIN-001 owns the commercial custody boundary once (RL-101): unqualified commercial, customer and financial data and arbitrary field-bearing data (customer profiles, contacts, addresses, terms, representatives, receivables, financial exports, arbitrary typed-field content and field-bearing retained documents) stay owner-only, while explicit current warehouse and location grants authorize only finite physical projections and operations; role, cost and price restrictions and current-result authority are checked at atomic admission, and a physical grant never implies sales, finance, originals or egress authority. Explicit scoped sales, accountant, customer and typed-field delegation remains required work. New record, connector, model and document doors inherit current authority and explicit egress obligations before shipping. The current role semantics are in [the contract mechanism notes](docs/contract/mechanism.md#admin-001).

**Acceptance.**
1. Invite staff for two warehouses, restrict cost visibility, attempt foreign warehouse reads/exports and stock writes, revoke a session/role while a command is prepared and retry.
2. No forbidden data or partial stock/document/result write escapes admission.

#### ADMIN-002 — SSO, provider outages and service credentials

*Tier:* Core · *Cites:* BASE-ACCESS-001, BASE-SIGNIN-001, BASE-AGENT-004 · *Register:* R-3

**Requirement.** Organizations can require two-factor authentication and SSO through US-used identity providers such as Google Workspace and Microsoft Entra ID. Owners manage recovery, session/device revocation and deprovisioning without turning a provider outage into public access or granting imported identities authority. Service credentials are separately scoped, rotated and revocable. Sign-in through real Google Workspace and Microsoft Entra ID tenants is register row R-3.

**Acceptance.**
1. Require 2FA, enroll staff, sign in through each supported SSO provider, deprovision a user and revoke a service credential.
2. Existing and new private reads/writes fail after revocation; recovery requires an audited owner-controlled path.

#### ADMIN-003 — Native factor administration and owner recovery

*Tier:* Core · *From:* ADMIN-002 · *Cites:* BASE-SIGNIN-002, BASE-ACCESS-002

**Requirement.** Requiring two-factor authentication, resetting another operator’s factor, revoking sessions and deprovisioning local users require a current native owner session with verified second-factor assurance. Live recovery of an owner’s lost factor requires a different assured native owner. Ordinary sign-in and imported identities are not recovery grants. Recovery invalidates the target’s old factor and session assurance; required private access resumes only after fresh enrollment and verification. Restore excludes factor secrets and session proofs, preserves the authentication requirement and pauses enrollment until explicit audited fresh native owner recovery. That recovery reopens enrollment without itself granting private access, and restored historical identities confer no authority. Onboarding must explain the loss-of-all-assured-owners limit and support preparing another assured native owner. Owner-only administration is interim, not the completed scope: owner-issued, revocable and expiring grants to named assured human administrators must support factor reset, session revocation and local deprovisioning for explicitly named non-owner users or bounded warehouse teams. Such grants confer no business permissions, live self-recovery, owner recovery, delegation management or authority to change organization authentication policy (RL-6).

**Acceptance.**
1. Exercise an assured owner requiring 2FA, resetting another operator’s factor, revoking existing sessions and deprovisioning a local user; assert the audit actor, target and outcome.
2. Refuse these administrative operations without a current assured native owner session, for an unassured owner, an ordinary member and an agent, which never supplies a person’s second factor, and refuse live owner self-recovery or recovery without another assured native owner.
3. Assert that recovery invalidates old factors and session assurance and that required private access remains refused until fresh enrollment and verification.
4. Restore an archive with required 2FA and assert absent factors and proofs, preserved enforcement, refused enrollment until explicit fresh native owner recovery, and refused private access until fresh factor verification.
5. Exercise permitted administration under a scoped human grant and refuse foreign targets, owner targets, live self-recovery and organization-policy changes.
6. Revocation or expiry must refuse a prepared delegated operation without changing authority, stock, documents or a successful command result.

#### SEC-001 — Atomic stock authority and exact arithmetic

*Tier:* Core · *From:* SEC-001, BASE-001 · *Cites:* BASE-ACCESS-004, BASE-INPUT-001

**Requirement.** Every consequential native write checks the active session, actor, current edition role and exact approved version within atomic SQL admission. Quantities and unit prices use decimal text within six fractional places and receipt totals retain twelve; invalid precision/range/conversion fails before mutation. Durable command identities recover identical requests and reject changed payload reuse. Operational movements are append-only and corrections link compensating entries. Pier’s exact append-only stock model and domain commands replace a generic editable-record interface, and agents use those same commands. The narrowly scoped safe import undo in PIER-003 can remove its own unused import graph while retaining custody; no generic record edit or agent instruction bypasses admission.

**Acceptance.**
1. Through authenticated HTTP, reuse a command ID with changed content, submit invalid decimals, revoke a prepared actor and race a stale approval.
2. Each refusal leaves no movement, reservation, document or successful command result; an identical retry returns its original outcome.
3. Attempt a generic edit that would bypass stock admission and verify refusal.

#### SEC-002 — Private data, safe input and declared egress

*Tier:* Core · *Cites:* BASE-INPUT-002, BASE-SECRET-001, BASE-DATA-004, BASE-DATA-005

**Requirement.** Private records, documents and exports require current authority; browser mutations enforce origin/session protections. Imports and attachments are bounded, secrets are encrypted under installation-local custody, and provider tokens never enter exports or agent prompts. Owners explicitly authorize each external connection, field scope and model/document destination and can revoke it. Native stock work stays usable without a model, channel or author service. SEC-002 owns the connection and egress delta for commercial data whose custody ADMIN-001 sets (RL-101), and the full-original model disclosure rule of DOC-001 stays in force (RL-7).

**Acceptance.**
1. Run the native stock journey without external accounts, submit hostile text/CSV/attachments and cross-origin commands, inspect exported records/logs and deny unintended outbound requests.
2. Then enable one connector/model under explicit scope and revoke it: only approved fields leave and secrets remain absent.

#### DATA-001 — Complete portable archive and inactive restore

*Tier:* Core · *Cites:* BASE-DATA-001, BASE-BACKUP-001

**Requirement.** Owners export all business definitions, movements, reservations, documents/cost layers, source originals, approvals, automation and integration histories, mappings, audit and erasure journal in a versioned integrity-checked archive. Empty-target transactional restore preserves historical identity but imports no active sessions, credentials, provider authority or pending external sends. Connectors/jobs restart paused until the receiving owner reauthorizes; no restored event replays a PO, label, refund or stock opening. CSV/native exit remains a separate reviewed cutover with explicitly listed omissions.

**Acceptance.**
1. Export a populated installation, corrupt a copy and attempt restore, then restore the valid archive into a fresh installation.
2. Compare complete records/source bytes and history, establish fresh owner authority and reconnect deliberately; no outbound effect or duplicate opening occurs.

#### DATA-002 — Erasure, retention and legal holds

*Tier:* Core · *Cites:* BASE-DATA-002, BASE-DATA-003, BASE-DATA-006

**Requirement.** Owners inspect retention and request deletion/anonymization of customer, supplier, operator and attachment data with dependency previews and legal/accounting holds. Erasure removes private originals, derived extraction, searchable copies, tokens and queued sends or explains a lawful retained minimum; permanent stock/accounting evidence is anonymized where required. A later erasure journal fences older archives; offline copies and already delivered external messages are honestly reported as beyond local deletion. DATA-002 owns the erasure and retention authority rule once (RL-102): the current owner erases only after an exact dependency preview and an explicit audited confirmation, with hold priority, cancellation of local sends, revocation of access and durable content-free receipts and restore journals; only justified opaque stock and accounting evidence is retained; unsupported destructive scope (import, sales-file, EDI and channel custody, immutable personal audit or movement content, holds and unresolved remote work) is refused explicitly, and complete erasure is never claimed while immutable personal or external copies remain unresolved. Complete subject erasure for those dependencies, and remote-copy confirmation, remain required work.

**Acceptance.**
1. Request erasure of a customer with shipments, attachments and queued notifications, review holds, complete allowed deletion and inspect search, exports, audit and queued work.
2. Restore an old archive with the later journal; erased private data must not reappear or trigger sends.

#### AUDIT-001 — Durable human and automated accountability

*Tier:* Core · *Cites:* BASE-OPS-005, BASE-AUDIT-001

**Requirement.** Authorized people trace every consequential decision, approval, destructive action and automated attempt/outcome to actor or rule, exact version, source evidence, command/provider identities and correction links. Activity records every scan with its device, user, scanned code, what it resolved to (SKU, pack, bin, lot) and outcome (accepted, refused or linked); every record edit with its before and after values; and every connector sync with its connector, direction, records affected, external IDs and outcome. Each is filterable by item, document, user and connector and included in export. Erasure authority and retention follow DATA-002 (RL-102); AUDIT-001 owns append-only redacted attribution and outcome provenance, including complete sensitive-edit schemas and provider crash and refund outcomes.

**Acceptance.**
1. Follow a changed purchase approval, failed label send, refund, count correction and erasure through Activity and export after restart.
2. History retains who/what authorized each outcome and no deleted personal content or secret remains in the audit.
3. After a scanned receipt, a refused wrong-SKU scan, an item edit and a Shopify stock sync, Activity shows each with its device or connector, user, before/after values or affected records and outcome, filtering by that item returns all four, and the export holds the same entries.

#### UX-001 — Usable desktop and mobile operations

*Tier:* Core · *Cites:* BASE-PUBLIC-003, BASE-ACCESSIBILITY-001 · *Rules:* D-1 · *Register:* R-4, R-5

**Requirement.** All buyer journeys, reports, reviews and exceptions keep D-1 and Base’s accessibility bar, with textual stock, status and freshness rather than color alone. Network/provider failure preserves entered work and truthful pending/unknown states; busy actions prevent accidental duplicates. Search, saved filters, drill-through and pick lists meet the SCALE-001 bounds on the named PIER-SCALE-1 fixture, and the measured figures are recorded with this clause’s evidence. A human screen-reader pass and a VPAT are register rows R-4 and R-5.

**Acceptance.**
1. On PIER-SCALE-1, complete receive-to-ship, a stale approval, a return, an exception and report drill-through at both widths using keyboard and phone controls.
2. Interrupt a request and refresh: the exact action is recoverable, errors persist and no color-only or invented stock state appears.

#### SCALE-001 — Measured performance at wholesale volume

*Tier:* Core

**Requirement.** Pier defines a named wholesale scale fixture, PIER-SCALE-1, built only through public commands and imports: 3 warehouses with 600 bins, 10,000 SKUs including 2,500 variants and 100 kits, 2,000 customers, 200 suppliers, 1,000 open sales orders with 6,000 open lines, 300 open POs with 1,500 lines, and 12 months of history holding 500,000 stock movements, 60,000 shipments and 50,000 invoices. The reference deployment is named so the figures can be reproduced: Pier’s Cloudflare Worker on the Workers Paid plan (Standard usage model) with one D1 database whose primary location is in North America, measured from a browser client in the continental US on a wired connection, with the Worker and D1 limits, client location, browser and device recorded with the results. On that fixture and that reference deployment, at the 95th percentile: SKU, barcode, alias and customer search returns in under 1 second; the first page of a filtered stock, sales or valuation report in under 3 seconds; drill-through from a report figure to its source documents in under 1 second; a 50-order pick list in under 2 seconds; and a scan-to-confirmation step in under 500 milliseconds. Full exports run as background jobs with visible progress. Pier sets no per-plan cap on orders, SKUs or users. The capacity disclosed in OPS-001 and REPORT-001 is the envelope measured on this fixture, republished when it changes. Work beyond the envelope is admitted with a stated slowdown and is never silently truncated.

**Acceptance.**
1. Generate PIER-SCALE-1 through public commands, then run search, three filtered reports with drill-through, a 50-order pick list, a scanned pick and a full movement export at 1440px and 390px.
2. Record the fixture counts, the reference-deployment details and the measured p95 timings in the UX-001 evidence: each meets its stated bound, no result is truncated without notice, and the capacity shown in OPS-001 and REPORT-001 equals the figure measured on this fixture.

#### OPS-001 — Owned operation, health and onboarding

*Tier:* Core · *Cites:* BASE-INSTALL-001, BASE-OPS-001, BASE-OPS-002, BASE-BACKUP-001

**Requirement.** Installations start with empty real business state. Repeat setup preserves owner, business data and private settings. Health readiness never reports invented balances, and operators can diagnose provider failures. Onboarding names the next required connection/cutover action and unresolved differences, with documented recovery and support paths, bounded job/compute/storage limits, the SCALE-001 measured capacity and prices visible before commitment. Owners run Pier on their own computer or their own server: on a computer with only Node.js installed, the one line `npx -y @runeditrun/rer dev just-every/run-pier` clones Pier, installs it, sets up a local owner and starts it with empty business state, and `rer deploy` runs the same checkout on the owner’s own Cloudflare account.

**Acceptance.**
1. Install and set up twice, enter real-shaped business data through public commands, restart, back up and restore; inspect health with a failed dependency and follow cutover/connector diagnostics.
2. No demo stock, hidden reset, lost settings or false healthy state appears.
3. On fresh macOS, Linux and Windows machines with only Node.js, run the one-line start: Pier opens at its local address with a local owner, empty stock and no demo data.
4. Deploy the same checkout with `rer deploy` to an owner’s Cloudflare account, sign in there and complete a receipt.

#### OPEN-001 — Free and open source under the MIT license

*Tier:* Core · *Cites:* BASE-INSTALL-001, BASE-DATA-005

**Requirement.** Pier is free and open source under the MIT license: the source repository and the package declare MIT, and anyone may run, modify and redistribute it. Every capability in this contract is available in the open-source product with no license key, seat or plan cap, paid gate or upgrade prompt from Pier’s authors (SCALE-001 sets no per-plan cap). Paid third-party services a buyer connects (carriers, ShipStation or EasyPost, SPS Commerce or Orderful, QuickBooks Online or Xero, Avalara, payment providers, 3PLs and hosting) are billed by those providers, and Pier names that provider cost before the connection is enabled. “Every capability is available in the open-source product” means that no implemented capability carries a commercial gate, author fee or usage cap and that provider costs are disclosed; it does not claim that other clauses are complete, and each keeps its own status, so this proof changes no other clause’s status. Pier replaces the supported source inventory systems through MIGRATE-001; it is not affiliated with them.

**Acceptance.**
1. Verify the repository’s `LICENSE` is the MIT license and `package.json` declares MIT; install from the public source with no account or key from Pier’s authors and reach every product area with three warehouses and 25 staff without a payment, upgrade or license prompt; begin enabling a paid provider connection and verify its cost is shown as that provider’s before activation.


### Agent surface

**Specialist: Inventory controller.** It keeps a wholesaler's stock right and moving: it plans and places purchase orders, follows suppliers and customer promises, keeps channels and books reconciled and prepares cutovers, acting for the person who sponsors it.

Inherits BASE-AGENT-001 to BASE-AGENT-013. The company's policy decides every call; this section presets none.

**How Pier computes each class.**
- *standard*: stock movements recorded from physical events (receipts, transfers, picks, packs, dispatches, returns, counts and their linked corrections), drafts, staged imports, proposals, routing and rule edits, reads and reports; each is withdrawn or corrected in the product by a linked command. Facts: the item count and the warehouses touched.
- *money*: committing a PO, applying a supplier price or quantity change, approving a supplier bill or credit, authorizing, crediting or voiding a customer invoice, a refund, a payment link, a write-off and a label purchase. Facts: the amount in USD and its source currency, and the counterparty, *known* for a supplier, customer or carrier on record and *new* otherwise.
- *commitment*: committing or sending a PO, sending a priced quote and returning an EDI 855 acknowledgment. Facts: the value and the counterparty.
- *external*: anything that reaches someone outside the company: supplier and customer mail, channel stock publication, EDI documents, ledger postings, trade-buyer grants, webhooks and a document original sent to the model provider. Facts: the recipient count and the counterparty, *known* for a party, channel, partner or ledger on record and *new* otherwise.
- *access*: staff roles, warehouse and location grants and trade-buyer grants. Facts: the people and whether the grant widens or narrows.
- *security*: the two-factor requirement, factor resets, session revocation, service, connector and webhook credentials.
- *destructive*: erasure and an import undo that removes an imported graph. Facts: the item count.
- *gated*: connecting a channel, ledger, payment or identity provider, where the provider keeps the consent step for a person signed in to the company's own account at that provider. Facts: the provider and the step.

| Tool | Does | Core clauses | Risk class | Today |
| --- | --- | --- | --- | --- |
| `pier.catalog.update` | Items, variants, units, barcodes, kits, custom fields and locations | PIER-001, CAT-001, CAT-002, KIT-001 | standard | none |
| `pier.parties.update` | Customers, suppliers, terms, representatives and split policy | PIER-002, SALES-002 | standard | none |
| `pier.stock.read` | Stock positions, traces, availability-to-promise and reports | STOCK-001, TRACE-001, SALES-003, REPORT-001, REPORT-002, REPORT-003 | standard | none |
| `pier.imports.stage` | Stage, review and revise native or incumbent imports and history | PIER-003, MIGRATE-001, MIGRATE-002 | standard | none |
| `pier.imports.commit` | Commit or undo a reviewed cutover | PIER-003, MIGRATE-001 | standard or destructive | none |
| `pier.orders.create` | Create, import and reserve sales orders and recurring schedules | PIER-004, SALES-008, SALES-004 | standard | none |
| `pier.orders.cancel` | Cancel unshipped demand | PIER-010 | standard | none |
| `pier.quotes.send` | Version, price, send and convert quotes | SALES-001 | standard or external (+ commitment) | none |
| `pier.routing.update` | Routing rules, dry runs and reroutes | SALES-007, SALES-010, SALES-011 | standard | none |
| `pier.trade.grant` | Grant trade buyers catalog, price and history access | SALES-005 | access · external | none |
| `pier.followups.configure` | Abandoned-cart reminder controls and consent | SALES-009 | external | none |
| `pier.invoices.authorize` | Draft, authorize, credit and void customer invoices | SALES-006, TAX-001, CHANNEL-002 | money | none |
| `pier.documents.send` | Generate and email business documents | PRINT-001 | standard or external | none |
| `pier.purchasing.plan` | Plan replenishment and prepare PO drafts | BUY-001, BUY-005, BUY-008, AGENT-002 | standard | `proposal.prepare` |
| `pier.purchasing.commit` | Commit an exact approved PO | PIER-005, BUY-002 | money · commitment | none |
| `pier.purchasing.send` | Send a committed PO and chase confirmations | BUY-006, AGENT-003 | external · commitment | `po.sendApproved` |
| `pier.purchasing.review_change` | Apply a supplier change or cancellation | BUY-007 | standard or money | none |
| `pier.receiving.post` | Receive, correct and reverse receipts | PIER-006, PIER-007 | standard | none |
| `pier.supplier_returns.manage` | Supplier returns, credits and replacements | BUY-003 | standard or money (+ external) | none |
| `pier.bills.match` | Match and approve supplier invoices; read scorecards | BUY-004 | standard or money | none |
| `pier.transfers.manage` | Dispatch and receive transfers | PIER-008 | standard | none |
| `pier.dispatch.post` | Dispatch reserved lines and run the dispatch board | PIER-009, WMS-003 | standard | none |
| `pier.returns.manage` | Customer returns, inspection and restock | PIER-010 | standard or money | none |
| `pier.counts.manage` | Capture, record and approve counts and stocktakes | PIER-011, COUNT-001 | standard | none |
| `pier.slotting.plan` | Location policies, replenishment and slotting tasks | WMS-002 | standard | none |
| `pier.costing.update` | Costing method, landed cost and write-off reasons | COST-001, COST-002 | standard or money | none |
| `pier.channels.connect` | Connect, map and backfill sales channels | CHANNEL-001, CHANNEL-004, CHANNEL-005, CHANNEL-006 | security · gated (+ external) | none |
| `pier.channels.publish` | Publish stock and holds to channels | CHANNEL-003 | external | none |
| `pier.edi.exchange` | Process 850s and send 855, 856 and 810 documents | EDI-001 | external (+ commitment) | none |
| `pier.shipping.label` | Rate, buy and void labels, book freight and notify | SHIP-001, SHIP-002 | standard or money · external | none |
| `pier.books.sync` | Map and post to QuickBooks Online, Xero or Pantry | ACCOUNT-001, ACCOUNT-002 | external (+ money) | none |
| `pier.payments.manage` | Payment links and refunds | PAY-001 | money (+ external) | none |
| `pier.connections.status` | Connector health, queue and replay | SYNC-001 | standard or external | none |
| `pier.threepl.fulfill` | Send fulfillment requests and reconcile 3PL snapshots | THIRDPL-001 | external | none |
| `pier.webhooks.manage` | Webhook and Zapier subscriptions | API-002 | security (+ external) | none |
| `pier.exceptions.manage` | Assign, escalate and close exception cases | AUTO-001 | standard (+ external) | none |
| `pier.rules.configure` | Workflow rules, dry runs and pause | AUTO-002 | standard | none |
| `pier.documents.extract` | Attach originals and extract cited drafts | DOC-001 | standard (+ external) | none |
| `pier.access.grant` | Staff roles and warehouse grants | ADMIN-001 | access | none |
| `pier.security.manage` | Two-factor requirement, factor resets, sessions and service credentials | ADMIN-002, ADMIN-003 | security (+ access) | none |
| `pier.privacy.erase` | Retention, holds and erasure | DATA-002, CAT-003 | destructive | none |
| `pier.archive.export` | Export a complete archive | DATA-001, PIER-012 | standard | none |
| `pier.activity.read` | Activity and audit | AUDIT-001 | standard | none |
| `pier.questions.ask` | Live questions and bulk reviews | AGENT-006 | standard | `itemAgent.bulkPreview` |
| `pier.proposals.prepare` | Prepare evidence-backed proposals | AGENT-001, AGENT-004, AGENT-005 | standard | `proposal.prepare` |

**Resources.** `pier://items/{item}`, `pier://locations/{location}`, `pier://parties/{party}`, `pier://orders/{order}`, `pier://purchase-orders/{po}`, `pier://receipts/{receipt}`, `pier://shipments/{shipment}`, `pier://counts/{count}`, `pier://invoices/{invoice}`, `pier://imports/{batch}`, `pier://exceptions/{case}`, `pier://reports/{report}`. **Events.** `stock.changed`, `order.reserved`, `order.backordered`, `po.committed`, `po.sent`, `po.confirmed`, `receipt.posted`, `shipment.dispatched`, `count.approved`, `invoice.authorized`, `channel.lagging`, `exception.opened`, `exception.closed`, `approval.pending`, `approval.decided`, `review.flagged`, `policy.adopted`. **Prompts.** `replenish_stock` (BUY-001, BUY-005, AGENT-002), `chase_suppliers` (AGENT-003), `repair_oversell` (AGENT-004), `prove_cutover` (AGENT-005), `answer_stock_question` (AGENT-006).

**Not tools, and why.** SCAN-001, SCAN-002, WMS-001, WMS-004 and WMS-005 (scan-driven floor work runs on a warehouse device), UX-001 (a person's own screen), SEC-001 and API-001 (the command door itself), SEC-002, SCALE-001, OPS-001 and OPEN-001 (installation facts).

**Limits.** Capacity limits only: request rate, body, import and attachment sizes and page sizes, documented on `/docs/agents`. Thresholds on money moved, recipients and items, and provider spend caps, are the company's policy.

**Handoffs.** Listens for Stall `cart.abandoned` and `order.paid`, Larder `receipt.ready` and Pantry `payment.applied`. Emits `stock.changed`, `po.committed`, `receipt.posted` and `shipment.dispatched` for the Bookkeeper (Pantry), storefront (Stall) and production (Larder) specialists.

#### SURFACE-001 — The registry equals this table and the Base harness passes

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-001, BASE-AGENT-002, BASE-AGENT-003, BASE-AGENT-010, BASE-AGENT-012, BASE-AGENT-013

**Requirement.** Pier serves the Base MCP door at `/mcp` with the tools, resources, events and prompts in this section, each tool calling the same domain command the product UI calls, so Pier's durable command identity is the idempotency key and the exact record version is the expected revision. The existing proposal, item-agent and approved-send doors move onto that door under their table names.

**Acceptance.**
1. `tools/list` names exactly the tools in the table, each with its declared classes in `_meta`, and their Core clause ids plus the not-a-tool reasons cover every Core clause.
2. A tool call and the UI action on the same fixture give the same record state, the same audit event and the same refusal code.
3. The Base conformance harness runs BASE-AGENT-001 to BASE-AGENT-013 on Pier's seeded wholesaler under the all-autonomous and the held policies, and passes.

#### SURFACE-002 — Stock work is standard and erasure or undo is destructive

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006, BASE-AGENT-007 · *Rules:* D-2

**Requirement.** Pier's classifier computes the class of each stock, import and privacy call from its arguments and current records, never from the agent's or the record's own claims, and supplies the item count and warehouses as facts.

**Acceptance.**
1. Receipt, transfer, dispatch, return and count calls carry standard, with their item count and warehouses.
2. An import undo that removes an imported graph and an erasure call carry destructive, with their item count.
3. A proposal or forecast call carries standard and changes no stock, reservation or count.

#### SURFACE-003 — Purchasing calls carry money, commitment and external

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006, BASE-AGENT-008

**Requirement.** Purchasing calls carry their classes with server-computed facts: a PO's committed landed amount in USD and source currency, the supplier as counterparty and the recipient of a send.

**Acceptance.**
1. Committing a PO carries money · commitment with its USD landed amount and a *known* supplier, and a supplier never seen before reads *new*.
2. Sending a committed PO carries external · commitment with its recipient count.
3. Applying a supplier price or quantity change carries money with the changed amount; a date-only change carries standard.
4. An approval recorded with an agent's credential is refused, and an agent's commit reads "<agent> for <person>" in Activity and export, never as the buyer's approval.

#### SURFACE-004 — Sales, invoice and shipping calls carry money and external

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Sales calls carry their classes with server-computed facts: amounts in USD and source currency, the customer or carrier as counterparty and the recipients of a message.

**Acceptance.**
1. Authorizing, crediting or voiding a customer invoice, a refund and a payment link carry money with the amount and customer.
2. Sending a priced quote carries external with commitment added, and drafting one carries standard.
3. Buying a label carries money · external with the postage amount and carrier.
4. A reminder or document sent to a customer carries external with its recipient count.

#### SURFACE-005 — Connections are gated and publication is external

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Connecting a channel, ledger, payment or identity provider is gated where the provider keeps its consent step for a person signed in to the company's own account; publishing stock, EDI documents and ledger postings reach outside parties.

**Acceptance.**
1. A channel or ledger connection call carries security · gated with the provider and the consent step, and the step goes to a person at the provider.
2. Stock publication, an EDI 856 and a ledger posting carry external with their counterparty, *known* for a connected channel, partner or ledger.
3. A webhook subscription carries security, adding external when it names an outside destination.

#### SURFACE-006 — Access and security calls name their direction

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-006

**Requirement.** Staff, warehouse and trade-buyer grants carry access with the people affected and whether the grant widens or narrows; factor, session and credential calls carry security.

**Acceptance.**
1. Granting a warehouse role carries access marked widening, and removing a location from a grant carries access marked narrowing.
2. A trade-buyer grant carries access · external with the buyer as counterparty.
3. Requiring two-factor authentication, resetting a factor and rotating a service credential carry security.

#### SURFACE-007 — A stranger agent runs a seeded week under two policies

*Tier:* Agent surface · *From:* new · *Cites:* BASE-AGENT-007, BASE-AGENT-009, BASE-AGENT-011, BASE-AGENT-013

**Requirement.** A stranger agent given only Pier's URL runs a seeded wholesale week through MCP: it reads demand and stock, drafts and sends the week's POs, follows a late supplier confirmation, re-promises an affected order, receives against the PO, publishes stock to channels and reconciles the supplier bill.

**Acceptance.**
1. Under a policy with every class autonomous, the week completes through MCP with no approval, nothing refused by policy and an empty review feed.
2. Under the held policy, the same week waits for the test person's approval on each money, commitment and external call, runs each once approved, and the review feed holds the standard calls.
3. Before setup is answered, the first call returns `policy_unset` with the setup link, and setup lists every class Pier's tools carry with no answer pre-selected.
4. The Agents page's counts by class and decision equal the audit rows for the week.


## Push further

### Inventory agents that finish the job

#### AGENT-001 — Evidence-backed agent preparation

*Tier:* Core · *Cites:* BASE-AGENT-005, BASE-AGENT-008 · *Rules:* D-2

**Requirement.** An agent works inside a separately scoped grant: it reads allowed sales, supplier, stock, count and import evidence and proposes replenishment, reallocation, count-drift or migration work with assumptions and exact input versions. Applying a proposal runs the same native command a person runs, and that call carries the command's own class, which the company's policy decides; an agent never records a person's approval. Forecasts and proposals remain separate from actual inventory.

**Acceptance.**
1. As an agent whose grant carries no stock-write or approval right, prepare each of the four proposal kinds and attempt stock writing, approval and stale-version application.
2. The out-of-grant and stale attempts are refused and leave business state unchanged; the appropriate buyer/operator/warehouse/owner can review evidence and execute only an exact current approved consequence.

#### AGENT-002 — Optimize replenishment against cash and service

*Tier:* Core

**Requirement.** The inventory agent forecasts from real channel sell-through, seasonality, promotions and stockout-censored demand, with uncertainty and backtesting. It combines MOQ/case packs, supplier reliability, confirmed receipts, actual margin and owner cash/service limits to compare executable PO/transfer options and draft the selected POs. The agent's send through BUY-002 carries the money and external classes with its exact spend, terms and recipient as facts, and the company's policy decides it. Policy/budget changes or new demand invalidate a stale approval; the agent verifies arrival and accounting rather than stopping at draft creation.

**Acceptance.**
1. Under the held policy, provide connected sell-through with a censored stockout and unreliable supplier, compare a cash-constrained and service-maximizing plan, have a buyer approve one PO send and change a material input before a second.
2. The second blocks; the first is followed through actual receipt, landed cost and reconciled ledger with forecast-versus-actual explanation.

#### AGENT-003 — Close supplier confirmations and customer promises

*Tier:* Core · *Rules:* D-3

**Requirement.** The agent reads approved POs, authorized Gmail/Microsoft 365 supplier correspondence, ASN/EDI events, actual receipt history and customer commitments. It chases missing confirmations, extracts changed dates/quantities with source citations, proposes reallocation/substitutes and re-promises affected orders, then follows receipts, shipments and financial reconciliation to closure. Supplier sends and changed customer promises carry the external class and additional spend the money class, with recipients, content and amounts as facts, and the company's policy decides each; a delegated message policy names its recipient and content bounds and revokes immediately.

**Acceptance.**
1. Leave a supplier confirmation overdue, authorize a chase, ingest a changed ASN and compare affected customer promises.
2. Under the held policy, a person approves one change and declines another; only the approved messages and actions occur.
3. A partial late receipt keeps the case open until the remaining supply/customer outcome and ledger reconcile or an authorized cancellation closes it; under the held policy, a person authorizes that cancellation.

#### AGENT-004 — Repair channel oversell causes

*Tier:* Core · *Rules:* D-2

**Requirement.** The agent correlates channel webhook/cursor history, mappings, reservations, 3PL snapshots and ledger differences to explain an oversell’s actual cause. It proposes connector repairs, substitutes, transfers and customer options, then carries corrections through channel, warehouse and accounting queues and verifies the next reconciliation. Cancellations, refunds, physical adjustments and promise changes carry their own classes (money for a refund, external for a customer message), which the company's policy decides.

**Acceptance.**
1. Create a missed channel event and stale 3PL snapshot that overstates availability.
2. The agent cites the conflicting records, proposes repair and customer options and, under the held policy, executes only the changes a person approved.
3. A refund a person declines is not sent; closure requires corrected channel availability, real fulfillment/count evidence and reconciled accounting.

#### AGENT-005 — Prove cutover and reconciliation

*Tier:* Core

**Requirement.** The agent maps incumbent exports and source artifacts to items, terms, opening stock/valuation and open documents, identifies duplicates and explains differences by unit, bin, source row and ledger account. It prepares a cutoff/delta plan and checks warehouse, customer/supplier and financial totals before and after cutover. Mappings, merges and unresolved balance treatments are calls on the import door with their own classes, which the company's policy decides; source artifacts and corrections remain traceable and the agent never silently discards unsupported fields.

**Acceptance.**
1. Use a named-source cutover with a duplicate SKU, unit conflict, open backorder and accounting difference.
2. Under the held policy, inspect source-cited proposed mappings and totals; a person rejects a merge and approves corrected mappings, and the cutover runs once.
3. Replay and final-delta reconciliation show no duplicate opening or unaccounted field/value.

#### AGENT-006 — Live questions and reviewed bulk work

*Tier:* Core

**Requirement.** People ask operational questions against permission-scoped live records: why stock is short, what is late, which orders lose margin and what changing supplier/date/allocation would do. Answers cite records, quantities, data freshness and uncertainty. Bulk proposals preview exact changed rows, cash/service impact and affected promises, enforce per-row authority and approval, and become ordinary commands; stale versions block the affected plan rather than improvising a fallback.

**Acceptance.**
1. Ask a restricted warehouse user why an order is short and propose bulk promise/PO changes.
2. Answers cite allowed evidence without exposing forbidden costs; preview, edit and approve the plan, then mutate an input.
3. The stale action refuses and the remaining authorized results retain ordinary command/audit links.


## Field proof register

| ID | Proof | Clauses | State | Date | Receipt |
| --- | --- | --- | --- | --- | --- |
| R-1 | Print real labels on Zebra ZPL and DYMO printers and Letter label sheets, and scan them and supplier cartons with a USB or Bluetooth scanner, a Zebra TC-series keyboard-wedge handheld and iOS and Android phone cameras in a working warehouse | SCAN-001, SCAN-002 | not run | | |
| R-2 | Trading-partner certification of Pier's 850, 855, 856, 810 and GS1-128 carton labels by Target, Walmart and The Home Depot through a live SPS Commerce or Orderful account | EDI-001 | not run | | |
| R-3 | Sign-in, deprovisioning and provider-outage behavior against real Google Workspace and Microsoft Entra ID tenants | ADMIN-002 | not run | | |
| R-4 | A human screen-reader pass with VoiceOver or NVDA over the operator, warehouse and public journeys | UX-001 | not run | | |
| R-5 | A VPAT for the web app | UX-001 | not run | | |
| R-6 | Physical stock accuracy and return inspection at a real warehouse: transfers, partial receipts and inspected returns reconcile with the shelf | PIER-008, PIER-010 | not run | | |
| R-7 | A WhatsApp Business sender approved by Meta for the company's notifications | AUTO-001 | not run | | |
| R-8 | A live receiving domain whose inbound supplier and customer mail reaches Pier's signed inbox | DOC-001 | not run | | |

## Boundaries

- Pier owns inventory, wholesale commercial rules, purchasing, warehouse execution, fulfillment and operational reconciliation. [Stall](https://github.com/just-every/run-stall) owns the Shopify-style public/private storefront, cart and checkout experience; Pier is its stock system, including the private trade-ordering connection in SALES-005. [Larder](https://github.com/just-every/run-larder) owns manufacturing/MRP, manufacturing BOMs, production orders and shop-floor work; Pier exchanges finished-goods demand, availability and receipts through reviewed integration. Kits and bundles assembled from stocked finished goods without transforming them (case assortments, display kits, gift sets) are inventory work that Pier owns under KIT-001, as Cin7 Core and inFlow treat them. Larder owns BOMs that transform materials through operations, routings, work in progress, scrap and yield, and a Larder-built SKU arrives in Pier as a reviewed finished-goods receipt. No manufacturing scope is absorbed from the older research’s Katana/production examples. Neither boundary cuts the connected inventory job.
- US norms include USD operational valuation, US addresses and time zones, sales-tax/exemption evidence, ACH where used for payments, and explicit accounting period controls. Foreign-currency supplier purchases retain their source value and reviewed USD conversion; they do not change the US first-buyer focus. Native CSV import defaults to USD and records the reviewed rate for other currencies (PIER-003).
- Pier integrates carrier networks through ShipStation/EasyPost, EDI transport through SPS Commerce/Orderful and third-party warehouses through ShipHero/Extensiv; it does not operate those networks. QuickBooks Online/Xero remain the general ledger and accountant-approved books; Square/Stripe handle payment processing, and tax filing remains with the accountant/tax provider. Pier owns operational valuation, document exchange, reconciliation and unresolved exceptions, including partner onboarding and credentials required to make those workflows work. Ordinary lot traceability is included; regulated release/recall certification, customs brokerage and bonded-warehouse compliance use specialist partners with retained evidence. Background forecasting and document processing use bounded jobs/approved compute rather than unbounded request handlers.
- “Pier” remains a working product name, not a legal name-clearance assertion.

## Homepage claims

| # | Claim | Clauses |
| --- | --- | --- |
| 1 | "Pier tracks stock across your warehouses" | STOCK-001, PIER-001, PIER-008 |
| 2 | "runs orders from channel to carrier" | CHANNEL-001, PIER-004, PIER-009, WMS-001, SHIP-001 |
| 3 | "reorders before you run out" | BUY-005, BUY-008, BUY-001, AUTO-001 |
| 4 | "and keeps the books in step" | ACCOUNT-001, ACCOUNT-002 |
| 5 | "100% free, open source alternative to the supported source inventory systems" | OPEN-001, MIGRATE-001 |
| 6 | The six hero tags, each a stage below | PIER-006, EDI-001, PIER-011, WMS-001, STOCK-001, BUY-005 |
| 7 | "The inventory agent reads sell-through across your channels, sees the gap" | AGENT-002, BUY-001 |
| 8 | "Order 500 by Oct 7 · 12 days safety" | BUY-001, BUY-005 |
| 9 | "… and sends the purchase order" (PO-1048 sent, confirmed) | AGENT-002, BUY-006 |
| 10 | "The supplier's ship notice drops to 480" (inbound EDI 856) | BUY-007, EDI-001 |
| 11 | "20 follow on PO-1048-B · due Nov 12" | PIER-006, BUY-007 |
| 12 | "The agent checks each open order against stock, and no promise moves" | AGENT-003, SALES-003 |
| 13 | "Each carton is scanned against the PO as it comes off the truck" | WMS-001, SCAN-002, PIER-006 |
| 14 | "480 of 500 received · 20 short" | PIER-006 |
| 15 | "Scan the bin, scan the carton" (put away on a handheld) | WMS-001, SCAN-001, PIER-006 |
| 16 | "A count that disagrees gets a recount" | PIER-011, WMS-001 |
| 17 | "… before anything moves" | PIER-011, COUNT-001 |
| 18 | "Orders from your stores, marketplaces and EDI land in one queue" | CHANNEL-001, EDI-001, SALES-001, SALES-008 |
| 19 | Faire among the orders and channels | CHANNEL-004 |
| 20 | One count: 571 available, 692 on hand, 121 reserved | STOCK-001, PIER-004 |
| 21 | "855 acknowledged to Target" and "EDI 856 sent · Target DC 0593" | EDI-001 |
| 22 | "Stock goes back out to every channel" | CHANNEL-003 |
| 23 | "Pick by wave" (Wave 14 picked · 38 orders) | WMS-004, PIER-009 |
| 24 | "pack" (Packed · 61 cartons) | WMS-001 |
| 25 | "send the ship notice" | EDI-001 |
| 26 | "rate-shop" (Rate shop · SO-2291) | SHIP-001 |
| 27 | "Address corrected · 1420 E Main St" | SHIP-001 |
| 28 | "print the label" (label failed, re-weighed, printed) | SHIP-001, WMS-001 |
| 29 | "Tracking goes to each customer" | SHIP-001 |
| 30 | "214 orders out" by 4 pm | WMS-003, PIER-009 |
| 31 | "Pier matches each bill to its PO and receipt, holds the difference" | BUY-004 |
| 32 | "Agent requested a credit" | BUY-003, AGENT-003 |
| 33 | "Credit memo CM-311" and "Paid $2,016.00 for 480" | BUY-003, BUY-004 |
| 34 | "posts landed cost" (Landed cost $4.38 a unit) | COST-001 |
| 35 | "… to QuickBooks Online or Xero" | ACCOUNT-001, ACCOUNT-002 |
| 36 | "Each scan, sale, count and bill writes a line" | PIER-012, AUDIT-001 |
| 37 | "Value moves with it" (FIFO · USD) | COST-001, REPORT-002 |
| 38 | Reorder row: "571 available = 36 days; 40 needed (28 lead + 12 safety)" | BUY-001, BUY-005 |
| 39 | "Items, bins, stock on hand, customers, suppliers and open orders come across from a supported source inventory system" | MIGRATE-001, PIER-003 |
| 40 | "Channels reconnect to the same listings" | CHANNEL-001, MIGRATE-001 |
| 41 | The one-line start `npx -y @runeditrun/rer dev just-every/run-pier` and what it does | OPS-001 |
| 42 | "Runs on your own computer or server" | OPS-001 |
| 43 | "Where Pier stops. Manufacturing work orders, point of sale and 3PL client billing." | OPEN-001 |
| 44 | "Open source inventory and order management for wholesalers and distributors" | STOCK-001, CHANNEL-001, OPEN-001 |
| 45 | Tag "PO-1061 sent · 600 Blue Mug 12oz" | AGENT-002, BUY-006 |
| 46 | "Free and open source, MIT licensed" | OPEN-001 |

## Retired clauses

| ID | Now | Reason |
| --- | --- | --- |
| BASE-001 | merged into SEC-001 | Its own text restated the Base duties now cited in the Shared duties table, apart from the generic-edit bypass refusal and the domain-command rule that SEC-001 now carries; a clause id may not take the Base duty prefix. |

## Status

Judged from the code and tests at commit `f2832326ec054447a2b102992d15ae740e763781` (28 October 2026). PIER-001, PIER-002, PIER-003, PIER-006, PIER-010, PIER-011 and WMS-003 proof is re-run on the exact landing candidate, whose full commit identity is reported with its Verify evidence; other status judgments are preserved.

| Clauses | Done | Partial | Missing | Total |
| --- | ---: | ---: | ---: | ---: |
| Published | 9 | 3 | 0 | 12 |
| Target and push further | 15 | 60 | 11 | 86 |
| All | 24 | 63 | 11 | 98 |

| Clause | Title | Kind | Status | Evidence | Gap |
| --- | --- | --- | --- | --- | --- |
| `PIER-001` | Define stock | published | done | `tests/api/flows.test.mjs` — “01 item definitions and archive preserve used history” separately references fractional-pack definitions with supplier terms, purchase and sales documents, counts and movements; refuses unit, pack and used bin and transit kind changes with HISTORY and exact state and exported successful-result comparisons. “12 investigation export preserves every ledger and review link” archives the used SKU, rereads original movement, purchase, receipt and shipment links and costs through authenticated state and business export, and refuses new archived-item demand without effects. `tests/browser/journey.spec.ts` — “owner completes real UI journeys at 1440px” creates fractional-pack stock and locations, uses documents and counts, refuses definition edits, archives the item and opens its History and original receipt; desktop and phone screens are inspected at 1440 and 390. |  |
| `PIER-002` | Maintain counterparties and supplier terms | published | done | `tests/api/flows.test.mjs` — “02 supplier terms are exact snapshots” creates and revises terms, rereads the original committed PO and receipt through state and business export, verifies exact quantities, price, terms version and movement links, and refuses duplicate-pair creation without changing terms, history or successful commands; `tests/browser/journey.spec.ts` — “owner completes real UI journeys at 1440px” creates supplier terms and commits and receives the purchase. |  |
| `PIER-003` | Review native opening inventory | published | done | `tests/api/security-import.test.mjs` — “native import graph revisions, grouped lines, frontier and safe undo” and “empty downstream import undo restores native snapshot and retains custody” prove reviewed cutover, unchanged replay, changed-source revision, safe undo and dependency refusal; “native import reads USD by default, refuses an unknown currency naming the row, and values AUD rows through the batch's reviewed rate” proves the MUG opening's 10 units, USD 2.50 unit cost and USD 25.00 source layer with exact import and movement links in reports and business export, reviewed AUD conversion, the USD default and named-row currency refusal. `tests/api/native-exit.test.mjs` — “native exit preserves approved allocation and explicit backorders across a fresh cutover” proves exact bin allocations, wholly backordered lines, replay and constrained undo. |  |
| `PIER-004` | Commit sales demand without overselling | published | done | `src/pier/orders.ts`; `tests/api/flows.test.mjs` (04) |  |
| `PIER-005` | Approve exact purchase commitments | published | partial | `src/pier/purchasing.ts`; `src/pier/proposals.ts`; `tests/api/flows.test.mjs` (05) | Unasserted in the cited evidence: preparing the PO as an agent, the refused approval attempted with the agent's credential, a commit of the freshly approved version and its effect on expected rather than on-hand stock. Asserted: the buyer's approval and refusal of the stale and the unapproved revised version. `tests/api/security-import.test.mjs` ('roles, agent preparation, revoked session, stale human approval and direct HTTP denial') holds agent refusals outside this clause's evidence. |
| `PIER-006` | Receive partial purchases atomically | published | done | `tests/api/flows.test.mjs` — “06 partial receipts and failed multi-line receipt are atomic” partially receives both SKUs of a committed PO, checks exact costs, independent movement sums and remaining expected quantities, replays without another receipt and refuses both an invalid line and an excessive second line without partial business effects; `tests/browser/journey.spec.ts` — “owner completes real UI journeys at 1440px” receives a partial purchase and recovers the exact command after response loss. |  |
| `PIER-007` | Correct receipts with physical evidence | published | done | `src/pier/purchasing.ts`; `src/pier/warehouse.ts`; `tests/api/flows.test.mjs` (07) |  |
| `PIER-008` | Transfer through visible transit | published | partial | `src/pier/warehouse.ts`; `tests/api/flows.test.mjs` (08) — partial arrival, exact replay, stale/excess refusal and conserved transit; `tests/browser/journey.spec.ts` — “owner completes real UI journeys at 1440px” enters a partial destination receipt through Transfers. | Unasserted in the cited evidence: the source position, and with it source plus transit plus destination reconciling throughout the transfer (no source figure is read, and transit and destination are read once, mid-transfer, not after the send or after the full receipt), and an attempted sale of the in-transit units (the test reads transit availability as 0 but attempts no sale). Asserted: the transfer dispatches through transit with transit availability 0, a partial destination receipt of 0.2 leaves transit 0.3 and destination 0.2, the retried receipt returns the same result, and stale or excess receipts are refused with movements unchanged. |
| `PIER-009` | Dispatch only owned reservations | published | partial | `src/pier/orders.ts`; `tests/api/flows.test.mjs` (09); `tests/browser/journey.spec.ts` | Unasserted: an attempt to dispatch against another order's reservation (the test over-dispatches its own line instead), and the remaining order's outstanding demand after the partial dispatch. Asserted: the partial dispatch, its replay and its reservation link. |
| `PIER-010` | Cancel and inspect returns | published | done | `tests/api/flows.test.mjs` — “10 cancellation preserves shipment and returns remain quarantine until review” proves cancellation and released reservations, preserved shipment history, actual dispatch-linked returns, excess-return refusal, exact partial and full restock, approval and replay; an isolated returned SKU reserves zero before restock and dispatch refuses without changing stock, movements, reservations, shipments, orders, returns or successful commands; after exact human approval and partial restock only the released quantity reserves and ships, with independent sellable and quarantine movement sums; `tests/browser/journey.spec.ts` — “owner completes real UI journeys at 1440px” reviews and posts partial restock through Sales orders, capturing the return at 1440 and 390. |  |
| `PIER-011` | Count at a captured movement frontier | published | done | `tests/api/flows.test.mjs` — “11 count frontier prevents overwriting intervening movement” in “Pier public Worker and D1 wholesale journey” proves captured physical counts, stale approval refusal after an intervening receipt and after replacement of a captured movement, unchanged stock positions, movements, reservations, count review and approval state and successful command results, independent movement sums, and the exact fresh-count compensating adjustment. The enclosing journey asserts zero outbound requests. |  |
| `PIER-012` | Investigate and leave with native data | published | done | `src/pier/api.ts`; `src/pier/native-export.ts`; `tests/api/flows.test.mjs` (12); `tests/portable.mjs` |  |
| `STOCK-001` | Stock position across warehouses and bins | target | partial | `src/pier/stock-position.ts`; `src/pier/api.ts`; `src/ui/stock.tsx`; `src/ui/stock-totals.tsx`; `tests/api/stock.test.mjs`; `tests/browser/stock.spec.ts` | Unasserted in the cited evidence: Reserved's explanation that it includes protected holds, an order's refusal to reserve held units, and the Unassigned receiving warehouse bucket for a committed PO with no destination. Asserted: warehouse, bin and company figures equal independent sums of exported movements, reservations, holds and PO lines, and search and warehouse, bin and status filters at 1440 and 390. |
| `CAT-001` | Wholesale catalog, units and barcodes | target | done | `src/pier/catalogue-fields.ts`; `src/pier/catalogue-bulk.ts`; `src/pier/floor/codes.ts`; `src/ui/catalogue-editor.tsx`; `src/ui/catalogue-detail.tsx`; `src/ui/catalogue-import.tsx`; `tests/api/catalogue.test.mjs`; `tests/browser/catalogue.spec.ts`; [Catalogue](docs/catalogue.md); `tests/api/catalogue.test.mjs` — “CAT-001: reviewed variants, references and exact multi-pack barcodes survive public stock work and export” proves the original catalogue journey, exact typed imports and filters, field-bearing packing-slip and PO PDFs, case-pack quote and label quantities, denied writes and reads, revocation and recovered-result refusal, durable custody refusal and audit without values; `tests/api/native-exit.test.mjs` — “native exit preserves approved allocation and explicit backorders across a fresh cutover” proves exact metadata and all four typed owner kinds, remapping, replay, dependency-constrained undo, custody without live definitions and refusal after restart; `tests/browser/catalogue.spec.ts` — “owner typed-field controls define, edit, import and filter every record type with custody refusal at 1440 and 390” proves all five field types, four record kinds, reviewed import, exact filtering and downloaded values, malformed-file recovery, Activity refusal and denied access at both widths; `tests/portable.mjs` — full public-command portability journey proves exact typed values, field-bearing PDF bytes, retained originals and journal, fresh owner authority, paused external authority and later-journal fencing, plus custody and refusal after definition-removing undo, restart and valid archive restore |  |
| `CAT-002` | Typed custom fields | target | done | `src/pier/catalogue-fields.ts`; `src/pier/catalogue-bulk.ts`; `src/pier/floor/codes.ts`; `src/ui/catalogue-editor.tsx`; `src/ui/catalogue-detail.tsx`; `src/ui/catalogue-import.tsx`; `tests/api/catalogue.test.mjs`; `tests/browser/catalogue.spec.ts`; [Catalogue](docs/catalogue.md); `tests/api/catalogue.test.mjs` — “CAT-001: reviewed variants, references and exact multi-pack barcodes survive public stock work and export” proves the original catalogue journey, exact typed imports and filters, field-bearing packing-slip and PO PDFs, case-pack quote and label quantities, denied writes and reads, revocation and recovered-result refusal, durable custody refusal and audit without values; `tests/api/native-exit.test.mjs` — “native exit preserves approved allocation and explicit backorders across a fresh cutover” proves exact metadata and all four typed owner kinds, remapping, replay, dependency-constrained undo, custody without live definitions and refusal after restart; `tests/browser/catalogue.spec.ts` — “owner typed-field controls define, edit, import and filter every record type with custody refusal at 1440 and 390” proves all five field types, four record kinds, reviewed import, exact filtering and downloaded values, malformed-file recovery, Activity refusal and denied access at both widths; `tests/portable.mjs` — full public-command portability journey proves exact typed values, field-bearing PDF bytes, retained originals and journal, fresh owner authority, paused external authority and later-journal fencing, plus custody and refusal after definition-removing undo, restart and valid archive restore |  |
| `CAT-003` | Owner-only custody of typed-field content | target | partial | `src/pier/catalogue-fields.ts`; `src/pier/catalogue-bulk.ts`; `src/pier/floor/codes.ts`; `src/ui/catalogue-editor.tsx`; `src/ui/catalogue-detail.tsx`; `src/ui/catalogue-import.tsx`; `tests/api/catalogue.test.mjs`; `tests/browser/catalogue.spec.ts`; [Catalogue](docs/catalogue.md); `tests/api/catalogue.test.mjs` — “CAT-001: reviewed variants, references and exact multi-pack barcodes survive public stock work and export” proves the original catalogue journey, exact typed imports and filters, field-bearing packing-slip and PO PDFs, case-pack quote and label quantities, denied writes and reads, revocation and recovered-result refusal, durable custody refusal and audit without values; `tests/api/native-exit.test.mjs` — “native exit preserves approved allocation and explicit backorders across a fresh cutover” proves exact metadata and all four typed owner kinds, remapping, replay, dependency-constrained undo, custody without live definitions and refusal after restart; `tests/browser/catalogue.spec.ts` — “owner typed-field controls define, edit, import and filter every record type with custody refusal at 1440 and 390” proves all five field types, four record kinds, reviewed import, exact filtering and downloaded values, malformed-file recovery, Activity refusal and denied access at both widths; `tests/portable.mjs` — full public-command portability journey proves exact typed values, field-bearing PDF bytes, retained originals and journal, fresh owner authority, paused external authority and later-journal fencing, plus custody and refusal after definition-removing undo, restart and valid archive restore | Unasserted: the field-bearing document and original-custody screens at 1440 and 390. Asserted: non-owner refusal across reads, filters, imports, writes, exports, documents and recovered results, revocation, the erasure refusal after undo, restart and restore, retained custody, archive preservation, paused authority, the older-archive fence, value-free audit in Activity and export, and the field-control, error, erasure-refusal, Activity and denied screens at both widths. |
| `KIT-001` | Kits and bundles from stocked components | target | partial | `tests/api/floor.test.mjs` — “KIT-001: concurrent channel kits, whole shortages, versioned picks, assembly, returns and exact cost” proves definition versions, concurrent sales/channel reservations, published availability/buffers, complete picks/dispatch, shortage backorder/block, quotes/documents, five-kit assembly, two-kit shipment, inspected return/disassembly, per-kit cost/margin and export; “KIT-001: splitting and disassembling cent-valued kits conserves every cost layer” proves split-cost conservation. `tests/browser/stock.spec.ts` — “KIT-001: define, assemble, pick, pack, print and inspect kits at 1440 and 390” covers the public screens. `src/pier/kits.ts`; [Kits](docs/kits.md) | Unasserted in the cited evidence: no component reserved twice across pre-assembly and shipment (the cited check that every position's availability is at least zero still passes with a duplicate reservation, because the fixture holds 30 of each component), and component stock reconciling after assembly, shipment and return (no assertion reads component positions after them; only the valuation-to-ledger difference is read). Asserted: the two-component and three-component kit definitions, concurrent sales-order and channel reservations of exact component sums, published availability at the lowest buildable count, the pick list's component lines, COGS, the drain to zero and whole-kit backorder, the five-kit assembly and two-kit shipment, per-component return inspection, and rolled-up kit cost and margin. |
| `TRACE-001` | Serial, lot and expiry traceability | target | partial | `tests/api/floor.test.mjs` — “TRACE-001: dated lots and serials survive receiving, transfer, exact picks, split dispatch, quarantine and return tracing” proves GS1/hand intake, serial uniqueness, FEFO across bins, transfers, wrong-lot pick/pack refusal, split dispatch, quarantine, serial return and exact receipt/supplier/customer tracing; “TRACE-001: an already-reserved lot becomes unavailable for pick and dispatch after its expiry day” proves expiry refusal and stock totals without changing history; “TRACE-001: assembled and virtual kit returns retain component lineage and a component lot hold blocks its kits” proves kit identity/cost inheritance. `tests/browser/stock.spec.ts` — “TRACE-001: receive dated lots and serials, transfer, split ship, trace, quarantine and return at 1440 and 390” proves receiving, transfers, split dispatch, wrong-lot refusal, trace sources/customers, quarantine and serial return at both widths. `src/pier/trace.ts`; [Traceability](docs/traceability.md) | Unasserted: owner approval of the FIFO or FEFO policy, FIFO ordering by first receipt and arrival order, FEFO placing undated identities last, the shared serial and trace-code namespace and exact per-SKU supplier lot references. Asserted: dated lot and serial intake, transfer, split dispatch, quarantine, serial return, exact tracing, duplicate-serial and expired or blocked refusals, FEFO choosing the earlier-expiring lot and kit quarantine inheritance. |
| `SCAN-001` | Generate, scan and print warehouse barcodes | target | partial | `src/pier/catalogue.ts`; `src/pier/floor/codes.ts`; `src/ui/floor/scanner.tsx`; `tests/api/floor.test.mjs`; `src/pier/edi/sscc.ts`; `src/pier/edi-labels.ts`; `tests/api/edi.test.mjs` | SSCC GS1-128 SVG/browser 4×6/Zebra ZPL and immutable ASN-matched carton reprints now exist; physical printer/scanner validation, retailer artwork and the broader item/bin/lot barcode and device matrix remain. |
| `SCAN-002` | Supplier unit, case and GS1 barcodes in warehouse work | target | partial | `src/pier/floor/codes.ts`; `src/pier/floor/receiving.ts`; `src/pier/floor/waves.ts`; `src/pier/floor/packing.ts`; `tests/api/floor.test.mjs` | A unit barcode counts one base unit and a case barcode its pack quantity at receive, pick and pack; an over-receipt posts only with a reason, a pick or pack scan beyond the line's quantity is refused, a different SKU is refused at pick. Multiple exact unit/inner/case codes now share CAT-001 resolution; TRACE-001 now supplies hand-entered and GS1 lot, expiry and serial intake and exact tracked picks; Audited owner linking of an unknown supplier code at receiving is proved by `tests/api/floor.test.mjs` — “warehouse floor: receive, wave pick, pack and dispatch summary” and `tests/browser/journey.spec.ts` — “ranked receipt fill lists release once and transfer arrival dates remain reviewed at 1440 and 390”. Linking retains reason and exact pack quantity, changes no stock and refuses collisions. The owner acts as supervisor until a dedicated role exists. A reviewed original 004010 856 notice now maps exact each-unit SKU or UPC lines to its PO and SSCC hierarchy; one confirmed scan receives every mapped pallet line atomically, retains the original notice and refuses duplicate, overlapping, unconfirmed and excess receipts. `tests/api/floor.test.mjs` — “confirmed SSCC receives every 856 pallet line once and invalid notices leave stock unchanged” and the same browser journey prove this path. Unsupported units, conditions or tracked goods without mapped identities require review. Physical USB scanner, Zebra handheld and phone-camera acceptance remains pending; software proof does not establish that device matrix. |
| `WMS-001` | Mobile receive, put away, pick, pack and count | target | done | `tests/api/floor.test.mjs` — “warehouse floor: receive, wave pick, pack and dispatch summary” proves partial receipt, wrong scans, bin verification, overflow/count opening, cartons and dispatch. `tests/api/warehouse-waves.test.mjs` — “ten order totes share one bin walk, overflow moves only its owner, and one short order alone remains open” proves reservation isolation; “zone picks retain separate contributions and merge only the completed order tote at pack” proves zone gates/merge; “a resumed pick refuses its original bin after reviewed reallocation reserves replacement stock elsewhere” proves atomic stale-bin refusal. `tests/api/packing-documents.test.mjs` — “pack slip contains only current partial cartons and reading cannot dispatch” proves exact print content. `tests/browser/warehouse-waves.spec.ts` — “warehouse zone merge, ten order totes and overflow at 1440px” and “warehouse zone merge, ten order totes and overflow at 390px” prove zone/batch/tote/bin scans, overflow, split cartons and shipments, and packing-slip print output. `tests/browser/warehouse-offline.spec.ts` — “warehouse interruptions retain exact task, reconcile stale allocations and recover stock once at 1440 and 390” proves interrupted requests/responses, retained tasks, explicit recovery, stale refusal and no duplicate dispatch. `tests/browser/warehouse-returns.spec.ts` — “warehouse partial receiving, transfers, counts and authorized or quarantined return scans at 1440 and 390” proves receiving/put-away, transfers/counts, one-scan restock, mapped write-off and both unauthorized conditions in quarantine. `tests/api/returns.test.mjs` — “one-scan returns restock, quarantine and write off actual dispatches with native Pantry credits and exact costs” proves ledger closure. Existing KIT-001/TRACE-001 journeys prove kit/lot inheritance. [Warehouse work](docs/warehouse-work.md). |  |
| `WMS-004` | Wave release, line scans and short-bin redirection | target | done | `tests/api/floor.test.mjs` — “warehouse floor: receive, wave pick, pack and dispatch summary” proves partial receipt, wrong scans, bin verification, overflow/count opening, cartons and dispatch. `tests/api/warehouse-waves.test.mjs` — “ten order totes share one bin walk, overflow moves only its owner, and one short order alone remains open” proves reservation isolation; “zone picks retain separate contributions and merge only the completed order tote at pack” proves zone gates/merge; “a resumed pick refuses its original bin after reviewed reallocation reserves replacement stock elsewhere” proves atomic stale-bin refusal. `tests/api/packing-documents.test.mjs` — “pack slip contains only current partial cartons and reading cannot dispatch” proves exact print content. `tests/browser/warehouse-waves.spec.ts` — “warehouse zone merge, ten order totes and overflow at 1440px” and “warehouse zone merge, ten order totes and overflow at 390px” prove zone/batch/tote/bin scans, overflow, split cartons and shipments, and packing-slip print output. `tests/browser/warehouse-offline.spec.ts` — “warehouse interruptions retain exact task, reconcile stale allocations and recover stock once at 1440 and 390” proves interrupted requests/responses, retained tasks, explicit recovery, stale refusal and no duplicate dispatch. `tests/browser/warehouse-returns.spec.ts` — “warehouse partial receiving, transfers, counts and authorized or quarantined return scans at 1440 and 390” proves receiving/put-away, transfers/counts, one-scan restock, mapped write-off and both unauthorized conditions in quarantine. `tests/api/returns.test.mjs` — “one-scan returns restock, quarantine and write off actual dispatches with native Pantry credits and exact costs” proves ledger closure. Existing KIT-001/TRACE-001 journeys prove kit/lot inheritance. [Warehouse work](docs/warehouse-work.md). |  |
| `WMS-005` | Returns bench one-scan restock and write-off | target | done | `tests/api/floor.test.mjs` — “warehouse floor: receive, wave pick, pack and dispatch summary” proves partial receipt, wrong scans, bin verification, overflow/count opening, cartons and dispatch. `tests/api/warehouse-waves.test.mjs` — “ten order totes share one bin walk, overflow moves only its owner, and one short order alone remains open” proves reservation isolation; “zone picks retain separate contributions and merge only the completed order tote at pack” proves zone gates/merge; “a resumed pick refuses its original bin after reviewed reallocation reserves replacement stock elsewhere” proves atomic stale-bin refusal. `tests/api/packing-documents.test.mjs` — “pack slip contains only current partial cartons and reading cannot dispatch” proves exact print content. `tests/browser/warehouse-waves.spec.ts` — “warehouse zone merge, ten order totes and overflow at 1440px” and “warehouse zone merge, ten order totes and overflow at 390px” prove zone/batch/tote/bin scans, overflow, split cartons and shipments, and packing-slip print output. `tests/browser/warehouse-offline.spec.ts` — “warehouse interruptions retain exact task, reconcile stale allocations and recover stock once at 1440 and 390” proves interrupted requests/responses, retained tasks, explicit recovery, stale refusal and no duplicate dispatch. `tests/browser/warehouse-returns.spec.ts` — “warehouse partial receiving, transfers, counts and authorized or quarantined return scans at 1440 and 390” proves receiving/put-away, transfers/counts, one-scan restock, mapped write-off and both unauthorized conditions in quarantine. `tests/api/returns.test.mjs` — “one-scan returns restock, quarantine and write off actual dispatches with native Pantry credits and exact costs” proves ledger closure. Existing KIT-001/TRACE-001 journeys prove kit/lot inheritance. [Warehouse work](docs/warehouse-work.md). |  |
| `WMS-002` | Directed replenishment and slotting | target | done | `src/pier/slotting.ts`; `src/pier/location-capacity.ts`; `src/pier/api.ts`; `src/pier/valuation-ledger.ts`; `src/ui/warehouse-slotting.tsx`; `tests/api/slotting.test.mjs`; `tests/browser/slotting.spec.ts`; [Warehouse placement](docs/warehouse-placement.md) |  |
| `WMS-003` | Daily dispatch board and carrier cut-offs | target | done | `tests/api/dispatch.test.mjs` — “WMS-003: twenty due orders, eighteen dispatches and a retained close reconcile independently” proves twenty due orders, reviewed ship-by precedence and invalid-date refusal, the 16:00 carrier cut-off in its exact time zone, every remaining-work risk flag through picking, packing and labeling, clearance only after each order dispatches, the other unfinished flags, and eighteen shipments and day-close totals against independent movement-backed shipment records. `tests/browser/dispatch.spec.ts` — “WMS-003: warehouse dispatch states, reviewed ship-by schedule, close download and overdue report at 1440 and 390” proves the visible configured cut-off and time zone, conservative basis, native packed-to-dispatched risk transition, retained other-order flags, reviewed pickup schedule, day-close download and overdue report. Shipping recordings replace only the external provider network. |  |
| `COUNT-001` | Full-warehouse stocktake | target | partial | `tests/api/flows.test.mjs` — “warehouse stocktakes freeze only their scope, retain blind counts and zone decisions, require recounts and reject stale live approval” proves the 20-bin scope, freeze refusals, other-warehouse work, 18 scanned bins, both uncounted rules, threshold recount, exact adjustments and replay, retained export, live stale refusal and lot and serial adjustments. `tests/browser/journey.spec.ts` — “warehouse stocktake blind tasks, zone review and retained adjustments at 1440 and 390” proves the Counts workflow at both widths. | Native warehouse and chosen-zone stocktakes now retain bin frontiers, shared freeze admission, assigned blind scan tasks, per-zone uncounted rules, quantity and value recount thresholds, retained cost-layer impacts and once-only adjustments, including retained lot and serial identities. Live bins require fresh physical recount after movement. Pending: reviewed reason-code GL mappings, valuation for stock increases and actual once-only QBO valuation posting under ACCOUNT-001. Ledger status stays not-posted; physical handheld evidence remains SCAN-002. |
| `SALES-001` | Quote, price and convert orders | target | partial | `tests/api/costing.test.mjs` — “versioned case quotes retain discounted tax PDFs, exact approval and once-only acceptance” proves two customer tiers and volume breaks, case conversion, authorized discount and exact USD/tax rounding, retained sent quote PDF, renewed approval after quantity/price/expiry changes, immutable prior versions/PDFs, once-only conversion/reservation and confirmation, explicit recipient, failed and uncertain delivery without blind resend; “quote approver role defaults to Owner and policy or live role changes revoke open approvals” proves configurable human authority, policy history, revoked-role/policy refusal and owner-only send consent; “customer CSV and XLSX intake resolves 40 lines, names unknown rows and prices three customer POs once” proves alias resolution, blank-price tiers, row error and routed warehouse preview, three orders only after approval and duplicate file/PO refusal. `tests/browser/journey.spec.ts` — “commercial quotes are reviewed, revised, accepted and retain unavailable-email PDFs at 1440 and 390” and “customer sales files preview prices and errors before creating orders at 1440 and 390” prove the corresponding screens at both widths. [Orders](docs/orders.md). | Unasserted: the quote tax estimate naming the owner table version, and the retained reason when the owner designates another approver role. Asserted: tiered and discounted quotes with exact USD tax, retained sent PDFs, once-only acceptance, conversion and confirmation, renewed approval after changes, owner-only sending, the configurable approver role and revocation of open approvals. |
| `SALES-008` | Customer order files | target | done | `tests/api/costing.test.mjs` — “versioned case quotes retain discounted tax PDFs, exact approval and once-only acceptance” proves two customer tiers and volume breaks, case conversion, authorized discount and exact USD/tax rounding, retained sent quote PDF, renewed approval after quantity/price/expiry changes, immutable prior versions/PDFs, once-only conversion/reservation and confirmation, explicit recipient, failed and uncertain delivery without blind resend; “quote approver role defaults to Owner and policy or live role changes revoke open approvals” proves configurable human authority, policy history, revoked-role/policy refusal and owner-only send consent; “customer CSV and XLSX intake resolves 40 lines, names unknown rows and prices three customer POs once” proves alias resolution, blank-price tiers, row error and routed warehouse preview, three orders only after approval and duplicate file/PO refusal. `tests/browser/journey.spec.ts` — “commercial quotes are reviewed, revised, accepted and retain unavailable-email PDFs at 1440 and 390” and “customer sales files preview prices and errors before creating orders at 1440 and 390” prove the corresponding screens at both widths. [Orders](docs/orders.md). |  |
| `SALES-002` | Customer history, credit and financial returns | target | partial | `src/pier/returns.ts`; `src/pier/books/return-planning.ts`; `tests/api/returns.test.mjs` | Actual dispatch-linked sellable and damaged returns post native Pantry credit notes and adjust open invoice balances, returned inventory, COGS and mapped damage expense. Owner-only customer contacts, addresses and payment terms, exact native balances and currency-separated UTC aging now ship. Named outside reps without sign-in default onto quotes, orders and invoices; order reassignment records a reason and leaves earlier invoice attribution intact. `tests/api/returns.test.mjs` — “customer terms, currency aging and invoice representatives retain their own source history”; `tests/browser/journey.spec.ts` — “customer profiles and outside representatives show native aging at 1440 and 390”. Pending: credit-limit and overdue-hold enforcement with reviewed overrides, imported history, full emailed statement, refund and ledger reconciliation, and REPORT-002 sales and margin by invoice rep. |
| `SALES-003` | Available-to-promise and fulfillment routing | target | partial | `src/pier/replenishment.ts`; `src/pier/backorders.ts`; `src/pier/purchasing-workflow.ts`; `src/pier/correspondence-delivery.ts`; `tests/api/replenishment.test.mjs` | Computed per-line backorder dates allocate open PO quantities once in promise and order priority, with confirmed versus lead-time estimates; reviewed customer promises and exact-recipient automatic date-update policies email changes. Owner-set promise/customer/order priority now ranks dated supply and reviewed receipt fill lists; one stale-safe release reserves free stock from receipt bins without taking another order’s allocation. Reviewed transfer arrival dates feed dated supply. `tests/api/replenishment.test.mjs` — “owner priority ranks dated supply and reviewed receipt releases preserve allocations and reject changed evidence”; `tests/browser/journey.spec.ts` — “ranked receipt fill lists release once and transfer arrival dates remain reviewed at 1440 and 390”. Remaining: full eligible-warehouse split or later alternatives with SHIP-001 recorded carrier-cost proof, complete reallocation and customer communication acceptance. Assigned warehouse inbound supply now withholds the owner safety-stock deficit once, net of unreserved eligible on-hand stock, before priority allocation; existing reservations are retained and the dated view names both the configured buffer and withheld inbound quantity (`tests/api/replenishment.test.mjs` — “owner priority ranks dated supply and reviewed receipt releases preserve allocations and reject changed evidence”; the same browser journey proves the visible buffer). Legacy unassigned inbound and full split-alternative ATP remain open. No automatic allocation policy is enabled. |
| `SALES-004` | Recurring and dropship orders | target | done | `tests/api/costing.test.mjs` — “recurring orders apply price, stock and credit policy once per due day and stop after pause or cancel” proves owner-only explicit enablement, customer and UTC cadence bounds, stock and price ceilings, expiring reviewed credit, one occurrence per pass, renewed signing authority and no recurrence mail, dispatch or financial posting; “direct dropship demand retains supplier PO, confirmation, tracking, cost and bounded customer credit without warehouse stock” proves supplier confirmation, tracking, bounded credit, explicit owner Pantry posting, lost-response recovery, linked invoice readback and unchanged local stock. `tests/browser/journey.spec.ts` — “an owner authorizes, runs and pauses recurring demand at 1440 and 390”; “a direct supplier shipment records tracking and posts an explicitly authorized customer credit with unchanged stock at 1440 and 390”. [Orders](docs/orders.md). |  |
| `SALES-005` | Private wholesale ordering through Stall | target | partial | `src/pier/trade.ts`; `tests/api/channels.test.mjs` — “trade buyers read only approved customer prices, routed stock, terms and native order status with immediate revocation” proves explicit customer prices, destination routing, net availability, native history and shipment references, buyer isolation and revocation; “trade cart intake is idempotent, consent gated and permanently suppressed after purchase or unsubscribe without reserving stock or sending” proves consent gating, replay, terminal suppression and unchanged business effects. [Trade API](docs/trade-api.md). The catalog registration also proves omission of mixed and unapproved historical orders including totals, explicit scope expansion and contraction, stale-grant refusal, forged customer and destination isolation, denied non-owner grants and approving-owner authority loss on catalog and cart doors. The cart registration proves recipient and purpose consent metadata, invalid-consent refusal without a grant change, credential rotation, re-grant, connection re-enablement and restart suppression. `tests/api/shipping.test.mjs` — “packed order → verified rates → label → emailed tracking → delivered shipment” proves the buyer projection of exact retained carrier tracking and delivered status through the provider network-edge fixture. `tests/portable.mjs` proves populated fresh-archive credential and consent revocation, denied old credentials after re-enablement, fresh-owner re-grants, retained unsubscribe suppression, retained purchased-cart stops and no inferred consent for a new cart. These are local public-door proofs; connected Stall screens, reminder delivery and pre-unsubscribe archive rollback remain unproved. | Unproved: the Stall B2B-001 connected sign-in, private catalog and reorder journey; imported reorder history; and operator and buyer end states at 1440 and 390 in recorded exact-SHA Verify. Trade order submission retains SALES-007 routing, SEC-002 consent and DATA-002 governed custody. Pier records Stall B2B-001 as missing; this review does not independently judge that other repository. Provider and legal qualification remain named acceptance work and do not remove the connected wholesale target. |
| `SALES-009` | Abandoned-cart follow-up with consent and suppression | target | partial | `src/pier/trade.ts`; `tests/api/channels.test.mjs` — “trade buyers read only approved customer prices, routed stock, terms and native order status with immediate revocation” proves explicit customer prices, destination routing, net availability, native history and shipment references, buyer isolation and revocation; “trade cart intake is idempotent, consent gated and permanently suppressed after purchase or unsubscribe without reserving stock or sending” proves consent gating, replay, terminal suppression and unchanged business effects. [Trade API](docs/trade-api.md). The catalog registration also proves omission of mixed and unapproved historical orders including totals, explicit scope expansion and contraction, stale-grant refusal, forged customer and destination isolation, denied non-owner grants and approving-owner authority loss on catalog and cart doors. The cart registration proves recipient and purpose consent metadata, invalid-consent refusal without a grant change, credential rotation, re-grant, connection re-enablement and restart suppression. `tests/api/shipping.test.mjs` — “packed order → verified rates → label → emailed tracking → delivered shipment” proves the buyer projection of exact retained carrier tracking and delivered status through the provider network-edge fixture. `tests/portable.mjs` proves populated fresh-archive credential and consent revocation, denied old credentials after re-enablement, fresh-owner re-grants, retained unsubscribe suppression, retained purchased-cart stops and no inferred consent for a new cart. These are local public-door proofs; connected Stall screens, reminder delivery and pre-unsubscribe archive rollback remain unproved. | Unproved: configured, recipient-authorized reminder delivery and its connected purchase and unsubscribe stops; suppression when rolling back to an archive that predates unsubscribe; and the operator and buyer end states at 1440 and 390. The current slice sends no automatic reminder. |
| `SALES-006` | Customer invoices, charge lines and credit notes | target | partial | `tests/api/costing.test.mjs` — “native shipment and prepay invoices retain terms, charge tax, credits and unpaid voids” proves separate actual partial shipments and freight, Net 30 dates, prepay without a second invoice, linked returned-line credit, public customer balances, immutable authorization, retained CAD rate/USD value, unpaid void original/reason and reuse of uninvoiced shipment quantities; “invoice-specific Stripe checkout verifies ACH success once and expires paid or changed links” proves payments in the balance and paid-void refusal. `tests/api/books.test.mjs` proves the existing Pantry flow still posts. [Business documents](docs/business-documents.md). | Native invoices, owner-reviewed table tax, charges, terms, CAD conversion, immutable originals, linked credits and unpaid voids are implemented. BLOCKED: owner QBO OAuth sandbox/realm authorization and Avalara sandbox account/key are not held; actual exactly-once QBO invoice/credit posting and QBO/Avalara reversals remain unimplemented and unproved. Ledger/tax statuses explicitly stay pending. CAD quoting, wider currencies, order-type policies and connected channel charged-tax/payment/refund closure remain with the full clause and TAX-001/CHANNEL-002/PAY-001; no external posting or refund is claimed. |
| `SALES-007` | Warehouse routing for incoming orders | target | partial | `tests/api/channels.test.mjs` — “owner routing versions choose zones, shortage policy, reroute and net channel publication without FBA stock” (Shopify ZIP/state/default, hold/next/split/no-split, no-default queue, ineligible refusal, audited reroute, address change, net publication and dry-run). `tests/api/edi.test.mjs` — “retailer 850 through line decisions, packed SSCC ASN and shipped invoice over the EDI edge” routes Oregon to its rule-selected warehouse. `tests/browser/journey.spec.ts` — “owners dry-run and activate routing and review an audited reroute at 1440 and 390”. [Orders](docs/orders.md). | Fixed, assigned channel location and versioned zone modes cover existing manual/file/channel/EDI/recurring doors. Missing Faire transport/account prevents its literal import acceptance. |
| `SALES-010` | Shortage rules, split permission and reroutes | target | partial | `tests/api/channels.test.mjs` — “owner routing versions choose zones, shortage policy, reroute and net channel publication without FBA stock” (Shopify ZIP/state/default, hold/next/split/no-split, no-default queue, ineligible refusal, audited reroute, address change, net publication and dry-run). `tests/api/edi.test.mjs` — “retailer 850 through line decisions, packed SSCC ASN and shipped invoice over the EDI edge” routes Oregon to its rule-selected warehouse. `tests/browser/journey.spec.ts` — “owners dry-run and activate routing and review an audited reroute at 1440 and 390”. [Orders](docs/orders.md). | Carried at SALES-007's partial status. The old Gap names no shortage or reroute outcome as missing, and `tests/api/channels.test.mjs` covers hold, next-eligible, split, no-split and audited reroutes (fresh-judge candidate). |
| `SALES-011` | Routed channel availability and rule dry runs | target | partial | `tests/api/channels.test.mjs` — “owner routing versions choose zones, shortage policy, reroute and net channel publication without FBA stock” (Shopify ZIP/state/default, hold/next/split/no-split, no-default queue, ineligible refusal, audited reroute, address change, net publication and dry-run). `tests/api/edi.test.mjs` — “retailer 850 through line decisions, packed SSCC ASN and shipped invoice over the EDI edge” routes Oregon to its rule-selected warehouse. `tests/browser/journey.spec.ts` — “owners dry-run and activate routing and review an audited reroute at 1440 and 390”. [Orders](docs/orders.md). | Multiple channel-location stock writes are not yet implemented; the adapter publishes to its configured provider location and ambiguous Shopify assignments wait. Missing Faire transport/account prevents Faire's literal publication acceptance. |
| `TAX-001` | US sales tax on quotes, orders and invoices | target | partial | `src/pier/sales-quotes.ts`; `tests/api/costing.test.mjs` — “versioned case quotes retain discounted tax PDFs, exact approval and once-only acceptance”: owner table estimates, retained state certificate reference, missing/expired review refusal and exact quote cents. [Orders](docs/orders.md). | Owner-maintained state estimate tables and certificate references are implemented. Product/origin/freight/handling jurisdiction rules, certificate originals under DOC-001, provider adapters/commits/reversals, final invoices/QBO posting and unchanged charged channel tax remain. No certificate validation or provider verification is claimed. |
| `PRINT-001` | Printable and emailable business documents and templates | target | partial | `tests/api/packing-documents.test.mjs` — “business PDFs retain every live document kind, Unicode, aliases, packs and edited template versions” proves all thirteen real-source documents (including VICS BOL), logo, terms, party codes, commercial and base quantities, template changes and immutable earlier bytes; “explicit quote and invoice PDF sends retain recipients and signed bounces become failed without resending” proves retained quote, invoice and statement sends, exact recipients and PDFs, verified bounce and no resend. `tests/browser/journey.spec.ts` — “business document templates preserve invoice reprints and retained pack-station PDFs at 1440 and 390” proves browser printing at the pack step, template editing and versions at both widths; “held Stripe sandbox verifies ACH ownership and applies one invoice payment at 1440 and 390” proves actual held-key US Stripe checkout, microdeposit verification, one invoice application and paid links at both widths (`tests/browser/ach-live.mjs`, explicit live run 22 October 2026). `tests/api/costing.test.mjs` — “invoice-specific Stripe checkout verifies ACH success once and expires paid or changed links” proves the emailed PDF’s own link, verification and processing versus payment, exact balance, replay, paid, credit and void expiry, private invoice scope and uncertain-request custody. [Business documents](docs/business-documents.md). | Recurring live ACH acceptance requires a held US Stripe sandbox account and key in the acceptance runner. The named Nightly acceptance job runs the ordinary document screens; the cited live ACH journey remains explicit and is skipped without that account. Earlier 22 October sandbox evidence is retained, but does not establish recurring coverage. |
| `BUY-001` | Demand and lead-time replenishment | target | partial | `tests/api/replenishment.test.mjs` — “native channel demand and shipments reconcile once across dispatch, cancellation and planning windows” and “sell-through drafts an approved supplier PO and re-promises backorders by email”; `tests/browser/reorder-list.spec.ts` — BUY-005 buyer journey, native demand review at 1440 and 390 | Native demand now combines native shipments with mapped channel orders at their first Pier capture, net of cancellations and without counting linked shipments twice; company totals and buyer-applied learned parameters retain source references. The public comparison command adds exact cash-capped and minimum, recommended and stretch horizon options, including supplier rounding, freight, duty, draft netting and receipt recalculation; `tests/api/replenishment.test.mjs` — “cash and service horizon comparisons net supply and drafts with exact supplier rounding” proves this slice. Remaining: MIGRATE-002 incumbent history and CHANNEL-001 historic backfill, stockout-censor correction, seasonality, promotions, full seasonal cash and service optimization, comparison UI, transfer alternatives and backtesting. |
| `BUY-002` | Purchase approval limits and spend routing | target | partial | `tests/api/purchase-send.test.mjs` — “purchase approval routes exact landed spend and exceptions to named humans with revocable delegation” proves threshold routing, supplier and exception limits, delegation, escalation and agent denial; “BUY-006: an agent sends only the exact bounded human-approved purchase once” proves exact PDF bytes, delegated sends, expiry, revocation, duplicate refusal and uncertain outcomes; “supplier price and date evidence stops pending sends until exact human review and retains partial cancellations” proves material changes, renewed spend review, both send doors and partial and full cancellation; `tests/api/replenishment.test.mjs` — “sell-through drafts an approved supplier PO and re-promises backorders by email” proves recorded acknowledgments; `tests/api/floor.test.mjs` — “confirmed SSCC receives every 856 pallet line once and invalid notices leave stock unchanged” proves retained original ASN and once-only receiving; `tests/browser/journey.spec.ts` — “purchase approval names spend authority and exposes supplier re-approval at 1440 and 390” proves visible authority and stopped sends at both widths. | Unasserted: duty in the routed spend, inclusive ceilings, the delegate's restriction to current unrestricted owners or buyers, the audit of an escalation, and invalidation of pending send authority by a policy edit. Asserted: routing to the named buyer, denial of an agent's approval, landed goods, freight and tax spend, supplier and exception-type precedence, uncovered-spend refusal, the minimum-order exception, expired and current delegation, owner escalation and invalidated approval after a policy edit. |
| `BUY-006` | Exact-version supplier sends and acknowledgments | target | partial | `tests/api/purchase-send.test.mjs` — “purchase approval routes exact landed spend and exceptions to named humans with revocable delegation” proves threshold routing, supplier and exception limits, delegation, escalation and agent denial; “BUY-006: an agent sends only the exact bounded human-approved purchase once” proves exact PDF bytes, delegated sends, expiry, revocation, duplicate refusal and uncertain outcomes; “supplier price and date evidence stops pending sends until exact human review and retains partial cancellations” proves material changes, renewed spend review, both send doors and partial and full cancellation; `tests/api/replenishment.test.mjs` — “sell-through drafts an approved supplier PO and re-promises backorders by email” proves recorded acknowledgments; `tests/api/floor.test.mjs` — “confirmed SSCC receives every 856 pallet line once and invalid notices leave stock unchanged” proves retained original ASN and once-only receiving; `tests/browser/journey.spec.ts` — “purchase approval names spend authority and exposes supplier re-approval at 1440 and 390” proves visible authority and stopped sends at both widths. | Unasserted in the cited evidence: the Managed relay's text-only message, its attachment-unavailable notice and its refusal of purchase PDF sends; `tests/api/managed-mail.test.mjs` sits outside this clause's evidence. Asserted: a once-only approved send with exact retained PDF bytes, the shared correspondence identity of both send doors, and visible uncertain sends that are never resubmitted. |
| `BUY-007` | Supplier changes, re-approval and cancellations | target | partial | `tests/api/purchase-send.test.mjs` — “purchase approval routes exact landed spend and exceptions to named humans with revocable delegation” proves threshold routing, supplier and exception limits, delegation, escalation and agent denial; “BUY-006: an agent sends only the exact bounded human-approved purchase once” proves exact PDF bytes, delegated sends, expiry, revocation, duplicate refusal and uncertain outcomes; “supplier price and date evidence stops pending sends until exact human review and retains partial cancellations” proves material changes, renewed spend review, both send doors and partial and full cancellation; `tests/api/replenishment.test.mjs` — “sell-through drafts an approved supplier PO and re-promises backorders by email” proves recorded acknowledgments; `tests/api/floor.test.mjs` — “confirmed SSCC receives every 856 pallet line once and invalid notices leave stock unchanged” proves retained original ASN and once-only receiving; `tests/browser/journey.spec.ts` — “purchase approval names spend authority and exposes supplier re-approval at 1440 and 390” proves visible authority and stopped sends at both widths. | Unasserted: that a supplier change stops pending chases. Asserted: re-approval after a supplier price and date change, retained source and previous lines, refused sends until exact review under the spend route, received goods that cannot be cancelled, and once-only 856 receiving through the reviewed door. |
| `BUY-003` | Supplier returns and purchase credits | target | partial | `tests/api/supplier-returns.test.mjs` — “BUY-003: quarantine, supplier authority, once-only dispatch, credit and replacement evidence preserve receipt and outstanding PO” proves partial receipt rejection, authorization, dispatch, matched supplier credit allocation and readback after response loss, duplicate and excess refusal, return journals, original landed-cost replacement shares, one payable, unchanged original receipt and PO, and preserved physical history. `tests/browser/supplier-returns.spec.ts` — “BUY-003: staff quarantine, authorize, dispatch and reconcile supplier evidence with connector recovery” proves the same operator flow and explicit owner posting at both widths. The supplier-credit journey uses Pantry revision e987ba0a2270a81c62d399c44c6e05d3b504bb07 through authenticated HTTP, with explicit native owner review of Pantry duplicate evidence and only response loss injected at the network edge. | Unasserted: an insufficient open balance or mismatched readback keeping a supplier credit in review, and a remaining clearing expense stated as a non-credited cost. Asserted: partial rejection, authorization, dispatch, credit and replacement, duplicate and excess refusal, preserved receipt, PO and stock, matched credit allocation after response loss and replacement landed-cost shares. |
| `BUY-004` | Three-way matching and supplier performance | target | done | `src/pier/books/supplier-bills.ts`; `src/pier/books/supplier-charges.ts`; `src/pier/books/supplier-bill-documents.ts`; `src/pier/supplier-inspections.ts`; `src/pier/supplier-performance.ts`; `src/pier/purchasing.ts`; `src/pier/floor/receiving.ts`; `src/ui/books/supplier-bills.tsx`; `src/ui/books/supplier-bill-documents.tsx`; `src/ui/purchasing.tsx`; `tests/api/books.test.mjs`; `tests/api/books-landed.test.mjs`; `tests/api/supplier-bill-documents.test.mjs`; `tests/api/supplier-performance.test.mjs`; `tests/browser/supplier-bills.spec.ts` |  |
| `BUY-005` | Reorder-point list and suggested quantities | target | partial | `src/pier/replenishment.ts`; `src/pier/replenishment-position.ts`; `src/pier/replenishment-scope.ts`; `src/pier/reports.ts`; `src/ui/reorder-batch.tsx`; `src/ui/replenishment.tsx`; `src/ui/reports.tsx`; `tests/api/reorder-list.test.mjs`; `tests/api/replenishment.test.mjs`; `tests/browser/reorder-list.spec.ts` | Unasserted in the cited evidence: the on-order term, and the reorder point and method, shown on each A, B, C and E line (the test reads on-hand, reserved, backorders, inbound transfers, position, unrounded need, rounded and final quantity against an independent calculator, but never the on-order figure, and reads the applied reorder point only for SKU E in later settings). Asserted: the East and West scenario built through public commands, exactly A 48, B 66 from S2, C 10 and E 13 at East, D not listed, and those other calculation terms on each listed line. |
| `BUY-008` | Reorder drafts, coverage and one low-stock definition | target | partial | `src/pier/replenishment.ts`; `src/pier/replenishment-position.ts`; `src/pier/replenishment-scope.ts`; `src/pier/reports.ts`; `src/ui/reorder-batch.tsx`; `src/ui/replenishment.tsx`; `src/ui/reports.tsx`; `tests/api/reorder-list.test.mjs`; `tests/api/replenishment.test.mjs`; `tests/browser/reorder-list.spec.ts` | Unasserted in the cited evidence: that deleting the S2 draft leaves every other line's suggestion and draft mark unchanged (only B's restored 66 is read after the delete). Asserted: one action creates the two drafts with their lines, a rerun shows the four lines each marked with its draft and zero remaining, B's 66 is restored, committing B's PO removes B, company-wide replenishment removes E, the AUTO-001 exceptions and the REPORT-002 low-stock report match the list in each setting, and an independent calculator computes every expected quantity. |
| `COST-001` | USD valuation, landed cost and cost of goods | target | partial | `tests/api/books-landed.test.mjs` — “landed receipts and late weight-allocated bills reconcile Pantry after partial shipment, return and response loss” proves receipt FX, exact weight shares, late inventory and COGS and mapped damage expense, retained originals, replay and uncertain readback; “FIFO and moving-average late bill deltas reconcile exact Pantry inventory, net COGS and shipment margin across two cost layers” proves reviewed USD openings, both methods, approved Pantry balances, fractional-cent review and period-lock refusal at the network edge. `tests/api/returns.test.mjs` — “one-scan returns restock, quarantine and write off actual dispatches with native Pantry credits and exact costs” proves reason mappings, approval limits, atomic refusal and exact expense. `tests/browser/journey.spec.ts` — “receipt FX, weight allocation, late bills and mapped write-off settings remain reviewable at 1440 and 390” proves the operator screens at both widths. `tests/api/supplier-returns.test.mjs` — “BUY-003: quarantine, supplier authority, once-only dispatch, credit and replacement evidence preserve receipt and outstanding PO” proves retained insurance and other charge shares on replacements and exact Pantry inventory. | Unasserted: unbuilt baseline documents and unmapped prior adjustments staying in explicit review. Asserted: receipt FX, freight and duty split in whole cents, weight allocation, late-bill supplemental shares with unchanged original lines, FIFO and moving-average reconciliation, fractional-cent review and period-lock refusal. |
| `COST-002` | Write-off reason codes and approval limits | target | partial | `tests/api/books-landed.test.mjs` — “landed receipts and late weight-allocated bills reconcile Pantry after partial shipment, return and response loss” proves receipt FX, exact weight shares, late inventory and COGS and mapped damage expense, retained originals, replay and uncertain readback; “FIFO and moving-average late bill deltas reconcile exact Pantry inventory, net COGS and shipment margin across two cost layers” proves reviewed USD openings, both methods, approved Pantry balances, fractional-cent review and period-lock refusal at the network edge. `tests/api/returns.test.mjs` — “one-scan returns restock, quarantine and write off actual dispatches with native Pantry credits and exact costs” proves reason mappings, approval limits, atomic refusal and exact expense. `tests/browser/journey.spec.ts` — “receipt FX, weight allocation, late bills and mapped write-off settings remain reviewable at 1440 and 390” proves the operator screens at both widths. `tests/api/supplier-returns.test.mjs` — “BUY-003: quarantine, supplier authority, once-only dispatch, credit and replacement evidence preserve receipt and outstanding PO” proves retained insurance and other charge shares on replacements and exact Pantry inventory. | Unasserted: the default approval limit of zero USD, equality within the limit and the refusal of a reason-less write-off. Asserted: a damaged write-off posts to its mapped account with the damaged code, an owner-set limit and its recorded approver. |
| `REPORT-001` | Operational reports and saved analysis | target | partial | `src/pier/reports.ts`; `src/ui/reports.tsx`; `tests/api/costing.test.mjs` | Valuation, shipment margin by SKU/channel/customer, dead stock, UTC date filters, source links and exact CSV exports are implemented. Owner saved filters, retained as-of snapshots, scheduled once-only private snapshots, warehouse/customer/channel/variant filters and exact server CSV exports now pass tests/api/costing.test.mjs (saved warehouse reports retain exact as-of snapshots and scheduled exports without exposing foreign stock). Restricted grants cannot read report/snapshot doors. Full catalog, complete REPORT-002 reconciliation/definitions, financial scope projections and PIER-SCALE-1 capacity measurement remain; filtered reports omit installation-wide reconciliation rather than expose global totals. |
| `REPORT-002` | Report definitions and independent reconciliation | target | partial | `src/pier/reports.ts`; `src/pier/valuation-ledger.ts`; `tests/api/costing.test.mjs` | Kits, aging, turnover and the other target reports remain; margin excludes tax and financial credits. Implemented: UTC as-of native valuation and operational receipt/return/adjustment/COGS reconciliation, shipment margin and N-day SKU/bin dead stock; stock first ages from arrival, then from a sale/transfer, and receipts and status changes preserve an existing clock (`src/pier/stock-inactivity.ts`; `tests/api/slow-stock.test.mjs`). The current low-stock report shares BUY-005’s exact scope and trigger (`tests/api/reorder-list.test.mjs`). |
| `REPORT-003` | Reports across cutover, as-of dates and ledger tie-out | target | partial | `src/pier/reports.ts`; `src/pier/valuation-ledger.ts`; `tests/api/costing.test.mjs` | Imported history and ledger and closed-period reconciliation remain. |
| `CHANNEL-001` | Connected channel orders, mapping and lifecycle | target | partial | `src/pier/channels/`; `src/ui/channels/`; `tests/api/channels.test.mjs`; [Sales channels](docs/channels.md) | Live Stall links paid checkout reservations and reads Pier stock with a Pier-issued scoped key, which the owner pastes with Pier's address into Stall's own Settings page; Stall orders carry each line's unit price and USD, and any unpriced order is priced once from its order page. WooCommerce REST orders, signed webhooks and stock writes; Shopify GraphQL/Amazon SP-API adapters exercised with synthetic recorded network fixtures pending owner accounts. Exact SKU/manual listing matching and fixed and versioned source routing. Full lifecycle/refunds and the other channels remain. |
| `CHANNEL-003` | Channel stock publication and protected holds | target | partial | `src/pier/channels/`; `src/ui/channels/`; `tests/api/channels.test.mjs`; [Sales channels](docs/channels.md) | Protected source holds, per-channel buffers, background stock publication and one-minute reconciliation with visible acceptance/lag exist, and scoped Stall reads use eligible warehouse availability net of holds, reservations and buffer. Multi-location provider publication, the production percentile and asynchronous provider processing acceptance remain. |
| `CHANNEL-004` | Faire wholesale orders | target | partial | `src/pier/channels/`; `src/ui/channels/`; `tests/api/channels.test.mjs`; [Sales channels](docs/channels.md) | No Faire adapter exists yet. |
| `CHANNEL-005` | Amazon FBA location | target | partial | `src/pier/channels/`; `src/ui/channels/`; `tests/api/channels.test.mjs`; [Sales channels](docs/channels.md) | FBA shipment and inventory-report reconciliation remain. |
| `CHANNEL-006` | Channel order history backfill | target | partial | `src/pier/channels/`; `src/ui/channels/`; `tests/api/channels.test.mjs`; [Sales channels](docs/channels.md) | Historic channel backfill remains. |
| `CHANNEL-002` | Channel order money: tax as charged, payments, clearing accounts and payouts | target | partial | `src/pier/channel-payment.ts`; `src/pier/books/shop-payment.ts`; `src/pier/books/adapters/pantry-payment.ts`; `tests/api/books-shop.test.mjs` | A scoped Stall key records its Stripe-confirmed USD payment reference. Each shipped share applies once to its Pantry invoice in an owner-picked bank/clearing account; response loss recovers by source reference and reversals require review. Channel tax/shipping charges, refunds, Stripe fees and payout reconciliation remain absent. |
| `EDI-001` | Retail EDI trading partners | target | partial | `src/pier/edi/`; `src/ui/edi/`; `src/pier/edi-labels.ts`; `tests/api/edi.test.mjs`; [Retail EDI](docs/edi.md) | X12 004010 850 intake/997, BP/UPC mapping and fixed or versioned rule-routed orders, reviewed 855 decisions, closed-pack 856 with unique SSCC cartons and post-shipment 810. Required/sent/late windows, rejected 997 and uncertain delivery recovery are visible. One real HTTP bridge adapter uses synthetic network-edge fixtures; actual SPS/Orderful account, AS2/SFTP/VAN selection, retailer guides/certification, richer conditions and physical printer acceptance remain pending. RER Managed provider egress is unavailable. The owner page labels network sending coming, explains manual original-file intake, and links the bridge contract in `docs/edi-bridge.md`. |
| `SHIP-001` | US rates, labels, tracking and notifications | target | partial | `src/pier/shipping/`; `src/ui/shipping/`; `tests/api/shipping.test.mjs`; `docs/shipping.md` | Measured-carton EasyPost rates, reviewed address correction, purchase/reconciliation, PDF/ZPL download, tracking mail and delivered-event closure through documented synthetic network recordings. Real carrier account/postage/printer acceptance, void/refund, ShipStation, channel/accounting publication and Managed egress remain pending. |
| `SHIP-002` | Pallet and LTL freight | target | partial | `src/pier/shipping/`; `src/ui/shipping/`; `tests/api/shipping.test.mjs`; `docs/shipping.md` | LTL quotes, booking, the VICS bill of lading and pallet-label flow and freight-invoice reconciliation remain pending. |
| `ACCOUNT-001` | Two-way QuickBooks Online reconciliation | target | partial | `src/pier/books/`; `src/ui/books/`; `tests/api/books.test.mjs`; `tests/api/books-landed.test.mjs`; `src/pier/books/receipt-closure.ts`; [Books](docs/books.md) | Real Pantry matched supplier-invoice payables through a revocable scoped integration credential, native receipt readiness, shipment invoices/COGS, payment allocations back, inventory-value comparison and one refusal/uncertainty queue. With freight and duty allocated by value, COGS, return cost, a whole-cent freight-and-duty journal and valuation post and Pantry's inventory account equals Pier's valuation; an unknown outcome Pantry never received is re-sent with its original idempotency keys on the owner's Check Pantry (`tests/api/books-landed.test.mjs`). Books settings opens independently. Current inventory is compared through the latest source-document date, avoiding UTC omission of a locally dated supplier bill. Paid Stall invoices receive their confirmed payment through Pantry’s scoped payment API (`tests/api/books-shop.test.mjs`), and missing restored credentials appear before sync. Receipt accounting follows unbilled units through exact invoice allocations, confirmed Pantry readiness, posted freight/duty journals and zero-balance closure; supplier-payment reversals reopen it without stale readiness replay (`tests/api/books.test.mjs`). QBO adapter uses documented synthetic protocol fixtures; CSV/IIF export is available. Owner QBO app/OAuth, actual company acceptance, taxable sales, late bills/credits and full period/reversal mapping remain. Pantry item/valuation snapshots are evidence documents. Pier has no direct QuickBooks Online connection today. |
| `ACCOUNT-002` | Two-way Xero reconciliation | target | partial | `src/pier/books/adapters/xero.ts`; `tests/fixtures/books/`; `tests/api/books.test.mjs` | Shared typed transport for untracked items, USD invoices/bills, balanced journals, payment readback and receipt attachments on documented synthetic protocol fixtures. Owner app/OAuth, actual tenant acceptance, mappings and full reconciliation remain unavailable. |
| `PAY-001` | Provider-backed customer payments | target | partial | `tests/api/costing.test.mjs` — “invoice-specific Stripe checkout verifies ACH success once and expires paid or changed links” proves invoice-specific retained-email links, partial ACH/processing, once-only readback/events, exact native balances, paid/credit/void expiry and uncertain custody; `tests/browser/journey.spec.ts` — “held Stripe sandbox verifies ACH ownership and applies one invoice payment at 1440 and 390” proves actual US Stripe ACH verification/payment and the paid page (`tests/browser/ach-live.mjs`, explicit held-key run 22 October 2026). | PRINT-001 prerequisite subset only: owner-consented encrypted Stripe connection, card/USD ACH hosted checkout and invoice-specific verification/readback/link closure exist. Square, actual card acceptance, refunds/disputes, fees/deposits, authoritative TAX-001/provider-tax and connected ledger settlement remain unimplemented or unproved; connection/refund revocation financial acceptance remains. PAY-001 retains those full obligations; no refund or external ledger/tax posting is claimed. |
| `SYNC-001` | Visible integration health and safe recovery | target | partial | `src/pier/integration-health.ts` and `src/ui/channels/health.tsx` provide current owner-only scope, successful-sync times, explicit cursor semantics, lag, mapped identities and pending, failed and uncertain effects for every existing Pier connector class. Health and exact 120-second lag: `tests/api/stock.test.mjs` — “stock consumers resume only acknowledged pages and replay stable events after Worker restart”; warehouse scope and four adapter response-loss recoveries: `tests/api/channels.test.mjs` — “channel order reserves once and publishes net stock to every channel within a minute” and “owner routing versions choose zones, shortage policy, reroute and net channel publication without FBA stock”. Signed, duplicate and stale intake, one label purchase, guarded replay, audit and durable revocation: `tests/api/shipping.test.mjs` — “packed order → verified rates → label → emailed tracking → delivered shipment”; `tests/api/costing.test.mjs` — “invoice-specific Stripe checkout verifies ACH success once and expires paid or changed links”. Books intent, matching readback, one posting and local revocation after restart: `tests/api/books.test.mjs` — “Pantry connects with a scoped credential and picked accounts; a matched invoice posts a ready payable, replays never duplicate, and revocation shows a broken connection”. EDI uncertainty and explicit receipt reconciliation: `tests/api/edi.test.mjs` — “retailer 850 through line decisions, packed SSCC ASN and shipped invoice over the EDI edge”. Paid model claims, separate consent, signed originals, secret exclusion and no automatic retry: `tests/api/item-agent.test.mjs` — “standalone AI setup encrypts keys and explanations use one declared provider request without automatic retries”; `tests/api/security-import.test.mjs` — “retained originals and signed mail produce cited hostile drafts; corrected owner review routes and approves once” and “document paid claims send once across concurrency, image input and failed or uncited provider outcomes”. Uncertain mail remains retained without resending: `tests/api/costing.test.mjs` — “versioned case quotes retain discounted tax PDFs, exact approval and once-only acceptance”. Desktop and phone health, pause, expired-session recovery and resolved-effect replay with unchanged remote document identities: `tests/browser/stock.spec.ts` — “STOCK-001: stock totals” and `tests/browser/supplier-returns.spec.ts` — “BUY-003: staff quarantine, authorize, dispatch and reconcile supplier evidence with connector recovery”, both invoked by push Verify. Provider fakes replace only the network edge; Pantry runs its real Worker. | Current owner-only connector health, scoped recovery links, stock acknowledgement times and durable shipping pause are implemented. Existing native recovery and provider-edge proof are retained. Full acceptance and revised DONE evidence judgment remain pending; no status promotion is made in this integration. |
| `THIRDPL-001` | 3PL fulfillment and daily stock reconciliation | target | missing |  | No ShipHero or Extensiv adapter exists. |
| `API-001` | Documented authenticated stock commands | target | done | `API.md`; `src/pier/api.ts`; `tests/api/flows.test.mjs`; `tests/api/security-import.test.mjs`; `tests/api/stock.test.mjs` — “stock consumers resume only acknowledged pages and replay stable events after Worker restart” |  |
| `API-002` | Webhooks and Zapier automation | target | missing |  | No outbound business webhook or Zapier connector exists. |
| `AUTO-001` | Follow exceptions until their work closes | target | partial | `src/pier/replenishment.ts`; `src/pier/backorders.ts`; `src/pier/purchasing-workflow.ts`; `src/pier/correspondence-delivery.ts`; `tests/api/replenishment.test.mjs`; `tests/api/slow-stock.test.mjs`; `tests/api/reorder-list.test.mjs`; `tests/api/books.test.mjs` — “Pantry connects with a scoped credential”: partial receipt and uncertain ledger refusal, exact receipt and shipment closure, payment reversal reopening and lost Pantry authority; `tests/api/operational-exceptions.test.mjs` — “overdue cases deduplicate”: assignment, next action, escalation, restart, duplicate checks and current-owner cancellation; `tests/browser/operational-exceptions.spec.ts` — “owners assign overdue cases”: case handling at 1440 with retained desktop and phone screens. | Native low-stock, slow-stock, supplier chases and customer promise policies remain proven by their existing tests. Native overdue confirmation and late customer delivery cases now retain assignment, due date, next action and once-only escalation. Closure requires actual complete receipt or shipment and current reconciled Pantry evidence; reversal or lost reconciliation reopens work. Explicit owner cancellation retains its reason and does not cancel source obligations. No new outbound authority is granted. Held remainder: WhatsApp sender is not held; Slack and WhatsApp notification implementation and live qualification, live notification acceptance through every named service, remaining count and integration checks, wider tracking coverage and complete provider-connected supply, shipment and ledger acceptance remain unproved. AUTO-002 approval-policy rulings and existing account dependencies remain unchanged. |
| `AUTO-002` | Controlled workflow rules | target | partial | `tests/api/replenishment.test.mjs` — “bounded workflow dry-runs, vendor and spend limits, worker loss and pause preserve human approval”; `src/pier/workflow-rules.ts` | Owner rules cover inventory inspection, unapproved PO drafts and private report snapshots with exact dry runs, warehouse and vendor scope, per-run and UTC-day budgets, durable outcomes and worker-loss escalation. Jobs pin the rule snapshot; drafts retain rule id, revision, job and draft-only mark. Editing pauses the rule and immediately escalates queued work. Resolved outcomes cannot be overwritten by fresh duplicate commands to release consumed budget. Remaining: allocation and routing rules, reminder rules, and explicitly authorized approval policies with separation of duties. No automatic approval or external send is granted by these rules. |
| `DOC-001` | Evidence documents and order extraction | target | partial | `tests/api/security-import.test.mjs` — “retained originals and signed mail produce cited hostile drafts; corrected owner review routes and approves once” proves upload and signed emailed multipage originals, citations/ambiguities, corrected route/price preview without effects, exact once-only approval, source/PO duplicates, unauthorized downloads and unsafe-file refusal; “document paid claims send once across concurrency, image input and failed or uncited provider outcomes” proves PNG/JPEG, bounded bodies, paid-request custody, no automatic retry and refusal of uncited/failed output. `tests/browser/journey.spec.ts` — “private multipage originals produce cited corrected order previews and one approved order at 1440 and 390” proves actual held-key OpenAI multipage extraction, hostile/ambiguous citations, corrected preview without effects and one approved order at both widths. [Evidence documents](docs/evidence-documents.md). | Governed archive, erasure and retention of originals remain with DATA-001 and DATA-002, and SEC-002 holds the wider attachment and egress obligation. The actual OpenAI extraction and corrected approval passed at both widths. Signed receiving intake is protocol-proved; no live receiving-domain receipt is claimed. |
| `MIGRATE-001` | Switch from supported inventory systems | target | partial | `src/pier/import-incumbent.ts`; `src/pier/import-reconcile.ts`; `tests/api/movein.test.mjs`; [Move in](docs/move-in.md) | Documented synthetic exports from the supported source inventory systems cover SKU variants, bins, USD stock and cost, suppliers and customers and open sales and PO lines through explicit mappings, independent bin/unit/value controls, atomic apply, replay and safe undo. Native CSV openings take USD or another ISO currency at a recorded USD rate (PIER-003). Owner export and QBO reconciliation, APIs, other named sources, terms/prices/tracked stock, source FIFO dates, exact allocations, settings and history remain incomplete. |
| `MIGRATE-002` | Sales, purchase and consumption history at cutover | target | missing |  | No history record or importer exists; the native kit in `src/pier/imports.ts` carries openings and open documents only, and the native exit snapshot omits historic movements and shipments. |
| `ADMIN-001` | Role and warehouse permissions | target | partial | `tests/api/security-import.test.mjs` — “roles, agent preparation, revoked session, stale human approval and direct HTTP denial” proves native role and session revocation, expiry, exact warehouse and location scope, private-door refusal and unchanged business state after denial; “scoped warehouse receipts, picks, packs, slips and dispatch retain physical authority after revocation” proves scoped receiving, picking, packing, dispatch, safe physical slips, exact replay and revoked reads and results; “commercial role reads, downloads and recovered results enforce current cost and price restrictions” proves the role matrix across state, private read, export and download doors, cost and price restrictions, prepared approval revocation, denial without egress and refusal of results from a previous role revision. `tests/api/purchase-send.test.mjs` — “purchase approval routes exact landed spend and exceptions to named humans with revocable delegation” proves spend ceilings, supplier and exception precedence, named humans and expiring delegates. `tests/browser/journey.spec.ts` — “current warehouse and commercial grants govern receipt, packing, documents and revocation at 1440 and 390” proves operational grant screens, safe slips, revoked state and saved commercial restrictions; “owners assign and revoke expiring location grants at 1440 and 390” proves invitation and expiry controls. [Staff authority](docs/permissions.md). | Wider explicit sales and accountant delegation and broader typed-field grants remain unimplemented and unproved; they are retained product obligations. Scoped receiving, picking, packing, dispatch and fresh physical slips, finite role read projections, cost and price restrictions, current-result admission and existing purchase approval limits are implemented and exercised. |
| `ADMIN-002` | SSO, provider outages and service credentials | target | partial | `tests/api/security-import.test.mjs` — “native factors bind assurance to sessions, revoke prepared writes and recover only under audited owner control” proves session-bound enrollment and expiry recovery, shared attempt throttling, required-factor refusal of existing and new sessions, consumed-code replay refusal, current document and export gates, recovered-result denial, atomic prepared-write revocation, all-device revocation with fresh sign-in, local deprovisioning, audited recovery and restart. `tests/portable.mjs` proves inactive factor restore and fresh native owner recovery. `tests/browser/journey.spec.ts` — “native authenticator enrollment, required sessions and owner recovery are usable” exercises the Security forms and captures enrollment, denial, replay refusal and owner controls at 1440 and 390. `RULINGS.md` records CT approval with riders. The same native-factor test invokes `tests/api/security-delegation.mjs` for named human grants, foreign and owner target refusal, current factor assurance, prepared revocation and expiry, compatibility-route refusal, fresh recovery-owner preparation and exact audit actor and target. The browser journey also exercises human grant creation, delegated session revocation and immediate grant removal. These are native local proofs only. | Google Workspace and Microsoft Entra ID enrollment and sign-in, fail-closed provider-outage behavior, imported-identity refusal, SSO-linked deprovisioning, revoked existing and new private access, and separately scoped, rotated and revocable service credentials remain unproved. At this pin, the Google redirect URI and test user and a licensed Entra mailbox are not set up. |
| `ADMIN-003` | Native factor administration and owner recovery | target | partial | `tests/api/security-import.test.mjs` — “native factors bind assurance to sessions, revoke prepared writes and recover only under audited owner control” proves session-bound enrollment and expiry recovery, shared attempt throttling, required-factor refusal of existing and new sessions, consumed-code replay refusal, current document and export gates, recovered-result denial, atomic prepared-write revocation, all-device revocation with fresh sign-in, local deprovisioning, audited recovery and restart. `tests/portable.mjs` proves inactive factor restore and fresh native owner recovery. `tests/browser/journey.spec.ts` — “native authenticator enrollment, required sessions and owner recovery are usable” exercises the Security forms and captures enrollment, denial, replay refusal and owner controls at 1440 and 390. `RULINGS.md` records CT approval with riders. The same native-factor test invokes `tests/api/security-delegation.mjs` for named human grants, foreign and owner target refusal, current factor assurance, prepared revocation and expiry, compatibility-route refusal, fresh recovery-owner preparation and exact audit actor and target. The browser journey also exercises human grant creation, delegated session revocation and immediate grant removal. These are native local proofs only. | Scoped human security delegation, recovery-readiness guidance, sole-owner and loss-of-all-assured-owners recovery, and exact-SHA proof of the added acceptance riders remain outstanding. Existing native evidence establishes only its described subset. Native journeys establish no provider-operated recovery, hosted security or legal compliance assurance; owner-only administration is an interim default. |
| `SEC-001` | Atomic stock authority and exact arithmetic | target | partial | `src/pier/model.ts`; `src/pier/storage.ts`; `src/pier/api.ts`; `tests/api/flows.test.mjs`; `tests/api/security-import.test.mjs` | Carried at BASE-001's partial status, which this rewrite cannot raise: BASE-001's open item was naming its inherited Base duties and dated replacement decisions, now the Shared duties table. The cited files assert each point (fresh-judge candidate). |
| `SEC-002` | Private data, safe input and declared egress | target | partial | `tests/api/flows.test.mjs` — “Pier public Worker and D1 wholesale journey” proves complete native stock, import, return and count work with every outbound request refused and none attempted. `tests/api/security-import.test.mjs` — “native import reads USD by default, refuses an unknown currency naming the row, and values AUD rows through the batch's reviewed rate” proves hostile CSV text stays literal; the retained-originals journey proves bounded hostile attachments, origin and authority refusal, exact full-original and model consent, encrypted custody, absent secrets and revocation. `tests/api/books.test.mjs` proves provider error bodies and credentials absent and literal accounting CSV; `tests/api/shipping.test.mjs` proves redirect egress refusal. `tests/browser/journey.spec.ts` — “durable scan refusals and item edits are visible in scoped Activity filters at 1440 and 390” proves literal hostile text at both widths. `tests/api/security-import.test.mjs` — “commercial role reads, downloads and recovered results enforce current cost and price restrictions” and “scoped warehouse receipts, picks, packs, slips and dispatch retain physical authority after revocation” additionally prove current sensitive-read and result restrictions, physical documents without commercial content and no unauthorized egress. | Wider explicit sales and accountant delegation and broader typed-field grants remain unimplemented and unproved under ADMIN-001, so SEC-002's connection and egress delta for those doors is unproved. New record, connector, model and document doors inherit current authority and explicit egress obligations before shipping. |
| `DATA-001` | Complete portable archive and inactive restore | target | done | `tests/portable.mjs` — full public rer export / rer import journey proves corrupt refusal followed by valid empty-target restore, every business collection and source original compared, import journals/command outcomes/valuation history preserved, old session rejected and fresh owner reconnect required, all connection/automation/send authority paused, credential/session bytes absent, repeated import posts no duplicate opening and new receipt/undo work succeeds. Its later-journal journey refuses an older pre-erasure archive, restores the valid post-erasure archive and preserves stock without the erased original. `scripts/installer/archive-policy.mjs`; `IMPORT.md`; `OPERATIONS.md`. |  |
| `DATA-002` | Erasure, retention and legal holds | target | partial | `tests/api/security-import.test.mjs` — “owner-reviewed subject erasure clears linked private copies and queued messages while retaining stock and audit” proves dependency review, explicit confirmation, stale and hold refusal, private-copy deletion, queued-send cancellation, unchanged stock, anonymous identity and content-free exported history after restart; “erasing an operator revokes private authority and anonymizes the human label while keeping their stock provenance” proves session revocation and anonymous retained actor history after restart. “retained originals and signed mail produce cited hostile drafts; corrected owner review routes and approves once” proves attachment custody deletion and the atomic archive fence. `tests/browser/journey.spec.ts` — “owners inspect holds and erase reviewed customer copies with durable stock and anonymous history at 1440 and 390” proves the hold, confirmation, erased and Activity states. `tests/portable.mjs` proves older-archive refusal with a later journal and valid post-erasure restore. | No complete subject erasure is claimed for unsupported import, sales-file, EDI and channel custody, immutable personal audit or movement content, holds and unresolved remote work. Offline copies and delivered external messages remain outside local deletion; older archives are fenced rather than selectively merged. DATA-001, SEC-002 and ADMIN-002 inherit archive, private-copy and identity obligations as their doors expand. |
| `AUDIT-001` | Durable human and automated accountability | target | partial | `tests/api/floor.test.mjs` — “warehouse floor: receive, wave pick, pack and dispatch summary” proves scan resolution, refusals, edits, item filters, export and restart. `tests/api/channels.test.mjs` — “channel order reserves once and publishes net stock to every channel within a minute” proves separately durable provider intent and outcomes, exact sources, connector and item filters, export and restart. `tests/api/shipping.test.mjs` — “packed order → verified rates → label → emailed tracking → delivered shipment” proves retained uncertain label purchase and refused provider outcomes, exact source and approval metadata, restart and reconciliation without a second purchase. `tests/api/item-agent.test.mjs` — “bulk purchase reviews preview exact rows, edit, apply once with human authority and refuse changed inputs” proves purchase before and after prices, current authority and ordinary-command links in matching restart and export history; “standalone AI setup encrypts keys and explanations use one declared provider request without automatic retries” proves failed model attempt identities. `tests/api/security-import.test.mjs` — “native import graph revisions, grouped lines, frontier and safe undo” and “empty downstream import undo restores native snapshot and retains custody” prove atomic publication and correction history; its named owner-reviewed subject erasure and operator erasure journeys prove anonymous retained provenance and absence of erased content. `tests/browser/journey.spec.ts` — “durable scan refusals and item edits are visible in scoped Activity filters at 1440 and 390” and “owners inspect holds and erase reviewed customer copies with durable stock and anonymous history at 1440 and 390” prove the Activity and erasure screens. | Remaining unproved acceptance: complete sensitive edit schemas and every existing provider crash or refund path through Activity, export and restart. Durable admitted attempts and separate outcomes now cover model, channel, Books, EDI, payment, shipping and mail transports; safe business images retain exact authority and source versions. Supported subject and actor anonymization is proven; unsupported custody and immutable personal history refuse erasure. |
| `UX-001` | Usable desktop and mobile operations | target | partial | `src/ui/`; `tests/browser/journey.spec.ts` | Existing twelve journeys at 1440/390; new connected/scan/report paths absent |
| `SCALE-001` | Measured performance at wholesale volume | target | missing |  | No named scale fixture or performance measurement exists; `src/pier/native-capacity.ts` bounds native import size only. |
| `OPS-001` | Owned operation, health and onboarding | target | partial | `OPERATIONS.json`; `scripts/hosted.mjs`; `scripts/installer/local.mjs`; `tests/runtime.mjs`; `tests/portable.mjs` | Local lifecycle/archive evidence; hosted backup, backup check (its database deleted at the end), live restore from a backup file and point-in-time rewind run through `scripts/hosted.mjs` as [Put Pier online](docs/hosting.md) writes them; Own-account deployment is exercised on 18 October: real owner sign-in mail, empty initial business state, retained owner/data across redeployment, and USD 57.84 partial PO receipts through the UI at 1440px and 390px. `src/ui/channels/brand.tsx` uses build-time asset imports, resolving the hosted server render failure. Connected diagnostics, measured capacity and fresh macOS/Linux/Windows one-line starts remain incomplete |
| `OPEN-001` | Free and open source under the MIT license | target | done | `LICENSE`; `package.json`; `src/ui/channels/provider-cost.tsx`; `src/ui/books/connection.tsx`; `src/ui/shipping/settings.tsx`; `src/ui/edi/settings.tsx`; `tests/api/open.test.mjs`; `tests/browser/open.spec.ts` |  |
| `SURFACE-001` | The registry equals this table and the Base harness passes | target | missing |  | No MCP door, tool registry, class computation or company-policy chokepoint exists yet. |
| `SURFACE-002` | Stock work is standard and erasure or undo is destructive | target | missing |  | No MCP door, tool registry, class computation or company-policy chokepoint exists yet. |
| `SURFACE-003` | Purchasing calls carry money, commitment and external | target | missing |  | No MCP door, tool registry, class computation or company-policy chokepoint exists yet. |
| `SURFACE-004` | Sales, invoice and shipping calls carry money and external | target | missing |  | No MCP door, tool registry, class computation or company-policy chokepoint exists yet. |
| `SURFACE-005` | Connections are gated and publication is external | target | missing |  | No MCP door, tool registry, class computation or company-policy chokepoint exists yet. |
| `SURFACE-006` | Access and security calls name their direction | target | missing |  | No MCP door, tool registry, class computation or company-policy chokepoint exists yet. |
| `SURFACE-007` | A stranger agent runs a seeded week under two policies | target | missing |  | No MCP door, tool registry, class computation or company-policy chokepoint exists yet. |
| `AGENT-001` | Evidence-backed agent preparation | push-further | partial | `src/pier/proposals.ts`; `src/pier/item-agent/`; `src/ui/item-agent/`; `tests/api/item-agent.test.mjs`; `tests/api/flows.test.mjs`; `tests/api/security-import.test.mjs` | Unasserted in the cited evidence: preparing the reallocation, count-drift and migration proposal kinds as an agent, and refusal of a stale-version application. Asserted: an agent's refused approval, commit and stock transfer leave POs, movements and reservations unchanged, and an approved replenishment proposal executes. |
| `AGENT-002` | Optimize replenishment against cash and service | push-further | done | `tests/api/replenishment.test.mjs` — “captured channel demand retains stockout exposure, reviewed seasonal bounds and a held-out backtest” proves connected WooCommerce sell-through, stockout correction, seasonal and promotion bounds, held-out actuals and a retained scenario compared with later actual demand and landed cost; “supplier delays and realized contribution rank bounded purchases while transfer comparisons protect source demand” proves supplier reliability, cash and service ranking, authorized invoice prices, discounts, return credits without double counting, priced and dated executable transfers, source protection, revocation and once-only physical execution; “cash and service horizon comparisons net supply and drafts with exact supplier rounding” proves ceiling, MOQ, case packs and supply netting. `tests/api/purchase-send.test.mjs` — “BUY-006: an agent sends only the exact bounded human-approved purchase once” proves human approval, computed money and external facts, exact native policy decisions, expiry, revocation and material-input invalidation. `tests/api/books.test.mjs` — “an adjusted connected forecast follows its exact approved send through landed receipt and the real Pantry ledger” proves the complete connected forecast, unreliable supplier, cash and service choice, approved first send, blocked second send, actual receipt, landed cost, paid reconciled Pantry ledger and retained forecast explanation; “Pantry connects with a scoped credential and picked accounts; a matched invoice posts a ready payable, replays never duplicate, and revocation shows a broken connection” proves financial reversal and revoked-connection reopening. `tests/browser/journey.spec.ts` — “buyers compare reviewed replenishment scenarios and follow selected receipts to current ledger evidence” proves forecast settings, comparison, invalid-input recovery, exact purchase selection and receipt follow-through, with changed screens captured at 1440 and 390. Provider-edge fixtures follow D-4; historical backfill remains with CHANNEL-001 and MIGRATE-002, and shared MCP conformance remains with the SURFACE clauses. |  |
| `AGENT-003` | Close supplier confirmations and customer promises | push-further | partial | `src/pier/replenishment.ts`; `src/pier/backorders.ts`; `src/pier/purchasing-workflow.ts`; `src/pier/correspondence-delivery.ts`; `tests/api/replenishment.test.mjs` | Bounded approved supplier chases, recorded replies/confirmations, quantity-aware customer dates and approved re-promises/customer mail are implemented. Native receipt accounting now keeps unbilled goods, missing receipt quantities, uncertain posting and open payables visible through paid Pantry closure and reversal reopening (`src/pier/books/receipt-closure.ts`; `src/ui/books/receipt-closure.tsx`; `tests/api/books.test.mjs`). Direct Gmail/Microsoft 365 intake, ASN extraction, substitutes and complete supply/customer/ledger case closure remain incomplete. |
| `AGENT-004` | Repair channel oversell causes | push-further | partial | `src/pier/orders.ts`; `src/pier/proposals.ts` | Reservation evidence and reviewed reallocation only; connector correlation/repair and ledger closure absent |
| `AGENT-005` | Prove cutover and reconciliation | push-further | partial | `src/pier/imports.ts`; `src/pier/import-incumbent.ts`; `tests/api/movein.test.mjs` | Native and named incumbent opening reconciliation now retain originals and explicit field/row decisions, check independent bin/unit/USD totals (native CSV openings in USD, or another currency at the batch's recorded USD rate) and allow reviewed idempotent cutover/undo. Accounting mapping, other source objects and full history/closure remain incomplete. |
| `AGENT-006` | Live questions and reviewed bulk work | push-further | done | `tests/api/item-agent.test.mjs` — “live stock questions cite current granted bins without costs, customers or outside stock” proves restricted shortage evidence, exact bin grants, forbidden cost and outside-record refusal and live revocation; “late purchase answers cite outstanding quantities and stop reporting a completed receipt” proves dated outstanding quantities; “live margin answers retain observed losses and expose missing cost as unknown” proves loss and uncertainty; “supplier and date comparisons validate current terms without changing purchases or customer promises” and “allocation comparisons cite both orders and refuse excess while leaving live hard reservations unchanged” prove source-cited comparisons without mutation. “bulk purchase reviews preview exact rows, edit, apply once with human authority and refuse changed inputs” proves exact rows, cash and service impacts, affected promises, edits, mixed per-row authority, human approval, ordinary commands, stale refusal, once-only replay and audit links after restart and export. `tests/browser/journey.spec.ts` — “live answers and editable bulk purchase reviews retain exact human commands at 1440 and 390” proves all six question screens, restricted evidence, purchase and promise previews, edits, consent, approvals, stale refusal and exact Activity links at both widths, with no duplicate migration review. |  |
