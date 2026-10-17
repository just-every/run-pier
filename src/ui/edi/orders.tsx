import { useState } from 'react'
import { Badge, Empty, Field, Form, Select, Table, text } from '../controls'
import { itemLabel, records, type PierState, type RunCommand, type RecordData } from '../api'
import { when } from '../display'

export function EdiOrders({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const orders = records(state, 'ediOrders')
  return <section className="panel"><h2>Retailer purchase orders</h2>{!orders.length ? <Empty>Receive an X12 850 to resolve its items and create a sales order.</Empty> : orders.map(order => <PurchaseOrder key={order.id} order={order} state={state} run={run} busy={busy} />)}</section>
}
function PurchaseOrder({ order, state, run, busy }: { order: RecordData; state: PierState; run: RunCommand; busy: boolean }) {
  const [show, setShow] = useState(false)
  const docs = records(state, 'ediDocuments').filter(d => d.ediOrderId === order.id)
  const packs = records(state, 'packs').filter(p => p.orderId === order.orderId && ['packed','shipped'].includes(p.status))
  const shipments = records(state, 'shipments').filter(s => s.orderId === order.orderId)
  return <div className="record" id={`document-${order.id}`}><h3>{order.poNumber} <Badge>{order.status}</Badge></h3><p>855 due {when(order.ackDeadline)}{order.orderId && <> · <a href={`#sales/${order.orderId}`}>Open sales order</a> · <a href="#floor/pack">Pack station</a></>}</p>
    <Table headings={['Line', 'Retailer item / UPC', 'Quantity', 'Pier item', 'Resolution']}>
      {order.lines.map((l: any) => <tr key={l.id}><td>{l.lineNumber}</td><td>{l.identifiers.map((i: any) => `${i.qualifier}: ${i.value}`).join(' · ')}</td><td>{l.quantity} {l.unit}<small>${l.unitPrice} per unit</small></td><td>{l.itemId ? itemLabel(state, l.itemId) : 'Unmapped'}</td><td>{l.decision ? `${l.decision} · ${l.ackQuantity}` : l.blocker || 'Mapped'}</td></tr>)}
    </Table>
    {order.status === 'blocked' && <><p className="error">Resolve every named item in retailer settings, then apply the mappings. No sales order has been created. You can also reject an unavailable line in the 855 review.</p><button disabled={busy} onClick={() => run('edi.order.resolve', { ediOrderId: order.id, version: order.version })}>Apply mappings and create order</button></>}
    {!docs.some(d => d.kind === '855') && <><button onClick={() => setShow(!show)}>Review 855 response</button>{show && <Form title={`Acknowledge ${order.poNumber}`} submit="Prepare 855" busy={busy} onSubmit={d => run('edi.acknowledge', { ediOrderId: order.id, version: order.version, lines: order.lines.map((l: any) => ({ lineId: l.id, decision: text(d, `decision-${l.id}`), quantity: text(d, `quantity-${l.id}`), reason: text(d, `reason-${l.id}`) })) })}>
      {order.lines.map((l: any) => <fieldset className="edi-line" key={l.id}><legend>Line {l.lineNumber} · {l.itemId ? itemLabel(state, l.itemId) : l.identifiers.map((i: any) => `${i.qualifier}: ${i.value}`).join(' · ')}</legend><label className="field"><span>Response line {l.lineNumber}</span><select name={`decision-${l.id}`} defaultValue="accept"><option value="accept">Accept</option><option value="change">Change quantity</option><option value="reject">Reject</option></select></label><Field label={`Quantity line ${l.lineNumber}`} name={`quantity-${l.id}`} defaultValue={l.quantity} /><Field label={`Reason line ${l.lineNumber}`} name={`reason-${l.id}`} required={false} hint="Required for changes and rejections." /></fieldset>)}
    </Form>}</>}
    {!!packs.length && !docs.some(d => d.kind === '856') && <Form title={`Prepare ASN for ${order.poNumber}`} busy={busy} submit="Assign SSCCs and prepare 856" onSubmit={d => run('edi.asn.prepare', { ediOrderId: order.id, packId: text(d, 'packId'), arrivalAt: new Date(text(d, 'arrivalAt')).toISOString(), pickupAt: new Date(text(d, 'pickupAt')).toISOString(), shipmentReference: text(d, 'shipmentReference') })}>
      <Select label="Packed cartons" name="packId" rows={packs.map(p => ({ ...p, label: `${p.cartons.length} cartons · ${p.status}` }))} /><Field label="Expected pickup" name="pickupAt" type="datetime-local" /><Field label="Expected arrival" name="arrivalAt" type="datetime-local" /><Field label="ASN shipment reference" name="shipmentReference" /></Form>}
    {!!shipments.length && <Form title={`Invoice ${order.poNumber}`} busy={busy} disabled={docs.some(d => d.kind === '810')} submit="Prepare 810 after dispatch" onSubmit={d => run('edi.invoice.prepare', { ediOrderId: order.id, shipmentId: text(d, 'shipmentId') })}><Select label="Dispatched shipment" name="shipmentId" rows={shipments.map(s => ({ ...s, label: s.reference }))} /></Form>}
  </div>
}
