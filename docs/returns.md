# Returns bench

Open **Floor → Returns**. Choose or scan a named return bin, record the physical condition and return reason, and choose the disposition.

- **Restock to bin** makes inspected sellable stock available in that bin.
- **Keep in quarantine** records the return without making it available to orders.
- **Write off damaged stock** removes the damaged units from quarantine and queues their value against the owner's mapped damaged-stock expense account.

Scan the item's unit or case barcode. A unit scan returns one base unit; a case scan returns the item's exact pack quantity. **Times** repeats the scan. With one eligible dispatch and the inspection fields filled in, an authorized inspector's scan posts the return and its disposition together.

An order or shipment label finds its dispatched lines. Choose the returned line, enter **Returned quantity (base units)** and choose **Confirm return**. No second item scan is required. An item found on several dispatches also requires an explicit dispatch choice and confirmation. Pier never guesses which customer's shipment came back. Every return links to the original dispatch line, and cumulative returns cannot exceed its shipped quantity. Retrying an interrupted action uses its original command identity.

Owners and warehouse staff can inspect. An operator can receive the same return into quarantine, but cannot make it sellable or write it off. An authorized inspector reviews that quarantined return through **Post inspection decision**. Damaged condition cannot be restocked. Restocking uses the named bin recorded on the return.

## Pantry connection and credit

An owner connects Pantry in **Books**, mapping inventory asset, cost of goods and sales income accounts. To write off damaged stock, also map **Damaged stock expense account**. Until that mapping exists, keep the stock quarantined.

Books sends a native Pantry credit against the original dispatch invoice, using the original sales price and the exact returned quantity. It saves a credit draft, approves it and issues it through Pantry's normal invoice commands. The credit reduces the unpaid invoice; any unapplied credit remains in Pantry. This workflow does not move a bank refund.

Books also reverses the returned units' original dispatch cost from COGS into inventory. A write-off posts the removed stock value from inventory to the mapped damaged-stock expense account. The source quantity, reason, inspector, movements and credit reference remain readable. The Books queue exposes missing prices, unknown USD costs, fractions of a cent, locked periods, remote refusals and uncertain outcomes. An uncertain create is checked against its source reference before any further write.

The connection currently requires explicitly tax-exempt USD wholesale sales and a Pantry connection made with its integration credential ([Books](books.md)). Credits, journals and balances use the real Pantry Worker API; the integration test runs both Pier and Pantry with D1. That local proof does not establish acceptance in an owner's hosted Pantry company or on a physical scanner. Direct QBO/Xero credit posting, taxable returns, provider refunds and printer acceptance remain separate boundaries.
