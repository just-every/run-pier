import { Amount, Facts } from '../controls'
import { type PierState, records } from '../api'

export function SourceBooks({ state, sourceId, sourceKind }: { state: PierState; sourceId: string; sourceKind: 'order' | 'receipt' }) {
  const rows = records(state, 'bookJobs').filter(j => j.sourceId === sourceId && j.sourceKind === sourceKind)
  if (!rows.length) return null
  return <div className="record"><h3>Books</h3>{rows.map(job => <Facts key={job.id} values={[
    {label: job.kind === 'bill' ? 'Supplier bill' : job.kind === 'journal' ? 'Cost of goods' : 'Sales invoice', value: job.reference},
    {label: 'Posting', value: job.status === 'reconciled' ? 'Reconciled' : job.status === 'posted' ? 'Posted' : job.status === 'pending' ? 'Pending' : job.status === 'uncertain' ? 'Checking outcome' : job.status === 'skipped' ? 'Skipped' : 'Needs review'},
    ...(job.kind === 'journal' ? [] : [{label: job.kind === 'bill' ? 'Paid in Pantry' : 'Received in Pantry', value: <Amount value={job.paid} unknown="Not checked" />}, {label: 'Open USD', value: <Amount value={job.open} unknown="Not checked" />}]),
    ...(job.kind === 'bill' ? [{label:'Receipt evidence',value:job.received?'Matched in Pantry':'Awaiting confirmation'}] : []),
  ]} />)}<a href="#books">Open books and review queue</a></div>
}
