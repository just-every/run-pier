import { type PierState, type RecordData, type RunCommand } from '../api'
import { Evidence } from '../controls'

export function BulkPlan({ state, plan, run, busy, reason }: { state: PierState; plan: RecordData; run: RunCommand; busy: boolean; reason: string }) {
  return <>{plan.rows.map((entry: any) => <div key={entry.id}>
    <h4>{entry.before.reference} · {entry.status}</h4>
    {entry.type === 'po.revise' ? <p>{entry.before.promiseDate} → {entry.after.promiseDate}</p> : <><p>Recipient: {entry.payload.recipient}</p>{entry.impact.promise.lines.map((line: any) => <p key={line.orderLineId}>{state.items.find((item: any) => item.id === line.itemId)?.name} · {line.quantity} · {line.previousDate ?? 'Not set'} → {line.promiseDate}{line.estimated ? ' · Estimate' : ' · Confirmed supply'}</p>)}</>}
    <details><summary>Exact rows and impact</summary><Evidence value={{ before: entry.before, after: entry.after, impact: entry.impact }} /></details>
    {entry.status === 'prepared' && (entry.type === 'po.revise' ? ['owner', 'buyer'] : ['owner', 'buyer', 'operator']).includes(state.actor.role) && <button disabled={busy || !reason.trim()} onClick={() => void run('itemAgent.bulkApply', { proposalId: plan.id, version: plan.version, rowId: entry.id, reason })}>Approve {entry.before.reference}</button>}
    {entry.commandId && <p>Applied command {entry.commandId} · <a href={`#activity/${entry.targetId}`}>Activity</a></p>}
  </div>)}</>
}
