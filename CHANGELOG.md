# Changelog

## Unreleased

- Books match the shelf with freight and duty: a receipt's freight and duty split over its lines in whole cents (largest remainder, parts sum exactly to what was entered), stock cost layers stay in whole cents, and cost of goods, return-cost and valuation journals post to Pantry instead of waiting on fractions of a cent. A freight-and-duty journal moves the landed part into Pantry's inventory from a freight account picked in Books settings, so Pantry's inventory equals Pier's valuation. Receipts landed before this are re-split once on the next sync. Unit costs show at cents.
- Books: a document stuck at "Outcome unknown" because Pantry never received it is re-sent with its original idempotency keys when the owner chooses Check Pantry; a return credit refused because its invoice was not posted yet is no longer marked as sent. After a restore, Books says the credential was not carried rather than revoked.
- Stall connects from the two apps' pages: Pier's Stall card shows Pier's address and the key with steps for Stall's Settings → Provider connections, and says Stall takes payments through Stripe. "Add Online shop (Stall)" selects the customer it creates.
- Native CSV import reads USD by default, accepts a per-row ISO 4217 currency column on positions and purchase orders, refuses an unknown code naming the file and row, and values non-USD rows only at a USD rate the owner enters, recorded on the batch.
- Put Pier online: the settings file quotes MAIL_FROM, and hosted backup, backup check (its database removed at the end), restore of a live Pier from a backup file and point-in-time rewind run through Pier's own `rer run hosted` script with no npx. Run-beside, Books and Channels give `rer dev` lines that work after the Run page install.
- Purchase orders and customer date updates name the business and the ship-to address (Purchasing → Your business) and use written-out dates. Re-promise says why it is disabled; backorder evidence shows the PO-covered quantity and the uncovered rest with its basis. Cin7 Core product AverageCost is picked up as opening cost and a missing cost names the item and column. Dispatch summaries say backordered rather than short; "Picked 1 order".
- Pinned rer 0.2.47.

- Waves: an order already picked never waits for, or joins, a second wave. A new pick list covers only reserved units no earlier wave picked or holds, and pick and pack refuse units another wave already picked or that have shipped.
- Books: Pantry connects from the settings page alone. It explains what Pantry is and how to start one, how to create Pier's integration credential in Pantry, checks the credential's permissions and lists Pantry's accounts to pick from. Pier uses Pantry's scoped integration API with idempotency keys and native bill readiness; a revoked credential shows as a broken connection with the fix.
- Channels: Pier issues Stall's key to Pier in-app and names every Stall-side step. The key admits only reading stock and the shop customer's orders and reserving and dispatching those orders. The Stall form names where Stall's agent credential is made.
- Move-in: choosing Cin7 Core, inFlow or Fishbowl names the exports to save and recognises each standard export, mapping every column or keeping it with a reason. The stock check file takes plain warehouse and bin columns, with a downloadable template. inFlow's midnight time after dates is accepted.
- AI setup names an example model ID and where to find valid IDs and create a key.
- Purchase order emails show money as "USD 3,689.00" and the supplier's own item codes.
- Forms start empty after a successful save; error banners clear when you move to another page and offer sign-in only when the session needs it.
- Scan receiving records freight and duty, so scanned receipts carry landed cost.
- The day summary says "partly shipped" for orders with some units out.
- Docs: Put Pier online (deploy, real owner address, hosted backup with `wrangler d1 export --remote`, restore, removal) and Run Stall and Pantry beside Pier.
- Claims: channel delivery rows and the agent's "sends the PO" now read partly; Pantry rows reflect the scoped credential.
