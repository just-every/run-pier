import type { Provider } from './model'
import stall from './assets/stall.png'
import shopify from './assets/shopify.png'
import amazon from './assets/amazon.png'
import woocommerce from './assets/woo.png'

// Vite resolves these assets for both the browser and the hosted Worker.
const marks: Record<Provider, string> = { stall, shopify, amazon, woocommerce }
export function ChannelBrand({ provider }: { provider: Provider }) {
  return <img className="channel-brand" src={marks[provider]} alt="" width="44" height="44" />
}
