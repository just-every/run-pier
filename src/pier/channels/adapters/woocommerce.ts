import type { Adapter, ChannelConfig, ChannelOrder, Listing } from './types'
import { array, baseUrl, credential, decimal, integer, object, request, stockQuantity, string, unique } from './http'

function id(value: unknown): string {
  const result = integer(value, 'WooCommerce identity')
  if (!result) throw new Error('Invalid WooCommerce identity')
  return String(result)
}

export function createWooCommerceAdapter(config: ChannelConfig): Adapter {
  const root = baseUrl(config)
  root.pathname = `${root.pathname.replace(/\/$/, '').replace(/\/wp-json\/wc\/v3$/, '')}/wp-json/wc/v3/`
  const bytes = new TextEncoder().encode(`${credential(config, 'consumerKey')}:${credential(config, 'consumerSecret')}`)
  const headers = { Authorization: `Basic ${btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''))}`, 'Content-Type': 'application/json' }

  async function pages(path: string, query: Record<string, string> = {}): Promise<unknown[]> {
    const rows: unknown[] = []
    for (let page = 1; ; page++) {
      const url = new URL(path, root)
      url.search = new URLSearchParams({ ...query, per_page: '100', page: String(page), orderby: 'id', order: 'asc' }).toString()
      const { body, response } = await request(url, { headers }, 'WooCommerce read')
      const entries = array(body)
      rows.push(...entries)
      const total = response.headers.get('X-WP-TotalPages')
      if (total !== null) {
        if (!/^\d+$/.test(total)) throw new Error('Invalid WooCommerce page count')
        if (page >= Number(total)) break
        if (!entries.length) throw new Error('WooCommerce pagination ended before its declared page count')
      } else if (entries.length < 100) break
      // Detect a server ignoring page rather than looping or importing duplicate orders.
      unique(rows, row => id(object(row).id))
    }
    unique(rows, row => id(object(row).id))
    return rows
  }

  return {
    async listings() {
      const result: Listing[] = []
      for (const entry of await pages('products')) {
        const product = object(entry)
        const productId = id(product.id)
        const title = string(product.name, 'WooCommerce product name')
        const type = string(product.type, 'WooCommerce product type')
        if (type === 'variable') {
          for (const entry of await pages(`products/${productId}/variations`)) {
            const variation = object(entry)
            result.push({ externalId: `${productId}:${id(variation.id)}`, sku: string(variation.sku, 'WooCommerce SKU', true), title })
          }
        } else if (type === 'simple') {
          result.push({ externalId: productId, sku: string(product.sku, 'WooCommerce SKU', true), title })
        }
      }
      return result
    },
    async orders() {
      const orders: ChannelOrder[] = []
      // Pending/failed/completed/cancelled orders must not become new fulfilment demand.
      for (const entry of await pages('orders', { status: 'processing' })) {
        const order = object(entry)
        if (order.status !== 'processing') throw new Error('WooCommerce returned an order outside the requested live status')
        if (array(order.refunds, 'WooCommerce order refunds').length) throw new Error('WooCommerce partially refunded orders require refund reconciliation before importing demand')
        const billing = object(order.billing, 'WooCommerce billing')
        const customer = [string(billing.first_name, 'billing first name', true), string(billing.last_name, 'billing last name', true)].filter(Boolean).join(' ')
        const lines = array(order.line_items).map(entry => {
          const line = object(entry)
          const quantity = integer(line.quantity)
          // WooCommerce encodes price as a JSON number; convert only its exact JSON decimal representation.
          const price = typeof line.price === 'number' && Number.isFinite(line.price) ? String(line.price) : line.price
          return { externalId: id(line.id), sku: string(line.sku, 'WooCommerce order SKU', true), quantity: String(quantity), price: decimal(price) }
        }).filter(line => line.quantity !== '0')
        if (!lines.length) continue
        orders.push({ externalId: id(order.id), reference: string(order.number, 'WooCommerce order number'), customer, currency: string(order.currency), lines })
      }
      return orders
    },
    async stock(listing, quantity) {
      const match = /^(\d+)(?::(\d+))?$/.exec(listing.externalId)
      if (!match) throw new Error('Invalid WooCommerce listing identity')
      const path = match[2] ? `products/${match[1]}/variations/${match[2]}` : `products/${match[1]}`
      const count = stockQuantity(quantity)
      const { body } = await request(new URL(path, root), { method: 'PUT', headers, body: JSON.stringify({ manage_stock: true, stock_quantity: count }) }, 'WooCommerce stock update')
      const result = object(body)
      if (id(result.id) !== (match[2] ?? match[1]) || result.manage_stock !== true || result.stock_quantity !== count) {
        throw new Error('WooCommerce did not confirm the requested listing stock quantity')
      }
    },
  }
}
