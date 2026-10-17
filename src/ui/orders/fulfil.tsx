import { itemLabel, label, records, unit, type PierState, type RecordData, type RunCommand } from '../api'
import { ItemName } from '../display'
import { fromMillionths } from '../quantity'
import { Field, Form, Table, text } from '../controls'
import { SourceBooks } from '../books/source-status'
import { BackorderPromises } from '../backorder-promises'
import { orderStatus } from './model'

// What can be done with the selected order: reserve stock that arrived, see the
// reserved bins, pick and dispatch in parts, re-promise a backorder, or cancel
// what has not shipped. `prefill` fills each line's dispatch with its reservation.
export function Fulfil({ state, order, run, busy, prefill }: { state: PierState; order: RecordData; run: RunCommand; busy: boolean; prefill: boolean }) {
  const locations = records(state, 'locations').filter(location => location.kind === 'bin'), open = orderStatus(order) !== 'Closed'
  return <div className="fulfil">
    {open && <div className="actions"><button disabled={busy} onClick={() => run('order.reserve', { orderId: order.id })}>Reserve newly available stock</button></div>}
    <SourceBooks state={state} sourceId={order.id} sourceKind="order" />
    <div id={`promise-${order.id}`}><BackorderPromises state={state} order={order} run={run} busy={busy} /></div>
    <section className="panel"><h3>Reserved sources for physical picking</h3><Table numeric={[2]} headings={['Item', 'Reserved source bin', 'Reserved quantity']}>{records(state, 'reservations').filter(reservation => reservation.orderId === order.id || order.lines.some((line: any) => line.id === reservation.orderLineId)).map(reservation => <tr key={reservation.id}><td><ItemName state={state} id={reservation.itemId} /></td><td>{label(locations, reservation.locationId)}</td><td>{fromMillionths(String(reservation.quantity))} {unit(state, reservation.itemId)}</td></tr>)}</Table></section>
    {open && <><div id={`dispatch-${order.id}`}><Form key={`${order.id}-${order.version}-${prefill}`} title="Pick and dispatch reserved lines" submit="Confirm partial dispatch" busy={busy} note="Enter only the quantities physically picked for this shipment. Dispatch consumes this order’s reservations." onSubmit={data => run('dispatch.create', { orderId: order.id, shipmentReference: text(data, 'shipmentReference'), lines: order.lines.map((line: any) => ({ orderLineId: line.id, quantity: text(data, line.id) })).filter((line: any) => line.quantity && line.quantity !== '0') })}><Field label="Shipment reference" name="shipmentReference" />{order.lines.map((line: any) => <Field key={line.id} label={`${itemLabel(state, line.itemId)} · dispatch (${unit(state, line.itemId)})`} display={<><ItemName state={state} id={line.itemId} /> · dispatch ({unit(state, line.itemId)})</>} name={line.id} required={false} inputMode="decimal" defaultValue={prefill && line.reserved !== '0' ? line.reserved : undefined} hint={`Reserved ${line.reserved}; backorder ${line.backorder}`} />)}</Form></div>
      <Form title="Cancel remaining demand" submit="Cancel unshipped demand and release reservations" secondary busy={busy} note="Already dispatched quantities and shipment history are preserved." onSubmit={data => run('order.cancel', { orderId: order.id, reason: text(data, 'reason') })}><Field label="Cancellation reason" name="reason" /></Form></>}
  </div>
}
