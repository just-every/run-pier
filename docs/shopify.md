# Connect Shopify

You need an existing Shopify store and its owner, or an administrator with permission to develop and install apps. Open **Channels → Connect Shopify** in Pier. This uses your own custom app, installed on a store in the same Shopify organization. Pier obtains and renews API access automatically from its client credentials. Pier does not provide a Shopify App Store installation or an OAuth sign-in button today.

## Create and authorize the app

In Shopify, open **Settings → Apps → Develop apps → Build apps in Dev Dashboard**. In the dashboard, choose **Apps → Create app → Start from Dev Dashboard**, name the app and create it. Under **Versions**, configure the app, then release its version. For an app without an embedded page, Shopify permits its default app home address. Use **Install app**, select your store and approve the installation. See [Shopify's current custom app flow](https://shopify.dev/docs/apps/build/dev-dashboard/create-apps-using-dev-dashboard).

Set these Admin API scopes on the version before releasing it:

| Scope | Why Pier needs it |
| --- | --- |
| `read_products` | Read existing products, variants and SKUs |
| `read_orders` | Read current open orders and their unfulfilled lines |
| `read_inventory` | Read inventory items and current available quantities |
| `write_inventory` | Publish the available quantity at your selected location |
| `read_locations` | Offer the store's location names during setup |

If you change scopes later, approve the new access in Shopify as well. Customer names are protected customer data; configure the access Shopify requires for your app's order data. A refused customer-data request stops synchronization; it does not establish an authorized connection. Shopify documents [access scopes](https://shopify.dev/docs/api/usage/access-scopes) and [protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data).

## Find the values for Pier

| Pier field | Where it comes from |
| --- | --- |
| Connection name | Your label, for example “Main Shopify store” |
| Store API address | **Shopify → Settings → Domains**: use the permanent `https://your-store.myshopify.com` address, with no `/admin` path |
| Shopify authorization | Keep **Custom app client credentials (automatic renewal)** selected for a new Dev Dashboard app |
| Shopify Client ID | **Dev Dashboard → your app → App settings** (also called **Settings**) → **Client ID** |
| Shopify Client secret | **Dev Dashboard → your app → App settings** (also called **Settings**) → **Client secret** |
| Shopify location | Enter the app credentials, choose **Load Shopify locations**, then select the location matching the Pier warehouse. Check its name in **Shopify → Settings → Locations** |
| Warehouse | The Pier warehouse containing the stock this store may sell |
| Stock buffer | Base units to keep out of the store's published availability |

Copy both client credentials into Pier. The app must be installed, with its access scopes approved, and both app and store must belong to the same Shopify organization. Pier performs Shopify's client credentials exchange on its server and uses the resulting 24-hour access token for the connection. It obtains fresh authorization for subsequent synchronization runs automatically. The exchanged token is never returned to the browser or saved in business state; the client credentials you save are encrypted separately from business records. See [Shopify's client credentials instructions](https://shopify.dev/docs/apps/build/authentication-authorization/client-credentials-grant).

If credentials rotate or access is revoked, use **Channels → Connection setup → Manage → Replace credentials**, enter both client credentials again, load the locations and choose the same one. A refused authorization remains an error; Pier does not retry through a different authorization method. A Storefront token does not work for this connection.

If a legacy custom app already existed before January 2026, open **Shopify → Settings → Apps → Develop apps → your app**. Set the scopes under **Configuration → Admin API integration**, install the app and reveal the token once under **API credentials → Admin API access token**. Choose **Legacy Admin API access token** in Pier and paste that token, then load the locations. This explicit mode also keeps existing saved token connections working. Shopify no longer allows creating new legacy custom apps. See [Shopify's legacy app guidance](https://help.shopify.com/en/manual/apps/managing-apps).

The location selector reads actual active locations with the selected app authorization and keeps their IDs behind their names. A failed read shows the error; no location is guessed. Stock must already be tracked at that Shopify location. Pier updates existing inventory; it does not activate inventory at a new location or create products.

## Check the connection

Choose **Connect store**, then **Sync now**. Review **Listings** and match every unknown SKU before its orders can reserve stock. In Shopify, inspect the selected location's available quantity and compare it with Pier after reservations, holds and the buffer. Check a real open order in **Channels → Orders** and open its Pier order to inspect reservations and backorders.

The adapter uses Shopify Admin GraphQL. Local synthetic provider fixtures exercise the protocol; a live owner store, permissions and actual stock/order checks are still required. Only USD orders import today. Full refund/cancellation synchronization, shipment write-back, historical backfill and channel accounting remain pending. See [Sales channels](channels.md).
