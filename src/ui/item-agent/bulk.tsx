import { useState } from 'react'
import { records, type PierState, type RunCommand } from '../api'
import { Evidence, Field, Select } from '../controls'

export function LiveWork({ state, run, busy }: { state: PierState; run: RunCommand; busy: boolean }) {
  const [itemId, setItemId] = useState(''), [kind, setKind] = useState('stock'), [answer, setAnswer] = useState<unknown>(null), [questionBusy, setQuestionBusy] = useState(false), [problem, setProblem] = useState('')
  const [selected, setSelected] = useState<string[]>([]), [date, setDate] = useState(''), [reason, setReason] = useState('')
  const drafts = records(state, 'purchaseOrders').filter(po => po.status === 'draft' && !po.dropshipId)
  const plans = records(state, 'proposals').filter(p => p.kind === 'bulk-review').slice().reverse()
  const rows = (ids: string[]) => ids.map(id => {
    const po = drafts.find(po => po.id === id)!
    return { type: 'po.revise', payload: { ...po, poId: po.id, promiseDate: date, reason } }
  })
  async function ask() {
    setQuestionBusy(true); setProblem(''); setAnswer(null)
    try {
      const response = await fetch('/api/pier/questions?' + new URLSearchParams({ kind, itemId }), { cache: 'no-store' })
      const body: any = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? 'Question could not be answered.')
      setAnswer(body)
    } catch (cause) { setProblem((cause as Error).message) } finally { setQuestionBusy(false) }
  }
  return <>
    <section className="panel"><h2>Live operational questions</h2><div className="form-grid">
      <label className="field"><span>Question</span><select aria-label="Question" value={kind} onChange={e => setKind(e.target.value)}><option value="stock">What stock is available?</option><option value="late">Which purchases are late?</option></select></label>
      {kind === 'stock' && <Select label="Question item" rows={records(state, 'items')} value={itemId} onChange={setItemId} />}
    </div><button disabled={questionBusy || (kind === 'stock' && !itemId)} onClick={() => void ask()}>Ask current records</button>
      {problem && <p role="alert">{problem}</p>}{answer !== null && <div role="status"><Evidence value={answer} /></div>}
    </section>
    {['owner', 'buyer', 'agent'].includes(state.actor.role) && <section className="panel"><h2>Review purchase changes</h2><p>Revise several draft purchase dates together. Each row needs current human approval; purchase commitment remains separate.</p>
      {drafts.map(po => <label className="field" key={po.id}><span><input type="checkbox" aria-label={`Select ${po.reference}`} checked={selected.includes(po.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, po.id] : ids.filter(id => id !== po.id))} /> {po.reference} · {po.promiseDate}</span></label>)}
      <div className="form-grid"><Field label="Proposed purchase date" type="date" value={date} onChange={setDate} /><Field label="Bulk review reason" value={reason} onChange={setReason} /></div>
      <button disabled={busy || !date || !reason.trim() || !selected.length} onClick={() => void run('itemAgent.bulkPreview', { rows: rows(selected) })}>Preview selected changes</button>
      {plans.map(plan => <section key={plan.id}><h3>Purchase plan · version {plan.version}</h3>
        {plan.rows.map((entry: any) => <div key={entry.id}><h4>{entry.before.reference} · {entry.status}</h4><p>{entry.before.promiseDate} → {entry.after.promiseDate}</p><details><summary>Exact rows and impact</summary><Evidence value={{ before: entry.before, after: entry.after, impact: entry.impact }} /></details>
          {entry.status === 'prepared' && ['owner', 'buyer'].includes(state.actor.role) && <button disabled={busy || !reason.trim()} onClick={() => void run('itemAgent.bulkApply', { proposalId: plan.id, version: plan.version, rowId: entry.id, reason })}>Approve {entry.before.reference}</button>}
          {entry.commandId && <p>Applied command {entry.commandId} · <a href={`#activity/${entry.targetId}`}>Activity</a></p>}
        </div>)}
        {plan.rows.every((entry: any) => entry.status === 'prepared') && <button disabled={busy || !date || !reason.trim()} onClick={() => void run('itemAgent.bulkEdit', { proposalId: plan.id, version: plan.version, rows: plan.rows.map((entry: any) => ({ type: entry.type, payload: { ...entry.payload, promiseDate: date, reason } })) })}>Update plan date</button>}
      </section>)}
    </section>}
  </>
}
