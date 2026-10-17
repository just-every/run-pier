import { records, type PierState, type RecordData, type RunCommand } from '../api'

export type ChannelProps = { state: PierState; run: RunCommand; busy: boolean }
export type Provider = 'stall' | 'woocommerce' | 'shopify' | 'amazon'
export type Connection = RecordData & {
  name: string; provider: Provider; baseUrl: string; warehouse: string; buffer: string
  enabled: boolean; approvedBy: string; lastReceivedAt?: string; problem?: string | null
}
export type Listing = RecordData & {
  channelId: string; externalId: string; sku: string; title: string; itemId: string | null
  matchedBy?: string; publishedQuantity: string | null; acceptedAt?: string | null
  acceptanceMs?: number | null; problem?: string | null; available: string | null
  holds: { id: string; quantity: string; reason: string }[]; lag: boolean; lagSeconds: number
}
export type ChannelOrder = RecordData & {
  channelId: string; externalId: string; reference: string; orderId: string | null
  reservedAt?: string | null; problem?: string | null
}
export type Hold = RecordData & {
  itemId: string; warehouse: string; quantity: string; reason: string; releasedAt?: string
}
export const providers: { id: Provider; name: string; mark: string }[] = [
  { id: 'stall', name: 'Stall', mark: 'St' },
  { id: 'shopify', name: 'Shopify', mark: 'S' },
  { id: 'amazon', name: 'Amazon', mark: 'a' },
  { id: 'woocommerce', name: 'WooCommerce', mark: 'Woo' },
]
export const providerName = (id: string) => providers.find(provider => provider.id === id)?.name ?? id
export const connections = (state: PierState) => records(state, 'channels') as Connection[]
export const listings = (state: PierState) => records(state, 'channelListings') as Listing[]
export const warehouses = (state: PierState) => [...new Set(records(state, 'locations').filter(row => row.kind === 'bin').map(row => String(row.warehouse)))].sort().map(id => ({ id, version: 0, name: id }))
export function connectionPayload(row: Connection) {
  return { id: row.id, version: row.version, name: row.name, provider: row.provider, baseUrl: row.baseUrl, warehouse: row.warehouse, buffer: row.buffer, enabled: row.enabled }
}
export function lagTime(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`
}
