import { useState } from 'react'
import { records, label, unit, type PierState, type RecordData, type RunCommand } from '../api'
import { ItemName, reference, when } from '../display'
import { Badge, Empty, Field, Form, Select, Table, text } from '../controls'
import { Refusal, ScanBox } from './scanner'
import { barcodesOf, same } from '../../pier/floor/codes'
import { returnLookup, type ReturnCandidate } from '../../pier/returns-lookup'

const options = (values: [string, string][]) => values.map(([id, name]) => ({ id, name, version: 1 }))
const conditions = options([['sellable', 'Sellable'], ['damaged', 'Damaged']])
const dispositions = options([['restock', 'Restock to bin'], ['quarantine', 'Keep in quarantine'], ['writeoff', 'Write off damaged stock']])

export function Returns({ state, run, busy, error }: { state: PierState; run: RunCommand; busy: boolean; error: string }) {
  const [locationId, setLocationId] = useState(''), [binCode, setBinCode] = useState(''), [condition, setCondition] = useState('sellable'), [disposition, setDisposition] = useState('restock'), [reason, setReason] = useState('')
  const [candidates, setCandidates] = useState<ReturnCandidate[]>([]), [selected, setSelected] = useState(''), [localError, setLocalError] = useState(''), [notice, setNotice] = useState(''), [pending, setPending] = useState<{ code: string; isItem: boolean; count: string } | null>(null)
  const bins = records(state, 'locations').filter(b => b.kind === 'bin'), returned = records(state, 'returns').slice().reverse()
  const inspect = ['owner', 'warehouse'].includes(state.actor.role)
  const source = { items: records(state, 'items'), orders: records(state, 'orders'), shipments: records(state, 'shipments'), returns: returned.slice().reverse(), parties: records(state, 'parties'), traceIdentities:records(state,'traceIdentities'), traceEvents:records(state,'traceEvents') }
  async function chooseBin(code: string) {
    const found = bins.filter(bin => same(code, bin.barcode) || same(code, bin.name))
    if (found.length !== 1) { setLocalError(found.length ? 'This bin name exists in several warehouses. Scan its unique bin barcode.' : 'Scan a bin label from this installation.'); return false }
    setLocationId(found[0].id); setBinCode(code); setLocalError(''); return true
  }
  async function scan(code: string, count: string) {
    setLocalError(''); setNotice('')
    let matches: ReturnCandidate[]
    try { matches = returnLookup(source, code) } catch (cause) { setLocalError(cause instanceof Error ? cause.message : 'Code could not be read.'); return false }
    const isItem = source.items.some(i => [...barcodesOf(i).map(barcode => barcode.code), i.sku].some(value => same(code, value)))
    if (!matches.length) { setLocalError('No dispatched units eligible for return match this code. Check the order or shipment label.'); return false }
    setPending({ code, isItem, count })
    if (!isItem) { setCandidates(matches); setSelected(matches.length === 1 ? matches[0].id : ''); setNotice('Order found. Confirm its dispatch line and exact returned quantity below.'); return true }
    const scoped = selected ? matches.filter(row => row.id === selected) : matches
    if (scoped.length !== 1) { setCandidates(matches); if (selected) setSelected(''); setLocalError(selected ? 'That item does not match the selected dispatch. Choose the correct dispatch.' : 'This item belongs to several dispatches. Choose the returned order below, then confirm the return.'); return false }
    const candidate = scoped[0]
    setCandidates([candidate]); setSelected(candidate.id)
    if (!locationId || !reason.trim()) { setLocalError('Choose or scan the destination bin and record the inspection reason, then confirm the return below.'); return false }
    const saved = await run('return.scan', { code, ...(count ? { count } : {}), shipmentId: candidate.shipmentId, shipmentLineId: candidate.shipmentLineId, locationId, ...(binCode ? { binCode } : {}), condition, disposition, reason })
    if (saved) { setCandidates([]); setSelected(''); setPending(null); setNotice(inspect ? disposition === 'restock' ? 'Returned stock is sellable in the named bin.' : disposition === 'writeoff' ? 'Damaged stock written off. Its credit and cost postings are in Books.' : 'Returned stock is in quarantine. Its credit is in Books.' : 'Returned stock is in quarantine awaiting an authorized inspector.'); }
    return saved
  }
  async function confirm(data: FormData) {
    const candidate = candidates.find(row => row.id === selected)
    if (!pending || !candidate) return false
    if (!locationId || !reason.trim()) { setLocalError('Choose the return bin and record the return reason before confirming.'); return false }
    const saved = await run('return.scan', { code: pending.code, ...(pending.isItem ? (pending.count ? { count: pending.count } : {}) : { quantity: text(data, 'quantity') }), shipmentId: candidate.shipmentId, shipmentLineId: candidate.shipmentLineId, locationId, ...(binCode ? { binCode } : {}), condition, disposition, reason })
    if (saved) { setCandidates([]); setSelected(''); setPending(null); setLocalError(''); setNotice(inspect ? 'Return recorded with the inspection decision. Review its credit in Books.' : 'Returned stock is quarantined awaiting authorized inspection.') }
    return saved
  }
  return <>
    <section className="panel"><h2>Returns bench</h2><p className="muted">Choose the bin and inspection decision, then scan a returned unit or case. An order or shipment label finds its dispatched lines. If the item was shipped more than once, choose the correct dispatch and confirm the quantity.</p>
      {!inspect && <p className="muted">Your role can receive returns into quarantine. A warehouse inspector reviews restock or write-off.</p>}
      <div className="form-grid"><Select label="Return bin" rows={bins.map(b => ({ ...b, label: `${b.name} · ${b.warehouse}` }))} value={locationId} onChange={value => { setLocationId(value); setBinCode('') }} /><Select label="Condition" rows={conditions} value={condition} onChange={value => { setCondition(value); setDisposition(value === 'damaged' ? 'quarantine' : 'restock') }} /><Select label="Disposition" rows={dispositions} value={disposition} onChange={setDisposition} /><Field label="Return reason" value={reason} onChange={setReason} hint="Record the customer's reason and what inspection found." /></div>
      <ScanBox label="Scan return bin" focus={false} busy={busy} onScan={chooseBin} hint={locationId ? `Returning to ${label(bins, locationId)}` : 'Scan the bin label, or choose a named bin above.'} />
      <ScanBox label="Scan order label or returned item" count busy={busy} onScan={scan} hint="A unit barcode returns one base unit; a case barcode returns its pack quantity. Times repeats that scan." />
      <Refusal error={localError || error} />{notice && <p role="status">{notice}</p>}
      {candidates.length > 0 && <Table headings={['Order / shipment', 'Customer', 'Item', 'Returnable', 'Choose']} numeric={[3]}>{candidates.map(candidate => <tr key={candidate.id}><td>{candidate.orderReference}<small>{candidate.shipmentReference}</small></td><td>{candidate.customer}</td><td><ItemName state={state} id={candidate.itemId} /></td><td>{candidate.remaining} {unit(state, candidate.itemId)}</td><td><button type="button" disabled={busy} aria-pressed={selected === candidate.id} onClick={() => { setSelected(candidate.id); setLocalError(''); setNotice('Dispatch selected. Confirm the returned quantity and inspection decision below.') }}>{selected === candidate.id ? 'Selected' : 'Use this dispatch'}</button></td></tr>)}</Table>}
    </section>
    {pending && selected && <Form title="Confirm scanned return" submit="Confirm return" busy={busy} note={pending.isItem ? 'This confirms the scanned unit or case quantity with the inspection decision above.' : 'The label identifies the sale. Enter the exact number of physically returned base units.'} onSubmit={confirm}>{!pending.isItem && <Field label="Returned quantity (base units)" name="quantity" defaultValue="1" inputMode="decimal" />}<p>{candidates.find(row => row.id === selected)?.orderReference} · <ItemName state={state} id={candidates.find(row => row.id === selected)?.itemId || ''} /></p></Form>}
    {inspect && returned.filter(r => r.status === 'quarantine').map(r => <Review key={`${r.id}-${r.version}`} returned={r} state={state} run={run} busy={busy} />)}
    <section className="panel"><h2>Return history</h2>{!returned.length ? <Empty>No returned stock has been received.</Empty> : <Table headings={['Received', 'Item', 'Quantity', 'Bin', 'Inspection', 'Credit']} numeric={[2]}>{returned.map(r => <tr key={r.id}><td>{when(r.createdAt)}<small>{reference(records(state, 'orders').find(o => o.id === r.orderId || records(state, 'shipments').some(sh => sh.id === r.shipmentId && sh.orderId === o.id)))}</small></td><td><ItemName state={state} id={r.itemId} /></td><td>{r.quantity} {unit(state, r.itemId)}</td><td>{label(bins, r.locationId)}</td><td><Badge>{r.status === 'writtenoff' ? 'Written off' : r.status === 'restocked' ? 'Restocked' : 'Quarantine'}</Badge><small>{r.condition} · {r.inspectionReason || r.reason}</small></td><td>{r.books?.creditStatus || (records(state, 'bookConnections').some(b => b.enabled) ? 'Awaiting sync' : 'Connect Books')}<small><a href="#books">Review in Books</a></small></td></tr>)}</Table>}</section>
  </>
}

function Review({ returned, state, run, busy }: { returned: RecordData; state: PierState; run: RunCommand; busy: boolean }) {
  return <Form title={`Inspect returned ${records(state, 'items').find(i => i.id === returned.itemId)?.sku || 'stock'}`} submit="Post inspection decision" busy={busy} note={`${returned.quantity} ${unit(state, returned.itemId)} in ${label(records(state, 'locations'), returned.locationId)} · ${returned.reason}`} onSubmit={data => run('return.inspect', { returnId: returned.id, version: returned.version, condition: text(data, 'condition'), disposition: text(data, 'disposition'), reason: text(data, 'reason') })}><Select label="Inspected condition" name="condition" rows={conditions} defaultValue={returned.condition || ''} /><Select label="Inspection disposition" name="disposition" rows={dispositions} defaultValue={returned.requestedDisposition || ''} /><Field label="Inspection reason" name="reason" defaultValue={returned.inspectionReason || returned.reason} /></Form>
}
