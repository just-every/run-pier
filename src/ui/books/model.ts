import { records, type PierState, type RecordData, type RunCommand } from '../api'

export type BooksProps = { state: PierState; run: RunCommand; busy: boolean }
export type BookConnection = RecordData & {
  id: string; provider: 'pantry'; baseUrl: string; enabled: boolean
  lastSync?: string | null; problem?: string | null; writeOffAccountId?: string
}
export type BookJob = {
  id: string; kind: 'item' | 'invoice' | 'credit' | 'bill' | 'journal' | 'receipt' | 'valuation'
  reference: string; sourceId: string; sourceKind: string; total?: string | null; currency: 'USD'
  status: 'pending' | 'posted' | 'review' | 'uncertain' | 'reconciled' | 'skipped'
  remoteId?: string | null; paid?: string | null; open?: string | null; reason?: string | null; fix?: string | null
  version: number; received?: boolean; attempted: boolean
}
export const connections = (state: PierState) => records(state, 'bookConnections') as BookConnection[]
export const jobs = (state: PierState) => records(state, 'bookJobs') as BookJob[]
export const needsReview = (job: BookJob) => job.status === 'review' || job.status === 'uncertain'
export const canSkip = (job: BookJob) => job.status === 'review' && job.attempted === false && !job.remoteId && job.sourceKind !== 'valuation'

export function sourceLink(state: PierState, job: BookJob) {
  const id = encodeURIComponent(job.sourceId)
  if (['order', 'orders', 'sales'].includes(job.sourceKind)) return `#sales/${id}`
  if (['receipt', 'receipts', 'purchaseOrder', 'purchaseOrders'].includes(job.sourceKind)) return `#purchasing/${id}`
  if (['shipment', 'shipments'].includes(job.sourceKind)) {
    const shipment = records(state, 'shipments').find(row => row.id === job.sourceId)
    return shipment?.orderId ? `#sales/${encodeURIComponent(shipment.orderId)}` : '#sales'
  }
  if (job.sourceKind === 'item') return '#stock'
  if (job.sourceKind === 'return') return '#floor/returns'
  if (job.sourceKind === 'valuation') return '#reports'
  return `#activity/${id}`
}
