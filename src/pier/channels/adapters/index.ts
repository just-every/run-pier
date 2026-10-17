import type { Adapter, ChannelConfig } from './types'
import { createWooCommerceAdapter } from './woocommerce'
import { createShopifyAdapter } from './shopify'
import { createAmazonAdapter } from './amazon'
import { createStallAdapter } from './stall'

export type { Adapter, ChannelConfig, ChannelOrder, Listing } from './types'
export { createWooCommerceAdapter } from './woocommerce'
export { createShopifyAdapter } from './shopify'
export { createAmazonAdapter } from './amazon'

export function adapter(config: ChannelConfig): Adapter {
  switch (config.provider) {
    case 'woocommerce': return createWooCommerceAdapter(config)
    case 'shopify': return createShopifyAdapter(config)
    case 'amazon': return createAmazonAdapter(config)
    case 'stall': return createStallAdapter(config)
    default: throw new Error('Unsupported channel provider')
  }
}
