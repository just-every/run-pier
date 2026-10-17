import { records, type PierState, type RecordData, type RunCommand } from '../api'
import { person, reference, words } from '../display'
import { Icon } from '../icons'
import { ago } from './model'

// The agent's place on the workbench: proposals an agent (or a person) prepared
// through Pier's API, the one awaiting review with its exact-version approval,
// and a short worklog. Agents never approve themselves or post stock.

const summary = (proposal: RecordData) => { const text = typeof proposal.assumptions === 'string' ? proposal.assumptions : JSON.stringify(proposal.assumptions ?? ''); return text.length > 220 ? `${text.slice(0, 217)}…` : text }

type Entry = { at: string; text: string }
function worklog(state: PierState): Entry[] {
  const orders = records(state, 'orders'), pos = records(state, 'purchaseOrders')
  const entries: Entry[] = [
    ...records(state, 'proposals').filter(row => row.kind !== 'item-review' && row.approval).map(row => ({ at: row.approval.at, text: `${words(row.kind)} ${row.status === 'executed' ? 'applied' : 'approved'} by ${person(state, row.approval.actorId)}` })),
    ...records(state, 'receipts').map(row => ({ at: row.createdAt, text: `Receipt ${row.supplierReference} posted to ${reference(pos.find(po => po.id === row.poId))}` })),
    ...records(state, 'shipments').map(row => ({ at: row.createdAt, text: `Shipment ${row.shipmentReference || row.reference} dispatched for ${reference(orders.find(order => order.id === row.orderId))}` })),
  ]
  return entries.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 2)
}

export function AgentDock({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const proposals = records(state, 'proposals').filter(row => row.kind !== 'item-review')
  const waiting = proposals.filter(row => row.status === 'prepared' || row.status === 'approved'), next = waiting.at(-1)
  const human = state.actor.role !== 'agent', log = worklog(state)
  return <section className="agent-dock" aria-label="Pier agent">
    <div className="agent-head"><Icon name="ai" /><h2>Pier agent</h2><small>{proposals.length} {proposals.length === 1 ? 'proposal' : 'proposals'} · {waiting.length} awaiting your review</small><a href="#activity">View all</a></div>
    {next ? <div className="agent-proposal"><i className="dot pending" aria-hidden="true" /><p><b>{words(next.kind)}</b> · prepared by {person(state, next.preparation?.actorId)}{next.preparation?.at ? `, ${ago(next.preparation.at)}` : ''}<br />{summary(next)}</p>
      <div className="agent-actions">{next.status === 'prepared' ? <button className="primary" disabled={busy || !human} onClick={() => run('proposal.approve', { proposalId: next.id, version: next.version })}>Approve</button> : <button className="primary" disabled={busy || !human} onClick={() => run('proposal.execute', { proposalId: next.id, version: next.version })}>Apply</button>}<a className="button" href="#activity">Review</a></div>
    </div> : <p className="agent-idle">No proposal is waiting. Agents prepare replenishment, reallocation and count proposals through Pier’s API; you approve the exact version.</p>}
    {log.length > 0 && <ul className="agent-log">{log.map(entry => <li key={`${entry.at}-${entry.text}`}><Icon name="check" /><span>{entry.text}</span><time dateTime={entry.at}>{ago(entry.at)}</time></li>)}</ul>}
  </section>
}
