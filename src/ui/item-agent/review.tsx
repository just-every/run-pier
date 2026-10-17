import { useState } from 'react'
import { records, type PierState, type RecordData, type RunCommand } from '../api'
import { Badge, Evidence, Field } from '../controls'
import { person, when, words } from '../display'

function Action({ action, proposal, state, run, busy }: { action: any; proposal: RecordData; state: PierState; run: RunCommand; busy: boolean }) {
  const [reason, setReason] = useState('')
  const canReview = ['owner', 'buyer'].includes(state.actor.role)
  const apply = (type: string) => run(type, { proposalId: proposal.id, version: proposal.version, actionId: action.id, reason })
  return <section className="item-agent-action"><h4>{action.title} <Badge>{words(action.status)}</Badge></h4>
    <details><summary>Exact proposed change and source evidence</summary>{action.before && <><h5>Before</h5><Evidence value={action.kind === 'supplier-price' ? { price: action.before.price } : { reorderPoint: action.before.reorderPoint }} /></>}<h5>After</h5><Evidence value={action.after} /><h5>Sources</h5><Evidence value={action.evidence} /></details>
    {action.kind === 'purchase-draft' && <p className="muted">Creates a draft only. A buyer must separately approve and commit the purchase.</p>}
    {action.approval && <p className="muted">Applied by {person(state, action.approval.actorId)} · {when(action.approval.at)}</p>}
    {canReview && ['prepared', 'applied'].includes(action.status) && <><Field label={`Reason for ${action.title}`} value={reason} onChange={setReason} /><div className="actions">{action.status === 'prepared' ? <><button className="primary" disabled={busy || !reason.trim()} onClick={() => void apply('itemAgent.apply')}>Apply this change</button><button disabled={busy || !reason.trim()} onClick={() => void apply('itemAgent.reject')}>Reject</button></> : <button disabled={busy || !reason.trim()} onClick={() => void apply('itemAgent.undo')}>Undo this change</button>}</div></>}
  </section>
}
export function ItemReview({ proposal, state, run, busy }: { proposal: RecordData; state: PierState; run: RunCommand; busy: boolean }) {
  const configured = records(state, 'aiSettings').some(s => s.enabled && s.configured)
  const canCheck = ['owner', 'buyer', 'operator', 'warehouse', 'agent'].includes(state.actor.role)
  return <div className="item-agent-review"><p className="muted">Checked {when(proposal.preparation.at)} by {person(state, proposal.preparation.actorId)}. Changes require a buyer or owner.</p>
    {proposal.checks.map((check: any, index: number) => <section className="item-agent-check" key={index}><h3>{check.title}</h3><p>{check.detail}</p><details><summary>Calculation and source records</summary><Evidence value={check.values} /><Evidence value={check.evidence.length ? check.evidence : 'No matching source documents.'} /></details></section>)}
    {!proposal.ai && canCheck && <div className="actions">{configured ? <button disabled={busy} onClick={() => void run('itemAgent.explain', { proposalId: proposal.id, version: proposal.version })}>Explain with AI</button> : <p className="muted">No AI key configured. These checks use saved records. <a href="#ai">Open AI setup</a> for optional explanations.</p>}</div>}
    {proposal.ai && <section className="item-agent-check"><h3>AI explanation <Badge>{words(proposal.ai.status)}</Badge></h3>{proposal.ai.status === 'completed' ? <p className="item-agent-explanation">{proposal.ai.explanation}</p> : <p role="status">{proposal.ai.problem ?? 'An explanation was requested. Pier will not automatically resend a request whose outcome is unknown. New checks allow a new paid request.'}</p>}<p className="muted">Model: {proposal.ai.model}. The explanation does not authorize a change.</p></section>}
    <h3>Proposed changes</h3>{proposal.actions.length ? proposal.actions.map((action: any) => <Action key={action.id} action={action} proposal={proposal} state={state} run={run} busy={busy} />) : <p>No exact change can be prepared from this evidence. Review missing supplier terms, policy, or shipment history above.</p>}
    <details><summary>Review activity and assumptions</summary><p>{proposal.assumptions}</p>{proposal.events.map((event: any, index: number) => <p key={index}>{words(event.outcome)} · {person(state, event.actorId)} · {when(event.at)}{event.reason ? ` · ${event.reason}` : ''}<br /><small>Command {event.commandId}</small></p>)}</details>
  </div>
}
