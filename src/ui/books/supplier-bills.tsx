import { useEffect, useState } from 'react'
import { itemLabel, label, records, type RecordData } from '../api'
import { Amount, Badge, Empty, Facts, Field, Form, Select, Table, text } from '../controls'
import { day, words } from '../display'
import type { BooksProps } from './model'
import { BillDocumentEditor, BillDocumentReview, type BillSources } from './supplier-bill-documents'
import { PantryPaymentLink } from './receipt-closure'

type Props = BooksProps & { poId?: string; billId?: string }
type InvoiceLine = { poLineId: string; quantity: string; unitPrice: string }

function SupplierBillEditor({ state, run, busy, bill, initialPoId, close }: Props & { bill?: RecordData; initialPoId?: string; close: () => void }) {
  const pos = records(state, 'purchaseOrders').filter(po => po.status === 'committed')
  const [poId, setPoId] = useState(bill?.poId ?? initialPoId ?? '')
  const [lines, setLines] = useState<InvoiceLine[]>(bill?.lines ?? [])
  const [documents, setDocuments] = useState<BillSources>(bill?.documents ?? {})
  const po = pos.find(row => row.id === poId)
  function update(poLineId: string, key: 'quantity' | 'unitPrice', value: string) {
    if (!po) return
    const price = po.lines.find((line: any) => line.id === poLineId).price
    const current = lines.find(line => line.poLineId === poLineId)
    setLines(previous => current ? previous.map(line => line.poLineId === poLineId ? { ...line, [key]: value } : line) : [...previous, { poLineId, quantity: '', unitPrice: price, [key]: value }])
  }
  async function save(data: FormData) {
    const entered = lines.filter(line => line.quantity.trim() !== '')
    if (await run('supplierBill.save', { ...(bill ? { id: bill.id, version: bill.version } : {}), poId, reference: text(data, 'reference'), date: text(data, 'date'), quantityTolerancePercent: text(data, 'quantityTolerancePercent'), priceTolerancePercent: text(data, 'priceTolerancePercent'), lines: entered, documents: documents.invoice ? Object.fromEntries(Object.entries(documents).map(([kind, source]) => [kind, { ...source, lines: source!.lines.filter(line => line.quantity.trim()) }])) : null })) close()
  }
  return <Form title={bill ? `Revise supplier invoice ${bill.reference}` : 'Record supplier invoice'} submit="Save for matching review" busy={busy} disabled={!po || !lines.some(line => line.quantity.trim())} onSubmit={save} note="Enter the supplier's actual invoice quantities and prices. Leave quantity blank for a PO line absent from this invoice. Tolerances require an explicit buyer decision and do not change the purchase order.">
    <Select label="Committed purchase order" rows={pos.map(row => ({ ...row, label: `${row.reference} · ${label(records(state, 'parties'), row.supplierId)}` }))} value={poId} onChange={value => { setPoId(value); setLines([]); setDocuments({}) }} />
    <Field label="Supplier invoice reference" name="reference" defaultValue={bill?.reference} disabled={busy} maxLength={2000} />
    <Field label="Supplier invoice date" name="date" type="date" defaultValue={bill?.date} disabled={busy} />
    <Field label="Quantity tolerance (%)" name="quantityTolerancePercent" defaultValue={bill?.quantityTolerancePercent ?? '0'} inputMode="decimal" disabled={busy} hint="Maximum receipt shortfall and cumulative quantity above the PO, as a percentage. Every line needs posted receipt evidence." />
    <Field label="Price tolerance (%)" name="priceTolerancePercent" defaultValue={bill?.priceTolerancePercent ?? '0'} inputMode="decimal" disabled={busy} hint="Maximum absolute unit-price difference from both the committed PO and matched receipts." />
    {po && <div className="line-editor"><Table headings={['PO line', 'Ordered', 'Received', 'PO price USD', 'Billed quantity', 'Invoice unit price USD']} numeric={[1, 2, 3]}>{po.lines.map((line: any) => {
      const entered = lines.find(value => value.poLineId === line.id)
      return <tr key={line.id}><td>{itemLabel(state, line.itemId)}</td><td>{line.quantity}</td><td>{line.received}</td><td><Amount value={line.price} /></td><td><Field label={`Billed quantity · ${itemLabel(state, line.itemId)}`} value={entered?.quantity ?? ''} required={false} onChange={value => update(line.id, 'quantity', value)} inputMode="decimal" disabled={busy} /></td><td><Field label={`Invoice unit price · ${itemLabel(state, line.itemId)}`} value={entered?.unitPrice ?? line.price} onChange={value => update(line.id, 'unitPrice', value)} inputMode="decimal" disabled={busy} /></td></tr>
    })}</Table></div>}
    <BillDocumentEditor state={state} po={po} value={documents} onChange={setDocuments} busy={busy} />
    <button type="button" disabled={busy} onClick={close}>Cancel</button>
  </Form>
}

function SupplierBillMatch({ state, bill }: Pick<Props, 'state'> & { bill: RecordData }) {
  if (!bill.match) return <Empty>Reload records to review the current receipt evidence.</Empty>
  return <>
    <Facts values={[{ label: 'Invoice total USD', value: <Amount value={bill.total} /> }, { label: 'Quantity tolerance', value: `${bill.quantityTolerancePercent}%` }, { label: 'Price tolerance', value: `${bill.priceTolerancePercent}%` }, { label: 'Receipt state', value: bill.received ? 'Fully matched to receipts' : 'Awaiting receipt quantities' }]} />
    <Table headings={['Item', 'Ordered / prior billed', 'Received / matched', 'Billed', 'PO / invoice price USD', 'Differences']} numeric={[1, 2, 3]}>{bill.match.lines.map((line: any) => <tr key={line.poLineId}>
      <td>{itemLabel(state, line.itemId)}</td><td>{line.orderedQuantity} ordered<small>{line.previouslyBilledQuantity} on earlier approved invoices</small></td><td>{line.receivedQuantity} received<small>{line.matchedReceiptQuantity} allocated to this invoice</small></td><td>{line.billedQuantity}</td><td><Amount value={line.poUnitPrice} /> / <Amount value={line.unitPrice} /><small>Receipt prices: {line.receiptPrices.length ? [...new Set<string>(line.receiptPrices.map((receipt: any) => `${receipt.unitPrice} USD`))].join(', ') : 'No unused receipt'}</small></td>
      <td>{!line.differences.length ? 'Exact match' : line.differences.map((difference: any, i: number) => <p key={i}>{difference.message} <Badge>{difference.withinTolerance ? 'Within tolerance' : 'Outside tolerance'}</Badge></p>)}{!line.quantityWithinTolerance && !line.receiptAllocations.length && <p>No unused posted receipt supports this invoice line.</p>}</td>
    </tr>)}</Table>
    <BillDocumentReview bill={bill} state={state} />
    {bill.holdReason && <p><strong>Held:</strong> {bill.holdReason}</p>}
    {bill.approval && <p className="muted">Approved {day(bill.approval.at)} by {state.actor.id === bill.approval.actorId ? 'you' : bill.approval.actorId}. The approval retains the exact invoice and evidence reviewed. Current receipt matching above follows later receipts and reversals.</p>}
    {bill.books?.billId && <p><PantryPaymentLink state={state} />. Find {records(state, 'bookJobs').find(job => job.kind === 'bill' && job.sourceId === bill.id)?.reference} under Bills; record payment under Payments, then Sync now in Pier.</p>}
    {bill.books && <p>Pantry: {words(bill.books.status)}{bill.books.billId ? ` · ${bill.books.billId}` : ''}. Paid <Amount value={bill.books.paid} unknown="Not checked" /> USD · Open <Amount value={bill.books.open} unknown="Not checked" /> USD.</p>}
  </>
}

export function SupplierBills(props: Props) {
  const { state, run, busy, poId, billId } = props
  const buyer = ['owner', 'buyer'].includes(state.actor.role), preparer = buyer || state.actor.role === 'agent'
  const rows = records(state, 'supplierBills').filter(bill => !poId || bill.poId === poId)
  const [editing, setEditing] = useState<{ bill?: RecordData } | null>(null)
  const [selected, setSelected] = useState(billId ?? '')
  const [holding, setHolding] = useState(false)
  useEffect(() => { if (poId && preparer) setEditing({}) }, [poId, preparer])
  useEffect(() => { if (billId) { setSelected(billId); setHolding(false) } }, [billId])
  const bill = rows.find(row => row.id === selected)
  const mutable = bill && ['review', 'held'].includes(bill.status)
  return <>
    <section className="panel" id="supplier-invoices"><div className="page-title"><div><h2>Supplier invoices</h2><p className="muted">Match the invoice to its committed PO and posted goods receipts before approving the payable. Receipt matching and supplier payment are separate states.</p></div>{preparer && <button disabled={busy} onClick={() => setEditing({})}>Record supplier invoice</button>}</div>
      {!rows.length ? <Empty>No supplier invoices recorded.</Empty> : <Table headings={['Supplier invoice', 'Purchase order', 'Total USD', 'Review', 'Receipt / payment', '']} numeric={[2]}>{rows.map(row => <tr key={row.id}><td>{row.reference}<small>{label(records(state, 'parties'), row.supplierId)} · {day(row.date)}</small></td><td><a href={`#purchasing/${encodeURIComponent(row.poId)}`}>{label(records(state, 'purchaseOrders'), row.poId)}</a></td><td><Amount value={row.total} /></td><td><Badge>{words(row.status)}</Badge></td><td>{row.status === 'paid' ? 'Paid' : row.books?.readyToPay && ['posted', 'reconciled'].includes(row.books.status) ? 'Ready to pay in Pantry' : row.readyToPay ? 'Matched · awaiting Pantry' : row.received ? 'Receipt matched' : 'Awaiting receipt quantities'}</td><td><button disabled={busy} onClick={() => { setSelected(row.id); setHolding(false) }}>Review invoice</button></td></tr>)}</Table>}
    </section>
    {editing && <SupplierBillEditor key={`${editing.bill?.id ?? 'new'}-${editing.bill?.version ?? 0}`} {...props} bill={editing.bill} initialPoId={poId} close={() => setEditing(null)} />}
    {bill && <section className="panel" id={`document-${bill.id}`}><h2>Match supplier invoice {bill.reference}</h2><SupplierBillMatch state={state} bill={bill} />
      <div className="actions">{mutable && preparer && <button disabled={busy} onClick={() => setEditing({ bill })}>Revise invoice or tolerances</button>}{mutable && buyer && <><button className="primary" disabled={busy || !bill.match?.withinTolerance} onClick={() => void run('supplierBill.approve', { id: bill.id, version: bill.version, receiptEvidence: bill.match.receiptEvidence })}>Approve exact invoice and differences</button><button disabled={busy} onClick={() => setHolding(true)}>Hold invoice</button></>}<button disabled={busy} onClick={() => { setSelected(''); setHolding(false) }}>Close review</button></div>
      {mutable && !buyer && <p className="muted">A buyer or owner approves or holds this invoice.</p>}
      {mutable && !bill.match?.withinTolerance && <p>Resolve source-document differences first. Receipt and price differences must fit the explicitly reviewed tolerances, and every line needs unused receipt evidence.</p>}
    </section>}
    {bill && mutable && buyer && holding && <Form title={`Hold invoice ${bill.reference}`} submit="Hold invoice" secondary busy={busy} onSubmit={async data => { if (await run('supplierBill.hold', { id: bill.id, version: bill.version, reason: text(data, 'reason') })) setHolding(false) }}><Field label="Hold reason" name="reason" disabled={busy} maxLength={2000} /><button type="button" disabled={busy} onClick={() => setHolding(false)}>Cancel</button></Form>}
  </>
}
