import type { ChannelConfig } from './types'
import { array, baseUrl, nextToken, object, request, type JsonObject } from './http'
import { shopifyAccessToken } from './shopify-auth'

export const SHOPIFY_API_VERSION = '2026-10'

export function shopifyClient(config: ChannelConfig) {
  const url = baseUrl(config)
  url.pathname = `/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
  // Shared by concurrent listings/orders and every stock call in this bounded sync.
  // A new adapter instance on the next sync obtains fresh authorization.
  let token: Promise<string> | undefined
  return async (query: string, variables: JsonObject = {}): Promise<JsonObject> => {
    token ??= shopifyAccessToken(config)
    const headers = { 'X-Shopify-Access-Token': await token, 'Content-Type': 'application/json' }
    const { body, response } = await request(url, { method: 'POST', headers, body: JSON.stringify({ query, variables }) }, 'Shopify GraphQL')
    const version = response.headers.get('X-Shopify-API-Version')
    if (version && version !== SHOPIFY_API_VERSION) throw new Error('Shopify served a different API version; reconcile before replay')
    const result = object(body)
    if (result.errors !== undefined && array(result.errors).length) throw new Error('Shopify GraphQL returned errors; reconcile any possible external write before replay')
    return object(result.data, 'Shopify GraphQL data')
  }
}

export async function connectionPages(load: (after: string | null) => Promise<unknown>): Promise<unknown[]> {
  const result: unknown[] = []
  const seen = new Set<string>()
  let after: string | null = null
  do {
    const connection = object(await load(after), 'Shopify connection')
    result.push(...array(connection.nodes, 'Shopify nodes'))
    const page = object(connection.pageInfo, 'Shopify pageInfo')
    if (typeof page.hasNextPage !== 'boolean') throw new Error('Invalid Shopify pagination flag')
    if (!page.hasNextPage) break
    const token = nextToken(page.endCursor, seen)
    if (!token) throw new Error('Shopify has another page without a cursor')
    after = token
  } while (true)
  return result
}
