export interface ChannelConfig {
  provider: 'stall' | 'woocommerce' | 'shopify' | 'amazon'
  baseUrl: string
  credentials: Record<string, string>
}

export interface Listing {
  externalId: string
  sku: string
  title: string
  inventoryItemId?: string
  locationId?: string
}

export interface ChannelOrder {
  externalId: string
  payment?: { provider: 'stripe'; reference: string; amount: string; currency: string; paidAt: string; orderReference: string }
  reservationId?: string
  shipTo?: {address1?:string;state?:string;postalCode?:string;country?:string}
  channelLocation?: string
  reference: string
  customer: string
  currency: string
  lines: { externalId: string; sku: string; quantity: string; price?: string }[]
}

/** stock resolves on provider acceptance, which is not proof of asynchronous processing. */
export interface Adapter {
  listings(): Promise<Listing[]>
  orders(): Promise<ChannelOrder[]>
  stock(listing: Listing, quantity: string, admission?: { idempotencyKey: string; beforeWrite: () => Promise<void> }): Promise<void>
}
