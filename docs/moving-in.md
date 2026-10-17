# Moving in from CSV

Bring your items, bins, customers and suppliers, opening stock and open orders into Pier from CSV files. Pier keeps your original files, shows exactly what each row became, and posts opening stock once, only after you have reviewed it.

## Prepare the files

Export from your current system and arrange each file in Pier's own CSV shape. There are six kinds of file: `items`, `locations`, `parties` (customers and suppliers), `positions` (opening stock by bin), `orders` (open sales order lines) and `purchaseOrders` (open purchase order lines), plus an optional `reservations` file that keeps exactly which bin each open order line is reserved from. The exact headers and rules are in the [Native CSV contract](../IMPORT.md).

A few rules matter most:

- Every row has a stable `key` that stays the same if you import a corrected file later.
- Every quantity names its unit, and it must be the item's base unit.
- Include only what is still open: remaining order and purchase order lines, not ones already shipped or received.
- Large moves go in several complete batches: each order with all of its lines in the same batch.

## Stage and review

Open **Imports** and use **Capture native CSV files**:

1. Fill in where the files came from: **Source namespace**, **Source version**, **Exported at (ISO timestamp)**, **Export filters / scope**, **Cutoff timezone** and **Mapping revision**.
2. Choose the files under **Original CSV files** and set each one's **Native record type**.
3. **Stage files without changing live stock.** Nothing in your stock changes yet. Pier checks every header, key, unit and reference, and lists any error by file and row. Fix errors in your original CSV and stage it again.

Then review the batch in four steps with **Review the next migration stage**: mapped (identities and units checked), reconciled (totals and references checked), shadow (the proposed result checked) and frozen (the exact cutover version approved). The owner then chooses **Commit frozen version …**, which posts the opening stock and open documents once.

## Keep the originals

Every batch keeps the files you staged, byte for byte, with their digests; **Download retained original CSV** gives each one back. Each imported record links to the file and row it came from, and its movements say which import posted them.

## Undo a batch

Until anything uses the imported records, **Undo accepted batch** restores the state from before the commit. Once orders, dispatches or counts depend on it, correct with the normal linked operations instead.

## Your history from the old system

Pier starts its movement history at your cutover: opening stock arrives as reviewed import movements linked to your retained files. Keep your old system's exports for the history before that date. **Export native cutover snapshot** on the Imports view writes Pier's current state back out in the same CSV shape.
