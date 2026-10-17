import type { Listing } from './types'
import type { AmazonRequest } from './amazon-client'
import { array, integer, nextToken, object, string, type JsonObject } from './http'

export function marketplaceSummary(item: JsonObject, marketplaceId: string): JsonObject {
  const summaries = array(item.summaries, 'Amazon listing summaries').map(entry => object(entry))
  const summary = summaries.find(row => row.marketplaceId === marketplaceId)
  if (!summary) throw new Error('Amazon listing has no summary for the configured marketplace')
  return summary
}

/** Amazon caps each search at 1,000 items; partition creation time before following its cursors. */
export async function amazonListings(api: AmazonRequest, sellerId: string, marketplaceId: string): Promise<Listing[]> {
  const path = `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}`
  const result = new Map<string, Listing>()

  async function window(start?: number, end?: number): Promise<void> {
    const query: Record<string, string> = { marketplaceIds: marketplaceId, includedData: 'summaries', pageSize: '20', sortBy: 'createdDate', sortOrder: 'ASC' }
    if (start !== undefined && end !== undefined) {
      query.createdAfter = new Date(start).toISOString()
      query.createdBefore = new Date(end).toISOString()
    }
    let page = await api(path, query)
    const count = integer(page.numberOfResults, 'Amazon listing count')
    if (count > 1000) {
      const lower = start ?? 0
      const upper = end ?? Date.now()
      if (upper - lower <= 1) throw new Error('Amazon listing search exceeds 1,000 items at one timestamp; use an inventory report to reconcile')
      const middle = Math.floor((lower + upper) / 2)
      // Inclusive boundaries intentionally overlap; the provider's stable SKU identity deduplicates them.
      await window(lower, middle)
      await window(middle, upper)
      return
    }
    const seenTokens = new Set<string>()
    const seenSkus = new Set<string>()
    do {
      for (const entry of array(page.items, 'Amazon listings')) {
        const item = object(entry)
        const sku = string(item.sku, 'Amazon seller SKU')
        if (seenSkus.has(sku)) throw new Error('Amazon listing pagination returned a duplicate SKU')
        seenSkus.add(sku)
        const summary = marketplaceSummary(item, marketplaceId)
        // A seller SKU, rather than an ASIN shared by sellers, identifies a Listings Items resource.
        result.set(sku, { externalId: sku, sku, title: string(summary.itemName, 'Amazon listing title') })
      }
      const token = page.pagination === undefined ? undefined : nextToken(object(page.pagination).nextToken, seenTokens)
      if (!token) break
      page = await api(path, { ...query, pageToken: token })
    } while (true)
    if (seenSkus.size < count) throw new Error('Amazon listing pagination ended before its declared result count')
  }

  await window()
  return [...result.values()]
}
