import { useState } from 'react'
import { label, records, unit, type PierState, type RecordData, type RunCommand } from '../api'
import { Icon } from '../icons'
import { Barcode } from '../barcode'
import { difference, fromMillionths, sum } from '../quantity'
import { isOpen, onHand, orderWarehouses, shipDay, shortage } from './model'

// The exception on an order: its first short line, the stock and inbound
// purchase order behind it, and the three ways Pier can resolve it today:
// ship what is reserved now, wait for supply and re-promise, or prepare a
// reallocation from a later order for human approval.

const today = () => new Date().toLocaleDateString('en-CA')

export function Exception({ state, order, run, busy, resolve }: { state: PierState; order: RecordData; run: RunCommand; busy: boolean; resolve: (choice: string) => void }) {
  const [choice, setChoice] = useState('')
  const short = shortage(state, order)
  if (!short || !isOpen(order)) return null
  const { line, po, poLine, expectedDate, estimated } = short
  const item = records(state, 'items').find(row => row.id === line.itemId), u = unit(state, line.itemId), where = orderWarehouses(state, order)[0] || ''
  const stock = onHand(state, line.itemId, where), parties = records(state, 'parties')
  const reserved = sum(order.lines.map((row: any) => row.reserved))
  const donor = records(state, 'orders').filter(row => row.id !== order.id && isOpen(row) && (!order.promiseDate || !row.promiseDate || row.promiseDate > order.promiseDate))
    .map(row => ({ order: row, held: sum(records(state, 'reservations').filter(r => r.orderId === row.id && r.itemId === line.itemId).map(r => fromMillionths(String(r.quantity)))) }))
    .filter(row => row.held !== '0').sort((a, b) => String(b.order.promiseDate || '9999').localeCompare(String(a.order.promiseDate || '9999')))[0]
  const moved = donor ? (Number(donor.held) < Number(line.backorder) ? donor.held : line.backorder) : '0'
  const options = [
    { id: 'split', title: 'Split shipment', detail: `Ship ${line.reserved} reserved now, backorder ${line.backorder}`, facts: [['Ship date', shipDay(today())], ['Left on backorder', `${line.backorder} ${u}`]], disabled: reserved === '0' && 'Nothing is reserved yet' },
    { id: 'backorder', title: `Backorder ${line.backorder}`, detail: expectedDate ? `Ship all ${line.quantity} on ${shipDay(expectedDate)}` : `Hold all ${line.quantity} until supply arrives`, facts: [['Ship date', expectedDate ? shipDay(expectedDate) : 'No supplier date'], ['Basis', estimated ? 'Estimate' : 'Confirmed supply']], disabled: false },
    { id: 'reallocate', title: `Reallocate ${moved === '0' ? '' : moved}`.trim(), detail: donor ? `From ${donor.order.reference}, ${label(parties, donor.order.customerId)}` : `No later order holds ${item?.sku ?? 'this item'}`, facts: donor ? [['Ship date', shipDay(today())], [`${donor.order.reference} ships`, donor.order.promiseDate ? shipDay(donor.order.promiseDate) : 'No date']] : [['Ship date', '—'], ['Needs', 'A later order']], disabled: !donor && 'No later order holds this item' },
  ]
  async function apply() {
    if (choice !== 'reallocate' || !donor) return resolve(choice)
    const prepared = await run('proposal.prepare', { kind: 'reallocation', assumptions: `${order.reference} for ${label(parties, order.customerId)} is ${line.backorder} ${u} short of ${item?.name}. ${donor.order.reference} holds ${donor.held} ${u} and ships later${donor.order.promiseDate ? ` (${shipDay(donor.order.promiseDate)})` : ''}; reallocating ${moved} ${u} lets ${order.reference} ship complete. Review both customer promises before approving.`, evidence: [order.id, donor.order.id], plan: { fromOrderId: donor.order.id, toOrderId: order.id, itemId: line.itemId, quantity: moved } })
    if (prepared) setChoice('')
  }
  return <div className="exception" role="region" aria-label="Shortage">
    <div className="exception-head">
      <Icon name="alert" />
      <div><h3>{item?.name ?? 'An item'} ({item?.sku}) is short</h3><p>{line.reserved} reserved{where ? ` at ${where}` : ''} of {stock.quantity} on hand · {line.quantity} ordered ({line.backorder} short)</p></div>
      {po && poLine ? <a className="po-tag" href={`#purchasing/${po.id}`}><Icon name="box" /><span><b>{po.reference}</b> {label(parties, po.supplierId)}<small>{poLine.received} of {poLine.quantity} received{difference(poLine.quantity, poLine.received) !== '0' && <em> ({difference(poLine.quantity, poLine.received)} open)</em>}</small><Barcode value={po.reference} kind="document" className="barcode po-barcode" /></span></a>
        : <a className="po-tag" href="#purchasing"><Icon name="box" /><span><b>No inbound order</b><small>Plan a purchase in Purchasing</small></span></a>}
    </div>
    <fieldset className="resolutions"><legend className="visually-hidden">Resolution</legend>{options.map(option => <label key={option.id} className={option.disabled ? 'resolution disabled' : 'resolution'}>
      <span className="resolution-title"><input type="radio" name={`resolution-${order.id}`} value={option.id} checked={choice === option.id} disabled={!!option.disabled} onChange={() => setChoice(option.id)} />{option.title}</span>
      <span className="resolution-detail">{option.detail}</span>
      <dl>{option.facts.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>
    </label>)}</fieldset>
    <div className="exception-actions"><button type="button" className="primary" disabled={!choice || busy} onClick={() => void apply()}>{choice === 'reallocate' ? 'Prepare reallocation for review' : 'Apply resolution'}</button><button type="button" disabled={!choice} onClick={() => setChoice('')}>Cancel</button></div>
  </div>
}
