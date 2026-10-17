# Changelog

## Unreleased

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
