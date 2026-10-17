# Channel API edge fixtures

These are authored, schema-based API response fixtures, recorded in JSON for deterministic network-edge tests. They are **not recordings from authorized live merchant accounts**, and establish neither account authorization nor hosted/provider acceptance. No live merchant credentials or customer data were available or used. Application adapters never read these files.

The examples use invented product identities, buyer names, pagination cursors and tokens. The shapes were checked against the following primary documentation on 17 October 2026. Only the fields relevant to these API requests are retained; page sizes are deliberately small to exercise continuation. Treat the token strings as fixture data, never as authorization.

- [WooCommerce REST wc/v3](https://woocommerce.github.io/woocommerce-rest-api-docs/): products, product variations, orders, stock updates and `X-WP-TotalPages` pagination. The first products/orders/variations fixture has `X-WP-TotalPages: 2`; the corresponding second fixture has the same header. Stock fixtures represent PUT success and HTTP 404 respectively.
- [Shopify productVariants](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/productVariants), [orders](https://shopify.dev/docs/api/admin-graphql/2026-10/queries/orders), [LineItem](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/LineItem), [inventorySetQuantities](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/inventorySetQuantities) and [InventoryQuantityInput](https://shopify.dev/docs/api/admin-graphql/2026-10/input-objects/InventoryQuantityInput). GraphQL fixtures are HTTP 200, including error fixtures. The first order has an independently paginated line connection. Version 2026-10 requires `@idempotent(key: ...)` and an explicit `changeFromQuantity`; the adapter reads current available quantity before its compare-and-swap mutation.
- [Amazon searchOrders v2026-01-01](https://developer-docs.amazon/sp-api/reference/searchorders), [migration guide](https://developer-docs.amazon/sp-api/docs/orders-api-migration-guide), [searchListingsItems](https://developer-docs.amazon/sp-api/reference/searchlistingsitems), [patchListingsItem](https://developer-docs.amazon/sp-api/reference/patchlistingsitem) and [LWA connection](https://developer-docs.amazon/sp-api/docs/connecting-to-the-selling-partner-api). Exact field definitions were checked against Amazon's [Orders model](https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/orders_2026-01-01.json) and [Listings Items model](https://github.com/amzn/selling-partner-api-models/blob/main/models/listings-items-api-model/listingsItems_2021-08-01.json). Amazon fixtures are HTTP 200. `INVALID` is a business failure despite its HTTP status. `ACCEPTED` means queued for processing, not quantity read-back. Amazon's current Orders API returns order items inline; these fixtures intentionally do not use the deprecated Orders v0 envelope or separate `orderItems` request.

## Adapter integration

`src/pier/channels/adapters/index.ts` exports `adapter(config)` and the named WooCommerce, Shopify and Amazon factories. The parent supplies `createStallAdapter` from `stall.ts`. The adapter contracts are in `types.ts`, including Stall's optional `reservationId`.

Connection credential keys (all server-only):

| Provider | Keys |
| --- | --- |
| WooCommerce | `consumerKey`, `consumerSecret`; `baseUrl` is the shop root, optionally already ending `/wp-json/wc/v3` |
| Shopify | `accessToken`, `locationId` (explicit `gid://shopify/Location/...`); `baseUrl` is the shop origin |
| Amazon | `sellerId`, `marketplaceId`; either `accessToken`, or `clientId`, `clientSecret`, `refreshToken`; optional ISO-8601 `createdAfter` for live-order search; `baseUrl` is the regional SP-API origin |

`orders()` is deliberately live merchant fulfilment demand, not historic backfill: WooCommerce `processing`, Shopify open unfulfilled/partial with paid/authorized/partially paid/partially refunded status, Amazon merchant `UNSHIPPED`/`PARTIALLY_SHIPPED`. Shopify/Amazon quantities represent outstanding unfulfilled units, excluding zero lines; Shopify excludes nonshipping lines. WooCommerce processing orders with refunds fail visibly until refund reconciliation exists. Returned missing SKUs/customer names remain empty for the integration's review queue; none is guessed. USD validation belongs to the integration.

WooCommerce simple external identities are product IDs and variation identities are `productId:variationId`. Shopify identities are ProductVariant GIDs and carry InventoryItem and explicit Location GIDs. Amazon Listings Items identities are seller SKUs, not shared catalog ASINs. No listing is created or relisted during reads. Amazon searches exceeding the documented 1,000-result cap partition their creation-time windows; an unsplittable timestamp fails visibly rather than silently truncating.

Every provider stock API needs whole nonnegative units. Fractional units are refused without a network write; pack conversion is the integration's responsibility. WooCommerce verifies PUT's identity and returned quantity; Shopify verifies mutation business errors and the resulting available quantity; Amazon verifies submission identity, `ACCEPTED`, and absence of error-severity issues. Amazon FBA-only listings are refused. Network/HTTP/GraphQL/schema/business failures surface without retries, response bodies or credential-bearing URLs in errors.

`Adapter.stock(): Promise<void>` proves acceptance only. Its contract cannot return provider read-back quantity, Amazon submission ID/processing time, or a durable idempotency key. The integration must retain acceptance separately from later read-back/processing evidence; a follow-up interface is needed for those full CHANNEL-001 requirements. The interface also has no order status/version, original quantity, refunds/cancellations or historic mode, so live reconciliation, lifecycle updates and twelve-month historic backfill remain integration work; never treat these live-demand snapshots as historic orders or infer cancellation from absence.

## Exact fixture inventory

- `woocommerce-products-page-1.json`, `woocommerce-products-page-2.json`
- `woocommerce-variations-page-1.json`, `woocommerce-variations-page-2.json`
- `woocommerce-orders-page-1.json`, `woocommerce-orders-page-2.json`
- `woocommerce-stock-accepted.json`, `woocommerce-stock-rejected.json`
- `shopify-listings-page-1.json`, `shopify-listings-page-2.json`
- `shopify-orders-page-1.json`, `shopify-orders-page-2.json`, `shopify-order-lines-page-2.json`
- `shopify-stock-current.json`, `shopify-stock-accepted.json`, `shopify-stock-rejected.json`, `shopify-graphql-rejected.json`
- `amazon-listings-page-1.json`, `amazon-listings-page-2.json`
- `amazon-orders-page-1.json`, `amazon-orders-page-2.json`
- `amazon-stock-current.json`, `amazon-stock-accepted.json`, `amazon-stock-rejected.json`, `amazon-lwa-token.json`
