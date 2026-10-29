import { records, type PierState } from './api'
import { sourceDocument } from './display'
import { Facts, Table } from './controls'

/** Retain the exact command privately; explain its consequence using live names. */
export function RecoveryReview({ state, type, payload }: { state: PierState | null; type: string; payload: object }) {
  const actions: Record<string, string> = {
    'ltl.pickup': 'Recover the exact reviewed LTL pickup and its once-only dispatch',
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
    if (kind) return [{ label: ({ itemId: 'Item', locationId: 'Bin', fromLocationId: 'Source bin', toLocationId: 'Destination bin', supplierId: 'Supplier', customerId: 'Customer' } as Record<string, string>)[key], value: records(state, kind).find(row => row.id === value)?.name || 'Removed record' }]
    if (key === 'manifestId') return [{ label: 'Freight manifest', value: records(state, 'ltlManifests').find(row => row.id === value)?.reference || 'Manifest not available' }]
    if (['poId', 'orderId', 'shipmentId', 'returnId', 'transferId', 'countId'].includes(key)) return [{ label: 'Document', value: sourceDocument(state, value).name }]
    if (['quantity', 'supplierReference', 'shipmentReference', 'reason'].includes(key)) return [{ label: ({ quantity: 'Quantity (base units)', supplierReference: 'Supplier receipt reference', shipmentReference: 'Shipment reference', reason: 'Reason' } as Record<string, string>)[key], value }]
    return []
  })
  const lines = state && Array.isArray((payload as { lines?: unknown }).lines) ? (payload as { lines: Record<string, any>[] }).lines : []
  const named = (kind: string, id: string) => state ? records(state, kind).find(row => row.id === id)?.name || 'Removed record' : 'Record not loaded'
  return <><p>{actions[type] || 'Recover the action you submitted.'}</p>{values.length > 0 && <Facts values={values} />}{lines.length > 0 && <Table headings={['Item', 'Quantity (base units)', 'Bin']} numeric={[1]}>{lines.map((line, index) => {
    const purchaseLine = state && records(state, 'purchaseOrders').flatMap(po => po.lines).find(candidate => candidate.id === line.poLineId)
    return <tr key={index}><td>{named('items', line.itemId || purchaseLine?.itemId)}</td><td>{typeof line.quantity === 'string' ? line.quantity : 'Review the saved action'}</td><td>{line.locationId ? named('locations', line.locationId) : 'Not specified'}</td></tr>
  })}</Table>}<p>The saved request will be retried unchanged. Review its result before starting another action.</p></>
}
