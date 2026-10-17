# Connect WooCommerce

You need an existing WordPress site with WooCommerce installed, plus an administrator who can create API keys for a user allowed to manage products and orders. Open **Channels → Connect WooCommerce** in Pier.

## Create the key

Use HTTPS. In **WordPress → Settings → Permalinks**, choose any structure except **Plain**. In **WooCommerce → Settings → Advanced → REST API → Add key**, enter Pier as the description, choose the user and set **Permissions → Read/Write**. Choose **Generate API Key** and copy the Consumer key and Consumer secret before leaving; the secret is shown only once. These steps are in [WooCommerce's REST API setup instructions](https://woocommerce.com/document/woocommerce-rest-api/).

## Find the values for Pier

| Pier field | Where it comes from |
| --- | --- |
| Connection name | Your label for this shop |
| Store API address | **WordPress → Settings → General → Site Address (URL)**: copy the shop root, retaining a subdirectory if your store uses one |
| Consumer key | The key shown after **Generate API Key**, usually beginning `ck_` |
| Consumer secret | The secret on that same generated-key page, usually beginning `cs_` |
| Webhook signing secret | Optional password you choose; repeat it in each WooCommerce webhook's **Secret** field |
| Warehouse | The Pier warehouse that supplies this store's orders |
| Stock buffer | Base units withheld from this store's available quantity |

The optional webhook secret is a password you choose and enter identically in Pier and WooCommerce so Pier can verify the sender.

Use the shop address rather than a WordPress admin URL. Pier calls its `wp-json/wc/v3` REST API. HTTP is allowed only for localhost development. Choose **Connect store**, then **Sync now**. Review unmatched SKUs under **Listings** before their orders reserve stock.

## Receive faster order updates

After connecting, expand **Order webhook address** on the WooCommerce card and copy it. In **WooCommerce → Settings → Advanced → Webhooks → Add webhook**, create two active webhooks: one with topic **Order created**, one with **Order updated**. Put Pier's copied address into **Delivery URL** and the same chosen password into **Secret** for both. WooCommerce explains these fields in its [webhook setup guide](https://woocommerce.com/document/webhooks/).

The webhook notifies Pier to read current orders through the authenticated API. Pier verifies the signature and deduplicates orders; the webhook body alone does not post stock. A local Pier address must be reachable by the WooCommerce server to receive notifications. When it is not, **Sync now** and the minute reconciliation still read processing orders.

## Check and maintain

Check an actual processing order in **Channels → Orders**, then inspect its native Pier reservations and backorders. Compare an existing simple product or variation's managed stock quantity in WooCommerce with the quantity Pier published. Pier updates managed stock on those existing listings; it creates no products.

If the API key is revoked or its user loses access, the connection shows an error. Create a new read/write key and use **Channels → Connection setup → Manage → Replace credentials**. Re-enter the webhook secret too if you are keeping webhooks; replacement replaces the entire credential set.

Only processing orders with USD currency import today. Refunded orders need reconciliation support; full cancellation/refund synchronization, fulfilment write-back and channel accounting remain pending. A real owner store and its order and stock checks are still needed for live acceptance. See [Sales channels](channels.md).
