import { itemLabel, records, type PierState } from '../api'
import { Badge, Empty } from '../controls'
import { when } from '../display'
import { connections, type BooksProps } from './model'

const labels: Record<string, string> = { connection: 'Connect Pantry', invoice: 'Supplier invoice needed', review: 'Needs review', receiving: 'Awaiting remaining goods', sync: 'Awaiting Pantry confirmation', payment: 'Ready to pay in Pantry', closed: 'Closed in Pantry', reversed: 'Receipt reversed' }

export function PantryPaymentLink({ state }: { state: PierState }) {
  const connection = connections(state).find(row => row.enabled)
  return connection ? <a href={`${connection.baseUrl}/app/sales`} target="_blank" rel="noreferrer">Open Pantry Sales &amp; bills</a> : null
}

export function ReceiptClosure({ state, receiptId }: { state: PierState; receiptId: string }) {
  const row = records(state, 'receiptClosures').find(row => row.id === receiptId)
  if (!row) return null
  const po = records(state, 'purchaseOrders').find(po => po.id === row.poId)
  return <div className="record" data-receipt-closure={row.id}><h3>Receipt accounting</h3><p><Badge>{labels[row.status]}</Badge></p>
    {row.unbilled.length > 0 && <p>Not allocated to an approved supplier invoice: {row.unbilled.map((line: any) => `${line.quantity} ${itemLabel(state, line.itemId)}`).join('; ')}.</p>}
    {row.status === 'connection' ? <p><a href="#books/settings">Connect or reconnect Pantry</a> to check this receipt. Existing ledger balances are the last confirmed values.</p> : row.status === 'invoice' || row.status === 'review' ? <p><a href={`#books/purchase-${encodeURIComponent(row.poId)}`}>Record or review the supplier invoice for {po?.reference ?? 'this purchase order'}</a>. Goods received alone never creates a payable or a payment.</p> : row.status === 'receiving' ? <p>The approved invoice still needs the remaining receipt quantities. Keep the purchasing work open.</p> : row.status === 'payment' ? <p><PantryPaymentLink state={state} />. Choose Bills to find the reference below, record its payment under Payments, then choose Sync now in Pier.</p> : row.status === 'sync' ? <p>Choose Sync now in Books to check posting, receipt readiness and the open balance in Pantry.</p> : row.status === 'closed' ? <p>All received units are allocated to approved invoices; Pantry confirms receipt and a zero open payable balance.</p> : <p>The original receipt and its accounting records remain available for reconciliation.</p>}
    {row.invoiceIds.map((id: string) => { const bill = records(state, 'supplierBills').find(bill => bill.id === id); return bill ? <p key={id}><a href={`#books/${encodeURIComponent(id)}`}>Supplier invoice {bill.reference}</a>{bill.books?.billId && <> · Pantry reference {records(state, 'bookJobs').find(job => job.sourceId === id && job.kind === 'bill')?.reference}</>}</p> : null })}
    {row.checkedAt && <p className="muted">Ledger last checked {when(row.checkedAt)}. Later payment reversals reopen this work on the next sync.</p>}
  </div>
}

export function ReceiptClosures({ state }: BooksProps) {
  const rows = records(state, 'receiptClosures').filter(row => row.status !== 'reversed')
  return <section className="panel"><h2>Receipt follow-through</h2><p className="muted">Each receipt stays open until its approved supplier invoices are received and paid in Pantry.</p>{!rows.length ? <Empty>No posted goods receipts yet.</Empty> : rows.map(row => <div key={row.id}><p><a href={`#purchasing/${encodeURIComponent(row.id)}`}>Receipt {row.reference}</a></p><ReceiptClosure state={state} receiptId={row.id} /></div>)}</section>
}
