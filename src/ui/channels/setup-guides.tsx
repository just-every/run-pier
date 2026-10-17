import type { Provider } from './model'
import { StallSteps } from './stall-link'

const guide = (slug: string, label: string) => <a href={`https://run-pier.com/docs/${slug}`} target="_blank" rel="noreferrer">{label}</a>

export function SetupGuide({ provider }: { provider: Provider }) {
  return <section className="panel">
    {provider === 'stall' && <StallSteps />}
    {provider === 'shopify' && <>
      <h3>Before you connect Shopify</h3>
      <p>You need an existing Shopify store and its owner or an administrator with app development and installation permissions. Your custom app and installed store must belong to the same Shopify organization. There is no Pier app to install from the Shopify App Store.</p>
      <ol className="steps">
        <li>In Shopify, open <strong>Settings → Apps → Develop apps → Build apps in Dev Dashboard</strong>. In the dashboard choose <strong>Apps → Create app → Start from Dev Dashboard</strong> and name the app.</li>
        <li>In the app's <strong>Versions</strong> page, set the Admin API scopes to <code>read_products, read_orders, read_inventory, write_inventory, read_locations</code>, then <strong>Release</strong>. Use <strong>Install app</strong> and approve access on your store. Allow the customer data this order integration needs.</li>
        <li>In your app's <strong>App settings</strong> (also called <strong>Settings</strong>), copy <strong>Client ID</strong> and <strong>Client secret</strong> into the matching fields below. Keep <strong>Custom app client credentials (automatic renewal)</strong> selected. Pier obtains its own API access token and renews access automatically; you do not need to copy a token.</li>
        <li>For <strong>Store API address</strong>, use your permanent <code>https://your-store.myshopify.com</code> address from <strong>Settings → Domains</strong>. Enter the app credentials below and choose <strong>Load Shopify locations</strong>. Select the location matching your Pier warehouse; in Shopify these are listed at <strong>Settings → Locations</strong>.</li>
      </ol>
      <p className="muted">Already have a legacy custom app created before January 2026? Open <strong>Settings → Apps → Develop apps → your app</strong>, configure the same scopes under <strong>Configuration → Admin API integration</strong>, install it and reveal its token once at <strong>API credentials → Admin API access token</strong>. Choose <strong>Legacy Admin API access token</strong> below and paste that token.</p>
      <p>{guide('shopify', 'Shopify setup guide')} · <a href="https://help.shopify.com/en/manual/apps/install-setup-apps" target="_blank" rel="noreferrer">Shopify's app setup instructions</a></p>
    </>}
    {provider === 'amazon' && <>
      <h3>Before you connect Amazon</h3>
      <p>You need an Amazon Seller Central account, approved SP-API developer access and a registered application authorized for that seller. A normal Amazon shopping account is insufficient. Pier connects merchant-fulfilled listings; FBA setup is separate.</p>
      <ol className="steps">
        <li>Sign in as the primary Seller Central user. Open <strong>Apps and Services → Develop Apps</strong> to register as a private developer and register your app. If Amazon has moved your account to the <strong>Solution Provider Portal</strong>, use <strong>Settings → Developer Profile</strong> for registration and <strong>Develop Apps</strong> for the app. Request the <strong>Product Listing</strong> and <strong>Inventory and Order Tracking</strong> roles and any approval needed for buyer data.</li>
        <li>Find the app under <strong>Develop Apps</strong>, choose <strong>Authorize → Authorize app</strong> for your selling account and copy the <strong>Refresh token</strong>. Under the app's <strong>LWA credentials → View</strong>, copy the <strong>Client ID</strong> and <strong>Client secret</strong>. Pier uses these to renew access automatically.</li>
        <li>In Seller Central, open <strong>Settings → Account Info → Business Information → Your Merchant Token</strong> and copy it as <strong>Seller ID</strong>.</li>
        <li>Choose your selling country's <strong>Marketplace</strong> below. Pier fills in its marketplace ID and regional API address. Use a separate connection for each marketplace. Pier currently imports USD orders only; other currencies wait for review.</li>
      </ol>
      <p>{guide('amazon', 'Amazon setup guide')} · <a href="https://developer-docs.amazon.com/sp-api/docs/register-as-a-private-developer" target="_blank" rel="noreferrer">Amazon's developer registration instructions</a></p>
    </>}
    {provider === 'woocommerce' && <>
      <h3>Before you connect WooCommerce</h3>
      <p>You need an existing WordPress site with WooCommerce installed and an administrator who can create API keys. Use HTTPS and set <strong>WordPress Settings → Permalinks</strong> to any option except <strong>Plain</strong>.</p>
      <ol className="steps">
        <li>In WordPress, open <strong>WooCommerce → Settings → Advanced → REST API → Add key</strong>. Name it Pier, select a user who can manage products and orders, set <strong>Permissions → Read/Write</strong> and choose <strong>Generate API Key</strong>.</li>
        <li>Copy the <strong>Consumer key</strong> and <strong>Consumer secret</strong> into this form before leaving that page; the secret is shown once. For <strong>Store API address</strong>, copy the shop root address from <strong>WordPress Settings → General → Site Address (URL)</strong>.</li>
        <li>For faster order updates, after connecting open <strong>WooCommerce → Settings → Advanced → Webhooks → Add webhook</strong>. Create active <strong>Order created</strong> and <strong>Order updated</strong> webhooks using the address shown on Pier's connection card.</li>
      </ol>
      <p>The optional webhook secret is a password you choose and enter identically here and in each WooCommerce webhook's <strong>Secret</strong> field so Pier can verify the sender.</p>
      <p>{guide('woocommerce', 'WooCommerce setup guide')} · <a href="https://woocommerce.com/document/woocommerce-rest-api/" target="_blank" rel="noreferrer">WooCommerce's API key instructions</a></p>
    </>}
  </section>
}
