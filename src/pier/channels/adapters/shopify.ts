import type { Adapter, ChannelConfig, ChannelOrder } from './types'
import { array, credential, decimal, integer, object, stockQuantity, string, unique } from './http'
import { connectionPages, shopifyClient } from './shopify-client'

const PAGE_INFO = 'pageInfo { hasNextPage endCursor }'
const LINE_FIELDS = 'id sku requiresShipping unfulfilledQuantity originalUnitPriceSet { shopMoney { amount currencyCode } }'

export function createShopifyAdapter(config: ChannelConfig): Adapter {
  const graphql = shopifyClient(config)
  const locationId = credential(config, 'locationId')
  if (!/^gid:\/\/shopify\/Location\/\d+$/.test(locationId)) throw new Error('Shopify locationId must be an explicit Location GID')

  return {
    async listings() {
      const rows = await connectionPages(async after => (await graphql(`query PierListings($after: String) {
        productVariants(first: 100, after: $after, sortKey: ID) {
          nodes { id sku title product { title } inventoryItem { id } } ${PAGE_INFO}
        }
      }`, { after })).productVariants)
      const listings = rows.map(entry => {
        const row = object(entry)
        return {
          externalId: string(row.id), sku: row.sku === null ? '' : string(row.sku, 'Shopify SKU', true),
          title: `${string(object(row.product).title)} — ${string(row.title)}`,
          inventoryItemId: string(object(row.inventoryItem).id), locationId,
        }
      })
      unique(listings, row => row.externalId)
      return listings
    },
    async orders() {
      const rows = await connectionPages(async after => (await graphql(`query PierOrders($after: String) {
        orders(first: 50, after: $after, sortKey: ID, query: "status:open (fulfillment_status:unfulfilled OR fulfillment_status:partial) (financial_status:paid OR financial_status:authorized OR financial_status:partially_paid OR financial_status:partially_refunded)") {
          nodes { id name closed cancelledAt displayFinancialStatus displayFulfillmentStatus currencyCode customer { displayName } shippingAddress { address1 provinceCode zip countryCodeV2 } fulfillmentOrders(first: 100) { nodes { assignedLocation { location { id } } } pageInfo { hasNextPage endCursor } }
            lineItems(first: 100) { nodes { ${LINE_FIELDS} } ${PAGE_INFO} }
          } ${PAGE_INFO}
        }
      }`, { after })).orders)
      const orders: ChannelOrder[] = []
      for (const entry of rows) {
        const order = object(entry)
        if (order.closed !== false || order.cancelledAt !== null || !['UNFULFILLED', 'PARTIALLY_FULFILLED'].includes(string(order.displayFulfillmentStatus)) || !['PAID', 'AUTHORIZED', 'PARTIALLY_PAID', 'PARTIALLY_REFUNDED'].includes(string(order.displayFinancialStatus))) {
          throw new Error('Shopify returned an order outside the requested live scope')
        }
        const externalId = string(order.id)
        // Every order's line connection is paginated independently, including the first page.
        const entries = await connectionPages(async after => {
          if (after === null) return order.lineItems
          const data = await graphql(`query PierOrderLines($id: ID!, $after: String) {
            node(id: $id) { ... on Order { lineItems(first: 100, after: $after) { nodes { ${LINE_FIELDS} } ${PAGE_INFO} } } }
          }`, { id: externalId, after })
          return object(data.node, 'Shopify order').lineItems
        })
        const currency = string(order.currencyCode)
        const lines = entries.flatMap(entry => {
          const row = object(entry)
          const quantity = integer(row.unfulfilledQuantity)
          if (typeof row.requiresShipping !== 'boolean') throw new Error('Invalid Shopify line shipping flag')
          if (!quantity || !row.requiresShipping) return []
          const money = object(object(row.originalUnitPriceSet).shopMoney)
          if (money.currencyCode !== currency) throw new Error('Shopify line currency differs from order currency')
          return [{ externalId: string(row.id), sku: row.sku === null ? '' : string(row.sku, 'Shopify line SKU', true), quantity: String(quantity), price: decimal(money.amount) }]
        })
        unique(lines, line => line.externalId)
        if (!lines.length) continue
        const address=order.shippingAddress?object(order.shippingAddress):null;
        const fulfilment=order.fulfillmentOrders?object(order.fulfillmentOrders):null;
        const assigned=fulfilment&&object(fulfilment.pageInfo).hasNextPage===false?[...new Set(array(fulfilment.nodes).map(node=>object(object(object(node).assignedLocation).location).id))]:[];
        const channelLocation=assigned.length===1?string(assigned[0],'Shopify assigned location'):undefined;
        orders.push({ externalId,...(address?{shipTo:{address1:address.address1 == null ? '' : string(address.address1,'Shopify shipping address',true),state:address.provinceCode == null ? '' : string(address.provinceCode,'Shopify shipping address',true),postalCode:address.zip == null ? '' : string(address.zip,'Shopify shipping address',true),country:address.countryCodeV2 == null ? '' : string(address.countryCodeV2,'Shopify shipping address',true)}}:{}),...(channelLocation?{channelLocation}:{}), reference: string(order.name), currency, customer: order.customer === null ? '' : string(object(order.customer).displayName, 'Shopify customer', true), lines })
      }
      unique(orders, order => order.externalId)
      return orders
    },
    async stock(listing, quantity) {
      if (!listing.inventoryItemId || listing.locationId !== locationId) throw new Error('Shopify listing needs its mapped inventory item and configured location')
      const count = stockQuantity(quantity)
      const data = await graphql(`query PierInventory($id: ID!, $locationId: ID!) {
        inventoryItem(id: $id) { inventoryLevel(locationId: $locationId) { quantities(names: ["available"]) { name quantity } } }
      }`, { id: listing.inventoryItemId, locationId })
      const level = object(object(data.inventoryItem, 'Shopify inventory item').inventoryLevel, 'Shopify inventory level')
      const available = array(level.quantities).map(entry => object(entry)).find(row => row.name === 'available')
      const current = available?.quantity
      if (typeof current !== 'number' || !Number.isSafeInteger(current)) throw new Error('Shopify did not return the current available quantity')
      if (current === count) return // The provider read itself confirms the desired quantity.
      const result = await graphql(`mutation PierStock($input: InventorySetQuantitiesInput!, $idempotencyKey: String!) {
        inventorySetQuantities(input: $input) @idempotent(key: $idempotencyKey) {
          inventoryAdjustmentGroup { changes { name quantityAfterChange } }
          userErrors { code field message }
        }
      }`, {
        input: { name: 'available', reason: 'correction', quantities: [{ inventoryItemId: listing.inventoryItemId, locationId, quantity: count, changeFromQuantity: current }] },
        idempotencyKey: crypto.randomUUID(),
      })
      const payload = object(result.inventorySetQuantities, 'Shopify stock result')
      if (array(payload.userErrors).length) throw new Error('Shopify rejected the stock update; reconcile before replay')
      const changes = array(object(payload.inventoryAdjustmentGroup, 'Shopify inventory adjustment').changes).map(entry => object(entry))
      if (!changes.some(change => change.name === 'available' && change.quantityAfterChange === count)) {
        throw new Error('Shopify did not confirm the requested available quantity')
      }
    },
  }
}
