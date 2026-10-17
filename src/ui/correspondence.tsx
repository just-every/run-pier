import { records, type PierState, type RunCommand } from './api'
import { when, words } from './display'
import { Badge, Empty, Table } from './controls'

export function Correspondence({ state, recordId, run, busy }: { state: PierState; recordId: string; run: RunCommand; busy: boolean }) {
  const messages = records(state, 'correspondence').filter(m => m.recordId === recordId)
  return <section className="panel"><h3>Correspondence</h3>{!messages.length ? <Empty>No approved messages for this record.</Empty> : <Table headings={['Message / recipient', 'Schedule', 'Delivery outcome']}>{messages.map(m => {
    const delivery = (state.deliveries || []).find((d: any) => d.correspondenceId === m.id)
    return <tr key={m.id}><td>{m.subject}<small>{m.recipient}</small><details><summary>Read approved message</summary><p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p></details></td><td>{when(m.dueAt)}</td><td><Badge>{delivery ? words(delivery.phase) : 'Scheduled'}</Badge>{delivery?.error && <small>{delivery.error}</small>}{delivery?.providerMessageId && <small>Provider accepted · {when(delivery.at)}</small>}</td></tr>
  })}</Table>}{messages.length > 0 && <><button disabled={busy} onClick={() => run('mail.process', {})}>Process due approved emails</button><p className="muted">Sent means the install’s mail provider accepted the message. Uncertain submissions require reconciliation before another send.</p></>}</section>
}
