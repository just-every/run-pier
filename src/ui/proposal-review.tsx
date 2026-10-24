import type { ReactNode } from 'react'
import { records, unit, type PierState, type RecordData } from './api'
import { Table } from './controls'
import { money, when, words } from './display'
import { shipDay } from './orders/model'
import { product, sum } from './quantity'

// A prepared proposal as its reviewer reads it: what applying it does, the records
// the preparer cited and the stock position it was prepared against, in names,
// quantities with units, USD prices and US dates. Exact saved values stay in the
// Activity export; nothing here shows record identities or raw keys.

const usd = (value: unknown) => value === null || value === undefined ? 'unpriced' : `$${money(value)}`
const date = (value: unknown) => value ? shipDay(String(value), true) : 'not set'
const find = (state: PierState, kind: string, id: unknown) => records(state, kind).find(row => row.id === id)
const party = (state: PierState, id: unknown) => find(state, 'parties', id)?.name ?? 'a removed party'
const item = (state: PierState, id: unknown) => find(state, 'items', id)?.name ?? 'a removed item'
const amount = (state: PierState, quantity: unknown, itemId: unknown) => `${quantity} ${unit(state, String(itemId))}`.trim()
const total = (lines: any[]) => lines.every(line => line.price !== null && line.price !== undefined) ? usd(sum(lines.map(line => product(String(line.quantity), String(line.price))))) : 'unpriced'
const ref = (row: RecordData) => row.reference ?? `created ${when(row.createdAt)}`

function lines(state: PierState, rows: any[]) {
  const shown = rows.slice(0, 3).map(line => `${amount(state, line.quantity, line.itemId)} ${item(state, line.itemId)}${line.price !== null && line.price !== undefined ? ` at ${usd(line.price)}` : ''}`)
  return rows.length > 3 ? `${shown.join(', ')} and ${rows.length - 3} more` : shown.join(', ')
}

/** One cited record in words; text the preparer wrote stays as written. */
function cited(state: PierState, entry: string): string {
  const order = find(state, 'orders', entry)
  if (order) return `Sales order ${ref(order)} · ${party(state, order.customerId)} · ${order.lines.length} ${order.lines.length === 1 ? 'line' : 'lines'}, ${usd(order.total)} USD · promised ${date(order.promiseDate)}`
  const po = find(state, 'purchaseOrders', entry)
  if (po) return `Purchase order ${ref(po)} · ${party(state, po.supplierId)} · ${lines(state, po.lines)} · ${words(po.status)}, promised ${date(po.promiseDate)}`
  const found = find(state, 'items', entry)
  if (found) return `Item ${found.name} · ${found.sku}`
  const counted = find(state, 'counts', entry)
  if (counted) return `Count at ${find(state, 'locations', counted.locationId)?.name ?? 'a removed bin'} · captured ${when(counted.createdAt)}`
  const receipt = find(state, 'receipts', entry)
  if (receipt) return `Receipt ${receipt.supplierReference} · ${lines(state, receipt.lines)} · posted ${when(receipt.createdAt)}`
  const shipment = find(state, 'shipments', entry)
  if (shipment) return `Shipment ${shipment.shipmentReference || shipment.reference} · ${when(shipment.createdAt)}`
  const batch = find(state, 'imports', entry)
  if (batch) return `Import ${batch.namespace} · staged ${when(batch.createdAt)}`
  if (find(state, 'parties', entry)) return party(state, entry)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry)) return 'A record Pier no longer holds'
  return entry
}

/** What applying (or acting on) the proposal does, per kind. */
function consequence(state: PierState, proposal: RecordData): ReactNode {
  const plan = proposal.plan ?? {}
  if (proposal.kind === 'replenishment' && plan.poId) {
    const po = find(state, 'purchaseOrders', plan.poId)
    if (!po) return 'The draft purchase order it names has been removed.'
    return `Purchase order ${ref(po)} to ${party(state, po.supplierId)}${po.destinationWarehouse ? ` for ${po.destinationWarehouse}` : ''}: ${lines(state, po.lines)}, ${total(po.lines)} USD in all, promised ${date(po.promiseDate)}. Commit it from Purchasing once approved.`
  }
  if (proposal.kind === 'replenishment') return `Order ${amount(state, plan.recommended, plan.itemId)} ${item(state, plan.itemId)} from ${party(state, plan.supplierId)} (at least ${amount(state, plan.minimum, plan.itemId)}, at most ${amount(state, plan.stretch, plan.itemId)}), promised ${date(plan.promiseDate)}.${plan.demandContext ? ` ${plan.demandContext}` : ''}`
  if (proposal.kind === 'reallocation') {
    const from = find(state, 'orders', plan.fromOrderId), to = find(state, 'orders', plan.toOrderId)
    const side = (order: RecordData | undefined) => order ? `${ref(order)} (${party(state, order.customerId)}, promised ${date(order.promiseDate)})` : 'a removed order'
    return `Move ${amount(state, plan.quantity, plan.itemId)} ${item(state, plan.itemId)} reserved for ${side(from)} to ${side(to)}.`
  }
  if (proposal.kind === 'count-drift') {
    const counted = find(state, 'counts', plan.countId)
    return counted ? `Approve the count at ${find(state, 'locations', counted.locationId)?.name ?? 'a removed bin'} captured ${when(counted.createdAt)}, posting its drift to stock.` : 'The count it names has been removed.'
  }
  if (proposal.kind === 'migration') {
    const batch = find(state, 'imports', plan.batchId)
    return `Review import ${batch?.namespace ?? 'that was removed'} with mapping ${plan.mappingRevision}. ${plan.reconciliation ?? ''} ${plan.duplicateResolution ?? ''}`.trim()
  }
  return null
}

/** The stock position and promises the proposal was prepared against. */
function Inputs({ state, context }: { state: PierState; context: any }) {
  const reorder: any[] = context?.reorder ?? [], promises: any[] = context?.orders ?? []
  const short = reorder.filter(row => row.minimum !== '0')
  const lead = (row: any) => { const terms = (row.terms ?? []).slice().sort((a: any, b: any) => a.leadDays - b.leadDays)[0]; return terms ? `${party(state, terms.supplierId)} · ${terms.leadDays} days` : 'No supplier terms' }
  return <>
    <p>{reorder.length} {reorder.length === 1 ? 'item' : 'items'} and {promises.length} customer {promises.length === 1 ? 'promise' : 'promises'} as they stood. {short.length ? `Short after expected receipts: ${short.map(row => `${amount(state, row.minimum, row.itemId)} ${item(state, row.itemId)}`).join(', ')}.` : 'No item was short after expected receipts.'}</p>
    {(reorder.length > 0 || promises.length > 0) && <details className="proposal-details"><summary>Show details</summary>
      {reorder.length > 0 && <><h4>Stock position at preparation</h4><Table numeric={[1, 2, 3, 4]} headings={['Item', 'Open demand', 'On hand', 'Expected', 'Short', 'Fastest supplier']}>{reorder.map(row => <tr key={row.itemId}><td>{item(state, row.itemId)}</td><td>{amount(state, row.demand, row.itemId)}</td><td>{amount(state, row.onHand, row.itemId)}</td><td>{amount(state, row.expected, row.itemId)}</td><td>{amount(state, row.minimum, row.itemId)}</td><td>{lead(row)}</td></tr>)}</Table></>}
      {promises.length > 0 && <><h4>Customer promises at preparation</h4><Table headings={['Order', 'Customer', 'Promised']}>{promises.map(row => { const order = find(state, 'orders', row.id); return <tr key={row.id}><td>{order ? ref(order) : 'Removed order'}</td><td>{party(state, row.customerId)}</td><td>{date(row.promiseDate)}</td></tr> })}</Table></>}
      <p className="muted">Exact saved values and record identities are in the Activity export.</p>
    </details>}
  </>
}

export function ProposalReview({ state, proposal }: { state: PierState; proposal: RecordData }) {
  const evidence: string[] = Array.isArray(proposal.evidence) ? proposal.evidence : []
  return <div className="proposal-review">
    <h3>Proposal</h3><p>{typeof proposal.assumptions === 'string' ? proposal.assumptions : 'No explanation recorded.'}</p>
    <h3>What applying it does</h3><p>{consequence(state, proposal)}</p>
    <h3>Evidence cited</h3><ul className="proposal-evidence">{evidence.map((entry, index) => <li key={index}>{cited(state, entry)}</li>)}</ul>
    <h3>Stock and promises at preparation</h3><Inputs state={state} context={proposal.context} />
  </div>
}
