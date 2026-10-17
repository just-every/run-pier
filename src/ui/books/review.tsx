import { useState } from 'react'
import { Badge, Empty, Field, Form, Table, text } from '../controls'
import { words } from '../display'
import { canSkip, jobs, needsReview, sourceLink, type BookJob, type BooksProps } from './model'

export function BookReview({ state, run, busy }: BooksProps) {
  const queue = jobs(state).filter(needsReview)
  const [resolvingId, setResolvingId] = useState('')
  const resolving = queue.find(job => job.id === resolvingId && canSkip(job))
  const owner = state.actor.role === 'owner'
  async function skip(job: BookJob, data: FormData) {
    if (await run('book.resolve', { jobId: job.id, version: job.version, action: 'skip', reason: text(data, 'reason') })) setResolvingId('')
  }
  return <section className="panel"><h2>Review queue</h2>
    {!queue.length ? <Empty>No accounting documents need review.</Empty> : <Table headings={['Document', 'Status', 'What needs attention', 'Next step', 'Actions']}>
      {queue.map(job => <tr key={job.id}>
        <td><a href={sourceLink(state, job)}>{job.reference}</a><small>{words(job.kind)}</small></td>
        <td><Badge>{job.status === 'uncertain' ? 'Outcome unknown' : 'In review'}</Badge></td>
        <td>{job.reason || (job.status === 'uncertain' ? 'Pantry has not confirmed whether this document posted.' : 'This document is blocked. Review its source before retrying.')}</td>
        <td>{job.fix || (job.status === 'uncertain' ? 'Choose Check Pantry. Pier looks for the posting first and, if Pantry has none, re-sends the same request, which Pantry never records twice.' : 'Correct the source or account mapping, then retry.')}</td>
        <td>{owner ? <div className="actions"><button disabled={busy} onClick={() => void run('book.retry', { jobId: job.id, version: job.version })}>{job.status === 'uncertain' ? 'Check Pantry' : 'Retry'}</button>{canSkip(job) && <button disabled={busy} onClick={() => setResolvingId(job.id)}>Skip…</button>}</div> : 'Owner action required'}</td>
      </tr>)}
    </Table>}
    {owner && resolving && <Form key={`${resolving.id}-${resolving.version}`} title={`Skip ${resolving.reference}`} submit="Skip blocked document" secondary busy={busy} note="This document has no remote posting. Record why it should be skipped; the source and review history are retained." onSubmit={data => skip(resolving, data)}>
      <Field label="Reason for skipping" name="reason" disabled={busy} maxLength={2000} />
      <button type="button" disabled={busy} onClick={() => setResolvingId('')}>Cancel</button>
    </Form>}
  </section>
}
