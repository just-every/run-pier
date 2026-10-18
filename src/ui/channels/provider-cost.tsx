import type { Provider } from './model'

const costs: Record<Provider, string> = {
  shopify: 'Shopify bills your account for its store subscription and applicable transaction or payment fees. Review your Shopify plan and payment-provider rates before enabling this connection.',
  amazon: 'Amazon bills your seller account for applicable selling-plan, referral and fulfilment fees. Review your Seller Central fee schedule before enabling this connection.',
  woocommerce: 'WooCommerce hosting, paid extensions and payment processing may have separate charges from your hosting, extension and payment providers. Review those agreements before enabling this connection.',
  stall: 'Stall is open source. Your hosting provider and Stripe may charge for hosting and payment processing; review those rates before enabling this connection.',
}

export function ChannelProviderCost({ provider }: { provider: Provider }) {
  return <p className="muted"><strong>Provider costs.</strong> {costs[provider]} Pier charges no connection, license or per-seat fee.</p>
}
