import type { Adapter, ChannelConfig, ChannelOrder } from './types'
import { array, credential, decimal, integer, nextToken, object, stockQuantity, string, unique } from './http'
import { amazonClient } from './amazon-client'
import { amazonListings, marketplaceSummary } from './amazon-listings'

export function createAmazonAdapter(config: ChannelConfig): Adapter {
  const api = amazonClient(config)
  const sellerId = credential(config, 'sellerId')
  const marketplaceId = credential(config, 'marketplaceId')

  return {
    listings: () => amazonListings(api, sellerId, marketplaceId),
    async orders() {
      const since = new Date()
      since.setUTCFullYear(since.getUTCFullYear() - 1)
      const createdAfter = config.credentials.createdAfter ?? since.toISOString()
      if (!Number.isFinite(Date.parse(createdAfter))) throw new Error('Invalid Amazon createdAfter timestamp')
      const query = {
        marketplaceIds: marketplaceId, createdAfter, maxResultsPerPage: '100',
        fulfilledBy: 'MERCHANT', fulfillmentStatuses: 'UNSHIPPED,PARTIALLY_SHIPPED',
        includedData: 'BUYER,PROCEEDS,FULFILLMENT',
      }
      const orders: ChannelOrder[] = []
      const seen = new Set<string>()
      let token: string | undefined
      do {
        const data = await api('/orders/2026-01-01/orders', { ...query, ...(token ? { paginationToken: token } : {}) })
        for (const entry of array(data.orders, 'Amazon orders')) {
          const order = object(entry)
          const fulfillment = object(order.fulfillment, 'Amazon order fulfillment')
          if (fulfillment.fulfilledBy !== 'MERCHANT' || !['UNSHIPPED', 'PARTIALLY_SHIPPED'].includes(string(fulfillment.fulfillmentStatus))) {
            throw new Error('Amazon returned an order outside the requested merchant-fulfilled live scope')
          }
          const currency = string(object(object(order.proceeds).grandTotal).currencyCode, 'Amazon order currency')
          const lines = array(order.orderItems, 'Amazon order items').flatMap(entry => {
            const line = object(entry)
            const quantity = integer(object(line.fulfillment, 'Amazon item fulfillment').quantityUnfulfilled)
            if (!quantity) return []
            if (line.measurement !== undefined && object(line.measurement).unit !== 'COUNT') throw new Error('Amazon measured-unit orders require an explicit unit mapping')
            const product = object(line.product)
            const price = product.price === undefined ? undefined : object(object(product.price).unitPrice)
            if (price && price.currencyCode !== currency) throw new Error('Amazon item currency differs from order currency')
            return [{ externalId: string(line.orderItemId), sku: product.sellerSku === undefined ? '' : string(product.sellerSku, 'Amazon order SKU', true), quantity: String(quantity), ...(price ? { price: decimal(price.amount) } : {}) }]
          })
          unique(lines, line => line.externalId)
          if (!lines.length) continue
          const externalId = string(order.orderId)
          // Missing protected buyer data stays visibly unknown rather than inventing a customer.
          const buyer = order.buyer === undefined ? undefined : object(order.buyer)
          const customer = buyer?.buyerName === undefined ? '' : string(buyer.buyerName, 'Amazon buyer name', true)
          orders.push({ externalId, reference: externalId, customer, currency, lines })
        }
        token = data.pagination === undefined ? undefined : nextToken(object(data.pagination).nextToken, seen)
      } while (token)
      unique(orders, order => order.externalId)
      return orders
    },
    async stock(listing, quantity) {
      const count = stockQuantity(quantity)
      const path = `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(listing.externalId)}`
      const item = await api(path, { marketplaceIds: marketplaceId, includedData: 'summaries,fulfillmentAvailability' })
      if (item.sku !== listing.externalId) throw new Error('Amazon returned a different listing identity')
      const summary = marketplaceSummary(item, marketplaceId)
      const availability = array(item.fulfillmentAvailability, 'Amazon fulfillment availability').map(entry => object(entry))
      if (!availability.some(row => row.fulfillmentChannelCode === 'DEFAULT')) throw new Error('Amazon listing has no merchant-fulfilled inventory; FBA inventory cannot be published here')
      const result = await api(path, { marketplaceIds: marketplaceId }, 'PATCH', {
        productType: string(summary.productType, 'Amazon product type'),
        patches: [{ op: 'merge', path: '/attributes/fulfillment_availability', value: [{ fulfillment_channel_code: 'DEFAULT', quantity: count }] }],
      })
      if (result.sku !== listing.externalId || result.status !== 'ACCEPTED') throw new Error('Amazon did not accept the stock update for processing')
      string(result.submissionId, 'Amazon stock submission identity')
      if (result.issues !== undefined && array(result.issues).some(entry => object(entry).severity === 'ERROR')) throw new Error('Amazon stock submission contains an error issue')
      // ACCEPTED is asynchronous submission acceptance, not processed inventory or read-back evidence.
    },
  }
}
