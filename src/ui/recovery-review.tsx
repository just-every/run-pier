import { label, records, type PierState } from './api'
import { sourceDocument } from './display'
import { Facts } from './controls'

/** Retain the exact command privately; explain its consequence using live names. */
export function RecoveryReview({ state, type, payload }: { state: PierState | null; type: string; payload: object }) {
  const actions: Record<string, string> = {
    'receipt.create': 'Record a purchase receipt', 'transfer.send': 'Dispatch stock into transit',
    'transfer.receive': 'Receive stock at its destination', 'return.create': 'Receive returned goods into quarantine',
    'return.approve': 'Approve inspected stock for restocking', 'return.restock': 'Restock an approved return',
    'dispatch.create': 'Dispatch reserved stock', 'order.create': 'Create a sales order',
    'order.cancel': 'Cancel unshipped demand', 'po.draft': 'Save a purchase draft',
    'po.approve': 'Approve a purchase', 'po.commit': 'Commit an approved purchase',
    'count.approve': 'Post a reviewed count', 'count.record': 'Save a physical count',
  }
  const values = Object.entries(payload).flatMap(([key, value]) => {
    if (!state || typeof value !== 'string' || !value) return []
    const kind = ({ itemId: 'items', locationId: 'locations', fromLocationId: 'locations', toLocationId: 'locations', supplierId: 'parties', customerId: 'parties' } as Record<string, string>)[key]
    if (kind) return [{ label: ({ itemId: 'Item', locationId: 'Bin', fromLocationId: 'Source bin', toLocationId: 'Destination bin', supplierId: 'Supplier', customerId: 'Customer' } as Record<string, string>)[key], value: label(records(state, kind), value) }]
    if (['poId', 'orderId', 'shipmentId', 'returnId', 'transferId', 'countId'].includes(key)) return [{ label: 'Document', value: sourceDocument(state, value).name }]
    if (['quantity', 'supplierReference', 'shipmentReference', 'reason'].includes(key)) return [{ label: ({ quantity: 'Quantity (base units)', supplierReference: 'Supplier receipt reference', shipmentReference: 'Shipment reference', reason: 'Reason' } as Record<string, string>)[key], value }]
    return []
  })
  return <><p>{actions[type] || 'Recover the action you submitted.'}</p>{values.length > 0 && <Facts values={values} />}<p>The saved request will be retried unchanged. Review its result before starting another action.</p></>
}
