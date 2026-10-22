import { FloorItem } from './item'
import { TraceFields, emptyTrace } from '../trace'
import { useState } from 'react'
import { useFloorTask } from './task-storage'
import { zoneGroups } from '../../pier/floor/zone-picks'
import { label, records, unit, type PierState, type RecordData, type RunCommand } from '../api'
import { ItemName, reference, when } from '../display'
import { Badge, Empty, Field, Form, Table, text } from '../controls'
import { sum } from '../quantity'
import { Refusal, ScanBox } from './scanner'
import { waveTitle } from './pick'

// The pack station: an order's picked units are scanned into numbered cartons,
// each carton is weighed and measured by hand, the order is marked packed and
// then dispatched with its shipment reference.

type Station = { wave: RecordData; orderId: string }
const picked = (wave: RecordData, orderId: string) => wave.lines.filter((line: any) => line.orderId === orderId && line.picked !== '0')

export function Pack({ state, run, busy, error }: { state: PierState; run: RunCommand; busy: boolean; error: string }) {
  const [trace,setTrace]=useFloorTask('pack.trace', emptyTrace)
  const [chosen, setChosen] = useFloorTask('pack.chosen', ''), [refusal, setRefusal] = useState<{ station: string; message: string } | null>(null)
  const packs = records(state, 'packs'), orders = records(state, 'orders'), carriers = records(state, 'carriers')
  const stations: Station[] = records(state, 'waves').flatMap(wave => wave.orders.map((row: any) => ({ wave, orderId: row.orderId }))).filter(({ wave, orderId }) => picked(wave, orderId).length && packs.find(pack => pack.waveId === wave.id && pack.orderId === orderId)?.status !== 'shipped')
  const station = stations.find(row => `${row.wave.id}:${row.orderId}` === chosen) || stations[0]
  const pack = station && packs.find(row => row.waveId === station.wave.id && row.orderId === station.orderId)
  const contributions = station ? zoneGroups(station.wave as any, station.orderId) : [], unfinished = contributions.filter(zone => zone.linesOpen)
  const shipped = packs.filter(row => row.status === 'shipped').slice().reverse()
  const stationKey = station ? `${station.wave.id}:${station.orderId}` : ''
  const call = async (type: string, payload: object = {}) => {
    const saved = await run(type, { waveId: station!.wave.id, orderId: station!.orderId, ...payload }, { onRefused: failure => setRefusal({ station: stationKey, message: failure.message }) })
    if (saved) setRefusal(null)
    return saved
  }
  return <>
    {!stations.length ? <Empty>Nothing is waiting to pack. Picked orders from a wave appear here.</Empty> : <section className="panel"><h2>Ready to pack</h2><Table headings={['Order', 'Wave', 'Status', '']}>{stations.map(({ wave, orderId }) => { const own = packs.find(row => row.waveId === wave.id && row.orderId === orderId); return <tr key={`${wave.id}:${orderId}`} className={station?.orderId === orderId && station.wave.id === wave.id ? 'selected' : ''}><td>{reference(orders.find(row => row.id === orderId))}</td><td>{waveTitle(wave)}</td><td><Badge>{own?.status === 'packed' ? 'Packed' : own ? `Packing · ${own.cartons.length} ${own.cartons.length === 1 ? 'carton' : 'cartons'}` : 'Picked'}</Badge></td><td><button className="link" onClick={() => setChosen(`${wave.id}:${orderId}`)}>Pack this order</button></td></tr> })}</Table></section>}
    {station && <section className="panel"><h2>Pack {reference(orders.find(row => row.id === station.orderId))}</h2><p className="muted">{waveTitle(station.wave)} · tote {station.wave.orders.find((row: any) => row.orderId === station.orderId)?.tote} · {label(carriers, station.wave.carrierId)}</p>
      {contributions.length > 0 && <><h3>Merge zones · tote {station.wave.orders.find((row: any) => row.orderId === station.orderId)?.tote}</h3><Table headings={['Zone', 'Contribution']}>{contributions.map(zone => <tr key={zone.name}><td>{zone.name}</td><td>{zone.linesOpen ? `${zone.linesOpen} lines still to pick` : 'Ready to merge'}</td></tr>)}</Table>{unfinished.length > 0 && <p className="notice" role="status">Waiting for zone contributions for this order: {unfinished.map(zone => zone.name).join(', ')}. Scan arrived units now; finish every zone before marking packed.</p>}</>}
      {pack && <><p><a href={`/api/pier/packs/${pack.id}/packing-slip`} target="_blank" rel="noreferrer">Print packing slip</a></p>
        {state.actor.role==='owner'&&<><button disabled={busy} onClick={()=>run('print.generate',{kind:'packing-slip',sourceId:pack.id})}>Generate retained packing PDF</button>{records(state,'salesDocuments').filter(d=>d.kind==='packing-slip'&&d.recordId===pack.id).map(d=><p key={d.id}><a href={`/api/pier/sales-documents/${d.id}.pdf`} target="_blank" rel="noreferrer">Open retained packing PDF · pack version {d.recordVersion} · template {d.templateVersion}</a></p>)}</>}
      </>}
      <Table numeric={[1, 2]} headings={['Item', 'Picked', 'Packed']}>{[...new Set(picked(station.wave, station.orderId).map((line: any) => `${line.orderLineId}:${line.itemId}`))].map(key => { const [orderLineId, itemId] = String(key).split(':'); const lines = station.wave.lines.filter((line: any) => line.orderLineId === orderLineId && line.itemId === itemId); return <tr key={String(key)}><td><FloorItem state={state} id={itemId} /></td><td>{sum(lines.map((line: any) => line.picked))} {unit(state, itemId)}</td><td>{sum((pack?.cartons || []).flatMap((carton: any) => carton.lines.filter((line: any) => line.orderLineId === orderLineId && line.itemId === itemId).map((line: any) => line.quantity)))} {unit(state, itemId)}</td></tr> })}</Table>
      {pack?.status !== 'packed' && <><TraceFields value={trace} onChange={setTrace}/><ScanBox key={`${station.wave.id}:${station.orderId}`} taskKey={`pack:${station.wave.id}:${station.orderId}:${pack?.cartons.length || 1}`} label={`Scan item into carton ${pack?.cartons.length || 1}`} busy={busy} onScan={code => call('pack.scan', { code, trace })} /><Refusal error={error || (refusal?.station === stationKey ? refusal.message : '')} /><div className="actions"><button disabled={busy || !pack || !pack.cartons.at(-1).lines.length} onClick={() => call('pack.carton')}>Start carton {(pack?.cartons.length || 1) + 1}</button></div></>}
      {pack?.cartons.map((carton: any) => <div className="record carton" key={carton.number}><h3>Carton {carton.number}{carton.weight && <Badge>{`${carton.weight} lb · ${carton.length} × ${carton.width} × ${carton.height} in`}</Badge>}</h3>{carton.lines.length ? <ul className="carton-lines">{carton.lines.map((line: any) => <li key={`${line.orderLineId}:${line.itemId}`}><ItemName state={state} id={line.itemId} /> · {line.quantity} {unit(state, line.itemId)}</li>)}</ul> : <p className="muted">Empty: scan items into it.</p>}
        {pack.status === 'packing' && carton.lines.length > 0 && <Form key={`${carton.number}-${carton.weight}`} title={`Weigh and measure carton ${carton.number}`} submit="Save weight and size" busy={busy} onSubmit={data => call('pack.measure', { carton: carton.number, weight: text(data, 'weight'), length: text(data, 'length'), width: text(data, 'width'), height: text(data, 'height') })}><Field label="Weight (lb)" name="weight" defaultValue={carton.weight || ''} inputMode="decimal" /><Field label="Length (in)" name="length" defaultValue={carton.length || ''} inputMode="decimal" /><Field label="Width (in)" name="width" defaultValue={carton.width || ''} inputMode="decimal" /><Field label="Height (in)" name="height" defaultValue={carton.height || ''} inputMode="decimal" /></Form>}</div>)}
      {pack?.status === 'packing' && <div className="actions pack-close"><button className="primary" disabled={busy || unfinished.length > 0} onClick={() => call('pack.close')}>Mark order packed</button></div>}
      {pack?.status === 'packed' && records(state, 'ediOrders').some(o => o.orderId === pack.orderId) && <p className="notice">Retailer order: <a href="#edi">prepare the 856 ASN and matching SSCC carton labels in EDI</a> before pickup. Sending and dispatch remain separate.</p>}
      {pack?.status === 'packed' && <><p><a className="button" href="#floor/shipping">Shipping labels and tracking</a></p><Form title="Dispatch packed order" submit="Dispatch packed cartons" busy={busy} note={`Packed ${when(pack.packedAt)} in ${pack.cartons.length} ${pack.cartons.length === 1 ? 'carton' : 'cartons'}. Dispatch takes the stock out of its reserved bins.`} onSubmit={data => call('pack.dispatch', { shipmentReference: text(data, 'shipmentReference') })}><Field label="Shipment reference" name="shipmentReference" hint="Bill of lading, PRO or tracking number." /></Form></>}
    </section>}
    <section className="panel"><h2>Shipped from the pack station</h2>{!shipped.length ? <Empty>Nothing shipped from the pack station yet.</Empty> : <Table numeric={[2]} headings={['Order', 'Shipment', 'Cartons', 'Packed']}>{shipped.map(row => { const shipment = records(state, 'shipments').find(value => value.id === row.shipmentId); return <tr key={row.id}><td>{reference(orders.find(value => value.id === row.orderId))}</td><td><a href={`#sales/${row.shipmentId}`}>{shipment?.reference || 'Shipment'}</a><small>{shipment ? when(shipment.createdAt) : ''}</small></td><td>{row.cartons.length}</td><td>{when(row.packedAt)}</td></tr> })}</Table>}</section>
  </>
}
