import { object, string, unique } from './adapters/http'
import { connectionPages, shopifyClient } from './adapters/shopify-client'
import { shopifyOrigin } from './adapters/shopify-auth'

/** Read-only setup: credentials never enter business state or command history. */
export async function readShopifyLocations(payload: { baseUrl?: unknown; authMode?: unknown; accessToken?: unknown; clientId?: unknown; clientSecret?: unknown }): Promise<{ locations: { id: string; name: string }[] }> {
  const address = string(payload.baseUrl, 'Shopify store address').trim()
  const authMode = payload.authMode ?? (payload.accessToken ? 'accessToken' : 'clientCredentials')
  if (!['accessToken', 'clientCredentials'].includes(String(authMode))) throw new Error('Choose a supported Shopify authorization method')
  const credentials: Record<string, string> = { authMode: String(authMode) }
  for (const name of (authMode === 'accessToken' ? ['accessToken'] as const : ['clientId', 'clientSecret'] as const)) {
    const value = string(payload[name], `Shopify ${name}`).trim()
    if (!value || value.length > 2000) throw new Error(`Invalid Shopify ${name}`)
    credentials[name] = value
  }
  const config = { provider: 'shopify' as const, baseUrl: address, credentials }
  shopifyOrigin(config)
  const graphql = shopifyClient(config)
  const rows = await connectionPages(async after => (await graphql(`query PierSetupLocations($after: String) {
    locations(first: 100, after: $after, includeInactive: false) {
      nodes { id name } pageInfo { hasNextPage endCursor }
    }
  }`, { after })).locations)
  const locations = rows.map(entry => {
    const row = object(entry, 'Shopify location')
    const id = string(row.id, 'Shopify location identity')
    if (!/^gid:\/\/shopify\/Location\/\d+$/.test(id)) throw new Error('Invalid Shopify location identity')
    return { id, name: string(row.name, 'Shopify location name') }
  })
  unique(locations, row => row.id)
  return { locations }
}
