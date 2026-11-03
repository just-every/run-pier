import { useState } from 'react'
import { records, type PierState, type RunCommand } from '../api'
import { Field } from '../controls'
import { LiveQuestions } from './questions'
import { BulkPlan } from './bulk-plan'
import { BulkPromises } from './bulk-promises'

export function LiveWork({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [selected, setSelected] = useState<string[]>([]), [date, setDate] = useState(''), [reason, setReason] = useState('')
  const drafts = records(state, 'purchaseOrders').filter(po => po.status === 'draft' && !po.dropshipId)
  const plans = records(state, 'proposals').filter(p => p.kind === 'bulk-review' && p.rows.every((entry: any) => entry.type === 'po.revise')).slice().reverse()
  const rows = (ids: string[]) => ids.map(id => {
    const po = drafts.find(po => po.id === id)!
    return { type: 'po.revise', payload: { ...po, poId: po.id, promiseDate: date, reason } }
  })
  return <>
    <LiveQuestions state={state} />
    {['owner', 'buyer', 'agent'].includes(state.actor.role) && <section className="panel"><h2>Review purchase changes</h2><p>Revise several draft purchase dates together. Each row needs current human approval; purchase commitment remains separate.</p>
      {drafts.map(po => <label className="field" key={po.id}><span><input type="checkbox" aria-label={`Select ${po.reference}`} checked={selected.includes(po.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, po.id] : ids.filter(id => id !== po.id))} /> {po.reference} · {po.promiseDate}</span></label>)}
      <div className="form-grid"><Field label="Proposed purchase date" type="date" value={date} onChange={setDate} /><Field label="Bulk review reason" value={reason} onChange={setReason} /></div>
      <button disabled={busy || !date || !reason.trim() || !selected.length} onClick={() => void run('itemAgent.bulkPreview', { rows: rows(selected) })}>Preview selected changes</button>
      {plans.map(plan => <section key={plan.id}><h3>Purchase plan · version {plan.version}</h3>
        <BulkPlan state={state} plan={plan} run={run} busy={busy} reason={reason} />
        {plan.rows.every((entry: any) => entry.status === 'prepared') && <button disabled={busy || !date || !reason.trim()} onClick={() => void run('itemAgent.bulkEdit', { proposalId: plan.id, version: plan.version, rows: plan.rows.map((entry: any) => ({ type: entry.type, payload: { ...entry.payload, promiseDate: date, reason } })) })}>Update plan date</button>}
      </section>)}
    </section>}
    <BulkPromises state={state} run={run} busy={busy} />
  </>
}
