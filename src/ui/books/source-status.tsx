import { Amount, Facts } from '../controls'
import { type PierState, records } from '../api'
import { connections } from './model'
import { ReceiptClosure } from './receipt-closure'

export function SourceBooks({ state, sourceId, sourceKind }: { state: PierState; sourceId: string; sourceKind: 'order' | 'receipt' }) {
  const qbo = connections(state).some(connection => connection.provider === 'qbo'), ledger = qbo ? 'QuickBooks' : 'Pantry'
  const receipt = sourceKind === 'receipt' ? records(state, 'receipts').find(r => r.id === sourceId) : undefined
  const invoiceIds = new Set(records(state, 'supplierBills').filter(b => b.poId === receipt?.poId).map(b => b.id))
  const rows = records(state, 'bookJobs').filter(j => (j.sourceId === sourceId && j.sourceKind === sourceKind) || (j.sourceKind === 'supplierBill' && invoiceIds.has(j.sourceId)))
  if (!rows.length && !receipt) return null
  return <div className="record">{receipt && <ReceiptClosure state={state} receiptId={receipt.id} />}<h3>Books</h3>{rows.map(job => <Facts key={job.id} values={[
    {label: job.kind === 'bill' ? 'Supplier bill' : job.kind === 'journal' ? 'Cost of goods' : 'Sales invoice', value: job.reference},
    {label: 'Posting', value: job.status === 'reconciled' ? 'Reconciled' : job.status === 'posted' ? 'Posted' : job.status === 'pending' ? 'Pending' : job.status === 'uncertain' ? 'Checking outcome' : job.status === 'skipped' ? 'Skipped' : 'Needs review'},
    ...(job.kind === 'journal' ? [] : [{label: job.kind === 'bill' ? `Paid in ${ledger}` : `Received in ${ledger}`, value: <Amount value={job.paid} unknown="Not checked" />}, {label: 'Open USD', value: <Amount value={job.open} unknown="Not checked" />}]),
    ...(job.kind === 'bill' && !qbo ? [{label:'Receipt evidence',value:job.received&&job.status==='reconciled'?'Received · payable closed':job.readyToPay?'Received · ready to pay in linked Pantry evidence':job.received?'Matched in Pantry':'Awaiting receipt confirmation'}] : []),
  ]} />)}<a href="#books">Open books and review queue</a></div>
}
