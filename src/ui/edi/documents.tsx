import { useState } from 'react'
import { Badge, Empty, Field, Form, Table, text } from '../controls'
import { records, label, type PierState, type RunCommand, type RecordData } from '../api'
import { when } from '../display'

export function EdiDocuments({ state, run, busy, selected }: { state: PierState; run: RunCommand; busy: boolean; selected?: string }) {
  const [opened, setOpened] = useState('')
  const documents = records(state, 'ediDocuments').filter(d => !selected || d.ediOrderId === selected)
  const active = documents.find(d => d.id === opened)
  return <section className="panel"><h2>EDI documents</h2>{!documents.length ? <Empty>Documents appear when an 850 is received, acknowledged, packed and dispatched.</Empty> : <Table headings={['Retailer / PO', 'Document', 'Due', 'Delivery', '']}>
    {documents.map(d => <tr key={d.id}><td>{label(records(state, 'ediPartners'), d.partnerId)}<small>{d.poNumber || records(state, 'ediOrders').find(o => o.id === d.ediOrderId)?.poNumber}</small></td><td>{d.kind}<small>{d.control}</small></td><td>{d.deadline ? when(d.deadline) : '—'}{d.sentAt && <small>Sent {when(d.sentAt)}</small>}</td><td><Badge>{d.status}</Badge><small>{d.detail || d.problem}</small>{d.functionalAcknowledgment && <small>997: {d.functionalAcknowledgment.status || d.functionalAcknowledgment}</small>}</td><td><button onClick={() => setOpened(d.id)}>Open {d.kind}</button></td></tr>)}
  </Table>}
  {active && <div className="record"><h3>{active.kind} · {active.poNumber || records(state, 'ediOrders').find(o => o.id === active.ediOrderId)?.poNumber}</h3><p>{active.detail || active.problem}</p>{active.kind === '810' && <p>Invoice {active.invoiceNumber} · USD {(Number(active.totalCents) / 100).toFixed(2)} · Actual shipment {records(state, 'shipments').find(s => s.id === active.shipmentId)?.reference}</p>}<div className="actions"><a className="button" href={`/api/pier/edi/documents/${active.id}`} download>Download X12</a><button disabled={busy || !['prepared','unavailable'].includes(active.status)} onClick={() => run('edi.send', { documentId: active.id, version: active.version })}>Send {active.kind}</button></div><details><summary>Inspect X12 segments</summary><pre className="edi-x12">{active.x12?.replace(/~/g, '~\n')}</pre></details>{active.status === 'uncertain' && state.actor.role === 'owner' && <Form title="Reconcile bridge receipt" busy={busy} submit="Record verified bridge outcome" onSubmit={d => run('edi.send.reconcile', {documentId:active.id,version:active.version,outcome:text(d,'outcome'),reason:text(d,'reason'),providerId:text(d,'providerId'),sentAt:text(d,'sentAt')})}><label className="field"><span>Verified bridge outcome</span><select name="outcome"><option value="accepted">Accepted by bridge</option><option value="not_received">Bridge confirms not received</option></select></label><Field label="Bridge evidence" name="reason" /><Field label="Verified receipt ID" name="providerId" required={false} /><Field label="Verified send time (ISO with zone)" name="sentAt" required={false} /></Form>}{active.kind === '856' && <Labels state={state} run={run} busy={busy} document={active} />}</div>}
  </section>
}

function Labels({ state, run, busy, document }: { state: PierState; run: RunCommand; busy: boolean; document: RecordData }) {
  return <div><h3>Carton labels</h3><p>Each GS1-128 label uses the SSCC in this ASN. A reprint keeps its serial and contents. A print request does not confirm a physical label was printed.</p>{(document.cartons || []).map((carton: any) => {
    const printed = records(state, 'ediLabelEvents').some(e => e.documentId === document.id && e.sscc === carton.sscc)
    return <div className="record" key={carton.sscc}><h4>Carton {carton.number} · (00) {carton.sscc}</h4><img className="edi-barcode" src={`/api/pier/edi/labels/${document.id}/${carton.sscc}.svg`} alt={`GS1-128 SSCC ${carton.sscc}`} />
      <Form title={printed ? `Reprint carton ${carton.number}` : `Print carton ${carton.number}`} busy={busy} submit={printed ? 'Record reprint request' : 'Record print request'} onSubmit={d => run(printed ? 'edi.label.reprint' : 'edi.label.print', { documentId: document.id, sscc: carton.sscc, reason: text(d, 'reason') })}><Field label="Print reason" name="reason" defaultValue={printed ? '' : 'Initial carton label'} /></Form>
      <div className="actions"><a className="button" href={`/api/pier/edi/labels/${document.id}/${carton.sscc}`} target="_blank" rel="noreferrer">Open 4 × 6 print sheet</a><a className="button" href={`/api/pier/edi/labels/${document.id}/${carton.sscc}.zpl`} download>Download Zebra ZPL</a></div></div>
  })}</div>
}
