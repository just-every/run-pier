import { useState } from 'react'
import { label, records, type PierState, type RecordData, type RunCommand } from '../api'
import { day, reference } from '../display'
import { Badge, Empty, Field, Form, Table, text } from '../controls'
import { hours, zones } from './clock'
import { waitingForWave } from '../../pier/floor/wave-coverage'

// Carrier pickups (dock door and cut-off) and the orders waiting for a wave,
// grouped by the pickup they ship with.

const waiting = (state: PierState, order: RecordData) => waitingForWave({ waves: records(state, 'waves'), reservations: records(state, 'reservations'), shipments: records(state, 'shipments') }, order.id)

export function PickZones({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const bins = records(state, 'locations').filter(row => row.kind === 'bin'), [chosen, setChosen] = useState('')
  const bin = bins.find(row => row.id === chosen)
  if (state.actor.role !== 'owner' || !bins.length) return null
  return <section className="panel"><h2>Picking zones</h2><label className="field"><span>Bin to assign a zone</span><select aria-label="Bin to assign a zone" value={chosen} onChange={event => setChosen(event.target.value)}><option value="">Choose bin</option>{bins.map(row => <option key={row.id} value={row.id}>{row.warehouse} · {row.name}{row.zone ? ` · ${row.zone}` : ''}</option>)}</select></label>
    {bin && <Form key={`${bin.id}-${bin.version}`} title="Assign picking zone" submit="Save picking zone" busy={busy} note="Released pick lists retain their zones. This assignment applies to future waves." onSubmit={data => run('location.save', { id: bin.id, version: bin.version, name: bin.name, warehouse: bin.warehouse, kind: bin.kind, barcode: bin.barcode, zone: text(data, 'zone') })}><Field label="Picking zone" name="zone" defaultValue={bin.zone || ''} required={false} /></Form>}
  </section>
}

export function Pickups({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const carriers = records(state, 'carriers'), warehouses = [...new Set(records(state, 'locations').filter(row => row.kind === 'bin').map(row => String(row.warehouse)))]
  return <section className="panel"><h2>Carrier pickups</h2><p className="muted">Each pickup has a dock door and a cut-off. Waves are released per pickup.</p>
    {carriers.length > 0 && <Table headings={['Carrier and service', 'Warehouse', 'Dock', 'Cut-off']}>{carriers.map(row => <tr key={row.id}><td>{row.name}</td><td>{row.warehouse}</td><td>{row.dock}</td><td>{hours(row.cutoff)}<small>{row.timeZone}</small></td></tr>)}</Table>}
    <Form title="Add a carrier pickup" submit="Save pickup" busy={busy} onSubmit={data => run('carrier.save', { name: text(data, 'name'), warehouse: text(data, 'warehouse'), dock: text(data, 'dock'), cutoff: text(data, 'cutoff'), timeZone: text(data, 'timeZone') })}><Field label="Carrier and service" name="name" placeholder="UPS Ground" /><label className="field"><span>Warehouse</span><select aria-label="Warehouse" name="warehouse" required><option value="">Choose warehouse</option>{warehouses.map(name => <option key={name}>{name}</option>)}</select></label><Field label="Dock door" name="dock" placeholder="Dock A" /><Field label="Pickup cut-off" name="cutoff" type="time" /><label className="field"><span>Time zone</span><select aria-label="Time zone" name="timeZone" defaultValue="America/Chicago">{zones.map(zone => <option key={zone}>{zone}</option>)}</select></label></Form>
  </section>
}

function PickupAssignment({ order, carriers, run, busy }: { order: RecordData; carriers: RecordData[]; run: RunCommand; busy: boolean }) {
  return <Form title={`Pickup for ${reference(order)}`} submit="Save pickup schedule" busy={busy} note="Enter the carrier-service ship-by date you reviewed. The board uses the earlier of this date and the promise date." onSubmit={data => run('order.carrier', { orderId: order.id, carrierId: text(data, 'carrierId'), shipByDate: text(data, 'shipByDate') || null })}>
    <label className="field"><span>Pickup</span><select name="carrierId" aria-label={`Pickup for ${reference(order)}`} defaultValue={order.carrierId || ''} required><option value="">Choose pickup</option>{carriers.map(row => <option key={row.id} value={row.id}>{row.name} · {row.dock}</option>)}</select></label>
    <Field label="Reviewed carrier-service ship-by date" name="shipByDate" type="date" required={false} defaultValue={order.shipByDate || ''} />
  </Form>
}

export function Release({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const carriers = records(state, 'carriers'), orders = records(state, 'orders').filter(order => waiting(state, order)), parties = records(state, 'parties')
  const [left, setLeft] = useState<Record<string, boolean>>({}), [pickMode, setPickMode] = useState('batch')
  const unassigned = orders.filter(order => !carriers.some(row => row.id === order.carrierId))
  return <section className="panel"><h2>Orders waiting for a wave</h2>
    <label className="field"><span>Picking method</span><select aria-label="Picking method" value={pickMode} onChange={event => setPickMode(event.target.value)}><option value="batch">One bin walk · numbered order totes</option><option value="zone">Zone picks · merge order totes at pack</option></select></label>
    {!orders.length ? <Empty>No reserved orders are waiting. Orders with reserved stock appear here.</Empty> : <>
      {unassigned.length > 0 && <><h3>Choose a pickup</h3><Table headings={['Order', 'Customer', 'Due', 'Ships with']}>{unassigned.map(order => <tr key={order.id}><td>{reference(order)}</td><td>{label(parties, order.customerId)}</td><td>{order.promiseDate ? day(order.promiseDate) : '—'}</td><td>{carriers.length ? <PickupAssignment order={order} carriers={carriers} run={run} busy={busy} /> : 'Add a carrier pickup first'}</td></tr>)}</Table></>}
      {carriers.map(carrier => { const group = orders.filter(order => order.carrierId === carrier.id).sort((a, b) => String(a.promiseDate || '9999').localeCompare(String(b.promiseDate || '9999'))); const chosen = group.filter(order => !left[order.id]); if (!group.length) return null
        return <div className="record" key={carrier.id}><h3>{carrier.name} · {carrier.dock} · cut-off {hours(carrier.cutoff)}</h3><Table headings={['', 'Order', 'Customer', 'Due']}>{group.map(order => <tr key={order.id}><td><input type="checkbox" aria-label={`Include ${reference(order)}`} checked={!left[order.id]} onChange={event => setLeft({ ...left, [order.id]: !event.target.checked })} /></td><td>{reference(order)}</td><td>{label(parties, order.customerId)}</td><td>{order.promiseDate ? day(order.promiseDate) : '—'}<small>Ship by: {order.shipByDate ? day(order.shipByDate) : 'Not recorded'}</small><PickupAssignment order={order} carriers={carriers} run={run} busy={busy} /></td></tr>)}</Table><div className="actions"><button className="primary" disabled={busy || !chosen.length} onClick={() => run('wave.release', { carrierId: carrier.id, orderIds: chosen.map(order => order.id), pickMode })}>Release wave · {carrier.dock} · {chosen.length} {chosen.length === 1 ? 'order' : 'orders'}</button><Badge>{carrier.warehouse}</Badge></div></div> })}
    </>}
  </section>
}
