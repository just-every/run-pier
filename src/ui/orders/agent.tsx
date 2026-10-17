import { useState } from 'react'
import { records, type PierState, type RecordData, type Refusal, type RunCommand } from '../api'
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

// Pier refuses an approval once anything has been written since preparation,
// and an apply once anything has been written since approval (src/pier/proposals.ts).
const stale = (state: PierState, row: RecordData) => row.status === 'prepared' ? Number(state.version) !== Number(row.snapshotVersion) + 1 : row.status === 'approved' && Number(state.version) !== Number(row.approvedAtVersion) + 1
const canPrepare = (role: string) => ['owner', 'buyer', 'operator', 'warehouse', 'agent'].includes(role)

export function AgentDock({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [refusal, setRefusal] = useState<{ id: string; message: string } | null>(null)
  const proposals = records(state, 'proposals').filter(row => row.kind !== 'item-review')
  // A stale proposal prepared again with the same plan is superseded by the newer one.
  const superseded = (row: RecordData) => proposals.some(later => later !== row && later.kind === row.kind && JSON.stringify(later.plan) === JSON.stringify(row.plan) && String(later.preparation?.at) > String(row.preparation?.at))
  const waiting = proposals.filter(row => (row.status === 'prepared' || row.status === 'approved') && !superseded(row)), next = waiting.at(-1)
  const review = waiting.filter(row => row.status === 'prepared' && !stale(state, row)).length, ready = waiting.filter(row => row.status === 'approved' && !stale(state, row)).length, changed = waiting.filter(row => stale(state, row)).length
  const counts = [review && `${review} awaiting your review`, ready && `${ready} approved · ready to apply`, changed && `${changed} with changed evidence`].filter(Boolean).join(' · ') || 'nothing waiting'
  const human = state.actor.role !== 'agent', log = worklog(state)
  const local = (id: string) => ({ onRefused: (failure: Refusal) => setRefusal({ id, message: failure.message }) })
  async function act(type: string, payload: object, id: string) { setRefusal(null); await run(type, payload, local(id)) }
  const old = next && stale(state, next)
  return <section className="agent-dock" aria-label="Pier agent">
    <div className="agent-head"><Icon name="ai" /><h2>Pier agent</h2><small>{proposals.length} {proposals.length === 1 ? 'proposal' : 'proposals'} · {counts}</small><a href="#activity">View all</a></div>
    {next ? <div className={old ? 'agent-proposal stale' : 'agent-proposal'}><i className={old ? 'dot idle' : 'dot pending'} aria-hidden="true" /><p><b>{words(next.kind)}</b> · {old ? <span className="agent-stale">Evidence changed since {next.status === 'prepared' ? 'preparation' : 'approval'}</span> : <>prepared by {person(state, next.preparation?.actorId)}{next.preparation?.at ? `, ${ago(next.preparation.at)}` : ''}</>}<br />{summary(next)}</p>
      <div className="agent-actions">{old ? <button className="primary" disabled={busy || !canPrepare(state.actor.role)} onClick={() => void act('proposal.prepare', { kind: next.kind, assumptions: next.assumptions, evidence: next.evidence, plan: next.plan }, next.id)}>Prepare again</button>
        : next.status === 'prepared' ? <button className="primary" disabled={busy || !human} onClick={() => void act('proposal.approve', { proposalId: next.id, version: next.version }, next.id)}>Approve</button>
        : <button className="primary" disabled={busy || !human} onClick={() => void act('proposal.execute', { proposalId: next.id, version: next.version }, next.id)}>Apply</button>}<a className="button" href={`#activity/${next.id}`}>Review</a></div>
      {refusal?.id === next.id && <p className="agent-error" role="alert">{refusal.message}</p>}
    </div> : <p className="agent-idle">No proposal is waiting. Agents prepare replenishment, reallocation and count proposals through Pier’s API; you approve the exact version.</p>}
    {log.length > 0 && <ul className="agent-log">{log.map(entry => <li key={`${entry.at}-${entry.text}`}><Icon name="check" /><span>{entry.text}</span><time dateTime={entry.at}>{ago(entry.at)}</time></li>)}</ul>}
  </section>
}
