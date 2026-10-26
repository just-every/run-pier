import { useState } from 'react'
import { Amount, Badge, Empty, Field, Table } from '../controls'
import { records } from '../api'
import { words } from '../display'
import { difference } from '../quantity'
import { connections, jobs, sourceLink, type BookJob, type BooksProps } from './model'

function payment(state: BooksProps['state'], job: BookJob) {
  if (job.sourceKind === 'nativeInvoice' && records(state, 'invoices').some(invoice => invoice.id === job.sourceId && invoice.status === 'voided')) return 'Voided · no payment'
  if (job.kind === 'receipt') return job.received ? 'Receipt matched' : 'Receipt not matched'
  if (job.kind !== 'invoice' && job.kind !== 'bill') return '—'
  if (job.paid == null || job.total == null) return 'Payment not checked'
  const open = job.open ?? difference(job.total, job.paid)
  return <>{difference(open, '0') === '0' ? 'Paid' : 'Open'}<small>Paid <Amount value={job.paid} /> USD · Open <Amount value={open} /> USD</small></>
}

export function BookDocuments({ state }: BooksProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const qbo = connections(state)[0]?.provider === 'qbo'
  const rows = jobs(state)
  const visible = rows.filter(job => (!status || job.status === status) && `${job.reference} ${job.remoteId ?? ''} ${job.kind}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="panel"><h2>Accounting documents</h2>
    {!qbo && <p className="muted">Item snapshots and inventory valuations are sent as evidence documents because Pantry has no item catalogue. Approved supplier invoices post as payables. Pantry records received and ready-to-pay states from the receipt evidence. Only Pantry payment readback closes the payable.</p>}
    <div className="filters"><Field label="Search accounting documents" type="search" value={search} onChange={setSearch} required={false} /><label className="field"><span>Posting status</span><select aria-label="Posting status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{['pending', 'posted', 'review', 'uncertain', 'reconciled', 'skipped'].map(value => <option value={value} key={value}>{value === 'uncertain' ? 'Outcome unknown' : words(value)}</option>)}</select></label><button className="link" onClick={() => { setSearch(''); setStatus('') }}>Clear filters</button></div>
    {!rows.length ? <Empty>No accounting documents yet. Sync a connected ledger to collect eligible Pier records.</Empty> : !visible.length ? <Empty>No accounting documents match these filters.</Empty> : <Table headings={['Source', 'Type', 'Total USD', 'Posting status', 'Payment', 'Ledger reference', 'Receipt evidence']} numeric={[2]}>
      {visible.map(job => <tr key={job.id}><td><a href={sourceLink(state, job)}>{job.reference}</a>{job.through && <small>Compared through {job.through}</small>}</td><td>{words(job.kind)}</td><td><Amount value={job.total} /></td><td><Badge>{job.status === 'uncertain' ? 'Outcome unknown' : words(job.status)}</Badge></td><td>{payment(state, job)}</td><td>{job.remoteId || 'Not confirmed'}</td><td>{qbo ? job.sourceKind === 'supplierBill' ? records(state, 'supplierBills').find(bill => bill.id === job.sourceId)?.received ? 'Matched in Pier' : 'Awaiting native receipts' : '—' : job.received && job.status === 'reconciled' ? 'Received · payable closed' : job.readyToPay ? 'Received · ready to pay' : job.received ? 'Receipt matched' : ['bill', 'receipt'].includes(job.kind) ? 'Not matched' : '—'}</td></tr>)}
    </Table>}
  </section>
}
