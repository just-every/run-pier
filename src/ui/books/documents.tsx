import { useState } from 'react'
import { Amount, Badge, Empty, Field, Table } from '../controls'
import { words } from '../display'
import { difference } from '../quantity'
import { jobs, sourceLink, type BookJob, type BooksProps } from './model'

function payment(job: BookJob) {
  if (job.kind === 'receipt') return job.received ? 'Receipt matched' : 'Receipt not matched'
  if (job.kind !== 'invoice' && job.kind !== 'bill') return '—'
  if (job.paid == null || job.total == null) return 'Payment not checked'
  const open = job.open ?? difference(job.total, job.paid)
  return <>{difference(open, '0') === '0' ? 'Paid' : 'Open'}<small>Paid <Amount value={job.paid} /> USD · Open <Amount value={open} /> USD</small></>
}

export function BookDocuments({ state }: BooksProps) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const rows = jobs(state)
  const visible = rows.filter(job => (!status || job.status === status) && `${job.reference} ${job.remoteId ?? ''} ${job.kind}`.toLowerCase().includes(search.trim().toLowerCase()))
  return <section className="panel"><h2>Accounting documents</h2>
    <p className="muted">Item snapshots and inventory valuations are sent as evidence documents because Pantry has no item catalogue. A matched receipt closes evidence review; it never marks a bill paid.</p>
    <div className="filters"><Field label="Search accounting documents" type="search" value={search} onChange={setSearch} required={false} /><label className="field"><span>Posting status</span><select aria-label="Posting status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{['pending', 'posted', 'review', 'uncertain', 'reconciled', 'skipped'].map(value => <option value={value} key={value}>{value === 'uncertain' ? 'Outcome unknown' : words(value)}</option>)}</select></label><button className="link" onClick={() => { setSearch(''); setStatus('') }}>Clear filters</button></div>
    {!rows.length ? <Empty>No accounting documents yet. Sync a connected ledger to collect eligible Pier records.</Empty> : !visible.length ? <Empty>No accounting documents match these filters.</Empty> : <Table headings={['Source', 'Type', 'Total USD', 'Posting status', 'Payment', 'Pantry reference', 'Receipt evidence']} numeric={[2]}>
      {visible.map(job => <tr key={job.id}><td><a href={sourceLink(state, job)}>{job.reference}</a></td><td>{words(job.kind)}</td><td><Amount value={job.total} /></td><td><Badge>{job.status === 'uncertain' ? 'Outcome unknown' : words(job.status)}</Badge></td><td>{payment(job)}</td><td>{job.remoteId || 'Not confirmed'}</td><td>{job.received ? 'Receipt matched' : ['bill', 'receipt'].includes(job.kind) ? 'Not matched' : '—'}</td></tr>)}
    </Table>}
  </section>
}
