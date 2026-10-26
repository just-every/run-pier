import { records, type PierState, type RecordData } from '../api'
import { Amount, Badge } from '../controls'
import { when } from '../display'

export function QboReceipt({ state, row }: { state: PierState; row: RecordData }) {
  const bills = records(state, 'supplierBills').filter(bill => row.invoiceIds.includes(bill.id))
  return <div className="record" data-receipt-closure={row.id}><h3>Receipt accounting</h3>
    <p><Badge>{row.status === 'reversed' ? 'Receipt reversed' : row.unbilled.length ? 'Supplier invoice needed' : 'Review QuickBooks balances'}</Badge></p>
    {row.unbilled.length > 0 && <p>Received quantities still need an approved supplier invoice. <a href={`#books/purchase-${encodeURIComponent(row.poId)}`}>Review supplier invoices</a>.</p>}
    <p>Pier matches quantities to posted receipts. Review the confirmed bill and its open balance in QuickBooks before paying it.</p>
    {bills.map(bill => <p key={bill.id}><a href={`#books/${encodeURIComponent(bill.id)}`}>Supplier invoice {bill.reference}</a> · {bill.books?.billId ? <>QuickBooks bill {bill.books.billId} · Open <Amount value={bill.books.open} unknown="Not checked" /> USD</> : 'Awaiting a confirmed QuickBooks bill'}</p>)}
    {row.checkedAt && <p className="muted">Ledger last checked {when(row.checkedAt)}. Choose Sync now to check later payments or reversals.</p>}
  </div>
}
