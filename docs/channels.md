# Connect sales channels

Open **Channels** in Pier. The owner connects a store to one warehouse, reviews unmatched listings and sees each channel's available and accepted stock quantities. Other roles can read these records. Shopify and Amazon connect when the owner's merchant accounts exist; their documented API adapters are exercised with synthetic recorded JSON fixtures at the network edge, not accepted live accounts. There is no fixture mode in the application.

## Orders and availability

Pier reads live fulfilment demand through WooCommerce REST `wc/v3`, Shopify Admin GraphQL `2026-10` and Amazon SP-API Orders `2026-01-01`. Products and variants keep their existing provider identities. Matching uses an existing mapping first and then an exact SKU; an unknown SKU waits for the owner to select an existing Pier item. Mapping creates no provider listing. An order with an unknown line or unsupported currency waits without reserving any of its lines. Pier currently accepts USD orders only.

Imported demand routes to the connection's warehouse and uses Pier's normal atomic reservation command. Repeated notifications and reconciliation link the same channel order to the same Pier order. Click the order reference to inspect its reserved and backordered lines. Listings found only on an order can be matched for that order, but stock cannot be published until the provider returns an actual listing.

Available stock is sellable stock in the selected warehouse, minus order reservations, active transfer holds and the channel's stock buffer. Holds allocate actual unreserved units to bins: ordinary orders, transfers and count adjustments cannot consume them. Add a hold with an item, warehouse, quantity and plan/reason, for example “100 held for FBA transfer”. Release it when the separate physical transfer is ready; this hold is not an Amazon inbound shipment or an FBA inventory ledger.

After a committed stock or reservation change, Pier immediately synchronizes connected channels. A one-minute cron reconciles missed events and pending publication. **Sync now** uses that same transport. The listing shows the accepted quantity, acceptance time and request duration. Pending changes show elapsed lag; failures remain visible and never pretend an update was accepted. An installation-wide lease serializes publication so two connector runs cannot overtake each other. Rate limits, API failures and large backlogs can exceed one minute and need attention; this is not a measured production 95th-percentile service guarantee. Amazon's acceptance is asynchronous submission acceptance, not proof that Amazon has finished processing it.

## Stall

Stall is the online shop from the same family; it sells from Pier's stock. No Stall yet? Start one on this computer with `rer dev just-every/run-stall` ([Run Stall and Pantry beside Pier](run-beside.md)). The connection has two halves, both made from the two apps' own pages:

1. **Pier reads Stall.** In Stall, open the owner page, scroll to **Agent access** and choose **Create agent credential**. In Pier, open **Channels → Connect** on the Stall card, enter Stall's address (from its browser tab, for example `http://localhost:8791`), choose the warehouse, paste the credential as **Access token** and choose **Connect store**. Stall's agent credentials last seven days; when Pier reports that Stall refused access, create a new one in Stall and use **Manage → Replace credentials** in Pier.
2. **Stall reads Pier.** On the Stall card in Pier, choose the customer Stall's orders belong to (or **Add “Online shop (Stall)”**, which creates that customer and selects it) and choose **Create Stall's key to Pier**. Pier shows its address and the key once and keeps only a fingerprint of the key. In Stall, open **Settings → Provider connections** (Stall's address followed by `/app#connections`), paste both into **Connect Pier** and choose **Connect Pier**; Stall checks the key with Pier and shows **Connected**. This is the same for a Stall on this computer and a Stall online: no files and no restart. Creating a new key stops the old one at once (paste the new one in Stall); **Remove Stall's key** stops Stall reaching Pier.

The key lets Stall do only what a shop does: read stock and its own customer's orders, reserve that customer's paid orders and dispatch them. It is not a person's sign-in and cannot change anything else in Pier. Stall takes payments through Stripe on your own Stripe account: connect it on the same Stall page (**Connect Stripe**, test keys first). Publish a product in Stall whose SKU matches a Pier item; a paid Stall order then appears under **Channels → Orders**, reserved in Pier. A Stall on your own computer cannot receive Stripe's payment notice, so after a test payment open the order in Stall and choose **Reconcile**.

A paid Stall checkout creates its reservation directly in Pier. The connector links that reservation by its Pier identity and does not reserve the order again. Stock publication is a read-back from Stall's live catalogue, which itself reads Pier. Current Stall publishes one company-wide stock pool: use a single warehouse and zero channel buffer. A differing read-back is shown as a failure rather than silently accepted. Stall's original payment, shipping approval and native-session requirements remain in force.

## WooCommerce

In WooCommerce, enable HTTPS and ordinary WordPress permalinks, then create a read/write REST API key. In Pier choose WooCommerce, the shop root address, consumer key, consumer secret and warehouse. A localhost shop may use HTTP for local development. The adapter reads simple products and all variation pages; it updates the existing product/variation's managed stock quantity.

For immediate order intake, enter a separate webhook signing secret in the connection. Its card shows the callback URL `/api/pier/channels/CONNECTION_ID/webhook`. Create WooCommerce **Order created** and **Order updated** webhooks to that URL using the same secret. Pier verifies WooCommerce's HMAC-SHA256 signature over the original body, then reads canonical orders through the authenticated REST API. Replayed notifications do not make another reservation. The minute reconciliation also catches missed notifications. Only processing orders import as new fulfilment demand. Orders containing refunds wait for reconciliation support rather than importing guessed remaining quantities.

## Shopify and Amazon account setup

Shopify requires the shop origin, Admin API access token and explicit inventory Location GID. Grant the account access needed to read products/orders/inventory and write inventory. The adapter reads current available stock and uses Shopify's compare-and-swap inventory mutation with an idempotency key.

Amazon requires the regional SP-API origin, seller ID, marketplace ID and Login with Amazon authorization: either an access token or the client ID, client secret and refresh token. It reads merchant-fulfilled open orders and existing seller-SKU listings, then patches merchant-fulfilled availability. FBA-only inventory cannot be published by this adapter. Live owner authorization is still required for both providers.

Provider credentials are encrypted under this installation's session secret in a separate server-side table. They are absent from business exports, command results and portable archives. Re-enter them after restoring or changing the installation secret. Connection forms do not persist credential payloads in browser storage. Pause a connection to stop automatic traffic; revoking its approving owner's authority stops scheduled admission too.

Full cancellation/refund and fulfilment write-back, historical backfill, financial clearing, FBA shipment/report reconciliation, additional channels and production throughput acceptance remain in CHANNEL-001/002. Existing imported orders are not inferred cancelled merely because they disappear from a provider's live-order list.

API references: [WooCommerce REST](https://woocommerce.github.io/woocommerce-rest-api-docs/), [Shopify inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/inventorySetQuantities), [Amazon Orders](https://developer-docs.amazon/sp-api/reference/searchorders), [Amazon Listings Items](https://developer-docs.amazon/sp-api/reference/patchlistingsitem).
