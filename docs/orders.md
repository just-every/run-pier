# Orders and dispatch

Every change to stock in Pier is a movement with a source document, the person who made it and their reason. You never edit a balance; you record what happened, and the balance follows.

## Take an order

In **Sales orders**, use **New sales order**: choose the customer, channel, optional promise date and the lines. Enter a USD unit price, or leave it blank to use the customer’s valid price tier. **Customer pricing** sets each item’s price, minimum quantity and optional validity dates. The order keeps its original price and exact total when that list changes. A line without a price is shown as unpriced. **Create and reserve available stock** reserves what is available straight away. Anything that is not available is shown as backorder; Pier never reserves the same unit twice or lets sellable stock go negative.

When more stock arrives, open the order and choose **Reserve newly available stock**.

## Dispatch in parts

Open the order with **Open order**. **Reserved sources for physical picking** lists the bins to pick from. In **Pick and dispatch reserved lines**, enter a shipment reference and only the quantities you physically picked, then **Confirm partial dispatch**. Dispatch uses this order's own reservations; the rest stays reserved for the order.

To stop the rest of an order, **Cancel remaining demand** releases only its unshipped reservations. What was already dispatched stays on record.

## Returns

A return points to the shipment line it came back from. **Return dispatched goods into quarantine** records it into a quarantine bin, where it is not available. In **Quarantine review**, enter only the inspected sellable quantity in **Review restock quantity** and choose **Approve partial restock**, then **Restock approved return**. Only that approved quantity becomes sellable; the remainder stays quarantined and needs a new review. To release everything still quarantined, choose **Approve exact return for restocking** instead.

To see where any of these numbers came from, see [Activity and proposals](activity.md).

## Review quotes and customer files

Choose **Quote** when entering a new sales order. Case quantities convert exactly to the SKU’s fixed base-unit pack size. Blank prices use the customer’s current quantity tier. A quote retains its price-list version, USD discount and tax estimate. The owner sets a state estimate table first; a missing table or unresolved exemption stops approval instead of inventing tax. Certificate references and expiry are retained, without claiming that Pier validated a certificate or contacted a tax provider.

In **Quote approval authority**, the owner chooses the approver role, which defaults to **Owner**. The owner may delegate to Sales operator or Buyer, with a retained reason and policy history. Agents cannot be approvers. Changing the policy requires renewed approval of open quotes. The designated role or owner uses **Review quote prices and margin** to approve the exact version and observed cost basis with a reason; acceptance and quote sending recheck that the approver still holds that role. **Email approved quote** approves one recipient and retains the exact PDF bytes before submitting to the configured installation mail provider. Open that PDF from the record. “Sent” means provider acceptance; failed, unavailable and uncertain submissions remain visible. An uncertain submission is not blindly sent again. Business PDFs use the versioned document templates and embedded Noto Sans described in [Business documents](business-documents.md); unsupported glyphs are refused explicitly.

**Accept quote** converts the same reserved quote record once. Replaying acceptance creates no second order. **Revise quote** preserves prior versions and PDFs, clears acceptance and approval, recalculates tax and reservations and requires renewed review. Picked or shipped work cannot be revised. **Email order confirmation** retains its own recipient, version, PDF and outcome.

Under **Review a customer order file**, paste UTF-8 CSV or select CSV/XLSX. Use these exact columns in order, with one row per line:

```csv
customer,poReference,item,quantity,unit,price,shipTo,state,postalCode,country,requestedDate,warehouse
```

Use a customer ID or exact name, SKU/barcode/customer item alias, `case` or the SKU’s base unit, decimal quantities and prices, ISO `YYYY-MM-DD` requested dates and a real warehouse. Blank prices use the current customer tier. The preview shows each row error, resolved price and actual routed warehouse; it creates no orders. Correct all errors, then approve the exact preview. Changes to relevant stock, prices, routing or the UTC day require a fresh preview. Reimporting the same content returns its retained batch; an existing customer PO reference cannot create another order.

Files are bounded to 1 MiB and 1,000 data rows. XLSX supports one worksheet containing plain text and numeric cells, with dates supplied as ISO text. Formulas, macros, external relationships, unsupported cell types, extra columns and malformed or oversized archive parts are refused. The original file bytes, digest and source rows stay with the reviewed batch. A batch whose retained preview exceeds the record limit must be split at customer PO boundaries.

## Choose warehouses before reservation

**Warehouse routing rules** selects a source: manual orders, customer files, a connected channel, retailer partner or recurring policy. A draft has no stock effect. Dry-run its last 30 days of orders, review the changed destinations, then activate that exact revision. Fixed mode chooses one warehouse. Channel-location mode follows an actual assigned provider location. Rule mode matches ZIP5, then ZIP3, state, country and default; equal-level overlaps are refused. Warehouse priority follows the owner’s list, never an invented nearest-warehouse rule.

A shortage either holds partial stock at the routed warehouse, tries the first eligible warehouse with the whole order, or splits by line. Splits require explicit owner-recorded customer permission. When permission is missing or declined, try the first eligible warehouse that can fill every line; if none can, hold partial stock and backorder the rest at the original warehouse. Each warehouse dispatches its own reserved quantities separately. A destination with no matching zone or default waits unreserved. FBA and other warehouses outside the source’s list remain ineligible.

On an unpicked order, **Reroute an unpicked order** requires an owner reason and atomically replaces its reservations. **Change ship-to before picking** applies the current routing rule again. Historical unpicked waves are invalidated rather than retaining obsolete picks. Activity retains the current owner, reason and exact released and replacement allocations; the same evidence remains in the business export after restart. An ineligible destination, a stale review or an order that has been picked or shipped is refused without changing business records. Publication follows eligible warehouses net of reservations, protected holds and buffers; separate writes to every mapped provider location remain pending. Faire is not yet connected.

## Authorize recurring demand

The owner first records an expiring **customer credit clearance**, allowance and reason. This is a reviewed budget, not a connected ledger balance. A hold, expired clearance or exhausted allowance stops new occurrences. The owner then explicitly enables a policy with customer, item lines, warehouse, UTC due day, cadence, price ceiling and stock policy. Choose **hold-on-change** to review a changed price; **current-with-ceiling** accepts current customer tiers only within the approved ceiling. **full-stock** holds an incomplete order; **backorder** permits the normal shortage outcome.

The scheduler admits at most one due occurrence per policy per pass and retains its generated order identity. Concurrent or repeated runs cannot duplicate a due date. Pausing prevents new occurrences; cancellation is terminal. Changing installation signing settings, including a fresh restore, requires renewed owner approval. A policy authorizes order creation only: it sends no mail and dispatches no stock.

## Record direct supplier dropships

**Direct supplier dropships** creates linked customer demand and a supplier PO carrying actual supplier cost and the direct customer address. Approve and commit the PO through Purchasing, then record the supplier’s confirmation. Record each actual partial shipment with its reference, date, carrier, tracking and exact quantities. Pier does not receive, reserve or dispatch those units through its own bins, and they do not become expected warehouse stock.

A customer credit is explicitly authorized against a shipped line with quantity, reference and reason. Its retained amount cannot exceed that shipment’s uncredited quantity. It starts as **not posted to books**. With Pantry connected, the owner chooses **Post customer credit to Pantry** to authorize the shipment invoice and its linked native customer credit note. Books retains the posting outcome and remote identity; a lost response is checked before any resend, and repeated commands cannot create another credit. This action changes no local stock and moves no cash. Supplier cancellation requires an explicit cancellation reference and cannot erase shipped history. Native CSV exit refuses active direct commitments; the complete business archive retains them.

The quote, send, routing and recurring defaults follow the 22 October owner ruling. Commercial approval defaults to Owner through the configurable approver role; explicit recipient consent remains owner-only. Staff retain the existing operational doors; new private originals and approval records are owner-only.

See [Business documents and invoices](business-documents.md) for retained templates, invoices, credits and payment links, and [Evidence documents](evidence-documents.md) for private originals and reviewed extraction.
