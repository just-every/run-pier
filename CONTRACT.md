# Pier product contract

Pier is for the owner and operations staff of a small wholesaler buying finished goods and selling to known business customers. Its job is to answer what can be promised, what must be bought, and why a physical count differs from the record without requiring a full ERP project.

This document sets the required product behavior. The twelve first-release flows have local proof as recorded in [ACCEPTANCE.md](ACCEPTANCE.md); this does not establish hosted, provider, legal or physical-stock acceptance. A named test is a target, not evidence that a flow passed unless its result is recorded.

## Operating rules

- A new local installation begins without product, stock, order, forecast or provider records. The owner enters or reviews real business data.
- A stock position belongs to an item, location and status. Its quantity follows append-only signed movements. Available stock is sellable on-hand minus active reservations; quarantine, transit and expected receipts are not sellable.
- Once an item is referenced by stock movements, count lines, supplier terms, orders or purchase orders, its base unit and pack conversion cannot change; create a new SKU to use different units or pack semantics. Once movements or counts reference a location, its bin/transit kind cannot change.
- Quantities and per-unit cost/price use exact decimal inputs within six fractional places; derived receipt-cost totals retain twelve fractional places. Invalid precision, range, conversions or document limits fail before mutation.
- Every consequential write has a durable command identity. Retrying the same identity and payload recovers its original outcome; reusing the identity with different content fails.
- The active native session, actor and current edition role are checked inside the atomic SQL admission that posts the command. A failed admission leaves no movement, reservation, document or successful command outcome.
- Movements are append-only. Corrections point back to their source and use linked compensating movements. A database restore cannot claim that goods physically returned.
- Approval names an exact record version and its material terms. A changed quantity, supplier, price, promise or count frontier makes the earlier approval unusable.
- The interface and public API expose the same business rules. Tests through an API do not by themselves establish usable desktop and mobile journeys.

## First useful release: twelve operator journeys

These are the twelve numbered first-release flows. Their test targets and local evidence are listed in [ACCEPTANCE.md](ACCEPTANCE.md).

1. **Define stock.** An operator creates a SKU with barcode, base unit and exact pack conversion, assigns warehouse/bin locations and sellable or quarantine status, and archives a used SKU without erasing its history. Once referenced by movements, counts, supplier terms, orders or purchase orders, the unit and pack conversion stay fixed; a location's bin/transit kind stays fixed after a movement or count references it.
2. **Maintain counterparties and supplier terms.** An operator links suppliers and customers. A supplier-item record keeps the supplier code, pack, price, minimum order and lead time used by a purchase; each supplier/item pair has one versioned record, and later term edits do not rewrite an existing commitment or receipt.
3. **Review opening inventory.** An owner stages native CSV for item, location, counterparty, opening-position and open-document records, reviews mapping and reconciliation evidence, resolves ambiguous rows and approves a cutover that can post opening stock once. The optional `reservations` file preserves exact allocations for imported open order lines by bin, with an explicit zero row for wholly backordered lines; omitting it retains the six-kind behavior that reserves available stock. [IMPORT.md](IMPORT.md) defines the native source shape and review rules.
4. **Commit sales demand.** Sales staff enter order lines. Pier reserves available sellable quantities atomically and shows unmet demand as backorder. It never creates fictional stock, reserves the same unit twice or permits negative sellable stock.
5. **Replenish and approve purchasing.** A buyer reviews shortages and expected receipts, drafts a grouped supplier PO and approves the exact supplier, quantities, prices and promise date. Ordered units remain expected until received; a changed draft requires fresh approval.
6. **Receive part of a purchase.** A warehouse operator receives some or all of an approved PO into named bins, recording supplier reference and receipt cost. Remaining quantities stay expected, and an invalid line cannot partially post a receipt.
7. **Correct a receipt safely.** A warehouse person can reverse a receipt when no later movement depends on it. If downstream work exists, they capture and approve a physical count for a bin from that receipt; `receipt.correct` posts an exact compensating adjustment at that count frontier and links it to the receipt. Pier preserves the original receipt and refuses a correction based on a stale count.
8. **Transfer between locations.** A warehouse operator sends available stock through a real transit location and confirms destination receipt separately. Transit quantities cannot be promised or sold, and transfers conserve quantity.
9. **Dispatch part of an order.** A warehouse operator dispatches only against that order's own reservations. Shipment identity and links to order lines and consumed reservations remain visible; unshipped demand remains outstanding.
10. **Cancel demand and review returns.** Staff cancel only unshipped quantities and release only their remaining reservations. A return must point to an actual dispatch line, enters quarantine, and becomes sellable only after a separately reviewed restock.
11. **Reconcile a physical count.** A warehouse operator captures a movement frontier, records a physical count, reviews the variance and approves an exact adjustment or recount. If a movement occurs after capture, the old count cannot overwrite it.
12. **Investigate and leave with the data.** A person traces balances to movements, source documents, actors, reasons, command identities and reversal/import provenance. They can export business records and costs, and restore the complete installation archive into a fresh local installation without posting opening stock twice. Durable operator and approval identities remain audit evidence, not access grants; the restored owner must establish a fresh native session before operating.

## Agent preparation and human authority

Agents prepare evidence-backed proposals; a currently authorized human approves each exact consequence. The owner or agent cannot skip the normal document and stock commands. Phase one has no autonomous stock writes, self-approval or supplier sends.

- **Replenishment:** an agent gathers sales, backorders, lead times and expected receipts; calls out stockout-censored demand; proposes minimum, recommended and stretch quantities; and prepares a grouped PO. A buyer approves the exact supplier, price, quantity and promise date. Material input changes invalidate approval.
- **Shortage resolution:** an agent proposes which order reservations to reallocate and names the affected customer promises. An operator approves before priorities or reservations change.
- **Count drift:** an agent traces missing receipts, duplicate commands and transfers and drafts an evidence-linked correction. A warehouse person establishes the physical count and approves the adjustment or recount.
- **Migration:** an agent proposes source mappings and duplicate merges and shows reconciliation results. The owner reviews and approves the exact cutover.

Forecasts and proposals are separate from actual stock. A model prediction never adjusts the ledger. Phase one allows the owner's existing agent to prepare through the public commands without an embedded model account; generated sample data is not an acceptable substitute.

## Defaults and exclusions

The initial fit is finished-goods wholesale, Australian domestic operation, one legal entity and AUD. Pier uses hard reservations, forbids negative sellable stock and does not expire reservations automatically. Receipt cost is operational evidence only; an accountant retains inventory valuation, financial posting and tax decisions. “Pier” is the working product name, not a legal name-clearance claim.

The order of work is provider-free local stock proof, then migration demand from Zoho or inFlow, then one selected accounting/order adapter, then reviewed AI replenishment. Only the native CSV source shape is documented as supported now; provider-specific mappings remain unclaimed until real owner exports and independent reconciliation exist.

This product does not claim manufacturing/MRP, assemblies, serial or expiry tracking, regulated lot-release or recall assurance, bonded stock or customs, marketplace distribution, payments, a general ledger, tax filing, carrier or supplier networks, or autonomous purchasing. Hosted, provider, legal, name-clearance and physical-stock acceptance remain separate evidence boundaries.
