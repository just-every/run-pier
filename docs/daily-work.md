# Daily stock work

Every change to stock in Pier is a movement with a source document, the person who made it and their reason. You never edit a balance; you record what happened, and the balance follows.

## Take an order

In **Sales orders**, use **New sales order**: choose the customer, an optional promise date and the lines. **Create and reserve available stock** reserves what is available straight away. Anything that is not available is shown as backorder; Pier never reserves the same unit twice or lets sellable stock go negative.

When more stock arrives, open the order and choose **Reserve newly available stock**.

## Dispatch in parts

Open the order with **Open order**. **Reserved sources for physical picking** lists the bins to pick from. In **Pick and dispatch reserved lines**, enter a shipment reference and only the quantities you physically picked, then **Confirm partial dispatch**. Dispatch uses this order's own reservations; the rest stays reserved for the order.

To stop the rest of an order, **Cancel remaining demand** releases only its unshipped reservations. What was already dispatched stays on record.

## Returns

A return points to the shipment line it came back from. **Return dispatched goods into quarantine** records it into a quarantine bin, where it is not available. In **Quarantine review**, **Approve exact return for restocking** and then **Restock approved return** make it sellable again.

## Buy and receive

In **Purchasing**:

1. Keep each supplier's terms for an item in **Supplier-item terms**: supplier code, pack size, unit price, minimum quantity and lead time. **Reorder evidence** shows open demand, stock on hand and expected receipts to buy against.
2. **Draft supplier purchase order**, then **Save draft for exact review**. A draft changes nothing.
3. Choose **Review** on the order. A buyer approves that exact version (**Approve exact version …**), then **Commit approved order**. Committed quantities appear as **Expected**, never as available. Changing the order with **Revise purchase order** needs a fresh approval.
4. As goods arrive, **Partial receipt into bins**: pick the destination bin and the quantity and cost received for each line, then **Record receipt**. The rest stays expected.

To undo a receipt, **Reverse receipt with compensating movements** works while nothing later depends on it. Once stock from it has been reserved, dispatched or moved, count the bin instead and use **Correct receipt from a physical bin count**; the original receipt and later history stay intact.

## Move stock between warehouses

In **Transfers**, **Dispatch available stock to transit** moves stock from a source bin into a transit location on its way to a destination bin. Stock in transit is not available. When it arrives, **Confirm full destination receipt** puts it into the destination bin.

## Count a bin

In **Counts**, choose the bin in **Capture bin count frontier** and **Begin count**. Pier remembers exactly which movements the count covers. Enter what is on the shelf in **Record physical quantities**, with the evidence or reason, and **Save physical count for review**. A person then approves the exact adjustment (**Approve version … adjustment**), or chooses **Capture a recount**. If stock moved after the capture, Pier asks for a recount rather than overwrite that movement.

## Find where a number came from

**Activity** lists every movement with its signed quantity, source document, person, reason and command. Choose **History** on a Stock row, or filter by item, and follow the source link to the order, receipt, transfer, count or import that made it. **Export records, costs and provenance** downloads it all.

## Proposals from an agent

An agent, or anyone preparing work for review, uses **Prepare evidence-backed proposal** in Activity: a replenishment with minimum, recommended and stretch quantities, a shortage reallocation, a count investigation or a migration step, with its evidence. A person with the right role approves the exact version before anything is applied, through the same commands as everyone else. Agents never approve their own work or post stock.
