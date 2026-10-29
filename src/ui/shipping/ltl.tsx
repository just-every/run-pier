import { useState } from 'react'
import { records, type RecordData } from '../api'
import { Badge, Empty, Facts, Field, Form, Table, text } from '../controls'
import { reference } from '../display'
import type { ShippingProps } from './model'

function ManifestForm({ state, run, busy, pack, manifest }: ShippingProps & { pack: RecordData; manifest?: RecordData }) {
  const [count, setCount] = useState(manifest?.pallets.length ?? pack.cartons.length)
  const [assignments, setAssignments] = useState<Record<number, number>>(Object.fromEntries(pack.cartons.map((carton: any, index: number) => [carton.number, manifest?.pallets.find((pallet: any) => pallet.cartons.some((saved: any) => saved.number === carton.number))?.number ?? index + 1])))
  return <Form title={manifest ? 'Revise pallet manifest' : 'Build pallet manifest'} submit="Save pallet manifest" busy={busy}
    note="Every closed carton belongs to one pallet. Saving a revision clears the pending quote and pickup review; prior evidence and PDFs remain retained."
    onSubmit={data => run('ltl.save', { manifestId: manifest?.id, version: manifest?.version, packId: pack.id, packVersion: pack.version,
      reference: text(data, 'reference'), shipFrom: text(data, 'shipFrom'), shipTo: text(data, 'shipTo'), commodity: text(data, 'commodity'),
      accessorials: data.getAll('accessorials'), pallets: Array.from({ length: count }, (_, index) => ({
        cartons: pack.cartons.filter((carton: any) => assignments[carton.number] === index + 1).map((carton: any) => carton.number),
        ...Object.fromEntries(['weight','length','width','height','nmfc','freightClass'].map(key => [key, text(data, `${index}-${key}`)])),
      })) })}>
    <Field label="Manifest reference" name="reference" defaultValue={manifest?.reference ?? ''} />
    <Field label="Freight ship from" name="shipFrom" defaultValue={manifest?.shipFrom ?? ''} />
    <Field label="Freight ship to" name="shipTo" defaultValue={manifest?.shipTo ?? ''} />
    <Field label="Freight commodity" name="commodity" defaultValue={manifest?.commodity ?? ''} />
    <Field label="Pallet count" type="number" min={1} max={32} value={String(count)} onChange={value => { const next = Math.max(1, Math.min(32, Number(value) || 1)); setCount(next); setAssignments(old => Object.fromEntries(Object.entries(old).map(([key, pallet]) => [key, Math.min(pallet, next)]))) }} />
    <fieldset><legend>Assign measured cartons</legend>{pack.cartons.map((carton: any) => <label className="field" key={carton.number}><span>Carton {carton.number} · {carton.weight} lb · {carton.length} × {carton.width} × {carton.height} in</span><select aria-label={`Carton ${carton.number} pallet`} value={assignments[carton.number]} onChange={event => setAssignments(old => ({ ...old, [carton.number]: Number(event.target.value) }))}>{Array.from({ length: count }, (_, index) => <option key={index} value={index + 1}>Pallet {index + 1}</option>)}</select></label>)}</fieldset>
    {Array.from({ length: count }, (_, index) => <fieldset key={index}><legend>Pallet {index + 1}</legend><div className="form-grid">{([
      ['weight', 'gross weight (lb)'], ['length', 'length (in)'], ['width', 'width (in)'], ['height', 'height (in)'], ['nmfc', 'NMFC number'], ['freightClass', 'NMFC class'],
    ] as const).map(([key, label]) => <Field key={key} label={`Pallet ${index + 1} ${label}`} name={`${index}-${key}`} defaultValue={manifest?.pallets[index]?.[key] ?? ''} inputMode={['nmfc','freightClass'].includes(key) ? 'text' : 'decimal'} />)}</div></fieldset>)}
    <fieldset><legend>Accessorials</legend>{['liftgate','residential','appointment','inside delivery'].map(value => <label className="check" key={value}><input type="checkbox" name="accessorials" value={value} defaultChecked={manifest?.accessorials.includes(value)} />{value}</label>)}</fieldset>
  </Form>
}
function ManifestWork({ state, run, busy, manifest }: ShippingProps & { manifest: RecordData }) {
  const pack = records(state, 'packs').find(pack => pack.id === manifest.packId)!
  const quote = manifest.quote, review = manifest.review
  const documents = records(state, 'salesDocuments').filter(document => document.sourceKind === 'ltlManifests' && document.recordId === manifest.id && document.kind === 'bill-of-lading')
  const current = documents.filter(document => document.recordVersion === manifest.version && document.pdf).at(-1)
  const [problem, setProblem] = useState('')
  const order = records(state, 'orders').find(order => order.id === manifest.orderId)
  return <article className="record ltl-record"><h3>{manifest.reference} <Badge>{manifest.status}</Badge></h3>
    <Facts values={[{ label: 'Order', value: reference(order) }, { label: 'Manifest revision', value: manifest.revision }, { label: 'Source pack version', value: manifest.packVersion }, { label: 'Accessorials', value: manifest.accessorials.join(', ') || 'None' }]} />
    <Table headings={['Pallet', 'Cartons', 'Measured freight', 'NMFC']}>
      {manifest.pallets.map((pallet: any) => <tr key={pallet.number}><td>{pallet.number}</td><td>{pallet.cartons.map((carton: any) => `Carton ${carton.number}`).join(', ')}</td><td>{pallet.weight} lb · {pallet.length} × {pallet.width} × {pallet.height} in</td><td>{pallet.nmfc} · class {pallet.freightClass}</td></tr>)}
    </Table>
    {quote && <section><h4>Retained manual quote</h4><Facts values={[{ label: 'Carrier', value: `${quote.carrier} · ${quote.scac}` }, { label: 'Quote reference', value: quote.reference }, { label: 'Quoted amount', value: `USD ${quote.amount}` }, { label: 'Quote version', value: quote.version }, { label: 'Freight terms', value: quote.freightTerms }, { label: 'Freight bill-to', value: quote.billTo || 'Not supplied' }, { label: 'Entered evidence', value: quote.evidence }]} /></section>}
    {manifest.status !== 'dispatched' && <>
      <details><summary>Revise manifest and invalidate review</summary><ManifestForm key={`${manifest.id}-${manifest.version}`} state={state} run={run} busy={busy} pack={pack} manifest={manifest} /></details>
      <details open={!quote}><summary>{quote ? 'Replace manual quote' : 'Enter manual carrier quote'}</summary>
        <Form title="Manual carrier quote" submit="Retain manual quote" busy={busy} note="Third-party freight quotes need the payer name and address for the bill of lading." onSubmit={data => run('ltl.quote', { manifestId: manifest.id, version: manifest.version, ...Object.fromEntries(['carrier','scac','quoteReference','amount','freightTerms','billTo','evidence'].map(key => [key, text(data, key)])) })}>
          <Field label="Quoted carrier" name="carrier" /><Field label="Carrier SCAC" name="scac" /><Field label="Carrier quote reference" name="quoteReference" /><Field label="Quoted amount (USD)" name="amount" inputMode="decimal" /><Field label="Freight charge terms" name="freightTerms" /><Field label="Freight bill-to name and address" name="billTo" required={false} /><Field label="Manual quote evidence" name="evidence" />
        </Form>
      </details>
      {quote && <>
        <Form key={`review-${manifest.version}`} title="Review quote and pickup details" submit="Review exact freight details" busy={busy} note="These are operator-recorded details. Retaining them does not book a carrier or confirm pickup."
          onSubmit={data => run('ltl.review', { manifestId: manifest.id, version: manifest.version, proNumber: text(data, 'proNumber'), pickupDate: text(data, 'pickupDate'), reason: text(data, 'reason') })}>
          <Field label="Operator-recorded PRO number" name="proNumber" defaultValue={review?.proNumber ?? ''} /><Field label="Planned pickup date" name="pickupDate" type="date" defaultValue={review?.pickupDate ?? ''} /><Field label="Freight review reason" name="reason" />
        </Form>
        {review && <><p>Reviewed PRO {review.proNumber} · pickup {review.pickupDate} · quote v{review.quoteVersion}. Goods remain unshipped until pickup confirmation.</p><button disabled={busy} onClick={() => void run('print.generate', { kind: 'bill-of-lading', sourceId: manifest.id })}>Generate current VICS BOL</button></>}
        {review && current && <Form title="Confirm pickup and dispatch" submit="Confirm pickup and dispatch once" busy={busy} onSubmit={data => run('ltl.pickup', { manifestId: manifest.id, version: manifest.version, documentId: current.id, confirmed: data.get('confirmed') === 'on', evidence: text(data, 'evidence') }, { onRefused: refusal => setProblem(refusal.message), onResult: () => setProblem('') })}>
          <label className="check"><input type="checkbox" name="confirmed" required />I confirm the listed pallets were picked up.</label><Field label="Observed pickup evidence" name="evidence" />
        </Form>}
      </>}
    </>}
    {problem && <p role="alert">{problem} Reload the shipping screen to review the current record.</p>}
    {manifest.pickup && <p role="status">Pickup recorded · PRO {manifest.pickup.proNumber} · {manifest.pickup.pickupDate}. Shipment {manifest.shipmentId}. {manifest.pickup.evidence}</p>}
    {!!documents.length && <section><h4>Retained bills of lading</h4>{documents.map(document => <p key={document.id}>Source version {document.recordVersion} · template version {document.templateVersion} · {document.recordVersion === manifest.version || manifest.pickup?.documentId === document.id ? 'Reviewed source' : 'Earlier source'} · <a download={document.filename} href={`/api/pier/sales-documents/${document.id}.pdf`}>Download retained VICS BOL</a></p>)}</section>}
  </article>
}
export function LtlFreight(props: ShippingProps) {
  const { state } = props
  const [chosen, setChosen] = useState('')
  if (state.actor.role !== 'owner') return null
  const manifests = records(state, 'ltlManifests')
  const packs = records(state, 'packs').filter(pack => pack.status === 'packed' && !manifests.some(manifest => manifest.packId === pack.id) && !records(state, 'shippingJobs').some(job => job.packId === pack.id))
  const pack = packs.find(pack => pack.id === chosen) ?? packs[0]
  return <section className="panel ltl-freight"><h2>Manual LTL freight</h2><p>Build pallets from closed cartons, retain a carrier quote, download a VICS bill of lading, then confirm pickup. This path makes no carrier request and sends no customer notification.</p>
    {pack ? <details open={!manifests.length}><summary>Build a pallet manifest</summary><label className="field"><span>LTL packed order</span><select aria-label="LTL packed order" value={pack.id} onChange={event => setChosen(event.target.value)}>{packs.map(pack => <option key={pack.id} value={pack.id}>{reference(records(state, 'orders').find(order => order.id === pack.orderId))} · {pack.cartons.length} cartons</option>)}</select></label><ManifestForm key={pack.id} {...props} pack={pack} /></details> : !manifests.length && <Empty>Close and measure cartons at the pack station before building a pallet manifest.</Empty>}
    {manifests.slice().reverse().map(manifest => <ManifestWork key={manifest.id} {...props} manifest={manifest} />)}
    <p className="muted">Carrier booking, acknowledgment, live tracking, pallet labels, physical printing and freight invoice reconciliation require separate qualification. Operator records supply no carrier or physical-stock proof.</p>
  </section>
}
