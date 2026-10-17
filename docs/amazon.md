# Connect Amazon

You need an Amazon Seller Central selling account, approved SP-API developer access and a registered application authorized for that seller. An Amazon shopping login alone cannot connect. Open **Channels → Connect Amazon** in Pier. The current connection handles merchant-fulfilled open orders and listings; it does not set up FBA.

## Register and authorize

Sign in as the primary seller user. In **Seller Central → Apps and Services → Develop Apps**, complete private developer registration for your own business and register your application. If Amazon has moved you to its Solution Provider Portal, registration is at **Settings → Developer Profile** and app management is at **Develop Apps**. Approval is Amazon's decision; registration is not instant access. See [private developer registration](https://developer-docs.amazon.com/sp-api/docs/register-as-a-private-developer) and [application registration](https://developer-docs.amazon.com/sp-api/docs/registering-your-application).

Request the **Product Listing** and **Inventory and Order Tracking** roles for the existing listings, inventory and order operations. Buyer information needs the relevant additional approval for protected data. Amazon documents the [Orders API roles](https://developer-docs.amazon.com/sp-api/docs/orders-api) and [Listings Items API roles](https://developer-docs.amazon.com/sp-api/docs/listings-items-api). A permitted listing call does not establish access to every order field.

Under **Develop Apps**, find your app and choose **Authorize**, then **Authorize app** for the selling account. Copy the resulting refresh token. Private apps can be self-authorized; public apps require the seller's authorization flow. See [Amazon's authorization instructions](https://developer-docs.amazon.com/sp-api/docs/self-authorization).

## Find the values for Pier

| Pier field | Where it comes from |
| --- | --- |
| Connection name | Your label for this seller and marketplace |
| Seller ID | **Seller Central → Settings → Account Info → Business Information → Your Merchant Token**; this merchant token is your seller identity |
| Marketplace | Select the country where you sell. Pier supplies its marketplace ID and regional SP-API address |
| Store API address | Filled automatically from the marketplace country |
| Refresh token | **Develop Apps → your app → Authorize → Authorize app**, for this selling account |
| Client ID and Client secret | **Develop Apps → your app → LWA credentials → View** |
| Warehouse | The Pier warehouse that supplies these merchant-fulfilled orders |
| Stock buffer | Base units kept out of this marketplace's available quantity |

Amazon confirms the [merchant token menu path](https://sellercentral.amazon.com/seller-forums/discussions/t/6b96898d-927c-476a-8aa2-cc1717a19ffe?mons_sel_locale=en_US) and [LWA credential location](https://developer-docs.amazon.com/sp-api/docs/viewing-your-application-information-and-credentials).

Use a separate connection for each marketplace. United States selects `ATVPDKIKX0DER` and `https://sellingpartnerapi-na.amazon.com`. The picker also covers the countries in Amazon's [marketplace directory](https://developer-docs.amazon.com/sp-api/docs/marketplace-ids), using its [regional endpoints](https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints). **Pier currently imports USD orders only.** A non-USD order waits without reservations even when its marketplace is selectable.

Pier exchanges the refresh token with Login with Amazon for short-lived access automatically. You do not need to copy a new hourly access token. If authorization is revoked or credentials rotate, open **Channels → Connection setup → Manage → Replace credentials**, enter the refresh token and both LWA credentials again, and select the marketplace. The replacement must stay in the connection's existing API region; create a new connection to move regions.

## Check the connection

Choose **Connect store**, then **Sync now**. Pier reads existing seller-SKU listings. Exact SKU matching links an existing Pier item; an unknown listing waits in **Listings** for an owner match. Pier does not create or relist an Amazon listing. FBA-only availability cannot be published here.

Inspect a merchant-fulfilled open order under **Channels → Orders** and its native Pier reservations. Check the published quantity on Amazon. An Amazon stock response marked accepted means Amazon accepted the submission for processing; it does not prove processing has finished. Keep provider processing and read-back checks separate.

The adapter uses real SP-API calls, exercised locally with synthetic network fixtures. Amazon developer approval, live account authorization, buyer-data access and actual listing/order acceptance still need your account. FBA transfers/reconciliation, refunds, fulfilment write-back, historical backfill and settlement accounting remain pending. See [Sales channels](channels.md).
