# Orders and dispatch

Every change to stock in Pier is a movement with a source document, the person who made it and their reason. You never edit a balance; you record what happened, and the balance follows.

## Take an order

In **Sales orders**, use **New sales order**: choose the customer, an optional promise date and the lines. **Create and reserve available stock** reserves what is available straight away. Anything that is not available is shown as backorder; Pier never reserves the same unit twice or lets sellable stock go negative.

When more stock arrives, open the order and choose **Reserve newly available stock**.

## Dispatch in parts

Open the order with **Open order**. **Reserved sources for physical picking** lists the bins to pick from. In **Pick and dispatch reserved lines**, enter a shipment reference and only the quantities you physically picked, then **Confirm partial dispatch**. Dispatch uses this order's own reservations; the rest stays reserved for the order.

To stop the rest of an order, **Cancel remaining demand** releases only its unshipped reservations. What was already dispatched stays on record.

## Returns

A return points to the shipment line it came back from. **Return dispatched goods into quarantine** records it into a quarantine bin, where it is not available. In **Quarantine review**, **Approve exact return for restocking** and then **Restock approved return** make it sellable again.

To see where any of these numbers came from, see [Activity and proposals](activity.md).
