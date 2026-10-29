import { records, type PierState, type RunCommand } from './api'
import { when, words } from './display'
import { Badge, Empty, Table } from './controls'

export function Correspondence({ state, recordId, run, busy }: { state: PierState; recordId: string; run: RunCommand; busy: boolean }) {
  const messages = records(state, 'correspondence').filter(m => m.recordId === recordId)
  return <section className="panel correspondence"><h3>Correspondence</h3>{!messages.length ? <Empty>No approved messages for this record.</Empty> : <Table headings={['Message / recipient', 'Schedule', 'Delivery outcome']}>{messages.map(m => {
    const delivery = (state.deliveries || []).find((d: any) => d.correspondenceId === m.id)
    // A chase goes out only after the purchase order email itself was sent.
    const firstSent = m.kind !== 'supplier-chase' || (state.deliveries || []).some((d: any) => d.correspondenceId === m.purchaseMessageId && d.phase === 'sent')
    return <tr key={m.id}><td>{m.subject}<small>{m.recipient}</small>{m.executor && <small>Sent by {m.executor} under buyer authority</small>}{m.documentAttachment === 'unavailable' && <p>PDF attachment unavailable. This Managed relay sends text only; the retained purchase PDF has not been delivered.</p>}<details><summary>Read approved message</summary><p style={{ whiteSpace: 'pre-wrap' }}>{m.body}</p></details></td><td>{when(m.dueAt)}</td><td><Badge>{delivery ? words(delivery.phase) : firstSent ? 'Scheduled' : 'Waits for the first email'}</Badge>{delivery?.error && <small>{delivery.error}</small>}{delivery?.phase === 'unavailable' && <small>Nothing was sent. Open <strong>Read approved message</strong> and send it from your own email, or give Pier a mail service (<a href="https://run-pier.com/docs/hosting" target="_blank" rel="noreferrer">Hosting guide</a>, “mail provider”) and choose <strong>Process due approved emails</strong>.</small>}{delivery?.providerMessageId && <small>Provider accepted · {when(delivery.at)}</small>}</td></tr>
  })}</Table>}{messages.length > 0 && <><button disabled={busy} onClick={() => run('mail.process', {})}>Process due approved emails</button><p className="muted">Sent means the install’s mail provider accepted the message. Uncertain submissions require reconciliation before another send.</p></>}</section>
}
