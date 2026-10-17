import type { Provider } from './model'
const marks: Record<Provider, string> = {
  stall: new URL('./assets/stall.png', import.meta.url).href,
  shopify: new URL('./assets/shopify.png', import.meta.url).href,
  amazon: new URL('./assets/amazon.png', import.meta.url).href,
  woocommerce: new URL('./assets/woo.png', import.meta.url).href,
}
export function ChannelBrand({ provider }: { provider: Provider }) {
  return <img className="channel-brand" src={marks[provider]} alt="" width="44" height="44" />
}
