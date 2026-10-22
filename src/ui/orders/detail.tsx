import { useState } from 'react'
import { label, records, unit, type PierState, type RecordData, type RunCommand } from '../api'
import { Amount } from '../controls'
import { person, when } from '../display'
import { Icon } from '../icons'
import { Barcode } from '../barcode'
import { ChannelMark } from './channel'
import { margin, type LineCosts } from './costs'
import { Exception } from './exception'
import { WordClip } from './clip'
import { Pill } from './queue'
import { ago, clock, needsAttention, orderWarehouses, pickLines, shipDay } from './model'
import { difference, sum } from '../quantity'

// The selected order as one card: who and where, the ship-by date and carrier,
// pick progress from the floor's scans, the lines with their bins and margin,
// and the shortage banner when a line is short.

const shown = 5

export function OrderCard({ state, order, run, busy, costs, resolve }: { state: PierState; order: RecordData; run: RunCommand; busy: boolean; costs: LineCosts; resolve: (choice: string) => void }) {
  const [all, setAll] = useState(false)
  const parties = records(state, 'parties'), items = records(state, 'items'), locations = records(state, 'locations')
  const customer = parties.find(row => row.id === order.customerId), carrier = records(state, 'carriers').find(row => row.id === order.carrierId)
  const reservations = records(state, 'reservations').filter(row => row.orderId === order.id)
  // The bins a line is reserved in, then the bins its shipments were picked from.
  const shipments = records(state, 'shipments').filter(row => row.orderId === order.id)
  const bins = (lineId: string) => [...new Set([...reservations.filter(row => row.orderLineId === lineId).map(row => row.locationId), ...shipments.flatMap(row => row.lines.filter((line: any) => line.orderLineId === lineId).flatMap((line: any) => (line.reservations || []).map((source: any) => source.locationId)))].map(id => label(locations, id)))].join(', ')
  const picks = pickLines(state, order), lastPick = picks.filter(line => line.pickedAt).sort((a, b) => String(a.pickedAt).localeCompare(String(b.pickedAt))).at(-1)
  // Dispatched shows once anything on the order has shipped; until then every value would be 0.
  const shipped = order.lines.some((line: any) => line.dispatched !== '0')
  // Once anything has shipped, progress counts lines shipped in full, as the lines table shows them;
  // before that it counts the floor's pick scans.
  const picking = picks.length > 0 && !shipped
  const lastShipment = shipments.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).at(-1)
  const done = picking ? picks.filter(line => line.status === 'picked').length : order.lines.filter((line: any) => difference(sum([line.dispatched, line.cancelled]), line.quantity) === '0').length
  const total = picking ? picks.length : order.lines.length, progress = total ? Math.round(done / total * 100) : 0
  const margins = order.lines.map((line: any) => margin(line.price, costs.lines[line.id]))
  const priced = order.lines.map((line: any, index: number) => ({ revenue: Number(line.lineTotal), margin: margins[index] })).filter((row: { revenue: number; margin: number | null }) => row.margin !== null && row.revenue > 0)
  const revenue = priced.reduce((sum: number, row: { revenue: number }) => sum + row.revenue, 0)
  const average = revenue ? Math.round(priced.reduce((sum: number, row: { revenue: number; margin: number }) => sum + row.revenue * row.margin, 0) / revenue) : null
  const lines = all ? order.lines : order.lines.slice(0, shown)
  const late = needsAttention(order)
  return <section className="order-card" id={`document-${order.id}`} aria-label={`Order ${order.reference}`}>
    <div className="order-head">
      <h2>{order.reference}</h2><Pill order={order} />
      <span className="order-channel"><ChannelMark channel={order.channel} named /></span>
    </div>
    <div className="order-customer"><h3>{customer?.name ?? 'Removed customer'}</h3><p>{customer?.email ? <><span>{customer.email}</span><i aria-hidden="true">|</i></> : null}<span>Created {when(order.createdAt)}</span></p></div>
    <div className="order-ship">
      <div className="ship-from"><Icon name="pin" /><div><small>Ships from</small><strong>{order.fulfilment==='dropship'?'Direct from supplier':orderWarehouses(state, order).join(', ') || 'No reserved bin yet'}</strong></div></div>
      <div className="ship-by"><Icon name="calendar" /><div><small>Ship by</small><strong>{order.promiseDate ? shipDay(order.promiseDate, true) : 'No promise date'}</strong></div></div>
      <div className="ship-carrier"><Icon name="truck" /><div><small>Carrier pickup</small><strong>{carrier ? `${carrier.name} · ${carrier.dock}` : 'Not assigned'}</strong></div>{!carrier && <a className="button small" href="#floor">Choose on Floor</a>}</div>
    </div>
    <div className="pick-progress">
      <div><strong>{picking ? 'Pick progress' : 'Dispatch progress'}</strong><span>{done} of {total} lines{picking ? '' : ' shipped'}</span><div className="track" role="progressbar" aria-label={picking ? 'Lines picked' : 'Lines shipped'} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><i style={{ width: `${progress}%` }} /></div></div>
      {!picking && lastShipment ? <p>Last shipment {lastShipment.shipmentReference || lastShipment.reference}<br />dispatched {ago(lastShipment.createdAt)}</p> : lastPick ? <p>Picked by {person(state, lastPick.pickedBy)}<br />on scanner · {clock(lastPick.pickedAt)}</p> : <p>{picks.length ? 'Released to a wave; no scans yet' : 'Not released to a pick wave'}</p>}
    </div>
    <div className="order-lines"><table>
      <thead><tr><th scope="col"><span className="visually-hidden">Line state</span></th><th scope="col">SKU</th><th scope="col">Product</th><th scope="col">Bin</th><th scope="col" className="num">Ordered</th><th scope="col" className="num">Reserved</th>{shipped && <th scope="col" className="num">Shipped</th>}<th scope="col" className="num">Price</th><th scope="col" className="num">Margin</th></tr></thead>
      <tbody>{lines.map((line: any, index: number) => { const item = items.find(row => row.id === line.itemId), short = line.backorder !== '0', closed = line.dispatched === line.quantity
        return <tr key={line.id} className={short ? late ? 'short' : 'short on-time' : undefined}>
          <td className="line-state">{short ? <span title={`${line.backorder} ${unit(state, line.itemId)} short`}><Icon name="alert" /></span> : closed || line.reserved === line.quantity ? <span title={closed ? 'Dispatched' : 'Reserved in full'}><Icon name="check" /></span> : null}</td>
          <td className="line-sku"><span>{item?.sku ?? 'Removed item'}</span><Barcode value={item?.barcode} /></td>
          <WordClip className="line-name" text={item?.name ?? 'Removed item'} />
          <td className="line-bin">{bins(line.id) || '—'}</td>
          <td className="num line-ordered">{line.quantity}</td>
          <td className="num line-reserved">{line.reserved}</td>
          {shipped && <td className="num line-dispatched">{line.dispatched}</td>}
          <td className="num line-price"><Amount value={line.price} unknown="—" dollars /></td>
          <td className="num line-margin" title={margins[index] === null ? costs.failed ? 'Line costs could not be read' : 'No valued cost for this line yet' : 'Price over this line’s own cost: dispatched and reserved stock'}>{margins[index] === null ? '—' : `${margins[index]}%`}</td>
        </tr> })}</tbody>
    </table></div>
    <div className="order-total">{order.lines.length > shown && <button type="button" className="link" onClick={() => setAll(!all)}>{all ? 'Show fewer lines' : `+ ${order.lines.length - shown} more lines`}</button>}<span>Order total</span><b><Amount value={order.total} unknown="Unpriced" dollars /></b>{average !== null ? <small>{average}% avg. margin</small> : costs.failed ? <small className="cost-failed">Margins could not be read</small> : null}</div>
    <Exception key={`${order.id}-${order.version}`} state={state} order={order} run={run} busy={busy} resolve={resolve} />
  </section>
}
